import * as PIXI from 'pixi.js';
import { pixelText } from './effects';

export type BossStyle = 'saucer' | 'mothership';

export interface BossConfig {
    name: string;
    title: string;
    hp: number;
    color: number;
    accent: number;
    width: number;
    height: number;
    speed: number;
    fireEvery: number;
    shotSpeed: number;
    shotRadius: number;
    spread: number;
    aimed: boolean;
    style: BossStyle;
    reward: number;
}

export const BOSS_LEVELS: Record<number, BossConfig> = {
    15: {
        name: 'XENO SAUCER',
        title: 'Mid-boss',
        hp: 24,
        color: 0x3df5a7,
        accent: 0x05d9e8,
        width: 190,
        height: 60,
        speed: 0.012,
        fireEvery: 115,
        shotSpeed: 3,
        shotRadius: 5,
        spread: 1,
        aimed: false,
        style: 'saucer',
        reward: 5000,
    },
    30: {
        name: 'MOTHERSHIP OMEGA',
        title: 'Final boss',
        hp: 40,
        color: 0xb5179e,
        accent: 0xffd319,
        width: 280,
        height: 84,
        speed: 0.016,
        fireEvery: 90,
        shotSpeed: 3.6,
        shotRadius: 6.5,
        spread: 3,
        aimed: true,
        style: 'mothership',
        reward: 10000,
    },
};

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BossHitResult {
    defeated: boolean;
    enraged: boolean;
}

interface Shot {
    x: number;
    y: number;
    vx: number;
    vy: number;
    phase: number;
}

const RED = 0xff3b3b;
const BLOOD = 0xff1a1a;
const HULL = 0x0b0322;
const CHARGE_FRAMES = 36;

export class Boss {
    public readonly config: BossConfig;
    public hp: number;
    public x: number;
    public y: number;
    public readonly width: number;
    public readonly height: number;
    private readonly root: PIXI.Container;
    private readonly ship: PIXI.Container;
    private readonly aura: PIXI.Sprite;
    private readonly charge: PIXI.Sprite;
    private readonly hull: PIXI.Graphics;
    private readonly eye: PIXI.Graphics;
    private readonly lights: PIXI.Graphics;
    private readonly shotsGfx: PIXI.Graphics;
    private readonly hud: PIXI.Container;
    private readonly hpBar: PIXI.Graphics;
    private shots: Shot[] = [];
    private viewWidth: number;
    private viewHeight: number;
    private readonly scale: number;
    private time = 0;
    private fireClock: number;
    private flash = 0;
    private entrance = 0;
    private wasEnraged = false;
    private dying = false;

    constructor(config: BossConfig, layer: PIXI.Container, glowTexture: PIXI.Texture, viewWidth: number, viewHeight: number, scale: number) {
        this.config = config;
        this.hp = config.hp;
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
        this.scale = scale;
        this.width = config.width * scale;
        this.height = config.height * scale;
        this.x = viewWidth / 2;
        this.y = -this.height;
        this.fireClock = config.fireEvery;

        this.root = new PIXI.Container();
        this.ship = new PIXI.Container();
        this.aura = this.glowSprite(glowTexture, config.color, this.width * 1.7, this.height * 2.6);
        this.charge = this.glowSprite(glowTexture, RED, this.width * 0.55, this.height * 1.1);
        this.charge.y = this.height * 0.4;
        this.charge.alpha = 0;
        this.hull = new PIXI.Graphics();
        this.eye = new PIXI.Graphics();
        this.lights = new PIXI.Graphics();
        this.lights.blendMode = 'add';
        this.shotsGfx = new PIXI.Graphics();
        this.shotsGfx.blendMode = 'add';
        this.ship.addChild(this.aura, this.charge, this.hull, this.eye, this.lights);

        this.hud = new PIXI.Container();
        this.hpBar = new PIXI.Graphics();
        const label = pixelText(config.name, Math.max(7, Math.round(9 * scale)), config.color, 3);
        label.y = -Math.max(8, 10 * scale);
        this.hud.addChild(label, this.hpBar);
        this.hud.position.set(viewWidth / 2, Math.max(22, 26 * scale));

        this.root.addChild(this.ship, this.shotsGfx, this.hud);
        layer.addChild(this.root);
        this.redrawHull();
        this.drawHpBar();
    }

