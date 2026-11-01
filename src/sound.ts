import { Howl, Howler } from 'howler';
import bgMusicUrl from './assets/audio/breakout-bgmusic.mp3';
import brickHitUrl from './assets/audio/brick-hit-sound.mp3';
import paddleHitUrl from './assets/audio/paddle-hit-sound.mp3';
import type { BossStyle } from './boss';
import { BossMusic } from './music';

interface ToneOptions {
    type?: OscillatorType;
    step?: number;
    length?: number;
    volume?: number;
    slide?: number;
    vibrato?: number;
}

export class SoundManager {
    private bgMusic: Howl;
    private brickHitSound: Howl;
    private paddleHitSound: Howl;
    private musicEnabled: boolean = true;
    private soundEnabled: boolean = true;
    private readonly bossMusic = new BossMusic(() => Howler.ctx);

    constructor() {
        this.bgMusic = new Howl({
            src: [bgMusicUrl],
            loop: true,
            volume: 0.45,
            html5: true,
            preload: true,
        });

        this.brickHitSound = new Howl({
            src: [brickHitUrl],
            volume: 0.55,
            preload: true,
        });

        this.paddleHitSound = new Howl({
            src: [paddleHitUrl],
            volume: 0.55,
            preload: true,
        });

        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    private handleVisibilityChange(): void {
        if (document.hidden) {
            this.bgMusic.mute(true);
        } else if (this.musicEnabled) {
            this.bgMusic.mute(false);
        }
        this.bossMusic.setAudible(this.musicEnabled && !document.hidden);
    }

    public playMusic(): void {
        if (this.musicEnabled && !this.bgMusic.playing() && !this.bossMusic.playing) {
            this.bgMusic.play();
        }
    }

    public stopMusic(): void {
        this.bgMusic.stop();
    }

    public setMusicEnabled(enabled: boolean): void {
        this.musicEnabled = enabled;
        if (enabled) {
            this.bgMusic.mute(false);
            if (!this.bgMusic.playing() && !this.bossMusic.playing) {
                this.bgMusic.play();
            }
        } else {
            this.bgMusic.mute(true);
        }
        this.bossMusic.setAudible(enabled && !document.hidden);
    }

    public startBossMusic(style: BossStyle): void {
        this.bgMusic.pause();
        this.bossMusic.start(style, this.musicEnabled && !document.hidden);
    }

    public setBossEnraged(enraged: boolean): void {
        this.bossMusic.setEnraged(enraged);
    }

    public stopBossMusic(): void {
        if (!this.bossMusic.playing) return;
        this.bossMusic.stop();
        if (this.musicEnabled && !this.bgMusic.playing()) {
            this.bgMusic.play();
        }
    }

    public setSoundEnabled(enabled: boolean): void {
        this.soundEnabled = enabled;
        this.brickHitSound.mute(!enabled);
        this.paddleHitSound.mute(!enabled);
    }

    public isMusicPlaying(): boolean {
        return this.bgMusic.playing();
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

    public playLaunch(): void {
        this.tone([440, 660, 880], { type: 'square', step: 0.04, length: 0.07, volume: 0.06 });
    }

    public playArmorHit(): void {
        this.tone([1400], { type: 'triangle', length: 0.08, volume: 0.12, slide: 0.5 });
    }

    public playCombo(combo: number): void {
        const root = 520 + Math.min(combo, 40) * 18;
        this.tone([root, root * 1.5], { type: 'square', step: 0.05, length: 0.08, volume: 0.05 });
    }

    public playPowerUp(): void {
        this.tone([523, 659, 784, 1047], { type: 'square', step: 0.055, length: 0.1, volume: 0.06 });
    }

    public playPowerDown(): void {
        this.tone([784, 622, 466, 349], { type: 'square', step: 0.07, length: 0.12, volume: 0.06 });
    }

    public playZap(): void {
        this.tone([2200, 1800], { type: 'sawtooth', step: 0.05, length: 0.25, volume: 0.05, slide: 0.08 });
    }

    public playLifeLost(): void {
        this.tone([520], { type: 'sawtooth', length: 0.55, volume: 0.09, slide: 0.18 });
    }

    public playLevelClear(): void {
        this.tone([523, 659, 784, 1047, 784, 1047, 1319], { type: 'square', step: 0.09, length: 0.16, volume: 0.06 });
    }

    public playGameOver(): void {
        this.tone([392, 330, 262, 196], { type: 'triangle', step: 0.2, length: 0.35, volume: 0.12 });
    }

    public playBossShot(style: BossStyle): void {
        if (style === 'saucer') {
            this.tone([620, 880], { type: 'sine', step: 0.03, length: 0.22, volume: 0.06, vibrato: 18 });
        } else {
            this.tone([150], { type: 'sawtooth', length: 0.32, volume: 0.09, slide: 0.35 });
            this.tone([75], { type: 'square', length: 0.26, volume: 0.05, slide: 0.5 });
        }
    }

    public playBossHit(style: BossStyle): void {
        if (style === 'saucer') {
            this.tone([980, 700], { type: 'square', step: 0.02, length: 0.08, volume: 0.06, slide: 0.7 });
        } else {
            this.tone([240, 160], { type: 'triangle', step: 0.02, length: 0.16, volume: 0.13, slide: 0.5 });
        }
    }

    public playBossRoar(style: BossStyle): void {
        if (style === 'saucer') {
            this.tone([900], { type: 'sawtooth', length: 0.9, volume: 0.08, slide: 0.2, vibrato: 24 });
            this.tone([450], { type: 'square', length: 0.9, volume: 0.04, slide: 0.25, vibrato: 30 });
        } else {
            this.tone([110], { type: 'sawtooth', length: 1.4, volume: 0.15, slide: 0.45, vibrato: 7 });
            this.tone([55], { type: 'square', length: 1.4, volume: 0.08, slide: 0.5 });
            this.tone([220], { type: 'sawtooth', length: 1.1, volume: 0.05, slide: 0.3, vibrato: 11 });
        }
    }

    public playExplosion(): void {
        this.tone([160, 110, 70, 45], { type: 'sawtooth', step: 0.08, length: 0.4, volume: 0.1, slide: 0.3 });
    }

    public playUiClick(): void {
        this.tone([880], { type: 'square', length: 0.035, volume: 0.035 });
    }

    private tone(notes: number[], options: ToneOptions = {}): void {
        if (!this.soundEnabled) return;
        const ctx = Howler.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            void ctx.resume();
        }

        const { type = 'square', step = 0.06, length = 0.1, volume = 0.06, slide, vibrato } = options;
        const start = ctx.currentTime;

        notes.forEach((frequency, index) => {
            const at = start + index * step;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, at);
            if (slide) {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), at + length);
            }

            gain.gain.setValueAtTime(volume, at);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + length);

            if (vibrato) {
                const lfo = ctx.createOscillator();
                const depth = ctx.createGain();
                lfo.frequency.value = vibrato;
                depth.gain.value = frequency * 0.04;
                lfo.connect(depth).connect(oscillator.frequency);
                lfo.start(at);
                lfo.stop(at + length + 0.02);
            }

            oscillator.connect(gain).connect(ctx.destination);
            oscillator.start(at);
            oscillator.stop(at + length + 0.02);
        });
    }
}
