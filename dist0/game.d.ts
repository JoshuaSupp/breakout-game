export declare class BreakoutGame {
    private app;
    private bricksContainer;
    private gameObjectsContainer;
    private paddle;
    private ball;
    private bricks;
    private ballVelocity;
    private mouseX;
    private score;
    private lives;
    private gameState;
    private gameOverText;
    private winText;
    private username;
    private resizeHandler;
    private isDragging;
    private lastTouchX;
    private baseBallSpeed;
    private deltaTime;
    private lastTime;
    constructor();
    start(): Promise<void>;
    private initializeGame;
    private createBricks;
    private setupEventListeners;
    private gameLoop;
    private updatePaddle;
    private updateBall;
    private checkCollisions;
    private allBricksDestroyed;
    private resetBall;
    private showPopup;
    private showGameOver;
    private showWin;
    private resetGame;
    private updateUI;
    private calculateResponsiveDimensions;
    private adjustSpeedForDevice;
    private handleResize;
    destroy(): void;
    private setupUsernamePopup;
}
declare global {
    var __PIXI_APP__: import('pixi.js').Application | undefined;
}
//# sourceMappingURL=game.d.ts.map