    public get defeated(): boolean {
        return this.hp <= 0;
    }

    public get enraged(): boolean {
        return this.hp <= this.config.hp / 2;
    }

    public hitbox(): Rect {
        return { x: this.x - this.width / 2, y: this.y - this.height / 2, width: this.width, height: this.height };
    }

    public setView(viewWidth: number, viewHeight: number): void {
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
        this.hud.position.set(viewWidth / 2, Math.max(22, 26 * this.scale));
        this.drawHpBar();
    }

    public hit(damage: number): BossHitResult {
        if (this.defeated) return { defeated: true, enraged: false };
        this.hp = Math.max(0, this.hp - damage);
        this.flash = 1;

        const enragedNow = this.enraged && !this.wasEnraged;
        this.wasEnraged = this.enraged;
        if (enragedNow) this.redrawHull();
        if (this.defeated) this.dying = true;
        this.drawHpBar();
        return { defeated: this.defeated, enraged: enragedNow };
    }

    public update(dt: number, targetX: number, firing: boolean): boolean {
        this.time += dt;

        if (this.dying) {
            this.root.alpha = Math.max(0, this.root.alpha - 0.02 * dt);
            this.ship.rotation = Math.sin(this.time * 0.6) * 0.05;
            this.ship.y += 0.6 * dt;
            this.shots = [];
            this.drawShots();
            return false;
        }

        const restY = this.viewHeight * 0.24;
        this.entrance = Math.min(1, this.entrance + dt / 90);
        const eased = 1 - Math.pow(1 - this.entrance, 3);
        this.y = -this.height + (restY + this.height) * eased;

        const angry = this.enraged;
        const pace = angry ? 1.45 : 1;
        const range = this.viewWidth / 2 - this.width / 2 - 8 * this.scale;
        this.x = this.viewWidth / 2 + Math.sin(this.time * this.config.speed * pace) * range;

        const shake = angry ? 2.5 * this.scale : 0;
        this.ship.position.set(
            this.x + (Math.random() - 0.5) * shake,
            this.y + Math.sin(this.time * 0.05) * 4 * this.scale + (Math.random() - 0.5) * shake,
        );
        this.ship.rotation = angry ? Math.sin(this.time * 0.35) * 0.025 : 0;

        this.aura.tint = angry ? RED : this.config.color;
        this.aura.alpha = angry ? 0.5 + 0.3 * Math.sin(this.time * 0.3) : 0.16 + 0.06 * Math.sin(this.time * 0.08);
        this.aura.scale.set(this.aura.scale.x, this.aura.scale.y);

        let fired = false;
        if (firing && this.entrance >= 1) {
            this.fireClock -= dt;
            this.charge.alpha = this.fireClock < CHARGE_FRAMES ? 0.95 * (1 - this.fireClock / CHARGE_FRAMES) : 0;
            if (this.fireClock <= 0) {
                this.fire(targetX);
                this.fireClock = this.config.fireEvery * (angry ? 0.62 : 1);
                fired = true;
            }
        } else {
            this.charge.alpha = 0;
        }

        const wobble = this.config.style === 'saucer' ? 0.9 * this.scale : 0;
        for (const shot of this.shots) {
            shot.phase += 0.12 * dt;
            shot.x += (shot.vx + Math.cos(shot.phase) * wobble) * dt;
            shot.y += shot.vy * dt;
        }
        this.shots = this.shots.filter(shot => shot.y < this.viewHeight + 20 && shot.x > -20 && shot.x < this.viewWidth + 20);

        this.flash = Math.max(0, this.flash - 0.08 * dt);
        this.hull.alpha = this.flash > 0 && Math.floor(this.time / 3) % 2 === 0 ? 0.55 : 1;

        this.drawEye(targetX);
        this.drawLights();
        this.drawShots();
        return fired;
    }

