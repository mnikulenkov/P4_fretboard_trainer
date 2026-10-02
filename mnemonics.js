// Shape-mnemonic system for Note mode's "Mnemonics" suboption.
//
// For instruments tuned a HALF STEP DOWN from all-fourths tuning (7-string
// reference: open strings A# D# G# C# F# B D#), fret 1 of every string lands
// on a natural note, and the C-major naturals of each string group into 3
// fixed shapes with exactly one skipped (sharp) fret between neighbouring
// shapes. Each string is identified by its fret-1 letter:
//
//   7 strings (high -> low): F C G D A E B   (lowest open string A#)
//   6 strings (high -> low): F C G D A E     (lowest open string D#)
//   5-string bass:           G D A E B       (lowest open string A#)
//   4-string bass:           G D A E         (lowest open string D#)
//
// MNEMONIC_ROWS is the mnemonic map: per fret-1 letter, the three shapes of
// the frets 1-12 window (name = the shape's letters from the highest note
// down, e.g. GFE = G, F, E). The window repeats each octave; on the F and C
// strings the last shape wraps into the next octave with no skipped fret
// (E-F and B-C are half steps).
//
// This file is DOM-free so it can be unit-tested in Node (test_mnemonics.js).

// index 0 = highest string of the 7-string reference
const MNEMONIC_LETTERS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

const MNEMONIC_ROWS = {
    F: [{ name: 'GF', frets: [1, 3] }, { name: 'CBA', frets: [5, 7, 8] }, { name: 'ED', frets: [10, 12] }],
    C: [{ name: 'DC', frets: [1, 3] }, { name: 'GFE', frets: [5, 6, 8] }, { name: 'BA', frets: [10, 12] }],
    G: [{ name: 'G', frets: [1] }, { name: 'CBA', frets: [3, 5, 6] }, { name: 'FED', frets: [8, 10, 11] }],
    D: [{ name: 'FED', frets: [1, 3, 4] }, { name: 'G', frets: [6] }, { name: 'CBA', frets: [8, 10, 11] }],
    A: [{ name: 'CBA', frets: [1, 3, 4] }, { name: 'FED', frets: [6, 8, 9] }, { name: 'G', frets: [11] }],
    E: [{ name: 'GFE', frets: [1, 2, 4] }, { name: 'CBA', frets: [6, 8, 9] }, { name: 'D', frets: [11] }],
    B: [{ name: 'DCB', frets: [1, 2, 4] }, { name: 'GFE', frets: [6, 7, 9] }, { name: 'A', frets: [11] }]
};

const MNEMONIC_LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MNEMONIC_PC_TO_LETTER = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

// The fret patterns that actually occur on the strings (x = note, _ = skipped
// fret). The half-step pair 'xx' (2m) never occurs - every E-F and B-C pair
// gets absorbed into a 3-note shape - so it is never offered as an answer.
const MNEMONIC_PATTERNS = ['x', 'x_x', 'xx_x', 'x_xx'];

// Fret-1 letters of a supported instrument, index 0 = highest string.
// 7-string keeps everything; 6-string drops the low B; basses drop F and C.
function lettersForCount(count) {
    if (count === 7) return MNEMONIC_LETTERS.slice(0, 7);
    if (count === 6) return MNEMONIC_LETTERS.slice(0, 6);
    if (count === 5) return MNEMONIC_LETTERS.slice(2, 7);
    if (count === 4) return MNEMONIC_LETTERS.slice(2, 6);
    return null;
}

// The mnemonics need fret 1 of the lowest string to be B (7/5 strings, so the
// open string is A#/Bb) or E (6/4 strings, open D#/Eb) - a half step down from
// the all-fourths letters.
function isMnemonicTuningAvailable(numStrings, lowestPc) {
    if (numStrings === 5 || numStrings === 7) return lowestPc === MNEMONIC_LETTER_PC.B - 1;
    if (numStrings === 4 || numStrings === 6) return lowestPc === MNEMONIC_LETTER_PC.E - 1;
    return false;
}

// The natural note letter this string plays at the given fret, or null when
// the fret is an accidental (one of the skipped sharps)
function letterAtFret(stringLetter, fret) {
    return MNEMONIC_PC_TO_LETTER[(MNEMONIC_LETTER_PC[stringLetter] + fret - 1) % 12] || null;
}

// Fret pattern of a shape: 'x_xx' etc.
function shapePattern(shape) {
    let pattern = 'x';
    for (let i = 1; i < shape.frets.length; i++) {
        pattern += (shape.frets[i] - shape.frets[i - 1] === 1) ? 'x' : '_x';
    }
    return pattern;
}

// Type name by the first interval: 1, 2m/2b (minor/major second), 3m/3b
function shapeTypeName(shape) {
    if (shape.frets.length === 1) return '1';
    return shape.frets.length + (shape.frets[1] - shape.frets[0] === 1 ? 'm' : 'b');
}

// Index of the neighbouring shape in the string's 3-shape cycle (wraps)
function cycleNeighbour(letter, shapeIndex, direction) {
    return direction === 'right' ? (shapeIndex + 1) % 3 : (shapeIndex + 2) % 3;
}

