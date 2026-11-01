import * as PIXI from 'pixi.js';
import { PIXEL_FONT } from './theme';

type SignStyle = 'neon' | 'highway' | 'speed' | 'warning';
type SignIcon = 'arrow' | 'ufo' | 'brick' | 'stonks';

interface SignDesign {
    style: SignStyle;
    lines: string[];
    color: string;
    icon?: SignIcon;
}

const SIGNS: SignDesign[] = [
    { style: 'highway', lines: ['NEXT EXIT', 'BOSS LEVEL'], color: '#ffffff', icon: 'arrow' },
    { style: 'highway', lines: ['HIGH SCORE', '1 MILE'], color: '#ffffff', icon: 'arrow' },
    { style: 'speed', lines: ['SPEED LIMIT', '88'], color: '#111111' },
    { style: 'warning', lines: ['UFO', 'CROSSING'], color: '#ffd319', icon: 'ufo' },
    { style: 'warning', lines: ['FALLING', 'BRICKS'], color: '#ffd319', icon: 'brick' },
    { style: 'neon', lines: ['THIS IS', 'FINE'], color: '#ff7a18' },
    { style: 'neon', lines: ['STONKS'], color: '#3df5a7', icon: 'stonks' },
    { style: 'neon', lines: ['GG EZ'], color: '#05d9e8' },
    { style: 'neon', lines: ['404', 'BRICKS NOT FOUND'], color: '#ff2a6d' },
    { style: 'neon', lines: ['PRESS F', 'TO PAY RESPECTS'], color: '#d38cff' },
    { style: 'neon', lines: ['ONE MORE', 'LEVEL'], color: '#05d9e8' },
    { style: 'neon', lines: ['MOTEL', 'VACANCY'], color: '#ff4f9a' },
    { style: 'neon', lines: ['PIZZA', 'ARCADE 24/7'], color: '#ffb36b' },
    { style: 'neon', lines: ['INSERT', 'COIN'], color: '#ffd319' },
];

export const SIGN_COUNT = SIGNS.length;

const WIDTH = 320;
const HEIGHT = 160;
const cache = new Map<number, PIXI.Texture>();

export function signTexture(index: number): PIXI.Texture {
    const cached = cache.get(index);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const design = SIGNS[index % SIGNS.length];
        ({ neon: drawNeon, highway: drawHighway, speed: drawSpeed, warning: drawWarning })[design.style](ctx, design);
    }

    const texture = PIXI.Texture.from(canvas);
    cache.set(index, texture);
    return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number): number {
    let size = maxSize;
    do {
        ctx.font = `${size}px ${PIXEL_FONT}`;
        if (ctx.measureText(text).width <= maxWidth) break;
        size -= 1;
    } while (size > 8);
    return size;
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], cx: number, cy: number, maxWidth: number, sizes: number[]): void {
    const fitted = lines.map((line, i) => fitFont(ctx, line, maxWidth, sizes[i] ?? sizes[sizes.length - 1]));
    const gap = 12;
    const total = fitted.reduce((sum, size) => sum + size, 0) + gap * (lines.length - 1);
    let y = cy - total / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
        ctx.font = `${fitted[i]}px ${PIXEL_FONT}`;
        ctx.fillText(line, cx, y);
        y += fitted[i] + gap;
    });
}