    public randomPoint(): PIXI.PointData {
        const box = this.hitbox();
        return { x: box.x + Math.random() * box.width, y: box.y + Math.random() * box.height };
    }

    public takeShotHitting(rect: Rect): boolean {
        const radius = this.shotRadius();
        const index = this.shots.findIndex(
            shot =>
                shot.x + radius >= rect.x &&
                shot.x - radius <= rect.x + rect.width &&
                shot.y + radius >= rect.y &&
                shot.y - radius <= rect.y + rect.height,
        );
        if (index < 0) return false;
        this.shots.splice(index, 1);
        return true;
    }

    public clearShots(): void {
        this.shots = [];
        this.drawShots();
    }

    public destroy(): void {
        this.root.destroy({ children: true });
    }

    private glowSprite(texture: PIXI.Texture, tint: number, width: number, height: number): PIXI.Sprite {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.blendMode = 'add';
        sprite.tint = tint;
        sprite.width = width;
        sprite.height = height;
        return sprite;
    }

    private shotRadius(): number {
        return this.config.shotRadius * this.scale * (this.enraged ? 1.2 : 1);
    }

    private fire(targetX: number): void {
        const speed = this.config.shotSpeed * (this.enraged ? 1.2 : 1) * this.scale;
        const originY = this.y + this.height * 0.45;
        const base = this.config.aimed ? Math.atan2(targetX - this.x, this.viewHeight - originY) : 0;
        const count = this.config.spread + (this.enraged ? 2 : 0);
        const fan = 0.28;

        for (let i = 0; i < count; i++) {
            const angle = base + (i - (count - 1) / 2) * fan;
            this.shots.push({ x: this.x, y: originY, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, phase: Math.random() * Math.PI * 2 });
        }
    }

    private redrawHull(): void {
        this.hull.clear();
        if (this.config.style === 'saucer') {
            this.drawSaucer(this.enraged);
        } else {
            this.drawMothership(this.enraged);
        }
    }

    private drawSaucer(angry: boolean): void {
        const g = this.hull;
        const { width: w, height: h, scale: s, config } = this;
        const line = Math.max(1.5, 3 * s);
        const trim = angry ? RED : config.color;
        const glass = angry ? 0xff6b6b : config.accent;

        if (angry) {
            for (let i = 0; i <= 8; i++) {
                const x = (i / 8 - 0.5) * w * 0.9;
                g.poly([x - w * 0.03, h * 0.12, x + w * 0.03, h * 0.12, x, h * 0.45]).fill(trim);
            }
            for (const side of [-1, 1]) {
                g.poly([side * w * 0.46, -h * 0.05, side * w * 0.62, -h * 0.2, side * w * 0.48, h * 0.1]).fill(trim);
            }
        }

        g.ellipse(0, -h * 0.3, w * 0.22, h * 0.5)
            .fill({ color: glass, alpha: angry ? 0.3 : 0.16 })
            .ellipse(0, -h * 0.3, w * 0.22, h * 0.5)
            .stroke({ color: glass, width: line * 0.7, alpha: 0.9 });

        const skin = angry ? 0x1f6b3f : config.color;
        g.ellipse(0, -h * 0.36, w * 0.07, h * 0.23).fill(skin);
        if (angry) {
            for (const side of [-1, 1]) {
                g.poly([side * w * 0.054, -h * 0.47, side * w * 0.01, -h * 0.4, side * w * 0.05, -h * 0.36]).fill(BLOOD);
                g.moveTo(side * w * 0.064, -h * 0.53)
                    .lineTo(side * w * 0.008, -h * 0.44)
                    .stroke({ color: 0x07011a, width: Math.max(1.5, 2.5 * s) });
            }
            const teeth: number[] = [];
            for (let i = 0; i <= 6; i++) {
                teeth.push(-w * 0.04 + (w * 0.08 * i) / 6, -h * (i % 2 === 0 ? 0.27 : 0.22));
            }
            g.poly([-w * 0.04, -h * 0.29, w * 0.04, -h * 0.29, w * 0.04, -h * 0.2, -w * 0.04, -h * 0.2]).fill(0x07011a);
            g.poly(teeth, false).stroke({ color: 0xffffff, width: Math.max(1, 1.5 * s) });
        } else {
            for (const side of [-1, 1]) {
                g.ellipse(side * w * 0.028, -h * 0.4, w * 0.02, h * 0.07).fill(0x07011a);
            }
        }

        g.ellipse(0, 0, w / 2, h * 0.3)
            .fill(HULL)
            .ellipse(0, 0, w / 2, h * 0.3)
            .stroke({ color: trim, width: line })
            .ellipse(0, -h * 0.05, w * 0.36, h * 0.11)
            .stroke({ color: trim, width: line * 0.5, alpha: 0.6 })
            .ellipse(0, h * 0.24, w * 0.18, h * 0.11)
            .fill({ color: trim, alpha: angry ? 0.7 : 0.35 })
            .ellipse(0, h * 0.24, w * 0.18, h * 0.11)
            .stroke({ color: trim, width: line * 0.5 });

        if (angry) {
            this.drawCracks([
                [-w * 0.3, -h * 0.1, -w * 0.24, h * 0.02, -w * 0.28, h * 0.12],
                [w * 0.18, -h * 0.12, w * 0.24, 0, w * 0.2, h * 0.1],
            ]);
        }
    }