// Frets the neighbour occupies on the fingerboard. Only the wrap to the right
// stays on the neck (the first shape one octave up, frets 13+); the wrap to
// the left falls off the nut (frets 0 and below - the open string is an
// accidental), so it never exists.
function neighbourFrets(letter, shapeIndex, direction) {
    const neighbour = MNEMONIC_ROWS[letter][cycleNeighbour(letter, shapeIndex, direction)];
    const shift = direction === 'right' && shapeIndex === 2 ? 12
        : direction === 'left' && shapeIndex === 0 ? -12 : 0;
    return neighbour.frets.map(fret => fret + shift);
}

// Local helpers (this file must stay free of app.js dependencies)
function mnShuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

function mnPick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// --- Drill generators ---------------------------------------------------------
// Each returns { drill, letter, shapeIndex, correct, options, ... } - pure
// data; the app maps the letter to a string index of the current tuning.

// 1) "Name the shape": options are shape names. Only names with the SAME note
// count as the answer are offered - the highlighted shape shows its size on
// the fretboard, so a 3-note name among 2-note answers (or the reverse) would
// give the game away. With the current rows that means all four 2-note names
// (GF ED DC BA), all four 3-note names (CBA GFE FED DCB) or the three 1-note
// names (G D A).
function randomShapeDrill(availableLetters) {
    const letter = mnPick(availableLetters);
    const shapeIndex = Math.floor(Math.random() * 3);
    const correct = MNEMONIC_ROWS[letter][shapeIndex].name;

    const sameCount = [];
    MNEMONIC_LETTERS.forEach(otherLetter => {
        MNEMONIC_ROWS[otherLetter].forEach(shape => {
            if (shape.name !== correct && shape.name.length === correct.length &&
                sameCount.indexOf(shape.name) === -1) {
                sameCount.push(shape.name);
            }
        });
    });

    return {
        drill: 'shape',
        letter: letter,
        shapeIndex: shapeIndex,
        correct: correct,
        options: mnShuffle([correct].concat(mnShuffle(sameCount).slice(0, 3)))
    };
}

// 2) "Name the red note": one note of the shape is marked; options are note
// letters, preferring the shape's other notes as traps.
function randomNoteDrill(availableLetters) {
    const letter = mnPick(availableLetters);
    const shapeIndex = Math.floor(Math.random() * 3);
    const shape = MNEMONIC_ROWS[letter][shapeIndex];
    const noteFret = shape.frets[Math.floor(Math.random() * shape.frets.length)];
    const correct = letterAtFret(letter, noteFret);

    const inShape = [];
    shape.frets.forEach(fret => {
        const name = letterAtFret(letter, fret);
        if (name !== correct && inShape.indexOf(name) === -1) inShape.push(name);
    });
    const rest = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].filter(name =>
        name !== correct && inShape.indexOf(name) === -1);

    const distractors = [];
    [inShape, rest].forEach(band => {
        mnShuffle(band).forEach(name => {
            if (distractors.length < 3 && distractors.indexOf(name) === -1) distractors.push(name);
        });
    });
    return {
        drill: 'note',
        letter: letter,
        shapeIndex: shapeIndex,
        noteFret: noteFret,
        correct: correct,
        options: mnShuffle([correct].concat(distractors))
    };
}

// 3) "Neighbour shape": options are fret patterns; left = toward the nut.
// Only neighbours that sit wholly on the fingerboard are asked for: the shape
// left of the window's first would live at frets 0 and below, and the shape
// right of the last (one octave up) only when the board renders it whole.
function randomNeighbourDrill(availableLetters, visibleFrets) {
    // The board always renders frets 1-12; NaN (cleared input) falls back too
    if (!(visibleFrets >= 12)) visibleFrets = 12;
    const letter = mnPick(availableLetters);
    const askable = [];
    for (let shapeIndex = 0; shapeIndex < 3; shapeIndex++) {
        ['left', 'right'].forEach(direction => {
            const frets = neighbourFrets(letter, shapeIndex, direction);
            if (frets[0] >= 1 && frets[frets.length - 1] <= visibleFrets) {
                askable.push({ shapeIndex: shapeIndex, direction: direction });
            }
        });
    }
    const picked = mnPick(askable);
    const correct = shapePattern(MNEMONIC_ROWS[letter][cycleNeighbour(letter, picked.shapeIndex, picked.direction)]);

    const distractors = mnShuffle(MNEMONIC_PATTERNS.filter(pattern => pattern !== correct)).slice(0, 3);
    return {
        drill: 'neighbour',
        letter: letter,
        shapeIndex: picked.shapeIndex,
        direction: picked.direction,
        correct: correct,
        options: mnShuffle([correct].concat(distractors))
    };
}

// Node export for test_mnemonics.js (mirrors sequences.js; browsers ignore this)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MNEMONIC_LETTERS: MNEMONIC_LETTERS,
        MNEMONIC_ROWS: MNEMONIC_ROWS,
        MNEMONIC_PATTERNS: MNEMONIC_PATTERNS,
        lettersForCount: lettersForCount,
        isMnemonicTuningAvailable: isMnemonicTuningAvailable,
        letterAtFret: letterAtFret,
        shapePattern: shapePattern,
        shapeTypeName: shapeTypeName,
        cycleNeighbour: cycleNeighbour,
        neighbourFrets: neighbourFrets,
        randomShapeDrill: randomShapeDrill,
        randomNoteDrill: randomNoteDrill,
        randomNeighbourDrill: randomNeighbourDrill
    };
}
