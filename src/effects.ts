import * as PIXI from 'pixi.js';
import { PIXEL_FONT } from './theme';

interface Effect {
    obj: PIXI.Container;
    age: number;
    life: number;
    tick: (t: number, dt: number) => void;
}

export function createGlowTexture(size: number = 64): PIXI.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const half = size / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    }
    return PIXI.Texture.from(canvas);
}

export function pixelText(text: string, size: number, color: number, strokeWidth: number = 4): PIXI.Text {
    const label = new PIXI.Text({
        text,
        style: {
            fontFamily: PIXEL_FONT,
            fontSize: size,
            fill: color,
            align: 'center',
            letterSpacing: 1,
            stroke: { color: 0x07011a, width: strokeWidth, join: 'round' },
            dropShadow: { color, blur: 10, distance: 0, alpha: 0.8, angle: 0 },
        },
    });
    label.anchor.set(0.5);
    return label;
}

export class Effects {
    private effects: Effect[] = [];
    private banner: Effect | null = null;
    private shakeAmount = 0;
    private width = 800;
    private height = 600;
    private scale = 1;
    private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    constructor(private readonly layer: PIXI.Container, private readonly shakeTarget: PIXI.Container) {}

    public setSize(width: number, height: number, scale: number): void {
        this.width = width;
        this.height = height;
        this.scale = scale;
    }

    public burst(x: number, y: number, color: number, count: number = 14): void {
        for (let i = 0; i < count; i++) {
            const size = Math.max(2, Math.round((2 + Math.random() * 3) * this.scale));
            const particle = new PIXI.Graphics().rect(-size / 2, -size / 2, size, size).fill(i % 4 === 0 ? 0xffffff : color);
            particle.position.set(x + (Math.random() - 0.5) * 20 * this.scale, y);
            const vx = (Math.random() - 0.5) * 7 * this.scale;
            let vy = (-Math.random() * 5 - 1) * this.scale;
            const spin = (Math.random() - 0.5) * 0.3;
            const gravity = 0.25 * this.scale;

            this.add(particle, 38 + Math.random() * 24, (t, dt) => {
                vy += gravity * dt;
                particle.x += vx * dt;
                particle.y += vy * dt;
                particle.rotation += spin * dt;
                particle.alpha = 1 - t;
            });
        }
    }

    public sparks(x: number, y: number, color: number, count: number = 6): void {
        for (let i = 0; i < count; i++) {
            const length = (4 + Math.random() * 6) * this.scale;
            const angle = Math.random() * Math.PI * 2;
            const speed = (1.5 + Math.random() * 3) * this.scale;
            const spark = new PIXI.Graphics()
                .moveTo(0, 0)
                .lineTo(length, 0)
                .stroke({ color: i % 2 ? 0xffffff : color, width: Math.max(1, 1.5 * this.scale) });
            spark.position.set(x, y);
            spark.rotation = angle;

            this.add(spark, 16 + Math.random() * 10, (t, dt) => {
                spark.x += Math.cos(angle) * speed * dt;
                spark.y += Math.sin(angle) * speed * dt;
                spark.alpha = 1 - t;
            });
        }
    }

    public flashRect(x: number, y: number, width: number, height: number, color: number = 0xffffff): void {
        const rect = new PIXI.Graphics().rect(0, 0, width, height).fill(color);
        rect.position.set(x, y);
        this.add(rect, 10, t => {
            rect.alpha = 0.9 * (1 - t);
        });
    }

    public ring(x: number, y: number, color: number, maxRadius: number = 80): void {
        const ring = new PIXI.Graphics();
        ring.position.set(x, y);
        const radius = maxRadius * this.scale;
        this.add(ring, 30, t => {
            const eased = 1 - Math.pow(1 - t, 3);
            ring.clear()
                .circle(0, 0, Math.max(1, radius * eased))
                .stroke({ color, width: Math.max(1, 5 * (1 - t) * this.scale), alpha: 1 - t });
        });
    }

