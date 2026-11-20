import { describe, expect, it } from 'vitest';
import { buildMusicScore, MUSIC_TRACKS, type ScoreVoice } from './musicScore';

const REQUIRED_VOICES: readonly ScoreVoice[] = [
    'pad',
    'chord',
    'bass',
    'arp',
    'lead',
    'kick',
    'snare',
    'hat',
];

describe('original music score', () => {
    MUSIC_TRACKS.forEach((track) => {
        const score = buildMusicScore(track);
        const loopSeconds = (score.bars * 4 * 60) / score.bpm;

        it(`${track} provides a full loop with every arrangement layer`, () => {
            const voices = new Set(score.events.map((event) => event.voice));

            expect(score.bars).toBe(8);
            expect(score.tailSeconds).toBeGreaterThan(1);
            expect(loopSeconds).toBeGreaterThan(10);
            REQUIRED_VOICES.forEach((voice) => expect(voices.has(voice)).toBe(true));
        });

        it(`${track} keeps every event inside the loop window`, () => {
            score.events.forEach((event) => {
                expect(event.time).toBeGreaterThanOrEqual(0);
                expect(event.time).toBeLessThan(loopSeconds);
                expect(event.velocity).toBeGreaterThan(0);
                expect(event.velocity).toBeLessThanOrEqual(1);
                expect(event.pan).toBeGreaterThanOrEqual(-1);
                expect(event.pan).toBeLessThanOrEqual(1);

                if (event.midi !== undefined) {
                    expect(event.midi).toBeGreaterThanOrEqual(36);
                    expect(event.midi).toBeLessThanOrEqual(84);
                }
            });
        });

        it(`${track} has a catchy repeated melody`, () => {
            const leadNotes = score.events
                .filter((event) => event.voice === 'lead' && event.midi !== undefined)
                .map((event) => event.midi);

            expect(leadNotes.length).toBeGreaterThanOrEqual(24);
            expect(new Set(leadNotes).size).toBeGreaterThanOrEqual(7);
        });
    });

    it('gives gameplay a brighter tempo than the menu', () => {
        expect(buildMusicScore('gameplay').bpm).toBeGreaterThan(buildMusicScore('menu').bpm);
    });
});
