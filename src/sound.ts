import { Howl } from 'howler';
import bgMusicUrl from './assets/audio/breakout-bgmusic.mp3';
import brickHitUrl from './assets/audio/brick-hit-sound.mp3';
import paddleHitUrl from './assets/audio/paddle-hit-sound.mp3';

export class SoundManager {
    private bgMusic: Howl;
    private brickHitSound: Howl;
    private paddleHitSound: Howl;
    private musicEnabled: boolean = true;
    private soundEnabled: boolean = true;

    constructor() {
        this.bgMusic = new Howl({
            src: [bgMusicUrl],
            loop: true,
            volume: 0.5,
            html5: true, 
            preload: true,
        });

        this.brickHitSound = new Howl({
            src: [brickHitUrl],
            volume: 0.6,
            preload: true,
        });

        this.paddleHitSound = new Howl({
            src: [paddleHitUrl],
            volume: 0.6,
            preload: true,
        });

        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            this.bgMusic.mute(true);
        } else {
            if (this.musicEnabled) {
                this.bgMusic.mute(false);
            }
        }
    }

    public playMusic(): void {
        if (this.musicEnabled && !this.bgMusic.playing()) {
            this.bgMusic.play();
        }
    }

    public stopMusic(): void {
        this.bgMusic.stop();
    }

    public setMusicEnabled(enabled: boolean): void {
        this.musicEnabled = enabled;
        if (enabled) {
            // Unmute first to ensure sound is audible when it starts
            this.bgMusic.mute(false);
            
            if (!this.bgMusic.playing()) {
                this.bgMusic.play();
            }
        } else {
            this.bgMusic.mute(true);
        }
    }

    public setSoundEnabled(enabled: boolean): void {
        this.soundEnabled = enabled;
        this.brickHitSound.mute(!enabled);
        this.paddleHitSound.mute(!enabled);
    }

    public playBrickHit(): void {
        if (this.soundEnabled) {
            this.brickHitSound.play();
        }
    }

    public playPaddleHit(): void {
        if (this.soundEnabled) {
            this.paddleHitSound.play();
        }
    }

    public isMusicPlaying(): boolean {
        return this.bgMusic.playing();
    }
}
