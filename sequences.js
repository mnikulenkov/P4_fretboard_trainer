// Interval-sequence catalog and applicature engine for "Identify interval sequence" mode.
//
// The catalog mirrors sequence_visualiser's example library (71 arpeggios + 75 scales;
// names are verbatim from the PDF filenames, interval spellings verbatim from the PDFs
// (Power chord arpeggio removed at the owner's request: 71 arpeggios + 75 scales).
//
// A "shape" (applicature) is a monotone fingering of one octave of the sequence: as the
// pitch ascends, each note either stays on its string or moves one string higher-sounding.
// With M notes (root, intervals, octave) there are 2^(M-1) shapes. A note s semitones
// above the root, played on string row r (0 = root string, negative = higher-sounding),
// sits at fret offset s + 5*r in perfect-fourths tuning.
//
// Patterns are built by CHAINING shapes: segment k+1's root is segment k's octave note,
// so the whole line is playable without position jumps. Pattern length is sampled
// uniformly at random from all valid chains via DP counting (h/g tables below), so the
// number of segments emerges from the fretboard's real budgets (string descents + fret
// window) instead of a fixed cap.
//
// This file is DOM-free so it can be unit-tested in Node (see test_sequences.js).

const INTERVALS = {
    P1: 0,
    m2: 1, M2: 2,
    A2: 3, m3: 3,
    M3: 4,
    A3: 5, P4: 5,
    A4: 6, d5: 6, TT: 6,
    P5: 7,
    A5: 8, m6: 8,
    M6: 9,
    A6: 10, m7: 10,
    M7: 11,
    P8: 12
};

// Semitone spacing between adjacent strings (perfect fourths tuning)
const STRING_SEMITONES = 5;

// Interval spelling -> roman-numeral degree for the "Show degrees" labels.
// Spelling matters: A4 -> #IV but d5/TT -> bV (both are 6 semitones).
const ROMAN_DEGREES = {
    P1: 'I',
    m2: 'bII', M2: 'II', A2: '#II',
    m3: 'bIII', M3: 'III', A3: '#III',
    P4: 'IV', A4: '#IV', d5: 'bV', TT: 'bV',
    P5: 'V', A5: '#V',
    m6: 'bVI', M6: 'VI', A6: '#VI',
    m7: 'bVII', M7: 'VII',
    P8: 'I'
};

function seqEntry(group, name, intervals, tier) {
    return {
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        name: name,
        group: group,
        intervals: intervals,
        tier: tier
    };
}

