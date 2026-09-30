// Chord identification mode: the book's movable P4 voicings (charts_P4_Guitar.pdf).
// DOM-free so test_chords.js can exercise it under Node (mirrors sequences.js).
//
// The book's diagrams (tuning E2 A2 D3 G3 C4 F4, the app's default all-fourths) are
// drawn as 6 rows = strings 6->1 (bass on top) x 5 fret columns, with finger digits;
// the note names printed under each diagram are the ground truth used for this
// transcription: each played string's fret was computed as (note - open) mod 12
// inside the printed fret window (wide gaps in the line = muted strings inside the
// span). Every pattern is movable along the neck (root shifts chromatically) and
// across string groups 6-3 / 5-2 / 4-1 (root shifts by a fourth) - the P4 symmetry
// the book teaches - so forms are stored root-relative and placed on the run.
//
// Form encoding: `rel[i]` = fret of span-string i MINUS the root's fret (span-string
// 0 = the group's LOWEST string, matching the book's note lines, printed bass-first). The root
// fret itself is whatever the placement's offset is; rel[root] = 0 by construction.
// rel[i] = null = muted string inside the span. `omits` names book degrees that the
// voicing leaves out ('5', 'b7'). Non-moveable open-string "special" chords from the
// book's last section are excluded (the author does not use them).

const CHORD_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHORD_OMIT_SEMIS = { '5': 7, 'b7': 10, '9': 2 };

// Family catalogue. `degrees` are semitones from the root (mod 12), in the same
// stacked order as `formula`; `formula` is the degree spelling printed in the
// handbook, taken verbatim from the book's section headers (e.g. "1-3-5-b7" —
// the degree tokens are the intervals counted from the root). Symbols follow
// the app's triads.js conventions ('m', 'o', '+'). Tier 1+2 are checked by default.
const CHORD_FAMILIES = [
    { id: 'major',    symbol: '',        degrees: [0, 4, 7],       formula: '1-3-5',           tier: 1 },
    { id: 'minor',    symbol: 'm',       degrees: [0, 3, 7],       formula: '1-b3-5',          tier: 1 },
    { id: 'seven',    symbol: '7',       degrees: [0, 4, 7, 10],   formula: '1-3-5-b7',        tier: 1 },
    { id: 'minorSeven', symbol: 'm7',    degrees: [0, 3, 7, 10],   formula: '1-b3-5-b7',       tier: 1 },
    { id: 'majorSeven', symbol: 'maj7',  degrees: [0, 4, 7, 11],   formula: '1-3-5-7',         tier: 2 },
    { id: 'minorMajorSeven', symbol: 'm(maj7)', degrees: [0, 3, 7, 11], formula: '1-b3-5-7',   tier: 2 },
    { id: 'augmented', symbol: '+',      degrees: [0, 4, 8],       formula: '1-3-#5',          tier: 2 },
    { id: 'diminished', symbol: 'o',     degrees: [0, 3, 6],       formula: '1-b3-b5',         tier: 2 },
    { id: 'diminishedSeven', symbol: 'o7', degrees: [0, 3, 6, 9],  formula: '1-b3-b5-bb7',     tier: 2 },
    { id: 'sixth',    symbol: '6',       degrees: [0, 4, 7, 9],    formula: '1-3-5-6',         tier: 2 },
    { id: 'minorSixth', symbol: 'm6',    degrees: [0, 3, 7, 9],    formula: '1-b3-5-6',        tier: 2 },
    { id: 'ninth',    symbol: '9',       degrees: [0, 4, 7, 10, 2], formula: '1-3-5-b7-9',     tier: 3 },
    { id: 'minorNinth', symbol: 'm9',    degrees: [0, 3, 7, 10, 2], formula: '1-b3-5-b7-9',    tier: 3 },
    { id: 'sixNine',  symbol: '69',      degrees: [0, 4, 7, 9, 2], formula: '1-3-5-6-9',       tier: 3 },
    { id: 'thirteen', symbol: '13',      degrees: [0, 4, 7, 10, 2, 9], formula: '1-3-5-b7-9-13', tier: 3 },
    { id: 'sevenSharpFive', symbol: '7#5', degrees: [0, 4, 8, 10], formula: '1-3-#5-b7',       tier: 3 },
    { id: 'minorSevenSharpFive', symbol: 'm7#5', degrees: [0, 3, 8, 10], formula: '1-b3-#5-b7', tier: 3 },
    { id: 'sevenFlatFive', symbol: '7b5', degrees: [0, 4, 6, 10],  formula: '1-3-b5-b7',       tier: 3 },
    { id: 'minorSevenFlatFive', symbol: 'm7b5', degrees: [0, 3, 6, 10], formula: '1-b3-b5-b7', tier: 3 },
    { id: 'sevenSharpNinth', symbol: '7#9', degrees: [0, 4, 7, 10, 3], formula: '1-3-5-b7-#9', tier: 3 },
    { id: 'sevenFlatNinth', symbol: '7b9', degrees: [0, 4, 7, 10, 1], formula: '1-3-5-b7-b9',  tier: 3 },
    { id: 'sevenFlatThirteenth', symbol: '7b13', degrees: [0, 4, 7, 10, 8], formula: '1-3-5-b7-b13', tier: 3 }
];