    public floatText(x: number, y: number, text: string, color: number, size: number = 10): void {
        const label = pixelText(text, Math.max(7, Math.round(size * this.scale)), color, 3);
        label.position.set(x, y);
        const rise = 0.7 * this.scale;
        this.add(label, 55, (t, dt) => {
            label.y -= rise * dt;
            label.scale.set(t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1);
            label.alpha = t < 0.65 ? 1 : (1 - t) / 0.35;
        });
    }

    public showBanner(title: string, subtitle: string, color: number, y: number = this.height * 0.45): void {
        if (this.banner) {
            this.banner.age = this.banner.life;
        }

        const container = new PIXI.Container();
        container.position.set(this.width / 2, y);

        const heading = pixelText(title, Math.max(14, Math.round(26 * this.scale)), color, 6);
        container.addChild(heading);

        if (subtitle) {
            const caption = pixelText(subtitle, Math.max(8, Math.round(11 * this.scale)), 0xffffff, 4);
            caption.y = heading.height * 0.5 + caption.height * 0.9;
            container.addChild(caption);
        }

        this.banner = this.add(container, 110, t => {
            if (t < 0.12) {
                const p = t / 0.12;
                container.scale.set(1.8 - p * 0.8);
                container.alpha = p;
            } else if (t > 0.8) {
                container.alpha = (1 - t) / 0.2;
                container.scale.set(1 + (t - 0.8) * 0.4);
            } else {
                container.scale.set(1);
                container.alpha = 1;
            }
        });
    }

    public flash(color: number, alpha: number = 0.35): void {
        const overlay = new PIXI.Graphics().rect(0, 0, this.width, this.height).fill(color);
        overlay.blendMode = 'add';
        this.add(overlay, 24, t => {
            overlay.alpha = alpha * (1 - t);
        });
    }

    public bolt(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
        const points: PIXI.PointData[] = [{ x: fromX, y: fromY }];
        const segments = 10;
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            points.push({
                x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 34 * this.scale,
                y: fromY + (toY - fromY) * t,
            });
        }
        points.push({ x: toX, y: toY });

        const bolt = new PIXI.Graphics();
        bolt.poly(points, false).stroke({ color, width: 10 * this.scale, alpha: 0.3, join: 'round' });
        bolt.poly(points, false).stroke({ color: 0xffffff, width: Math.max(1.5, 2.5 * this.scale), join: 'round' });
        bolt.blendMode = 'add';

        this.add(bolt, 22, t => {
            bolt.alpha = (1 - t) * (Math.random() > 0.25 ? 1 : 0.35);
        });
    }

    public shake(amount: number): void {
        if (this.reducedMotion) return;
        this.shakeAmount = Math.max(this.shakeAmount, amount * this.scale);
    }

    public update(dt: number): void {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.age += dt;
            effect.tick(Math.min(1, effect.age / effect.life), dt);
            if (effect.age >= effect.life) {
                this.remove(i);
            }
        }

        if (this.shakeAmount > 0.2) {
            this.shakeTarget.position.set(
                (Math.random() - 0.5) * 2 * this.shakeAmount,
                (Math.random() - 0.5) * 2 * this.shakeAmount,
            );
            this.shakeAmount *= Math.pow(0.86, dt);
        } else {
            this.shakeAmount = 0;
            this.shakeTarget.position.set(0, 0);
        }
    }

    public clear(): void {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.remove(i);
        }
        this.shakeAmount = 0;
        this.shakeTarget.position.set(0, 0);
    }

    private add(obj: PIXI.Container, life: number, tick: (t: number, dt: number) => void): Effect {
        const effect: Effect = { obj, age: 0, life, tick };
        tick(0, 0);
        this.layer.addChild(obj);
        this.effects.push(effect);
        return effect;
    }

    private remove(index: number): void {
        const [effect] = this.effects.splice(index, 1);
        if (effect === this.banner) this.banner = null;
        effect.obj.destroy({ children: true });
    }
}
