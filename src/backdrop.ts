import * as PIXI from 'pixi.js';
import { Palette } from './theme';
import { SIGN_COUNT, signTexture } from './signs';

interface Star {
    x: number;
    y: number;
    size: number;
    phase: number;
    speed: number;
}

type PropKind = 'building' | 'lamp' | 'palm' | 'pylon' | 'post' | 'billboard';
type ZoneName = 'city' | 'coast' | 'bridge' | 'boulevard' | 'open';

interface Prop {
    t: number;
    side: -1 | 1;
    kind: PropKind;
    seed: number;
    color: number;
    billboard: number;
}

interface Building extends Prop {
    width: number;
    height: number;
    cols: number;
    rows: number;
    lit: number[];
    sign: number | null;
}

interface Spawner {
    kind: PropKind;
    every: number;
    side: 'alternate' | 'both' | 'random';
}

const ZONES: Record<ZoneName, Spawner[]> = {
    city: [
        { kind: 'building', every: 0.024, side: 'alternate' },
        { kind: 'lamp', every: 0.09, side: 'alternate' },
    ],
    coast: [
        { kind: 'palm', every: 0.045, side: 'random' },
        { kind: 'lamp', every: 0.16, side: 'alternate' },
    ],
    bridge: [
        { kind: 'post', every: 0.014, side: 'both' },
        { kind: 'pylon', every: 0.17, side: 'both' },
    ],
    boulevard: [
        { kind: 'billboard', every: 0.1, side: 'alternate' },
        { kind: 'palm', every: 0.05, side: 'alternate' },
    ],
    open: [{ kind: 'lamp', every: 0.12, side: 'alternate' }],
};

const ZONE_NAMES = Object.keys(ZONES) as ZoneName[];

const PROP_OFFSET: Record<PropKind, number> = {
    building: 0.1,
    lamp: 0.03,
    palm: 0.03,
    pylon: 0.02,
    post: 0.004,
    billboard: 0.06,
};

interface Car {
    t: number;
    lane: -1 | 1;
    pace: number;
    color: number;
}

interface ShootingStar {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
}

const HORIZON_RATIO = 0.6;
const ROAD_HALF_WIDTH = 0.3;
const LANE_DASHES = 9;
const DEPTH_SPEED = 0.0035;
const PREWARM_FRAMES = 700;

export class Backdrop extends PIXI.Container {
    private palette: Palette;
    private readonly sky: PIXI.Sprite;
    private readonly stars: PIXI.Graphics;
    private readonly glow: PIXI.Graphics;
    private readonly scenery: PIXI.Graphics;
    private readonly signLayer: PIXI.Container;
    private readonly signSprites = new Map<Prop, PIXI.Sprite>();
    private signDeck: number[] = [];
    private starField: Star[] = [];
    private props: Prop[] = [];
    private zone: ZoneName = 'city';
    private recentZones: ZoneName[] = [];
    private zoneTimeLeft = 0;
    private spawnClocks: number[] = [];
    private alternateSide: Partial<Record<PropKind, -1 | 1>> = {};
    private shootingStar: ShootingStar | null = null;
    private cars: Car[] = [];
    private carCooldown = 240;
    private viewWidth = 0;
    private viewHeight = 0;
    private time = 0;
    private scroll = 0;

    constructor(palette: Palette) {
        super();
        this.palette = palette;
        this.sky = new PIXI.Sprite();
        this.stars = new PIXI.Graphics();
        this.scenery = new PIXI.Graphics();
        this.glow = new PIXI.Graphics();
        this.glow.blendMode = 'add';
        this.signLayer = new PIXI.Container();
        this.addChild(this.sky, this.stars, this.scenery, this.signLayer, this.glow);
    }

    private get horizonY(): number {
        return Math.round(this.viewHeight * HORIZON_RATIO);
    }

    private get moonX(): number {
        return this.viewWidth * 0.84;
    }