// Ordered most popular/basic first (array index = UI order). Tier 1 is the
// default-enabled set. Intervals verbatim from sequence_visualiser's example PDFs.
const ARPEGGIOS = [
    seqEntry('arpeggio', 'Major chord arpeggio', ['P1', 'M3', 'P5'], 1),
    seqEntry('arpeggio', 'Minor chord arpeggio', ['P1', 'm3', 'P5'], 1),
    seqEntry('arpeggio', 'Dominant 7th chord arpeggio', ['P1', 'M3', 'P5', 'm7'], 1),
    seqEntry('arpeggio', 'Major 7th chord arpeggio', ['P1', 'M3', 'P5', 'M7'], 1),
    seqEntry('arpeggio', 'Minor 7th chord arpeggio', ['P1', 'm3', 'P5', 'm7'], 1),
    seqEntry('arpeggio', 'Diminished chord arpeggio', ['P1', 'm3', 'd5'], 1),
    seqEntry('arpeggio', 'Diminished 7th chord arpeggio', ['P1', 'm3', 'd5', 'M6'], 1),
    seqEntry('arpeggio', 'Half-diminished 7th chord arpeggio', ['P1', 'm3', 'd5', 'm7'], 1),
    seqEntry('arpeggio', 'Augmented chord arpeggio', ['P1', 'M3', 'A5'], 1),
    seqEntry('arpeggio', 'Sus4 chord arpeggio', ['P1', 'P4', 'P5'], 1),
    seqEntry('arpeggio', 'Sus2 chord arpeggio', ['P1', 'M2', 'P5'], 1),

    seqEntry('arpeggio', 'Major 6th chord arpeggio', ['P1', 'M3', 'P5', 'M6'], 2),
    seqEntry('arpeggio', 'Minor 6th chord arpeggio', ['P1', 'm3', 'P5', 'M6'], 2),
    seqEntry('arpeggio', 'Major add9 chord arpeggio', ['P1', 'M2', 'M3', 'P5'], 2),
    seqEntry('arpeggio', 'Minor add9 chord arpeggio', ['P1', 'M2', 'm3', 'P5'], 2),
    seqEntry('arpeggio', 'Major 6_9 chord arpeggio', ['P1', 'M2', 'M3', 'P5', 'M6'], 2),
    seqEntry('arpeggio', 'Minor 6_9 chord arpeggio', ['P1', 'M2', 'm3', 'P5', 'M6'], 2),
    seqEntry('arpeggio', 'Dominant 9th chord arpeggio', ['P1', 'M2', 'M3', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Major 9th chord arpeggio', ['P1', 'M2', 'M3', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor 9th chord arpeggio', ['P1', 'M2', 'm3', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7b9 chord arpeggio', ['P1', 'm2', 'M3', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7#9 chord arpeggio', ['P1', 'm3', 'M3', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Minor 7b9 chord arpeggio', ['P1', 'm2', 'm3', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7b5 chord arpeggio', ['P1', 'M3', 'd5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7#5 chord arpeggio', ['P1', 'M3', 'A5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 9b5 chord arpeggio', ['P1', 'M2', 'M3', 'd5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 9#5 chord arpeggio', ['P1', 'M2', 'M3', 'A5', 'm7'], 2),
    seqEntry('arpeggio', 'Major 7b5 chord arpeggio', ['P1', 'M3', 'd5', 'M7'], 2),
    seqEntry('arpeggio', 'Major 7#5 chord arpeggio', ['P1', 'M3', 'A5', 'M7'], 2),
    seqEntry('arpeggio', 'Major 9#11 chord arpeggio', ['P1', 'M2', 'M3', 'A4', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Major 9#5 chord arpeggio', ['P1', 'M2', 'M3', 'A5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor 7#5 chord arpeggio', ['P1', 'm3', 'A5', 'm7'], 2),
    seqEntry('arpeggio', 'Minor 9#5 chord arpeggio', ['P1', 'M2', 'm3', 'A5', 'm7'], 2),
    seqEntry('arpeggio', 'Half-diminished 9th chord arpeggio', ['P1', 'M2', 'm3', 'd5', 'm7'], 2),
    seqEntry('arpeggio', 'Diminished major 7th chord arpeggio', ['P1', 'm3', 'd5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor-major 7th chord arpeggio', ['P1', 'm3', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor-major 9th chord arpeggio', ['P1', 'M2', 'm3', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor-major 7#5 chord arpeggio', ['P1', 'm3', 'A5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor-major 7b9 chord arpeggio', ['P1', 'm2', 'm3', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Major 7 sus4 chord arpeggio', ['P1', 'P4', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Major 7 sus2 chord arpeggio', ['P1', 'M2', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor 7 sus2 chord arpeggio', ['P1', 'M2', 'P5', 'm7'], 2),
    seqEntry('arpeggio', '7sus4 chord arpeggio', ['P1', 'P4', 'P5', 'm7'], 2),
    seqEntry('arpeggio', '9sus4 chord arpeggio', ['P1', 'M2', 'P4', 'P5', 'm7'], 2),
    seqEntry('arpeggio', '6 sus4 chord arpeggio', ['P1', 'P4', 'P5', 'M6'], 2),
    seqEntry('arpeggio', '6_9 sus4 chord arpeggio', ['P1', 'M2', 'P4', 'P5', 'M6'], 2),
    seqEntry('arpeggio', '7 add6 chord arpeggio', ['P1', 'M3', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Sus4 add9 chord arpeggio', ['P1', 'M2', 'P4', 'P5'], 2),
    seqEntry('arpeggio', 'Dominant shell chord arpeggio', ['P1', 'M3', 'm7'], 2),
    seqEntry('arpeggio', 'Major shell chord arpeggio', ['P1', 'M3', 'M7'], 2),
    seqEntry('arpeggio', 'Minor shell chord arpeggio', ['P1', 'm3', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7b6 chord arpeggio', ['P1', 'M3', 'P5', 'm6'], 2),
    seqEntry('arpeggio', 'Major 11th chord arpeggio', ['P1', 'M2', 'M3', 'P4', 'P5', 'M7'], 2),
    seqEntry('arpeggio', 'Minor 11th chord arpeggio', ['P1', 'M2', 'm3', 'P4', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Minor 7 add 11 chord arpeggio', ['P1', 'm3', 'P4', 'P5', 'm7'], 2),
    seqEntry('arpeggio', 'Minor 11b5 chord arpeggio', ['P1', 'M2', 'm3', 'P4', 'd5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 13th chord arpeggio', ['P1', 'M2', 'M3', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Major 13th chord arpeggio', ['P1', 'M2', 'M3', 'P5', 'M6', 'M7'], 2),
    seqEntry('arpeggio', 'Minor 13th chord arpeggio', ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 13sus4 chord arpeggio', ['P1', 'M2', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 13#11 chord arpeggio', ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 13#9 chord arpeggio', ['P1', 'm3', 'M3', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 13b9 chord arpeggio', ['P1', 'm2', 'M3', 'P5', 'M6', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7#5b9 chord arpeggio', ['P1', 'm2', 'M3', 'A5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7b5b9 chord arpeggio', ['P1', 'm2', 'M3', 'd5', 'm7'], 2),
    seqEntry('arpeggio', 'Dominant 7b5#9 chord arpeggio', ['P1', 'm3', 'M3', 'd5', 'm7'], 2),

    seqEntry('arpeggio', 'Quartal triad arpeggio', ['P1', 'P4', 'm7'], 3),
    seqEntry('arpeggio', 'Quartal 4-stack chord arpeggio', ['P1', 'm3', 'P4', 'm7'], 3),
    seqEntry('arpeggio', 'Quartal 5-stack chord arpeggio', ['P1', 'm3', 'P4', 'm6', 'm7'], 3),
    seqEntry('arpeggio', 'Phrygian chord arpeggio', ['P1', 'm2', 'P4', 'P5', 'm7'], 3),
    seqEntry('arpeggio', 'Tristan chord arpeggio', ['P1', 'TT', 'm6', 'M6'], 3)
];

const SCALES = [
    seqEntry('scale', 'Major scale', ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7'], 1),
    seqEntry('scale', 'Natural minor scale', ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'm7'], 1),
    seqEntry('scale', 'Minor pentatonic scale', ['P1', 'm3', 'P4', 'P5', 'm7'], 1),
    seqEntry('scale', 'Major pentatonic scale', ['P1', 'M2', 'M3', 'P5', 'M6'], 1),
    seqEntry('scale', 'Blues scale', ['P1', 'm3', 'P4', 'd5', 'P5', 'm7'], 1),
    seqEntry('scale', 'Dorian mode', ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'm7'], 1),
    seqEntry('scale', 'Mixolydian mode', ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'm7'], 1),
    seqEntry('scale', 'Lydian mode', ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'M7'], 1),
    seqEntry('scale', 'Phrygian mode', ['P1', 'm2', 'm3', 'P4', 'P5', 'm6', 'm7'], 1),
    seqEntry('scale', 'Locrian mode', ['P1', 'm2', 'm3', 'P4', 'd5', 'm6', 'm7'], 1),
    seqEntry('scale', 'Harmonic minor scale', ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'M7'], 1),
    seqEntry('scale', 'Melodic minor scale', ['P1', 'M2', 'm3', 'P4', 'P5', 'M6', 'M7'], 1),

    seqEntry('scale', 'Major blues scale', ['P1', 'M2', 'A2', 'M3', 'P5', 'M6'], 2),
    seqEntry('scale', 'Phrygian dominant mode', ['P1', 'm2', 'M3', 'P4', 'P5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Lydian dominant mode', ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Locrian natural 2 mode', ['P1', 'M2', 'm3', 'P4', 'd5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Altered scale', ['P1', 'm2', 'A2', 'M3', 'A4', 'A5', 'm7'], 2),
    seqEntry('scale', 'Whole tone scale', ['P1', 'M2', 'M3', 'A4', 'A5', 'A6'], 2),
    seqEntry('scale', 'Diminished scale', ['P1', 'M2', 'm3', 'P4', 'd5', 'm6', 'M6', 'M7'], 2),
    seqEntry('scale', 'Dominant diminished scale', ['P1', 'm2', 'm3', 'M3', 'A4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Harmonic major scale', ['P1', 'M2', 'M3', 'P4', 'P5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Major hexatonic scale', ['P1', 'M2', 'M3', 'P5', 'M6', 'M7'], 2),
    seqEntry('scale', 'Minor hexatonic scale', ['P1', 'm3', 'P4', 'P5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Bebop dominant scale', ['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'm7', 'M7'], 2),
    seqEntry('scale', 'Bebop major scale', ['P1', 'M2', 'M3', 'P4', 'P5', 'm6', 'M6', 'M7'], 2),
    seqEntry('scale', 'Bebop minor scale', ['P1', 'M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Bebop harmonic minor scale', ['P1', 'M2', 'm3', 'P4', 'P5', 'm6', 'M6', 'M7'], 2),
    seqEntry('scale', 'Blues composite scale', ['P1', 'M2', 'm3', 'M3', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Major Locrian', ['P1', 'M2', 'M3', 'P4', 'd5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Hungarian minor scale', ['P1', 'M2', 'm3', 'A4', 'P5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Romanian minor scale', ['P1', 'M2', 'm3', 'A4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Double harmonic scale', ['P1', 'm2', 'M3', 'P4', 'P5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Neapolitan minor scale', ['P1', 'm2', 'm3', 'P4', 'P5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Neapolitan major scale', ['P1', 'm2', 'm3', 'P4', 'P5', 'M6', 'M7'], 2),
    seqEntry('scale', 'Minor sixth pentatonic scale', ['P1', 'm3', 'P4', 'P5', 'M6'], 2),
    seqEntry('scale', 'Lydian pentatonic scale', ['P1', 'M2', 'M3', 'A4', 'M6'], 2),
    seqEntry('scale', 'Augmented scale', ['P1', 'm3', 'M3', 'P5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Tritone scale', ['P1', 'm2', 'M3', 'A4', 'P5', 'm7'], 2),
    seqEntry('scale', 'Prometheus scale', ['P1', 'M2', 'M3', 'A4', 'M6', 'M7'], 2),
    seqEntry('scale', 'Enigmatic scale', ['P1', 'm2', 'M3', 'A4', 'A5', 'M6', 'M7'], 2),
    seqEntry('scale', 'Persian scale', ['P1', 'm2', 'M3', 'P4', 'd5', 'm6', 'M7'], 2),
    seqEntry('scale', 'Dorian b2 mode', ['P1', 'm2', 'm3', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Dorian b5 mode', ['P1', 'M2', 'm3', 'P4', 'd5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Ionian #5 mode', ['P1', 'M2', 'M3', 'P4', 'A5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Lydian #2 mode', ['P1', 'A2', 'M3', 'A4', 'P5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Lydian augmented mode', ['P1', 'M2', 'M3', 'A4', 'A5', 'M6', 'M7'], 2),
    seqEntry('scale', 'Lydian augmented #2 mode', ['P1', 'A2', 'M3', 'A4', 'A5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Lydian b3 mode', ['P1', 'M2', 'm3', 'A4', 'P5', 'M6', 'M7'], 2),
    seqEntry('scale', 'Lydian b6', ['P1', 'M2', 'M3', 'A4', 'P5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Locrian natural 6 mode', ['P1', 'm2', 'm3', 'P4', 'd5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Locrian bb7 mode', ['P1', 'm2', 'm3', 'P4', 'd5', 'm6', 'M6'], 2),
    seqEntry('scale', 'Mixolydian b2 mode', ['P1', 'm2', 'M3', 'P4', 'P5', 'M6', 'm7'], 2),
    seqEntry('scale', 'Mixolydian b6 mode', ['P1', 'M2', 'M3', 'P4', 'P5', 'm6', 'm7'], 2),
    seqEntry('scale', 'Phrygian b4 mode', ['P1', 'm2', 'm3', 'M3', 'P5', 'm6', 'm7'], 2),

    seqEntry('scale', 'Egyptian scale', ['P1', 'M2', 'P4', 'P5', 'm7'], 3),
    seqEntry('scale', 'Hirajoshi scale', ['P1', 'M2', 'm3', 'P5', 'm6'], 3),
    seqEntry('scale', 'Kumoi scale', ['P1', 'M2', 'm3', 'P5', 'M6'], 3),
    seqEntry('scale', 'Yo scale', ['P1', 'M2', 'P4', 'P5', 'M6'], 3),
    seqEntry('scale', 'Insen scale', ['P1', 'm2', 'P4', 'P5', 'm7'], 3),
    seqEntry('scale', 'Iwato scale', ['P1', 'm2', 'P4', 'd5', 'm7'], 3),
    seqEntry('scale', 'Man gong scale', ['P1', 'm3', 'P4', 'm6', 'm7'], 3),
    seqEntry('scale', 'Pelog scale', ['P1', 'm2', 'm3', 'P5', 'm6'], 3),
    seqEntry('scale', 'Ake Bono scale', ['P1', 'm2', 'P4', 'P5', 'm6'], 3),
    seqEntry('scale', 'Ambassel scale', ['P1', 'm2', 'M3', 'P4', 'A5', 'M6', 'm7'], 3),
    seqEntry('scale', 'Shivaranjani', ['P1', 'M2', 'm3', 'P4', 'P5'], 3),
    seqEntry('scale', 'Algerian', ['P1', 'm2', 'M3', 'P4', 'd5', 'P5', 'm6', 'M7'], 3),
    seqEntry('scale', 'Eight-tone Spanish scale', ['P1', 'm2', 'M2', 'm3', 'P4', 'd5', 'P5', 'm6'], 3),
    seqEntry('scale', 'Marwa', ['P1', 'm2', 'M3', 'A4', 'M6', 'M7'], 3),
    seqEntry('scale', 'Purvi', ['P1', 'm2', 'M3', 'A4', 'P5', 'm6', 'M7'], 3),
    seqEntry('scale', 'Todi', ['P1', 'm2', 'm3', 'A4', 'P5', 'm6', 'M7'], 3),
    seqEntry('scale', 'Messiaen mode 3', ['P1', 'M2', 'm3', 'M3', 'A4', 'P5', 'm6', 'm7', 'M7'], 3),
    seqEntry('scale', 'Messiaen mode 4', ['P1', 'm2', 'M2', 'P4', 'd5', 'P5', 'm7', 'M7'], 3),
    seqEntry('scale', 'Messiaen mode 5', ['P1', 'm2', 'P4', 'd5', 'P5', 'M7'], 3),
    seqEntry('scale', 'Messiaen mode 6', ['P1', 'M2', 'M3', 'P4', 'd5', 'm6', 'M6', 'm7'], 3),
    seqEntry('scale', 'Messiaen mode 7', ['P1', 'm2', 'M2', 'm3', 'M3', 'A4', 'P5', 'm6', 'M6', 'm7'], 3)
];

const SEQUENCE_CATALOG = ARPEGGIOS.concat(SCALES);

// Local Fisher-Yates shuffle (this file must stay free of app.js dependencies)
function seqShuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

// --- Shape enumeration ---------------------------------------------------------

// All 2^(M-1) applicatures of the sequence, root-relative:
//   rows[i]  string row of note i (0 = root string, negative = higher-sounding string)
//   frets[i] fret offset from the root's fret (root note = fret 0 on row 0)
// Plus per-shape aggregates for O(1) placement checks:
//   minRow (= row of the last note = -string descents), relMin, relMax, width
function enumerateSequenceShapes(intervalNames) {
    const notes = intervalNames.map(name => INTERVALS[name]);
    notes.push(12); // the octave completes every shape
    const labels = intervalNames.slice();
    labels.push('P8');

    const total = notes.length;
    const shapes = [];
    for (let mask = 0; mask < (1 << (total - 1)); mask++) {
        const rows = [0];
        for (let i = 0; i < total - 1; i++) {
            rows.push(rows[i] - ((mask >> i) & 1));
        }
        const frets = [];
        let relMin = 0, relMax = 0, minRow = 0;
        for (let i = 0; i < total; i++) {
            const fret = notes[i] + STRING_SEMITONES * rows[i];
            frets.push(fret);
            if (fret < relMin) relMin = fret;
            if (fret > relMax) relMax = fret;
            if (rows[i] < minRow) minRow = rows[i];
        }
        shapes.push({
            rows: rows,
            frets: frets,
            labels: labels,
            minRow: minRow,
            relMin: relMin,
            relMax: relMax,
            width: relMax - relMin + 1
        });
    }
    // Narrowest fret spans first (fallback ordering for the UI)
    shapes.sort((a, b) => a.width - b.width);
    return shapes;
}

// No memoization: shapes are re-enumerated from the interval sequence every time
// they are needed (worst case ~1024 cheap masks), so what you see is always
// derived live from the catalog data.

// --- Pattern generation --------------------------------------------------------

// Sample one connected pattern uniformly at random from all chains that satisfy the
// given options. Returns { entry, notes, segments } or null when nothing fits.
//
// opts: { entry, minFret, maxFret, numStrings, enabledStrings (array of indices,
//         first root must be one of them), minSegments (1 or 2), spanMode:
//         'strict' (every string a shape touches must be enabled) | 'loose' (only
//         the first root string must be enabled) }
//
// A node (R, RF) is a segment root at string R (app indexing: 0 = highest string),
// fret RF. Shape s gives the edge to the next root (its octave note) at
// (R + minRow, RF + 12 + 5*minRow). Counting tables over this DAG:
//   h(node)  = number of continuations counting "stop here"     (>= 0 more segments)
//   g(node)  = number of continuations with at least one more segment
// Backward count-weighted sampling then makes every valid pattern equally likely.
function sampleSequencePattern(opts) {
    const entry = opts.entry;
    const shapes = enumerateSequenceShapes(entry.intervals);
    const minFret = opts.minFret;
    const maxFret = opts.maxFret;
    const numStrings = opts.numStrings;
    const minSegments = opts.minSegments || 1;
    const strictSpan = opts.spanMode !== 'loose';

    const enabled = [];
    for (let i = 0; i < numStrings; i++) enabled.push(false);
    (opts.enabledStrings || []).forEach(index => {
        if (index >= 0 && index < numStrings) enabled[index] = true;
    });

    function edgesFrom(R, RF) {
        const out = [];
        for (let i = 0; i < shapes.length; i++) {
            const shape = shapes[i];
            const topString = R + shape.minRow;
            if (topString < 0) continue;
            if (RF + shape.relMin < minFret || RF + shape.relMax > maxFret) continue;
            if (strictSpan) {
                let ok = true;
                for (let s = topString; s <= R; s++) {
                    if (!enabled[s]) { ok = false; break; }
                }
                if (!ok) continue;
            }
            out.push(i);
        }
        return out;
    }

    const hMemo = {};
    const gMemo = {};

    function nextRoot(R, RF, shape) {
        return { R: R + shape.minRow, RF: RF + 12 + STRING_SEMITONES * shape.minRow };
    }

    function h(R, RF) {
        const key = R + ':' + RF;
        if (hMemo[key] !== undefined) return hMemo[key];
        let total = 1; // stopping here is always one continuation
        const edges = edgesFrom(R, RF);
        for (let i = 0; i < edges.length; i++) {
            const next = nextRoot(R, RF, shapes[edges[i]]);
            total += h(next.R, next.RF);
        }
        hMemo[key] = total;
        return total;
    }

    function g(R, RF) {
        const key = R + ':' + RF;
        if (gMemo[key] !== undefined) return gMemo[key];
        let total = 0;
        const edges = edgesFrom(R, RF);
        for (let i = 0; i < edges.length; i++) {
            const next = nextRoot(R, RF, shapes[edges[i]]);
            total += h(next.R, next.RF);
        }
        gMemo[key] = total;
        return total;
    }

    function pickWeighted(candidates, weightOf) {
        let total = 0;
        for (let i = 0; i < candidates.length; i++) total += weightOf(candidates[i]);
        if (total <= 0) return null;
        let roll = Math.random() * total;
        for (let i = 0; i < candidates.length; i++) {
            roll -= weightOf(candidates[i]);
            if (roll <= 0) return candidates[i];
        }
        return candidates[candidates.length - 1];
    }

    // Start nodes: enabled root strings x fret window, weighted by the number of
    // patterns that still satisfy the minimum-segment requirement from there.
    const starts = [];
    for (let R = 0; R < numStrings; R++) {
        if (!enabled[R]) continue;
        for (let RF = minFret; RF <= maxFret; RF++) starts.push({ R: R, RF: RF });
    }
    function startWeight(node) {
        if (minSegments < 2) return g(node.R, node.RF);
        let total = 0;
        edgesFrom(node.R, node.RF).forEach(si => {
            const next = nextRoot(node.R, node.RF, shapes[si]);
            total += g(next.R, next.RF);
        });
        return total;
    }
    const start = pickWeighted(starts, startWeight);
    if (!start) return null;

    // Walk the chain. "Stop" only becomes an option once minSegments shapes are
    // chosen; until then (and for the very first edge under minSegments 2, which
    // must still allow one more segment) edges are weighted with g instead of h.
    const chosen = []; // shape indices, in chain order
    let node = start;

    while (true) {
        const edges = edgesFrom(node.R, node.RF);
        const mayStop = chosen.length >= minSegments;
        const requireFollowUp = chosen.length === 0 && minSegments >= 2;
        let continueWeight = 0;
        edges.forEach(si => {
            const next = nextRoot(node.R, node.RF, shapes[si]);
            continueWeight += requireFollowUp ? g(next.R, next.RF) : h(next.R, next.RF);
        });
        const stopWeight = mayStop ? 1 : 0;
        if (Math.random() * (stopWeight + continueWeight) < stopWeight) break;
        const picked = pickWeighted(edges, si => {
            const next = nextRoot(node.R, node.RF, shapes[si]);
            return requireFollowUp ? g(next.R, next.RF) : h(next.R, next.RF);
        });
        if (picked === null) break; // defensive; unreachable with the weights above
        chosen.push(picked);
        node = nextRoot(node.R, node.RF, shapes[picked]);
    }

    // Absolutize the chain; segment k+1's P1 duplicates segment k's P8
    let notes = [];
    let root = start;
    for (let k = 0; k < chosen.length; k++) {
        const shape = shapes[chosen[k]];
        const segmentNotes = [];
        for (let i = 0; i < shape.rows.length; i++) {
            segmentNotes.push({
                string: root.R + shape.rows[i],
                fret: root.RF + shape.frets[i],
                label: shape.labels[i],
                isRoot: shape.labels[i] === 'P1' || shape.labels[i] === 'P8'
            });
        }
        notes = notes.concat(k === 0 ? segmentNotes : segmentNotes.slice(1));
        root = { R: root.R + shape.minRow, RF: root.RF + 12 + STRING_SEMITONES * shape.minRow };
    }

    return { entry: entry, notes: notes, segments: chosen.length };
}

// Pattern generation with the fallback ladder used by the quiz:
// strict constraints and connected (>= 2 segments) first, then single-segment,
// then only the first root needs an enabled string. The user's fret window is
// never widened silently - if nothing fits, null is returned and the caller
// tells the user to widen the range or enable more strings.
function generateSequencePattern(entry, constraints) {
    const c = constraints;
    const attempts = [
        { minSegments: 2, spanMode: 'strict', minFret: c.minFret, maxFret: c.maxFret },
        { minSegments: 1, spanMode: 'strict', minFret: c.minFret, maxFret: c.maxFret },
        { minSegments: 1, spanMode: 'loose', minFret: c.minFret, maxFret: c.maxFret }
    ];
    for (let i = 0; i < attempts.length; i++) {
        const pattern = sampleSequencePattern({
            entry: entry,
            minFret: attempts[i].minFret,
            maxFret: attempts[i].maxFret,
            numStrings: c.numStrings,
            enabledStrings: c.enabledStrings,
            minSegments: attempts[i].minSegments,
            spanMode: attempts[i].spanMode
        });
        if (pattern) return pattern;
    }
    return null;
}

// --- Distractors ---------------------------------------------------------------

function semitoneSequence(entry) {
    return entry.intervals.map(name => INTERVALS[name]);
}

function sameSequence(a, b) {
    const sa = semitoneSequence(a);
    const sb = semitoneSequence(b);
    if (sa.length !== sb.length) return false;
    for (let i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return false;
    }
    return true;
}

function pitchClassSet(entry) {
    const seen = [];
    semitoneSequence(entry).forEach(semitone => {
        if (seen.indexOf(semitone) === -1) seen.push(semitone);
    });
    return seen.sort((a, b) => a - b);
}

function pcDistance(entryA, entryB) {
    const a = pitchClassSet(entryA);
    const b = pitchClassSet(entryB);
    let distance = 0;
    a.forEach(semitone => { if (b.indexOf(semitone) === -1) distance++; });
    b.forEach(semitone => { if (a.indexOf(semitone) === -1) distance++; });
    return distance;
}

// Four options: the correct name plus three misleading distractors drawn from the
// same group. Entries with the identical semitone sequence are excluded (they would
// render the exact same pattern and make the question unanswerable); near misses
// (rotations / one-note differences) are preferred.
function generateSequenceAnswerOptions(correctEntry, enabledEntries) {
    let pool = (enabledEntries || []).filter(e => e.group === correctEntry.group && e.id !== correctEntry.id);
    if (pool.length < 3) pool = SEQUENCE_CATALOG.filter(e => e.group === correctEntry.group && e.id !== correctEntry.id);
    if (pool.length < 3) pool = SEQUENCE_CATALOG.filter(e => e.id !== correctEntry.id);
    pool = pool.filter(e => !sameSequence(e, correctEntry));

    // Shuffle first so the pick within each distance band is random (stable sort)
    const scored = seqShuffle(pool)
        .map(e => ({ entry: e, distance: pcDistance(e, correctEntry) }))
        .sort((x, y) => x.distance - y.distance);

    const distractors = [];
    function takeFrom(minDistance, maxDistance, count) {
        for (let i = 0; i < scored.length && distractors.length < count; i++) {
            const d = scored[i].distance;
            if (d >= minDistance && d <= maxDistance && distractors.indexOf(scored[i]) === -1) {
                distractors.push(scored[i]);
            }
        }
    }
    takeFrom(0, 1, 2);      // the traps: rotations and one-note differences
    takeFrom(2, 3, 3);      // still recognisably related
    takeFrom(4, 99, 3);     // whatever is left

    return seqShuffle([correctEntry.name].concat(distractors.map(d => d.entry.name)));
}

// Node export for test_sequences.js (mirrors getTriadShape.js; browsers ignore this)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INTERVALS: INTERVALS,
        STRING_SEMITONES: STRING_SEMITONES,
        ROMAN_DEGREES: ROMAN_DEGREES,
        ARPEGGIOS: ARPEGGIOS,
        SCALES: SCALES,
        SEQUENCE_CATALOG: SEQUENCE_CATALOG,
        enumerateSequenceShapes: enumerateSequenceShapes,
        sampleSequencePattern: sampleSequencePattern,
        generateSequencePattern: generateSequencePattern,
        generateSequenceAnswerOptions: generateSequenceAnswerOptions,
        semitoneSequence: semitoneSequence,
        sameSequence: sameSequence,
        pitchClassSet: pitchClassSet,
        pcDistance: pcDistance
    };
}
