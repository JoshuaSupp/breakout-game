export const PIXEL_FONT = '"Press Start 2P", monospace';

export type ThemeName = 'dusk' | 'midnight';

export interface Palette {
    skyTop: string;
    skyMid: string;
    horizonGlow: string;
    hazeA: string;
    hazeB: string;
    moon: string;
    water: string;
    road: string;
    edge: string;
    silhouette: number;
    building: number;
    buildingSide: number;
    windows: number[];
    signs: number[];
    lamp: number;
    lane: number;
    star: number;
    paddle: number;
    ball: number;
}

export const PALETTES: Record<ThemeName, Palette> = {
    dusk: {
        skyTop: '#060114',
        skyMid: '#2a0a52',
        horizonGlow: '#ff2a6d',
        hazeA: '#ff2a6d',
        hazeB: '#7b5cff',
        moon: '#ffd6f2',
        water: '#14042c',
        road: '#0b0218',
        edge: '#ff2a6d',
        silhouette: 0x05010d,
        building: 0x0d0420,
        buildingSide: 0x1c0a3a,
        windows: [0xffd319, 0xff7a18, 0xff7ae0, 0x05d9e8],
        signs: [0xff2a6d, 0x05d9e8, 0xffd319, 0x7b5cff],
        lamp: 0xffb36b,
        lane: 0xffd319,
        star: 0xffe9ff,
        paddle: 0x05d9e8,
        ball: 0x05d9e8,
    },
    midnight: {
        skyTop: '#01020d',
        skyMid: '#071a40',
        horizonGlow: '#05d9e8',
        hazeA: '#05d9e8',
        hazeB: '#3d5cff',
        moon: '#e4fbff',
        water: '#020b24',
        road: '#01040e',
        edge: '#05d9e8',
        silhouette: 0x01030a,
        building: 0x030a1c,
        buildingSide: 0x08183e,
        windows: [0x7ae7ff, 0xbdf3ff, 0x3df5a7, 0xff7ae0],
        signs: [0x05d9e8, 0xff2a6d, 0x3df5a7, 0x7b5cff],
        lamp: 0x9fe6ff,
        lane: 0xff7ae0,
        star: 0xd9f6ff,
        paddle: 0xff2a6d,
        ball: 0xff7ae0,
    },
};

export const BRICK_COLORS: number[] = [
    0xff2a6d,
    0xff7a18,
    0xffd319,
    0x3df5a7,
    0x05d9e8,
    0x7b5cff,
    0xd300c5,
];

export type PowerUpType =
    | 'paddle_big'
    | 'paddle_small'
    | 'speed_fast'
    | 'speed_slow'
    | 'lightning'
    | 'mystery'
    | 'extra_life'
    | 'extra_time'
    | 'multi_ball';

export interface PowerUpDef {
    label: string;
    title: string;
    color: number;
    row: number;
    frames: number;
    weight: number;
    timed: boolean;
    positive: boolean;
}

export const POWER_UPS: Record<PowerUpType, PowerUpDef> = {
    paddle_big:   { label: 'BIG',   title: 'MEGA PADDLE',  color: 0x3df5a7, row: 8,  frames: 8, weight: 3, timed: true,  positive: true },
    paddle_small: { label: 'SMALL', title: 'TINY PADDLE',  color: 0xff4d4d, row: 2,  frames: 8, weight: 2, timed: true,  positive: false },
    speed_fast:   { label: 'FAST',  title: 'TURBO BALL',   color: 0xffb11a, row: 10, frames: 8, weight: 2, timed: true,  positive: false },
    speed_slow:   { label: 'SLOW',  title: 'SLOW MOTION',  color: 0x4cc9ff, row: 9,  frames: 8, weight: 2, timed: true,  positive: true },
    lightning:    { label: 'ZAP',   title: 'LIGHTNING',    color: 0xffe14d, row: 0,  frames: 8, weight: 2, timed: false, positive: true },
    mystery:      { label: '???',   title: 'MYSTERY',      color: 0xd38cff, row: 3,  frames: 6, weight: 2, timed: false, positive: true },
    extra_life:   { label: '+1UP',  title: 'EXTRA LIFE',   color: 0xff4f9a, row: 1,  frames: 6, weight: 1, timed: false, positive: true },
    extra_time:   { label: '+30s',  title: '+30 SECONDS',  color: 0x5c8dff, row: 4,  frames: 8, weight: 2, timed: false, positive: true },
    multi_ball:   { label: 'MULTI', title: 'MULTI BALL',   color: 0xffffff, row: 5,  frames: 5, weight: 2, timed: false, positive: true },
};

export const POWER_UP_TYPES = Object.keys(POWER_UPS) as PowerUpType[];

export function pickWeightedPowerUp(exclude: PowerUpType[] = []): PowerUpType {
    const pool = POWER_UP_TYPES.filter(type => !exclude.includes(type));
    const total = pool.reduce((sum, type) => sum + POWER_UPS[type].weight, 0);
    let roll = Math.random() * total;
    for (const type of pool) {
        roll -= POWER_UPS[type].weight;
        if (roll <= 0) return type;
    }
    return pool[pool.length - 1];
}

export function hexToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
}
