// Interval identification mode: core data + question generation.
// DOM-free so test_intervals.js can exercise it under Node (mirrors sequences.js).
//
// The answer rule (owner-confirmed): the interval is always counted UP from the red
// root, within one octave. delta = notePitch - rootPitch in actual pitch (open-string
// absolute semitones + fret, never fret arithmetic); pc = ((delta % 12) + 12) % 12;
// pc 0 = P8. One positive-modulo rule covers everything: a note a m3 BELOW the root
// answers M6 (its inversion), a 9th above answers M2 (its simple equivalent), an
// octave below or a 15th above answers P8.

// Canonical name per semitone count. Keys of INTERVALS (sequences.js); TT is the
// direction-neutral spelling of the tritone (A4/d5 depend on context, TT does not).
const INTERVAL_NAMES = {
    1: 'm2', 2: 'M2', 3: 'm3', 4: 'M3', 5: 'P4', 6: 'TT',
    7: 'P5', 8: 'm6', 9: 'M6', 10: 'm7', 11: 'M7', 12: 'P8'
};

// Semitone values in quiz order, with display labels for the settings list
const INTERVAL_LIST = [
    { semis: 1, label: 'm2' },
    { semis: 2, label: 'M2' },
    { semis: 3, label: 'm3' },
    { semis: 4, label: 'M3' },
    { semis: 5, label: 'P4' },
    { semis: 6, label: 'TT (tritone)' },
    { semis: 7, label: 'P5' },
    { semis: 8, label: 'm6' },
    { semis: 9, label: 'M6' },
    { semis: 10, label: 'm7' },
    { semis: 11, label: 'M7' },
    { semis: 12, label: 'P8 (octave)' }
];

function ivShuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

// Map any integer to this file's key space: 1..12, where 12 (not 0) means P8
function ivWrap(semis) {
    const pc = ((semis % 12) + 12) % 12;
    return pc === 0 ? 12 : pc;
}

// Answer options for an interval question. The inversion (12 - s) and the semitone
// neighbours are the musical traps — the shapes an untrained eye confuses — so they
// come first; the rest fills in at random. The tritone (6) is its own inversion and
// P8's "inversion" is itself, so those fall through to the neighbours.
function generateIntervalOptions(semis) {
    const candidates = [ivWrap(12 - semis), ivWrap(semis - 1), ivWrap(semis + 1),
                        ivWrap(semis - 2), ivWrap(semis + 2)]
        .concat(ivShuffle(INTERVAL_LIST.map(entry => entry.semis)));
    const distractors = [];
    candidates.forEach(candidate => {
        if (distractors.length >= 3) return;
        if (candidate !== semis && distractors.indexOf(candidate) === -1) {
            distractors.push(candidate);
        }
    });
    return ivShuffle(
        [INTERVAL_NAMES[semis]].concat(distractors.map(s => INTERVAL_NAMES[s])));
}

// Enumerate every valid (root, note) placement for the current settings and pick one
// uniformly. Generated on the run per question — never memoized.
//
// opts = {
//   stringPitches:  absolute semitones per string, index 0 = highest string,
//   enabledStrings: string indices allowed for BOTH notes (checked practice strings),
//   minFret, maxFret,
//   spanUp, spanDown: how many strings the note may sit from the root's string,
//                     toward the higher / lower strings (same string always allowed),
//   regular, inversions: whether the note may sound above / below the root,
//   enabledSemis:    semitone values (1..12) the user practices
// }
function generateIntervalQuestion(opts) {
    const valid = [];

    for (let ri = 0; ri < opts.enabledStrings.length; ri++) {
        const rootString = opts.enabledStrings[ri];
        for (let ni = 0; ni < opts.enabledStrings.length; ni++) {
            const noteString = opts.enabledStrings[ni];
            // Offset > 0 = note on a higher-pitched string (toward index 0)
            const offset = rootString - noteString;
            if (offset > opts.spanUp || -offset > opts.spanDown) continue;

            for (let rootFret = opts.minFret; rootFret <= opts.maxFret; rootFret++) {
                for (let noteFret = opts.minFret; noteFret <= opts.maxFret; noteFret++) {
                    if (offset === 0 && noteFret === rootFret) continue;
                    const delta = (opts.stringPitches[noteString] + noteFret) -
                                  (opts.stringPitches[rootString] + rootFret);
                    if (delta === 0) continue; // unison: same pitch is not a question
                    const direction = delta > 0 ? 'regular' : 'inversion';
                    if (direction === 'regular' ? !opts.regular : !opts.inversions) continue;
                    const semis = ivWrap(delta);
                    if (opts.enabledSemis.indexOf(semis) === -1) continue;
                    valid.push({
                        root: { string: rootString, fret: rootFret },
                        note: { string: noteString, fret: noteFret },
                        delta: delta,
                        semis: semis,
                        direction: direction
                    });
                }
            }
        }
    }

    if (valid.length === 0) return null;
    const picked = valid[Math.floor(Math.random() * valid.length)];
    return {
        root: picked.root,
        note: picked.note,
        delta: picked.delta,
        semis: picked.semis,
        name: INTERVAL_NAMES[picked.semis],
        direction: picked.direction,
        options: generateIntervalOptions(picked.semis)
    };
}

// Node export for test_intervals.js (mirrors sequences.js; browsers ignore this)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INTERVAL_NAMES: INTERVAL_NAMES,
        INTERVAL_LIST: INTERVAL_LIST,
        generateIntervalOptions: generateIntervalOptions,
        generateIntervalQuestion: generateIntervalQuestion
    };
}
