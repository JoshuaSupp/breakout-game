import * as PIXI from 'pixi.js';
import { SoundManager } from './sound';
import { Backdrop } from './backdrop';
import { BOSS_LEVELS, Boss, Rect } from './boss';
import { Effects, createGlowTexture, pixelText } from './effects';
import { buildLevel, LevelLayout } from './levels';
import {
    BRICK_COLORS,
    PALETTES,
    PIXEL_FONT,
    POWER_UPS,
    PowerUpType,
    ThemeName,
    hexToCss,
    pickWeightedPowerUp,
} from './theme';
import powerUpSpritesheet from './assets/images/powerups/animated_items.png';

let GAME_WIDTH = 800;
let GAME_HEIGHT = 600;
let PADDLE_WIDTH = 100;
let PADDLE_HEIGHT = 16;
let BALL_RADIUS = 9;
let BRICK_WIDTH = 75;
let BRICK_HEIGHT = 20;
let BRICK_COLS = 10;
let BRICK_PADDING = 5;

const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;
let SCALE_FACTOR = 1;

const MAX_BALLS = 6;
const MAX_LIVES = 10;
const MAX_FALLING_POWER_UPS = 5;
const POWER_UP_DURATION = 10000;
const TRAIL_LENGTH = 10;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const SPRITE_SIZE = 32;
const MAX_GAUGE_SPEED = 240;
const COMBO_STEP = 3;
const MAX_MULTIPLIER = 8;
const BOSS_TIME = 150;
const BOSS_HIT_POINTS = 50;
const INVULNERABLE_FRAMES = 110;
const BOSS_DROP_EVERY = 3;
const MAX_BANK_TIME = 600;

const LOCK_ICON =
    '<svg viewBox="0 0 10 12" width="12" height="14" aria-hidden="true"><path fill="currentColor" d="M2 5V3a3 3 0 0 1 6 0v2h1v7H1V5h1zm2 0h2V3a1 1 0 0 0-2 0v2z"/></svg>';

interface Ball {
    body: PIXI.Graphics;
    glow: PIXI.Sprite;
    x: number;
    y: number;
    vx: number;
    vy: number;
    attached: boolean;
    trail: PIXI.PointData[];
}

interface Brick {
    gfx: PIXI.Graphics;
    row: number;
    col: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    color: number;
    alive: boolean;
    intro: number;
    introDelay: number;
}

interface PowerUp {
    type: PowerUpType;
    x: number;
    y: number;
    velocity: number;
    phase: number;
    sprite: PIXI.AnimatedSprite;
    ring: PIXI.Graphics;
    container: PIXI.Container;
}

interface GameHistory {
    date: Date;
    score: number;
    result: 'Win' | 'Loss';
    level: number;
}

interface RoundReward {
    time: number;
    lives: number;
    points: number;
}

interface BonusBank {
    time: number;
    lives: number;
}

interface PopupAction {
    label: string;
    variant: 'primary' | 'secondary';
    onClick: () => void;
}

interface ResultPopup {
    title: string;
    message: string;
    tone: 'danger' | 'success';
    actions: PopupAction[];
}

interface HudElements {
    score: HTMLElement | null;
    highScore: HTMLElement | null;
    titleHighScore: HTMLElement | null;
    bankLives: HTMLElement | null;
    bankTime: HTMLElement | null;
    timer: HTMLElement | null;
    timerBar: HTMLElement | null;
    level: HTMLElement | null;
    lives: HTMLElement | null;
    username: HTMLElement | null;
    exitBtn: HTMLElement | null;
}

interface DashboardElements {
    speed: HTMLElement | null;
    needle: SVGElement | null;
    arc: SVGElement | null;
    lights: HTMLElement[];
    combo: HTMLElement | null;
    comboLeds: HTMLElement[];
    chain: HTMLElement | null;
    balls: HTMLElement | null;
}

type GameState = 'start' | 'playing' | 'gameOver' | 'won' | 'levelIntro' | 'paused' | 'levelClear';
type BackgroundType = 'morning' | 'night';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pad = (value: number, length: number) => Math.max(0, Math.floor(value)).toString().padStart(length, '0');

function statCell(label: string, value: string): string {
    return `<div><span>${label}</span><strong style="--chars:${Math.max(4, value.length)}">${value}</strong></div>`;
}

function readNumber(key: string, fallback: number): number {
    const value = parseInt(localStorage.getItem(key) ?? '', 10);
    return Number.isFinite(value) ? value : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
}

function readBank(): BonusBank {
    try {
        const parsed = JSON.parse(localStorage.getItem('breakout_bonusBank') ?? '{}');
        return { time: Math.min(600, Math.max(0, Number(parsed.time) || 0)), lives: Math.min(10, Math.max(0, Number(parsed.lives) || 0)) };
    } catch {
        return { time: 0, lives: 0 };
    }
}

function readHistory(): GameHistory[] {
    try {
        const parsed: GameHistory[] = JSON.parse(localStorage.getItem('breakout_history') ?? '[]');
        return parsed.map(entry => ({ ...entry, date: new Date(entry.date) }));
    } catch (e) {
        console.error('Failed to parse history', e);
        return [];
    }
}

export class BreakoutGame {
    private app: PIXI.Application;
    private readonly world: PIXI.Container;
    private readonly backdrop: Backdrop;
    private readonly bricksContainer: PIXI.Container;
    private readonly bossLayer: PIXI.Container;
    private readonly gameObjectsContainer: PIXI.Container;
    private readonly powerUpContainer: PIXI.Container;
    private readonly effectsContainer: PIXI.Container;
    private readonly effects: Effects;
    private readonly trailGfx: PIXI.Graphics;
    private readonly paddle: PIXI.Graphics;
    private readonly paddleGlow: PIXI.Sprite;
    private launchPrompt: PIXI.Text | null = null;
    private glowTexture: PIXI.Texture = PIXI.Texture.WHITE;
    private powerUpBaseTexture: PIXI.Texture | null = null;
    private readonly spriteFrames = new Map<PowerUpType, PIXI.Texture[]>();

    private balls: Ball[] = [];
    private bricks: Brick[] = [];
    private powerUps: PowerUp[] = [];
    private activePowerUpEffects: Map<PowerUpType, number> = new Map();
    private layout: LevelLayout | null = null;
    private boss: Boss | null = null;
    private pendingReward: RoundReward | null = null;
    private shownReward: RoundReward | null = null;
    private bank: BonusBank = readBank();
    private introIsResume = false;
    private invulnerable = 0;

    private score = 0;
    private lives = 3;
    private gameState: GameState = 'start';
    private highScore: number;
    private username = '';
    private combo = 0;
    private bestCombo = 0;
    private bricksBroken = 0;
    private newHighScore = false;

    private timeLimit = 0;
    private timeLeft = 0;
    private timeBarMax = 1;
    private clockRunning = false;

    private paddleX = 0;
    private paddleWidthNow = PADDLE_WIDTH;
    private paddleFlash = 0;
    private paddleSquash = 0;
    private pointerX = GAME_WIDTH / 2;
    private keys = { left: false, right: false };
    private baseBallSpeed = 6;
    private elapsed = 0;
    private lastLostX = GAME_WIDTH / 2;

    private currentLevel = 1;
    private highestLevelUnlocked = 1;
    private readonly MAX_LEVELS = 30;
    private resumeAfterLevelSelect = false;
    private levelClearTimer: number | null = null;

    private soundManager: SoundManager;
    private resizeHandler: () => void;
    private resizeTimer: number | null = null;
    private hud: HudElements;
    private dashboard: DashboardElements;
    private lastShownMultiplier = 1;
    private hudCache = new Map<string, string>();

    public backgroundType: BackgroundType = 'morning';
    public musicEnabled: boolean;
    public soundEnabled: boolean;
    public sessionHistory: GameHistory[];

    constructor() {
        this.app = new PIXI.Application();
        this.world = new PIXI.Container();
        this.bricksContainer = new PIXI.Container();
        this.bossLayer = new PIXI.Container();
        this.gameObjectsContainer = new PIXI.Container();
        this.powerUpContainer = new PIXI.Container();
        this.effectsContainer = new PIXI.Container();
        this.trailGfx = new PIXI.Graphics();
        this.paddle = new PIXI.Graphics();
        this.paddleGlow = new PIXI.Sprite();
        this.effects = new Effects(this.effectsContainer, this.world);

        this.musicEnabled = readBoolean('breakout_musicEnabled', true);
        this.soundEnabled = readBoolean('breakout_soundEnabled', true);
        this.soundManager = new SoundManager();
        this.soundManager.setMusicEnabled(this.musicEnabled);
        this.soundManager.setSoundEnabled(this.soundEnabled);

        const savedBackground = localStorage.getItem('breakout_background');
        if (savedBackground === 'morning' || savedBackground === 'night') {
            this.backgroundType = savedBackground;
        }
        this.backdrop = new Backdrop(PALETTES[this.themeName]);

        this.highestLevelUnlocked = clamp(readNumber('breakout_highestLevel', 1), 1, this.MAX_LEVELS);
        this.currentLevel = clamp(readNumber('breakout_lastPlayedLevel', this.highestLevelUnlocked), 1, this.highestLevelUnlocked);
        this.highScore = readNumber('breakout_highScore', 0);
        this.sessionHistory = readHistory();

        this.hud = {
            score: document.getElementById('score'),
            highScore: document.getElementById('highScore'),
            titleHighScore: document.getElementById('titleHighScore'),
            bankLives: document.getElementById('bankLives'),
            bankTime: document.getElementById('bankTime'),
            timer: document.getElementById('timer'),
            timerBar: document.getElementById('timerBar'),
            level: document.getElementById('level'),
            lives: document.getElementById('lives'),
            username: document.getElementById('username'),
            exitBtn: document.getElementById('exitBtn'),
        };

        this.dashboard = {
            speed: document.getElementById('dashSpeed'),
            needle: document.querySelector<SVGElement>('#dashSpeedNeedle'),
            arc: document.querySelector<SVGElement>('#dashSpeedArc'),
            lights: Array.from(document.querySelectorAll<HTMLElement>('.dash-light')),
            combo: document.getElementById('dashCombo'),
            comboLeds: Array.from(document.querySelectorAll<HTMLElement>('#dashComboLeds i')),
            chain: document.getElementById('dashChain'),
            balls: document.getElementById('dashBalls'),
        };

        this.calculateTimeLimit();
        this.timeLeft = this.timeLimit;
        this.timeBarMax = this.timeLimit;
        this.calculateResponsiveDimensions();
        this.adjustSpeedForLevel();
        this.resizeHandler = this.scheduleResize.bind(this);
        this.applyThemeToPage();
        this.updateHistoryUI();
        this.setupLevelStartPopup();
    }

