import { loadProgress } from '../utils/storage';

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

export type MusicTrack = 'menu' | 'gameplay';
export type MusicMode = MusicTrack | 'none';

const MUSIC_LEVEL = 0.42;
const MUSIC_CROSSFADE = 0.9;
const MUSIC_STOP_FADE = 0.35;
const MAX_ACTIVE_EMITTERS = 12;

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Small, self-contained audio engine.
 *
 * Every sound is synthesised from oscillators and noise at runtime, so there
 * are no audio downloads, no sample licences and no large binaries in the
 * Android bundle. Music is rendered once per track into a short mono buffer
 * and then played through a looping source.
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
    private musicMode: MusicMode = 'menu';
    private musicSource: AudioBufferSourceNode | null = null;
    private musicSourceGain: GainNode | null = null;
    private musicSourceMode: MusicTrack | null = null;
    private musicRendering: MusicTrack | null = null;
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
                this.tone('triangle', 760, 300, 0.12, 0.12, when, 0.004);
                this.noise(0.05, 0.03, 1100, when, 'bandpass');
                break;
            case 'fireLaunch':
                this.tone('sawtooth', 340, 110, 0.2, 0.055, when, 0.008);
                this.noise(0.18, 0.05, 760, when, 'bandpass');
                this.tone('sine', 900, 1500, 0.12, 0.03, when + 0.02, 0.004);
                break;
            case 'bombLaunch':
                this.tone('sine', 160, 70, 0.16, 0.09, when, 0.006);
                this.noise(0.1, 0.03, 520, when, 'lowpass');
                break;
            case 'bounce':
                this.tone('sine', 230, 150, 0.065, 0.1, when, 0.004);
                this.noise(0.025, 0.022, 1500, when, 'highpass');
                break;
            case 'collide':
                this.tone('sine', 330, 190, 0.06, 0.065, when, 0.003);
                this.noise(0.028, 0.02, 950, when, 'bandpass');
                break;
            case 'match':
                [659.25, 987.77].forEach((frequency, index) => {
                    this.tone('triangle', frequency, frequency, 0.16, 0.045, when + index * 0.055, 0.004);
                });
                break;
            case 'pop':
                this.schedulePop(when, 1, 1);
                break;
            case 'click':
                this.tone('square', 760, 620, 0.04, 0.05, when, 0.002);
                break;
            case 'swap':
                this.tone('sine', 520, 700, 0.07, 0.05, when, 0.003);
                break;
            case 'colorSwitch':
                [523.25, 659.25, 783.99].forEach((frequency, index) => {
                    this.tone('sine', frequency, frequency, 0.1, 0.04, when + index * 0.042, 0.003);
                });
                break;
            case 'powerup':
                [392, 523.25, 659.25].forEach((frequency, index) => {
                    this.tone('triangle', frequency, frequency, 0.13, 0.045, when + index * 0.05, 0.004);
                });
                break;
            case 'bomb':
                this.tone('sine', 120, 38, 0.4, 0.12, when, 0.006);
                this.noise(0.32, 0.08, 420, when, 'lowpass');
                break;
            case 'fire':
                this.tone('sawtooth', 280, 90, 0.22, 0.05, when, 0.005);
                this.noise(0.24, 0.06, 1200, when, 'bandpass');
                break;
            case 'lightning':
                this.tone('sawtooth', 1600, 320, 0.12, 0.05, when, 0.002);
                this.noise(0.08, 0.05, 2600, when, 'highpass');
                break;
            case 'star':
                this.chime(when, 0.06);
                break;
            case 'coin':
                this.tone('sine', 1318.5, 1318.5, 0.09, 0.05, when, 0.003);
                this.tone('sine', 1760, 1760, 0.14, 0.04, when + 0.04, 0.003);
                break;
            case 'win':
                [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
                    this.tone(
                        'triangle',
                        frequency,
                        frequency,
                        0.42,
                        0.07,
                        when + index * 0.11,
                        0.012
                    );
                });
                this.tone('sine', 261.63, 261.63, 0.9, 0.04, when, 0.08);
                break;
            case 'lose':
                this.tone('sawtooth', 260, 92, 0.5, 0.04, when, 0.02);
                this.tone('sine', 180, 72, 0.55, 0.065, when + 0.04, 0.02);
                break;
            case 'drop':
                this.tone('sine', 138, 74, 0.2, 0.12, when, 0.006);
                this.noise(0.07, 0.03, 360, when, 'lowpass');
                break;
            case 'popupOpen':
                this.noise(0.12, 0.024, 720, when, 'bandpass');
                this.tone('sine', 300, 520, 0.14, 0.028, when, 0.008);
                break;
            case 'popupClose':
                this.noise(0.1, 0.02, 600, when, 'bandpass');
                this.tone('sine', 460, 280, 0.12, 0.024, when, 0.006);
                break;
            case 'purchase':
                [659.25, 880, 1174.66].forEach((frequency, index) => {
                    this.tone('triangle', frequency, frequency, 0.22, 0.045, when + index * 0.06, 0.004);
                });
                this.chime(when + 0.2, 0.026);
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
            if (this.musicRendering !== mode) {
                void this.renderMusic(mode);
            }
            return;
        }

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

        source.onended = () => {
            source.disconnect();
            gain.disconnect();
        };
    }

    private stopMusic(): void {
        if (!this.context || !this.musicBus) {
            return;
        }

        const source = this.musicSource;
        const gain = this.musicSourceGain;

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

    private async renderMusic(mode: MusicTrack): Promise<void> {
        if (
            this.musicRendering ||
            this.musicBuffers.has(mode) ||
            typeof window === 'undefined'
        ) {
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

        this.musicRendering = mode;

        try {
            const sampleRate = 24000;
            const bpm = mode === 'menu' ? 82 : 100;
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
            master.gain.linearRampToValueAtTime(0.85, 0.02);
            master.gain.setValueAtTime(0.85, duration - 0.02);
            master.gain.linearRampToValueAtTime(0.0001, duration);
            master.connect(offline.destination);

            const delay = offline.createDelay(0.7);
            delay.delayTime.value = mode === 'menu' ? 0.28 : 0.22;
            const feedback = offline.createGain();
            feedback.gain.value = mode === 'menu' ? 0.18 : 0.14;
            const delayFilter = offline.createBiquadFilter();
            delayFilter.type = 'lowpass';
            delayFilter.frequency.value = mode === 'menu' ? 1800 : 2200;
            const delayLevel = offline.createGain();
            delayLevel.gain.value = mode === 'menu' ? 0.3 : 0.24;

            delay.connect(delayFilter);
            delayFilter.connect(feedback);
            feedback.connect(delay);
            delayFilter.connect(delayLevel);
            delayLevel.connect(master);

            const chords =
                mode === 'menu'
                    ? [
                          { notes: [57, 60, 64, 67], bass: 45 },
                          { notes: [53, 57, 60, 64], bass: 41 },
                          { notes: [48, 52, 55, 59], bass: 36 },
                          { notes: [55, 59, 62, 65], bass: 43 },
                      ]
                    : [
                          { notes: [60, 64, 67, 72], bass: 48 },
                          { notes: [57, 60, 64, 69], bass: 45 },
                          { notes: [53, 57, 60, 65], bass: 41 },
                          { notes: [55, 59, 62, 67], bass: 43 },
                      ];
            const pattern =
                mode === 'menu'
                    ? [0, 2, 1, 2, 3, 2, 1, 0]
                    : [0, 1, 2, 3, 2, 1, 0, 2];

            chords.forEach((chord, chordIndex) => {
                const start = chordIndex * bar;

                this.renderPad(
                    offline,
                    master,
                    start,
                    bar + 0.2,
                    chord.notes,
                    mode === 'menu' ? 0.028 : 0.023,
                    mode === 'menu' ? 1150 : 1450
                );
                this.renderBass(
                    offline,
                    master,
                    start,
                    chord.bass,
                    mode === 'menu' ? 0.04 : 0.045
                );

                if (mode === 'gameplay') {
                    this.renderBass(offline, master, start + bar / 2, chord.bass + 7, 0.02);
                }

                for (let step = 0; step < 8; step++) {
                    const note = chord.notes[pattern[step]] + 12;
                    const when = start + step * (beat / 2);
                    this.renderPluck(
                        offline,
                        master,
                        delay,
                        when,
                        note,
                        mode === 'menu' ? 0.03 : 0.032
                    );
                }
            });

            const buffer = await offline.startRendering();
            this.musicBuffers.set(mode, buffer);
        } catch {
            this.musicUnsupported = true;
        } finally {
            this.musicRendering = null;
        }

        if (this.musicMode !== mode) {
            this.syncMusic();
            return;
        }

        if (
            this.unlocked &&
            this.musicEnabled &&
            !this.hidden &&
            this.musicBuffers.has(mode)
        ) {
            this.startMusic();
        }
    }

    private renderPad(
        context: OfflineAudioContext,
        destination: AudioNode,
        start: number,
        duration: number,
        notes: number[],
        level = 0.03,
        cutoff = 1150
    ): void {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.6;
        filter.connect(destination);

        notes.forEach((note, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const voiceLevel = Math.max(0.012, level - index * 0.003);

            oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
            oscillator.frequency.value = midiToHz(note);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(voiceLevel, start + 0.55);
            gain.gain.setValueAtTime(voiceLevel, start + duration - 0.85);
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
        midi: number,
        level = 0.045
    ): void {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const duration = 1.2;

        oscillator.type = 'sine';
        oscillator.frequency.value = midiToHz(midi);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.05);
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
