import { loadProgress } from '../utils/storage';

export type SfxName =
    | 'shoot'
    | 'bounce'
    | 'pop'
    | 'click'
    | 'star'
    | 'win'
    | 'lose'
    | 'drop';

const MUSIC_LEVEL = 0.46;
const MUSIC_FADE_IN = 0.9;
const MUSIC_FADE_OUT = 0.32;
const MAX_ACTIVE_EMITTERS = 10;

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Small, self-contained audio engine.
 *
 * Every sound is synthesised from oscillators and noise at runtime, so there
 * are no audio downloads, no sample licences and no large binaries in the
 * Android bundle. The music loop is rendered once into a short mono buffer and
 * then played through a single looping source.
 */
class GameAudio {
    private context: AudioContext | null = null;
    private sfxBus: GainNode | null = null;
    private musicBus: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;

    private unlocked = false;
    private hidden = false;
    private soundEnabled = true;
    private musicEnabled = true;
    private musicBuffer: AudioBuffer | null = null;
    private musicSource: AudioBufferSourceNode | null = null;
    private musicRendering = false;
    private musicUnsupported = false;
    private activeEmitters = 0;

    private readonly lastPlayed = new Map<SfxName, number>();
    private readonly noiseFactory = (): AudioBuffer | null => {
        if (!this.context) {
            return null;
        }

        if (this.noiseBuffer) {
            return this.noiseBuffer;
        }

        const length = Math.floor(this.context.sampleRate * 0.5);
        const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let index = 0; index < length; index++) {
            data[index] = Math.random() * 2 - 1;
        }

