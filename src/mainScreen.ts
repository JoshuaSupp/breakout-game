import { BreakoutGame } from './game';

window.addEventListener('DOMContentLoaded', async () => {
    const game = new BreakoutGame();
    await game.start();
});