function drawNeon(ctx: CanvasRenderingContext2D, design: SignDesign): void {
    ctx.fillStyle = '#0b0322';
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 14);
    ctx.fill();

    ctx.shadowColor = design.color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = design.color;
    ctx.lineWidth = 6;
    roundRect(ctx, 10, 10, WIDTH - 20, HEIGHT - 20, 10);
    ctx.stroke();

    const textWidth = design.icon ? WIDTH * 0.55 : WIDTH - 50;
    const textX = design.icon ? WIDTH * 0.38 : WIDTH / 2;
    ctx.fillStyle = design.color;
    ctx.shadowBlur = 16;
    drawLines(ctx, design.lines, textX, HEIGHT / 2, textWidth, [34, 18]);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    drawLines(ctx, design.lines, textX, HEIGHT / 2, textWidth, [34, 18]);
    ctx.globalAlpha = 1;

    if (design.icon === 'stonks') {
        ctx.shadowColor = design.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = design.color;
        ctx.lineWidth = 7;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(WIDTH * 0.68, HEIGHT * 0.74);
        ctx.lineTo(WIDTH * 0.75, HEIGHT * 0.56);
        ctx.lineTo(WIDTH * 0.8, HEIGHT * 0.64);
        ctx.lineTo(WIDTH * 0.88, HEIGHT * 0.3);
        ctx.stroke();
        ctx.fillStyle = design.color;
        ctx.beginPath();
        ctx.moveTo(WIDTH * 0.92, HEIGHT * 0.22);
        ctx.lineTo(WIDTH * 0.83, HEIGHT * 0.3);
        ctx.lineTo(WIDTH * 0.91, HEIGHT * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function drawHighway(ctx: CanvasRenderingContext2D, design: SignDesign): void {
    ctx.fillStyle = '#0a6b3d';
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 14);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    roundRect(ctx, 9, 9, WIDTH - 18, HEIGHT - 18, 10);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    drawLines(ctx, design.lines, WIDTH * 0.42, HEIGHT / 2, WIDTH * 0.66, [20, 26]);

    const ax = WIDTH * 0.84;
    const ay = HEIGHT * 0.5;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -10, 12, 42);
    ctx.beginPath();
    ctx.moveTo(-20, -8);
    ctx.lineTo(0, -34);
    ctx.lineTo(20, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawSpeed(ctx: CanvasRenderingContext2D, design: SignDesign): void {
    ctx.fillStyle = '#0b0322';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const w = HEIGHT * 1.1;
    const x = (WIDTH - w) / 2;
    ctx.fillStyle = '#f4f4f4';
    roundRect(ctx, x, 6, w, HEIGHT - 12, 10);
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 5;
    roundRect(ctx, x + 8, 14, w - 16, HEIGHT - 28, 6);
    ctx.stroke();

    ctx.fillStyle = design.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const small = fitFont(ctx, design.lines[0], w - 36, 14);
    ctx.font = `${small}px ${PIXEL_FONT}`;
    ctx.fillText(design.lines[0], WIDTH / 2, 30);
    ctx.font = `64px ${PIXEL_FONT}`;
    ctx.fillText(design.lines[1], WIDTH / 2, 60);
}

function drawWarning(ctx: CanvasRenderingContext2D, design: SignDesign): void {
    ctx.fillStyle = '#0b0322';
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 14);
    ctx.fill();

    const cx = WIDTH * 0.24;
    const cy = HEIGHT / 2;
    const r = HEIGHT * 0.44;
    ctx.fillStyle = design.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 10);
    ctx.lineTo(cx + r - 10, cy);
    ctx.lineTo(cx, cy + r - 10);
    ctx.lineTo(cx - r + 10, cy);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#111111';
    if (design.icon === 'ufo') {
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4, 26, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, cy - 4, 12, 11, 0, Math.PI, 0);
        ctx.fill();
        for (const dx of [-14, 0, 14]) {
            ctx.fillRect(cx + dx - 2, cy + 16, 4, 10);
        }
    } else if (design.icon === 'brick') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.25);
        ctx.fillRect(-22, -20, 26, 12);
        ctx.rotate(0.45);
        ctx.fillRect(-6, -2, 26, 12);
        ctx.restore();
        ctx.fillRect(cx - 18, cy + 18, 36, 5);
    }

    ctx.fillStyle = design.color;
    ctx.shadowColor = design.color;
    ctx.shadowBlur = 10;
    drawLines(ctx, design.lines, WIDTH * 0.7, cy, WIDTH * 0.52, [22, 18]);
    ctx.shadowBlur = 0;
}
