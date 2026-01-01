import * as PIXI from 'pixi.js';

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

interface Velocity {
    x: number;
    y: number;
}

type GameState = 'start' | 'playing' | 'gameOver' | 'won';

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

    constructor() {
        this.app = new PIXI.Application();
        this.bricksContainer = new PIXI.Container();
        this.gameObjectsContainer = new PIXI.Container();

        this.score = 0;
        this.lives = 3;
        this.gameState = 'start';
        this.mouseX = GAME_WIDTH / 2;

        this.paddle = new PIXI.Graphics();
        this.ball = new PIXI.Graphics();
        this.bricks = [];
        this.ballVelocity = { x: 3, y: -3 };
        
        // Calculate responsive dimensions
        this.calculateResponsiveDimensions();
        
        // Bind resize handler
        this.resizeHandler = this.handleResize.bind(this);
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
        
        // Set canvas to be responsive
        this.app.canvas.style.width = '100%';
        this.app.canvas.style.height = '100%';
        this.app.canvas.style.display = 'block';
        
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
            gameContainer.appendChild(this.app.canvas);
            gameContainer.style.width = GAME_WIDTH + 'px';
            gameContainer.style.height = GAME_HEIGHT + 'px';
            gameContainer.style.maxWidth = '100vw';
            gameContainer.style.maxHeight = '100vh';
        }
        
        this.app.stage.addChild(this.bricksContainer);
        this.app.stage.addChild(this.gameObjectsContainer);
        this.setupUsernamePopup();
        if (this.username) {
            this.gameState = 'playing';
            this.initializeGame();
        }
        this.setupEventListeners();
        this.app.ticker.add(this.gameLoop.bind(this));
        
        // Add resize listener
        window.addEventListener('resize', this.resizeHandler);
    }

    private initializeGame(): void {
        // Clear containers
        this.bricksContainer.removeChildren();
        this.gameObjectsContainer.removeChildren();

        // Create paddle
        this.paddle.clear();
        this.paddle.beginFill(0xFFFFFF);
        this.paddle.drawRect(0, 0, PADDLE_WIDTH, PADDLE_HEIGHT);
        this.paddle.endFill();
        this.paddle.x = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
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

        // Create bricks
        this.createBricks();
    }

    private createBricks(): void {
        this.bricks = [];
        const colors: number[] = [0xFF0000, 0xFF8000, 0xFFFF00, 0x00FF00, 0x0088FF, 0x0000FF, 0xb300b3, 0x620031];
        for (let row = 0; row < BRICK_ROWS; row++) {
            this.bricks[row] = [];
            for (let col = 0; col < BRICK_COLS; col++) {
                const brick = new PIXI.Graphics();
                brick.beginFill(colors[row]);
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
        // Mouse movement for paddle control (v8: use canvas)
        this.app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
            const rect = this.app.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
        });

        // Keyboard controls
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' && this.paddle.x > 0) {
                this.paddle.x -= 20;
            } else if (e.key === 'ArrowRight' && this.paddle.x < GAME_WIDTH - PADDLE_WIDTH) {
                this.paddle.x += 20;
            } else if (e.key === ' ' && this.gameState !== 'playing') {
                this.resetGame();
            }
        });
    }

    private gameLoop(): void {
        if (this.gameState === 'start') return;
        if (this.gameState !== 'playing') return;

        this.updatePaddle();
        this.updateBall();
        this.checkCollisions();
        this.updateUI();
    }

    private updatePaddle(): void {
        this.paddle.x = this.mouseX - PADDLE_WIDTH / 2;
        
        if (this.paddle.x < 0) this.paddle.x = 0;
        if (this.paddle.x > GAME_WIDTH - PADDLE_WIDTH) {
            this.paddle.x = GAME_WIDTH - PADDLE_WIDTH;
        }
    }

    private updateBall(): void {
        this.ball.x += this.ballVelocity.x;
        this.ball.y += this.ballVelocity.y;

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
        // Ball-paddle collision
        if (this.ball.y + BALL_RADIUS >= this.paddle.y &&
            this.ball.y - BALL_RADIUS <= this.paddle.y + PADDLE_HEIGHT &&
            this.ball.x >= this.paddle.x &&
            this.ball.x <= this.paddle.x + PADDLE_WIDTH) {
            
            this.ballVelocity.y = -Math.abs(this.ballVelocity.y);
            
            const hitPos = (this.ball.x - this.paddle.x) / PADDLE_WIDTH;
            this.ballVelocity.x = (hitPos - 0.5) * 6;
        }

        // Ball-brick collision
        for (let row = 0; row < BRICK_ROWS; row++) {
            for (let col = 0; col < BRICK_COLS; col++) {
                const brick = this.bricks[row][col];
                if (!brick.visible) continue;

                if (this.ball.x + BALL_RADIUS >= brick.x &&
                    this.ball.x - BALL_RADIUS <= brick.x + BRICK_WIDTH &&
                    this.ball.y + BALL_RADIUS >= brick.y &&
                    this.ball.y - BALL_RADIUS <= brick.y + BRICK_HEIGHT) {
                    
                    brick.visible = false;
                    this.ballVelocity.y = -this.ballVelocity.y;
                    this.score += 10;
                    
                    if (this.allBricksDestroyed()) {
                        this.gameState = 'won';
                        this.showWin();
                    }
                    return;
                }
            }
        }
    }

    private allBricksDestroyed(): boolean {
        return this.bricks.every(row => 
            row.every(brick => !brick.visible)
        );
    }

    private resetBall(): void {
        this.ball.x = GAME_WIDTH / 2;
        this.ball.y = GAME_HEIGHT / 2;
        this.ballVelocity.x = Math.random() > 0.5 ? 3 : -3;
        this.ballVelocity.y = -3;
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
    
            // Remove previous listeners to avoid stacking
            const newBtn = popupOkBtn.cloneNode(true) as HTMLElement;
            popupOkBtn.parentNode?.replaceChild(newBtn, popupOkBtn);
    
            newBtn.addEventListener('click', () => {
                popup.classList.remove('show');
                // Optionally, reset game if needed
                if (this.gameState !== 'playing') {
                    this.resetGame();
                }
            });
        }
    }

    private showGameOver(): void {
        this.showPopup('Game Over', 'Press OK to restart');
    }

    private showWin(): void {
        this.showPopup('You Win!', 'Press OK to play again');
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
        this.gameState = 'playing';
        this.resetBall();

        this.bricks.forEach(row => 
            row.forEach(brick => brick.visible = true)
        );
    }

    private updateUI(): void {
        const scoreElement = document.getElementById('score');
        const livesElement = document.getElementById('lives');
        
        if (scoreElement) scoreElement.textContent = this.score.toString();
        if (livesElement) livesElement.textContent = this.lives.toString();
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
                usernamePopup.classList.remove('show');
                this.gameState = 'playing';
                this.initializeGame();
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
}

// Start the game
window.addEventListener('load', async () => {
    const game = new BreakoutGame();
    await game.start();
});


declare global {
    var __PIXI_APP__: import('pixi.js').Application | undefined;
}