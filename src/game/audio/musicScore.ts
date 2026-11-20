export type ScoreTrack = 'menu' | 'gameplay';

export type ScoreVoice =
    | 'pad'
    | 'chord'
    | 'bass'
    | 'arp'
    | 'lead'
    | 'kick'
    | 'snare'
    | 'hat'
    | 'clap'
    | 'perc';

export interface ScoreEvent {
    readonly voice: ScoreVoice;
    readonly time: number;
    readonly duration: number;
    readonly midi?: number;
    readonly velocity: number;
    readonly pan: number;
}

export interface MusicScore {
    readonly bpm: number;
    readonly bars: number;
    readonly tailSeconds: number;
    readonly events: readonly ScoreEvent[];
}

export const MUSIC_TRACKS: readonly ScoreTrack[] = ['menu', 'gameplay'];

interface Chord {
    readonly notes: readonly number[];
    readonly bass: number;
}

const MENU_CHORDS: readonly Chord[] = [
    { notes: [53, 57, 60, 64], bass: 41 },
    { notes: [52, 55, 57, 60], bass: 40 },
    { notes: [53, 57, 60, 62], bass: 38 },
    { notes: [53, 58, 62, 65], bass: 46 },
    { notes: [53, 57, 60, 64], bass: 41 },
    { notes: [55, 60, 64, 67], bass: 43 },
    { notes: [53, 57, 60, 62], bass: 38 },
    { notes: [53, 58, 62, 65], bass: 46 },
];

const GAMEPLAY_CHORDS: readonly Chord[] = [
    { notes: [55, 59, 62, 67], bass: 43 },
    { notes: [52, 55, 59, 64], bass: 40 },
    { notes: [52, 55, 60, 64], bass: 36 },
    { notes: [50, 54, 57, 62], bass: 38 },
    { notes: [55, 59, 62, 67], bass: 43 },
    { notes: [52, 55, 59, 64], bass: 40 },
    { notes: [55, 60, 64, 67], bass: 36 },
    { notes: [50, 54, 57, 62], bass: 38 },
];

const MENU_MELODY: readonly (readonly (number | null)[])[] = [
    [69, null, 72, null, 76, null, 72, null],
    [74, null, 72, null, 69, null, 67, null],
    [65, null, 69, null, 72, null, 69, null],
    [70, null, 69, null, 67, null, 65, null],
    [72, null, 76, null, 77, null, 76, null],
    [72, null, 69, null, 67, null, 69, null],
    [65, null, 67, null, 70, null, 72, null],
    [69, null, 67, null, 65, null, null, null],
];

const GAMEPLAY_MELODY: readonly (readonly (number | null)[])[] = [
    [74, null, 79, 81, 79, null, 76, null],
    [74, null, 71, 74, 76, null, 79, null],
    [76, null, 79, 83, 81, null, 79, 76],
    [74, null, 71, 67, 71, null, 74, null],
    [79, 81, 83, null, 81, 79, 76, null],
    [74, 76, 79, null, 76, 74, 71, null],
    [67, 71, 74, 76, 79, null, 81, 79],
    [76, null, 74, 71, 74, null, 67, null],
];

const nextMelodyBeat = (
    melody: readonly (readonly (number | null)[])[],
    bar: number,
    step: number
): number => {
    for (let offset = 1; offset < 8; offset += 1) {
        const nextStep = step + offset;
        const nextBar = bar + Math.floor(nextStep / 8);
        const wrappedStep = ((nextStep % 8) + 8) % 8;

        if (nextBar >= melody.length) {
            return 8;
        }

        if (melody[nextBar][wrappedStep] !== null) {
            return nextStep;
        }
    }

    return 8;
};

export const buildMusicScore = (track: ScoreTrack): MusicScore => {
    const gameplay = track === 'gameplay';
    const bpm = gameplay ? 116 : 92;
    const beat = 60 / bpm;
    const chords = gameplay ? GAMEPLAY_CHORDS : MENU_CHORDS;
    const melody = gameplay ? GAMEPLAY_MELODY : MENU_MELODY;
    const arpPattern = gameplay ? [0, 2, 3, 2, 1, 3, 2, 1] : [0, 2, 1, 3, 2, 1, 0, 2];
    const events: ScoreEvent[] = [];

    chords.forEach((chord, bar) => {
        const barTime = bar * 4 * beat;
        const add = (
            voice: ScoreVoice,
            beatOffset: number,
            durationBeats: number,
            midi: number | undefined,
            velocity: number,
            pan: number
        ): void => {
            events.push({
                voice,
                time: barTime + beatOffset * beat,
                duration: durationBeats * beat,
                midi,
                velocity,
                pan,
            });
        };

        chord.notes.forEach((note, index) => {
            add('pad', 0, 4, note, gameplay ? 0.018 : 0.024, index % 2 === 0 ? -0.18 : 0.18);
        });

        [0, 2.5].forEach((offset, strike) => {
            chord.notes.forEach((note, index) => {
                add(
                    'chord',
                    offset,
                    0.85,
                    note,
                    (gameplay ? 0.035 : 0.03) * (strike === 0 ? 1 : 0.78),
                    (index - 1.5) * 0.08
                );
            });
        });

        add('bass', 0, 0.58, chord.bass, gameplay ? 0.11 : 0.085, 0);
        add('bass', 1.5, 0.36, chord.bass + (gameplay ? 12 : 7), gameplay ? 0.055 : 0.04, 0);
        add('bass', 2, 0.5, chord.bass, gameplay ? 0.095 : 0.07, 0);
        if (gameplay) {
            add('bass', 3.5, 0.32, chord.bass + 7, 0.05, 0);
        }

        arpPattern.forEach((chordIndex, step) => {
            add(
                'arp',
                step * 0.5,
                0.28,
                chord.notes[chordIndex] + 12,
                gameplay ? 0.032 : 0.024,
                step % 2 === 0 ? -0.28 : 0.28
            );
        });

        melody[bar].forEach((note, step) => {
            if (note === null) {
                return;
            }

            const nextStep = nextMelodyBeat(melody, bar, step);
            const heldBeats = Math.min(1.5, (nextStep - step) * 0.92);

            add('lead', step * 0.5, heldBeats, note, gameplay ? 0.062 : 0.052, 0.06);
        });

        if (gameplay) {
            [0, 1.5, 2, 3.5].forEach((offset) => add('kick', offset, 0.22, undefined, 0.19, 0));
            [1, 3].forEach((offset) => {
                add('snare', offset, 0.16, undefined, 0.07, 0);
                add('clap', offset, 0.12, undefined, 0.026, 0.12);
            });
            for (let step = 0; step < 8; step += 1) {
                add('hat', step * 0.5, 0.06, undefined, step % 2 === 0 ? 0.016 : 0.026, step % 2 === 0 ? -0.12 : 0.12);
            }
            [0.75, 2.75].forEach((offset) => add('perc', offset, 0.09, undefined, 0.022, -0.2));
        } else {
            [0, 2].forEach((offset) => add('kick', offset, 0.26, undefined, 0.13, 0));
            [1, 3].forEach((offset) => add('snare', offset, 0.2, undefined, 0.038, 0));
            [0.5, 1.5, 2.5, 3.5].forEach((offset) => add('hat', offset, 0.07, undefined, 0.013, 0.08));
            add('perc', 3.25, 0.1, undefined, 0.015, -0.2);
        }
    });

    return { bpm, bars: chords.length, tailSeconds: 2.2, events };
};
