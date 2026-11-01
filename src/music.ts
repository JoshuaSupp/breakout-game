import type { BossStyle } from './boss';

interface Track {
    bpm: number;
    enragedBpm: number;
    bass: number[];
    lead: number[];
    enragedLead: number[];
    kick: number[];
    enragedKick: number[];
    snare: number[];
    hat: number[];
    bassWave: OscillatorType;
    leadWave: OscillatorType;
    leadVibrato: number;
    bassCutoff: number;
}

const TRACKS: Record<BossStyle, Track> = {
    saucer: {
        bpm: 128,
        enragedBpm: 152,
        bass: [40, 0, 40, 0, 43, 0, 40, 0, 38, 0, 38, 0, 43, 0, 45, 0],
        lead: [76, 0, 0, 79, 0, 0, 78, 0, 76, 0, 0, 71, 0, 74, 0, 0],
        enragedLead: [88, 0, 83, 0, 86, 0, 83, 0, 88, 0, 91, 0, 90, 0, 86, 0],
        kick: [0, 8],
        enragedKick: [0, 4, 8, 12],
        snare: [4, 12],
        hat: [0, 2, 4, 6, 8, 10, 12, 14],
        bassWave: 'square',
        leadWave: 'sine',
        leadVibrato: 6,
        bassCutoff: 900,
    },
    mothership: {
        bpm: 100,
        enragedBpm: 132,
        bass: [26, 26, 0, 26, 27, 0, 26, 0, 26, 26, 0, 29, 27, 0, 25, 0],
        lead: [62, 0, 0, 0, 63, 0, 0, 0, 62, 0, 0, 0, 58, 0, 61, 0],
        enragedLead: [74, 0, 75, 0, 74, 0, 70, 0, 74, 0, 75, 0, 77, 0, 73, 0],
        kick: [0, 4, 8, 12],
        enragedKick: [0, 2, 4, 6, 8, 10, 12, 14],
        snare: [4, 12],
        hat: [2, 6, 10, 14],
        bassWave: 'sawtooth',
        leadWave: 'square',
        leadVibrato: 0,
        bassCutoff: 480,
    },
};

const noteToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class BossMusic {
    private track: Track | null = null;
    private master: GainNode | null = null;
    private timer: number | null = null;
    private noise: AudioBuffer | null = null;
    private step = 0;
    private nextTime = 0;
    private enraged = false;
    private readonly volume = 0.5;

    constructor(private readonly getContext: () => AudioContext | null) {}

    public get playing(): boolean {
        return this.track !== null;
    }

    public start(style: BossStyle, audible: boolean): void {
        this.stop();
        const ctx = this.getContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') void ctx.resume();

        this.track = TRACKS[style];
        this.enraged = false;
        this.step = 0;
        this.noise = this.noise ?? this.createNoise(ctx);
        this.master = ctx.createGain();
        this.master.gain.value = audible ? this.volume : 0;
        this.master.connect(ctx.destination);
        this.nextTime = ctx.currentTime + 0.1;
        this.timer = window.setInterval(() => this.schedule(), 25);
    }

    public setEnraged(enraged: boolean): void {
        this.enraged = enraged;
    }

    public setAudible(audible: boolean): void {
        const ctx = this.getContext();
        if (ctx && this.master) {
            this.master.gain.setTargetAtTime(audible ? this.volume : 0, ctx.currentTime, 0.05);
        }
    }

    public stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const ctx = this.getContext();
        const master = this.master;
        if (ctx && master) {
            master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
            setTimeout(() => master.disconnect(), 600);
        }
        this.master = null;
        this.track = null;
    }

    private schedule(): void {
        const ctx = this.getContext();
        const track = this.track;
        if (!ctx || !track || !this.master) return;

        const stepLength = 60 / (this.enraged ? track.enragedBpm : track.bpm) / 4;
        if (this.nextTime < ctx.currentTime - 0.2) {
            this.nextTime = ctx.currentTime + 0.05;
        }
        while (this.nextTime < ctx.currentTime + 0.12) {
            this.playStep(ctx, track, this.step, this.nextTime, stepLength);
            this.nextTime += stepLength;
            this.step = (this.step + 1) % 16;
        }
    }

    private playStep(ctx: AudioContext, track: Track, step: number, time: number, length: number): void {
        const bass = track.bass[step];
        if (bass) {
            this.voice(ctx, track.bassWave, noteToHz(bass), time, length * 0.9, 0.12, track.bassCutoff, 0);
        }

        const lead = (this.enraged ? track.enragedLead : track.lead)[step];
        if (lead) {
            this.voice(ctx, track.leadWave, noteToHz(lead), time, length * 1.8, 0.05, 0, track.leadVibrato);
        }

        if ((this.enraged ? track.enragedKick : track.kick).includes(step)) this.kick(ctx, time);
        if (track.snare.includes(step)) this.snare(ctx, time);
        if (track.hat.includes(step) || (this.enraged && step % 2 === 1)) this.hat(ctx, time);
    }

    private voice(
        ctx: AudioContext,
        type: OscillatorType,
        frequency: number,
        time: number,
        duration: number,
        volume: number,
        cutoff: number,
        vibrato: number,
    ): void {
        if (!this.master) return;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(volume, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        let output: AudioNode = oscillator;
        if (cutoff > 0) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = cutoff;
            output = output.connect(filter);
        }
        output.connect(gain).connect(this.master);

        if (vibrato > 0) {
            const lfo = ctx.createOscillator();
            const depth = ctx.createGain();
            lfo.frequency.value = vibrato;
            depth.gain.value = frequency * 0.02;
            lfo.connect(depth).connect(oscillator.frequency);
            lfo.start(time);
            lfo.stop(time + duration + 0.02);
        }

        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
    }

    private kick(ctx: AudioContext, time: number): void {
        if (!this.master) return;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150, time);
        oscillator.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        gain.gain.setValueAtTime(0.5, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
        oscillator.connect(gain).connect(this.master);
        oscillator.start(time);
        oscillator.stop(time + 0.18);
    }

    private snare(ctx: AudioContext, time: number): void {
        this.noiseBurst(ctx, time, 1500, 0.22, 0.13);
    }

    private hat(ctx: AudioContext, time: number): void {
        this.noiseBurst(ctx, time, 7000, 0.06, 0.035);
    }

    private noiseBurst(ctx: AudioContext, time: number, highpass: number, volume: number, duration: number): void {
        if (!this.master || !this.noise) return;
        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        source.buffer = this.noise;
        filter.type = 'highpass';
        filter.frequency.value = highpass;
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        source.connect(filter).connect(gain).connect(this.master);
        source.start(time);
        source.stop(time + duration + 0.02);
    }

    private createNoise(ctx: AudioContext): AudioBuffer {
        const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }
}