    public setPalette(palette: Palette): void {
        this.palette = palette;
        this.paintStatic();
    }

    public resize(width: number, height: number): void {
        this.viewWidth = width;
        this.viewHeight = height;
        this.seedStars();
        this.prewarmProps();
        this.paintStatic();
    }

    public update(dt: number): void {
        this.time += dt;
        this.scroll = (this.scroll + dt * 0.02) % 1;
        this.advanceProps(dt);

        this.scenery.clear();
        this.glow.clear();
        this.drawStars(dt);
        this.drawLaneDashes();
        this.updateCars(dt);
        this.drawCars();
        this.drawProps();
    }

    private depthToY(t: number): number {
        return this.horizonY + (this.viewHeight - this.horizonY) * t * t;
    }

    private roadHalfWidthAt(y: number): number {
        const progress = (y - this.horizonY) / (this.viewHeight - this.horizonY);
        return this.viewWidth * (0.012 + ROAD_HALF_WIDTH * progress);
    }

    private seedStars(): void {
        const count = Math.round((this.viewWidth * this.viewHeight) / 5000);
        this.starField = Array.from({ length: count }, () => ({
            x: Math.random() * this.viewWidth,
            y: Math.random() * this.horizonY * 0.92,
            size: Math.random() < 0.12 ? 2 : 1,
            phase: Math.random() * Math.PI * 2,
            speed: 0.02 + Math.random() * 0.05,
        }));
    }

    private prewarmProps(): void {
        this.props.forEach(prop => this.releaseSign(prop));
        this.props = [];
        this.recentZones = [];
        this.enterZone(ZONE_NAMES[Math.floor(Math.random() * ZONE_NAMES.length)]);
        for (let i = 0; i < PREWARM_FRAMES; i++) {
            this.advanceProps(1);
        }
    }

    private enterZone(zone: ZoneName): void {
        this.zone = zone;
        this.recentZones = [zone, ...this.recentZones].slice(0, 2);
        this.zoneTimeLeft = 600 + Math.random() * 900;
        this.spawnClocks = ZONES[zone].map(spawner => Math.random() * spawner.every);
    }

    private pickNextZone(): ZoneName {
        const options = ZONE_NAMES.filter(zone => !this.recentZones.includes(zone));
        return options[Math.floor(Math.random() * options.length)];
    }

    private advanceProps(dt: number): void {
        const step = dt * DEPTH_SPEED;
        for (const prop of this.props) {
            prop.t += step * (0.35 + prop.t);
        }
        this.props = this.props.filter(prop => {
            if (prop.t < 1.4) return true;
            this.releaseSign(prop);
            return false;
        });

        this.zoneTimeLeft -= dt;
        if (this.zoneTimeLeft <= 0) {
            this.enterZone(this.pickNextZone());
        }

        ZONES[this.zone].forEach((spawner, index) => {
            this.spawnClocks[index] += step * 0.35;
            if (this.spawnClocks[index] < spawner.every) return;
            this.spawnClocks[index] -= spawner.every;
            this.sidesFor(spawner).forEach(side => this.props.push(this.makeProp(spawner.kind, side)));
        });
    }

    private sidesFor(spawner: Spawner): (-1 | 1)[] {
        if (spawner.side === 'both') return [-1, 1];
        if (spawner.side === 'random') return [Math.random() < 0.5 ? -1 : 1];
        const next = this.alternateSide[spawner.kind] === 1 ? -1 : 1;
        this.alternateSide[spawner.kind] = next;
        return [next];
    }