    public get state(): GameState {
        return this.gameState;
    }

    private get themeName(): ThemeName {
        return this.backgroundType === 'night' ? 'midnight' : 'dusk';
    }

    private get palette() {
        return PALETTES[this.themeName];
    }

    async start(): Promise<void> {
        await this.app.init({
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            background: 0x07011a,
        });
        globalThis.__PIXI_APP__ = this.app;

        await this.loadAssets();
        this.setupScene();

        this.app.canvas.style.width = '100%';
        this.app.canvas.style.height = '100%';
        this.app.canvas.style.display = 'block';
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.innerHTML = '';
            gameContainer.appendChild(this.app.canvas);
            this.sizeGameContainer(gameContainer);
        }

        this.setupUsernamePopup();
        this.setupEventListeners();
        this.app.ticker.add(this.gameLoop, this);
        window.addEventListener('resize', this.resizeHandler);
        window.addEventListener('orientationchange', this.resizeHandler);
        window.visualViewport?.addEventListener('resize', this.resizeHandler);
        this.updateLevelGrid();
        this.updateUI(true);
        requestAnimationFrame(() => this.handleResize());
    }

    private scheduleResize(): void {
        if (this.resizeTimer !== null) clearTimeout(this.resizeTimer);
        this.resizeTimer = window.setTimeout(() => {
            this.resizeTimer = null;
            this.handleResize();
        }, 120);
    }

    private async loadAssets(): Promise<void> {
        const fontTimeout = new Promise(resolve => setTimeout(resolve, 2500));
        const fonts = Promise.all([document.fonts.ready, document.fonts.load(`16px ${PIXEL_FONT}`)]);
        await Promise.race([fonts, fontTimeout]).catch(() => undefined);

        try {
            await PIXI.Assets.load(powerUpSpritesheet);
            this.powerUpBaseTexture = PIXI.Texture.from(powerUpSpritesheet);
            this.powerUpBaseTexture.source.scaleMode = 'nearest';
        } catch (e) {
            console.error('Failed to load power-up sprites', e);
        }

        this.glowTexture = createGlowTexture();
    }

    private setupScene(): void {
        this.backdrop.resize(GAME_WIDTH, GAME_HEIGHT);
        this.effects.setSize(GAME_WIDTH, GAME_HEIGHT, SCALE_FACTOR);

        this.paddleGlow.texture = this.glowTexture;
        this.paddleGlow.anchor.set(0.5);
        this.paddleGlow.blendMode = 'add';
        this.gameObjectsContainer.addChild(this.trailGfx, this.paddleGlow, this.paddle);

        this.world.addChild(
            this.backdrop,
            this.bricksContainer,
            this.bossLayer,
            this.powerUpContainer,
            this.gameObjectsContainer,
            this.effectsContainer,
        );
        this.app.stage.addChild(this.world);

        this.launchPrompt = pixelText('CLICK / SPACE / TAP TO LAUNCH', this.promptFontSize(), 0xffffff, 3);
        this.launchPrompt.visible = false;
        this.app.stage.addChild(this.launchPrompt);

        this.paddleWidthNow = this.getCurrentPaddleWidth();
        this.paddleX = GAME_WIDTH / 2 - this.paddleWidthNow / 2;
        this.drawPaddle();
    }

    private promptFontSize(): number {
        return Math.max(7, Math.round(10 * SCALE_FACTOR));
    }

    private sizeGameContainer(container: HTMLElement): void {
        container.style.width = `${GAME_WIDTH}px`;
        container.style.height = `${GAME_HEIGHT}px`;
    }

    private setupEventListeners(): void {
        window.addEventListener('pointermove', (e: PointerEvent) => this.trackPointer(e));

        this.app.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            this.trackPointer(e);
            if (this.gameState === 'playing') {
                this.launchBalls();
            }
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => this.handleKey(e, true));
        document.addEventListener('keyup', (e: KeyboardEvent) => this.handleKey(e, false));
        window.addEventListener('blur', () => {
            this.keys.left = false;
            this.keys.right = false;
        });
    }

    private trackPointer(e: PointerEvent): void {
        const rect = this.app.canvas.getBoundingClientRect();
        if (rect.width === 0) return;
        this.pointerX = clamp(((e.clientX - rect.left) * GAME_WIDTH) / rect.width, 0, GAME_WIDTH);
    }

    private handleKey(e: KeyboardEvent, pressed: boolean): void {
        if (e.target instanceof HTMLInputElement) return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.keys.left = pressed;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.keys.right = pressed;
                break;
            case ' ':
            case 'ArrowUp':
            case 'w':
            case 'W':
                if (this.gameState === 'playing') {
                    e.preventDefault();
                    (document.activeElement as HTMLElement | null)?.blur();
                    if (pressed) this.launchBalls();
                }
                break;
        }
    }

    private setupUsernamePopup(): void {
        const usernamePopup = document.getElementById('usernamePopup');
        const usernameInput = document.getElementById('usernameInput') as HTMLInputElement | null;
        const startGameBtn = document.getElementById('startGameBtn');

        if (!usernamePopup || !usernameInput || !startGameBtn) {
            console.error('Username popup elements not found');
            return;
        }

        const savedUsername = sessionStorage.getItem('breakoutUsername');
        if (savedUsername) {
            usernameInput.value = savedUsername;
        }

        startGameBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (!username) {
                document.getElementById('usernameError')?.classList.add('show');
                usernameInput.focus();
                return;
            }

            this.username = username;
            sessionStorage.setItem('breakoutUsername', username);
            if (this.musicEnabled) {
                this.soundManager.playMusic();
            }

            usernamePopup.classList.remove('show');
            this.score = 0;
            this.lives = 3;
            this.initializeGame();
            this.showLevelStartPopup();
        });

        usernameInput.addEventListener('input', () => {
            document.getElementById('usernameError')?.classList.remove('show');
        });

        usernameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                startGameBtn.click();
            }
        });
    }

    private setupLevelStartPopup(): void {
        const levelStartPopup = document.getElementById('levelStartPopup');
        const playBtn = document.getElementById('levelStartPlayBtn');
        const selectBtn = document.getElementById('levelStartSelectBtn');
        const useBonus = document.getElementById('useBonusToggle') as HTMLInputElement | null;

        useBonus?.addEventListener('change', () => {
            localStorage.setItem('breakout_useBonus', useBonus.checked.toString());
            this.playUiSound();
        });

        playBtn?.addEventListener('click', () => {
            levelStartPopup?.classList.remove('show');
            playBtn.blur();
            this.shownReward = null;
            this.gameState = 'playing';
            if (!this.introIsResume && this.useBonusPreferred()) {
                this.spendBank();
            }
        });

        selectBtn?.addEventListener('click', () => {
            levelStartPopup?.classList.remove('show');
            this.openLevelSelect();
        });
    }

    private showLevelStartPopup(resume: boolean = false): void {
        this.gameState = 'levelIntro';
        const levelStartPopup = document.getElementById('levelStartPopup');
        const panel = levelStartPopup?.querySelector<HTMLElement>('.popup-content');
        const kicker = levelStartPopup?.querySelector('.panel-kicker');
        const title = document.getElementById('levelStartTitle');
        const playBtn = document.getElementById('levelStartPlayBtn');
        const info = document.getElementById('levelStartInfo');
        const rewards = document.getElementById('levelStartRewards');
        this.introIsResume = resume;
        this.renderBankPanel(resume);
        if (rewards) {
            const reward = resume ? null : this.shownReward;
            rewards.innerHTML = reward
                ? `<span class="reward-title">Round rewards</span>` +
                  (reward.lives ? '<span class="reward-chip reward-life">+1 Life</span>' : '') +
                  (reward.time ? `<span class="reward-chip reward-time">+${this.formatTime(reward.time)} Time</span>` : '') +
                  `<span class="reward-chip reward-points">+${reward.points.toLocaleString()} Pts</span>`
                : '';
        }
        const time = this.formatTime(resume ? this.timeLeft : this.timeLimit);

        if (playBtn) playBtn.textContent = resume ? 'Resume' : this.boss ? 'Fight' : 'Start';
        if (this.boss) {
            const config = this.boss.config;
            if (panel) panel.dataset.tone = 'danger';
            if (kicker) kicker.textContent = 'Warning: boss incoming';
            if (title) title.textContent = config.name;
            if (info) info.innerHTML = statCell('Boss', config.title) + statCell('Hull', `${this.boss.hp}`) + statCell('Time', time);
        } else {
            if (panel) delete panel.dataset.tone;
            if (kicker) kicker.textContent = 'Get ready';
            if (title) title.textContent = `Stage ${pad(this.currentLevel, 2)}`;
            if (info && this.layout) {
                info.innerHTML = statCell('Layout', this.layout.name) + statCell('Bricks', `${this.layout.brickCount}`) + statCell('Time', time);
            }
        }
        levelStartPopup?.classList.add('show');
    }

    public openLevelSelect(): void {
        const wasMidGame = this.gameState === 'playing' || this.gameState === 'paused';
        if (this.gameState === 'gameOver' || this.gameState === 'won') {
            this.prepareFreshRun();
        }
        this.resumeAfterLevelSelect = wasMidGame;
        this.gameState = 'levelIntro';

        document.getElementById('sideMenu')?.classList.remove('show');
        document.getElementById('gamePopup')?.classList.remove('show');
        document.getElementById('levelSelectScreen')?.classList.add('show');
        this.updateLevelGrid();
    }

    public closeLevelSelect(): void {
        document.getElementById('levelSelectScreen')?.classList.remove('show');
        if (this.gameState === 'levelIntro') {
            this.showLevelStartPopup(this.resumeAfterLevelSelect);
        }
    }

    public startLevel(level: number): void {
        if (level > this.highestLevelUnlocked) return;
        this.pendingReward = null;

        this.currentLevel = level;
        localStorage.setItem('breakout_lastPlayedLevel', level.toString());
        this.score = 0;
        this.lives = 3;
        this.newHighScore = false;

        ['levelSelectScreen', 'sideMenu', 'gamePopup', 'levelStartPopup'].forEach(id =>
            document.getElementById(id)?.classList.remove('show'),
        );

        this.initializeGame();
        this.gameState = 'playing';
    }

    public pause(): void {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
        }
    }

    public resume(): void {
        if (this.gameState === 'paused') {
            this.gameState = 'playing';
        }
    }

    public returnToTitle(): void {
        this.cancelLevelClear();
        this.gameState = 'start';
        this.score = 0;
        this.lives = 3;
        this.clearBalls();
        this.clearPowerUpDrops();
        this.activePowerUpEffects.clear();
        this.effects.clear();
        this.clearBoss();
        this.soundManager.stopBossMusic();
        this.pendingReward = null;
        this.bricksContainer.removeChildren().forEach(child => child.destroy());
        this.bricks = [];
        document.getElementById('usernamePopup')?.classList.add('show');
        this.updateUI(true);
    }

    public toggleMusic(enabled: boolean): void {
        this.musicEnabled = enabled;
        this.soundManager.setMusicEnabled(enabled);
        localStorage.setItem('breakout_musicEnabled', enabled.toString());
    }

    public toggleSound(enabled: boolean): void {
        this.soundEnabled = enabled;
        this.soundManager.setSoundEnabled(enabled);
        localStorage.setItem('breakout_soundEnabled', enabled.toString());
    }

    public setBackground(type: BackgroundType): void {
        this.backgroundType = type;
        this.backdrop.setPalette(this.palette);
        this.applyThemeToPage();
        this.drawPaddle();
        this.balls.forEach(ball => this.drawBall(ball));
        localStorage.setItem('breakout_background', type);
    }

    public playUiSound(): void {
        this.soundManager.playUiClick();
    }

    public destroy(): void {
        this.cancelLevelClear();
        window.removeEventListener('resize', this.resizeHandler);
        window.removeEventListener('orientationchange', this.resizeHandler);
        window.visualViewport?.removeEventListener('resize', this.resizeHandler);
        this.app.destroy(true);
    }

    private applyThemeToPage(): void {
        document.body.dataset.theme = this.themeName;
    }

    private prepareFreshRun(): void {
        if (this.gameState === 'won') {
            this.currentLevel = 1;
        }
        this.score = 0;
        this.lives = 3;
        this.newHighScore = false;
        this.initializeGame();
    }

    private initializeGame(): void {
        this.cancelLevelClear();
        this.soundManager.stopBossMusic();
        this.shownReward = null;
        this.updateLevelGrid();
        this.calculateTimeLimit();
        this.timeLeft = this.timeLimit;
        this.timeBarMax = this.timeLimit;
        this.clockRunning = false;
        this.combo = 0;
        this.bestCombo = 0;
        this.bricksBroken = 0;

        this.resetArena();
        this.createBricks();
        this.updateUI(true);
    }

    private resetArena(): void {
        this.clearPowerUpDrops();
        this.activePowerUpEffects.clear();
        this.effects.clear();
        this.clearBalls();
        this.clearBoss();
        this.invulnerable = 0;
        this.adjustSpeedForLevel();

        this.paddleWidthNow = this.getCurrentPaddleWidth();
        this.paddleX = GAME_WIDTH / 2 - this.paddleWidthNow / 2;
        this.pointerX = GAME_WIDTH / 2;
        this.drawPaddle();
        this.spawnBall(true);
    }

    private beginBossFight(): void {
        const config = BOSS_LEVELS[this.currentLevel];
        if (!config) return;

        this.cancelLevelClear();
        this.timeLimit = BOSS_TIME;
        this.timeLeft = BOSS_TIME;
        this.timeBarMax = BOSS_TIME;
        this.applyPendingReward();
        this.clockRunning = false;
        this.combo = 0;
        this.bestCombo = 0;
        this.bricksContainer.removeChildren().forEach(child => child.destroy());
        this.bricks = [];
        this.layout = null;

        this.resetArena();
        this.boss = new Boss(config, this.bossLayer, this.glowTexture, GAME_WIDTH, GAME_HEIGHT, SCALE_FACTOR);
        this.soundManager.startBossMusic(config.style);
        this.updateUI(true);
        this.showLevelStartPopup();
    }

    private retryBoss(): void {
        this.pendingReward = null;
        this.score = 0;
        this.lives = 3;
        this.newHighScore = false;
        this.beginBossFight();
    }

    public startBoss(level: number): void {
        if (!BOSS_LEVELS[level] || level > this.highestLevelUnlocked) return;

        this.currentLevel = level;
        localStorage.setItem('breakout_lastPlayedLevel', level.toString());
        ['levelSelectScreen', 'sideMenu', 'gamePopup', 'levelStartPopup'].forEach(id =>
            document.getElementById(id)?.classList.remove('show'),
        );
        this.updateLevelGrid();
        this.retryBoss();
    }

    private clearBoss(): void {
        this.boss?.destroy();
        this.boss = null;
    }

    private updateBoss(dt: number): void {
        const boss = this.boss;
        if (!boss) return;

        const firing = this.gameState === 'playing' && this.clockRunning && this.balls.some(ball => !ball.attached);
        const animate = firing || this.gameState === 'levelIntro' || this.gameState === 'levelClear' || this.gameState === 'playing';
        if (!animate) return;

        if (boss.update(dt, this.paddleCenter(), firing)) {
            this.soundManager.playBossShot(boss.config.style);
        }
        if (this.gameState !== 'playing') return;

        if (boss.enraged && !boss.defeated && Math.random() < 0.15 * dt) {
            const point = boss.randomPoint();
            this.effects.sparks(point.x, point.y, Math.random() < 0.5 ? 0xff3b3b : 0xffb36b, 4);
        }

        this.invulnerable = Math.max(0, this.invulnerable - dt);
        const paddle: Rect = { x: this.paddleX, y: this.paddleY(), width: this.paddleWidthNow, height: PADDLE_HEIGHT };
        if (boss.takeShotHitting(paddle) && this.invulnerable <= 0) {
            this.damagePlayer();
        }
    }

    private damagePlayer(): void {
        this.lives--;
        this.combo = 0;
        this.invulnerable = INVULNERABLE_FRAMES;
        this.boss?.clearShots();
        this.effects.flash(0xff2a6d, 0.45);
        this.effects.shake(9);
        this.effects.burst(this.paddleCenter(), this.paddleY(), 0xff3b3b, 20);
        this.soundManager.playLifeLost();

        if (this.lives <= 0) {
            this.showGameOver();
            return;
        }
        this.effects.showBanner('HULL HIT', `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, 0xff3b3b);
    }

    private hitBoss(ball: Ball): void {
        const boss = this.boss;
        if (!boss || boss.defeated) return;

        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const multiplier = this.comboMultiplier();
        this.addScore(BOSS_HIT_POINTS * multiplier);

        const result = boss.hit(1);
        this.effects.sparks(ball.x, ball.y, boss.config.color, 10);
        this.effects.floatText(ball.x, ball.y - 14 * SCALE_FACTOR, `+${BOSS_HIT_POINTS * multiplier}`, boss.config.color, 9);
        this.effects.shake(2.5);
        this.soundManager.playBossHit(boss.config.style);

        if (result.defeated) {
            this.onBossDefeated();
            return;
        }
        if (result.enraged) {
            this.onBossEnraged();
        } else if (boss.hp % BOSS_DROP_EVERY === 0) {
            this.dropBossLoot(1);
        }
    }

    private onBossEnraged(): void {
        const boss = this.boss;
        if (!boss) return;

        this.soundManager.playBossRoar(boss.config.style);
        this.soundManager.setBossEnraged(true);
        this.effects.flash(0xff1a1a, 0.5);
        this.effects.shake(14);
        this.effects.ring(boss.x, boss.y, 0xff3b3b, 180);
        this.effects.showBanner('ENRAGED!', boss.config.style === 'saucer' ? 'THE ALIEN IS FURIOUS' : 'THE MOTHERSHIP UNLEASHES HELL', 0xff3b3b, GAME_HEIGHT * 0.5);
        this.dropBossLoot(2);
    }

    private dropBossLoot(count: number): void {
        const boss = this.boss;
        if (!boss) return;

        const exclude: PowerUpType[] = ['paddle_small', 'speed_fast'];
        if (this.lives >= MAX_LIVES) exclude.push('extra_life');
        for (let i = 0; i < count && this.powerUps.length < MAX_FALLING_POWER_UPS; i++) {
            const offset = (i - (count - 1) / 2) * boss.width * 0.35;
            this.createPowerUp(boss.x + offset, boss.y + boss.height / 2, pickWeightedPowerUp(exclude));
        }
    }

    private onBossDefeated(): void {
        const boss = this.boss;
        if (!boss || this.gameState !== 'playing') return;

        this.gameState = 'levelClear';
        const reward = this.grantRoundReward(boss.config.reward);
        this.saveHighScore();
        this.clearPowerUpDrops();

        const box = boss.hitbox();
        for (let i = 0; i < 6; i++) {
            const x = box.x + Math.random() * box.width;
            const y = box.y + Math.random() * box.height;
            this.effects.burst(x, y, i % 2 ? boss.config.color : 0xffd319, 18);
            this.effects.ring(x, y, i % 2 ? 0xffffff : boss.config.accent, 70 + i * 15);
        }
        this.effects.flash(0xffffff, 0.5);
        this.effects.shake(16);
        this.soundManager.playExplosion();
        this.soundManager.playLevelClear();
        this.effects.showBanner('BOSS DEFEATED', this.describeReward(reward), 0xffd319);
        this.soundManager.stopBossMusic();

        this.levelClearTimer = window.setTimeout(() => {
            this.levelClearTimer = null;
            if (this.gameState === 'levelClear') {
                this.levelComplete();
            }
        }, 3200);
    }

    private resetGame(): void {
        this.score = 0;
        this.lives = 3;
        this.newHighScore = false;
        if (this.gameState === 'won') {
            this.currentLevel = 1;
        }
        this.gameState = 'playing';
        this.initializeGame();
    }

    private levelComplete(): void {
        this.currentLevel++;
        if (this.currentLevel > this.highestLevelUnlocked) {
            this.highestLevelUnlocked = Math.min(this.currentLevel, this.MAX_LEVELS);
            localStorage.setItem('breakout_highestLevel', this.highestLevelUnlocked.toString());
        }

        if (this.currentLevel > this.MAX_LEVELS) {
            this.currentLevel = this.MAX_LEVELS;
            this.showWin();
            return;
        }

        localStorage.setItem('breakout_lastPlayedLevel', this.currentLevel.toString());
        this.initializeGame();
        this.applyPendingReward();
        this.showLevelStartPopup();
    }

    private onLevelCleared(): void {
        if (this.gameState !== 'playing') return;

        this.gameState = 'levelClear';
        const reward = this.grantRoundReward(Math.ceil(this.timeLeft) * 10);
        this.saveHighScore();
        this.clearPowerUpDrops();

        this.soundManager.playLevelClear();
        this.effects.flash(0xffffff, 0.25);
        this.effects.showBanner('STAGE CLEAR', this.describeReward(reward), 0x3df5a7);

        this.levelClearTimer = window.setTimeout(() => {
            this.levelClearTimer = null;
            if (this.gameState !== 'levelClear') return;
            if (BOSS_LEVELS[this.currentLevel]) {
                this.beginBossFight();
            } else {
                this.levelComplete();
            }
        }, 2400);
    }

    private grantRoundReward(points: number): RoundReward {
        const reward: RoundReward = { time: Math.floor(this.timeLeft), lives: 1, points };
        this.bank.time = Math.min(MAX_BANK_TIME, this.bank.time + reward.time);
        this.bank.lives = Math.min(MAX_LIVES, this.bank.lives + reward.lives);
        this.saveBank();
        this.addScore(points);
        this.pendingReward = reward;
        return reward;
    }

    private describeReward(reward: RoundReward): string {
        const parts: string[] = [];
        if (reward.lives) parts.push('+1 LIFE');
        if (reward.time) parts.push(`+${this.formatTime(reward.time)} TIME`);
        parts.push(`+${reward.points} PTS`);
        return parts.join('  ');
    }

    private applyPendingReward(): void {
        this.shownReward = this.pendingReward;
        this.pendingReward = null;
    }

    private saveBank(): void {
        localStorage.setItem('breakout_bonusBank', JSON.stringify(this.bank));
    }

    private bankIsEmpty(): boolean {
        return this.bank.time <= 0 && this.bank.lives <= 0;
    }

    private useBonusPreferred(): boolean {
        return localStorage.getItem('breakout_useBonus') !== 'false';
    }

    private spendBank(): void {
        if (this.bankIsEmpty()) return;

        const lives = Math.min(this.bank.lives, MAX_LIVES - this.lives);
        const time = this.bank.time;
        this.lives += lives;
        this.bank.lives -= lives;
        this.timeLimit += time;
        this.timeLeft += time;
        this.timeBarMax = Math.max(this.timeBarMax, this.timeLeft);
        this.bank.time = 0;
        this.saveBank();

        const parts: string[] = [];
        if (lives) parts.push(`+${lives} ${lives === 1 ? 'LIFE' : 'LIVES'}`);
        if (time) parts.push(`+${this.formatTime(time)} TIME`);
        if (parts.length) {
            this.effects.showBanner('BONUS USED', parts.join('  '), 0x05d9e8, GAME_HEIGHT * 0.5);
            this.soundManager.playPowerUp();
        }
    }

    private renderBankPanel(resume: boolean): void {
        const panel = document.getElementById('levelStartBank');
        const chips = document.getElementById('bonusBankChips');
        const toggle = document.getElementById('useBonusToggle') as HTMLInputElement | null;
        if (!panel || !chips) return;

        const visible = !resume && !this.bankIsEmpty();
        panel.hidden = !visible;
        if (!visible) return;

        chips.innerHTML =
            (this.bank.lives ? `<span class="reward-chip reward-life">+${this.bank.lives} ${this.bank.lives === 1 ? 'Life' : 'Lives'}${this.bank.lives >= MAX_LIVES ? ' · Max' : ''}</span>` : '') +
            (this.bank.time
                ? `<span class="reward-chip reward-time">+${this.formatTime(this.bank.time)} Time${this.bank.time >= MAX_BANK_TIME ? ' · Max' : ''}</span>`
                : '');
        if (toggle) toggle.checked = this.useBonusPreferred();
    }

    private cancelLevelClear(): void {
        if (this.levelClearTimer !== null) {
            clearTimeout(this.levelClearTimer);
            this.levelClearTimer = null;
        }
    }

    private loseLife(): void {
        this.lives--;
        this.combo = 0;
        this.effects.flash(0xff2a6d, 0.4);
        this.effects.shake(10);
        this.effects.burst(this.lastLostX, GAME_HEIGHT - 6, 0xff2a6d, 18);
        this.soundManager.playLifeLost();
        this.clearActivePowerUps();
        this.boss?.clearShots();
        this.invulnerable = INVULNERABLE_FRAMES;

        if (this.lives <= 0) {
            this.showGameOver();
            return;
        }

        this.effects.showBanner('LIFE LOST', `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, 0xff2a6d);
        this.spawnBall(true);
    }

    private showGameOver(): void {
        this.gameState = 'gameOver';
        this.soundManager.stopBossMusic();
        this.addToHistory('Loss');
        this.soundManager.playGameOver();
        this.showResultPopup({
            title: 'Game Over',
            message: this.boss ? `The ${this.boss.config.name} shot you down.` : `Stage ${pad(this.currentLevel, 2)} got the better of you.`,
            tone: 'danger',
            actions: this.retryActions(),
        });
    }

    private handleTimeUp(): void {
        if (this.gameState !== 'playing') return;
        this.gameState = 'gameOver';
        this.soundManager.stopBossMusic();
        this.addToHistory('Loss');
        this.soundManager.playGameOver();
        this.showResultPopup({
            title: "Time's Up",
            message: `The clock beat you on stage ${pad(this.currentLevel, 2)}.`,
            tone: 'danger',
            actions: this.retryActions(),
        });
    }

    private showWin(): void {
        this.gameState = 'won';
        this.addToHistory('Win');
        this.soundManager.playLevelClear();
        this.showResultPopup({
            title: 'You Win!',
            message: `All ${this.MAX_LEVELS} stages cleared. Absolute legend.`,
            tone: 'success',
            actions: [
                { label: 'Play Again', variant: 'primary', onClick: () => this.startLevel(1) },
                { label: 'Select Stage', variant: 'secondary', onClick: () => this.openLevelSelect() },
            ],
        });
    }

    private retryActions(): PopupAction[] {
        return [
            this.boss
                ? { label: 'Retry Boss', variant: 'primary', onClick: () => this.retryBoss() }
                : { label: 'Retry Stage', variant: 'primary', onClick: () => this.startLevel(this.currentLevel) },
            { label: 'Select Stage', variant: 'secondary', onClick: () => this.openLevelSelect() },
        ];
    }

    private showResultPopup({ title, message, tone, actions }: ResultPopup): void {
        const popup = document.getElementById('gamePopup');
        const content = popup?.querySelector<HTMLElement>('.popup-content');
        const popupTitle = document.getElementById('popupTitle');
        const popupMessage = document.getElementById('popupMessage');
        if (!popup || !content || !popupTitle || !popupMessage) return;

        content.dataset.tone = tone;
        popupTitle.textContent = title;
        popupMessage.textContent = message;
        document.getElementById('popupOkBtn')?.style.setProperty('display', 'none');

        let stats = document.getElementById('popupStats');
        if (!stats) {
            stats = document.createElement('div');
            stats.id = 'popupStats';
            stats.className = 'result-stats';
            popupMessage.after(stats);
        }
        stats.innerHTML = `
            ${statCell('Score', this.score.toLocaleString())}
            ${statCell('Best Combo', `x${this.bestCombo}`)}
            ${this.boss ? statCell('Boss Hull', `${this.boss.hp}/${this.boss.config.hp}`) : statCell('Bricks', `${this.bricksBroken}`)}
            ${this.newHighScore ? '<p class="new-record">New High Score!</p>' : ''}
        `;

        let actionBar = document.getElementById('popupActions');
        if (!actionBar) {
            actionBar = document.createElement('div');
            actionBar.id = 'popupActions';
            actionBar.className = 'popup-buttons';
            content.appendChild(actionBar);
        }
        actionBar.innerHTML = '';
        for (const action of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `btn btn-${action.variant} confirm-btn ${action.variant === 'primary' ? 'yes-btn' : 'no-btn'}`;
            button.textContent = action.label;
            button.addEventListener('click', () => {
                popup.classList.remove('show');
                action.onClick();
            });
            actionBar.appendChild(button);
        }

        popup.classList.add('show');
    }

    private gameLoop(ticker: PIXI.Ticker): void {
        const dt = Math.min(ticker.deltaTime, 2);
        this.elapsed += dt;

        this.backdrop.update(dt);
        this.effects.update(dt);
        this.animateBricks(dt);
        this.animatePaddle(dt);

        if (this.gameState === 'playing') {
            this.updatePaddle(dt);
            this.updateBalls(dt);
            this.updatePowerUps(dt, ticker.deltaMS);
            this.updateTimer(ticker.deltaMS);
        }
        this.updateBoss(dt);

        this.drawTrails();
        this.updateLaunchPrompt();
        this.updateUI();
    }

    private updateTimer(deltaMS: number): void {
        if (!this.clockRunning) return;
        this.timeLeft = Math.max(0, this.timeLeft - deltaMS / 1000);
        if (this.timeLeft <= 0) {
            this.handleTimeUp();
        }
    }

    private calculateTimeLimit(): void {
        const baseTime = 120;
        const reductionPerLevel = 5;
        const minimumTime = 30;
        this.timeLimit = Math.max(minimumTime, baseTime - (this.currentLevel - 1) * reductionPerLevel);
    }

    private adjustSpeedForLevel(): void {
        const MAX_BALL_SPEED = 7.5;
        this.baseBallSpeed = Math.min(MAX_BALL_SPEED, 6 + (this.currentLevel - 1) * 0.1) * SCALE_FACTOR;
        this.applyBallSpeed();
    }

    private getBallSpeed(): number {
        if (this.activePowerUpEffects.has('speed_fast')) return this.baseBallSpeed * 1.5;
        if (this.activePowerUpEffects.has('speed_slow')) return this.baseBallSpeed / 1.5;
        return this.baseBallSpeed;
    }

    private applyBallSpeed(): void {
        const speed = this.getBallSpeed();
        this.balls.filter(ball => !ball.attached).forEach(ball => this.normalizeVelocity(ball, speed));
    }

    private normalizeVelocity(ball: Ball, speed: number): void {
        const length = Math.hypot(ball.vx, ball.vy);
        if (length === 0) {
            ball.vx = 0;
            ball.vy = -speed;
            return;
        }
        ball.vx = (ball.vx / length) * speed;
        ball.vy = (ball.vy / length) * speed;

        const minVertical = speed * 0.28;
        if (Math.abs(ball.vy) < minVertical) {
            ball.vy = (ball.vy < 0 ? -1 : 1) * minVertical;
            ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - minVertical * minVertical);
        }
    }

    private getCurrentPaddleWidth(): number {
        const multiplier = Math.max(0.7, 1.2 - (this.currentLevel - 1) * 0.02);
        let width = PADDLE_WIDTH * multiplier;
        if (this.activePowerUpEffects.has('paddle_big')) {
            width *= 1.5;
        } else if (this.activePowerUpEffects.has('paddle_small')) {
            width *= 0.7;
        }
        return width;
    }

    private paddleY(): number {
        return GAME_HEIGHT - Math.max(24, Math.round(50 * SCALE_FACTOR));
    }

    private paddleCenter(): number {
        return this.paddleX + this.paddleWidthNow / 2;
    }

    private paddleColor(): number {
        if (this.activePowerUpEffects.has('paddle_big')) return POWER_UPS.paddle_big.color;
        if (this.activePowerUpEffects.has('paddle_small')) return POWER_UPS.paddle_small.color;
        if (this.activePowerUpEffects.has('speed_fast')) return POWER_UPS.speed_fast.color;
        if (this.activePowerUpEffects.has('speed_slow')) return POWER_UPS.speed_slow.color;
        return this.palette.paddle;
    }

    private ballColor(): number {
        if (this.activePowerUpEffects.has('speed_fast')) return POWER_UPS.speed_fast.color;
        if (this.activePowerUpEffects.has('speed_slow')) return POWER_UPS.speed_slow.color;
        return this.palette.ball;
    }

    private updatePaddle(dt: number): void {
        const direction = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
        if (direction !== 0) {
            this.pointerX = clamp(this.pointerX + direction * 12 * SCALE_FACTOR * dt, 0, GAME_WIDTH);
        }

        const width = this.paddleWidthNow;
        const target = clamp(this.pointerX - width / 2, 0, GAME_WIDTH - width);
        this.paddleX += (target - this.paddleX) * Math.min(1, 0.55 * dt);
    }

    private animatePaddle(dt: number): void {
        const targetWidth = this.getCurrentPaddleWidth();
        const widthDelta = targetWidth - this.paddleWidthNow;
        if (Math.abs(widthDelta) > 0.5) {
            const step = widthDelta * Math.min(1, 0.2 * dt);
            this.paddleWidthNow += step;
            this.paddleX = clamp(this.paddleX - step / 2, 0, GAME_WIDTH - this.paddleWidthNow);
            this.drawPaddle();
        }

        this.paddleFlash = Math.max(0, this.paddleFlash - 0.06 * dt);
        this.paddleSquash = Math.max(0, this.paddleSquash - 0.1 * dt);

        this.paddle.position.set(this.paddleCenter(), this.paddleY() + PADDLE_HEIGHT / 2);
        this.paddle.scale.set(1 + this.paddleSquash * 0.08, 1 - this.paddleSquash * 0.3);
        this.paddleGlow.position.copyFrom(this.paddle.position);
        this.paddleGlow.alpha = 0.35 + this.paddleFlash * 0.65;
        const blinking = this.invulnerable > 0 && Math.floor(this.invulnerable / 6) % 2 === 0;
        this.paddle.alpha = blinking ? 0.3 : 1;
    }

    private drawPaddle(): void {
        const w = this.paddleWidthNow;
        const h = PADDLE_HEIGHT;
        const r = h / 2;
        const color = this.paddleColor();

        this.paddle
            .clear()
            .roundRect(-w / 2, -h / 2, w, h, r)
            .fill({ color: 0x0b0322, alpha: 0.95 })
            .roundRect(-w / 2, -h / 2, w, h, r)
            .stroke({ color, width: Math.max(2, 2.5 * SCALE_FACTOR) })
            .roundRect(-w / 2 + r, -h * 0.14, Math.max(0, w - r * 2), h * 0.28, h * 0.14)
            .fill({ color, alpha: 0.95 })
            .circle(-w / 2 + r, 0, h * 0.18)
            .fill(0xffffff)
            .circle(w / 2 - r, 0, h * 0.18)
            .fill(0xffffff);

        this.paddleGlow.tint = color;
        this.paddleGlow.width = w * 1.6;
        this.paddleGlow.height = h * 4;
    }

    private spawnBall(attached: boolean, x?: number, y?: number, vx: number = 0, vy: number = 0): Ball {
        const ball: Ball = {
            body: new PIXI.Graphics(),
            glow: new PIXI.Sprite(this.glowTexture),
            x: x ?? this.paddleCenter(),
            y: y ?? this.paddleY() - BALL_RADIUS - 1,
            vx,
            vy,
            attached,
            trail: [],
        };
        ball.glow.anchor.set(0.5);
        ball.glow.blendMode = 'add';
        this.drawBall(ball);
        ball.body.position.set(ball.x, ball.y);
        ball.glow.position.set(ball.x, ball.y);
        this.gameObjectsContainer.addChild(ball.glow, ball.body);
        this.balls.push(ball);
        return ball;
    }

    private drawBall(ball: Ball): void {
        const color = this.ballColor();
        ball.body
            .clear()
            .circle(0, 0, BALL_RADIUS)
            .fill(0xffffff)
            .circle(0, 0, BALL_RADIUS * 0.55)
            .fill({ color, alpha: 0.35 });
        ball.glow.tint = color;
        ball.glow.width = BALL_RADIUS * 7;
        ball.glow.height = BALL_RADIUS * 7;
        ball.glow.alpha = 0.9;
    }

    private removeBall(ball: Ball): void {
        this.balls.splice(this.balls.indexOf(ball), 1);
        ball.body.destroy();
        ball.glow.destroy();
    }

    private clearBalls(): void {
        [...this.balls].forEach(ball => this.removeBall(ball));
        this.trailGfx.clear();
    }

    private launchBalls(): void {
        const waiting = this.balls.filter(ball => ball.attached);
        if (waiting.length === 0) return;

        const speed = this.getBallSpeed();
        for (const ball of waiting) {
            const angle = (Math.random() - 0.5) * 0.6;
            ball.attached = false;
            ball.vx = speed * Math.sin(angle);
            ball.vy = -speed * Math.cos(angle);
        }

        this.clockRunning = true;
        this.soundManager.playLaunch();
        this.effects.ring(this.paddleCenter(), this.paddleY(), this.paddleColor(), 40);
    }

    private updateBalls(dt: number): void {
        for (const ball of [...this.balls]) {
            if (!this.balls.includes(ball)) continue;
            if (ball.attached) {
                ball.x = this.paddleCenter();
                ball.y = this.paddleY() - BALL_RADIUS - 1;
                ball.trail = [];
            } else {
                const travel = Math.hypot(ball.vx, ball.vy) * dt;
                const steps = Math.max(1, Math.ceil(travel / (BALL_RADIUS * 0.5)));

                for (let step = 0; step < steps; step++) {
                    ball.x += (ball.vx * dt) / steps;
                    ball.y += (ball.vy * dt) / steps;
                    this.collideWalls(ball);
                    this.collidePaddle(ball);
                    this.collideBricks(ball);
                    this.collideBoss(ball);
                    if (this.gameState !== 'playing') break;
                }

                if (ball.y - BALL_RADIUS > GAME_HEIGHT) {
                    this.lastLostX = ball.x;
                    this.removeBall(ball);
                    continue;
                }

                ball.trail.push({ x: ball.x, y: ball.y });
                if (ball.trail.length > TRAIL_LENGTH) ball.trail.shift();
            }

            ball.body.position.set(ball.x, ball.y);
            ball.glow.position.set(ball.x, ball.y);
        }

        if (this.balls.length === 0 && this.gameState === 'playing') {
            this.loseLife();
        }
    }

    private collideWalls(ball: Ball): void {
        if (ball.x < BALL_RADIUS) {
            ball.x = BALL_RADIUS;
            ball.vx = Math.abs(ball.vx);
        } else if (ball.x > GAME_WIDTH - BALL_RADIUS) {
            ball.x = GAME_WIDTH - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx);
        }

        if (ball.y < BALL_RADIUS) {
            ball.y = BALL_RADIUS;
            ball.vy = Math.abs(ball.vy);
        }
    }

    private collidePaddle(ball: Ball): void {
        if (ball.vy <= 0) return;

        const left = this.paddleX;
        const top = this.paddleY();
        const width = this.paddleWidthNow;

        if (ball.y + BALL_RADIUS < top || ball.y - BALL_RADIUS > top + PADDLE_HEIGHT) return;
        if (ball.x + BALL_RADIUS < left || ball.x - BALL_RADIUS > left + width) return;

        const hit = clamp((ball.x - (left + width / 2)) / (width / 2 + BALL_RADIUS), -1, 1);
        const angle = hit * MAX_BOUNCE_ANGLE;
        const speed = this.getBallSpeed();
        ball.vx = speed * Math.sin(angle);
        ball.vy = -speed * Math.cos(angle);
        ball.y = top - BALL_RADIUS - 0.5;

        this.combo = 0;
        this.paddleFlash = 1;
        this.paddleSquash = 1;
        this.soundManager.playPaddleHit();
        this.effects.sparks(ball.x, top, this.paddleColor(), 5);
    }

    private collideBricks(ball: Ball): void {
        for (const brick of this.bricks) {
            if (!brick.alive) continue;
            if (this.bounceOffRect(ball, { x: brick.x, y: brick.y, width: BRICK_WIDTH, height: BRICK_HEIGHT })) {
                this.hitBrick(brick);
                return;
            }
        }
    }

    private collideBoss(ball: Ball): void {
        if (!this.boss || this.boss.defeated || this.gameState !== 'playing') return;
        if (this.bounceOffRect(ball, this.boss.hitbox())) {
            this.hitBoss(ball);
        }
    }

    private bounceOffRect(ball: Ball, rect: Rect): boolean {
        const nearestX = clamp(ball.x, rect.x, rect.x + rect.width);
        const nearestY = clamp(ball.y, rect.y, rect.y + rect.height);
        const dx = ball.x - nearestX;
        const dy = ball.y - nearestY;
        if (dx * dx + dy * dy > BALL_RADIUS * BALL_RADIUS) return false;

        if (Math.abs(dx) > Math.abs(dy)) {
            ball.vx = Math.sign(dx) * Math.abs(ball.vx);
            ball.x = dx > 0 ? rect.x + rect.width + BALL_RADIUS : rect.x - BALL_RADIUS;
        } else if (dy !== 0) {
            ball.vy = Math.sign(dy) * Math.abs(ball.vy);
            ball.y = dy > 0 ? rect.y + rect.height + BALL_RADIUS : rect.y - BALL_RADIUS;
        } else {
            ball.vy = -ball.vy;
        }

        this.normalizeVelocity(ball, this.getBallSpeed());
        return true;
    }

    private comboMultiplier(): number {
        return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.combo / COMBO_STEP));
    }

    private hitBrick(brick: Brick): void {
        brick.hp--;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const multiplier = this.comboMultiplier();
        const cx = brick.x + BRICK_WIDTH / 2;
        const cy = brick.y + BRICK_HEIGHT / 2;

        if (brick.hp <= 0) {
            this.destroyBrick(brick, multiplier, true);
        } else {
            this.addScore(5 * multiplier);
            this.drawBrick(brick);
            this.effects.flashRect(brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT);
            this.effects.sparks(cx, cy, brick.color);
            this.soundManager.playArmorHit();
        }

        if (this.combo >= COMBO_STEP && this.combo % COMBO_STEP === 0 && this.combo <= (MAX_MULTIPLIER - 1) * COMBO_STEP) {
            this.effects.floatText(cx, cy - 18 * SCALE_FACTOR, `COMBO x${multiplier}`, 0xffd319, 11);
            this.soundManager.playCombo(this.combo);
        }
    }

    private destroyBrick(brick: Brick, multiplier: number, dropsLoot: boolean): void {
        brick.alive = false;
        brick.gfx.visible = false;
        this.bricksBroken++;

        const points = 10 * brick.maxHp * multiplier;
        const cx = brick.x + BRICK_WIDTH / 2;
        const cy = brick.y + BRICK_HEIGHT / 2;
        this.addScore(points);

        this.effects.flashRect(brick.x, brick.y, BRICK_WIDTH, BRICK_HEIGHT, brick.color);
        this.effects.burst(cx, cy, brick.color, 12);
        this.effects.floatText(cx, cy, `+${points}`, brick.color, 8);
        this.effects.shake(1.5);
        this.soundManager.playBrickHit();

        if (dropsLoot) {
            this.spawnPowerUpFromBrick(cx, cy);
        }

        if (this.allBricksDestroyed()) {
            this.onLevelCleared();
        }
    }

    private allBricksDestroyed(): boolean {
        return this.bricks.every(brick => !brick.alive);
    }

    private addScore(points: number): void {
        this.score += points;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.newHighScore = true;
        }
    }

    private createBricks(): void {
        this.bricksContainer.removeChildren().forEach(child => child.destroy());
        this.layout = buildLevel(this.currentLevel, BRICK_COLS);
        this.updateBrickMetrics();
        this.bricks = [];

        const colorShift = Math.floor((this.currentLevel - 1) / 3);
        this.layout.cells.forEach((rowCells, row) => {
            rowCells.forEach((hp, col) => {
                if (!hp) return;
                const brick: Brick = {
                    gfx: new PIXI.Graphics(),
                    row,
                    col,
                    x: 0,
                    y: 0,
                    hp,
                    maxHp: hp,
                    color: BRICK_COLORS[(row + colorShift) % BRICK_COLORS.length],
                    alive: true,
                    intro: 0,
                    introDelay: (row * 2 + col) * 1.6 + Math.random() * 4,
                };
                this.positionBrick(brick);
                this.drawBrick(brick);
                brick.gfx.alpha = 0;
                this.bricksContainer.addChild(brick.gfx);
                this.bricks.push(brick);
            });
        });
    }

    private layoutColumns(): number {
        return this.layout?.cells[0]?.length ?? BRICK_COLS;
    }

    private updateBrickMetrics(): void {
        const cols = this.layoutColumns();
        BRICK_WIDTH = Math.floor(Math.min(75 * SCALE_FACTOR, (GAME_WIDTH - (cols + 1) * BRICK_PADDING) / cols));
    }

    private positionBrick(brick: Brick): void {
        const cols = this.layoutColumns();
        const gridWidth = cols * BRICK_WIDTH + (cols - 1) * BRICK_PADDING;
        const offsetX = (GAME_WIDTH - gridWidth) / 2;
        const offsetY = Math.max(20, Math.round(50 * SCALE_FACTOR));
        brick.x = offsetX + brick.col * (BRICK_WIDTH + BRICK_PADDING);
        brick.y = offsetY + brick.row * (BRICK_HEIGHT + BRICK_PADDING);
        brick.gfx.position.set(brick.x, brick.y);
    }

    private animateBricks(dt: number): void {
        for (const brick of this.bricks) {
            if (!brick.alive || brick.intro >= 1) continue;
            brick.introDelay -= dt;
            if (brick.introDelay > 0) continue;

            brick.intro = Math.min(1, brick.intro + dt / 18);
            const eased = 1 - Math.pow(1 - brick.intro, 3);
            brick.gfx.y = brick.y - (1 - eased) * 30 * SCALE_FACTOR;
            brick.gfx.alpha = eased;
        }
    }

    private drawBrick(brick: Brick): void {
        const w = BRICK_WIDTH;
        const h = BRICK_HEIGHT;
        const r = Math.max(2, Math.round(h * 0.2));
        const line = Math.max(1.5, 2 * SCALE_FACTOR);
        const health = brick.hp / brick.maxHp;
        const g = brick.gfx;

        g.clear()
            .roundRect(-line, -line, w + line * 2, h + line * 2, r + line)
            .fill({ color: brick.color, alpha: 0.18 })
            .roundRect(0, 0, w, h, r)
            .fill({ color: 0x0b0322, alpha: 0.92 })
            .roundRect(0, 0, w, h, r)
            .fill({ color: brick.color, alpha: 0.25 + 0.3 * health })
            .roundRect(0, 0, w, h, r)
            .stroke({ color: brick.color, width: line })
            .rect(r, Math.max(2, h * 0.14), w - r * 2, Math.max(1, h * 0.12))
            .fill({ color: 0xffffff, alpha: 0.5 });

        if (brick.maxHp > 1) {
            const inset = Math.max(3, h * 0.22);
            const rivet = Math.max(2, Math.round(2 * SCALE_FACTOR));
            g.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(1, r - 2)).stroke({
                color: 0xffffff,
                width: 1,
                alpha: 0.45,
            });
            [
                [inset - rivet, inset - rivet],
                [w - inset, inset - rivet],
                [inset - rivet, h - inset],
                [w - inset, h - inset],
            ].forEach(([x, y]) => g.rect(x, y, rivet, rivet).fill({ color: 0xffffff, alpha: 0.85 }));

            const pip = Math.max(2, Math.round(3 * SCALE_FACTOR));
            for (let i = 0; i < brick.hp; i++) {
                const x = w / 2 + (i - (brick.hp - 1) / 2) * pip * 2 - pip / 2;
                g.rect(x, h / 2 - pip / 2, pip, pip).fill(0xffffff);
            }
        }

        if (brick.hp < brick.maxHp) {
            const seed = (brick.row * 31 + brick.col * 17) % 5;
            const crackX = w * (0.25 + seed * 0.1);
            g.poly(
                [crackX, 0, crackX - w * 0.06, h * 0.4, crackX + w * 0.05, h * 0.65, crackX - w * 0.02, h],
                false,
            ).stroke({ color: 0xffffff, width: 1, alpha: 0.75 });

            if (health <= 1 / 3) {
                const mirrorX = w - crackX;
                g.poly([mirrorX, h, mirrorX + w * 0.05, h * 0.55, mirrorX - w * 0.04, h * 0.3, mirrorX, 0], false).stroke({
                    color: 0xffffff,
                    width: 1,
                    alpha: 0.75,
                });
            }
        }
    }

    private drawTrails(): void {
        const g = this.trailGfx;
        g.clear();
        const color = this.ballColor();
        for (const ball of this.balls) {
            ball.trail.forEach((point, index) => {
                const t = (index + 1) / TRAIL_LENGTH;
                g.circle(point.x, point.y, BALL_RADIUS * (0.35 + 0.6 * t)).fill({ color, alpha: 0.28 * t });
            });
        }
    }

    private updateLaunchPrompt(): void {
        if (!this.launchPrompt) return;
        const waiting = this.gameState === 'playing' && this.balls.some(ball => ball.attached);
        this.launchPrompt.visible = waiting;
        if (!waiting) return;
        this.launchPrompt.position.set(GAME_WIDTH / 2, this.paddleY() - 48 * SCALE_FACTOR);
        this.launchPrompt.alpha = 0.75 + 0.25 * Math.sin(this.elapsed * 0.12);
    }

    private getPowerUpSpawnChance(): number {
        const base = Math.max(0.4, 0.7 - (this.currentLevel - 1) * 0.05);
        if (this.currentLevel > 20) {
            return Math.max(0.1, base - (this.currentLevel - 20) * 0.025);
        }
        return base;
    }

    private spawnPowerUpFromBrick(x: number, y: number): void {
        if (this.powerUps.length >= MAX_FALLING_POWER_UPS) return;
        if (Math.random() >= this.getPowerUpSpawnChance()) return;
        const exclude: PowerUpType[] = this.lives >= MAX_LIVES ? ['extra_life'] : [];
        this.createPowerUp(x, y, pickWeightedPowerUp(exclude));
    }

    private getSpriteFrames(type: PowerUpType): PIXI.Texture[] {
        const cached = this.spriteFrames.get(type);
        if (cached) return cached;
        if (!this.powerUpBaseTexture) return [PIXI.Texture.EMPTY];

        const { row, frames } = POWER_UPS[type];
        const textures = Array.from(
            { length: frames },
            (_, col) =>
                new PIXI.Texture({
                    source: this.powerUpBaseTexture!.source,
                    frame: new PIXI.Rectangle(col * SPRITE_SIZE, row * SPRITE_SIZE, SPRITE_SIZE, SPRITE_SIZE),
                }),
        );
        this.spriteFrames.set(type, textures);
        return textures;
    }

    private createPowerUp(x: number, y: number, type: PowerUpType): void {
        const def = POWER_UPS[type];
        const radius = Math.max(10, 17 * SCALE_FACTOR);
        const container = new PIXI.Container();
        container.position.set(x, y);

        const glow = new PIXI.Sprite(this.glowTexture);
        glow.anchor.set(0.5);
        glow.blendMode = 'add';
        glow.tint = def.color;
        glow.width = radius * 4.2;
        glow.height = radius * 4.2;
        glow.alpha = 0.55;

        const ring = new PIXI.Graphics()
            .circle(0, 0, radius)
            .fill({ color: 0x0b0322, alpha: 0.75 })
            .circle(0, 0, radius)
            .stroke({ color: def.color, width: Math.max(1.5, 2 * SCALE_FACTOR) });

        const sprite = new PIXI.AnimatedSprite(this.getSpriteFrames(type));
        sprite.anchor.set(0.5);
        sprite.scale.set((radius * 1.45) / SPRITE_SIZE);
        sprite.animationSpeed = 0.15;
        sprite.play();

        const label = pixelText(def.label, Math.max(6, Math.round(7 * SCALE_FACTOR)), def.color, 3);
        label.y = radius + 9 * SCALE_FACTOR;

        container.addChild(glow, ring, sprite, label);
        this.powerUpContainer.addChild(container);
        this.powerUps.push({
            type,
            x,
            y,
            velocity: 2 * SCALE_FACTOR,
            phase: Math.random() * Math.PI * 2,
            sprite,
            ring,
            container,
        });
    }

    private removePowerUp(powerUp: PowerUp): void {
        this.powerUps.splice(this.powerUps.indexOf(powerUp), 1);
        powerUp.container.destroy({ children: true });
    }

    private clearPowerUpDrops(): void {
        [...this.powerUps].forEach(powerUp => this.removePowerUp(powerUp));
    }

    private updatePowerUps(dt: number, deltaMS: number): void {
        for (const powerUp of [...this.powerUps]) {
            if (this.gameState !== 'playing') return;
            if (!this.powerUps.includes(powerUp)) continue;

            powerUp.y += powerUp.velocity * dt;
            powerUp.phase += 0.08 * dt;
            powerUp.container.y = powerUp.y;
            powerUp.sprite.y = Math.sin(powerUp.phase) * 2 * SCALE_FACTOR;
            powerUp.ring.scale.set(1 + Math.sin(powerUp.phase * 2) * 0.06);

            if (this.catchesPowerUp(powerUp)) {
                this.removePowerUp(powerUp);
                this.activatePowerUp(powerUp.type);
            } else if (powerUp.y - 30 * SCALE_FACTOR > GAME_HEIGHT) {
                this.removePowerUp(powerUp);
            }
        }

        for (const [type, remaining] of this.activePowerUpEffects) {
            const left = remaining - deltaMS;
            if (left <= 0) {
                this.deactivatePowerUp(type);
            } else {
                this.activePowerUpEffects.set(type, left);
            }
        }
    }

    private catchesPowerUp(powerUp: PowerUp): boolean {
        const reach = 14 * SCALE_FACTOR;
        const top = this.paddleY();
        return (
            powerUp.x + reach >= this.paddleX &&
            powerUp.x - reach <= this.paddleX + this.paddleWidthNow &&
            powerUp.y + reach >= top &&
            powerUp.y - reach <= top + PADDLE_HEIGHT
        );
    }

    private activatePowerUp(type: PowerUpType, fromMystery: boolean = false): void {
        const def = POWER_UPS[type];

        if (type === 'mystery') {
            this.effects.ring(this.paddleCenter(), this.paddleY(), def.color, 120);
            const exclude: PowerUpType[] = ['mystery'];
            if (this.lives >= MAX_LIVES) exclude.push('extra_life');
            this.activatePowerUp(pickWeightedPowerUp(exclude), true);
            return;
        }

        this.effects.ring(this.paddleCenter(), this.paddleY(), def.color, 90);
        this.effects.showBanner(def.title, fromMystery ? 'FROM THE MYSTERY BOX' : '', def.color, GAME_HEIGHT * 0.5);
        if (def.positive) {
            this.soundManager.playPowerUp();
        } else {
            this.soundManager.playPowerDown();
        }

        switch (type) {
            case 'extra_life':
                this.lives = Math.min(this.lives + 1, MAX_LIVES);
                return;
            case 'extra_time':
                this.timeLeft += 30;
                this.timeBarMax = Math.max(this.timeBarMax, this.timeLeft);
                return;
            case 'lightning':
                this.createLightningStrike();
                return;
            case 'multi_ball':
                this.spawnMultiBall();
                return;
        }

        const opposites: Partial<Record<PowerUpType, PowerUpType>> = {
            speed_fast: 'speed_slow',
            speed_slow: 'speed_fast',
            paddle_big: 'paddle_small',
            paddle_small: 'paddle_big',
        };
        const opposite = opposites[type];
        if (opposite) {
            this.activePowerUpEffects.delete(opposite);
        }
        this.activePowerUpEffects.set(type, POWER_UP_DURATION);
        this.refreshPowerUpVisuals();
    }

    private deactivatePowerUp(type: PowerUpType): void {
        this.activePowerUpEffects.delete(type);
        this.refreshPowerUpVisuals();
    }

    private clearActivePowerUps(): void {
        this.activePowerUpEffects.clear();
        this.clearPowerUpDrops();
        this.refreshPowerUpVisuals();
    }

    private refreshPowerUpVisuals(): void {
        this.applyBallSpeed();
        this.balls.forEach(ball => this.drawBall(ball));
        this.drawPaddle();
    }

    private spawnMultiBall(): void {
        if (this.balls.every(ball => ball.attached)) {
            this.launchBalls();
        }

        const speed = this.getBallSpeed();
        const sources = this.balls.filter(ball => !ball.attached);
        for (const source of sources) {
            for (const spread of [-0.45, 0.45]) {
                if (this.balls.length >= MAX_BALLS) return;
                const angle = Math.atan2(source.vx, -source.vy) + spread;
                const ball = this.spawnBall(false, source.x, source.y, speed * Math.sin(angle), -speed * Math.cos(angle));
                this.normalizeVelocity(ball, speed);
            }
        }
    }

    private createLightningStrike(): void {
        if (this.boss && !this.boss.defeated) {
            const box = this.boss.hitbox();
            this.effects.flash(0x9fd8ff, 0.3);
            this.effects.shake(6);
            this.soundManager.playZap();
            for (let i = 0; i < 3; i++) {
                const x = box.x + box.width * (0.25 + i * 0.25);
                this.effects.bolt(x + (Math.random() - 0.5) * 60 * SCALE_FACTOR, 0, x, box.y + box.height / 2, 0x9fd8ff);
            }
            const result = this.boss.hit(3);
            if (result.defeated) {
                this.onBossDefeated();
            } else if (result.enraged) {
                this.onBossEnraged();
            }
            return;
        }

        const targets = this.bricks
            .filter(brick => brick.alive)
            .sort(() => Math.random() - 0.5)
            .slice(0, 4);

        this.effects.flash(0x9fd8ff, 0.3);
        this.effects.shake(6);
        this.soundManager.playZap();

        for (const brick of targets) {
            const cx = brick.x + BRICK_WIDTH / 2;
            const cy = brick.y + BRICK_HEIGHT / 2;
            this.effects.bolt(cx + (Math.random() - 0.5) * 60 * SCALE_FACTOR, 0, cx, cy, 0x9fd8ff);
            this.destroyBrick(brick, 1, false);
        }
    }

    private formatTime(seconds: number): string {
        const total = Math.ceil(seconds);
        return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
    }

    private setHud(key: keyof HudElements, value: string, asHtml: boolean = false): void {
        const element = this.hud[key];
        if (!element || this.hudCache.get(key) === value) return;
        this.hudCache.set(key, value);
        if (asHtml) {
            element.innerHTML = value;
        } else {
            element.textContent = value;
        }
    }

    private updateUI(force: boolean = false): void {
        if (force) this.hudCache.clear();

        this.setHud('score', pad(this.score, 6));
        this.setHud('highScore', pad(this.highScore, 6));
        this.setHud('titleHighScore', pad(this.highScore, 6));
        this.setHud('level', pad(this.currentLevel, 2));
        this.setHud('timer', this.formatTime(this.timeLeft));
        this.setHud('lives', '<span class="heart">♥</span>'.repeat(Math.max(0, this.lives)), true);
        this.setHud('username', this.username || '---');
        this.setHud('bankLives', this.bank.lives ? `+${this.bank.lives}` : '');
        this.setHud('bankTime', this.bank.time ? `+${this.formatTime(this.bank.time)}` : '');

        const danger = this.clockRunning && this.timeLeft <= 10;
        this.hud.timer?.classList.toggle('is-danger', danger);
        this.hud.timerBar?.classList.toggle('is-danger', danger);
        if (this.hud.timerBar) {
            this.hud.timerBar.style.width = `${clamp(this.timeLeft / this.timeBarMax, 0, 1) * 100}%`;
        }

        if (this.hud.exitBtn) {
            const inGame = this.gameState === 'playing' || this.gameState === 'paused';
            this.hud.exitBtn.style.display = inGame ? '' : 'none';
        }

        this.renderDashboard();
    }

    private renderDashboard(): void {
        const dash = this.dashboard;
        const moving = this.gameState === 'playing' && this.balls.some(ball => !ball.attached);
        const speed = moving ? Math.round((this.getBallSpeed() / SCALE_FACTOR) * 20) : 0;
        const fraction = clamp(speed / MAX_GAUGE_SPEED, 0, 1);

        this.writeText(dash.speed, 'dashSpeed', pad(speed, 3));
        dash.needle?.style.setProperty('transform', `rotate(${fraction * 180 - 90}deg)`);
        if (dash.arc) {
            dash.arc.style.strokeDasharray = `${fraction * 100} 100`;
            dash.arc.classList.toggle('is-hot', this.activePowerUpEffects.has('speed_fast'));
        }

        for (const light of dash.lights) {
            const remaining = this.activePowerUpEffects.get(light.dataset.type as PowerUpType) ?? 0;
            const on = remaining > 0;
            light.classList.toggle('is-on', on);
            light.style.setProperty('--p', (remaining / POWER_UP_DURATION).toFixed(3));
            const time = light.querySelector('.dash-light-time');
            if (time) time.textContent = on ? `${(remaining / 1000).toFixed(1)}s` : '--';
        }

        const multiplier = this.comboMultiplier();
        this.writeText(dash.combo, 'dashCombo', `x${multiplier}`);
        const progress = multiplier >= MAX_MULTIPLIER ? COMBO_STEP : this.combo % COMBO_STEP;
        dash.comboLeds.forEach((led, index) => led.classList.toggle('on', index < progress));
        this.writeText(dash.chain, 'dashChain', `${this.combo} ${this.combo === 1 ? 'hit' : 'hits'}`);
        if (dash.combo && multiplier > this.lastShownMultiplier) {
            dash.combo.classList.remove('is-bump');
            void dash.combo.offsetWidth;
            dash.combo.classList.add('is-bump');
        }
        dash.combo?.closest('.dash-meter')?.setAttribute('data-tier', multiplier >= 7 ? 'hot' : multiplier >= 4 ? 'warm' : 'cool');
        this.lastShownMultiplier = multiplier;
        this.writeText(dash.balls, 'dashBalls', this.balls.length.toString());
    }

    private writeText(element: Element | null, key: string, value: string): void {
        if (!element || this.hudCache.get(key) === value) return;
        this.hudCache.set(key, value);
        element.textContent = value;
    }

    private saveHighScore(): void {
        localStorage.setItem('breakout_highScore', this.highScore.toString());
    }

    private addToHistory(result: 'Win' | 'Loss'): void {
        this.saveHighScore();
        this.sessionHistory.unshift({
            date: new Date(),
            score: this.score,
            result,
            level: this.currentLevel,
        });
        if (this.sessionHistory.length > 20) {
            this.sessionHistory.pop();
        }
        localStorage.setItem('breakout_history', JSON.stringify(this.sessionHistory));
        this.updateHistoryUI();
    }

    private updateHistoryUI(): void {
        const list = document.getElementById('historyList');
        if (!list) return;

        if (this.sessionHistory.length === 0) {
            list.innerHTML = '<li class="history-empty">No games played yet</li>';
            return;
        }

        list.innerHTML = '';
        for (const game of this.sessionHistory) {
            const won = game.result === 'Win';
            const time = new Date(game.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const item = document.createElement('li');
            item.className = `history-item ${won ? 'history-win' : 'history-loss'}`;
            item.innerHTML = `
                <span class="history-badge">${won ? 'WIN' : 'LOSS'}</span>
                <span class="history-meta">Stage ${pad(game.level || 1, 2)}<small>${time}</small></span>
                <span class="history-score">${game.score.toLocaleString()}</span>
            `;
            list.appendChild(item);
        }
    }

    public updateLevelGrid(): void {
        const grid = document.getElementById('levelGrid');
        if (!grid) return;

        grid.innerHTML = '';
        for (let level = 1; level <= this.MAX_LEVELS; level++) {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'level-item';
            let icon = '';

            if (level <= this.highestLevelUnlocked) {
                tile.classList.add('level-unlocked');
                tile.addEventListener('click', () => this.startLevel(level));
                if (level === this.currentLevel) {
                    tile.classList.add('level-current');
                    icon = '▶';
                } else if (level < this.highestLevelUnlocked) {
                    tile.classList.add('level-completed');
                    icon = '★';
                }
            } else {
                tile.classList.add('level-locked');
                tile.disabled = true;
                icon = LOCK_ICON;
            }

            if (BOSS_LEVELS[level]) tile.classList.add('level-boss');
            const bossTag = BOSS_LEVELS[level] ? '<span class="level-boss-tag">BOSS</span>' : '';
            tile.innerHTML = `<span class="level-number">${pad(level, 2)}</span><span class="level-icon">${icon}</span>${bossTag}`;
            grid.appendChild(tile);
        }

        this.updateBossGrid();
    }

    private updateBossGrid(): void {
        const grid = document.getElementById('bossGrid');
        if (!grid) return;

        grid.innerHTML = '';
        for (const [levelKey, config] of Object.entries(BOSS_LEVELS)) {
            const level = Number(levelKey);
            const unlocked = level <= this.highestLevelUnlocked;
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'boss-card';
            card.disabled = !unlocked;
            card.style.setProperty('--boss-color', hexToCss(config.color));
            card.innerHTML = `
                <span class="boss-card-name">${config.name}</span>
                <span class="boss-card-meta">${unlocked ? `${config.title} · after stage ${level}` : `Reach stage ${level} to unlock`}</span>
            `;
            if (unlocked) {
                card.addEventListener('click', () => this.startBoss(level));
            }
            grid.appendChild(card);
        }
    }

    private calculateResponsiveDimensions(): void {
        const isMobile = window.innerWidth <= 768;
        const isPortrait = window.innerHeight > window.innerWidth;
        const sideLayout = !isPortrait && window.innerHeight <= 560;
        const ui = document.getElementById('ui')?.getBoundingClientRect();
        const dashboard = document.getElementById('dashboard')?.getBoundingClientRect();
        const stacked = sideLayout ? 0 : (ui?.height ?? 0) + (dashboard?.height ?? 0);
        const chrome = sideLayout ? 16 : isMobile ? 22 : 62;
        const availableHeight = Math.max(160, window.innerHeight - stacked - chrome);
        const availableWidth = sideLayout
            ? window.innerWidth - (ui?.width ?? 0) - (dashboard?.width ?? 0) - 40
            : window.innerWidth * (isMobile ? 0.98 : 0.92);

        if (isMobile && isPortrait) {
            BRICK_COLS = 8;
            SCALE_FACTOR = window.innerWidth / (BRICK_COLS * 80 + 5);
            GAME_WIDTH = Math.floor(window.innerWidth);
            GAME_HEIGHT = Math.floor(Math.min(availableHeight, GAME_WIDTH * 1.9));
        } else {
            BRICK_COLS = 10;
            const viewportWidth = Math.min(availableWidth, 1200);
            const viewportHeight = Math.min(availableHeight, 800);
            SCALE_FACTOR = Math.min(viewportWidth / BASE_WIDTH, viewportHeight / BASE_HEIGHT);
            GAME_WIDTH = Math.floor(BASE_WIDTH * SCALE_FACTOR);
            GAME_HEIGHT = Math.floor(BASE_HEIGHT * SCALE_FACTOR);
        }

        PADDLE_WIDTH = Math.floor(100 * SCALE_FACTOR);
        PADDLE_HEIGHT = Math.max(8, Math.floor(16 * SCALE_FACTOR));
        BALL_RADIUS = Math.max(4, Math.floor(9 * SCALE_FACTOR));
        BRICK_HEIGHT = Math.floor(20 * SCALE_FACTOR);
        BRICK_PADDING = Math.floor(5 * SCALE_FACTOR);
        this.updateBrickMetrics();
    }

    private handleResize(): void {
        const previousWidth = GAME_WIDTH;
        const previousHeight = GAME_HEIGHT;

        this.calculateResponsiveDimensions();
        if (!this.app.renderer) return;

        this.app.renderer.resize(GAME_WIDTH, GAME_HEIGHT);
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) this.sizeGameContainer(gameContainer);

        this.backdrop.resize(GAME_WIDTH, GAME_HEIGHT);
        this.effects.setSize(GAME_WIDTH, GAME_HEIGHT, SCALE_FACTOR);
        if (this.launchPrompt) this.launchPrompt.style.fontSize = this.promptFontSize();

        const scaleX = GAME_WIDTH / previousWidth;
        const scaleY = GAME_HEIGHT / previousHeight;
        this.pointerX *= scaleX;
        this.paddleWidthNow = this.getCurrentPaddleWidth();
        this.paddleX = clamp(this.paddleX * scaleX, 0, GAME_WIDTH - this.paddleWidthNow);
        this.drawPaddle();
        this.adjustSpeedForLevel();

        this.boss?.setView(GAME_WIDTH, GAME_HEIGHT);
        this.bricks.forEach(brick => {
            this.positionBrick(brick);
            this.drawBrick(brick);
        });
        this.balls.forEach(ball => {
            ball.x *= scaleX;
            ball.y *= scaleY;
            ball.trail = [];
            this.drawBall(ball);
        });
        this.powerUps.forEach(powerUp => {
            powerUp.x *= scaleX;
            powerUp.y *= scaleY;
            powerUp.container.position.set(powerUp.x, powerUp.y);
        });
    }
}

declare global {
    var __PIXI_APP__: import('pixi.js').Application | undefined;
}
