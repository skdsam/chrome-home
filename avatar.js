/* global THREE, chrome */

(function () {
    'use strict';

    const DEFAULT_SETTINGS = {
        enabled: true,
        activity: 'normal',
        scale: 100,
        speech: true,
        weather: true,
        mishaps: true,
        quality: 'auto',
        debug: 'final'
    };

    const FALLBACK_DIALOGUE = {
        idle: ['Systems calm. Curiosity active.'],
        search: ['Where are we going next?'],
        weather: ['Good weather for an umbrella test.'],
        clock: ['Time flies. I have the backpack to prove it.'],
        ai: ['The big brains are over here.'],
        widget: ['A fine widget. Very sit-able.'],
        shortcut: ['Express route located.'],
        rocket: ['Tiny thrusters, full commitment.'],
        fall: ['That landing was mostly intentional.'],
        rebuild: ['All parts accounted for.'],
        focus: ['Quiet engines. You have this.']
    };

    const ACTIVITY_DELAYS = {
        quiet: [45000, 90000],
        normal: [22000, 48000],
        lively: [11000, 26000]
    };

    const ACTION_DURATION = {
        search: 6800,
        weather: 6200,
        clock: 5200,
        ai: 5400,
        widget: 6600,
        shortcut: 5000,
        break: 5200
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);
    const easeInOutCubic = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function seededRandom(seed) {
        let value = seed >>> 0;
        return function () {
            value += 0x6D2B79F5;
            let t = value;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function daySeed() {
        const now = new Date();
        return Number(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`);
    }

    function storageGet(keys) {
        return new Promise(resolve => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(keys, data => resolve(data || {}));
                return;
            }
            const result = {};
            keys.forEach(key => {
                try { result[key] = JSON.parse(localStorage.getItem(key)); } catch (_) { result[key] = null; }
            });
            resolve(result);
        });
    }

    function storageSet(values) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set(values);
            return;
        }
        Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    }

    class PageCompanion {
        constructor() {
            this.stage = document.getElementById('avatar-stage');
            this.canvas = document.getElementById('avatar-canvas');
            this.bubble = document.getElementById('avatar-speech');
            this.anchorDebug = document.getElementById('avatar-anchor-debug');
            this.diagnostics = document.getElementById('avatar-diagnostics');
            this.settings = { ...DEFAULT_SETTINGS };
            this.memory = { actionCounts: {}, recentLines: [], discovered: [], visits: 0 };
            this.dialogue = FALLBACK_DIALOGUE;
            this.random = seededRandom(daySeed());
            this.viewport = { width: window.innerWidth, height: window.innerHeight };
            this.screenPosition = { x: Math.max(80, window.innerWidth - 118), y: window.innerHeight - 22 };
            this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            this.phase = 'idle';
            this.action = 'idle';
            this.actionStarted = performance.now();
            this.phaseStarted = this.actionStarted;
            this.nextActionAt = this.actionStarted + 9000;
            this.testQueue = [];
            this.flight = null;
            this.speechUntil = 0;
            this.lastFrame = performance.now();
            this.lastRender = 0;
            this.clockEffectShown = false;
            this.breakState = null;
            this.running = true;
            this.reducedMotion = false;
            this.materials = [];
            this.pieces = [];
            this.resizeTimer = 0;
            this.memorySaveTimer = 0;
        }

        async init() {
            if (!this.stage || !this.canvas || typeof THREE === 'undefined') return;

            const stored = await storageGet(['avatarSettings', 'avatarMemory', 'advancedSettings']);
            this.settings = { ...DEFAULT_SETTINGS, ...(stored.avatarSettings || {}) };
            this.memory = { ...this.memory, ...(stored.avatarMemory || {}) };
            this.reducedMotion = Boolean(stored.advancedSettings && stored.advancedSettings.reduceMotion) ||
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            try {
                const response = await fetch('avatar-dialogue.json');
                if (response.ok) this.dialogue = await response.json();
            } catch (_) {
                this.dialogue = FALLBACK_DIALOGUE;
            }

            try {
                this.setupScene();
            } catch (error) {
                console.warn('3D companion could not start:', error);
                this.stage.classList.add('hidden');
                return;
            }

            this.bindSettings();
            this.bindPageReactions();
            this.applySettings();
            this.memory.visits = (this.memory.visits || 0) + 1;
            this.rememberSoon();
            this.resize();
            this.updateAnchorsDebug();
            requestAnimationFrame(time => this.animate(time));

            if (!this.reducedMotion) {
                setTimeout(() => {
                    if (this.settings.enabled && this.phase === 'idle') this.speak(this.timeGreetingCategory());
                }, 1800);
            }
        }

        setupScene() {
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance',
                premultipliedAlpha: true
            });
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            if (THREE.ACESFilmicToneMapping !== undefined) {
                this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
                this.renderer.toneMappingExposure = 1.18;
            }

            this.scene = new THREE.Scene();
            this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
            this.camera.position.z = 500;

            const hemi = new THREE.HemisphereLight(0xdaf8ff, 0x261b42, 1.7);
            this.scene.add(hemi);
            const key = new THREE.DirectionalLight(0xffffff, 2.2);
            key.position.set(-80, 130, 180);
            this.scene.add(key);
            const cyanRim = new THREE.PointLight(0x45e7ff, 1.6, 270);
            cyanRim.position.set(85, 45, 90);
            this.scene.add(cyanRim);
            const violetRim = new THREE.PointLight(0x9d68ff, 1.1, 220);
            violetRim.position.set(-80, 20, 60);
            this.scene.add(violetRim);

            this.character = this.createCharacter();
            this.scene.add(this.character);
            this.canvas.addEventListener('webglcontextlost', event => {
                event.preventDefault();
                this.running = false;
                this.stage.classList.add('hidden');
            });
        }

        material(options) {
            const material = new THREE.MeshStandardMaterial(options);
            this.materials.push(material);
            return material;
        }

        mesh(geometry, material, parent, name) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = name || '';
            parent.add(mesh);
            return mesh;
        }

        createCharacter() {
            const root = new THREE.Group();
            root.name = 'PipRoot';

            const ceramic = this.material({ color: 0xe9e8df, roughness: .24, metalness: .08 });
            const ceramicDark = this.material({ color: 0xb6bac1, roughness: .3, metalness: .14 });
            const graphite = this.material({ color: 0x202936, roughness: .32, metalness: .5 });
            const graphiteSoft = this.material({ color: 0x394655, roughness: .42, metalness: .32 });
            const cyan = this.material({ color: 0x6df4ff, emissive: 0x27bad2, emissiveIntensity: 1.8, roughness: .15, metalness: .08 });
            const violet = this.material({ color: 0xb68cff, emissive: 0x7241d4, emissiveIntensity: 1.25, roughness: .2, metalness: .2 });
            const visor = this.material({ color: 0x101b2a, emissive: 0x07111d, emissiveIntensity: .4, roughness: .12, metalness: .65 });
            const flameBlue = new THREE.MeshBasicMaterial({ color: 0x6ef7ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
            const flameViolet = new THREE.MeshBasicMaterial({ color: 0xb479ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
            this.materials.push(flameBlue, flameViolet);

            const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x07101d, transparent: true, opacity: .28, depthWrite: false });
            this.materials.push(shadowMaterial);
            this.shadow = this.mesh(new THREE.CircleGeometry(18, 32), shadowMaterial, root, 'ContactShadow');
            this.shadow.scale.set(1.25, .22, 1);
            this.shadow.position.set(0, 1, -30);

            this.torso = new THREE.Group();
            this.torso.name = 'TorsoModule';
            this.torso.position.y = 28;
            root.add(this.torso);
            const body = this.mesh(new THREE.SphereGeometry(13.5, 30, 22), ceramic, this.torso, 'CeramicTorso');
            body.scale.set(1, 1.16, .78);
            const belly = this.mesh(new THREE.SphereGeometry(7, 24, 16), graphiteSoft, this.torso, 'BellyPanel');
            belly.scale.set(1, .76, .3);
            belly.position.set(0, -1, 11);
            const heart = this.mesh(new THREE.SphereGeometry(1.7, 16, 10), violet, this.torso, 'StatusLight');
            heart.position.set(0, 3, 14.6);

            this.head = new THREE.Group();
            this.head.name = 'HeadModule';
            this.head.position.y = 53;
            root.add(this.head);
            const headShell = this.mesh(new THREE.SphereGeometry(18.2, 36, 26), ceramic, this.head, 'HeadShell');
            headShell.scale.set(1, .78, .72);
            const face = this.mesh(new THREE.SphereGeometry(14.9, 32, 22), visor, this.head, 'FaceVisor');
            face.scale.set(1, .62, .3);
            face.position.set(0, -1, 12.1);
            const crown = this.mesh(new THREE.TorusGeometry(12.8, 1.15, 10, 32, Math.PI), ceramicDark, this.head, 'CrownSeam');
            crown.rotation.z = Math.PI;
            crown.position.set(0, 1.6, 13.3);

            this.leftEye = this.createEye(-6, cyan, this.head);
            this.rightEye = this.createEye(6, cyan, this.head);
            this.antenna = new THREE.Group();
            this.antenna.position.set(7, 12, 0);
            this.head.add(this.antenna);
            const antennaStem = this.mesh(new THREE.CylinderGeometry(.65, .85, 7, 10), graphite, this.antenna, 'AntennaStem');
            antennaStem.position.y = 3.3;
            antennaStem.rotation.z = -.22;
            const antennaTip = this.mesh(new THREE.SphereGeometry(2, 16, 12), violet, this.antenna, 'AntennaTip');
            antennaTip.position.set(1.4, 7, 0);

            this.leftArm = this.createLimb(-14, 37, ceramicDark, graphite, root, 'LeftArm');
            this.rightArm = this.createLimb(14, 37, ceramicDark, graphite, root, 'RightArm');
            this.leftLeg = this.createLimb(-6.5, 18, ceramicDark, graphite, root, 'LeftLeg', true);
            this.rightLeg = this.createLimb(6.5, 18, ceramicDark, graphite, root, 'RightLeg', true);

            this.backpack = new THREE.Group();
            this.backpack.name = 'RocketBackpackModule';
            this.backpack.position.set(0, 29, -8);
            root.add(this.backpack);
            const pack = this.mesh(new THREE.SphereGeometry(10.5, 24, 18), graphite, this.backpack, 'RocketPack');
            pack.scale.set(1.08, 1.18, .65);
            const packLight = this.mesh(new THREE.SphereGeometry(2.1, 16, 12), violet, this.backpack, 'PackLight');
            packLight.position.set(0, 2, 8);
            this.flames = [];
            [-12, 12].forEach(x => {
                const thruster = this.mesh(new THREE.CylinderGeometry(3.3, 4.1, 11, 18), graphiteSoft, this.backpack, 'Thruster');
                thruster.position.set(x, -7, 0);
                const nozzle = this.mesh(new THREE.CylinderGeometry(2.8, 1.9, 4, 16), ceramicDark, this.backpack, 'Nozzle');
                nozzle.position.set(x, -13.2, 0);
                const outerFlame = this.mesh(new THREE.ConeGeometry(3.2, 18, 16), flameViolet, this.backpack, 'OuterFlame');
                outerFlame.position.set(x, -23.5, 0);
                outerFlame.rotation.z = Math.PI;
                const innerFlame = this.mesh(new THREE.ConeGeometry(1.7, 13, 14), flameBlue, this.backpack, 'InnerFlame');
                innerFlame.position.set(x, -20.8, 1);
                innerFlame.rotation.z = Math.PI;
                this.flames.push(outerFlame, innerFlame);
            });
            this.setRocketVisible(false);

            this.umbrella = new THREE.Group();
            this.umbrella.name = 'UmbrellaProp';
            this.umbrella.position.set(17, 35, 4);
            root.add(this.umbrella);
            const shaft = this.mesh(new THREE.CylinderGeometry(.65, .65, 43, 10), graphite, this.umbrella, 'UmbrellaShaft');
            shaft.position.y = 20;
            const canopy = this.mesh(new THREE.SphereGeometry(21, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), violet, this.umbrella, 'UmbrellaCanopy');
            canopy.scale.y = .42;
            canopy.position.y = 42;
            const hook = this.mesh(new THREE.TorusGeometry(4.2, .7, 8, 18, Math.PI), graphite, this.umbrella, 'UmbrellaHook');
            hook.rotation.z = Math.PI;
            hook.position.set(3.8, -1, 0);
            this.umbrella.visible = false;

            this.pieces = [this.head, this.torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.backpack].map((object, index) => ({
                object,
                index,
                basePosition: object.position.clone(),
                baseQuaternion: object.quaternion.clone(),
                offset: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                angularVelocity: new THREE.Vector3()
            }));

            return root;
        }

        createEye(x, material, parent) {
            const eye = new THREE.Group();
            eye.position.set(x, -1, 16.2);
            parent.add(eye);
            const glow = this.mesh(new THREE.SphereGeometry(3.45, 22, 16), material, eye, 'EyeGlow');
            glow.scale.set(1, .9, .3);
            const pupilMaterial = this.material({ color: 0x07101a, roughness: .16, metalness: .15 });
            const pupil = this.mesh(new THREE.SphereGeometry(1.35, 16, 12), pupilMaterial, eye, 'Pupil');
            pupil.position.z = 1.15;
            eye.userData.pupil = pupil;
            return eye;
        }

        createLimb(x, y, shellMaterial, jointMaterial, parent, name, leg) {
            const pivot = new THREE.Group();
            pivot.name = `${name}Module`;
            pivot.position.set(x, y, 0);
            parent.add(pivot);
            const joint = this.mesh(new THREE.SphereGeometry(3.25, 18, 14), jointMaterial, pivot, `${name}Joint`);
            const length = leg ? 13 : 15;
            const segment = this.mesh(new THREE.CylinderGeometry(3, 2.45, length, 16), shellMaterial, pivot, `${name}Segment`);
            segment.position.y = -length / 2;
            const end = this.mesh(new THREE.SphereGeometry(3.55, 20, 14), jointMaterial, pivot, `${name}End`);
            end.scale.set(leg ? 1.25 : 1, leg ? .65 : 1, .82);
            end.position.set(leg ? (x < 0 ? -1 : 1) : 0, -length - 1, leg ? 1.8 : 0);
            return pivot;
        }

        bindSettings() {
            const map = {
                'avatar-enabled': ['enabled', 'checked'],
                'avatar-activity': ['activity', 'value'],
                'avatar-scale': ['scale', 'number'],
                'avatar-speech-enabled': ['speech', 'checked'],
                'avatar-weather-enabled': ['weather', 'checked'],
                'avatar-break-enabled': ['mishaps', 'checked'],
                'avatar-quality': ['quality', 'value'],
                'avatar-debug-mode': ['debug', 'value']
            };

            Object.entries(map).forEach(([id, descriptor]) => {
                const element = document.getElementById(id);
                if (!element) return;
                const [key, type] = descriptor;
                if (type === 'checked') element.checked = Boolean(this.settings[key]);
                else element.value = String(this.settings[key]);
                element.addEventListener(type === 'checked' ? 'change' : 'input', () => {
                    this.settings[key] = type === 'checked' ? element.checked : type === 'number' ? Number(element.value) : element.value;
                    storageSet({ avatarSettings: this.settings });
                    this.applySettings();
                });
            });

            const scaleOutput = document.getElementById('avatar-scale-output');
            if (scaleOutput) scaleOutput.textContent = `${this.settings.scale}%`;

            document.getElementById('avatar-test-sequence')?.addEventListener('click', () => this.runTestSequence());
            document.getElementById('avatar-reset-memory')?.addEventListener('click', () => {
                this.memory = { actionCounts: {}, recentLines: [], discovered: [], visits: 1 };
                storageSet({ avatarMemory: this.memory });
                this.speak('rebuild', 'Memory polished. Ready to make new discoveries.');
            });

            const motionToggle = document.getElementById('reduce-motion');
            motionToggle?.addEventListener('change', () => {
                this.reducedMotion = motionToggle.checked || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (this.reducedMotion) this.goHomeImmediately();
            });
        }

        bindPageReactions() {
            window.addEventListener('resize', () => {
                clearTimeout(this.resizeTimer);
                this.resizeTimer = setTimeout(() => this.resize(), 80);
            });
            document.addEventListener('mousemove', event => {
                this.cursor.x = event.clientX;
                this.cursor.y = event.clientY;
            }, { passive: true });
            document.addEventListener('visibilitychange', () => {
                this.lastFrame = performance.now();
            });

            document.getElementById('search-input')?.addEventListener('focus', () => this.queueReaction('search'));
            document.getElementById('weather-display')?.addEventListener('mouseenter', () => this.queueReaction('weather'));
            document.getElementById('rain-test-btn')?.addEventListener('click', () => this.queueReaction('weather', true));
            document.getElementById('focus-mode-btn')?.addEventListener('click', () => {
                if (!this.settings.enabled) return;
                this.speak('focus');
                this.nextActionAt = performance.now() + 90000;
            });
        }

        applySettings() {
            if (!this.settings.enabled) {
                this.stage.classList.add('hidden');
                this.bubble.classList.add('hidden');
                this.diagnostics.classList.add('hidden');
                return;
            }
            this.stage.classList.remove('hidden');
            const scaleOutput = document.getElementById('avatar-scale-output');
            if (scaleOutput) scaleOutput.textContent = `${this.settings.scale}%`;
            this.character.scale.setScalar(this.settings.scale / 100);
            this.applyQuality();
            this.applyDebugMode();
        }

        applyQuality() {
            if (!this.renderer) return;
            const lowDevice = (navigator.deviceMemory && navigator.deviceMemory <= 4) || navigator.hardwareConcurrency <= 4;
            const mode = this.settings.quality === 'auto' ? (lowDevice ? 'low' : 'high') : this.settings.quality;
            this.qualityMode = mode;
            const cap = mode === 'high' ? 1.65 : 1;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
            this.renderer.setSize(this.viewport.width, this.viewport.height, false);
        }

        applyDebugMode() {
            const debug = this.settings.debug;
            this.materials.forEach(material => {
                if ('wireframe' in material) material.wireframe = debug === 'wireframe';
            });
            this.anchorDebug.classList.toggle('hidden', debug !== 'anchors');
            this.diagnostics.classList.toggle('hidden', debug === 'final');
            this.updateAnchorsDebug();
        }

        resize() {
            this.viewport.width = window.innerWidth;
            this.viewport.height = window.innerHeight;
            this.camera.left = -this.viewport.width / 2;
            this.camera.right = this.viewport.width / 2;
            this.camera.top = this.viewport.height / 2;
            this.camera.bottom = -this.viewport.height / 2;
            this.camera.updateProjectionMatrix();
            this.applyQuality();
            this.screenPosition.x = clamp(this.screenPosition.x, 42, this.viewport.width - 42);
            this.screenPosition.y = clamp(this.screenPosition.y, 78, this.viewport.height - 10);
            this.updateAnchorsDebug();
        }

        screenToWorld(point) {
            return {
                x: point.x - this.viewport.width / 2,
                y: this.viewport.height / 2 - point.y
            };
        }

        elementAnchor(selector, xFactor, yOffset) {
            const element = document.querySelector(selector);
            if (!element || element.classList.contains('hidden')) return null;
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > this.viewport.height) return null;
            return {
                element,
                point: {
                    x: clamp(rect.left + rect.width * xFactor, 44, this.viewport.width - 44),
                    y: clamp(rect.top + yOffset, 76, this.viewport.height - 10)
                }
            };
        }

        getAnchors() {
            const anchors = {
                home: { point: { x: Math.max(82, this.viewport.width - 118), y: this.viewport.height - 16 }, element: null },
                search: this.elementAnchor('.search-bar', .72, 3),
                weather: this.elementAnchor('#weather-display', .52, 3),
                clock: this.elementAnchor('#dashboard-clock', .66, 5),
                ai: this.elementAnchor('#ai-sidebar .ai-sidebar-handle', .5, 4)
            };

            const visibleWidgets = Array.from(document.querySelectorAll('.spotify-widget:not(.hidden)'))
                .filter(element => {
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
            if (visibleWidgets.length) {
                const widget = visibleWidgets[Math.floor(this.random() * visibleWidgets.length)];
                const rect = widget.getBoundingClientRect();
                anchors.widget = {
                    element: widget,
                    point: { x: clamp(rect.left + rect.width * .7, 44, this.viewport.width - 44), y: clamp(rect.top + 4, 76, this.viewport.height - 10) }
                };
            } else anchors.widget = null;

            const shortcuts = Array.from(document.querySelectorAll('.shortcut-card')).filter(element => element.getBoundingClientRect().width > 0);
            if (shortcuts.length) {
                const shortcut = shortcuts[Math.floor(this.random() * shortcuts.length)];
                const rect = shortcut.getBoundingClientRect();
                anchors.shortcut = {
                    element: shortcut,
                    point: { x: clamp(rect.left + rect.width * .5, 44, this.viewport.width - 44), y: clamp(rect.top + 6, 76, this.viewport.height - 10) }
                };
            } else anchors.shortcut = null;
            return anchors;
        }

        updateAnchorsDebug() {
            if (!this.anchorDebug || this.settings.debug !== 'anchors') return;
            this.anchorDebug.textContent = '';
            const anchors = this.getAnchors();
            Object.entries(anchors).forEach(([name, anchor]) => {
                if (!anchor) return;
                const marker = document.createElement('div');
                marker.className = 'avatar-anchor-marker';
                marker.style.left = `${anchor.point.x}px`;
                marker.style.top = `${anchor.point.y}px`;
                const label = document.createElement('span');
                label.textContent = name;
                marker.appendChild(label);
                this.anchorDebug.appendChild(marker);
            });
        }

        isRaining() {
            const background = document.getElementById('bg-container');
            return Boolean(background && /weather-(rain|storm)/.test(background.className));
        }

        eligibleActions() {
            const anchors = this.getAnchors();
            const actions = ['search', 'clock'];
            if (anchors.ai) actions.push('ai');
            if (anchors.widget) actions.push('widget');
            if (anchors.shortcut) actions.push('shortcut');
            if (this.settings.weather && this.isRaining()) actions.push('weather', 'weather');
            if (this.settings.mishaps && (this.memory.actionCounts.break || 0) < Math.max(1, (this.memory.visits || 1) / 3) && this.random() < .09) actions.push('break');
            return actions;
        }

        queueReaction(action, force) {
            if (!this.settings.enabled || this.reducedMotion) return;
            if (this.phase === 'idle') this.beginAction(action, force);
            else if (!this.testQueue.includes(action)) this.testQueue.unshift(action);
        }

        runTestSequence() {
            if (!this.settings.enabled) {
                this.settings.enabled = true;
                const checkbox = document.getElementById('avatar-enabled');
                if (checkbox) checkbox.checked = true;
                storageSet({ avatarSettings: this.settings });
                this.applySettings();
            }
            const settingsModal = document.getElementById('settings-modal-overlay');
            if (settingsModal) settingsModal.classList.add('hidden');
            this.testQueue = ['weather', 'clock', 'ai', 'widget', 'shortcut', 'break'];
            if (this.phase === 'idle') requestAnimationFrame(() => this.beginAction('search', true));
            this.speak('rocket', 'Test flight started. I will visit each page system, then perform a magnetic rebuild.');
        }

        beginAction(action, force) {
            const anchors = this.getAnchors();
            let anchor = anchors[action];
            if (action === 'break') anchor = anchors.home;
            if (!anchor) {
                if (force || this.testQueue.length) anchor = anchors.home;
                else return this.scheduleNext();
            }

            this.action = action;
            this.actionStarted = performance.now();
            this.clockEffectShown = false;
            this.umbrella.visible = false;
            this.rememberAction(action, anchor);
            this.beginTravel(anchor.point, action);
        }

        beginTravel(target, action, returning) {
            const start = { ...this.screenPosition };
            const distance = Math.hypot(target.x - start.x, target.y - start.y);
            const upward = start.y - target.y;
            const rocket = distance > 280 || upward > 145;
            const direction = target.x >= start.x ? 1 : -1;
            const arc = clamp(distance * .22, 45, 150);
            this.flight = {
                start,
                target: { ...target },
                control: {
                    x: (start.x + target.x) / 2 + direction * Math.min(70, distance * .08),
                    y: Math.min(start.y, target.y) - arc
                },
                startTime: performance.now(),
                duration: clamp(850 + distance * 1.3, 1000, 2400),
                rocket,
                returning: Boolean(returning),
                action
            };
            this.phase = returning ? 'return' : 'travel';
            this.phaseStarted = this.flight.startTime;
            this.setRocketVisible(rocket);
            if (rocket && !returning && this.random() < .44) this.speak('rocket');
        }

        updateTravel(now) {
            const flight = this.flight;
            const raw = clamp((now - flight.startTime) / flight.duration, 0, 1);
            const t = easeInOutCubic(raw);
            const oneMinus = 1 - t;
            this.screenPosition.x = oneMinus * oneMinus * flight.start.x + 2 * oneMinus * t * flight.control.x + t * t * flight.target.x;
            this.screenPosition.y = oneMinus * oneMinus * flight.start.y + 2 * oneMinus * t * flight.control.y + t * t * flight.target.y;
            const derivativeX = 2 * oneMinus * (flight.control.x - flight.start.x) + 2 * t * (flight.target.x - flight.control.x);
            this.character.rotation.z = clamp(-derivativeX / 950, -.22, .22);
            if (flight.rocket) this.animateFlames(now);

            if (raw < 1) return;
            this.screenPosition = { ...flight.target };
            this.character.rotation.z = 0;
            this.setRocketVisible(false);
            if (flight.returning) {
                this.phase = 'idle';
                this.action = 'idle';
                this.flight = null;
                this.scheduleNext();
                return;
            }
            this.phaseStarted = now;
            if (this.action === 'break') this.beginBreak(now);
            else {
                this.phase = 'perform';
                this.speak(this.action);
            }
        }

        updatePerformance(now) {
            const duration = ACTION_DURATION[this.action] || 5000;
            const progress = clamp((now - this.phaseStarted) / duration, 0, 1);
            if (this.action === 'search') this.performSearchDive(progress);
            if (this.action === 'clock' && !this.clockEffectShown && progress > .32) this.spinClockDigit();
            if (progress >= 1) this.finishAction();
        }

        finishAction() {
            this.umbrella.visible = false;
            if (this.testQueue.length) {
                const next = this.testQueue.shift();
                setTimeout(() => this.beginAction(next, true), 280);
                this.phase = 'idle';
                return;
            }
            const home = this.getAnchors().home.point;
            this.beginTravel(home, this.action, true);
        }

        performSearchDive(progress) {
            const anchor = this.getAnchors().search;
            if (!anchor) return;
            const rect = anchor.element.getBoundingClientRect();
            let scaleFactor = 1;
            if (progress > .34 && progress < .5) {
                const t = (progress - .34) / .16;
                scaleFactor = 1 - smoothstep(t);
                this.screenPosition.y = lerp(rect.top + 3, rect.top + rect.height * .62, t);
            } else if (progress >= .5 && progress < .68) {
                const t = (progress - .5) / .18;
                this.screenPosition.x = rect.left + rect.width * .22;
                this.screenPosition.y = lerp(rect.top + rect.height * .62, rect.top + 3, smoothstep(t));
                scaleFactor = smoothstep(t);
            } else if (progress >= .68) {
                this.screenPosition.x = rect.left + rect.width * .22;
                this.screenPosition.y = rect.top + 3;
            }
            this.character.scale.setScalar((this.settings.scale / 100) * scaleFactor);
        }

        spinClockDigit() {
            this.clockEffectShown = true;
            const clock = document.getElementById('dashboard-clock');
            if (!clock) return;
            const rect = clock.getBoundingClientRect();
            const digit = document.createElement('span');
            digit.className = 'avatar-clock-digit';
            digit.textContent = (clock.textContent.match(/\d/) || ['0'])[0];
            digit.style.left = `${rect.left + rect.width * .63}px`;
            digit.style.top = `${rect.top + rect.height * .18}px`;
            document.body.appendChild(digit);
            setTimeout(() => digit.remove(), 1250);
        }

        resetPieceTransforms() {
            this.pieces.forEach(piece => {
                piece.object.position.copy(piece.basePosition);
                piece.object.quaternion.copy(piece.baseQuaternion);
                piece.offset.set(0, 0, 0);
                piece.velocity.set(0, 0, 0);
                piece.angularVelocity.set(0, 0, 0);
            });
        }

        beginBreak(now) {
            this.phase = 'breaking';
            this.phaseStarted = now;
            this.breakState = { announcedRebuild: false };
            this.umbrella.visible = false;
            this.speak('fall');
            this.pieces.forEach(piece => {
                const angle = (piece.index / this.pieces.length) * Math.PI * 2 + (this.random() - .5) * .7;
                const speed = 25 + this.random() * 55;
                piece.velocity.set(Math.cos(angle) * speed, 35 + this.random() * 65, (this.random() - .5) * 24);
                piece.angularVelocity.set((this.random() - .5) * 5, (this.random() - .5) * 4, (this.random() - .5) * 5);
            });
        }

        updateBreak(dt, now) {
            const elapsed = (now - this.phaseStarted) / 1000;
            if (this.phase === 'breaking') {
                this.pieces.forEach(piece => {
                    piece.velocity.y -= 145 * dt;
                    piece.offset.addScaledVector(piece.velocity, dt);
                    if (piece.offset.y < -8) {
                        piece.offset.y = -8;
                        piece.velocity.y = Math.abs(piece.velocity.y) * .32;
                        piece.velocity.x *= .72;
                    }
                    piece.object.position.copy(piece.basePosition).add(piece.offset);
                    piece.object.rotation.x += piece.angularVelocity.x * dt;
                    piece.object.rotation.y += piece.angularVelocity.y * dt;
                    piece.object.rotation.z += piece.angularVelocity.z * dt;
                });
                if (elapsed > 1.75) {
                    this.phase = 'rebuilding';
                    this.phaseStarted = now;
                }
                return;
            }

            let maxDistance = 0;
            this.pieces.forEach(piece => {
                piece.velocity.addScaledVector(piece.offset, -38 * dt);
                piece.velocity.multiplyScalar(Math.exp(-8.5 * dt));
                piece.offset.addScaledVector(piece.velocity, dt);
                maxDistance = Math.max(maxDistance, piece.offset.length());
                piece.object.position.copy(piece.basePosition).add(piece.offset);
                piece.object.quaternion.slerp(piece.baseQuaternion, 1 - Math.exp(-9 * dt));
            });
            if (!this.breakState.announcedRebuild && now - this.phaseStarted > 500) {
                this.breakState.announcedRebuild = true;
                this.speak('rebuild');
            }
            if (maxDistance < .35 || now - this.phaseStarted > 3300) {
                this.resetPieceTransforms();
                this.finishAction();
            }
        }

        setRocketVisible(visible) {
            if (!this.flames) return;
            this.flames.forEach(flame => { flame.visible = visible; });
        }

        animateFlames(now) {
            this.flames.forEach((flame, index) => {
                const pulse = 1 + Math.sin(now * .025 + index * 1.7) * .18 + this.random() * .08;
                flame.scale.set(1 / pulse, pulse, 1 / pulse);
            });
        }

        applyPose(now, dt) {
            if (this.phase === 'breaking' || this.phase === 'rebuilding') return;
            const time = now / 1000;
            const isFlying = this.phase === 'travel' || this.phase === 'return';
            const action = this.phase === 'perform' ? this.action : 'idle';
            const activeScale = this.character.scale.x || this.settings.scale / 100;
            if (action !== 'search') this.character.scale.setScalar(lerp(activeScale, this.settings.scale / 100, 1 - Math.exp(-10 * dt)));

            const idleBob = this.reducedMotion ? 0 : Math.sin(time * 1.45) * 1.15;
            this.character.userData.bob = idleBob;
            this.torso.rotation.z = lerp(this.torso.rotation.z, action === 'widget' ? -.08 : Math.sin(time * .72) * .018, .08);
            this.head.rotation.z = lerp(this.head.rotation.z, action === 'weather' ? .12 : action === 'ai' ? -.1 : Math.sin(time * .55) * .035, .1);

            let leftArm = -.12;
            let rightArm = .12;
            let leftLeg = .02;
            let rightLeg = -.02;
            if (isFlying) {
                leftArm = .72;
                rightArm = -.72;
                leftLeg = -.14;
                rightLeg = .14;
            } else if (action === 'ai' || action === 'clock') {
                rightArm = 1.65 + Math.sin(time * 3) * .08;
                leftArm = -.25;
            } else if (action === 'weather') {
                rightArm = 1.14;
                leftArm = -.55;
            } else if (action === 'widget' || action === 'search') {
                leftLeg = .42 + Math.sin(time * 2.4) * .14;
                rightLeg = -.42 - Math.sin(time * 2.4) * .14;
                leftArm = -.32;
                rightArm = .32;
            } else if (action === 'shortcut') {
                rightArm = .72 + Math.sin(time * 6) * .55;
            }
            this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, leftArm, .12);
            this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, rightArm, .12);
            this.leftLeg.rotation.z = lerp(this.leftLeg.rotation.z, leftLeg, .12);
            this.rightLeg.rotation.z = lerp(this.rightLeg.rotation.z, rightLeg, .12);
            this.umbrella.visible = action === 'weather';
            if (this.umbrella.visible) this.umbrella.rotation.z = Math.sin(time * 1.4) * .035;

            this.updateEyes(now);
        }

        updateEyes(now) {
            const dx = clamp((this.cursor.x - this.screenPosition.x) / 240, -.9, .9);
            const dy = clamp((this.cursor.y - (this.screenPosition.y - 54)) / 180, -.7, .7);
            const blinkCycle = now % 6300;
            const blink = this.reducedMotion ? 1 : blinkCycle > 6070 ? clamp(Math.abs(blinkCycle - 6185) / 115, .08, 1) : 1;
            [this.leftEye, this.rightEye].forEach(eye => {
                eye.scale.y = blink;
                eye.userData.pupil.position.x = dx * 1.25;
                eye.userData.pupil.position.y = -dy * 1.05;
            });
            this.antenna.rotation.z = Math.sin(now * .003) * .08;
        }

        updateCharacterTransform() {
            const world = this.screenToWorld(this.screenPosition);
            this.character.position.set(world.x, world.y + (this.character.userData.bob || 0), 0);
            const flying = this.phase === 'travel' || this.phase === 'return';
            this.shadow.visible = !flying && this.phase !== 'breaking';
            this.shadow.material.opacity = this.phase === 'rebuilding' ? .14 : .28;
        }

        speak(category, exactText) {
            if (!this.settings.enabled || !this.settings.speech || !this.bubble) return;
            const candidates = this.dialogue[category] || FALLBACK_DIALOGUE[category] || FALLBACK_DIALOGUE.idle;
            let line = exactText;
            if (!line) {
                const unused = candidates.filter(item => !this.memory.recentLines.includes(item));
                const pool = unused.length ? unused : candidates;
                line = pool[Math.floor(this.random() * pool.length)];
            }
            this.bubble.textContent = line;
            this.bubble.classList.remove('hidden');
            this.speechUntil = performance.now() + clamp(2600 + line.length * 38, 3300, 6500);
            this.memory.recentLines = [...(this.memory.recentLines || []), line].slice(-7);
            this.rememberSoon();
            this.updateSpeechPosition();
        }

        updateSpeechPosition() {
            if (!this.bubble || this.bubble.classList.contains('hidden')) return;
            const bubbleWidth = Math.min(220, this.bubble.offsetWidth || 180);
            const left = clamp(this.screenPosition.x + 24, 12, this.viewport.width - bubbleWidth - 12);
            const top = clamp(this.screenPosition.y - 112 * (this.settings.scale / 100), 12, this.viewport.height - 74);
            this.bubble.style.left = `${left}px`;
            this.bubble.style.top = `${top}px`;
        }

        rememberAction(action, anchor) {
            this.memory.actionCounts[action] = (this.memory.actionCounts[action] || 0) + 1;
            if (anchor && anchor.element) {
                const identity = anchor.element.id || anchor.element.className.split(' ')[0];
                if (identity && !this.memory.discovered.includes(identity)) this.memory.discovered.push(identity);
                this.memory.discovered = this.memory.discovered.slice(-24);
            }
            this.rememberSoon();
        }

        rememberSoon() {
            clearTimeout(this.memorySaveTimer);
            this.memorySaveTimer = setTimeout(() => storageSet({ avatarMemory: this.memory }), 500);
        }

        timeGreetingCategory() {
            const hour = new Date().getHours();
            return hour < 12 ? 'morning' : hour >= 21 ? 'night' : 'idle';
        }

        scheduleNext() {
            const range = ACTIVITY_DELAYS[this.settings.activity] || ACTIVITY_DELAYS.normal;
            this.nextActionAt = performance.now() + lerp(range[0], range[1], this.random());
        }

        goHomeImmediately() {
            this.phase = 'idle';
            this.action = 'idle';
            this.testQueue = [];
            this.setRocketVisible(false);
            this.umbrella.visible = false;
            this.resetPieceTransforms();
            this.screenPosition = { ...this.getAnchors().home.point };
            this.bubble.classList.add('hidden');
            this.scheduleNext();
        }

        updateDiagnostics() {
            if (this.settings.debug === 'final' || !this.renderer) return;
            const info = this.renderer.info.render;
            this.diagnostics.textContent = `Pip / ${this.phase}:${this.action} · ${this.qualityMode} · calls ${info.calls} · triangles ${info.triangles}`;
        }

        animate(now) {
            if (!this.running) return;
            requestAnimationFrame(time => this.animate(time));
            if (document.hidden || !this.settings.enabled) {
                this.lastFrame = now;
                return;
            }

            const targetFps = this.qualityMode === 'low' || this.reducedMotion ? 30 : 60;
            if (now - this.lastRender < 1000 / targetFps) return;
            const dt = clamp((now - this.lastFrame) / 1000, 0, .05);
            this.lastFrame = now;
            this.lastRender = now;

            if (!this.reducedMotion) {
                if (this.phase === 'travel' || this.phase === 'return') this.updateTravel(now);
                else if (this.phase === 'perform') this.updatePerformance(now);
                else if (this.phase === 'breaking' || this.phase === 'rebuilding') this.updateBreak(dt, now);
                else if (this.phase === 'idle' && now >= this.nextActionAt && !document.querySelector('.modal-overlay:not(.hidden)')) {
                    const actions = this.eligibleActions();
                    this.beginAction(actions[Math.floor(this.random() * actions.length)]);
                }
            }

            this.applyPose(now, dt);
            this.updateCharacterTransform();
            this.updateSpeechPosition();
            if (this.speechUntil && now > this.speechUntil) {
                this.bubble.classList.add('hidden');
                this.speechUntil = 0;
            }
            this.updateDiagnostics();
            this.renderer.render(this.scene, this.camera);
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const companion = new PageCompanion();
        companion.init();
        window.pageCompanion = companion;
    });
}());