    private drawMothership(angry: boolean): void {
        const g = this.hull;
        const { width: w, height: h, scale: s, config } = this;
        const line = Math.max(1.5, 3 * s);
        const trim = angry ? RED : config.color;
        const gold = angry ? 0xff7a18 : config.accent;
        const hornReach = angry ? 0.12 : 0.06;
        const hornHeight = angry ? 1.05 : 0.78;

        for (const side of [-1, 1]) {
            const horn = [side * w * 0.42, -h * 0.1, side * w * (0.5 + hornReach), -h * hornHeight, side * w * 0.34, -h * 0.3];
            g.poly(horn).fill(HULL).poly(horn).stroke({ color: trim, width: line * 0.8 });
        }

        const deck = [-w * 0.22, -h * 0.32, -w * 0.15, -h * 0.58, w * 0.15, -h * 0.58, w * 0.22, -h * 0.32];
        g.poly(deck).fill(HULL).poly(deck).stroke({ color: gold, width: line * 0.7 });
        for (const offset of [-0.09, 0, 0.09]) {
            const spike = [w * offset - w * 0.02, -h * 0.58, w * offset, -h * (angry ? 0.86 : 0.74), w * offset + w * 0.02, -h * 0.58];
            g.poly(spike).fill(gold);
        }

        for (const offset of [-0.3, 0, 0.3]) {
            const x = w * offset;
            const claw = [x - w * 0.035, h * 0.22, x + w * 0.035, h * 0.22, x + w * 0.014, h * 0.5, x, h * (angry ? 0.68 : 0.58), x - w * 0.014, h * 0.5];
            g.poly(claw).fill(HULL).poly(claw).stroke({ color: trim, width: line * 0.6 });
        }

        const hull = [-w / 2, 0, -w * 0.38, -h * 0.32, w * 0.38, -h * 0.32, w / 2, 0, w * 0.38, h * 0.28, -w * 0.38, h * 0.28];
        g.poly(hull).fill(HULL).poly(hull).stroke({ color: trim, width: line });
        g.moveTo(-w * 0.44, 0).lineTo(-w * 0.26, 0).stroke({ color: trim, width: line * 0.4, alpha: 0.5 });
        g.moveTo(w * 0.26, 0).lineTo(w * 0.44, 0).stroke({ color: trim, width: line * 0.4, alpha: 0.5 });
        for (const side of [-1, 1]) {
            g.moveTo(side * w * 0.3, -h * 0.3).lineTo(side * w * 0.22, h * 0.26).stroke({ color: trim, width: line * 0.35, alpha: 0.45 });
        }

        const fangs = 11;
        for (let i = 0; i < fangs; i++) {
            const x = (i / (fangs - 1) - 0.5) * w * 0.66;
            const length = h * (i % 2 === 0 ? 0.14 : 0.09) * (angry ? 1.4 : 1);
            g.poly([x - w * 0.016, h * 0.27, x + w * 0.016, h * 0.27, x, h * 0.27 + length]).fill({
                color: angry ? BLOOD : 0xe8e0ff,
                alpha: 0.95,
            });
        }

        if (angry) {
            for (const side of [-1, 1]) {
                for (const t of [0.2, 0.55, 0.85]) {
                    const x = side * w * (0.38 + 0.12 * t);
                    const y = -h * 0.32 * (1 - t);
                    g.poly([x, y - h * 0.04, x + side * w * 0.06, y - h * 0.1, x, y + h * 0.06]).fill(trim);
                }
            }
            this.drawCracks([
                [-w * 0.34, -h * 0.2, -w * 0.28, -h * 0.05, -w * 0.33, h * 0.08, -w * 0.27, h * 0.2],
                [w * 0.3, -h * 0.25, w * 0.35, -h * 0.08, w * 0.29, h * 0.05],
                [-w * 0.1, -h * 0.5, -w * 0.06, -h * 0.4, -w * 0.11, -h * 0.34],
            ]);
        }
    }

