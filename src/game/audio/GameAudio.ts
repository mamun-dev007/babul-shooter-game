import { loadProgress } from '../utils/storage';
import {
    buildMusicScore,
    MUSIC_TRACKS,
    type ScoreEvent,
    type ScoreTrack,
} from './musicScore';

export type SfxName =
    | 'shoot'
    | 'fireLaunch'
    | 'bombLaunch'
    | 'bounce'
    | 'collide'
    | 'match'
    | 'pop'
    | 'click'
    | 'swap'
    | 'colorSwitch'
    | 'powerup'
    | 'bomb'
    | 'fire'
    | 'lightning'
    | 'star'
    | 'coin'
    | 'win'
    | 'lose'
    | 'drop'
    | 'popupOpen'
    | 'popupClose'
    | 'purchase';

export type MusicTrack = ScoreTrack;
export type MusicMode = MusicTrack | 'none';

const MUSIC_LEVEL = 0.42;
const MUSIC_CROSSFADE = 0.9;
const MUSIC_STOP_FADE = 0.35;
const MUSIC_SAMPLE_RATE = 44100;
const MAX_ACTIVE_EMITTERS = 16;

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Small, self-contained audio engine.
 *
 * Every sound is synthesised from oscillators and noise at runtime, so there
 * are no audio downloads, no sample licences and no large binaries in the
 * Android bundle. Music is rendered once per track into a seamless stereo
 * buffer and then played through a looping source.
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
    private masterVolume = 1;
    private musicVolume = 0.8;
    private sfxVolume = 0.9;

    private readonly musicBuffers = new Map<MusicTrack, AudioBuffer>();
    private readonly musicRenderQueue: MusicTrack[] = [];
    private readonly fadingMusicSources = new Set<{
        source: AudioBufferSourceNode;
        gain: GainNode;
    }>();
    private musicMode: MusicMode = 'menu';
    private musicSource: AudioBufferSourceNode | null = null;
    private musicSourceGain: GainNode | null = null;
    private musicSourceMode: MusicTrack | null = null;
    private musicRendering: MusicTrack | null = null;
    private musicDraining = false;
    private preloadRequested = false;
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

    private refreshPreferences(): void {
        const progress = loadProgress();
        this.soundEnabled = progress.sound;
        this.musicEnabled = progress.music;
        this.masterVolume = progress.masterVolume ?? 1;
        this.musicVolume = progress.musicVolume ?? 0.8;
        this.sfxVolume = progress.sfxVolume ?? 0.9;
        this.applyVolumes();
    }

    private musicTargetGain(): number {
        return MUSIC_LEVEL * clamp01(this.masterVolume) * clamp01(this.musicVolume);
    }

    private applyVolumes(): void {
        if (!this.context || !this.sfxBus || !this.musicBus) return;
        this.sfxBus.gain.value =
            clamp01(this.masterVolume) * clamp01(this.sfxVolume);
        if (this.musicSource) {
            this.rampMusicBus(this.musicTargetGain(), 0.18);
        }
    }

    preload(): void {
        if (typeof window === 'undefined' || this.preloadRequested) {
            return;
        }

        this.preloadRequested = true;
        MUSIC_TRACKS.forEach((track) => this.requestMusicRender(track));
    }

    unlock(): void {
        this.preload();
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
            fireLaunch: 70,
            bombLaunch: 90,
            bounce: 45,
            collide: 40,
            match: 90,
            pop: 26,
            click: 45,
            swap: 60,
            colorSwitch: 80,
            powerup: 90,
            bomb: 130,
            fire: 100,
            lightning: 100,
            star: 60,
            coin: 55,
            win: 900,
            lose: 900,
            drop: 80,
            popupOpen: 110,
            popupClose: 110,
            purchase: 400,
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

        const pops = Math.min(5, 1 + Math.floor(Math.max(0, count) / 4));

        try {
            for (let index = 0; index < pops; index++) {
                const when = this.context.currentTime + 0.004 + index * 0.042;
                this.schedulePop(when, 0.92 + Math.random() * 0.24, 0.78 - index * 0.09);
            }
        } catch {
            // ignore audio errors
        }
    }

    setMusicMode(mode: MusicMode): void {
        if (this.musicMode === mode) {
            this.syncMusic();
            return;
        }

        this.musicMode = mode;
        this.syncMusic();
    }

    syncMusic(): void {
        if (!this.unlocked || !this.context) {
            return;
        }

        if (!this.musicEnabled || this.hidden || this.musicMode === 'none') {
            this.stopMusic();
            return;
        }

        this.startMusic();
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
                this.tone('triangle', 740 * (0.96 + Math.random() * 0.08), 330, 0.11, 0.1, when, 0.003);
                this.tone('sine', 1480, 760, 0.06, 0.032, when, 0.002);
                this.noise(0.035, 0.026, 1600, when, 'bandpass');
                break;
            case 'fireLaunch':
                this.tone('triangle', 320, 120, 0.2, 0.05, when, 0.006);
                this.tone('sine', 150, 70, 0.16, 0.045, when, 0.004);
                this.noise(0.16, 0.045, 900, when, 'bandpass');
                this.noise(0.07, 0.026, 2200, when + 0.03, 'highpass');
                break;
            case 'bombLaunch':
                this.tone('sine', 150, 62, 0.18, 0.085, when, 0.006);
                this.tone('triangle', 300, 130, 0.12, 0.032, when, 0.004);
                this.noise(0.1, 0.035, 520, when, 'lowpass');
                break;
            case 'bounce':
                this.tone('sine', 260, 165, 0.07, 0.085, when, 0.003);
                this.tone('triangle', 520, 330, 0.04, 0.022, when, 0.002);
                this.noise(0.02, 0.018, 1600, when, 'highpass');
                break;
            case 'collide':
                this.tone('sine', 350, 210, 0.065, 0.06, when, 0.003);
                this.tone('triangle', 700, 420, 0.035, 0.018, when, 0.002);
                this.noise(0.024, 0.018, 1100, when, 'bandpass');
                break;
            case 'match':
                this.bell(when, 783.99, 0.042, 0.19);
                this.bell(when + 0.06, 1046.5, 0.038, 0.24);
                this.noise(0.03, 0.016, 2200, when, 'highpass');
                break;
            case 'pop':
                this.schedulePop(when, 1, 1);
                break;
            case 'click':
                this.tone('sine', 880, 660, 0.035, 0.045, when, 0.002);
                this.tone('triangle', 1760, 1320, 0.02, 0.012, when, 0.001);
                break;
            case 'swap':
                this.tone('sine', 520, 720, 0.075, 0.048, when, 0.003);
                this.tone('triangle', 1040, 1440, 0.045, 0.016, when, 0.002);
                break;
            case 'colorSwitch':
                [523.25, 659.25, 783.99].forEach((frequency, index) => {
                    this.bell(when + index * 0.045, frequency, 0.032, 0.17);
                });
                break;
            case 'powerup':
                [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
                    this.tone('triangle', frequency, frequency * 1.01, 0.15, 0.04, when + index * 0.05, 0.006);
                    this.tone('sine', frequency * 2, frequency * 2, 0.09, 0.012, when + index * 0.05, 0.004);
                });
                break;
            case 'bomb':
                this.tone('sine', 120, 38, 0.42, 0.12, when, 0.006);
                this.tone('triangle', 180, 62, 0.28, 0.045, when, 0.005);
                this.noise(0.3, 0.075, 420, when, 'lowpass');
                this.noise(0.12, 0.028, 1500, when + 0.015, 'bandpass');
                break;
            case 'fire':
                this.tone('triangle', 300, 95, 0.24, 0.048, when, 0.005);
                this.tone('sine', 150, 60, 0.18, 0.04, when, 0.004);
                this.noise(0.22, 0.055, 1200, when, 'bandpass');
                this.noise(0.09, 0.02, 2600, when + 0.02, 'highpass');
                break;
            case 'lightning':
                this.tone('sine', 1500, 340, 0.13, 0.05, when, 0.002);
                this.tone('triangle', 3000, 680, 0.07, 0.018, when, 0.001);
                this.noise(0.09, 0.045, 2400, when, 'highpass');
                break;
            case 'star':
                this.chime(when, 0.06);
                break;
            case 'coin':
                this.bell(when, 1318.5, 0.05, 0.12);
                this.bell(when + 0.045, 1760, 0.042, 0.18);
                break;
            case 'win':
                [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
                    this.tone('triangle', frequency, frequency, 0.34, 0.055, when + index * 0.095, 0.008);
                    this.tone('sine', frequency * 2, frequency * 2, 0.16, 0.013, when + index * 0.095, 0.004);
                });
                this.tone('sine', 261.63, 261.63, 0.85, 0.04, when, 0.07);
                break;
            case 'lose':
                this.tone('triangle', 260, 92, 0.5, 0.042, when, 0.016);
                this.tone('sine', 180, 72, 0.55, 0.06, when + 0.04, 0.018);
                break;
            case 'drop':
                this.tone('sine', 138, 74, 0.2, 0.1, when, 0.005);
                this.tone('triangle', 276, 148, 0.1, 0.024, when, 0.003);
                this.noise(0.07, 0.028, 360, when, 'lowpass');
                break;
            case 'popupOpen':
                this.noise(0.1, 0.02, 800, when, 'bandpass');
                this.tone('sine', 320, 540, 0.14, 0.026, when, 0.008);
                break;
            case 'popupClose':
                this.noise(0.09, 0.018, 640, when, 'bandpass');
                this.tone('sine', 480, 290, 0.12, 0.022, when, 0.006);
                break;
            case 'purchase':
                [659.25, 880, 1174.66].forEach((frequency, index) => {
                    this.bell(when + index * 0.065, frequency, 0.038, 0.24);
                });
                this.chime(when + 0.2, 0.024);
                break;
        }
    }

    private schedulePop(when: number, pitch: number, volume: number): void {
        const wobble = 0.94 + Math.random() * 0.12;
        this.tone('sine', 680 * pitch * wobble, 240 * pitch * wobble, 0.1, 0.1 * volume, when, 0.0025);
        this.tone('triangle', 1240 * pitch * wobble, 520 * pitch * wobble, 0.055, 0.034 * volume, when, 0.002);
        this.noise(0.032, 0.034 * volume, 1700, when, 'bandpass');
    }

    private bell(when: number, frequency: number, volume: number, duration: number): void {
        this.tone('sine', frequency, frequency, duration, volume, when, 0.004);
        this.tone('sine', frequency * 2.01, frequency * 2.01, duration * 0.6, volume * 0.32, when, 0.003);
    }

    private chime(when: number, volume: number): void {
        this.tone('sine', 1046.5, 1046.5, 0.42, volume, when, 0.005);
        this.tone('sine', 1571, 1571, 0.32, volume * 0.46, when + 0.015, 0.005);
        this.tone('sine', 2093, 2093, 0.22, volume * 0.2, when + 0.03, 0.004);
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
        if (!this.context || !this.musicBus || !this.unlocked || this.hidden || !this.musicEnabled) {
            return;
        }

        if (this.musicMode === 'none') {
            this.stopMusic();
            return;
        }

        const mode = this.musicMode;

        if (this.musicSource && this.musicSourceMode === mode) {
            this.rampMusicBus(this.musicTargetGain(), 0.15);
            return;
        }

        if (this.musicUnsupported) {
            return;
        }

        const buffer = this.musicBuffers.get(mode);

        if (!buffer) {
            this.requestMusicRender(mode);
            return;
        }

        this.stopFadingMusicSources();

        try {
            const context = this.context;
            const now = context.currentTime;
            const gain = context.createGain();
            const source = context.createBufferSource();

            source.buffer = buffer;
            source.loop = true;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(1, now + MUSIC_CROSSFADE);
            source.connect(gain);
            gain.connect(this.musicBus);

            const previousSource = this.musicSource;
            const previousGain = this.musicSourceGain;
            const previousMode = this.musicSourceMode;

            source.start(now);
            this.musicSource = source;
            this.musicSourceGain = gain;
            this.musicSourceMode = mode;
            this.rampMusicBus(this.musicTargetGain(), 0.2);

            if (previousSource && previousGain && previousMode !== mode) {
                this.fadeOutPreviousSource(previousSource, previousGain);
            }
        } catch {
            this.musicSource = null;
            this.musicSourceGain = null;
            this.musicSourceMode = null;
        }
    }

    private fadeOutPreviousSource(source: AudioBufferSourceNode, gain: GainNode): void {
        if (!this.context) {
            return;
        }

        const now = this.context.currentTime;

        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC_CROSSFADE);
            source.stop(now + MUSIC_CROSSFADE + 0.05);
        } catch {
            // already stopped
        }

        const fading = { source, gain };
        this.fadingMusicSources.add(fading);
        source.onended = () => {
            this.fadingMusicSources.delete(fading);
            source.disconnect();
            gain.disconnect();
        };
    }

    private stopFadingMusicSources(): void {
        if (!this.context || this.fadingMusicSources.size === 0) {
            return;
        }

        const now = this.context.currentTime;

        this.fadingMusicSources.forEach(({ source, gain }) => {
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
                source.stop(now + 0.1);
            } catch {
                // already stopped
            }
        });
    }

    private stopMusic(): void {
        if (!this.context || !this.musicBus) {
            return;
        }

        const source = this.musicSource;
        const gain = this.musicSourceGain;

        this.stopFadingMusicSources();
        this.musicSource = null;
        this.musicSourceGain = null;
        this.musicSourceMode = null;

        if (!source || !gain) {
            this.rampMusicBus(0.0001, MUSIC_STOP_FADE);
            return;
        }

        const now = this.context.currentTime;

        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + MUSIC_STOP_FADE);
            source.stop(now + MUSIC_STOP_FADE + 0.05);
        } catch {
            // already stopped
        }

        source.onended = () => {
            source.disconnect();
            gain.disconnect();
        };
        this.rampMusicBus(0.0001, MUSIC_STOP_FADE);
    }

    private rampMusicBus(target: number, duration: number): void {
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

    private requestMusicRender(mode: MusicTrack): void {
        if (
            typeof window === 'undefined' ||
            this.musicUnsupported ||
            this.musicBuffers.has(mode) ||
            this.musicRendering === mode ||
            this.musicRenderQueue.includes(mode)
        ) {
            return;
        }

        this.musicRenderQueue.push(mode);
        void this.drainMusicRenderQueue();
    }

    private async drainMusicRenderQueue(): Promise<void> {
        if (this.musicDraining) {
            return;
        }

        this.musicDraining = true;

        try {
            while (this.musicRenderQueue.length > 0) {
                const mode = this.musicRenderQueue.shift()!;

                if (this.musicBuffers.has(mode)) {
                    continue;
                }

                this.musicRendering = mode;

                try {
                    const buffer = await this.renderMusicBuffer(mode);
                    this.musicBuffers.set(mode, buffer);
                } catch {
                    this.musicUnsupported = true;
                } finally {
                    this.musicRendering = null;
                }

                if (this.musicMode !== mode) {
                    this.syncMusic();
                } else if (this.unlocked && this.musicEnabled && !this.hidden) {
                    this.startMusic();
                }
            }
        } finally {
            this.musicDraining = false;
        }
    }

    private async renderMusicBuffer(mode: MusicTrack): Promise<AudioBuffer> {
        const OfflineCtor =
            window.OfflineAudioContext ??
            (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
                .webkitOfflineAudioContext;

        if (!OfflineCtor) {
            throw new Error('OfflineAudioContext unavailable');
        }

        const score = buildMusicScore(mode);
        const beat = 60 / score.bpm;
        const loopSeconds = score.bars * 4 * beat;
        const offline = new OfflineCtor(
            2,
            Math.ceil((loopSeconds + score.tailSeconds) * MUSIC_SAMPLE_RATE),
            MUSIC_SAMPLE_RATE
        );

        const compressor = offline.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 14;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.18;
        compressor.connect(offline.destination);

        const master = offline.createGain();
        master.gain.value = 0.78;
        master.connect(compressor);

        const dry = offline.createGain();
        dry.gain.value = 0.92;
        dry.connect(master);

        const delay = offline.createDelay(1);
        delay.delayTime.value = beat * 0.75;
        const delayFilter = offline.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = mode === 'gameplay' ? 2800 : 2200;
        delayFilter.Q.value = 0.7;
        const feedback = offline.createGain();
        feedback.gain.value = mode === 'gameplay' ? 0.22 : 0.18;
        const delayLevel = offline.createGain();
        delayLevel.gain.value = mode === 'gameplay' ? 0.24 : 0.2;

        delay.connect(delayFilter);
        delayFilter.connect(feedback);
        feedback.connect(delay);
        delayFilter.connect(delayLevel);
        delayLevel.connect(master);

        const noise = this.createOfflineNoise(offline);
        const bright = mode === 'gameplay';

        score.events.forEach((event) => {
            this.renderScoreEvent(offline, dry, delay, noise, event, bright);
        });

        const rendered = await offline.startRendering();
        return this.wrapMusicTail(offline, rendered, loopSeconds);
    }

    private createOfflineNoise(context: OfflineAudioContext): AudioBuffer {
        const buffer = context.createBuffer(1, MUSIC_SAMPLE_RATE * 2, MUSIC_SAMPLE_RATE);
        const data = buffer.getChannelData(0);

        for (let index = 0; index < data.length; index += 1) {
            data[index] = Math.random() * 2 - 1;
        }

        return buffer;
    }

    private wrapMusicTail(
        context: OfflineAudioContext,
        rendered: AudioBuffer,
        loopSeconds: number
    ): AudioBuffer {
        const loopFrames = Math.min(rendered.length, Math.floor(loopSeconds * rendered.sampleRate));
        const tailFrames = rendered.length - loopFrames;
        const result = context.createBuffer(rendered.numberOfChannels, loopFrames, rendered.sampleRate);

        for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
            const source = rendered.getChannelData(channel);
            const destination = result.getChannelData(channel);

            for (let index = 0; index < loopFrames; index += 1) {
                destination[index] = source[index];
            }

            for (let index = 0; index < tailFrames; index += 1) {
                const mixed = destination[index] + source[loopFrames + index];
                destination[index] = Math.max(-1, Math.min(1, mixed));
            }
        }

        return result;
    }

    private createMusicPan(context: OfflineAudioContext, pan: number): AudioNode {
        const node = typeof context.createStereoPanner === 'function'
            ? context.createStereoPanner()
            : context.createGain();

        if ('pan' in node) {
            (node as StereoPannerNode).pan.value = Math.max(-1, Math.min(1, pan));
        }

        return node;
    }

    private renderScoreEvent(
        context: OfflineAudioContext,
        dry: AudioNode,
        delay: AudioNode,
        noise: AudioBuffer,
        event: ScoreEvent,
        bright: boolean
    ): void {
        switch (event.voice) {
            case 'pad':
                this.renderMusicTone(context, dry, delay, event, 'triangle', 7, bright ? 1600 : 1250, 0.55, 0.6, 0);
                break;
            case 'chord':
                this.renderMusicTone(context, dry, delay, event, 'triangle', 5, bright ? 2600 : 2100, 0.014, 0.24, 0.06);
                break;
            case 'arp':
                this.renderMusicTone(context, dry, delay, event, 'triangle', 0, bright ? 3400 : 2800, 0.004, 0.18, 0.22);
                break;
            case 'lead':
                this.renderMusicTone(context, dry, delay, event, 'triangle', 6, bright ? 3600 : 3000, 0.018, 0.3, 0.18);
                this.renderMusicTone(
                    context,
                    dry,
                    delay,
                    { ...event, midi: (event.midi ?? 60) + 12, velocity: event.velocity * 0.24 },
                    'sine',
                    0,
                    bright ? 5000 : 4200,
                    0.012,
                    0.22,
                    0.12
                );
                break;
            case 'bass':
                this.renderMusicTone(context, dry, delay, event, 'sine', 0, 320, 0.008, 0.14, 0);
                this.renderMusicTone(
                    context,
                    dry,
                    delay,
                    { ...event, midi: (event.midi ?? 48) + 12, velocity: event.velocity * 0.32 },
                    'triangle',
                    0,
                    620,
                    0.006,
                    0.1,
                    0
                );
                break;
            case 'kick':
                this.renderKick(context, dry, event);
                break;
            case 'snare':
                this.renderNoiseHit(context, dry, noise, event, 'highpass', 900, 0.7);
                this.renderMusicTone(
                    context,
                    dry,
                    delay,
                    { ...event, midi: 48, velocity: event.velocity * 0.42 },
                    'triangle',
                    0,
                    900,
                    0.002,
                    0.06,
                    0
                );
                break;
            case 'hat':
                this.renderNoiseHit(context, dry, noise, event, 'highpass', 6200, 0.6);
                break;
            case 'clap':
                this.renderNoiseHit(context, dry, noise, event, 'bandpass', 1500, 1.1);
                break;
            case 'perc':
                this.renderNoiseHit(context, dry, noise, event, 'bandpass', 2600, 1.4);
                break;
        }
    }

    private renderMusicTone(
        context: OfflineAudioContext,
        destination: AudioNode,
        send: AudioNode,
        event: ScoreEvent,
        type: OscillatorType,
        detune: number,
        cutoff: number,
        attack: number,
        release: number,
        sendLevel: number
    ): void {
        const frequency = midiToHz(event.midi ?? 60);
        const start = event.time;
        const end = start + event.duration + release;
        const hold = Math.max(start + attack, end - release * 0.8);

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.7;

        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(event.velocity, start + attack);
        gain.gain.setValueAtTime(event.velocity, hold);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        const pan = this.createMusicPan(context, event.pan);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(destination);

        if (sendLevel > 0) {
            const effectSend = context.createGain();
            effectSend.gain.value = sendLevel;
            pan.connect(effectSend);
            effectSend.connect(send);
        }

        const detunes = detune > 0 ? [-detune, detune] : [0];

        detunes.forEach((cents) => {
            const oscillator = context.createOscillator();
            oscillator.type = type;
            oscillator.frequency.value = frequency;
            oscillator.detune.value = cents;
            oscillator.connect(filter);
            oscillator.start(start);
            oscillator.stop(end + 0.02);
        });
    }

    private renderNoiseHit(
        context: OfflineAudioContext,
        destination: AudioNode,
        noise: AudioBuffer,
        event: ScoreEvent,
        filterType: BiquadFilterType,
        frequency: number,
        q: number
    ): void {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        const start = event.time;
        const end = start + event.duration;

        source.buffer = noise;
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(event.velocity, start + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        const pan = this.createMusicPan(context, event.pan);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(pan);
        pan.connect(destination);
        source.start(start, Math.random() * 0.5, event.duration + 0.01);
    }

    private renderKick(
        context: OfflineAudioContext,
        destination: AudioNode,
        event: ScoreEvent
    ): void {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = event.time;
        const end = start + event.duration;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(150, start);
        oscillator.frequency.exponentialRampToValueAtTime(48, start + 0.12);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(event.velocity, start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
    }
}

export const gameAudio = new GameAudio();

/** Adds the shared button click to any interactive object in a scene. */
export const installUiAudio = (scene: Phaser.Scene): void => {
    const handler = (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject
    ): void => {
        const cursor = (gameObject.input as { cursor?: string } | null)?.cursor;

        if (cursor !== 'pointer') {
            return;
        }

        gameAudio.playSfx('click');
    };

    scene.input.on('gameobjectdown', handler);
    scene.events.once('shutdown', () => {
        scene.input.off('gameobjectdown', handler);
    });
};
