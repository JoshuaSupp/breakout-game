import * as PIXI from 'pixi.js';
import { SoundManager } from './sound';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import bgMorning from './assets/images/background/bg-morning.webp';
import bgNight from './assets/images/background/bg-night.webp';
import powerUpSpritesheet from './assets/images/powerups/animated_items.png';

// Responsive game constants (will be calculated based on screen size)
let GAME_WIDTH = 800;
let GAME_HEIGHT = 600;
let PADDLE_WIDTH = 100;
let PADDLE_HEIGHT = 20;
let BALL_RADIUS = 10;
let BRICK_WIDTH = 75;
let BRICK_HEIGHT = 20;
const BRICK_ROWS = 8;
let BRICK_COLS = 10;
let BRICK_PADDING = 5;


const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;
let SCALE_FACTOR = 1;

const PADDLE_SIDE_ZONE_WIDTH = 10;
const PADDLE_TOP_ZONE_HEIGHT = 5; 

interface Velocity {
    x: number;
    y: number;
}

interface GameHistory {
    date: Date;
    score: number;
    result: 'Win' | 'Loss';
    level: number;
}

type GameState = 'start' | 'playing' | 'gameOver' | 'won' | 'levelIntro' | 'paused';

type PowerUpType = 'paddle_big' | 'paddle_small' | 'speed_fast' | 'speed_slow' | 'lightning' | 'mystery' | 'extra_life' | 'extra_time';

interface PowerUp {
    type: PowerUpType;
    x: number;
    y: number;
    velocity: number;
    sprite: PIXI.AnimatedSprite;
    container: PIXI.Container;
    active: boolean;
}

export class BreakoutGame {
    private app: PIXI.Application;
    private bricksContainer: PIXI.Container;
    private gameObjectsContainer: PIXI.Container;
    private paddle: PIXI.Graphics;
    private ball: PIXI.Graphics;
    private bricks: PIXI.Graphics[][];
    private ballVelocity: Velocity;
    private mouseX: number;
    private score: number;
    private lives: number;
    private gameState: GameState;
    private highScore: number;
    private gameStartTime: number;
    private elapsedTime: number;
    private timeLimit: number; 
    private remainingTime: number; 
    private gameOverText: PIXI.Text | null = null;
    private winText: PIXI.Text | null = null;
    private username: string = '';
    private resizeHandler: () => void;
    private soundManager: SoundManager;
    private background: PIXI.Sprite | null = null;
    public backgroundType: 'morning' | 'night' = 'morning';

    // Animation
    private spineAnim: Spine | null = null;
    private logoApp: PIXI.Application | null = null;
    private logoSpine: Spine | null = null;

    // Settings & History
    public musicEnabled: boolean = true;
    public soundEnabled: boolean = true;
    public sessionHistory: GameHistory[] = [];
    
    // Touch/Mobile properties
    private isDragging: boolean = false;
    private lastTouchX: number = 0;
    private baseBallSpeed: number = 3;
    private deltaTime: number = 1;
    private lastTime: number = 0;
    
    // Level settings
    private currentLevel: number = 1;
    private highestLevelUnlocked: number = 1;
    private readonly MAX_LEVELS: number = 30;

    // Power-up system
    private powerUps: PowerUp[] = [];
    private powerUpContainer: PIXI.Container;
    private activePowerUpEffects: Map<PowerUpType, number> = new Map();
    private readonly POWER_UP_DURATION = 10000; // 10 seconds
    private lightningEffects: PIXI.Graphics[] = [];
    private powerUpBaseTexture: PIXI.Texture | null = null;

    constructor() {
        this.app = new PIXI.Application();
        this.bricksContainer = new PIXI.Container();
        this.gameObjectsContainer = new PIXI.Container();
        this.powerUpContainer = new PIXI.Container();
        const savedMusic = localStorage.getItem('breakout_musicEnabled');
        this.musicEnabled = savedMusic !== null ? savedMusic === 'true' : true; 
        const savedSound = localStorage.getItem('breakout_soundEnabled');
        this.soundEnabled = savedSound !== null ? savedSound === 'true' : true;
        this.soundManager = new SoundManager();
        this.soundManager.setMusicEnabled(this.musicEnabled);
        this.soundManager.setSoundEnabled(this.soundEnabled);
        const savedHistory = localStorage.getItem('breakout_history');
        const savedBg = localStorage.getItem('breakout_background');
        const savedLevel = localStorage.getItem('breakout_highestLevel');
        
        if (savedLevel) {
            this.highestLevelUnlocked = parseInt(savedLevel, 10);
            this.currentLevel = this.highestLevelUnlocked;
        }

        const lastPlayedLevel = localStorage.getItem('breakout_lastPlayedLevel');
        if (lastPlayedLevel) {
            const level = parseInt(lastPlayedLevel, 10);
            if (level <= this.highestLevelUnlocked) {
                this.currentLevel = level;
            }
        }

        if (savedHistory) {
            try {
                this.sessionHistory = JSON.parse(savedHistory);
                this.sessionHistory.forEach(h => h.date = new Date(h.date));
            } catch (e) {
                console.error('Failed to parse history', e);
            }
        }
        if (savedBg === 'morning' || savedBg === 'night') {
            this.backgroundType = savedBg;
        }
        this.updateHistoryUI();
        this.score = 0;
        this.lives = 3;
        this.gameState = 'start';
        this.mouseX = GAME_WIDTH / 2;
        this.highScore = 0;
        this.gameStartTime = 0;
        this.elapsedTime = 0;
        this.timeLimit = 0;
        this.remainingTime = 0;
        
        const savedHighScore = localStorage.getItem('breakout_highScore');
        if (savedHighScore) {
            this.highScore = parseInt(savedHighScore, 10);
        }
        this.calculateTimeLimit();

        this.paddle = new PIXI.Graphics();
        this.ball = new PIXI.Graphics();
        this.bricks = [];
        this.ballVelocity = { x: this.baseBallSpeed, y: -this.baseBallSpeed };
        this.calculateResponsiveDimensions();
        this.adjustSpeedForLevel(true);
        this.resizeHandler = this.handleResize.bind(this);
        this.setupLevelStartPopup();
    }

    private getCurrentPaddleWidth(): number {
        const multiplier = Math.max(0.7, 1.2 - ((this.currentLevel - 1) * 0.02));
        let baseWidth = PADDLE_WIDTH * multiplier;

        if (this.activePowerUpEffects.has('paddle_big')) {
            baseWidth *= 1.5;
        } else if (this.activePowerUpEffects.has('paddle_small')) {
            baseWidth *= 0.7;
        }

        return baseWidth;
    }

    public openLevelSelect(): void {
        this.gameState = 'levelIntro';
        const levelSelectScreen = document.getElementById('levelSelectScreen');
        const sideMenu = document.getElementById('sideMenu');
        
        if (levelSelectScreen) {
            levelSelectScreen.classList.add('show');
            this.updateLevelGrid();
        }
        
        if (sideMenu) {
            sideMenu.classList.remove('open');
        }
    }

    public closeLevelSelect(): void {
        const levelSelectScreen = document.getElementById('levelSelectScreen');
        if (levelSelectScreen) {
            levelSelectScreen.classList.remove('show');
        }
        
        if (this.gameState === 'levelIntro') {
            this.showLevelStartPopup(true);
        }
    }

