import * as PIXI from 'pixi.js';
import { SoundManager } from './sound';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import bgMorning from './assets/images/background/bg-morning.webp';
import bgNight from './assets/images/background/bg-night.webp';

// Responsive game constants (will be calculated based on screen size)
let GAME_WIDTH = 800;
let GAME_HEIGHT = 600;
let PADDLE_WIDTH = 100;
let PADDLE_HEIGHT = 20;
let BALL_RADIUS = 10;
let BRICK_WIDTH = 75;
let BRICK_HEIGHT = 20;
const BRICK_ROWS = 8;
const BRICK_COLS = 10;
let BRICK_PADDING = 5;

// Base dimensions for scaling calculations
const BASE_WIDTH = 800;
const BASE_HEIGHT = 600;
let SCALE_FACTOR = 1;

// Paddle collision zone constants
const PADDLE_SIDE_ZONE_WIDTH = 10; // Width of left/right side zones
const PADDLE_TOP_ZONE_HEIGHT = 5; // Height of top zone for angled bounces

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

type GameState = 'start' | 'playing' | 'gameOver' | 'won' | 'levelIntro';

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
    private gameOverText: PIXI.Text | null = null;
    private winText: PIXI.Text | null = null;
    private username: string = '';
    private resizeHandler: () => void;
    private soundManager: SoundManager;// Background
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

    constructor() {
        this.app = new PIXI.Application();
        this.bricksContainer = new PIXI.Container();
        this.gameObjectsContainer = new PIXI.Container();
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
        // Decrease paddle width slightly as level increases
        // Level 1: Multiplier 1.2
        // Level 30: Multiplier 0.7
        const multiplier = Math.max(0.7, 1.2 - ((this.currentLevel - 1) * 0.02));
        return PADDLE_WIDTH * multiplier;
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
            await PIXI.Assets.load([bgMorning, bgNight]);
            this.background = PIXI.Sprite.from(this.backgroundType === 'morning' ? bgMorning : bgNight);
            this.background.anchor.set(0.5);
            this.app.stage.addChild(this.background);
            this.resizeBackground();
        } catch (e) {
            console.error('Failed to load background images', e);
        }
        // Load Spine Animation
        try {
            PIXI.Assets.add({
                alias: 'halloweenCreature',
                src: '/assets/HalloweenCreature/HalloweenCreature.skel'
            });
            const creatureAsset = await PIXI.Assets.load('halloweenCreature');
            this.spineAnim = new Spine(creatureAsset.spineData);
            
            // Play first animation
            if (this.spineAnim.skeleton.data.animations.length > 0) {
                this.spineAnim.state.setAnimation(0, this.spineAnim.skeleton.data.animations[0].name, true);
            }
            
            this.app.stage.addChild(this.spineAnim);
            this.resizeSpine();
        } catch (e) {
            console.error('Failed to load spine animation', e);
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
        // Clear containers
        this.bricksContainer.removeChildren();
        this.gameObjectsContainer.removeChildren();

        // Create paddle
        const paddleWidth = this.getCurrentPaddleWidth();
        this.paddle.clear();
        this.paddle.beginFill(0xFFFFFF);
        this.paddle.drawRect(0, 0, paddleWidth, PADDLE_HEIGHT);
        this.paddle.endFill();
        this.paddle.x = GAME_WIDTH / 2 - paddleWidth / 2;
        this.paddle.y = GAME_HEIGHT - 50;
        this.gameObjectsContainer.addChild(this.paddle);

        // Create ball
        this.ball.clear();
        this.ball.beginFill(0xFFFFFF);
        this.ball.drawCircle(0, 0, BALL_RADIUS);
        this.ball.endFill();
        this.ball.x = GAME_WIDTH / 2;
        this.ball.y = GAME_HEIGHT / 2;
        this.gameObjectsContainer.addChild(this.ball);
        
        // Adjust speed for level
        this.adjustSpeedForLevel(true);

        // Create bricks
        this.createBricks();
        
        // Update Level UI
        const levelElement = document.getElementById('level');
        if (levelElement) levelElement.textContent = this.currentLevel.toString();
    }
    
    private adjustSpeedForLevel(reset: boolean = false): void {
        // Base speed 6, max 12
        // Increase by 0.2 per level
        let speed = 6 + (this.currentLevel - 1) * 0.2;
        if (window.innerWidth <= 768) {
            speed *= 0.6; // Mobile scaling
        }
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
        
        const colors: number[] = [0xFF0000, 0xFF8000, 0xFFFF00, 0x00FF00, 0x0088FF, 0x0000FF, 0xb300b3, 0x620031];
        
        for (let row = 0; row < rows; row++) {
            this.bricks[row] = [];
            for (let col = 0; col < cols; col++) {
                const brick = new PIXI.Graphics();
                const colorIndex = (row + Math.floor((this.currentLevel - 1) / 3)) % colors.length;
                brick.beginFill(colors[colorIndex]);
                brick.drawRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT);
                brick.endFill();
                brick.x = col * (BRICK_WIDTH + BRICK_PADDING) + BRICK_PADDING;
                brick.y = row * (BRICK_HEIGHT + BRICK_PADDING) + 50;
                brick.visible = true;
                this.bricks[row][col] = brick;
                this.bricksContainer.addChild(brick);
            }
        }
    }

    private setupEventListeners(): void {
        // Mouse movement for paddle control
        this.app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            const rect = this.app.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
        });

        // Touch events for mobile
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

        // Keyboard controls
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

        // Calculate delta time for consistent speed across devices
        const currentTime = performance.now();
        if (this.lastTime === 0) this.lastTime = currentTime;
        this.deltaTime = (currentTime - this.lastTime) / 16.67; // Normalize to 60fps
        this.lastTime = currentTime;

        // Clamp delta time to prevent large jumps
        this.deltaTime = Math.min(this.deltaTime, 2);

        this.updatePaddle();
        this.updateBall();
        this.checkCollisions();
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
        // Apply delta time to make ball speed consistent across devices
        const speedMultiplier = this.deltaTime;
        this.ball.x += this.ballVelocity.x * speedMultiplier;
        this.ball.y += this.ballVelocity.y * speedMultiplier;

        // Ball collision with walls
        if (this.ball.x <= BALL_RADIUS || this.ball.x >= GAME_WIDTH - BALL_RADIUS) {
            this.ballVelocity.x = -this.ballVelocity.x;
        }
        
        if (this.ball.y <= BALL_RADIUS) {
            this.ballVelocity.y = -this.ballVelocity.y;
        }

        // Ball falls below paddle
        if (this.ball.y > GAME_HEIGHT) {
            this.lives--;
            if (this.lives <= 0) {
                this.gameState = 'gameOver';
                this.showGameOver();
            } else {
                this.resetBall();
            }
        }
    }

    private checkCollisions(): void {
        // Get current paddle width based on difficulty
        const currentPaddleWidth = this.getCurrentPaddleWidth();
        
        // Ball-paddle collision
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
                    this.ballVelocity.x = -Math.abs(currentSpeed * 0.5); // Push left
                    this.ballVelocity.y = -Math.abs(currentSpeed * 0.866); // Push up (sin(60))
                    this.showCollisionFeedback('left');
                } else if (hitRightSide && this.ballVelocity.x < 0) {
                    this.ballVelocity.x = Math.abs(currentSpeed * 0.5); // Push right
                    this.ballVelocity.y = -Math.abs(currentSpeed * 0.866); // Push up (sin(60))
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

        // Ball-brick collision
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
                    
                    if (this.allBricksDestroyed()) {
                        this.levelComplete();
                    }
                    return;
                }
            }
        }
    }

    private showCollisionFeedback(zone: string): void {
        // Set color based on zone (different colors for different effects)
        let color = 0x00FF00; // Green for top
        switch (zone) {
            case 'left':
                color = 0x0000FF; // Blue for left
                break;
            case 'right':
                color = 0x0000FF; // Blue for right
                break;
            case 'bottom':
                color = 0x00FF00; // Green for bottom
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
        this.addToHistory('Loss');
        this.showPopup('Game Over', 'Press OK to restart');
    }

    private showWin(): void {
        this.addToHistory('Win');
        this.showPopup('You Win!', 'Press OK to play again');
    }

    private addToHistory(result: 'Win' | 'Loss'): void {
        const historyItem: GameHistory = {
            date: new Date(),
            score: this.score,
            result: result,
            level: this.currentLevel
        };
        this.sessionHistory.unshift(historyItem);
        // Limit to 20 items
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
        
        // Hide level select screen
        const levelSelectScreen = document.getElementById('levelSelectScreen');
        if (levelSelectScreen) {
            levelSelectScreen.classList.remove('show');
        }
        
        this.initializeGame();
        this.showLevelStartPopup();
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
        if (this.gameState === 'won') {
            this.currentLevel = 1;
        }
        this.gameState = 'playing';
        this.resetBall();

        this.initializeGame();
    }

    private updateUI(): void {
        const scoreElement = document.getElementById('score');
        const livesElement = document.getElementById('lives');
        const usernameElement = document.getElementById('username');
        const exitBtn = document.getElementById('exitBtn');
        const levelElement = document.getElementById('level');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (livesElement) livesElement.textContent = this.lives.toString();
        if (usernameElement) usernameElement.textContent = this.username;
        if (exitBtn) exitBtn.style.display = this.gameState === 'playing' ? 'block' : 'none';
        if (levelElement) levelElement.textContent = this.currentLevel.toString();
    }

    private calculateResponsiveDimensions(): void {
        // Get viewport dimensions
        const viewportWidth = Math.min(window.innerWidth * 0.9, 1200); // Max 1200px
        const viewportHeight = Math.min(window.innerHeight * 0.8, 800); // Max 800px
        
        // Calculate scale factor to maintain aspect ratio
        const widthScale = viewportWidth / BASE_WIDTH;
        const heightScale = viewportHeight / BASE_HEIGHT;
        SCALE_FACTOR = Math.min(widthScale, heightScale);
        
        // Apply scaling to game dimensions
        GAME_WIDTH = Math.floor(BASE_WIDTH * SCALE_FACTOR);
        GAME_HEIGHT = Math.floor(BASE_HEIGHT * SCALE_FACTOR);
        PADDLE_WIDTH = Math.floor(100 * SCALE_FACTOR);
        PADDLE_HEIGHT = Math.floor(20 * SCALE_FACTOR);
        BALL_RADIUS = Math.floor(10 * SCALE_FACTOR);
        BRICK_WIDTH = Math.floor(75 * SCALE_FACTOR);
        BRICK_HEIGHT = Math.floor(20 * SCALE_FACTOR);
        BRICK_PADDING = Math.floor(5 * SCALE_FACTOR);
        
        // Update mouse position for new dimensions
        this.mouseX = GAME_WIDTH / 2;
    }

    private handleResize(): void {
        // Recalculate dimensions
        this.calculateResponsiveDimensions();
        
        // Adjust ball speed for new screen size
        this.adjustSpeedForLevel(false);
        
        // Update background
        this.resizeBackground();

        // Update spine
        this.resizeSpine();
        
        // Update canvas and container sizes
        if (this.app && this.app.renderer) {
            this.app.renderer.resize(GAME_WIDTH, GAME_HEIGHT);
            
            const gameContainer = document.getElementById('gameContainer');
            if (gameContainer) {
                gameContainer.style.width = GAME_WIDTH + 'px';
                gameContainer.style.height = GAME_HEIGHT + 'px';
            }
            
            // Reinitialize game with new dimensions if currently playing
            if (this.gameState === 'playing') {
                this.initializeGame();
            }
        }
    }

    public destroy(): void {
        // Clean up resize listener
        window.removeEventListener('resize', this.resizeHandler);
        if (this.logoApp) {
            this.logoApp.destroy(true);
            this.logoApp = null;
        }

        // Destroy PIXI app
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
                
                // Start music on first user interaction
                if (this.musicEnabled) {
                    this.soundManager.playMusic();
                }

                usernamePopup.classList.remove('show');
                // Use stored level instead of forcing 1
                // this.currentLevel = 1; 
                this.initializeGame();
                this.showLevelStartPopup();
            } else {
                alert('Please enter a username!');
            }
        });
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                startGameBtn.click();
            }
        });
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

        // Position at top right, left of the menu button
        this.spineAnim.x = GAME_WIDTH - 60;
        this.spineAnim.y = 25;

        // Scale to reasonable size (e.g. 50px height)
        const targetHeight = 50;
        // Default height from atlas was ~269. Use bounds or fixed scale.
        // If not loaded yet, bounds might be 0.
        // But resizeSpine is called after load.
        // Safe fallback: 0.2
        const scale = 0.2; 
        this.spineAnim.scale.set(scale);
    }
}




declare global {
    var __PIXI_APP__: import('pixi.js').Application | undefined;
}