    private makeProp(kind: PropKind, side: -1 | 1): Prop {
        const prop: Prop = {
            t: 0,
            side,
            kind,
            seed: Math.random(),
            color: Math.floor(Math.random() * 4),
            billboard: kind === 'billboard' ? this.nextSign() : 0,
        };
        if (kind !== 'building') return prop;

        const cols = 3 + Math.floor(Math.random() * 3);
        const rows = 5 + Math.floor(Math.random() * 7);
        const building: Building = {
            ...prop,
            width: 0.8 + Math.random() * 0.6,
            height: 0.55 + Math.random() * 0.9,
            cols,
            rows,
            lit: Array.from({ length: cols * rows }, () => (Math.random() < 0.38 ? Math.floor(Math.random() * 4) : -1)),
            sign: Math.random() < 0.4 ? Math.floor(Math.random() * 4) : null,
        };
        return building;
    }

    private edgePoint(t: number, side: -1 | 1, offset: number): { x: number; y: number; scale: number } {
        const y = this.depthToY(t);
        const scale = (y - this.horizonY) / (this.viewHeight - this.horizonY);
        const x = this.viewWidth / 2 + side * (this.roadHalfWidthAt(y) + this.viewWidth * offset * scale);
        return { x, y, scale };
    }

    private drawBuilding(building: Building): void {
        const front = this.edgePoint(building.t, building.side, PROP_OFFSET.building);
        if (front.scale <= 0.01) return;

        const p = this.palette;
        const g = this.scenery;
        const fade = Math.min(1, front.scale * 5);
        const width = this.viewWidth * 0.15 * front.scale * building.width;
        const height = this.viewHeight * 0.55 * front.scale * building.height;
        const top = front.y - height;
        const left = building.side === 1 ? front.x : front.x - width;

        const back = this.edgePoint(Math.max(0, building.t - 0.06), building.side, PROP_OFFSET.building);
        const backHeight = this.viewHeight * 0.55 * back.scale * building.height;
        const backTop = back.y - backHeight;
        const edge = parseInt(p.edge.slice(1), 16);

        g.poly([front.x, front.y, front.x, top, back.x, backTop, back.x, back.y]).fill({ color: p.buildingSide, alpha: fade });
        g.rect(left, top, width, height).fill({ color: p.building, alpha: fade });

        if (front.scale > 0.1) {
            const cellW = width / (building.cols * 2 + 1);
            const cellH = height / (building.rows * 2 + 1);
            for (let row = 0; row < building.rows; row++) {
                for (let col = 0; col < building.cols; col++) {
                    const colorIndex = building.lit[row * building.cols + col];
                    if (colorIndex < 0) continue;
                    g.rect(left + cellW * (1 + col * 2), top + cellH * (1 + row * 2), cellW, cellH * 0.8).fill({
                        color: p.windows[colorIndex % p.windows.length],
                        alpha: 0.6 * fade,
                    });
                }
            }
        }

        g.moveTo(left, top).lineTo(left + width, top).stroke({ color: edge, width: Math.max(1, 2 * front.scale), alpha: 0.85 * fade });
        g.moveTo(front.x, top).lineTo(back.x, backTop).stroke({ color: edge, width: Math.max(1, 1.5 * front.scale), alpha: 0.6 * fade });
        g.moveTo(front.x, top).lineTo(front.x, front.y).stroke({ color: edge, width: Math.max(0.5, front.scale), alpha: 0.35 * fade });

        if (building.sign !== null && front.scale > 0.08) {
            const color = p.signs[building.sign % p.signs.length];
            const signX = front.x + (back.x - front.x) * 0.3;
            const signTop = top + height * 0.12;
            const signHeight = height * 0.4;
            const signWidth = Math.max(2, 6 * front.scale);
            const flicker = Math.sin(this.time * 0.05 + building.seed * 40) > -0.9 ? 1 : 0.3;
            g.rect(signX - signWidth * 1.5, signTop - signWidth, signWidth * 3, signHeight + signWidth * 2).fill({ color, alpha: 0.18 * fade * flicker });
            g.rect(signX - signWidth / 2, signTop, signWidth, signHeight).fill({ color, alpha: 0.95 * fade * flicker });
        }
    }