    private setupLevelStartPopup(): void {
        const levelStartPopup = document.getElementById('levelStartPopup');
        const playBtn = document.getElementById('levelStartPlayBtn');
        const selectBtn = document.getElementById('levelStartSelectBtn');

        if (playBtn && levelStartPopup) {
            playBtn.addEventListener('click', () => {
                levelStartPopup.classList.remove('show');
                this.gameState = 'playing';
            });
        }

        if (selectBtn && levelStartPopup) {
            selectBtn.addEventListener('click', () => {
                levelStartPopup.classList.remove('show');
                this.openLevelSelect();
            });
        }
    }

    private showLevelStartPopup(resume: boolean = false): void {
        this.gameState = 'levelIntro';
        const levelStartPopup = document.getElementById('levelStartPopup');
        const title = document.getElementById('levelStartTitle');
        const playBtn = document.getElementById('levelStartPlayBtn');
        
        if (levelStartPopup && title && playBtn) {
            title.textContent = `Level ${this.currentLevel}`;
            playBtn.textContent = resume ? 'Resume Game' : 'Start Game';
            levelStartPopup.classList.add('show');
        }
    }

    async start(): Promise<void> {
        await this.app.init({ 
            width: GAME_WIDTH, 
            height: GAME_HEIGHT, 
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        });
        globalThis.__PIXI_APP__ = this.app;
        this.app.renderer.background.color = 0x0000;
        try {
            await PIXI.Assets.load([bgMorning, bgNight, powerUpSpritesheet]);
            this.powerUpBaseTexture = PIXI.Texture.from(powerUpSpritesheet);
            this.background = PIXI.Sprite.from(this.backgroundType === 'morning' ? bgMorning : bgNight);
            this.background.anchor.set(0.5);
            this.app.stage.addChild(this.background);
            this.resizeBackground();
        } catch (e) {
            console.error('Failed to load background images', e);
        }
        await this.setupSpineLogo();

        this.app.canvas.style.width = '100%';
        this.app.canvas.style.height = '100%';
        this.app.canvas.style.display = 'block';
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.innerHTML = '';
            gameContainer.appendChild(this.app.canvas);
            gameContainer.style.width = GAME_WIDTH + 'px';
            gameContainer.style.height = GAME_HEIGHT + 'px';
            gameContainer.style.maxWidth = '100vw';
            gameContainer.style.maxHeight = '100vh';
        }
        this.app.stage.addChild(this.bricksContainer);
        this.app.stage.addChild(this.gameObjectsContainer);
        this.app.stage.addChild(this.powerUpContainer);
        this.setupUsernamePopup();
        this.setupEventListeners();
        this.app.ticker.add(this.gameLoop.bind(this));
        window.addEventListener('resize', this.resizeHandler);
        this.updateLevelGrid();
    }

    private levelComplete(): void {
        this.currentLevel++;
        localStorage.setItem('breakout_lastPlayedLevel', this.currentLevel.toString()); 
        if (this.currentLevel > this.highestLevelUnlocked) {
            this.highestLevelUnlocked = this.currentLevel;
            localStorage.setItem('breakout_highestLevel', this.highestLevelUnlocked.toString());
        }
        
        if (this.currentLevel > this.MAX_LEVELS) {
            this.gameState = 'won';
            this.showWin();
        } else {
            this.initializeGame();
            this.showLevelStartPopup();
        }
    }

    private initializeGame(): void {
        this.updateLevelGrid();
        this.calculateTimeLimit();
        if (this.gameState === 'playing') {
            this.gameStartTime = Date.now();
            this.remainingTime = this.timeLimit;
        }
        
        this.bricksContainer.removeChildren();
        this.gameObjectsContainer.removeChildren();
        this.powerUpContainer.removeChildren();
        this.powerUps = [];
        this.activePowerUpEffects.clear();
        this.lightningEffects = [];

        const paddleWidth = this.getCurrentPaddleWidth();
        this.paddle.clear();
        this.paddle.beginFill(0xFFFFFF);
        this.paddle.drawRect(0, 0, paddleWidth, PADDLE_HEIGHT);
        this.paddle.endFill();
        this.paddle.x = GAME_WIDTH / 2 - paddleWidth / 2;
        this.paddle.y = GAME_HEIGHT - Math.max(24, Math.round(50 * SCALE_FACTOR));
        this.gameObjectsContainer.addChild(this.paddle);

        this.ball.clear();
        this.ball.beginFill(0xFFFFFF);
        this.ball.drawCircle(0, 0, BALL_RADIUS);
        this.ball.endFill();
        this.ball.x = GAME_WIDTH / 2;
        this.ball.y = GAME_HEIGHT / 2;
        this.gameObjectsContainer.addChild(this.ball);
        
        this.adjustSpeedForLevel(true);
        this.createBricks();
        
        const levelElement = document.getElementById('level');
        if (levelElement) levelElement.textContent = this.currentLevel.toString();
    }
    
    private adjustSpeedForLevel(reset: boolean = false): void {
        const MAX_BALL_SPEED = 7.5;
        let speed = Math.min(MAX_BALL_SPEED, 6 + (this.currentLevel - 1) * 0.1) * SCALE_FACTOR;
        this.baseBallSpeed = speed;
        
        if (reset) {
            this.ballVelocity = { x: this.baseBallSpeed, y: -this.baseBallSpeed };
        } else if (this.ballVelocity) {
            const currentSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
            if (currentSpeed > 0) {
                const directionX = this.ballVelocity.x / currentSpeed;
                const directionY = this.ballVelocity.y / currentSpeed;
                this.ballVelocity.x = directionX * this.baseBallSpeed;
                this.ballVelocity.y = directionY * this.baseBallSpeed;
            }
        }
    }

    private createBricks(): void {
        this.bricks = [];
        const rows = Math.min(2 + Math.floor((this.currentLevel - 1) / 2), 14);
        const cols = BRICK_COLS;
        
        const colors: number[] = [
            0x0066FF, 0x9933FF, 0xFF33CC, 0xFF3366,
            0xFF9933, 0xFFCC00, 0x33FF99, 0x00FF66
        ];
        
        for (let row = 0; row < rows; row++) {
            this.bricks[row] = [];
            for (let col = 0; col < cols; col++) {
                const brick = new PIXI.Graphics();
                const colorIndex = (row + Math.floor((this.currentLevel - 1) / 3)) % colors.length;
                brick.beginFill(colors[colorIndex]);
                brick.drawRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT);
                brick.endFill();
                brick.x = col * (BRICK_WIDTH + BRICK_PADDING) + BRICK_PADDING;
                brick.y = row * (BRICK_HEIGHT + BRICK_PADDING) + Math.max(20, Math.round(50 * SCALE_FACTOR));
                brick.visible = true;
                this.bricks[row][col] = brick;
                this.bricksContainer.addChild(brick);
            }
        }
    }

    private setupEventListeners(): void {
        this.app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            const rect = this.app.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
        });

        this.app.canvas.addEventListener('touchstart', (e: TouchEvent) => {
            e.preventDefault();
            this.isDragging = true;
            const rect = this.app.canvas.getBoundingClientRect();
            this.lastTouchX = e.touches[0].clientX - rect.left;
            this.mouseX = this.lastTouchX;
        });

        this.app.canvas.addEventListener('touchmove', (e: TouchEvent) => {
            e.preventDefault();
            if (this.isDragging) {
                const rect = this.app.canvas.getBoundingClientRect();
                this.lastTouchX = e.touches[0].clientX - rect.left;
                this.mouseX = this.lastTouchX;
            }
        });

        this.app.canvas.addEventListener('touchend', (e: TouchEvent) => {
            e.preventDefault();
            this.isDragging = false;
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' && this.paddle.x > 0) {
                this.paddle.x -= 20;
            } else if (e.key === 'ArrowRight' && this.paddle.x < GAME_WIDTH - this.getCurrentPaddleWidth()) {
                this.paddle.x += 20;
            } else if (e.key === ' ' && this.gameState !== 'playing') {
                this.resetGame();
            }
        });
    }

    private gameLoop(): void {
        if (this.gameState === 'start') return;
        if (this.gameState === 'levelIntro') return;
        if (this.gameState !== 'playing') return;

        const currentTime = performance.now();
        if (this.lastTime === 0) this.lastTime = currentTime;
        this.deltaTime = (currentTime - this.lastTime) / 16.67;
        this.lastTime = currentTime;
        this.deltaTime = Math.min(this.deltaTime, 2);

        this.updatePaddle();
        this.updateBall();
        this.checkCollisions();
        this.updatePowerUps();
        this.updateUI();
    }

    private updatePaddle(): void {
        const currentPaddleWidth = this.getCurrentPaddleWidth();
        this.paddle.x = this.mouseX - currentPaddleWidth / 2;
        
        if (this.paddle.x < 0) this.paddle.x = 0;
        if (this.paddle.x > GAME_WIDTH - currentPaddleWidth) {
            this.paddle.x = GAME_WIDTH - currentPaddleWidth;
        }
    }

    private updateBall(): void {
        const speedMultiplier = this.deltaTime;
        this.ball.x += this.ballVelocity.x * speedMultiplier;
        this.ball.y += this.ballVelocity.y * speedMultiplier;

        if (this.ball.x <= BALL_RADIUS || this.ball.x >= GAME_WIDTH - BALL_RADIUS) {
            this.ballVelocity.x = -this.ballVelocity.x;
        }
        
        if (this.ball.y <= BALL_RADIUS) {
            this.ballVelocity.y = -this.ballVelocity.y;
        }

        if (this.ball.y > GAME_HEIGHT) {
            this.lives--;
            this.showDeathAnimation(this.ball.x);
            this.clearActivePowerUps();
            if (this.lives <= 0) {
                this.gameState = 'gameOver';
                this.showGameOver();
            } else {
                this.resetBall();
            }
        }
    }

    private checkCollisions(): void {
        const currentPaddleWidth = this.getCurrentPaddleWidth();
        
        if (this.ball.y + BALL_RADIUS >= this.paddle.y &&
            this.ball.y - BALL_RADIUS <= this.paddle.y + PADDLE_HEIGHT &&
            this.ball.x >= this.paddle.x &&
            this.ball.x <= this.paddle.x + currentPaddleWidth) {
            this.soundManager.playPaddleHit();
            const ballCenterX = this.ball.x;
            const ballCenterY = this.ball.y;
            const paddleLeft = this.paddle.x;
            const paddleRight = this.paddle.x + currentPaddleWidth;
            const paddleTop = this.paddle.y;
            const paddleBottom = this.paddle.y + PADDLE_HEIGHT;
            if (this.ballVelocity.y > 0) {
                this.ball.y = paddleTop - BALL_RADIUS - 0.1;
                const currentSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
                this.ballVelocity.y = -Math.abs(this.ballVelocity.y);
                const hitPos = (this.ball.x - this.paddle.x) / currentPaddleWidth;
                this.ballVelocity.x = (hitPos - 0.5) * currentSpeed * 0.8;
                const newSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
                if (newSpeed > 0) {
                    this.ballVelocity.x = (this.ballVelocity.x / newSpeed) * currentSpeed;
                    this.ballVelocity.y = (this.ballVelocity.y / newSpeed) * currentSpeed;
                }
                this.showCollisionFeedback('top');
            } else {
                const hitLeftSide = ballCenterX >= paddleLeft && ballCenterX <= paddleLeft + PADDLE_SIDE_ZONE_WIDTH;
                const hitRightSide = ballCenterX >= paddleRight - PADDLE_SIDE_ZONE_WIDTH && ballCenterX <= paddleRight;
                const currentSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
                if (hitLeftSide && this.ballVelocity.x > 0) {
                    this.ballVelocity.x = -Math.abs(currentSpeed * 0.5);
                    this.ballVelocity.y = -Math.abs(currentSpeed * 0.866);
                    this.showCollisionFeedback('left');
                } else if (hitRightSide && this.ballVelocity.x < 0) {
                    this.ballVelocity.x = Math.abs(currentSpeed * 0.5);
                    this.ballVelocity.y = -Math.abs(currentSpeed * 0.866);
                    this.showCollisionFeedback('right');
                }
            } 
            const finalSpeed = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
            if (finalSpeed < this.baseBallSpeed) {
                const scale = this.baseBallSpeed / finalSpeed;
                this.ballVelocity.x *= scale;
                this.ballVelocity.y *= scale;
            }
        }

        const rows = this.bricks.length;
        const cols = this.bricks[0]?.length || 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const brick = this.bricks[row][col];
                if (!brick.visible) continue;

                if (this.ball.x + BALL_RADIUS >= brick.x &&
                    this.ball.x - BALL_RADIUS <= brick.x + BRICK_WIDTH &&
                    this.ball.y + BALL_RADIUS >= brick.y &&
                    this.ball.y - BALL_RADIUS <= brick.y + BRICK_HEIGHT) {
                    
                    brick.visible = false;
                    this.ballVelocity.y = -this.ballVelocity.y;
                    this.score += 10;
                    this.soundManager.playBrickHit();
                    this.spawnPowerUpFromBrick(brick.x, brick.y);
                    
                    if (this.allBricksDestroyed()) {
                        this.levelComplete();
                    }
                    return;
                }
            }
        }
    }

    private showCollisionFeedback(zone: string): void {
        let color = 0x00FF00;
        switch (zone) {
            case 'left':
            case 'right':
                color = 0x0000FF;
                break;
        }
        
        const currentPaddleWidth = this.getCurrentPaddleWidth();
        this.paddle.clear();
        this.paddle.beginFill(color);
        this.paddle.drawRect(0, 0, currentPaddleWidth, PADDLE_HEIGHT);
        this.paddle.endFill();
        let fadeStep = 0;
        const totalFadeSteps = 15;     
        const fadeToWhite = () => {
            fadeStep++;
            if (fadeStep >= totalFadeSteps) {
                const currentPaddleWidth = this.getCurrentPaddleWidth();
                this.paddle.clear();
                this.paddle.beginFill(0xFFFFFF);
                this.paddle.drawRect(0, 0, currentPaddleWidth, PADDLE_HEIGHT);
                this.paddle.endFill();
                return;
            }
            const progress = fadeStep / totalFadeSteps;
            const r = ((color >> 16) & 0xFF) + Math.floor((255 - ((color >> 16) & 0xFF)) * progress);
            const g = ((color >> 8) & 0xFF) + Math.floor((255 - ((color >> 8) & 0xFF)) * progress);
            const b = (color & 0xFF) + Math.floor((255 - (color & 0xFF)) * progress);
            const newColor = (r << 16) | (g << 8) | b;
            const currentPaddleWidth = this.getCurrentPaddleWidth();
            this.paddle.clear();
            this.paddle.beginFill(newColor);
            this.paddle.drawRect(0, 0, currentPaddleWidth, PADDLE_HEIGHT);
            this.paddle.endFill();
            requestAnimationFrame(fadeToWhite);
        };
        requestAnimationFrame(fadeToWhite);
    }

    private allBricksDestroyed(): boolean {
        return this.bricks.every(row => 
            row.every(brick => !brick.visible)
        );
    }

    private resetBall(): void {
        this.ball.x = GAME_WIDTH / 2;
        this.ball.y = GAME_HEIGHT / 2;
        this.ballVelocity.x = Math.random() > 0.5 ? this.baseBallSpeed : -this.baseBallSpeed;
        this.ballVelocity.y = -this.baseBallSpeed;
    }

    private clearActivePowerUps(): void {
        const activeTypes = [...this.activePowerUpEffects.keys()];
        for (const type of activeTypes) {
            this.deactivatePowerUp(type);
        }
        this.activePowerUpEffects.clear();

        // Remove all falling power-up sprites
        for (const pu of this.powerUps) {
            if (pu.container.parent) pu.container.parent.removeChild(pu.container);
        }
        this.powerUps = [];

        // Remove lingering lightning / background effect graphics
        for (const g of this.lightningEffects) {
            if (g.parent) g.parent.removeChild(g);
        }
        this.lightningEffects = [];

        this.adjustSpeedForLevel(false);
        this.updatePaddleVisual();
    }

    private showDeathAnimation(ballX: number): void {
        // Red screen flash
        const flash = new PIXI.Graphics();
        flash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xFF0000, alpha: 1 });
        flash.alpha = 0.38;
        this.powerUpContainer.addChild(flash);

        const fadeFlash = () => {
            flash.alpha -= 0.022;
            if (flash.alpha > 0) requestAnimationFrame(fadeFlash);
            else { if (flash.parent) flash.parent.removeChild(flash); flash.destroy(); }
        };
        requestAnimationFrame(fadeFlash);

        // Burst of red particles from where the ball dropped
        const burstY = GAME_HEIGHT - 10;
        for (let i = 0; i < 8; i++) {
            const dot = new PIXI.Graphics();
            const r = 4 + Math.random() * 4;
            dot.circle(0, 0, r).fill({ color: 0xFF3333, alpha: 1 });
            dot.x = ballX;
            dot.y = burstY;
            dot.alpha = 1;
            const vx = (Math.random() - 0.5) * 6;
            const vy = -(2 + Math.random() * 4);
            this.powerUpContainer.addChild(dot);

            const animDot = () => {
                dot.x += vx;
                dot.y += vy + 1; // gravity
                dot.alpha -= 0.04;
                if (dot.alpha > 0) requestAnimationFrame(animDot);
                else { if (dot.parent) dot.parent.removeChild(dot); dot.destroy(); }
            };
            requestAnimationFrame(animDot);
        }

        // "−LIFE" text fading in the centre
        const text = new PIXI.Text({
            text: '♥ −LIFE',
            style: {
                fontSize: Math.max(26, Math.round(46 * SCALE_FACTOR)),
                fill: 0xFF4466,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 6 },
            },
        });
        text.anchor.set(0.5);
        text.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        text.alpha = 0;
        this.powerUpContainer.addChild(text);

        // Fade in then out
        let fadeIn = true;
        const animText = () => {
            if (fadeIn) {
                text.alpha += 0.08;
                if (text.alpha >= 0.9) { text.alpha = 0.9; fadeIn = false; setTimeout(() => requestAnimationFrame(animText), 600); return; }
            } else {
                text.alpha -= 0.03;
                if (text.alpha <= 0) { if (text.parent) text.parent.removeChild(text); text.destroy(); return; }
            }
            requestAnimationFrame(animText);
        };
        requestAnimationFrame(animText);
    }

    private showPopup(title: string, message: string): void {
        const popup = document.getElementById('gamePopup');
        const popupTitle = document.getElementById('popupTitle');
        const popupMessage = document.getElementById('popupMessage');
        const popupOkBtn = document.getElementById('popupOkBtn');
    
        if (popup && popupTitle && popupMessage && popupOkBtn) {
            popupTitle.textContent = title;
            popupMessage.textContent = message;
            popup.classList.add('show');
            const newBtn = popupOkBtn.cloneNode(true) as HTMLElement;
            popupOkBtn.parentNode?.replaceChild(newBtn, popupOkBtn);
            newBtn.addEventListener('click', () => {
                popup.classList.remove('show');
                if (this.gameState !== 'playing') {
                    this.resetGame();
                }
            });
        }
    }

    private showGameOver(): void {
        this.gameState = 'gameOver';
        this.addToHistory('Loss');
        this.showPopup('Game Over', 'Press OK to restart');
    }
    
    private calculateTimeLimit(): void {
        const baseTime = 120;
        const reductionPerLevel = 5;
        const minimumTime = 30;
        this.timeLimit = Math.max(minimumTime, baseTime - (this.currentLevel - 1) * reductionPerLevel);
    }
    
    private handleTimeUp(): void {
        if (this.gameState === 'playing') {
            this.gameState = 'gameOver';
            this.addToHistory('Loss');
            this.showTimeUpPopup();
        }
    }

    private showTimeUpPopup(): void {
        const popup = document.getElementById('gamePopup');
        const popupTitle = document.getElementById('popupTitle');
        const popupMessage = document.getElementById('popupMessage');
        const popupOkBtn = document.getElementById('popupOkBtn');
        if (popup && popupTitle && popupMessage && popupOkBtn) {
            popupTitle.textContent = 'Time\'s Up!';
            popupMessage.textContent = `You couldn\'t complete level ${this.currentLevel} within the time limit.`;
            popup.classList.add('show');
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'popup-buttons';
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '15px';
            buttonContainer.style.justifyContent = 'center';
            buttonContainer.style.marginTop = '20px';
            const restartBtn = document.createElement('button');
            restartBtn.className = 'confirm-btn yes-btn';
            restartBtn.textContent = 'Restart Level';
            restartBtn.addEventListener('click', () => {
                popup.classList.remove('show');
                this.startLevel(this.currentLevel);
            });
            const selectLevelBtn = document.createElement('button');
            selectLevelBtn.className = 'confirm-btn no-btn';
            selectLevelBtn.textContent = 'Select Level';
            selectLevelBtn.addEventListener('click', () => {
                popup.classList.remove('show');
                this.openLevelSelect();
            });
            buttonContainer.appendChild(restartBtn);
            buttonContainer.appendChild(selectLevelBtn);
            popupOkBtn.style.display = 'none';
            const existingButtons = popup.querySelector('.popup-buttons');
            if (existingButtons) {
                existingButtons.remove();
            }
            popupMessage.appendChild(buttonContainer);
        }
    }

    private showWin(): void {
        this.addToHistory('Win');
        this.showPopup('You Win!', 'Press OK to play again');
    }

    private addToHistory(result: 'Win' | 'Loss'): void {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('breakout_highScore', this.highScore.toString());
        }
        
        const historyItem: GameHistory = {
            date: new Date(),
            score: this.score,
            result: result,
            level: this.currentLevel
        };
        this.sessionHistory.unshift(historyItem);
        if (this.sessionHistory.length > 20) {
            this.sessionHistory.pop();
        }
        localStorage.setItem('breakout_history', JSON.stringify(this.sessionHistory));
        this.updateHistoryUI();
    }

    private updateHistoryUI(): void {
        const listElement = document.getElementById('historyList');
        if (!listElement) return;

        listElement.innerHTML = '';
        
        if (this.sessionHistory.length === 0) {
            listElement.innerHTML = '<li style="padding:10px; color:#888; text-align:center">No games played yet</li>';
            return;
        }

        this.sessionHistory.forEach(game => {
            const li = document.createElement('li');
            li.className = `history-item ${game.result === 'Win' ? 'history-win' : 'history-loss'}`;
            
            const timeStr = new Date(game.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            li.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:${game.result === 'Win' ? '#4caf50' : '#f44336'}">${game.result}</div>
                    <div style="font-size:0.8em; color:#aaa">Level ${game.level || '?'}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-weight:bold">${game.score} pts</div>
                    <div style="font-size:0.8em; color:#aaa">${timeStr}</div>
                </div>
            `;
            listElement.appendChild(li);
        });
    }

    public updateLevelGrid(): void {
        const levelGrid = document.getElementById('levelGrid');
        if (!levelGrid) return;

        levelGrid.innerHTML = '';

        for (let i = 1; i <= this.MAX_LEVELS; i++) {
            const levelItem = document.createElement('div');
            levelItem.className = 'level-item';

            if (i <= this.highestLevelUnlocked) {
                levelItem.classList.add('level-unlocked');
                levelItem.addEventListener('click', () => {
                    this.startLevel(i);
                });

                if (i === this.currentLevel) {
                    levelItem.classList.add('level-current');
                    levelItem.innerHTML = `<span>${i}</span><span class="level-icon">▶</span>`;
                } else if (i < this.highestLevelUnlocked) {
                    levelItem.classList.add('level-completed');
                    levelItem.innerHTML = `<span>${i}</span><span class="level-icon">★</span>`;
                } else {
                    levelItem.textContent = i.toString();
                }
            } else {
                levelItem.classList.add('level-locked');
                levelItem.innerHTML = `<span>${i}</span><span class="level-icon">🔒</span>`;
            }

            levelGrid.appendChild(levelItem);
        }
    }

    public startLevel(level: number): void {
        if (level > this.highestLevelUnlocked) return;
        
        this.currentLevel = level;
        localStorage.setItem('breakout_lastPlayedLevel', level.toString());
        this.score = 0;
        this.lives = 3;
        this.remainingTime = 0;
        this.calculateTimeLimit();
        
        const levelSelectScreen = document.getElementById('levelSelectScreen');
        if (levelSelectScreen) {
            levelSelectScreen.classList.remove('show');
        }
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) {
            sideMenu.classList.remove('open');
        }
        
        this.initializeGame();
        this.gameState = 'playing';
        this.gameStartTime = Date.now(); 
        if (this.app && this.app.ticker && !this.app.ticker.started) {
            this.app.ticker.start();
        }
    }

    public pause(): void {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
            if (this.app && this.app.ticker) {
                this.app.ticker.stop();
            }
        }
    }

    public resume(): void {
        if (this.gameState === 'paused') {
            this.gameState = 'playing';
            if (this.app && this.app.ticker) {
                this.app.ticker.start();
            }
        }
    }

    public toggleMusic(enabled: boolean): void {
        this.musicEnabled = enabled;
        this.soundManager.setMusicEnabled(enabled);
        localStorage.setItem('breakout_musicEnabled', enabled.toString());
        console.log(`Music ${enabled ? 'enabled' : 'disabled'}`);
    }

    public toggleSound(enabled: boolean): void {
        this.soundEnabled = enabled;
        this.soundManager.setSoundEnabled(enabled);
        localStorage.setItem('breakout_soundEnabled', enabled.toString());
        console.log(`Sound ${enabled ? 'enabled' : 'disabled'}`);
    }

    private resetGame(): void {
        if (this.gameOverText) {
            this.app.stage.removeChild(this.gameOverText);
            this.gameOverText = null;
        }
        if (this.winText) {
            this.app.stage.removeChild(this.winText);
            this.winText = null;
        }

        this.score = 0;
        this.lives = 3;
        this.elapsedTime = 0;
        this.gameStartTime = 0;
        this.remainingTime = 0;
        if (this.gameState === 'won') {
            this.currentLevel = 1;
        }
        this.gameState = 'playing';
        this.resetBall();

        this.initializeGame();
    }

    private updateUI(): void {
        const scoreElement = document.getElementById('score');
        const highScoreElement = document.getElementById('highScore');
        const timerElement = document.getElementById('timer');
        const livesElement = document.getElementById('lives');
        const usernameElement = document.getElementById('username');
        const exitBtn = document.getElementById('exitBtn');
        const levelElement = document.getElementById('level');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (highScoreElement) highScoreElement.textContent = this.highScore.toString();
        if (timerElement) {
            if (this.gameState === 'playing' && this.gameStartTime > 0) {
                const elapsed = Math.floor((Date.now() - this.gameStartTime) / 1000);
                this.remainingTime = Math.max(0, this.timeLimit - elapsed);
                if (this.remainingTime <= 0) {
                    this.handleTimeUp();
                }
            }
            const minutes = Math.floor(this.remainingTime / 60);
            const seconds = this.remainingTime % 60;
            timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            if (this.remainingTime <= 10 && this.remainingTime > 0) {
                timerElement.style.color = '#ff4444';
                timerElement.style.fontWeight = 'bold';
            } else {
                timerElement.style.color = '#ffffff';
                timerElement.style.fontWeight = '900';
            }
        }
        if (livesElement) livesElement.textContent = this.lives.toString();
        if (usernameElement) usernameElement.textContent = this.username;
        if (exitBtn) exitBtn.style.display = this.gameState === 'playing' ? 'block' : 'none';
        if (levelElement) levelElement.textContent = this.currentLevel.toString();
    }

    private calculateResponsiveDimensions(): void {
        const isMobile = window.innerWidth <= 768;
        const isPortrait = window.innerHeight > window.innerWidth;
        const uiEl = document.getElementById('ui');
        const uiHeight = uiEl ? uiEl.getBoundingClientRect().height : 0;
        const availableHeight = window.innerHeight - uiHeight;

        if (isMobile && isPortrait) {
            BRICK_COLS = 8;
            SCALE_FACTOR = window.innerWidth / (BRICK_COLS * 80 + 5);
            GAME_WIDTH = Math.floor(window.innerWidth);
            GAME_HEIGHT = Math.min(
                Math.floor(BASE_HEIGHT * SCALE_FACTOR),
                Math.floor(availableHeight * 0.85)
            );
        } else {
            BRICK_COLS = 10;
            const viewportWidth = Math.min(window.innerWidth * (isMobile ? 0.98 : 0.9), 1200);
            const viewportHeight = Math.min(availableHeight * (isMobile ? 0.98 : 0.95), 800);
            const widthScale = viewportWidth / BASE_WIDTH;
            const heightScale = viewportHeight / BASE_HEIGHT;
            SCALE_FACTOR = Math.min(widthScale, heightScale);
            GAME_WIDTH = Math.floor(BASE_WIDTH * SCALE_FACTOR);
            GAME_HEIGHT = Math.floor(BASE_HEIGHT * SCALE_FACTOR);
        }

        PADDLE_WIDTH = Math.floor(100 * SCALE_FACTOR);
        PADDLE_HEIGHT = Math.floor(20 * SCALE_FACTOR);
        BALL_RADIUS = Math.floor(10 * SCALE_FACTOR);
        BRICK_WIDTH = Math.floor(75 * SCALE_FACTOR);
        BRICK_HEIGHT = Math.floor(20 * SCALE_FACTOR);
        BRICK_PADDING = Math.floor(5 * SCALE_FACTOR);
        
        this.mouseX = GAME_WIDTH / 2;
    }

    private handleResize(): void {
        this.calculateResponsiveDimensions();
        this.adjustSpeedForLevel(false);
        this.resizeBackground();
        
        if (this.app && this.app.renderer) {
            this.app.renderer.resize(GAME_WIDTH, GAME_HEIGHT);
            const gameContainer = document.getElementById('gameContainer');
            if (gameContainer) {
                gameContainer.style.width = GAME_WIDTH + 'px';
                gameContainer.style.height = GAME_HEIGHT + 'px';
            }
            if (this.gameState === 'playing') {
                this.initializeGame();
            }
        }
    }

    public destroy(): void {
        window.removeEventListener('resize', this.resizeHandler);
        if (this.logoApp) {
            this.logoApp.destroy(true);
            this.logoApp = null;
        }
        if (this.app) {
            this.app.destroy(true);
        }
    }

    private setupUsernamePopup(): void {
        const usernamePopup = document.getElementById('usernamePopup');
        const usernameInput = document.getElementById('usernameInput') as HTMLInputElement;
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
            if (username) {
                this.username = username;
                sessionStorage.setItem('breakoutUsername', username);
                
                if (this.musicEnabled) {
                    this.soundManager.playMusic();
                }

                usernamePopup.classList.remove('show');
                this.initializeGame();
                this.showLevelStartPopup();
            } else {
                document.getElementById('usernameError')?.classList.add('show');
            }
        });
        usernameInput.addEventListener('input', () => {
            document.getElementById('usernameError')?.classList.remove('show');
        });
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGameBtn.click();
            }
        });
    }

    private createAnimatedSprite(type: PowerUpType): PIXI.AnimatedSprite {
        const rowMap: Record<PowerUpType, number> = {
            paddle_big: 8,    // gold sparkle stars (big)
            paddle_small: 8,  // gold sparkle stars (small scale)
            speed_fast: 10,   // green potion
            speed_slow: 9,    // red potion
            lightning: 0,     // gold coins
            mystery: 3,       // question mark box
            extra_life: 1,    // hearts
            extra_time: 4,    // blue cross box
        };

        const scaleMap: Record<PowerUpType, number> = {
            paddle_big: SCALE_FACTOR * 1.2,
            paddle_small: SCALE_FACTOR * 0.6,
            speed_fast: SCALE_FACTOR,
            speed_slow: SCALE_FACTOR,
            lightning: SCALE_FACTOR,
            mystery: SCALE_FACTOR,
            extra_life: SCALE_FACTOR,
            extra_time: SCALE_FACTOR,
        };

        const row = rowMap[type];
        const size = 32;
        const numFrames = 8;
        const textures: PIXI.Texture[] = [];

        if (!this.powerUpBaseTexture) {
            return new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
        }

        for (let col = 0; col < numFrames; col++) {
            const texture = new PIXI.Texture({
                source: this.powerUpBaseTexture.source,
                frame: new PIXI.Rectangle(col * size, row * size, size, size),
            });
            textures.push(texture);
        }

        const animSprite = new PIXI.AnimatedSprite(textures);
        animSprite.anchor.set(0.5);
        animSprite.scale.set(scaleMap[type]);
        animSprite.animationSpeed = 0.15;
        animSprite.play();
        return animSprite;
    }

    private updatePowerUps(): void {
        const currentTime = Date.now();
        
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            
            if (!powerUp.active) {
                this.powerUpContainer.removeChild(powerUp.container);
                this.powerUps.splice(i, 1);
                continue;
            }

            powerUp.y += powerUp.velocity * this.deltaTime;
            powerUp.container.y = powerUp.y;
            powerUp.container.rotation += 0.05;

            if (this.checkPowerUpPaddleCollision(powerUp)) {
                this.activatePowerUp(powerUp.type);
                powerUp.active = false;
            }

            if (powerUp.y > GAME_HEIGHT) {
                powerUp.active = false;
            }
        }

        for (const [type, endTime] of this.activePowerUpEffects.entries()) {
            if (currentTime > endTime) {
                this.deactivatePowerUp(type);
            }
        }

        for (let i = this.lightningEffects.length - 1; i >= 0; i--) {
            const lightning = this.lightningEffects[i];
            lightning.alpha -= 0.05;
            
            if (lightning.alpha <= 0) {
                this.powerUpContainer.removeChild(lightning);
                this.lightningEffects.splice(i, 1);
            }
        }
    }

    public setBackground(type: 'morning' | 'night'): void {
        this.backgroundType = type;
        if (this.background) {
            this.background.texture = PIXI.Texture.from(type === 'morning' ? bgMorning : bgNight);
            this.resizeBackground();
        }
        localStorage.setItem('breakout_background', type);
    }

    private resizeBackground(): void {
        if (!this.background) return;
        this.background.x = GAME_WIDTH / 2;
        this.background.y = GAME_HEIGHT / 2;
        const scaleX = GAME_WIDTH / this.background.texture.width;
        const scaleY = GAME_HEIGHT / this.background.texture.height;
        const scale = Math.max(scaleX, scaleY); 
        this.background.scale.set(scale);
    }

    private async setupSpineLogo(): Promise<void> {
        const container = document.getElementById('spineLogoContainer');
        if (!container) return;

        try {
            this.logoApp = new PIXI.Application();
            await this.logoApp.init({
                width: 50,
                height: 50,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });
            this.logoApp.renderer.background.alpha = 0;
            this.logoApp.canvas.style.width = '50px';
            this.logoApp.canvas.style.height = '50px';
            this.logoApp.canvas.style.pointerEvents = 'none';
            this.logoApp.canvas.style.background = 'transparent';
            container.appendChild(this.logoApp.canvas);

            const creatureAsset = await PIXI.Assets.load('halloweenCreature');
            this.logoSpine = new Spine(creatureAsset.spineData);

            if (this.logoSpine.skeleton.data.animations.length > 0) {
                this.logoSpine.state.setAnimation(0, this.logoSpine.skeleton.data.animations[0].name, true);
            }

            this.logoSpine.x = 25;
            this.logoSpine.y = 45;
            this.logoSpine.scale.set(0.1);
            this.logoApp.stage.addChild(this.logoSpine);
        } catch (e) {
            console.error('Failed to setup spine logo', e);
        }
    }

    private resizeSpine(): void {
        if (!this.spineAnim) return;
        this.spineAnim.x = GAME_WIDTH - 60;
        this.spineAnim.y = 25;
        const scale = 0.2; 
        this.spineAnim.scale.set(scale);
    }

    private createPowerUp(x: number, y: number, type: PowerUpType): void {
        const container = new PIXI.Container();
        container.x = x;
        container.y = y;

        const sprite = this.createAnimatedSprite(type);

        const labelMap: Record<PowerUpType, string> = {
            paddle_big: 'BIG',
            paddle_small: 'SMALL',
            speed_fast: 'FAST',
            speed_slow: 'SLOW',
            lightning: 'ZAP',
            mystery: '???',
            extra_life: '+LIFE',
            extra_time: '+30s',
        };

        const label = new PIXI.Text({
            text: labelMap[type],
            style: {
                fontSize: Math.max(8, Math.round(10 * SCALE_FACTOR)),
                fill: 0xFFFFFF,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 2 },
            },
        });
        label.anchor.set(0.5);
        label.y = 16 * SCALE_FACTOR;
        label.alpha = 0.7;

        const powerUp: PowerUp = {
            type,
            x,
            y,
            velocity: 2 * SCALE_FACTOR,
            sprite,
            container,
            active: true
        };

        container.addChild(sprite);
        container.addChild(label);
        this.powerUps.push(powerUp);
        this.powerUpContainer.addChild(container);
    }

    private checkPowerUpPaddleCollision(powerUp: PowerUp): boolean {
        const paddleWidth = this.getCurrentPaddleWidth();
        const paddleLeft = this.paddle.x;
        const paddleRight = paddleLeft + paddleWidth;
        const paddleTop = this.paddle.y;
        const paddleBottom = paddleTop + PADDLE_HEIGHT;

        return powerUp.x >= paddleLeft && 
               powerUp.x <= paddleRight && 
               powerUp.y >= paddleTop && 
               powerUp.y <= paddleBottom;
    }

    private activatePowerUp(type: PowerUpType): void {
        this.createPowerUpBackgroundEffect(type);

        if (type === 'mystery') {
            const realTypes: PowerUpType[] = ['paddle_big', 'paddle_small', 'speed_fast', 'speed_slow', 'lightning', 'extra_life', 'extra_time'];
            const randomType = realTypes[Math.floor(Math.random() * realTypes.length)];
            this.activatePowerUp(randomType);
            return;
        }

        // Instant power-ups — apply and return, no timer needed
        if (type === 'extra_life') {
            this.lives = Math.min(this.lives + 1, 9);
            return;
        }
        if (type === 'extra_time') {
            this.timeLimit += 30;
            return;
        }
        if (type === 'lightning') {
            this.createLightningStrike();
            return;
        }

        const opposites: Partial<Record<PowerUpType, PowerUpType>> = {
            speed_fast: 'speed_slow',
            speed_slow: 'speed_fast',
            paddle_big: 'paddle_small',
            paddle_small: 'paddle_big',
        };
        const opposite = opposites[type];
        if (opposite && this.activePowerUpEffects.has(opposite)) {
            this.deactivatePowerUp(opposite);
        }

        const endTime = Date.now() + this.POWER_UP_DURATION;
        this.activePowerUpEffects.set(type, endTime);

        switch (type) {
            case 'paddle_big':
            case 'paddle_small':
                break;
            case 'speed_fast': {
                const curr = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
                const newSpeed = curr * 1.5;
                this.baseBallSpeed = newSpeed;
                if (curr > 0) {
                    this.ballVelocity.x = (this.ballVelocity.x / curr) * newSpeed;
                    this.ballVelocity.y = (this.ballVelocity.y / curr) * newSpeed;
                }
                break;
            }
            case 'speed_slow': {
                const curr = Math.sqrt(this.ballVelocity.x ** 2 + this.ballVelocity.y ** 2);
                const newSpeed = curr / 1.5;
                this.baseBallSpeed = newSpeed;
                if (curr > 0) {
                    this.ballVelocity.x = (this.ballVelocity.x / curr) * newSpeed;
                    this.ballVelocity.y = (this.ballVelocity.y / curr) * newSpeed;
                }
                break;
            }
        }

        this.updatePaddleVisual();
    }

    private deactivatePowerUp(type: PowerUpType): void {
        this.activePowerUpEffects.delete(type);

        switch (type) {
            case 'paddle_big':
            case 'paddle_small':
                break;
            case 'speed_fast':
            case 'speed_slow':
                this.adjustSpeedForLevel(false);
                break;
            default:
                break;
        }

        this.updatePaddleVisual();
    }

    private updatePaddleVisual(): void {
        const paddleWidth = this.getCurrentPaddleWidth();
        this.paddle.clear();
        
        let color = 0xFFFFFF;
        if (this.activePowerUpEffects.has('paddle_big')) {
            color = 0x00FF00;
        } else if (this.activePowerUpEffects.has('paddle_small')) {
            color = 0xFF0000;
        } else if (this.activePowerUpEffects.has('speed_fast')) {
            color = 0xFFFF00;
        } else if (this.activePowerUpEffects.has('speed_slow')) {
            color = 0x0099FF;
        }
        
        this.paddle.beginFill(color);
        this.paddle.drawRect(0, 0, paddleWidth, PADDLE_HEIGHT);
        this.paddle.endFill();
    }

    private createLightningStrike(): void {
        this.createLightningBackgroundEffect();
        const availableBricks: {row: number, col: number, brick: PIXI.Graphics}[] = [];
        
        for (let row = 0; row < this.bricks.length; row++) {
            for (let col = 0; col < this.bricks[row].length; col++) {
                const brick = this.bricks[row][col];
                if (brick && brick.visible) {
                    availableBricks.push({row, col, brick});
                }
            }
        }

        const bricksToDestroy = [];
        const numToDestroy = Math.min(4, availableBricks.length);
        
        for (let i = 0; i < numToDestroy; i++) {
            const randomIndex = Math.floor(Math.random() * availableBricks.length);
            bricksToDestroy.push(availableBricks[randomIndex]);
            availableBricks.splice(randomIndex, 1);
        }

        bricksToDestroy.forEach(({row, col, brick}) => {
            this.createLightningEffect(brick.x + BRICK_WIDTH/2, brick.y + BRICK_HEIGHT/2);
            this.score += 10;

            // Flash gold then remove after a short delay
            brick.clear().rect(0, 0, BRICK_WIDTH, BRICK_HEIGHT).fill(0xDAA520);

            setTimeout(() => {
                brick.visible = false;
                if (this.allBricksDestroyed()) {
                    this.levelComplete();
                }
            }, 350);
        });
    }

    private createLightningEffect(x: number, y: number): void {
        const lightning = new PIXI.Graphics();
        lightning.lineStyle(2, 0xFF00FF, 1);
        lightning.moveTo(x, y - 20);
        lightning.lineTo(x - 5, y - 5);
        lightning.lineTo(x + 3, y);
        lightning.lineTo(x - 2, y + 5);
        lightning.lineTo(x, y + 20);

        lightning.alpha = 1;
        this.lightningEffects.push(lightning);
        this.powerUpContainer.addChild(lightning);
    }

    private createLightningBackgroundEffect(): void {
        // Brief full-screen pale-blue flash
        const flash = new PIXI.Graphics();
        flash.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xAADDFF, alpha: 1 });
        flash.alpha = 0.4;
        this.powerUpContainer.addChild(flash);

        const fadeFlash = () => {
            flash.alpha -= 0.03;
            if (flash.alpha > 0) {
                requestAnimationFrame(fadeFlash);
            } else {
                this.powerUpContainer.removeChild(flash);
                flash.destroy();
            }
        };
        requestAnimationFrame(fadeFlash);

        // Three jagged vertical bolts spread across the screen
        const numBolts = 3;
        for (let i = 0; i < numBolts; i++) {
            const startX = GAME_WIDTH * (0.2 + (i / (numBolts - 1)) * 0.6);
            const path: { x: number; y: number }[] = [{ x: startX, y: 0 }];
            let cx = startX;
            let cy = 0;
            while (cy < GAME_HEIGHT) {
                cy += 12 + Math.random() * 20;
                cx += (Math.random() - 0.5) * 28;
                path.push({ x: cx, y: cy });
            }

            // Glow (wide, translucent blue)
            const glow = new PIXI.Graphics();
            glow.moveTo(path[0].x, path[0].y);
            for (let j = 1; j < path.length; j++) glow.lineTo(path[j].x, path[j].y);
            glow.stroke({ color: 0x88BBFF, width: 10, alpha: 0.35 });
            glow.alpha = 1;

            // Core (thin, bright white)
            const core = new PIXI.Graphics();
            core.moveTo(path[0].x, path[0].y);
            for (let j = 1; j < path.length; j++) core.lineTo(path[j].x, path[j].y);
            core.stroke({ color: 0xFFFFFF, width: 2, alpha: 1 });
            core.alpha = 1;

            this.lightningEffects.push(glow, core);
            this.powerUpContainer.addChild(glow);
            this.powerUpContainer.addChild(core);
        }
    }

    private getPowerUpSpawnChance(): number {
        const base = Math.max(0.40, 0.70 - (this.currentLevel - 1) * 0.05);
        if (this.currentLevel > 20) {
            return Math.max(0.10, base - (this.currentLevel - 20) * 0.025);
        }
        return base;
    }

    private spawnPowerUpFromBrick(brickX: number, brickY: number): void {
        if (Math.random() < this.getPowerUpSpawnChance()) {
            const types: PowerUpType[] = ['paddle_big', 'paddle_small', 'speed_fast', 'speed_slow', 'lightning', 'mystery', 'extra_life', 'extra_time'];
            const randomType = types[Math.floor(Math.random() * types.length)];
            this.createPowerUp(brickX + BRICK_WIDTH/2, brickY + BRICK_HEIGHT/2, randomType);
        }
    }

    private createPowerUpBackgroundEffect(type: PowerUpType): void {
        switch (type) {
            case 'speed_fast':   this.createClockEffect('FAST', 0xFFAA00); break;
            case 'speed_slow':   this.createClockEffect('SLOW', 0x44AAFF); break;
            case 'extra_time':   this.createClockEffect('+30s', 0x4488FF); break;
            case 'extra_life':   this.createLifeEffect(); break;
            case 'paddle_big':   this.createPaddleSizeEffect('big'); break;
            case 'paddle_small': this.createPaddleSizeEffect('small'); break;
            case 'mystery':      break; 
            case 'lightning':    break; 
        }
    }

    private fadeAndRemove(element: PIXI.Container, delayMs: number = 700, rate: number = 0.02): void {
        setTimeout(() => {
            const tick = () => {
                element.alpha -= rate;
                if (element.alpha > 0) {
                    requestAnimationFrame(tick);
                } else {
                    if (element.parent) element.parent.removeChild(element);
                    element.destroy({ children: true });
                }
            };
            requestAnimationFrame(tick);
        }, delayMs);
    }

    private createClockEffect(label: string, color: number): void {
        const container = new PIXI.Container();
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const r = 55;

        // Subtle background tint
        const bg = new PIXI.Graphics();
        bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color, alpha: 1 });
        bg.alpha = 0.12;
        container.addChild(bg);

        // Clock face
        const gfx = new PIXI.Graphics();
        gfx.circle(cx, cy - 25, r).stroke({ color, width: 4, alpha: 0.75 });
        gfx.moveTo(cx, cy - 25).lineTo(cx, cy - 25 - Math.round(r * 0.62)).stroke({ color, width: 4, alpha: 0.85 });
        gfx.moveTo(cx, cy - 25).lineTo(cx + Math.round(r * 0.75), cy - 25).stroke({ color, width: 3, alpha: 0.85 });
        gfx.circle(cx, cy - 25, 5).fill({ color, alpha: 1 });
        gfx.moveTo(cx, cy - 25 - r).lineTo(cx, cy - 25 - r + 9).stroke({ color, width: 3, alpha: 0.6 });
        container.addChild(gfx);

        // Label
        const text = new PIXI.Text({
            text: label,
            style: {
                fontSize: Math.max(28, Math.round(50 * SCALE_FACTOR)),
                fill: color,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 6 },
            },
        });
        text.anchor.set(0.5);
        text.position.set(cx, cy + 48);
        container.addChild(text);

        container.alpha = 0.9;
        this.powerUpContainer.addChild(container);
        this.fadeAndRemove(container);
    }

    private createLifeEffect(): void {
        const container = new PIXI.Container();
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const hr = 32;


        const bg = new PIXI.Graphics();
        bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0xFF3366, alpha: 1 });
        bg.alpha = 0.13;
        container.addChild(bg);

        const heart = new PIXI.Graphics();
        heart.circle(cx - Math.round(hr * 0.72), cy - Math.round(hr * 0.25), hr).fill({ color: 0xFF3366, alpha: 0.7 });
        heart.circle(cx + Math.round(hr * 0.72), cy - Math.round(hr * 0.25), hr).fill({ color: 0xFF3366, alpha: 0.7 });
        const tx = Math.round(hr * 1.58);
        heart.moveTo(cx - tx, cy - Math.round(hr * 0.1));
        heart.lineTo(cx + tx, cy - Math.round(hr * 0.1));
        heart.lineTo(cx, cy + Math.round(hr * 1.35));
        heart.lineTo(cx - tx, cy - Math.round(hr * 0.1));
        heart.fill({ color: 0xFF3366, alpha: 0.7 });
        container.addChild(heart);

        const text = new PIXI.Text({
            text: '+LIFE',
            style: {
                fontSize: Math.max(28, Math.round(50 * SCALE_FACTOR)),
                fill: 0xFF77CC,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 6 },
            },
        });
        text.anchor.set(0.5);
        text.position.set(cx, cy + 62);
        container.addChild(text);

        container.alpha = 0.9;
        this.powerUpContainer.addChild(container);
        this.fadeAndRemove(container);
    }

    private createPaddleSizeEffect(size: 'big' | 'small'): void {
        const container = new PIXI.Container();
        const cx = GAME_WIDTH / 2;
        const cy = GAME_HEIGHT / 2;
        const isBig = size === 'big';
        const color = isBig ? 0x00FF88 : 0xFF4400;
        const w = isBig ? 180 : 68;
        const h = isBig ? 28 : 18;

        const bg = new PIXI.Graphics();
        bg.rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color, alpha: 1 });
        bg.alpha = 0.13;
        container.addChild(bg);

        const paddle = new PIXI.Graphics();
        paddle.rect(cx - w / 2, cy - h / 2 - 20, w, h).fill({ color, alpha: 0.6 });
        container.addChild(paddle);

        const text = new PIXI.Text({
            text: isBig ? 'BIG' : 'SMALL',
            style: {
                fontSize: Math.max(28, Math.round(52 * SCALE_FACTOR)),
                fill: color,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 6 },
            },
        });
        text.anchor.set(0.5);
        text.position.set(cx, cy + 30);
        container.addChild(text);

        container.alpha = 0.9;
        this.powerUpContainer.addChild(container);
        this.fadeAndRemove(container);
    }
}

class Game {
}

declare global {
    var __PIXI_APP__: import('pixi.js').Application | undefined;
}