    private drawCracks(paths: number[][]): void {
        for (const path of paths) {
            this.hull.poly(path, false).stroke({ color: 0xffb36b, width: Math.max(1, 1.6 * this.scale), alpha: 0.95 });
        }
    }

    private drawEye(targetX: number): void {
        const g = this.eye;
        g.clear();
        if (this.config.style !== 'mothership') return;

        const angry = this.enraged;
        const radius = this.height * 0.22;
        const cy = -this.height * 0.04;
        const twitch = angry ? (Math.random() - 0.5) * 0.25 : 0;
        const look = Math.max(-1, Math.min(1, (targetX - this.x) / (this.viewWidth / 2) + twitch));
        const irisX = look * radius * 0.42;
        const gold = angry ? 0xff7a18 : this.config.accent;

        if (angry) {
            g.circle(0, cy, radius * 1.45).fill({ color: RED, alpha: 0.22 + 0.12 * Math.sin(this.time * 0.4) });
        }
        g.circle(0, cy, radius).fill(angry ? 0x3a0000 : 0x1a0a12);
        if (angry) {
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + 0.3;
                const bend = angle + 0.25;
                g.poly(
                    [
                        Math.cos(angle) * radius * 0.95,
                        cy + Math.sin(angle) * radius * 0.95,
                        Math.cos(bend) * radius * 0.7,
                        cy + Math.sin(bend) * radius * 0.7,
                        Math.cos(angle) * radius * 0.5,
                        cy + Math.sin(angle) * radius * 0.5,
                    ],
                    false,
                ).stroke({ color: BLOOD, width: Math.max(1, 1.2 * this.scale), alpha: 0.85 });
            }
        }
        g.circle(0, cy, radius).stroke({ color: gold, width: Math.max(1.5, 2.5 * this.scale) });
        g.circle(irisX, cy + radius * 0.1, radius * (angry ? 0.66 : 0.55)).fill(angry ? BLOOD : 0xff6a00);
        g.ellipse(irisX, cy + radius * 0.1, radius * (angry ? 0.07 : 0.13), radius * (angry ? 0.58 : 0.46)).fill(0x000000);
        g.circle(irisX - radius * 0.2, cy - radius * 0.15, radius * 0.1).fill({ color: 0xffffff, alpha: 0.85 });
    }

    private drawLights(): void {
        const g = this.lights;
        g.clear();
        const angry = this.enraged;
        const count = this.config.style === 'saucer' ? 7 : 9;
        const chase = Math.floor(this.time * (angry ? 0.6 : 0.25)) % count;
        const color = angry ? RED : this.config.accent;
        for (let i = 0; i < count; i++) {
            const x = (i / (count - 1) - 0.5) * this.width * 0.78;
            const bright = i === chase || (angry && i % 2 === chase % 2);
            g.circle(x, this.height * 0.06, Math.max(1.5, 3 * this.scale)).fill({ color, alpha: bright ? 1 : 0.3 });
        }
    }

    private drawShots(): void {
        this.shotsGfx.clear();
        const radius = this.shotRadius();
        for (const shot of this.shots) {
            if (this.config.style === 'saucer') {
                this.drawPlasmaOrb(shot, radius);
            } else {
                this.drawLaserBolt(shot, radius);
            }
        }
    }

    private drawPlasmaOrb(shot: Shot, radius: number): void {
        const g = this.shotsGfx;
        const color = this.enraged ? RED : 0x9dff3c;
        const pulse = 1 + Math.sin(shot.phase * 2) * 0.15;
        const ring = radius * 1.5 * pulse;

        g.circle(shot.x, shot.y, radius * 2.6).fill({ color, alpha: 0.18 });
        g.circle(shot.x, shot.y, ring).stroke({ color, width: Math.max(1.5, radius * 0.35), alpha: 0.9 });
        for (let i = 0; i < 3; i++) {
            const angle = shot.phase * 1.6 + (i / 3) * Math.PI * 2;
            g.circle(shot.x + Math.cos(angle) * ring, shot.y + Math.sin(angle) * ring, radius * 0.32).fill({ color: 0xffffff, alpha: 0.9 });
        }
        g.circle(shot.x, shot.y, radius * 0.8).fill({ color, alpha: 0.95 });
        g.circle(shot.x, shot.y, radius * 0.4).fill({ color: 0xffffff, alpha: 1 });
    }

    private drawLaserBolt(shot: Shot, radius: number): void {
        const g = this.shotsGfx;
        const angry = this.enraged;
        const color = angry ? BLOOD : 0xff2bd6;
        const speed = Math.hypot(shot.vx, shot.vy) || 1;
        const length = radius * (angry ? 7 : 5.5);
        const tailX = shot.x - (shot.vx / speed) * length;
        const tailY = shot.y - (shot.vy / speed) * length;
        const flicker = 0.85 + Math.random() * 0.15;

        g.moveTo(tailX, tailY).lineTo(shot.x, shot.y).stroke({ color, width: radius * 2.6, alpha: 0.22 * flicker, cap: 'round' });
        g.moveTo(tailX, tailY).lineTo(shot.x, shot.y).stroke({ color, width: radius * 1.3, alpha: 0.9 * flicker, cap: 'round' });
        g.moveTo((tailX + shot.x) / 2, (tailY + shot.y) / 2).lineTo(shot.x, shot.y).stroke({ color: 0xffffff, width: radius * 0.5, cap: 'round' });
        g.circle(shot.x, shot.y, radius * 0.9).fill({ color: 0xffffff, alpha: 1 });
        g.circle(shot.x, shot.y, radius * 1.8).fill({ color, alpha: 0.3 });
    }

    private drawHpBar(): void {
        const width = this.viewWidth * 0.5;
        const height = Math.max(5, 8 * this.scale);
        const ratio = this.hp / this.config.hp;
        const color = this.enraged ? RED : this.config.color;
        this.hpBar
            .clear()
            .roundRect(-width / 2, 0, width, height, height / 2)
            .fill({ color: 0xffffff, alpha: 0.1 })
            .roundRect(-width / 2, 0, Math.max(0, width * ratio), height, height / 2)
            .fill(color)
            .roundRect(-width / 2, 0, width, height, height / 2)
            .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    }
}