    private paintStatic(): void {
        if (this.viewWidth === 0 || this.viewHeight === 0) return;

        const resolution = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(this.viewWidth * resolution);
        canvas.height = Math.ceil(this.viewHeight * resolution);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(resolution, resolution);

        this.paintSky(ctx);
        this.paintMoon(ctx);
        this.paintSea(ctx);
        this.paintRoad(ctx);

        const previous = this.sky.texture;
        this.sky.texture = new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: canvas, resolution }) });
        if (previous && previous !== PIXI.Texture.EMPTY) {
            previous.destroy(true);
        }
    }

    private paintSky(ctx: CanvasRenderingContext2D): void {
        const { viewWidth: w } = this;
        const horizon = this.horizonY;
        const p = this.palette;

        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, p.skyTop);
        sky.addColorStop(0.7, p.skyMid);
        sky.addColorStop(1, p.skyMid);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizon);

        ctx.globalAlpha = 0.1;
        for (const [cy, color, thickness] of [
            [horizon * 0.35, p.hazeA, horizon * 0.12],
            [horizon * 0.55, p.hazeB, horizon * 0.1],
        ] as [number, string, number][]) {
            const band = ctx.createLinearGradient(0, cy - thickness, 0, cy + thickness);
            band.addColorStop(0, 'rgba(0,0,0,0)');
            band.addColorStop(0.5, color);
            band.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = band;
            ctx.beginPath();
            ctx.moveTo(0, cy - thickness);
            ctx.bezierCurveTo(w * 0.3, cy - thickness * 2.2, w * 0.6, cy + thickness * 0.6, w, cy - thickness * 1.4);
            ctx.lineTo(w, cy + thickness * 1.4);
            ctx.bezierCurveTo(w * 0.6, cy + thickness * 2.4, w * 0.3, cy + thickness * 0.2, 0, cy + thickness);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const glow = ctx.createLinearGradient(0, horizon - horizon * 0.25, 0, horizon);
        glow.addColorStop(0, 'rgba(0,0,0,0)');
        glow.addColorStop(1, p.horizonGlow);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = glow;
        ctx.fillRect(0, horizon - horizon * 0.25, w, horizon * 0.25);
        ctx.globalAlpha = 1;
    }

    private paintMoon(ctx: CanvasRenderingContext2D): void {
        const p = this.palette;
        const cx = this.moonX;
        const cy = this.horizonY * 0.32;
        const r = Math.min(this.viewWidth, this.viewHeight) * 0.085;

        const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 3.2);
        halo.addColorStop(0, p.moon);
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = halo;
        ctx.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);
        ctx.globalAlpha = 1;

        const size = Math.ceil(r * 2 + 4);
        const crescent = document.createElement('canvas');
        crescent.width = size;
        crescent.height = size;
        const moon = crescent.getContext('2d');
        if (!moon) return;
        moon.fillStyle = p.moon;
        moon.beginPath();
        moon.arc(size / 2, size / 2, r, 0, Math.PI * 2);
        moon.fill();
        moon.globalCompositeOperation = 'destination-out';
        moon.beginPath();
        moon.arc(size / 2 - r * 0.42, size / 2 - r * 0.18, r * 0.9, 0, Math.PI * 2);
        moon.fill();

        ctx.shadowColor = p.moon;
        ctx.shadowBlur = 30;
        ctx.drawImage(crescent, cx - size / 2, cy - size / 2);
        ctx.shadowBlur = 0;
    }

    private paintSea(ctx: CanvasRenderingContext2D): void {
        const { viewWidth: w, viewHeight: h } = this;
        const horizon = this.horizonY;
        const p = this.palette;

        const sea = ctx.createLinearGradient(0, horizon, 0, h);
        sea.addColorStop(0, p.water);
        sea.addColorStop(1, '#000000');
        ctx.fillStyle = sea;
        ctx.fillRect(0, horizon, w, h - horizon);

        ctx.shadowColor = p.edge;
        ctx.shadowBlur = 16;
        ctx.fillStyle = p.edge;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, horizon - 1, w, 2);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    private paintRoad(ctx: CanvasRenderingContext2D): void {
        const { viewWidth: w, viewHeight: h } = this;
        const horizon = this.horizonY;
        const p = this.palette;
        const cx = w / 2;
        const top = this.roadHalfWidthAt(horizon);
        const bottom = this.roadHalfWidthAt(h);

        const asphalt = ctx.createLinearGradient(0, horizon, 0, h);
        asphalt.addColorStop(0, p.road);
        asphalt.addColorStop(1, '#000000');
        ctx.fillStyle = asphalt;
        ctx.beginPath();
        ctx.moveTo(cx - top, horizon);
        ctx.lineTo(cx + top, horizon);
        ctx.lineTo(cx + bottom, h);
        ctx.lineTo(cx - bottom, h);
        ctx.closePath();
        ctx.fill();

        ctx.shadowColor = p.edge;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = 2.5;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(cx + side * top, horizon);
            ctx.lineTo(cx + side * bottom, h);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    private drawStars(dt: number): void {
        const g = this.stars;
        g.clear();
        for (const star of this.starField) {
            const twinkle = 0.25 + 0.75 * Math.abs(Math.sin(this.time * star.speed + star.phase));
            g.rect(Math.round(star.x), Math.round(star.y), star.size, star.size).fill({ color: this.palette.star, alpha: twinkle });
        }

        if (!this.shootingStar && Math.random() < 0.003 * dt) {
            this.shootingStar = {
                x: Math.random() * this.viewWidth * 0.6,
                y: Math.random() * this.horizonY * 0.4,
                vx: 9 + Math.random() * 5,
                vy: 3 + Math.random() * 2,
                life: 1,
            };
        }

        const shooting = this.shootingStar;
        if (shooting) {
            shooting.x += shooting.vx * dt;
            shooting.y += shooting.vy * dt;
            shooting.life -= 0.025 * dt;
            this.glow
                .moveTo(shooting.x, shooting.y)
                .lineTo(shooting.x - shooting.vx * 6, shooting.y - shooting.vy * 6)
                .stroke({ color: this.palette.star, width: 2, alpha: Math.max(0, shooting.life) });
            if (shooting.life <= 0) this.shootingStar = null;
        }
    }

    private drawLaneDashes(): void {
        const cx = this.viewWidth / 2;
        for (let i = 0; i < LANE_DASHES; i++) {
            const nearT = (i + this.scroll) / LANE_DASHES;
            const farT = Math.max(0, nearT - 0.045);
            const y1 = this.depthToY(farT);
            const y2 = this.depthToY(nearT);
            const w1 = Math.max(0.5, this.roadHalfWidthAt(y1) * 0.025);
            const w2 = Math.max(0.5, this.roadHalfWidthAt(y2) * 0.025);
            this.glow
                .poly([cx - w1, y1, cx + w1, y1, cx + w2, y2, cx - w2, y2])
                .fill({ color: this.palette.lane, alpha: 0.35 + 0.5 * nearT });
        }
    }

    private updateCars(dt: number): void {
        this.carCooldown -= dt;
        if (this.carCooldown <= 0 && this.cars.length < 2) {
            const lane: -1 | 1 = Math.random() < 0.6 ? 1 : -1;
            this.cars.push({
                t: 0.02,
                lane,
                pace: lane === 1 ? 0.45 + Math.random() * 0.2 : 1.5 + Math.random() * 0.5,
                color: Math.floor(Math.random() * this.palette.signs.length),
            });
            this.carCooldown = 420 + Math.random() * 600;
        }

        for (const car of this.cars) {
            car.t += dt * DEPTH_SPEED * (0.35 + car.t) * car.pace;
        }
        this.cars = this.cars.filter(car => car.t < 0.95);
    }

    private drawCars(): void {
        const p = this.palette;
        for (const car of [...this.cars].sort((a, b) => a.t - b.t)) {
            const y = this.depthToY(car.t);
            const scale = (y - this.horizonY) / (this.viewHeight - this.horizonY);
            const half = this.roadHalfWidthAt(y);
            const x = this.viewWidth / 2 + car.lane * half * 0.5;
            const width = half * 0.3;
            const height = width * 0.55;
            const fade = Math.min(1, scale * 6) * Math.max(0, Math.min(1, (0.92 - car.t) / 0.22)) * 0.9;
            if (fade <= 0 || width < 2) continue;

            const neon = p.signs[car.color % p.signs.length];
            const outline = Math.max(0.6, 1.4 * scale);
            const bodyTop = y - height * 0.62;
            this.scenery
                .roundRect(x - width / 2, bodyTop, width, height * 0.62, height * 0.15)
                .fill({ color: p.silhouette, alpha: fade })
                .roundRect(x - width * 0.32, y - height, width * 0.64, height * 0.42, height * 0.12)
                .fill({ color: p.silhouette, alpha: fade });
            this.glow
                .roundRect(x - width / 2, bodyTop, width, height * 0.62, height * 0.15)
                .stroke({ color: neon, width: outline, alpha: 0.75 * fade })
                .roundRect(x - width * 0.32, y - height, width * 0.64, height * 0.42, height * 0.12)
                .stroke({ color: neon, width: outline, alpha: 0.5 * fade });

            const lightY = bodyTop + height * 0.22;
            const lightColor = car.lane === 1 ? 0xff2a3a : 0xfff1c4;
            for (const side of [-1, 1]) {
                const lightX = x + side * width * 0.36;
                this.glow.circle(lightX, lightY, Math.max(2, width * 0.18)).fill({ color: lightColor, alpha: 0.22 * fade });
                this.glow.rect(lightX - width * 0.08, lightY - height * 0.06, width * 0.16, Math.max(1, height * 0.12)).fill({ color: lightColor, alpha: fade });
            }

            if (car.lane === -1) {
                this.glow
                    .poly([x - width * 0.45, y, x + width * 0.45, y, x + width * 1.4, y + height * 2.2, x - width * 1.4, y + height * 2.2])
                    .fill({ color: lightColor, alpha: 0.05 * fade });
            }
        }
    }

    private nextSign(): number {
        if (this.signDeck.length === 0) {
            this.signDeck = Array.from({ length: SIGN_COUNT }, (_, i) => i).sort(() => Math.random() - 0.5);
        }
        return this.signDeck.pop() ?? 0;
    }

    private signSprite(prop: Prop): PIXI.Sprite {
        let sprite = this.signSprites.get(prop);
        if (!sprite) {
            sprite = new PIXI.Sprite(signTexture(prop.billboard));
            this.signSprites.set(prop, sprite);
            this.signLayer.addChild(sprite);
        }
        return sprite;
    }

    private releaseSign(prop: Prop): void {
        const sprite = this.signSprites.get(prop);
        if (!sprite) return;
        sprite.destroy();
        this.signSprites.delete(prop);
    }

    private drawProps(): void {
        this.signSprites.forEach(sprite => (sprite.visible = false));
        const ordered = [...this.props].sort((a, b) => a.t - b.t);
        for (const prop of ordered) {
            if (prop.kind === 'building') {
                this.drawBuilding(prop as Building);
                continue;
            }

            const point = this.edgePoint(prop.t, prop.side, PROP_OFFSET[prop.kind]);
            if (point.scale <= 0.01) continue;
            const fade = Math.min(1, point.scale * 4);

            switch (prop.kind) {
                case 'lamp':
                    this.drawLamp(point.x, point.y, point.scale, prop.side, fade);
                    break;
                case 'palm':
                    this.drawPalm(point.x, point.y, point.scale, prop.side, 0.6 + prop.seed * 0.8, fade);
                    break;
                case 'pylon':
                    this.drawPylon(prop, point, fade);
                    break;
                case 'post':
                    this.drawPost(prop, point, fade);
                    break;
                case 'billboard':
                    this.drawBillboard(prop, point, fade);
                    break;
            }
        }
    }

    private drawPylon(prop: Prop, point: { x: number; y: number; scale: number }, fade: number): void {
        const p = this.palette;
        const edge = parseInt(p.edge.slice(1), 16);
        const height = this.viewHeight * 0.8 * point.scale;
        const legGap = this.viewWidth * 0.035 * point.scale;
        const outerX = point.x + prop.side * legGap;
        const top = point.y - height;
        const width = Math.max(1.5, 5 * point.scale);
        const line = Math.max(0.6, point.scale);

        for (const x of [point.x, outerX]) {
            this.scenery.moveTo(x, point.y).lineTo(x, top).stroke({ color: p.silhouette, width, alpha: fade });
            this.glow.moveTo(x, point.y).lineTo(x, top).stroke({ color: edge, width: line, alpha: 0.5 * fade });
        }
        for (const level of [0.4, 0.75, 1]) {
            const y = point.y - height * level;
            this.scenery.moveTo(point.x, y).lineTo(outerX, y).stroke({ color: p.silhouette, width, alpha: fade });
            this.glow.moveTo(point.x, y).lineTo(outerX, y).stroke({ color: edge, width: line, alpha: 0.5 * fade });
        }

        for (const reach of [-0.12, -0.06, 0.06, 0.12]) {
            const deck = this.edgePoint(prop.t + reach, prop.side, PROP_OFFSET.post);
            const deckY = deck.y - this.viewHeight * 0.05 * deck.scale;
            this.glow.moveTo(point.x, top).lineTo(deck.x, deckY).stroke({ color: edge, width: line, alpha: 0.4 * fade });
        }

        const blink = Math.sin(this.time * 0.08 + prop.seed * 10) > 0.2 ? 1 : 0.2;
        const beaconX = (point.x + outerX) / 2;
        this.glow.circle(beaconX, top - 3 * point.scale, 7 * point.scale).fill({ color: 0xff3355, alpha: 0.3 * blink * fade });
        this.glow.circle(beaconX, top - 3 * point.scale, 2.5 * point.scale).fill({ color: 0xff5577, alpha: blink * fade });
    }

    private drawPost(prop: Prop, point: { x: number; y: number; scale: number }, fade: number): void {
        const p = this.palette;
        const top = point.y - this.viewHeight * 0.05 * point.scale;
        const previous = this.edgePoint(Math.max(0, prop.t - 0.035), prop.side, PROP_OFFSET.post);
        const previousTop = previous.y - this.viewHeight * 0.05 * previous.scale;

        this.scenery.moveTo(point.x, point.y).lineTo(point.x, top).stroke({ color: p.silhouette, width: Math.max(1, 3 * point.scale), alpha: fade });
        this.glow.moveTo(point.x, top).lineTo(previous.x, previousTop).stroke({
            color: parseInt(p.edge.slice(1), 16),
            width: Math.max(0.6, 1.5 * point.scale),
            alpha: 0.55 * fade,
        });
        this.glow.circle(point.x, top, Math.max(1, 3 * point.scale)).fill({ color: p.lamp, alpha: 0.9 * fade });
    }

    private drawBillboard(prop: Prop, point: { x: number; y: number; scale: number }, fade: number): void {
        const p = this.palette;
        const width = this.viewWidth * 0.22 * point.scale;
        const height = width * 0.5;
        const legHeight = this.viewHeight * 0.14 * point.scale;
        const left = prop.side === 1 ? point.x : point.x - width;
        const top = point.y - legHeight - height;
        const flicker = Math.sin(this.time * 0.04 + prop.seed * 60) > -0.95 ? 1 : 0.45;

        for (const x of [left + width * 0.2, left + width * 0.8]) {
            this.scenery.moveTo(x, point.y).lineTo(x, top + height).stroke({ color: p.silhouette, width: Math.max(1, 3 * point.scale), alpha: fade });
        }

        const sprite = this.signSprite(prop);
        sprite.visible = true;
        sprite.position.set(left, top);
        sprite.width = width;
        sprite.height = height;
        sprite.alpha = fade * flicker;
        this.glow.rect(left - 2, top - 2, width + 4, height + 4).fill({ color: p.lamp, alpha: 0.06 * fade * flicker });
    }


    private drawLamp(x: number, y: number, scale: number, side: -1 | 1, fade: number): void {
        const p = this.palette;
        const height = this.viewHeight * 0.42 * scale;
        const arm = this.viewWidth * 0.05 * scale;
        const width = Math.max(1, 3 * scale);
        const headX = x - side * arm;
        const headY = y - height;

        this.scenery
            .moveTo(x, y)
            .lineTo(x, headY)
            .lineTo(headX, headY)
            .stroke({ color: p.silhouette, width, alpha: fade });
        this.scenery
            .moveTo(x + side * width * 0.5, y)
            .lineTo(x + side * width * 0.5, headY)
            .stroke({ color: parseInt(p.edge.slice(1), 16), width: Math.max(0.5, scale), alpha: 0.35 * fade });

        this.glow.circle(headX, headY + 2 * scale, 26 * scale).fill({ color: p.lamp, alpha: 0.1 * fade });
        this.glow.circle(headX, headY + 2 * scale, 9 * scale).fill({ color: p.lamp, alpha: 0.35 * fade });
        this.glow.roundRect(headX - 6 * scale, headY, 12 * scale, 4 * scale, 2 * scale).fill({ color: 0xffffff, alpha: 0.9 * fade });
        this.glow
            .poly([headX - 5 * scale, headY + 4 * scale, headX + 5 * scale, headY + 4 * scale, headX + 30 * scale, y, headX - 30 * scale, y])
            .fill({ color: p.lamp, alpha: 0.05 * fade });
    }

    private drawPalm(x: number, y: number, scale: number, side: -1 | 1, lean: number, fade: number): void {
        const p = this.palette;
        const height = this.viewHeight * 0.38 * scale;
        const bend = side * this.viewWidth * 0.04 * scale * lean;
        const topX = x + bend;
        const topY = y - height;
        const trunk = Math.max(1.5, 7 * scale);
        const edge = parseInt(p.edge.slice(1), 16);

        this.scenery
            .moveTo(x, y)
            .quadraticCurveTo(x + bend * 0.1, y - height * 0.6, topX, topY)
            .stroke({ color: p.silhouette, width: trunk, alpha: fade, cap: 'round' });

        const frond = this.viewWidth * 0.075 * scale;
        for (let i = 0; i < 7; i++) {
            const angle = -Math.PI / 2 + ((i - 3) / 3) * 1.45;
            const tipX = topX + Math.cos(angle) * frond * 1.1;
            const tipY = topY + Math.sin(angle) * frond * 0.55 + frond * 0.55;
            const ctrlX = topX + Math.cos(angle) * frond * 0.7;
            const ctrlY = topY + Math.sin(angle) * frond * 0.6 - frond * 0.15;
            this.scenery
                .moveTo(topX, topY)
                .quadraticCurveTo(ctrlX, ctrlY, tipX, tipY)
                .stroke({ color: p.silhouette, width: Math.max(1, 4 * scale), alpha: fade, cap: 'round' });
            this.glow
                .moveTo(topX, topY)
                .quadraticCurveTo(ctrlX, ctrlY, tipX, tipY)
                .stroke({ color: edge, width: Math.max(0.8, 1.2 * scale), alpha: 0.55 * fade });
        }
    }
}