        this.noiseBuffer = buffer;
        return buffer;
    };

    constructor() {
        this.refreshPreferences();

        if (typeof window === 'undefined') {
            return;
        }

        window.addEventListener('bubble:settings-changed', this.handleSettingsChanged);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    /**
     * Preferences are cached here so the hot SFX path only touches booleans.
     * A large cascade can schedule dozens of sounds in a few frames; keeping
     * those frames free of progress lookups and JSON work keeps them cheap.
     */
    private refreshPreferences(): void {
        const progress = loadProgress();
        this.soundEnabled = progress.sound;
        this.musicEnabled = progress.music;
    }

    /** Called from a real pointer/key gesture so mobile browsers allow audio. */
    unlock(): void {
        this.ensureContext();

        if (!this.context) {
            return;
        }

        const firstUnlock = !this.unlocked;
        this.unlocked = true;
        this.refreshPreferences();

        if (this.context.state === 'suspended') {
            void this.context.resume().catch(() => undefined);
        }

        if (firstUnlock) {
            this.syncMusic();
        }
    }

    playSfx(name: SfxName): void {
        if (!this.unlocked || !this.soundEnabled || !this.context || !this.sfxBus) {
            return;
        }

        if (this.hidden) {
            return;
        }

        const gaps: Record<SfxName, number> = {
            shoot: 45,
            bounce: 38,
            pop: 26,
            click: 45,
            star: 60,
            win: 400,
            lose: 400,
            drop: 80,
        };

        if (!this.throttle(name, gaps[name])) {
            return;
        }

        if (this.context.state === 'suspended') {
            void this.context.resume().catch(() => undefined);
        }

        try {
            this.scheduleSfx(name, this.context.currentTime + 0.005);
        } catch {
            // Audio must never interfere with gameplay.
        }
    }

    /**
     * Plays a short cascade instead of one pop per bubble. This keeps a large
     * match from creating dozens of simultaneous voices on low-end devices.
     */
    playPopCascade(count: number): void {
        if (!this.unlocked || !this.soundEnabled || !this.context || !this.sfxBus) {
            return;
        }

        if (this.hidden) {
            return;
        }

        if (this.context.state === 'suspended') {
            void this.context.resume().catch(() => undefined);
        }

        const pops = Math.min(4, 1 + Math.floor(Math.max(0, count) / 4));

        try {
            for (let index = 0; index < pops; index++) {
                const when = this.context.currentTime + 0.004 + index * 0.045;
                this.schedulePop(when, 0.92 + Math.random() * 0.24, 0.8 - index * 0.1);
            }
        } catch {
            // ignore audio errors
        }
    }

    syncMusic(): void {
        if (!this.unlocked || !this.context) {
            return;
        }

        if (this.musicEnabled && !this.hidden) {
            this.startMusic();
        } else {
            this.stopMusic();
        }
    }

    private readonly handleSettingsChanged = (): void => {
        this.refreshPreferences();
        this.syncMusic();
    };

    private readonly handleVisibilityChange = (): void => {
        this.hidden = document.visibilityState === 'hidden';

        if (this.hidden) {
            this.stopMusic();
            void this.context?.suspend().catch(() => undefined);
            return;
        }

        if (this.unlocked && this.context) {
            void this.context
                .resume()
                .then(() => this.syncMusic())
                .catch(() => undefined);
        }
    };

    private ensureContext(): void {
        if (this.context) {
            return;
        }

        if (typeof window === 'undefined') {
            return;
        }

        const AudioCtor =
            window.AudioContext ??
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioCtor) {
            return;
        }

        try {
            const context = new AudioCtor();
            const master = context.createGain();
            const compressor = context.createDynamicsCompressor();

            master.gain.value = 0.9;
            compressor.threshold.value = -18;
            compressor.knee.value = 18;
            compressor.ratio.value = 5;
            compressor.attack.value = 0.004;
            compressor.release.value = 0.22;

            const sfx = context.createGain();
            const music = context.createGain();

            sfx.gain.value = 0.7;
            music.gain.value = 0.0001;

            sfx.connect(master);
            music.connect(master);
            master.connect(compressor);
            compressor.connect(context.destination);

            this.context = context;
            this.sfxBus = sfx;
            this.musicBus = music;
            this.noiseFactory();
        } catch {
            this.context = null;
        }
    }

    private throttle(name: SfxName, minimumGapMs: number): boolean {
        if (typeof performance === 'undefined') {
            return true;
        }

        const now = performance.now();
        const previous = this.lastPlayed.get(name) ?? 0;

        if (now - previous < minimumGapMs) {
            return false;
        }

        this.lastPlayed.set(name, now);
        return true;
    }

    private scheduleSfx(name: SfxName, when: number): void {
        switch (name) {
            case 'shoot':
                this.tone('triangle', 760, 300, 0.12, 0.13, when, 0.004);
                this.noise(0.055, 0.035, 1100, when, 'bandpass');
                break;
            case 'bounce':
                this.tone('sine', 230, 150, 0.065, 0.11, when, 0.004);
                this.noise(0.025, 0.025, 1500, when, 'highpass');
                break;
            case 'pop':
                this.schedulePop(when, 1, 1);
                break;
            case 'click':
                this.tone('square', 760, 620, 0.04, 0.055, when, 0.002);
                break;
            case 'star':
                this.chime(when, 0.06);
                break;
            case 'win':
                [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
                    this.tone(
                        'triangle',
                        frequency,
                        frequency,
                        0.42,
                        0.075,
                        when + index * 0.115,
                        0.012
                    );
                });
                this.tone('sine', 261.63, 261.63, 0.9, 0.045, when, 0.08);
                break;
            case 'lose':
                this.tone('sawtooth', 260, 92, 0.5, 0.045, when, 0.02);
                this.tone('sine', 180, 72, 0.55, 0.07, when + 0.04, 0.02);
                break;
            case 'drop':
                this.tone('sine', 138, 74, 0.2, 0.13, when, 0.006);
                this.noise(0.07, 0.035, 360, when, 'lowpass');
                break;
        }
    }

    private schedulePop(when: number, pitch: number, volume: number): void {
        this.tone('sine', 620 * pitch, 210 * pitch, 0.095, 0.11 * volume, when, 0.003);
        this.tone('triangle', 1180 * pitch, 480 * pitch, 0.05, 0.04 * volume, when, 0.002);
        this.noise(0.038, 0.04 * volume, 1400, when, 'bandpass');
    }

    private chime(when: number, volume: number): void {
        this.tone('sine', 1046.5, 1046.5, 0.42, volume, when, 0.005);
        this.tone('sine', 1568, 1568, 0.32, volume * 0.5, when + 0.015, 0.005);
        this.tone('triangle', 2093, 2093, 0.2, volume * 0.22, when + 0.03, 0.004);
    }

    private tone(
        type: OscillatorType,
        from: number,
        to: number,
        duration: number,
        volume: number,
        when: number,
        attack: number
    ): void {
        const context = this.context;
        const bus = this.sfxBus;

        if (!context || !bus || this.activeEmitters >= MAX_ACTIVE_EMITTERS) {
            return;
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = Math.max(when, context.currentTime);
        const end = start + Math.max(0.02, duration);

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, from), start);

        if (to !== from) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), end);
        }

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(gain);
        gain.connect(bus);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
        this.activeEmitters += 1;

        oscillator.onended = () => {
            this.activeEmitters = Math.max(0, this.activeEmitters - 1);
            oscillator.disconnect();
            gain.disconnect();
        };
    }

    private noise(
        duration: number,
        volume: number,
        frequency: number,
        when: number,
        filterType: BiquadFilterType
    ): void {
        const context = this.context;
        const bus = this.sfxBus;
        const buffer = this.noiseFactory();

        if (!context || !bus || !buffer || this.activeEmitters >= MAX_ACTIVE_EMITTERS) {
            return;
        }

        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        const start = Math.max(when, context.currentTime);
        const end = start + Math.max(0.02, duration);

        source.buffer = buffer;
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = 0.8;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(bus);
        source.start(start, Math.random() * 0.08, duration + 0.01);
        this.activeEmitters += 1;

        source.onended = () => {
            this.activeEmitters = Math.max(0, this.activeEmitters - 1);
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }

    private startMusic(): void {
        if (!this.context || !this.musicBus || !this.unlocked || this.hidden) {
            return;
        }

        if (this.musicSource) {
            this.rampMusic(MUSIC_LEVEL, 0.4);
            return;
        }

        if (this.musicUnsupported) {
            return;
        }

        if (!this.musicBuffer) {
            if (!this.musicRendering) {
                void this.renderMusic();
            }
            return;
        }

        try {
            const source = this.context.createBufferSource();
            source.buffer = this.musicBuffer;
            source.loop = true;
            source.connect(this.musicBus);

            const now = this.context.currentTime;
            this.musicBus.gain.cancelScheduledValues(now);
            this.musicBus.gain.setValueAtTime(0.0001, now);
            this.musicBus.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, now + MUSIC_FADE_IN);

            source.start(now);
            this.musicSource = source;
        } catch {
            this.musicSource = null;
        }
    }

    private stopMusic(): void {
        if (!this.context || !this.musicBus) {
            return;
        }

        const source = this.musicSource;
        this.musicSource = null;

        if (!source) {
            return;
        }

        const now = this.context.currentTime;
        this.musicBus.gain.cancelScheduledValues(now);
        this.musicBus.gain.setValueAtTime(
            Math.max(0.0001, this.musicBus.gain.value),
            now
        );
        this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC_FADE_OUT);

        try {
            source.stop(now + MUSIC_FADE_OUT + 0.02);
        } catch {
            // already stopped
        }

        source.onended = () => source.disconnect();
    }

    private rampMusic(target: number, duration: number): void {
        if (!this.context || !this.musicBus) {
            return;
        }

        const now = this.context.currentTime;
        this.musicBus.gain.cancelScheduledValues(now);
        this.musicBus.gain.setValueAtTime(
            Math.max(0.0001, this.musicBus.gain.value),
            now
        );
        this.musicBus.gain.exponentialRampToValueAtTime(
            Math.max(0.0001, target),
            now + duration
        );
    }

    private async renderMusic(): Promise<void> {
        if (this.musicRendering || typeof window === 'undefined') {
            return;
        }

        const OfflineCtor =
            window.OfflineAudioContext ??
            (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
                .webkitOfflineAudioContext;

        if (!OfflineCtor) {
            this.musicUnsupported = true;
            return;
        }

        this.musicRendering = true;

        try {
            const sampleRate = 24000;
            const bpm = 84;
            const beat = 60 / bpm;
            const bar = beat * 4;
            const duration = bar * 4;
            const offline = new OfflineCtor(
                1,
                Math.ceil(sampleRate * duration),
                sampleRate
            );

            const master = offline.createGain();
            master.gain.setValueAtTime(0.0001, 0);
            master.gain.linearRampToValueAtTime(0.85, 0.2);
            master.gain.setValueAtTime(0.85, duration - 0.4);
            master.gain.linearRampToValueAtTime(0.0001, duration);
            master.connect(offline.destination);

            const delay = offline.createDelay(0.7);
            delay.delayTime.value = 0.28;
            const feedback = offline.createGain();
            feedback.gain.value = 0.18;
            const delayFilter = offline.createBiquadFilter();
            delayFilter.type = 'lowpass';
            delayFilter.frequency.value = 1800;
            const delayLevel = offline.createGain();
            delayLevel.gain.value = 0.3;

            delay.connect(delayFilter);
            delayFilter.connect(feedback);
            feedback.connect(delay);
            delayFilter.connect(delayLevel);
            delayLevel.connect(master);

            const chords = [
                { notes: [57, 60, 64, 67], bass: 45 },
                { notes: [53, 57, 60, 64], bass: 41 },
                { notes: [48, 52, 55, 59], bass: 36 },
                { notes: [55, 59, 62, 65], bass: 43 },
            ];

            chords.forEach((chord, chordIndex) => {
                const start = chordIndex * bar;

                this.renderPad(offline, master, start, bar + 0.25, chord.notes);
                this.renderBass(offline, master, start, chord.bass);

                for (let step = 0; step < 8; step++) {
                    const noteIndex = [0, 2, 1, 2, 3, 2, 1, 0][step];
                    const note = chord.notes[noteIndex] + 12;
                    const when = start + step * (beat / 2);
                    this.renderPluck(offline, master, delay, when, note, 0.035);
                }
            });

            const buffer = await offline.startRendering();

            if (this.musicBuffer) {
                this.musicBuffer = null;
            }

            this.musicBuffer = buffer;
        } catch {
            this.musicUnsupported = true;
        } finally {
            this.musicRendering = false;
        }

        if (this.musicBuffer && this.unlocked && this.musicEnabled && !this.hidden) {
            this.startMusic();
        }
    }

    private renderPad(
        context: OfflineAudioContext,
        destination: AudioNode,
        start: number,
        duration: number,
        notes: number[]
    ): void {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1150;
        filter.Q.value = 0.6;
        filter.connect(destination);

        notes.forEach((note, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const level = 0.03 - index * 0.003;

            oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
            oscillator.frequency.value = midiToHz(note);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(level, start + 0.55);
            gain.gain.setValueAtTime(level, start + duration - 0.85);
            gain.gain.linearRampToValueAtTime(0.0001, start + duration);

            oscillator.connect(gain);
            gain.connect(filter);
            oscillator.start(start);
            oscillator.stop(start + duration + 0.02);
        });
    }

    private renderBass(
        context: OfflineAudioContext,
        destination: AudioNode,
        start: number,
        midi: number
    ): void {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const duration = 1.5;

        oscillator.type = 'sine';
        oscillator.frequency.value = midiToHz(midi);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.045, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }

    private renderPluck(
        context: OfflineAudioContext,
        destination: AudioNode,
        delay: AudioNode,
        start: number,
        midi: number,
        level: number
    ): void {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const send = context.createGain();
        const duration = 0.34;
        const frequency = midiToHz(midi);

        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        send.gain.value = 0.4;

        oscillator.connect(gain);
        gain.connect(destination);
        gain.connect(send);
        send.connect(delay);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
    }
}

export const gameAudio = new GameAudio();

/** Adds the shared button click to any interactive object in a scene. */
export const installUiAudio = (scene: Phaser.Scene): void => {
    const handler = (): void => gameAudio.playSfx('click');
    scene.input.on('gameobjectdown', handler);
    scene.events.once('shutdown', () => {
        scene.input.off('gameobjectdown', handler);
    });
};
