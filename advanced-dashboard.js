/* Chrome Home advanced dashboard: deliberately dependency-free for MV3. */
(function () {
    'use strict';

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const request = new Request(...args);
        if (request.method !== 'GET') return nativeFetch(...args);
        const cache = await caches.open('chrome-home-runtime-v1');
        try {
            const response = await nativeFetch(...args);
            if (response.ok) cache.put(request, response.clone()).catch(() => {});
            return response;
        } catch (error) {
            const cached = await cache.match(request);
            if (cached) return cached;
            throw error;
        }
    };

    const $ = id => document.getElementById(id);
    const getStore = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
    const setStore = value => new Promise(resolve => chrome.storage.local.set(value, resolve));
    const safeUrl = value => {
        try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch (_) { return null; }
    };

    class WetGlassRain {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d', { alpha: true });
            this.seed = 73019;
            this.mode = 'weather';
            this.intensity = 0;
            this.target = 0;
            this.drops = [];
            this.staticDrops = [];
            this.runnels = [];
            this.wind = 0;
            this.windTarget = 0;
            this.shower = .65;
            this.showerTarget = .65;
            this.nextWeatherShift = 0;
            this.frameNumber = 0;
            this.last = performance.now();
            this.resize = this.resize.bind(this);
            window.addEventListener('resize', this.resize, { passive: true });
            this.resize();
            this.observeWeather();
            requestAnimationFrame(time => this.frame(time));
        }
        random() {
            this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
            return this.seed / 4294967296;
        }
        resize() {
            this.dpr = Math.min(devicePixelRatio || 1, 2);
            this.w = innerWidth; this.h = innerHeight;
            this.canvas.width = Math.round(this.w * this.dpr);
            this.canvas.height = Math.round(this.h * this.dpr);
            this.canvas.style.width = this.w + 'px';
            this.canvas.style.height = this.h + 'px';
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.seed = 73019;
            this.runnels = [];
            const count = Math.min(1150, Math.round(this.w * this.h / 2600));
            this.staticDrops = Array.from({ length: count }, () => {
                const sizeBand = this.random();
                const radius = sizeBand < .73 ? .65 + this.random() * 1.55 :
                    sizeBand < .96 ? 2.1 + this.random() * 3.8 : 6 + this.random() * 7;
                return { x: this.random() * this.w, y: this.random() * this.h, r: radius,
                    a: .18 + this.random() * .42, stretch: .9 + this.random() * .18,
                    angle: (this.random() - .5) * .3, shape: this.random() };
            });
            this.staticLayer = document.createElement('canvas');
            this.staticLayer.width = this.canvas.width; this.staticLayer.height = this.canvas.height;
            const staticContext = this.staticLayer.getContext('2d');
            staticContext.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.staticDrops.forEach(drop => this.lens(staticContext, drop.x, drop.y, drop.r, drop.a, drop.stretch, drop.angle, true, drop.shape));
        }
        observeWeather() {
            const root = $('bg-container');
            const update = () => {
                if (this.mode !== 'weather') return;
                this.target = /weather-rain|weather-storm/.test(root.className) ? .68 : 0;
            };
            new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['class'] });
            update();
        }
        setTest(level) {
            this.mode = level === null ? 'weather' : 'test';
            this.target = level === null ? (/weather-rain|weather-storm/.test($('bg-container').className) ? .68 : 0) : level;
        }
        spawn() {
            const heavy = this.target > .7;
            const r = 2.4 + Math.pow(this.random(), 1.9) * (heavy ? 14.2 : 9.5);
            const fromBead = this.random() < .72;
            this.drops.push({
                x: this.random() * this.w,
                y: fromBead ? this.random() * this.h * .92 : -30 - this.random() * this.h * .2,
                r, vy: 5 + r * 3 + this.random() * 18, vx: (this.random() - .5) * 8,
                adhesion: fromBead ? this.random() * 2.8 : 0,
                drift: (this.random() - .5) * 18, phase: this.random() * 6.28,
                trail: [], life: 0, stretch: 1 + this.random() * .32, shape: this.random(),
                trailScale: .08 + this.random() * .34,
                persistentTrail: this.random() < .48,
                splitAt: 1.8 + this.random() * 5.5,
                lastTrailAt: 0
            });
        }
        lens(c, x, y, r, alpha, stretch = 1, angle = 0, staticBead = false, shape = .5) {
            c.save(); c.globalAlpha = alpha;
            c.translate(x, y); c.rotate(angle);
            c.beginPath();
            if (staticBead || r < 3.2) {
                c.ellipse(0, 0, r * (.9 + shape * .1), r * stretch, angle * .2, 0, Math.PI * 2);
            } else if (r > 10.5) {
                const points = [], count = 11;
                const largeStretch = Math.min(1.34, .96 + Math.max(0, stretch - 1) * .22);
                const widthScale = .7 + shape * .12;
                for (let i = 0; i < count; i++) {
                    const theta = -Math.PI / 2 + i * Math.PI * 2 / count;
                    const irregularity = 1 + Math.sin((i + 1) * 12.71 + shape * 31.9) * .11 + Math.sin((i + 2) * 4.17 + shape * 19.3) * .055;
                    const vertical = Math.sin(theta);
                    points.push({
                        x: Math.cos(theta) * r * widthScale * irregularity + vertical * (shape - .5) * r * .18,
                        y: vertical * r * largeStretch * irregularity
                    });
                }
                const firstMid = { x: (points[count - 1].x + points[0].x) / 2, y: (points[count - 1].y + points[0].y) / 2 };
                c.moveTo(firstMid.x, firstMid.y);
                points.forEach((point, index) => {
                    const next = points[(index + 1) % count];
                    c.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
                });
                c.closePath();
            } else {
                const left = .72 + shape * .18, right = .88 - shape * .12;
                c.moveTo((shape - .5) * r * .14, -r * stretch);
                c.bezierCurveTo(r * right, -r * .55, r * right, r * .36, r * .08, r);
                c.bezierCurveTo(-r * left, r * .88, -r * left, -r * .4, (shape - .5) * r * .14, -r * stretch);
                c.closePath();
            }
            c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = Math.max(.8, r * .35);
            const body = c.createLinearGradient(0, -r * stretch, 0, r);
            body.addColorStop(0, 'rgba(4,12,20,.42)');
            body.addColorStop(.18, 'rgba(75,120,145,.08)');
            body.addColorStop(.58, 'rgba(180,215,230,.025)');
            body.addColorStop(.83, 'rgba(235,248,252,.24)');
            body.addColorStop(1, 'rgba(252,255,255,.68)');
            c.fillStyle = body; c.fill(); c.shadowBlur = 0;
            c.strokeStyle = 'rgba(3,12,20,.24)'; c.lineWidth = Math.max(.35, r * .055); c.stroke();

            c.globalCompositeOperation = 'screen';
            if (r <= 8.5) {
                c.beginPath(); c.arc(0, r * .63, r * .56, .18, Math.PI - .12);
                c.strokeStyle = 'rgba(244,252,255,.43)'; c.lineWidth = Math.max(.45, r * .085); c.stroke();
            } else {
                c.beginPath();
                c.moveTo(-r * .43, -r * .22);
                c.quadraticCurveTo(-r * .58, r * .06, -r * .4, r * .29);
                c.strokeStyle = 'rgba(244,252,255,.24)'; c.lineWidth = Math.max(.55, r * .055); c.stroke();
            }
            if (r > 2.4) {
                c.beginPath();
                c.ellipse(-r * (.25 + shape * .08), -r * .3, Math.max(.35, r * .075), Math.max(.7, r * .17), -.52, 0, Math.PI * 2);
                c.fillStyle = 'rgba(255,255,255,.58)'; c.fill();
            }
            c.restore();
        }
        mergeDrops() {
            for (let i = this.drops.length - 1; i >= 0; i--) {
                const a = this.drops[i];
                for (let j = Math.max(0, i - 10); j < i; j++) {
                    const b = this.drops[j], dx = a.x - b.x, dy = a.y - b.y;
                    const reach = (a.r + b.r) * .7;
                    if (dx * dx + dy * dy < reach * reach) {
                        const area = a.r * a.r + b.r * b.r;
                        b.x = (b.x * b.r + a.x * a.r) / (b.r + a.r);
                        b.y = Math.max(b.y, a.y);
                        const mergedRadius = Math.sqrt(area);
                        b.r = Math.min(17, mergedRadius);
                        b.stretch = Math.min(2.15, b.stretch + Math.max(0, mergedRadius - 12) * .035);
                        b.vy = Math.max(b.vy, a.vy) + 16; b.adhesion = 0;
                        if (a.persistentTrail) this.preserveTrail(a);
                        this.drops.splice(i, 1); break;
                    }
                }
            }
        }
        preserveTrail(drop) {
            if (!drop.trail || drop.trail.length < 4) return;
            const longLived = drop.persistentTrail || drop.r > 9;
            this.runnels.push({
                points: drop.trail.map(point => ({ ...point })),
                age: 0,
                hold: longLived ? 2.5 + this.random() * 8 : .25 + this.random() * 1.2,
                fade: longLived ? 4 + this.random() * 12 : 1 + this.random() * 3,
                width: Math.max(.65, drop.r * drop.trailScale),
                side: this.random() < .5 ? -1 : 1,
                widthVariation: .78 + this.random() * .52
            });
            if (this.runnels.length > 75) this.runnels.shift();
        }
        traceTrail(c, points, xOffset = 0) {
            if (!points || points.length < 2) return false;
            c.beginPath();
            c.moveTo(points[0].x + xOffset, points[0].y);
            for (let i = 1; i < points.length - 1; i++) {
                const point = points[i], next = points[i + 1];
                c.quadraticCurveTo(point.x + xOffset, point.y, (point.x + next.x) / 2 + xOffset, (point.y + next.y) / 2);
            }
            const last = points[points.length - 1];
            c.lineTo(last.x + xOffset, last.y);
            return true;
        }
        drawTrail(c, points, width, alpha, side = 1) {
            c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
            if (this.traceTrail(c, points)) {
                c.strokeStyle = `rgba(4,15,24,${alpha * .085 * this.intensity})`;
                c.lineWidth = Math.max(.5, width * 1.55); c.stroke();
            }
            if (this.traceTrail(c, points, side * Math.min(.8, width * .22))) {
                c.strokeStyle = `rgba(231,247,252,${alpha * .065 * this.intensity})`;
                c.lineWidth = Math.max(.28, width * .24); c.stroke();
            }
            c.restore();
        }
        renderRunnels(c, dt) {
            for (let i = this.runnels.length - 1; i >= 0; i--) {
                const runnel = this.runnels[i]; runnel.age += dt;
                const fadeAge = Math.max(0, runnel.age - runnel.hold);
                const alpha = 1 - Math.min(1, fadeAge / runnel.fade);
                if (alpha <= 0) { this.runnels.splice(i, 1); continue; }
                this.drawTrail(c, runnel.points, runnel.width * runnel.widthVariation, alpha, runnel.side);
            }
        }
        splitDrop(drop) {
            if (drop.r < 11.5 || drop.life < drop.splitAt || this.drops.length > 220) return;
            drop.splitAt = Infinity;
            const childRadius = 1.7 + this.random() * Math.min(3.8, drop.r * .24);
            drop.r = Math.sqrt(Math.max(12, drop.r * drop.r - childRadius * childRadius));
            this.drops.push({
                x: drop.x + (this.random() < .5 ? -1 : 1) * drop.r * .68, y: drop.y + drop.r * .2,
                r: childRadius, vy: drop.vy * (.7 + this.random() * .18), vx: drop.vx + (this.random() - .5) * 32,
                adhesion: 0, drift: drop.drift + (this.random() - .5) * 12, phase: this.random() * 6.28,
                trail: [], life: 0, stretch: 1 + this.random() * .2, shape: this.random(),
                trailScale: .06 + this.random() * .18, persistentTrail: false, splitAt: Infinity, lastTrailAt: 0
            });
        }
        frame(now) {
            const dt = Math.min((now - this.last) / 1000, .034); this.last = now;
            this.intensity += (this.target - this.intensity) * (1 - Math.exp(-dt * 2.8));
            const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
            if (this.intensity > .015) {
                c.globalCompositeOperation = 'source-over';
                c.save(); c.globalAlpha = Math.min(1, this.intensity * 1.25); c.drawImage(this.staticLayer, 0, 0, this.w, this.h); c.restore();
                this.renderRunnels(c, dt);
                if (now >= this.nextWeatherShift) {
                    this.windTarget = (this.random() - .5) * (24 + this.intensity * 95);
                    this.showerTarget = .18 + Math.pow(this.random(), .65) * 1.35;
                    this.nextWeatherShift = now + 2300 + this.random() * 7600;
                }
                this.wind += (this.windTarget - this.wind) * (1 - Math.exp(-dt * .55));
                this.shower += (this.showerTarget - this.shower) * (1 - Math.exp(-dt * .8));
                const rate = this.intensity * this.shower * this.w / 48;
                this.spawnCarry = (this.spawnCarry || 0) + rate * dt;
                while (this.spawnCarry >= 1 && this.drops.length < 230) { this.spawn(); this.spawnCarry--; }
                for (let i = this.drops.length - 1; i >= 0; i--) {
                    const d = this.drops[i]; d.life += dt;
                    if (d.adhesion > 0) { d.adhesion -= dt * (.5 + this.intensity); }
                    else {
                        d.vy = Math.min(520, d.vy + (42 + d.r * 7) * dt);
                        d.vx += ((this.wind * (.18 + d.r / 28) + d.drift) - d.vx) * (1 - Math.exp(-dt * 1.25));
                        d.x += (d.vx + Math.sin(d.life * 2.1 + d.phase) * (3 + d.r * .24)) * dt;
                        d.y += d.vy * dt * (.45 + this.intensity * .72);
                        if (d.life - d.lastTrailAt > .035 + d.shape * .035) {
                            d.trail.unshift({ x: d.x, y: d.y - d.r, a: 1 });
                            d.lastTrailAt = d.life;
                        }
                    }
                    d.trail = d.trail.slice(0, 42 + Math.round(d.r * 1.3));
                    this.drawTrail(c, d.trail, Math.max(.48, d.trailScale * d.r), .9, d.shape < .5 ? -1 : 1);
                    const angle = Math.atan2(d.vx, Math.max(1, d.vy)) * -.7;
                    this.lens(c, d.x, d.y, d.r, .3 + this.intensity * .38, d.stretch + Math.min(.48, d.vy / 760), angle, false, d.shape);
                    this.splitDrop(d);
                    if (d.y > this.h + 60 || d.x < -60 || d.x > this.w + 60) {
                        this.preserveTrail(d);
                        this.drops.splice(i, 1);
                    }
                }
                if ((this.frameNumber++ % 5) === 0) this.mergeDrops();
            } else if (this.drops.length) this.drops.length = 0;
            requestAnimationFrame(time => this.frame(time));
        }
    }

    class AuroraField {
        constructor(canvas) {
            this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.start = performance.now();
            this.resize = () => { const d = Math.min(devicePixelRatio || 1, 1.5); canvas.width = innerWidth * d; canvas.height = innerHeight * d; this.d = d; };
            addEventListener('resize', this.resize, { passive: true }); this.resize(); requestAnimationFrame(t => this.frame(t));
        }
        frame(now) {
            const c = this.ctx, w = this.canvas.width, h = this.canvas.height, t = (now - this.start) / 18000;
            c.clearRect(0, 0, w, h); c.globalCompositeOperation = 'screen';
            const colors = ['86,80,255', '30,190,220', '238,65,170', '70,230,155'];
            colors.forEach((color, i) => {
                const phase = t * (.7 + i * .13) + i * 1.7;
                const x = (.5 + Math.sin(phase) * .36) * w, y = (.5 + Math.cos(phase * .83) * .32) * h;
                const radius = Math.max(w, h) * (.42 + i * .035);
                const g = c.createRadialGradient(x, y, 0, x, y, radius);
                g.addColorStop(0, `rgba(${color},.17)`); g.addColorStop(.45, `rgba(${color},.07)`); g.addColorStop(1, `rgba(${color},0)`);
                c.fillStyle = g; c.fillRect(0, 0, w, h);
            });
            requestAnimationFrame(n => this.frame(n));
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const wetGlass = new WetGlassRain($('wet-glass-canvas'));
        new AuroraField($('aurora-canvas'));

        const testStates = [null, .38, .9, 0]; let testIndex = 0;
        $('rain-test-btn').addEventListener('click', () => {
            testIndex = (testIndex + 1) % testStates.length;
            const level = testStates[testIndex]; wetGlass.setTest(level);
            const labels = ['Weather controlled', 'Light rain · 3 layers', 'Heavy rain · 3 layers', 'No-rain baseline'];
            $('rain-test-btn').textContent = '☂';
            $('rain-test-btn').title = labels[testIndex];
            $('rain-test-btn').setAttribute('aria-label', labels[testIndex]);
            const diag = $('rain-diagnostics'); diag.classList.remove('hidden');
            diag.textContent = `Rain test: ${labels[testIndex]} | seed 73019 | ${wetGlass.staticDrops.length} glass beads | moving ${wetGlass.drops.length}/230 | lingering trails ${wetGlass.runnels.length}/75 | wind ${wetGlass.wind.toFixed(1)} | shower ${wetGlass.shower.toFixed(2)} | DPR ${wetGlass.dpr}`;
            clearTimeout(window.rainDiagTimer); window.rainDiagTimer = setTimeout(() => diag.classList.add('hidden'), 5500);
        });

        const settings = (await getStore(['advancedSettings', 'dailyIntention']));
        const prefs = Object.assign({ scale: 100, contrast: 38, density: 'comfortable', reducedMotion: false }, settings.advancedSettings);
        const applyPrefs = () => {
            document.documentElement.style.setProperty('--ui-scale', prefs.scale / 100);
            document.documentElement.style.setProperty('--adaptive-scrim', prefs.contrast / 100);
            document.body.classList.toggle('compact', prefs.density === 'compact');
            document.body.classList.toggle('manual-reduced-motion', prefs.reducedMotion);
            $('aurora-canvas').style.display = prefs.reducedMotion ? 'none' : '';
        };
        $('font-scale').value = prefs.scale; $('contrast-strength').value = prefs.contrast;
        $('display-density').value = prefs.density; $('reduce-motion').checked = prefs.reducedMotion; applyPrefs();
        const bindPref = (id, key, parse = value => value) => $(id).addEventListener('input', async e => { prefs[key] = parse(e.target.type === 'checkbox' ? e.target.checked : e.target.value); applyPrefs(); await setStore({ advancedSettings: prefs }); });
        bindPref('font-scale', 'scale', Number); bindPref('contrast-strength', 'contrast', Number); bindPref('display-density', 'density'); bindPref('reduce-motion', 'reducedMotion');

        const tick = () => { const now = new Date(); $('dashboard-clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); $('dashboard-date').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); };
        tick(); setInterval(tick, 1000);
        $('daily-intention').value = settings.dailyIntention || '';
        $('daily-intention').addEventListener('input', e => setStore({ dailyIntention: e.target.value }));
        $('focus-mode-btn').addEventListener('click', () => { document.body.classList.toggle('focus-mode'); $('focus-mode-btn').textContent = document.body.classList.contains('focus-mode') ? 'Exit focus' : 'Focus mode'; });

        let timerSeconds = 1500, timerHandle = null;
        const paintTimer = () => $('pomodoro-btn').textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2,'0')}:${String(timerSeconds % 60).padStart(2,'0')}`;
        const toggleTimer = () => { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; return; } timerHandle = setInterval(() => { timerSeconds--; paintTimer(); if (timerSeconds <= 0) { clearInterval(timerHandle); timerHandle = null; timerSeconds = 1500; new Notification('Chrome Home', { body: 'Focus session complete.' }); paintTimer(); } }, 1000); };
        $('pomodoro-btn').addEventListener('click', toggleTimer);

        chrome.storage.local.remove('workspaceProfiles');
        chrome.storage.sync.remove('workspaceProfiles');
        chrome.storage.local.remove(['agenda', 'bookmarkInbox']);
        chrome.storage.sync.remove(['agenda', 'bookmarkInbox']);
        $('utility-close').addEventListener('click', () => drawer.classList.add('hidden'));

        const widgetIds = ['spotify-widget','football-widget','todo-widget','notes-widget','tech-news-widget','github-repos-widget','blender-dev-widget','movies-widget'];
        $('reset-layout').addEventListener('click', () => widgetIds.forEach(id => { const el = $(id); el.style.left = ''; el.style.top = ''; el.style.width = ''; }));
        document.addEventListener('dragend', e => { const widget = e.target.closest('.spotify-widget'); if (!widget) return; const snap = 12; widget.style.left = Math.max(8, Math.min(innerWidth - widget.offsetWidth - 8, Math.round(widget.offsetLeft / snap) * snap)) + 'px'; widget.style.top = Math.max(8, Math.min(innerHeight - widget.offsetHeight - 8, Math.round(widget.offsetTop / snap) * snap)) + 'px'; }, true);

        const overlay=$('command-overlay'), input=$('command-input'), results=$('command-results'); let commands=[], selected=0;
        const actions=[
            {title:'Toggle focus mode',meta:'Action',run:()=>$('focus-mode-btn').click()},
            {title:'Test realistic rain',meta:'Action',run:()=>$('rain-test-btn').click()},
            {title:'Reset widget layout',meta:'Action',run:()=>$('reset-layout').click()}
        ];
        const renderCommands=()=>{ results.replaceChildren(...commands.slice(0,12).map((cmd,i)=>{const b=document.createElement('button');b.type='button';b.className='command-result'+(i===selected?' active':'');const title=document.createElement('span');title.textContent=cmd.title;const meta=document.createElement('small');meta.textContent=cmd.meta||cmd.url||'';b.append(title,meta);b.onclick=()=>runCommand(cmd);return b;})); };
        const runCommand=cmd=>{ closePalette(); if(cmd.run)cmd.run(); else if(cmd.url)location.href=cmd.url; };
        const loadCommands=async query=>{ const q=query.trim().toLowerCase(), store=await getStore(['shortcuts','mySites']); const local=[...(store.shortcuts||[]),...(store.mySites||[])].map(x=>({title:x.title||x.name,url:safeUrl(x.url),meta:'Saved site'})).filter(x=>x.url); const history=await new Promise(resolve=>chrome.history.search({text:q,maxResults:20,startTime:0},resolve)); const historyItems=history.map(x=>({title:x.title||x.url,url:safeUrl(x.url),meta:'History'})).filter(x=>x.url); commands=[...actions,...local,...historyItems].filter(x=>!q||`${x.title} ${x.meta}`.toLowerCase().includes(q)); if(q.startsWith('/timer ')){const mins=Math.max(1,Math.min(180,parseInt(q.slice(7),10)||25));commands.unshift({title:`Start a ${mins}-minute timer`,meta:'Quick action',run:()=>{timerSeconds=mins*60;paintTimer();if(!timerHandle)toggleTimer();}});} const bangs={yt:'https://www.youtube.com/results?search_query=',gh:'https://github.com/search?q=',maps:'https://www.google.com/maps/search/',ddg:'https://duckduckgo.com/?q='}; const parts=q.split(/\s+/); if(bangs[parts[0]]&&parts.length>1)commands.unshift({title:`Search ${parts[0]} for “${parts.slice(1).join(' ')}”`,meta:'Search bang',url:bangs[parts[0]]+encodeURIComponent(parts.slice(1).join(' '))}); if(q)commands.push({title:`Search the web for “${query.trim()}”`,meta:'Google',url:'https://www.google.com/search?q='+encodeURIComponent(query.trim())}); selected=0;renderCommands();};
        const loadAllCommands=async query=>{ await loadCommands(query); const q=query.trim().toLowerCase(); const [tabs,bookmarks]=await Promise.all([new Promise(resolve=>chrome.tabs.query({},resolve)),new Promise(resolve=>chrome.bookmarks.search(q||'http',resolve))]); const extras=[...tabs.map(item=>({title:item.title||item.url,url:safeUrl(item.url),meta:'Open tab'})),...bookmarks.map(item=>({title:item.title||item.url,url:safeUrl(item.url),meta:'Bookmark'}))].filter(item=>item.url&&(!q||`${item.title} ${item.meta}`.toLowerCase().includes(q))); commands.splice(Math.min(actions.length,commands.length),0,...extras); renderCommands(); };
        const openPalette=()=>{overlay.classList.remove('hidden');input.value='';loadAllCommands('');setTimeout(()=>input.focus(),0);};
        const closePalette=()=>overlay.classList.add('hidden');
        $('command-palette-btn').addEventListener('click',openPalette); input.addEventListener('input',e=>loadAllCommands(e.target.value)); overlay.addEventListener('click',e=>{if(e.target===overlay)closePalette();});
        document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette();return;}if(overlay.classList.contains('hidden'))return;if(e.key==='Escape')closePalette();if(e.key==='ArrowDown'){e.preventDefault();selected=Math.min(commands.length-1,selected+1);renderCommands();}if(e.key==='ArrowUp'){e.preventDefault();selected=Math.max(0,selected-1);renderCommands();}if(e.key==='Enter'&&commands[selected]){e.preventDefault();runCommand(commands[selected]);}});

        document.addEventListener('click', e => {
            const link=e.target.closest('a[href]'); if(!link)return;
            const url=safeUrl(link.href); if(!url){e.preventDefault();}
            else if(link.target==='_blank')link.rel='noopener noreferrer';
        }, true);

        document.querySelectorAll('div.control-btn, div.widget-menu-item').forEach(control => {
            control.setAttribute('role', 'button');
            control.tabIndex = 0;
            if (!control.getAttribute('aria-label')) control.setAttribute('aria-label', control.title || control.textContent.trim());
            control.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    control.click();
                }
            });
        });

        const widgetCloseMap = {
            'spotify-widget': 'spotify-btn',
            'football-widget': 'football-btn',
            'todo-widget': 'todo-btn',
            'notes-widget': 'notes-btn',
            'tech-news-widget': 'tech-news-btn',
            'github-repos-widget': 'github-repos-btn',
            'blender-dev-widget': 'blender-dev-btn',
            'movies-widget': 'movies-btn'
        };
        Object.entries(widgetCloseMap).forEach(([widgetId, triggerId]) => {
            const widget = $(widgetId);
            const controls = widget?.querySelector('.spotify-controls');
            if (!controls || controls.querySelector('.widget-close')) return;
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'widget-close';
            close.textContent = '×';
            close.title = 'Close widget';
            close.setAttribute('aria-label', 'Close widget');
            close.addEventListener('mousedown', event => event.stopPropagation());
            close.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (!widget.classList.contains('hidden')) $(triggerId).click();
            });
            controls.appendChild(close);
        });
    });
})();
