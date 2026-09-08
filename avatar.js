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
        funContent: true,
        liveUpdates: true,
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
        wave: ['Hello there!'],
        drag: ['Wheee! Careful with the antenna.'],
        juggle: ['A little coordination practice.'],
        scavenge: ['I found something beyond the edge.'],
        zoom: ['Maximum browser velocity!'],
        nap: ['Entering extremely brief sleep mode.'],
        dance: ['This tab has excellent acoustics.'],
        scan: ['Inspecting the local pixels.'],
        balance: ['Perfectly calibrated. Probably.'],
        peek: ['Just checking whether the edge is still here.'],
        broadcast: ['I have a tiny update from the outside world.'],
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
        break: 5200,
        wave: 2400,
        juggle: 7200,
        scavenge: 5600,
        nap: 8200,
        dance: 6500,
        scan: 5600,
        balance: 6200,
        peek: 5200,
        broadcast: 7200
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
            this.hitTarget = document.getElementById('avatar-hit-target');
            this.bubble = document.getElementById('avatar-speech');
            this.anchorDebug = document.getElementById('avatar-anchor-debug');
            this.diagnostics = document.getElementById('avatar-diagnostics');
            this.settings = { ...DEFAULT_SETTINGS };
            this.memory = { actionCounts: {}, recentLines: [], discovered: [], visits: 0 };
            this.dialogue = FALLBACK_DIALOGUE;
            const entropy = typeof crypto !== 'undefined' && crypto.getRandomValues
                ? crypto.getRandomValues(new Uint32Array(1))[0]
                : Date.now() >>> 0;
            this.randomSeed = (daySeed() ^ entropy) >>> 0;
            this.random = seededRandom(this.randomSeed);
            this.viewport = { width: window.innerWidth, height: window.innerHeight };
            this.screenPosition = {
                x: clamp(80 + this.random() * Math.max(1, window.innerWidth - 160), 80, window.innerWidth - 80),
                y: window.innerHeight - 22
            };
            this.floorRoamX = this.screenPosition.x;
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
            this.dragState = null;
            this.throwState = null;
            this.jointVelocity = { head: 0, torso: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
            this.restPose = 'stand';
            this.lastRestName = '';
            this.lastAutonomousAction = '';
            this.actionStage = '';
            this.zoomState = null;
            this.nextLiveContentAt = performance.now() + 45000;
            this.liveRequestToken = 0;
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
            const gold = this.material({ color: 0xffc85b, emissive: 0x7a3f08, emissiveIntensity: .45, roughness: .26, metalness: .62 });
            const mint = this.material({ color: 0x72f1ad, emissive: 0x167a4b, emissiveIntensity: .42, roughness: .34, metalness: .12 });
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

            this.propRoot = new THREE.Group();
            this.propRoot.name = 'ActivityProps';
            root.add(this.propRoot);

            this.juggleBalls = [cyan, violet, gold].map((ballMaterial, index) => {
                const ball = this.mesh(new THREE.SphereGeometry(3.2, 18, 14), ballMaterial, this.propRoot, `JuggleBall${index + 1}`);
                ball.visible = false;
                return ball;
            });

            this.scannerBeam = this.mesh(
                new THREE.ConeGeometry(12, 42, 24, 1, true),
                new THREE.MeshBasicMaterial({ color: 0x65edff, transparent: true, opacity: .13, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
                this.propRoot,
                'ScannerBeam'
            );
            this.materials.push(this.scannerBeam.material);
            this.scannerBeam.rotation.z = Math.PI;
            this.scannerBeam.position.set(0, 14, -1);
            this.scannerBeam.visible = false;

            this.foundItems = [];
            const star = new THREE.Group();
            star.name = 'FoundStar';
            this.mesh(new THREE.OctahedronGeometry(5.2, 0), gold, star, 'StarCore');
            this.foundItems.push(star);

            const key = new THREE.Group();
            key.name = 'FoundKey';
            const keyRing = this.mesh(new THREE.TorusGeometry(4.2, 1.05, 10, 22), gold, key, 'KeyRing');
            keyRing.position.y = 5;
            const keyStem = this.mesh(new THREE.CylinderGeometry(1, 1, 12, 10), gold, key, 'KeyStem');
            keyStem.position.y = -3;
            const keyTooth = this.mesh(new THREE.BoxGeometry(5, 2, 2), gold, key, 'KeyTooth');
            keyTooth.position.set(2, -8, 0);
            this.foundItems.push(key);

            const cube = new THREE.Group();
            cube.name = 'FoundDataCube';
            this.mesh(new THREE.BoxGeometry(8, 8, 8), violet, cube, 'DataCube');
            const cubeRing = this.mesh(new THREE.TorusGeometry(6.2, .6, 8, 22), cyan, cube, 'DataCubeRing');
            cubeRing.rotation.x = Math.PI / 2;
            this.foundItems.push(cube);

            const leaf = new THREE.Group();
            leaf.name = 'FoundLeaf';
            const leafBlade = this.mesh(new THREE.SphereGeometry(5, 18, 12), mint, leaf, 'LeafBlade');
            leafBlade.scale.set(.55, 1.25, .22);
            leafBlade.rotation.z = -.55;
            const leafStem = this.mesh(new THREE.CylinderGeometry(.45, .6, 8, 8), graphiteSoft, leaf, 'LeafStem');
            leafStem.position.set(3, -4, 0);
            leafStem.rotation.z = -.55;
            this.foundItems.push(leaf);

            this.foundItems.forEach(item => {
                item.position.set(22, 36, 10);
                item.visible = false;
                this.propRoot.add(item);
            });
            this.activeFoundItem = null;

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
                'avatar-fun-content': ['funContent', 'checked'],
                'avatar-live-updates': ['liveUpdates', 'checked'],
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

            if (this.hitTarget) {
                this.hitTarget.addEventListener('pointerdown', event => this.beginDrag(event));
                this.hitTarget.addEventListener('pointermove', event => this.dragPointerMove(event));
                this.hitTarget.addEventListener('pointerup', event => this.endDrag(event));
                this.hitTarget.addEventListener('pointercancel', event => this.endDrag(event));
                this.hitTarget.addEventListener('click', event => {
                    event.preventDefault();
                    if (this.suppressAvatarClick) {
                        this.suppressAvatarClick = false;
                        return;
                    }
                    this.beginWave();
                });
            }
        }

        beginDrag(event) {
            if (!this.settings.enabled || this.phase === 'breaking' || this.phase === 'rebuilding') return;
            event.preventDefault();
            this.hitTarget.setPointerCapture(event.pointerId);
            this.suppressAvatarClick = false;
            this.testQueue = [];
            this.flight = null;
            this.throwState = null;
            this.zoomState = null;
            this.character.visible = true;
            this.setRocketVisible(false);
            this.hideActivityProps();
            this.character.scale.setScalar(this.settings.scale / 100);
            this.character.userData.bob = 0;
            this.phase = 'dragging';
            this.action = 'drag';
            this.phaseStarted = performance.now();
            this.dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                grabOffsetX: event.clientX - this.screenPosition.x,
                grabOffsetY: event.clientY - this.screenPosition.y,
                lastX: event.clientX,
                lastY: event.clientY,
                lastTime: performance.now(),
                velocityX: 0,
                velocityY: 0,
                moved: false
            };
            this.hitTarget.classList.add('is-dragging');
            this.bubble.classList.add('hidden');
        }

        dragPointerMove(event) {
            const drag = this.dragState;
            if (!drag || drag.pointerId !== event.pointerId || this.phase !== 'dragging') return;
            event.preventDefault();
            const now = performance.now();
            const dt = clamp((now - drag.lastTime) / 1000, .001, .05);
            const instantX = (event.clientX - drag.lastX) / dt;
            const instantY = (event.clientY - drag.lastY) / dt;
            const response = 1 - Math.exp(-18 * dt);
            drag.velocityX = lerp(drag.velocityX, instantX, response);
            drag.velocityY = lerp(drag.velocityY, instantY, response);
            drag.lastX = event.clientX;
            drag.lastY = event.clientY;
            drag.lastTime = now;
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
            this.screenPosition.x = clamp(event.clientX - drag.grabOffsetX, 38, this.viewport.width - 38);
            this.screenPosition.y = clamp(event.clientY - drag.grabOffsetY, 72, this.viewport.height - 12);
        }

        endDrag(event) {
            const drag = this.dragState;
            if (!drag || drag.pointerId !== event.pointerId) return;
            event.preventDefault();
            try { this.hitTarget.releasePointerCapture(event.pointerId); } catch (_) { /* Capture may already be gone. */ }
            this.hitTarget.classList.remove('is-dragging');
            this.dragState = null;

            if (!drag.moved) {
                this.phase = 'idle';
                this.action = 'idle';
                this.character.rotation.z = 0;
                this.scheduleNext();
                return;
            }

            this.suppressAvatarClick = event.type !== 'pointercancel';
            if (this.suppressAvatarClick) {
                setTimeout(() => { this.suppressAvatarClick = false; }, 0);
            }
            if (this.reducedMotion) {
                this.phase = 'idle';
                this.action = 'idle';
                this.character.rotation.z = 0;
                this.scheduleNext();
                return;
            }

            this.phase = 'thrown';
            this.action = 'ragdoll';
            this.phaseStarted = performance.now();
            this.throwState = {
                velocityX: clamp(drag.velocityX, -1350, 1350),
                velocityY: clamp(drag.velocityY + 45, -1150, 1250),
                angularVelocity: clamp(drag.velocityX / 520, -4.2, 4.2),
                bounces: 0,
                settledSurface: null
            };
            this.speak('drag');
        }

        beginWave() {
            if (!this.settings.enabled || this.phase === 'breaking' || this.phase === 'rebuilding') return;
            this.testQueue = [];
            this.flight = null;
            this.throwState = null;
            this.dragState = null;
            this.zoomState = null;
            this.character.visible = true;
            this.setRocketVisible(false);
            this.hideActivityProps();
            this.character.scale.setScalar(this.settings.scale / 100);
            this.character.rotation.z = 0;
            this.phase = 'perform';
            this.action = 'wave';
            this.phaseStarted = performance.now();
            this.rememberAction('wave');
            this.speak('wave');
        }

        springRotation(object, target, key, stiffness, damping, dt) {
            let velocity = this.jointVelocity[key] || 0;
            velocity += ((target - object.rotation.z) * stiffness - velocity * damping) * dt;
            object.rotation.z += velocity * dt;
            this.jointVelocity[key] = velocity;
        }

        updateDraggedPose(dt) {
            if (!this.dragState) return;
            const vx = clamp(this.dragState.velocityX / 800, -1, 1);
            const vy = clamp(this.dragState.velocityY / 800, -1, 1);
            this.springRotation(this.head, -vx * .38, 'head', 34, 7.5, dt);
            this.springRotation(this.torso, -vx * .18, 'torso', 28, 7, dt);
            this.springRotation(this.leftArm, -.45 - vx * .72 - vy * .2, 'leftArm', 24, 5.5, dt);
            this.springRotation(this.rightArm, .45 - vx * .72 + vy * .2, 'rightArm', 24, 5.5, dt);
            this.springRotation(this.leftLeg, .2 + vx * .5 - vy * .24, 'leftLeg', 20, 4.8, dt);
            this.springRotation(this.rightLeg, -.2 + vx * .5 + vy * .24, 'rightLeg', 20, 4.8, dt);
            this.character.rotation.z = lerp(this.character.rotation.z, -vx * .2, 1 - Math.exp(-10 * dt));
        }

        collisionSurfaces() {
            const surfaces = [{ y: this.viewport.height - 16, left: 0, right: this.viewport.width, name: 'floor' }];
            const selectors = ['.search-bar', '.spotify-widget:not(.hidden)', '#weather-display', '.shortcut-card'];
            document.querySelectorAll(selectors.join(',')).forEach(element => {
                const rect = element.getBoundingClientRect();
                if (rect.width < 45 || rect.height < 12 || rect.top < 60 || rect.top > this.viewport.height - 25) return;
                surfaces.push({
                    y: rect.top + 3,
                    left: rect.left + Math.min(16, rect.width * .18),
                    right: rect.right - Math.min(16, rect.width * .18),
                    name: element.id || element.className.split(' ')[0]
                });
            });
            return surfaces.sort((a, b) => a.y - b.y);
        }

        updateThrownPose(dt, now) {
            const state = this.throwState;
            if (!state) return;

            if (this.phase === 'recovering') {
                const response = 1 - Math.exp(-8 * dt);
                this.character.rotation.z = lerp(this.character.rotation.z, 0, response);
                this.springRotation(this.head, 0, 'head', 42, 10, dt);
                this.springRotation(this.torso, 0, 'torso', 42, 10, dt);
                this.springRotation(this.leftArm, -.12, 'leftArm', 36, 9, dt);
                this.springRotation(this.rightArm, .12, 'rightArm', 36, 9, dt);
                this.springRotation(this.leftLeg, this.restPose === 'sit' ? .58 : .02, 'leftLeg', 36, 9, dt);
                this.springRotation(this.rightLeg, this.restPose === 'sit' ? -.58 : -.02, 'rightLeg', 36, 9, dt);
                if (now - this.phaseStarted > 900) {
                    this.phase = 'idle';
                    this.action = 'idle';
                    this.throwState = null;
                    Object.keys(this.jointVelocity).forEach(key => { this.jointVelocity[key] = 0; });
                    this.character.rotation.z = 0;
                    this.scheduleNext();
                }
                return;
            }

            const previousY = this.screenPosition.y;
            state.velocityY += 1180 * dt;
            state.velocityX *= Math.exp(-.12 * dt);
            this.screenPosition.x += state.velocityX * dt;
            this.screenPosition.y += state.velocityY * dt;
            this.character.rotation.z += state.angularVelocity * dt;
            state.angularVelocity *= Math.exp(-.3 * dt);

            if (this.screenPosition.x < 38 || this.screenPosition.x > this.viewport.width - 38) {
                this.screenPosition.x = clamp(this.screenPosition.x, 38, this.viewport.width - 38);
                state.velocityX *= -.46;
                state.angularVelocity *= -.72;
            }

            if (state.velocityY > 0) {
                const surface = this.collisionSurfaces().find(item =>
                    this.screenPosition.x >= item.left && this.screenPosition.x <= item.right &&
                    previousY <= item.y && this.screenPosition.y >= item.y
                );
                if (surface) {
                    this.screenPosition.y = surface.y;
                    state.velocityY = -Math.abs(state.velocityY) * .34;
                    state.velocityX *= .7;
                    state.angularVelocity *= .68;
                    state.bounces += 1;
                    state.settledSurface = surface;
                }
            }

            const motionX = clamp(state.velocityX / 700, -1.2, 1.2);
            const motionY = clamp(state.velocityY / 700, -1.2, 1.2);
            this.springRotation(this.head, -motionX * .55, 'head', 8, 1.8, dt);
            this.springRotation(this.torso, -motionX * .2, 'torso', 7, 1.6, dt);
            this.springRotation(this.leftArm, -1.15 - motionY * .25, 'leftArm', 6, 1.25, dt);
            this.springRotation(this.rightArm, 1.15 + motionY * .25, 'rightArm', 6, 1.25, dt);
            this.springRotation(this.leftLeg, .55 + motionX * .3, 'leftLeg', 5, 1.1, dt);
            this.springRotation(this.rightLeg, -.55 + motionX * .3, 'rightLeg', 5, 1.1, dt);

            const settled = state.settledSurface && Math.abs(state.velocityY) < 90 && Math.abs(state.velocityX) < 75;
            if (settled || now - this.phaseStarted > 4800) {
                state.velocityX = 0;
                state.velocityY = 0;
                state.angularVelocity = 0;
                this.restPose = state.settledSurface && state.settledSurface.name !== 'floor' ? 'sit' : 'stand';
                if (this.restPose === 'sit' && state.settledSurface) {
                    this.screenPosition.y = state.settledSurface.y + 18 * (this.settings.scale / 100);
                }
                this.phase = 'recovering';
                this.phaseStarted = now;
            }
        }

        applySettings() {
            if (!this.settings.enabled) {
                this.stage.classList.add('hidden');
                if (this.hitTarget) this.hitTarget.classList.add('hidden');
                this.bubble.classList.add('hidden');
                this.diagnostics.classList.add('hidden');
                return;
            }
            this.stage.classList.remove('hidden');
            if (this.hitTarget) this.hitTarget.classList.remove('hidden');
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

        elementAnchor(selector, xFactor, yOffset, pose) {
            const element = document.querySelector(selector);
            if (!element || element.classList.contains('hidden')) return null;
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > this.viewport.height) return null;
            return {
                element,
                pose: pose || 'stand',
                point: {
                    x: clamp(rect.left + rect.width * xFactor, 44, this.viewport.width - 44),
                    y: clamp(rect.top + yOffset, 76, this.viewport.height - 10)
                }
            };
        }

        getAnchors() {
            const anchors = {
                home: { point: { x: this.floorRoamX, y: this.viewport.height - 16 }, element: null, pose: 'stand', name: 'floor' },
                search: this.elementAnchor('.search-bar', .72, 21, 'sit'),
                weather: this.elementAnchor('#weather-display', .52, 3, 'stand'),
                clock: this.elementAnchor('#dashboard-clock', .66, 5, 'stand'),
                ai: this.elementAnchor('#ai-sidebar .ai-sidebar-handle', .5, 4, 'stand')
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
                    pose: 'sit',
                    point: { x: clamp(rect.left + rect.width * .7, 44, this.viewport.width - 44), y: clamp(rect.top + 21, 76, this.viewport.height - 10) }
                };
            } else anchors.widget = null;

            const shortcuts = Array.from(document.querySelectorAll('.shortcut-card')).filter(element => element.getBoundingClientRect().width > 0);
            if (shortcuts.length) {
                const shortcut = shortcuts[Math.floor(this.random() * shortcuts.length)];
                const rect = shortcut.getBoundingClientRect();
                anchors.shortcut = {
                    element: shortcut,
                    pose: 'sit',
                    point: { x: clamp(rect.left + rect.width * .5, 44, this.viewport.width - 44), y: clamp(rect.top + 19, 76, this.viewport.height - 10) }
                };
            } else anchors.shortcut = null;
            return anchors;
        }

        chooseRestDestination(preferSit) {
            this.floorRoamX = clamp(68 + this.random() * Math.max(1, this.viewport.width - 136), 68, this.viewport.width - 68);
            const anchors = this.getAnchors();
            const choices = [];
            const add = (name, anchor, weight) => {
                if (!anchor || name === this.lastRestName) return;
                for (let i = 0; i < weight; i += 1) choices.push({ ...anchor, name });
            };
            add('search', anchors.search, preferSit ? 4 : 2);
            add('widget', anchors.widget, preferSit ? 5 : 3);
            add('shortcut', anchors.shortcut, preferSit ? 4 : 2);
            add('clock', anchors.clock, 1);
            add('weather', anchors.weather, 1);
            add('floor', anchors.home, preferSit ? 1 : 4);

            if (!choices.length) return anchors.home;
            const chosen = choices[Math.floor(this.random() * choices.length)];
            this.lastRestName = chosen.name;
            return chosen;
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
            const hasRainBg = Boolean(background && /weather-(rain|storm)/.test(background.className));
            const rainDiag = document.getElementById('rain-diagnostics');
            const isSimulatedRain = Boolean(rainDiag && !rainDiag.classList.contains('hidden') && !rainDiag.textContent.includes('No-rain'));
            return hasRainBg || isSimulatedRain;
        }

        getWeatherCommentary() {
            const tempEl = document.getElementById('weather-temp');
            const iconEl = document.getElementById('weather-icon');
            const tempText = tempEl?.textContent?.trim() || '';
            const iconText = iconEl?.textContent?.trim() || '';
            const raining = this.isRaining();

            if (tempText && !tempText.toLowerCase().includes('location off')) {
                if (raining) {
                    const rainPhrases = [
                        `Rain confirmed at ${tempText}. Umbrella deployed and circuits dry!`,
                        `Precipitation detected (${tempText}). Good thing I kept the umbrella ready.`,
                        `Current weather is ${tempText}. Full rain mode engaged!`
                    ];
                    return rainPhrases[Math.floor(this.random() * rainPhrases.length)];
                } else {
                    const dryPhrases = [
                        `Current weather: ${tempText} ${iconText}. No umbrella needed today!`,
                        `Atmosphere check: ${tempText}. Skies look clear, keeping the umbrella stowed.`,
                        `Current conditions: ${tempText}. Perfect weather for exploring the dashboard.`
                    ];
                    return dryPhrases[Math.floor(this.random() * dryPhrases.length)];
                }
            }

            if (raining) {
                return 'Rain detected! Umbrella deployed and circuits safe.';
            }

            return '';
        }

        eligibleActions() {
            const anchors = this.getAnchors();
            let actions = [
                'search', 'clock', 'juggle', 'juggle', 'scavenge', 'zoom', 'zoom',
                'nap', 'dance', 'dance', 'scan', 'balance', 'peek'
            ];
            if (anchors.ai) actions.push('ai');
            if (anchors.widget) actions.push('widget');
            if (anchors.shortcut) actions.push('shortcut');
            if (this.settings.weather) actions.push('weather');
            if (this.settings.weather && this.isRaining()) actions.push('weather');
            if ((this.settings.funContent || this.settings.liveUpdates) && performance.now() >= this.nextLiveContentAt) {
                actions.push('broadcast', 'broadcast');
            }
            if (this.settings.mishaps && (this.memory.actionCounts.break || 0) < Math.max(1, (this.memory.visits || 1) / 3) && this.random() < .09) actions.push('break');
            const withoutRepeat = actions.filter(action => action !== this.lastAutonomousAction);
            if (withoutRepeat.length) actions = withoutRepeat;
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
            this.testQueue = ['juggle', 'scavenge', 'zoom', 'nap', 'dance', 'scan', 'balance', 'peek', 'weather', 'clock', 'ai', 'widget', 'shortcut', 'break'];
            if (this.phase === 'idle') requestAnimationFrame(() => this.beginAction('search', true));
            this.speak('rocket', 'Test flight started. I will visit each page system, then perform a magnetic rebuild.');
        }

        beginAction(action, force) {
            const anchors = this.getAnchors();
            let anchor = anchors[action];
            if (action === 'break') anchor = anchors.home;
            if (action === 'juggle' || action === 'dance' || action === 'balance' || action === 'broadcast') {
                anchor = this.chooseRestDestination(false);
            } else if (action === 'nap') {
                anchor = this.chooseRestDestination(true);
            } else if (action === 'scan') {
                anchor = anchors.shortcut || anchors.search || this.chooseRestDestination(false);
            } else if (action === 'peek') {
                const left = this.random() < .5;
                anchor = {
                    name: left ? 'left-edge' : 'right-edge',
                    pose: 'peek',
                    element: null,
                    point: { x: left ? 18 : this.viewport.width - 18, y: clamp(150 + this.random() * (this.viewport.height - 300), 110, this.viewport.height - 90) }
                };
            } else if (action === 'scavenge') {
                const left = this.random() < .5;
                anchor = {
                    name: 'outside',
                    pose: 'fly',
                    element: null,
                    point: { x: left ? -95 : this.viewport.width + 95, y: clamp(this.screenPosition.y - 80 - this.random() * 180, 90, this.viewport.height - 90) }
                };
                this.actionStage = 'leaving';
            } else if (action === 'zoom') {
                this.rememberAction(action);
                this.lastAutonomousAction = action;
                this.beginZoom();
                return;
            }
            if (!anchor) {
                if (force || this.testQueue.length) anchor = anchors.home;
                else return this.scheduleNext();
            }

            this.action = action;
            this.actionStarted = performance.now();
            this.clockEffectShown = false;
            this.contentRequested = false;
            this.hideActivityProps();
            this.rememberAction(action, anchor);
            this.lastAutonomousAction = action;
            this.beginTravel(anchor.point, action, false, anchor.pose);
        }

        beginTravel(target, action, returning, restPose) {
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
                restPose: restPose || 'stand',
                action
            };
            this.phase = returning ? 'return' : 'travel';
            this.phaseStarted = this.flight.startTime;
            this.setRocketVisible(rocket);
            if (rocket && !returning && this.random() < .44) this.speak('rocket');
        }

        beginZoom() {
            this.action = 'zoom';
            this.actionStarted = performance.now();
            this.phaseStarted = this.actionStarted;
            this.phase = 'zooming';
            this.hideActivityProps();
            this.character.visible = true;
            const direction = this.random() < .5 ? -1 : 1;
            this.zoomState = {
                direction,
                start: { ...this.screenPosition },
                exit: { x: direction > 0 ? this.viewport.width + 105 : -105, y: clamp(this.screenPosition.y - 70, 95, this.viewport.height - 95) },
                passY: clamp(120 + this.random() * (this.viewport.height - 240), 95, this.viewport.height - 95),
                wrapped: false
            };
            this.setRocketVisible(true);
            this.speak('zoom');
        }

        updateZoom(now) {
            const state = this.zoomState;
            if (!state) return;
            const elapsed = (now - this.phaseStarted) / 1000;
            if (elapsed < .72) {
                const t = easeInOutCubic(elapsed / .72);
                this.screenPosition.x = lerp(state.start.x, state.exit.x, t);
                this.screenPosition.y = lerp(state.start.y, state.exit.y, t) - Math.sin(t * Math.PI) * 65;
                this.character.rotation.z = -.28 * state.direction;
                this.animateFlames(now);
                return;
            }
            if (elapsed < .88) {
                this.character.visible = false;
                return;
            }
            if (!state.wrapped) {
                state.wrapped = true;
                this.character.visible = true;
            }
            if (elapsed < 2.05) {
                const t = smoothstep((elapsed - .88) / 1.17);
                const fromX = state.direction > 0 ? -105 : this.viewport.width + 105;
                const toX = state.direction > 0 ? this.viewport.width + 105 : -105;
                this.screenPosition.x = lerp(fromX, toX, t);
                this.screenPosition.y = state.passY + Math.sin(t * Math.PI * 2.4) * 42;
                this.character.rotation.z = -.32 * state.direction + Math.sin(t * Math.PI * 2) * .08;
                this.animateFlames(now);
                return;
            }
            this.character.visible = true;
            this.character.rotation.z = 0;
            this.setRocketVisible(false);
            this.zoomState = null;
            this.finishAction();
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
            if (this.action === 'scavenge' && this.actionStage === 'leaving') {
                this.chooseFoundItem();
                this.actionStage = 'returning-with-item';
                const destination = this.chooseRestDestination(this.random() < .5);
                this.beginTravel(destination.point, this.action, false, destination.pose);
                return;
            }
            if (flight.returning) {
                this.restPose = flight.restPose || 'stand';
                this.phase = 'idle';
                this.action = 'idle';
                this.flight = null;
                this.scheduleNext();
                return;
            }
            this.performancePose = flight.restPose || 'stand';
            this.phaseStarted = now;
            if (this.action === 'break') this.beginBreak(now);
            else {
                this.phase = 'perform';
                if (this.action === 'weather') {
                    this.speak('weather', this.getWeatherCommentary());
                } else {
                    this.speak(this.action);
                }
            }
        }

        updatePerformance(now) {
            const duration = ACTION_DURATION[this.action] || 5000;
            const progress = clamp((now - this.phaseStarted) / duration, 0, 1);
            if (this.action === 'search') this.performSearchDive(progress);
            if (this.action === 'clock' && !this.clockEffectShown && progress > .32) this.spinClockDigit();
            this.updateActivityProps(now, progress);
            if (this.action === 'broadcast' && !this.contentRequested) {
                this.contentRequested = true;
                this.requestLiveSnippet();
            }
            if (progress >= 1) this.finishAction();
        }

        finishAction() {
            this.hideActivityProps();
            if (this.action === 'wave') {
                this.phase = 'idle';
                this.action = 'idle';
                this.scheduleNext();
                return;
            }
            if (this.testQueue.length) {
                const next = this.testQueue.shift();
                setTimeout(() => this.beginAction(next, true), 280);
                this.phase = 'idle';
                return;
            }
            const destination = this.chooseRestDestination(this.random() < .58);
            this.beginTravel(destination.point, this.action, true, destination.pose);
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

        hideActivityProps() {
            this.umbrella.visible = false;
            if (this.juggleBalls) this.juggleBalls.forEach(ball => { ball.visible = false; });
            if (this.scannerBeam) this.scannerBeam.visible = false;
            if (this.foundItems) this.foundItems.forEach(item => { item.visible = false; });
            this.activeFoundItem = null;
        }

        chooseFoundItem() {
            this.foundItems.forEach(item => { item.visible = false; });
            this.activeFoundItem = this.foundItems[Math.floor(this.random() * this.foundItems.length)];
            this.activeFoundItem.visible = true;
            this.activeFoundItem.position.set(22, 36, 10);
            this.activeFoundItem.scale.setScalar(1);
            return this.activeFoundItem;
        }

        updateActivityProps(now, progress) {
            const time = now / 1000;
            if (this.action === 'juggle') {
                this.juggleBalls.forEach((ball, index) => {
                    const u = (time * .72 + index / this.juggleBalls.length) % 1;
                    const direction = index % 2 ? 1 - u : u;
                    ball.visible = true;
                    ball.position.set(lerp(-17, 17, direction), 38 + 4 * u * (1 - u) * 34, 8 + index * .4);
                    ball.rotation.x = time * 2.8 + index;
                    ball.rotation.y = time * 3.6 + index * .7;
                });
            } else if (this.action === 'scan') {
                this.scannerBeam.visible = true;
                this.scannerBeam.rotation.z = Math.PI + Math.sin(time * 1.8) * .38;
                this.scannerBeam.material.opacity = .09 + Math.sin(time * 5) * .035;
            } else if (this.action === 'scavenge') {
                if (this.activeFoundItem) {
                    this.activeFoundItem.visible = true;
                    this.activeFoundItem.position.set(21 + Math.sin(time * 2.4) * 2, 37 + Math.sin(time * 3.1) * 1.5, 10);
                    this.activeFoundItem.rotation.y = time * 1.5;
                    this.activeFoundItem.rotation.z = Math.sin(time * 1.7) * .18;
                }
            } else if (this.action === 'balance') {
                if (!this.activeFoundItem) this.chooseFoundItem();
                this.activeFoundItem.visible = true;
                this.activeFoundItem.position.set(Math.sin(time * 1.9) * 2.2, 73, 6);
                this.activeFoundItem.rotation.z = Math.sin(time * 2.2) * .3;
                this.activeFoundItem.rotation.y = time * 1.2;
            }

            if (this.action === 'nap' && progress > .24 && progress < .76 && this.settings.speech && this.speechUntil < now) {
                this.speak('nap', this.random() < .5 ? 'z z z…' : 'Charging one tiny dream…');
            }
        }

        applyPose(now, dt) {
            if (this.phase === 'breaking' || this.phase === 'rebuilding') return;
            if (this.phase === 'dragging' || this.phase === 'thrown' || this.phase === 'recovering') {
                this.umbrella.visible = false;
                this.updateEyes(now);
                return;
            }
            const time = now / 1000;
            const isFlying = this.phase === 'travel' || this.phase === 'return' || this.phase === 'zooming';
            const action = this.phase === 'perform' ? this.action : 'idle';
            const seated = (action === 'idle' && this.restPose === 'sit') ||
                (this.phase === 'perform' && this.performancePose === 'sit') ||
                action === 'search' || action === 'widget' || action === 'nap';
            const activeScale = this.character.scale.x || this.settings.scale / 100;
            if (action !== 'search') this.character.scale.setScalar(lerp(activeScale, this.settings.scale / 100, 1 - Math.exp(-10 * dt)));

            const idleBob = this.reducedMotion || seated ? 0 : Math.sin(time * 1.45) * 1.15;
            this.character.userData.bob = idleBob;
            this.torso.rotation.z = lerp(this.torso.rotation.z, action === 'widget' ? -.08 : Math.sin(time * .72) * .018, .08);
            this.head.rotation.z = lerp(this.head.rotation.z, action === 'weather' ? .12 : action === 'ai' ? -.1 : Math.sin(time * .55) * .035, .1);

            let leftArm = -.12;
            let rightArm = .12;
            let leftLeg = .02;
            let rightLeg = -.02;
            if (seated) {
                leftLeg = .58 + Math.sin(time * 2.1) * .08;
                rightLeg = -.58 - Math.sin(time * 2.1) * .08;
                leftArm = -.28;
                rightArm = .28;
            }
            if (isFlying) {
                leftArm = .72;
                rightArm = -.72;
                leftLeg = -.14;
                rightLeg = .14;
            } else if (action === 'ai' || action === 'clock') {
                rightArm = 1.65 + Math.sin(time * 3) * .08;
                leftArm = -.25;
            } else if (action === 'weather') {
                const showUmbrella = this.isRaining();
                if (showUmbrella) {
                    rightArm = 1.14;
                    leftArm = -.55;
                } else {
                    rightArm = .85 + Math.sin(time * 3) * .08;
                    leftArm = -.35;
                }
            } else if (action === 'widget' || action === 'search') {
                leftLeg = .42 + Math.sin(time * 2.4) * .14;
                rightLeg = -.42 - Math.sin(time * 2.4) * .14;
                leftArm = -.32;
                rightArm = .32;
            } else if (action === 'shortcut') {
                rightArm = .72 + Math.sin(time * 6) * .55;
            } else if (action === 'juggle') {
                leftArm = -.62 + Math.sin(time * 4.5) * .42;
                rightArm = .62 - Math.sin(time * 4.5) * .42;
                leftLeg = .12;
                rightLeg = -.12;
            } else if (action === 'dance') {
                leftArm = -1.05 + Math.sin(time * 6.2) * .72;
                rightArm = 1.05 + Math.sin(time * 6.2 + Math.PI) * .72;
                leftLeg = .3 + Math.sin(time * 6.2) * .28;
                rightLeg = -.3 + Math.sin(time * 6.2 + Math.PI) * .28;
                this.torso.rotation.z = Math.sin(time * 6.2) * .16;
                this.head.rotation.z = -Math.sin(time * 6.2) * .12;
            } else if (action === 'scan') {
                leftArm = -.85;
                rightArm = .85;
                this.head.rotation.z = Math.sin(time * 1.8) * .25;
            } else if (action === 'balance') {
                leftArm = -1.45 + Math.sin(time * 2) * .08;
                rightArm = 1.45 - Math.sin(time * 2) * .08;
                this.torso.rotation.z = Math.sin(time * 1.9) * .11;
                this.head.rotation.z = -this.torso.rotation.z * .7;
            } else if (action === 'nap') {
                leftArm = -.12;
                rightArm = .12;
                this.head.rotation.z = -.28 + Math.sin(time * 1.1) * .025;
                this.torso.rotation.z = -.08;
            } else if (action === 'peek') {
                leftArm = -.72;
                rightArm = .72 + Math.sin(time * 5.5) * .32;
                this.head.rotation.z = this.screenPosition.x < this.viewport.width / 2 ? -.18 : .18;
            } else if (action === 'scavenge') {
                rightArm = 1.08;
                leftArm = -.42;
            } else if (action === 'broadcast') {
                leftArm = -.35 + Math.sin(time * 2.8) * .16;
                rightArm = 1.1 + Math.sin(time * 2.8) * .22;
            } else if (action === 'wave') {
                rightArm = 1.15 + (this.reducedMotion ? .35 : Math.sin(time * 7.5) * .62);
                leftArm = -.2;
                this.head.rotation.z = lerp(this.head.rotation.z, -.1, .12);
            }
            this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, leftArm, .12);
            this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, rightArm, .12);
            this.leftLeg.rotation.z = lerp(this.leftLeg.rotation.z, leftLeg, .12);
            this.rightLeg.rotation.z = lerp(this.rightLeg.rotation.z, rightLeg, .12);
            this.umbrella.visible = action === 'weather' && this.isRaining();
            if (this.umbrella.visible) this.umbrella.rotation.z = Math.sin(time * 1.4) * .035;

            this.updateEyes(now);
            if (action === 'nap') {
                this.leftEye.scale.y = .12;
                this.rightEye.scale.y = .12;
            }
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
            const airborne = this.phase === 'travel' || this.phase === 'return' || this.phase === 'dragging' || this.phase === 'thrown';
            this.shadow.visible = !airborne && this.phase !== 'breaking';
            this.shadow.material.opacity = this.phase === 'rebuilding' ? .14 : .28;
            this.updateHitTarget();
        }

        updateHitTarget() {
            if (!this.hitTarget) return;
            const scale = Math.max(.25, this.character.scale.x || this.settings.scale / 100);
            const width = 66 * scale;
            const height = 82 * scale;
            this.hitTarget.style.width = `${width}px`;
            this.hitTarget.style.height = `${height}px`;
            this.hitTarget.style.left = `${this.screenPosition.x - width / 2}px`;
            this.hitTarget.style.top = `${this.screenPosition.y - height + 7 * scale}px`;
            const disabled = !this.character.visible || this.phase === 'breaking' || this.phase === 'rebuilding' || this.phase === 'zooming' || scale < .35;
            this.hitTarget.classList.toggle('is-disabled', disabled);
        }

        async fetchWithTimeout(url, timeoutMs) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs || 5200);
            try {
                const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
                if (!response.ok) throw new Error(`Request failed: ${response.status}`);
                return await response.json();
            } finally {
                clearTimeout(timeout);
            }
        }

        cleanExternalText(value, maxLength) {
            const clean = String(value || '')
                .replace(/<[^>]*>/g, '')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;|&apos;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\s+/g, ' ')
                .trim();
            if (!clean) return '';
            const limit = maxLength || 190;
            return clean.length <= limit ? clean : `${clean.slice(0, limit - 1).replace(/\s+\S*$/, '')}…`;
        }

        readSportsWidget() {
            const matches = Array.from(document.querySelectorAll('#football-matches .match-item'));
            if (!matches.length) return '';
            const match = matches[Math.floor(this.random() * matches.length)];
            const teams = Array.from(match.querySelectorAll('.team-info span')).map(node => this.cleanExternalText(node.textContent, 42));
            const scores = Array.from(match.querySelectorAll('.team-score')).map(node => this.cleanExternalText(node.textContent, 8));
            const status = this.cleanExternalText(match.querySelector('.match-status')?.textContent, 35);
            if (teams.length < 2) return '';
            return scores.length >= 2
                ? `Sports check: ${teams[0]} ${scores[0]}, ${teams[1]} ${scores[1]}. ${status}`.trim()
                : `Sports check: ${teams[0]} against ${teams[1]}. ${status}`.trim();
        }

        async fetchQuote() {
            const data = await this.fetchWithTimeout('https://dummyjson.com/quotes/random', 4800);
            const quote = this.cleanExternalText(data.quote, 145);
            const author = this.cleanExternalText(data.author, 45);
            return quote ? `A quote I found: “${quote}”${author ? ` — ${author}` : ''}` : '';
        }

        async fetchJoke() {
            const data = await this.fetchWithTimeout('https://v2.jokeapi.dev/joke/Programming,Misc,Pun?safe-mode&type=single&lang=en', 4800);
            const joke = this.cleanExternalText(data.joke, 175);
            return joke ? `Incoming tiny joke: ${joke}` : '';
        }

        async fetchNewsUpdate() {
            const visibleHeadlines = Array.from(document.querySelectorAll('#tech-news-list .news-title'));
            if (visibleHeadlines.length) {
                const headline = visibleHeadlines[Math.floor(this.random() * visibleHeadlines.length)];
                return `From the news panel: ${this.cleanExternalText(headline.textContent, 155)}`;
            }
            const ids = await this.fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json', 5200);
            if (!Array.isArray(ids) || !ids.length) return '';
            const id = ids[Math.floor(this.random() * Math.min(ids.length, 12))];
            const story = await this.fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, 5200);
            const title = this.cleanExternalText(story && story.title, 155);
            return title ? `A current Hacker News headline: ${title}` : '';
        }

        async fetchSportsUpdate() {
            const widgetUpdate = this.readSportsWidget();
            if (widgetUpdate) return widgetUpdate;
            const today = new Date();
            const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const data = await this.fetchWithTimeout(`https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=Soccer`, 5200);
            const events = data && Array.isArray(data.events) ? data.events : [];
            if (!events.length) return '';
            const event = events[Math.floor(this.random() * Math.min(events.length, 8))];
            const home = this.cleanExternalText(event.strHomeTeam, 42);
            const away = this.cleanExternalText(event.strAwayTeam, 42);
            const status = this.cleanExternalText(event.strStatus || event.strTime, 35);
            const hasScore = event.intHomeScore !== null && event.intHomeScore !== '' && event.intAwayScore !== null && event.intAwayScore !== '';
            if (!home || !away) return this.cleanExternalText(event.strEvent, 170);
            return hasScore
                ? `Football update: ${home} ${event.intHomeScore}, ${away} ${event.intAwayScore}. ${status}`.trim()
                : `Football fixture: ${home} against ${away}. ${status}`.trim();
        }

        async requestLiveSnippet() {
            const types = [];
            if (this.settings.funContent) types.push('quote', 'joke');
            if (this.settings.liveUpdates) types.push('news', 'sports');
            if (!types.length) return;

            const type = types[Math.floor(this.random() * types.length)];
            const token = ++this.liveRequestToken;
            this.nextLiveContentAt = performance.now() + lerp(4 * 60 * 1000, 9 * 60 * 1000, this.random());
            const cached = this.memory.liveCache && this.memory.liveCache[type];
            if (cached && Date.now() - cached.savedAt < 20 * 60 * 1000 && !this.memory.recentLines.includes(cached.text) && this.random() < .45) {
                if (this.phase === 'perform' && this.action === 'broadcast') this.speak('broadcast', cached.text);
                return;
            }

            try {
                let text = '';
                if (type === 'quote') text = await this.fetchQuote();
                else if (type === 'joke') text = await this.fetchJoke();
                else if (type === 'news') text = await this.fetchNewsUpdate();
                else if (type === 'sports') text = await this.fetchSportsUpdate();
                if (!text || token !== this.liveRequestToken) return;
                this.memory.liveCache = this.memory.liveCache || {};
                this.memory.liveCache[type] = { text, savedAt: Date.now() };
                this.rememberSoon();
                if (this.phase === 'perform' && this.action === 'broadcast') this.speak('broadcast', text);
            } catch (_) {
                if (token === this.liveRequestToken && this.phase === 'perform' && this.action === 'broadcast') {
                    this.speak('broadcast', 'The outside feed is being shy, so here is a local update: you are doing better than an empty tab.');
                }
            }
        }

        speak(category, exactText) {
            if (!this.settings.enabled || !this.settings.speech || !this.bubble) return;
            const candidates = this.dialogue[category] || FALLBACK_DIALOGUE[category] || FALLBACK_DIALOGUE.idle;
            let line = exactText;
            if (!line) {
                const unused = candidates.filter(item => !this.memory.recentLines.includes(item));
                const pool = unused.length ? unused : candidates;
                line = pool[Math.floor(this.random() * pool.length)];
                const mixers = this.dialogue.mixers;
                const fragments = this.dialogue.fragments;
                const fragmentPool = fragments && (fragments[category] || fragments.general);
                if (mixers && fragmentPool && this.random() < .64) {
                    for (let attempt = 0; attempt < 5; attempt += 1) {
                        const opener = mixers.openers[Math.floor(this.random() * mixers.openers.length)];
                        const fragment = fragmentPool[Math.floor(this.random() * fragmentPool.length)];
                        const ending = this.random() < .72 ? mixers.endings[Math.floor(this.random() * mixers.endings.length)] : '';
                        const mixed = `${opener} ${fragment}${ending ? ` ${ending}` : ''}`.replace(/\s+/g, ' ').trim();
                        if (!this.memory.recentLines.includes(mixed)) {
                            line = mixed;
                            break;
                        }
                    }
                }
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
            this.hideActivityProps();
            this.resetPieceTransforms();
            this.dragState = null;
            this.throwState = null;
            this.zoomState = null;
            this.character.visible = true;
            if (this.hitTarget) this.hitTarget.classList.remove('is-dragging');
            this.screenPosition = { ...this.getAnchors().home.point };
            this.bubble.classList.add('hidden');
            this.scheduleNext();
        }

        updateDiagnostics() {
            if (this.settings.debug === 'final' || !this.renderer) return;
            const info = this.renderer.info.render;
            this.diagnostics.textContent = `Pip / ${this.phase}:${this.action} · ${this.qualityMode} · seed ${this.randomSeed} · calls ${info.calls} · triangles ${info.triangles}`;
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
                if (this.phase === 'dragging') this.updateDraggedPose(dt);
                else if (this.phase === 'thrown' || this.phase === 'recovering') this.updateThrownPose(dt, now);
                else if (this.phase === 'zooming') this.updateZoom(now);
                else if (this.phase === 'travel' || this.phase === 'return') this.updateTravel(now);
                else if (this.phase === 'perform') this.updatePerformance(now);
                else if (this.phase === 'breaking' || this.phase === 'rebuilding') this.updateBreak(dt, now);
                else if (this.phase === 'idle' && now >= this.nextActionAt && !document.querySelector('.modal-overlay:not(.hidden)')) {
                    const actions = this.eligibleActions();
                    this.beginAction(actions[Math.floor(this.random() * actions.length)]);
                }
            } else if (this.phase === 'dragging') {
                this.updateDraggedPose(dt);
            } else if (this.phase === 'perform' && this.action === 'wave') {
                this.updatePerformance(now);
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