// The book's voicings, transcribed diagram by diagram. `book` holds the printed
// placement used by the fidelity test: root fret + the printed note names from the
// group's lowest played string up.
const CHORD_FORMS = {
    major: [
        { span: 4, root: 0, rel: [0, -1, -3, -3], book: { rootFret: 5, rootPc: 9, notes: ['A', 'C#', 'E', 'A'] } },
        { span: 4, root: 0, rel: [0, 2, 2, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'G', 'B'] } },
        { span: 4, root: 2, rel: [2, 0, 0, 2], book: { rootFret: 2, rootPc: 4, notes: ['G#', 'B', 'E', 'B'] } },
        { span: 5, root: 4, rel: [3, null, 2, 0, 0], book: { rootFret: 2, rootPc: 2, notes: ['A', null, 'F#', 'A', 'D'] } },
        { span: 5, root: 3, rel: [-2, null, 0, 0, -1], book: { rootFret: 5, rootPc: 0, notes: ['G', null, 'G', 'C', 'E'] } }
    ],
    minor: [
        { span: 4, root: 0, rel: [0, -2, -3, -3], book: { rootFret: 5, rootPc: 9, notes: ['A', 'C', 'E', 'A'] } },
        { span: 4, root: 0, rel: [0, 2, 2, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'G', 'Bb'] } },
        { span: 4, root: 2, rel: [1, 0, 0, 2], book: { rootFret: 2, rootPc: 4, notes: ['G', 'B', 'E', 'B'] } },
        { span: 5, root: 3, rel: [-2, null, 0, 0, -2], book: { rootFret: 5, rootPc: 0, notes: ['G', null, 'G', 'C', 'Eb'] } }
    ],
    seven: [
        { span: 4, root: 0, rel: [0, 2, 0, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'F', 'B'] } },
        { span: 6, root: 0, rel: [0, -1, 0, 1, -1, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'B', 'D', 'G'] } },
        { span: 5, root: 0, rel: [0, null, 0, 1, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F', 'B', 'D'] } },
        { span: 5, root: 2, rel: [2, null, 0, 2, 0], book: { rootFret: 3, rootPc: 5, notes: ['A', null, 'F', 'C', 'Eb'] } },
        { span: 4, root: 1, rel: [0, 0, -1, 0], book: { rootFret: 3, rootPc: 0, notes: ['G', 'C', 'E', 'Bb'] } },
        { span: 4, root: 3, rel: [1, 2, 0, 0], book: { rootFret: 2, rootPc: 9, notes: ['G', 'C#', 'E', 'A'] } }
    ],
    minorSeven: [
        { span: 4, root: 0, rel: [0, 2, 0, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'F', 'Bb'] } },
        { span: 5, root: 0, rel: [0, null, 0, 0, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F', 'Bb', 'D'] } },
        { span: 4, root: 0, rel: [0, -2, 0, 0], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Bb', 'F', 'Bb'] } },
        { span: 4, root: 1, rel: [0, 0, -2, 0], book: { rootFret: 3, rootPc: 0, notes: ['G', 'C', 'Eb', 'Bb'] } }
    ],
    majorSeven: [
        { span: 4, root: 0, rel: [0, 2, 1, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'F#', 'B'] } },
        { span: 5, root: 0, rel: [0, null, 1, 1, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F#', 'B', 'D'] } },
        { span: 5, root: 2, rel: [2, null, 0, 2, 1], book: { rootFret: 3, rootPc: 5, notes: ['A', null, 'F', 'C', 'E'] } }
    ],
    minorMajorSeven: [
        { span: 4, root: 0, rel: [0, 2, 1, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'F#', 'Bb'] } },
        { span: 5, root: 0, rel: [0, null, 1, 0, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F#', 'Bb', 'D'] } },
        { span: 4, root: 3, rel: [2, 1, 0, 0], book: { rootFret: 2, rootPc: 9, notes: ['G#', 'C', 'E', 'A'] } }
    ],
    augmented: [
        { span: 4, root: 0, rel: [0, -1, -2, -3], book: { rootFret: 5, rootPc: 9, notes: ['A', 'C#', 'F', 'A'] } },
        { span: 4, root: 0, rel: [0, -1, -2, 1], book: { rootFret: 5, rootPc: 9, notes: ['A', 'C#', 'F', 'C#'] } }
    ],
    diminished: [
        { span: 4, root: 0, rel: [0, 1, 2, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Db', 'G', 'Bb'] } },
        { span: 5, root: 2, rel: [1, null, 0, 1, 2], book: { rootFret: 2, rootPc: 4, notes: ['G', null, 'E', 'Bb', 'E'] } }
    ],
    diminishedSeven: [
        { span: 4, root: 0, rel: [0, 1, -1, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Db', 'E', 'Bb'] } },
        { span: 5, root: 0, rel: [0, null, -1, 0, -2], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'E', 'Bb', 'Db'] } }
    ],
    sixth: [
        { span: 4, root: 0, rel: [0, 2, -1, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D', 'E', 'B'] } },
        { span: 5, root: 0, rel: [0, null, -1, 1, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'E', 'B', 'D'] } },
        { span: 4, root: 1, rel: [0, 0, -1, -1], book: { rootFret: 3, rootPc: 0, notes: ['G', 'C', 'E', 'A'] } },
        { span: 4, root: 2, rel: [2, 2, 0, 2], book: { rootFret: 2, rootPc: 4, notes: ['G#', 'C#', 'E', 'B'] } },
        { span: 4, root: 3, rel: [0, 2, 0, 0], book: { rootFret: 2, rootPc: 9, notes: ['F#', 'C#', 'E', 'A'] } },
        { span: 6, root: 0, rel: [0, -1, -1, 1, 1, -1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'E', 'B', 'E', 'G'] } }
    ],
    minorSixth: [
        { span: 5, root: 0, rel: [0, null, -1, 0, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'E', 'Bb', 'D'] } },
        { span: 4, root: 2, rel: [1, 2, 0, 2], book: { rootFret: 2, rootPc: 4, notes: ['G', 'C#', 'E', 'B'] } },
        { span: 4, root: 1, rel: [0, 0, -2, -1], book: { rootFret: 3, rootPc: 0, notes: ['G', 'C', 'Eb', 'A'] } },
        { span: 4, root: 3, rel: [0, 1, 0, 0], book: { rootFret: 2, rootPc: 9, notes: ['F#', 'C', 'E', 'A'] } },
        { span: 6, root: 1, rel: [0, 0, 2, 2, 0, 1], book: { rootFret: 3, rootPc: 0, notes: ['G', 'C', 'G', 'C', 'Eb', 'A'] } }
    ],
    ninth: [
        { span: 4, root: 0, rel: [0, -1, 0, -1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'A'] } },
        { span: 5, root: 4, rel: [0, null, 0, 0, 0], omits: ['b7'], book: { rootFret: 2, rootPc: 2, notes: ['F#', null, 'E', 'A', 'D'] } },
        { span: 6, root: 0, rel: [0, -1, 0, -1, -1, -1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'A', 'D', 'G'] } }
    ],
    minorNinth: [
        { span: 4, root: 0, rel: [0, -2, 0, -1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Bb', 'F', 'A'] } },
        { span: 5, root: 4, rel: [-1, null, 0, 0, 0], omits: ['b7'], book: { rootFret: 2, rootPc: 2, notes: ['F', null, 'E', 'A', 'D'] } }
    ],
    sixNine: [
        { span: 4, root: 0, rel: [0, -1, -1, -1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'E', 'A'] } }
    ],
    thirteen: [
        { span: 5, root: 0, rel: [0, -1, 0, -1, 1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'A', 'E'] } },
        { span: 5, root: 0, rel: [0, null, 0, 1, 1], omits: ['5', '9'], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F', 'B', 'E'] } },
        { span: 6, root: 0, rel: [0, -1, 0, -1, 1, -1], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'A', 'E', 'G'] } }
    ],
    sevenSharpFive: [
        { span: 4, root: 0, rel: [0, 3, 0, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'D#', 'F', 'B'] } },
        { span: 4, root: 2, rel: [2, 3, 0, 3], book: { rootFret: 2, rootPc: 4, notes: ['G#', 'D', 'E', 'C'] } },
        { span: 4, root: 1, rel: [1, 0, -1, 0], book: { rootFret: 3, rootPc: 0, notes: ['G#', 'C', 'E', 'Bb'] } },
        { span: 4, root: 3, rel: [1, 2, 1, 0], book: { rootFret: 2, rootPc: 9, notes: ['G', 'C#', 'F', 'A'] } }
    ],
    minorSevenSharpFive: [
        { span: 4, root: 0, rel: [0, 3, 0, 0], book: { rootFret: 1, rootPc: 5, notes: ['F', 'C#', 'Eb', 'Ab'] } },
        { span: 4, root: 2, rel: [1, 3, 0, 3], book: { rootFret: 2, rootPc: 4, notes: ['G', 'D', 'E', 'C'] } },
        { span: 4, root: 3, rel: [1, 1, 1, 0], book: { rootFret: 2, rootPc: 9, notes: ['G', 'C', 'F', 'A'] } }
    ],
    sevenFlatFive: [
        { span: 4, root: 0, rel: [0, 1, 0, 1], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Db', 'F', 'B'] } }
    ],
    minorSevenFlatFive: [
        { span: 4, root: 0, rel: [0, 1, 0, 0], book: { rootFret: 3, rootPc: 7, notes: ['G', 'Db', 'F', 'Bb'] } },
        { span: 5, root: 0, rel: [0, null, 0, 0, -2], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F', 'Bb', 'Db'] } },
        { span: 4, root: 1, rel: [-1, 0, -2, 0], book: { rootFret: 3, rootPc: 0, notes: ['Gb', 'C', 'Eb', 'Bb'] } },
        { span: 4, root: 3, rel: [1, 1, -1, 0], book: { rootFret: 2, rootPc: 9, notes: ['G', 'C', 'Eb', 'A'] } }
    ],
    sevenSharpNinth: [
        { span: 4, root: 0, rel: [0, -1, 0, 0], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'A#'] } }
    ],
    sevenFlatNinth: [
        { span: 4, root: 0, rel: [0, -1, 0, -2], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', 'B', 'F', 'Ab'] } }
    ],
    sevenFlatThirteenth: [
        { span: 5, root: 0, rel: [0, null, 0, 1, 0], omits: ['5'], book: { rootFret: 3, rootPc: 7, notes: ['G', null, 'F', 'B', 'Eb'] } }
    ]
};

function chordShuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

function chordFamilyById(id) {
    return CHORD_FAMILIES.find(family => family.id === id);
}

function chordName(rootPc, family) {
    return CHORD_SHARPS[((rootPc % 12) + 12) % 12] + family.symbol;
}

// Pitch-class set of the degrees a form actually sounds (family degrees minus omits)
function chordSoundedSet(family, omits) {
    const skip = (omits || []).map(name => CHORD_OMIT_SEMIS[name]);
    return family.degrees.filter(semis => skip.indexOf(semis) === -1);
}

// Symmetric-difference size between two semitone sets (distractor closeness,
// modeled on pcDistance in sequences.js but over plain degree arrays)
function chordPcDistance(a, b) {
    const diff = (x, y) => x.filter(v => y.indexOf(v) === -1).length;
    return diff(a, b) + diff(b, a);
}

// Place a form: `groupLowString` is the app string index (0 = highest string) of the
// group's LOWEST string; span-string i sits on app string groupLowString - i. The
// root lands on fret `rootFret`; every fret must stay within [minFret, maxFret].
// Returns { positions: [[string, fret]] (app order, bass first), rootIndex,
// pitches (absolute semitone per position), rootPc, bassPc } or null.
function placeChordForm(form, groupLowString, rootFret, stringPitches, minFret, maxFret) {
    const positions = [];
    const pitches = [];
    for (let i = 0; i < form.span; i++) {
        if (form.rel[i] === null) continue;
        const string = groupLowString - i;
        if (string < 0 || string >= stringPitches.length) return null;
        const fret = rootFret + form.rel[i];
        if (fret < minFret || fret > maxFret) return null;
        positions.push([string, fret]);
        pitches.push(stringPitches[string] + fret);
    }
    if (positions.length === 0) return null;
    // rootIndex points at the root's entry among the played positions
    let rootIndex = 0;
    for (let i = 0; i < form.span; i++) {
        if (i === form.root) break;
        if (form.rel[i] !== null) rootIndex++;
    }
    return {
        positions: positions,
        rootIndex: rootIndex,
        pitches: pitches,
        rootPc: ((pitches[rootIndex] % 12) + 12) % 12,
        bassPc: ((pitches[0] % 12) + 12) % 12
    };
}

// Answer options. Traps: the bass note read as the root (the inversion misread)
// and P4-adjacent roots (the same shape one string group over) — at most two of
// those — then same-root confusable families ranked by how close their degrees
// are, so every question trains root AND type discrimination. Names dedupe by
// (rootPc, familyId). A family that sounds exactly the question's notes under
// its own degrees or any of its voicings (7b13 without the 5th IS a 7#5,
// enharmonically — the #5 and the b13 are the same pitch class) is an
// alternative CORRECT name for the same diagram and never becomes a distractor.
function generateChordOptions(name, familyId, rootPc, bassPc, omits) {
    const family = chordFamilyById(familyId);
    const norm = pc => ((pc % 12) + 12) % 12;
    const seen = [{ pc: rootPc, familyId: familyId }];
    const lists = { traps: [], confusables: [] };
    const push = (list, pc, fam) => {
        pc = norm(pc);
        if (seen.some(c => c.pc === pc && c.familyId === fam.id)) return;
        seen.push({ pc: pc, familyId: fam.id });
        list.push(chordName(pc, fam));
    };
    const sounded = chordSoundedSet(family, omits);
    const isTwin = fam => {
        if (chordPcDistance(chordSoundedSet(fam, null), sounded) === 0) return true;
        return (CHORD_FORMS[fam.id] || []).some(form =>
            chordPcDistance(chordSoundedSet(fam, form.omits), sounded) === 0);
    };
    push(lists.traps, bassPc, family);          // inversion misread
    push(lists.traps, rootPc + 5, family);      // one string group toward the bass
    push(lists.traps, rootPc - 5, family);      // one string group toward the floor
    chordShuffle(CHORD_FAMILIES)
        .filter(fam => !isTwin(fam))
        .sort((a, b) => chordPcDistance(chordSoundedSet(a, null), family.degrees) -
                        chordPcDistance(chordSoundedSet(b, null), family.degrees))
        .forEach(fam => push(lists.confusables, rootPc, fam));
    const distractors = lists.traps.slice(0, 2).concat(lists.confusables).slice(0, 3);
    return chordShuffle([name].concat(distractors));
}

// Inversion of a form: the ordinal of the bass note's degree among the family's
// degrees (0 = root in the bass = root position; the 3rd in the bass = 1, the
// 5th = 2 - an altered 5th like #5 counts - the 7th or 6th = 3). The bass sits
// on span-string 0 and the root STRING_SEMITONES (5) higher strings are a fourth
// up at the same fret, so the bass degree is fixed by the form's rel/root and
// independent of where the form is placed.
function chordFormInversion(form, family) {
    const bassDeg = (((form.rel[0] - 5 * form.root) % 12) + 12) % 12;
    return family.degrees.indexOf(bassDeg);
}

// Enumerate every valid placement of every form of a family.
function chordPlacements(familyId, opts, minFret) {
    const placements = [];
    const family = chordFamilyById(familyId);
    (CHORD_FORMS[familyId] || []).forEach(form => {
        if (opts.inversions &&
            opts.inversions.indexOf(chordFormInversion(form, family)) === -1) return;
        for (let low = form.span - 1; low < opts.stringPitches.length; low++) {
            // every PLAYED string must be a checked practice string
            let stringsOk = true;
            for (let i = 0; i < form.span; i++) {
                if (form.rel[i] === null) continue;
                if (opts.enabledStrings.indexOf(low - i) === -1) { stringsOk = false; break; }
            }
            if (!stringsOk) continue;
            const minRel = Math.min.apply(null, form.rel.filter(v => v !== null));
            const maxRel = Math.max.apply(null, form.rel.filter(v => v !== null));
            for (let rootFret = Math.max(minFret - minRel, 1 - form.rel[form.root]);
                 rootFret + maxRel <= opts.maxFret && rootFret + minRel >= minFret;
                 rootFret++) {
                const placed = placeChordForm(form, low, rootFret, opts.stringPitches,
                    minFret, opts.maxFret);
                if (placed) placements.push({ form: form, placed: placed });
            }
        }
    });
    return placements;
}

// Enumerate every valid placement of every form of the picked family and choose one.
// opts = { stringPitches, enabledStrings, minFret, maxFret, enabledFamilies,
// inversions (ordinals 0-3; omit for all) }.
// The family is picked first (uniform) so multi-form families do not dominate;
// if that family has nothing that fits (fret window, string group, inversion),
// the others are tried in random order before giving up. Placements are
// generated on the run, never memoized. Returns { positions, rootIndex, name,
// rootPc, bassPc, familyId, inversion, options } or null.
function generateChordQuestion(opts) {
    // Chords never use open strings — the book's shapes are movable fretted forms.
    const minFret = Math.max(opts.minFret, 1);
    const playable = opts.enabledFamilies.filter(id => {
        const forms = CHORD_FORMS[id] || [];
        return forms.some(form => form.span <= opts.stringPitches.length);
    });
    if (playable.length === 0) return null;

    let familyId = null;
    let placements = [];
    for (const candidate of chordShuffle(playable)) {
        placements = chordPlacements(candidate, opts, minFret);
        if (placements.length > 0) { familyId = candidate; break; }
    }
    if (familyId === null) return null;
    const family = chordFamilyById(familyId);

    const picked = placements[Math.floor(Math.random() * placements.length)];
    const name = chordName(picked.placed.rootPc, family);
    return {
        positions: picked.placed.positions,
        rootIndex: picked.placed.rootIndex,
        name: name,
        rootPc: picked.placed.rootPc,
        bassPc: picked.placed.bassPc,
        familyId: familyId,
        inversion: chordFormInversion(picked.form, family),
        options: generateChordOptions(name, familyId, picked.placed.rootPc,
            picked.placed.bassPc, picked.form.omits)
    };
}

// Node export for test_chords.js (mirrors sequences.js; browsers ignore this)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CHORD_FAMILIES: CHORD_FAMILIES,
        CHORD_FORMS: CHORD_FORMS,
        CHORD_SHARPS: CHORD_SHARPS,
        placeChordForm: placeChordForm,
        generateChordQuestion: generateChordQuestion,
        generateChordOptions: generateChordOptions,
        chordPcDistance: chordPcDistance,
        chordSoundedSet: chordSoundedSet,
        chordName: chordName,
        chordFormInversion: chordFormInversion
    };
}
