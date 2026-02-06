// cursor-trail.js - Subtle cursor trail effect
// Canvas-based particle system for premium feel

class CursorTrail {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.mouse = {
            x: 0,
            y: 0
        };
        this.isRunning = false;
        this.animationId = null;
        this.isVisible = true;

        // Configuration
        this.config = {
            particleCount: 20,
            trailLength: 15,
            particleSize: 3,
            fadeSpeed: 0.03,
            colors: ['rgba(79, 172, 254, 0.6)', 'rgba(0, 242, 254, 0.6)', 'rgba(147, 112, 219, 0.5)']
        };
    }

    async init() {
        // Load settings
        const stored = await window.storageManager.get('cursorTrailEnabled');
        this.isVisible = stored.cursorTrailEnabled !== false; // Default to true

        this.createCanvas();

        if (this.isVisible) {
            this.start();
        }
    }

    createCanvas() {
        this.canvas = document.getElementById('cursor-trail-canvas');
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'cursor-trail-canvas';
            document.body.appendChild(this.canvas);
        }

        this.ctx = this.canvas.getContext('2d');
        this.resize();

        // Event listeners
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    onMouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;

        if (this.isRunning) {
            this.addParticle();
        }
    }

    addParticle() {
        const color = this.config.colors[Math.floor(Math.random() * this.config.colors.length)];

        this.particles.push({
            x: this.mouse.x,
            y: this.mouse.y,
            size: this.config.particleSize + Math.random() * 2,
            color: color,
            alpha: 0.8,
            vx: (Math.random() - 0.5) * 1,
            vy: (Math.random() - 0.5) * 1
        });

        // Limit particle count
        if (this.particles.length > this.config.trailLength) {
            this.particles.shift();
        }
    }

    update() {
        this.particles.forEach((p, index) => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= this.config.fadeSpeed;
            p.size *= 0.98;

            if (p.alpha <= 0) {
                this.particles.splice(index, 1);
            }
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach((p) => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha})`);
            this.ctx.fill();

            // Add glow effect
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 10;
        });

        // Reset shadow
        this.ctx.shadowBlur = 0;
    }

    tick() {
        if (!this.isRunning) return;

        this.update();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.tick());
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.canvas.style.display = 'block';
        this.tick();
    }

    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.particles = [];
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.canvas) {
            this.canvas.style.display = 'none';
        }
    }

    async toggle(enabled) {
        await window.storageManager.set({
            cursorTrailEnabled: enabled
        });
        if (enabled) {
            this.start();
        } else {
            this.stop();
        }
    }
}

// Export for use in newtab.js
window.CursorTrail = CursorTrail;