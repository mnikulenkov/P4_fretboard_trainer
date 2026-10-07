// Progression Lab model layer for the P4 Fretboard Trainer.
//
// Degree-based chord-progression input + stability-driven scale/arpeggio
// suggestions. Design reference: docs/progression-lab.md (grammar §4, stability
// atlas §5, catalogs §6, scoring §7, descriptions §8).
//
// Two layers are planned, mirroring handbook.js:
//   1. this DOM-free model layer (Node-testable via test_progression.js);
//   2. a DOM layer for the panel UI (Phase 2, appended below when built).
//
// Self-containment: this module deliberately carries its own quality/scale
// tables (with the stability atlas) instead of reading chords.js /
// sequences.js at runtime, so it can be required alone under Node. Catalog
// consistency with those modules is enforced by cross-checks in
// test_progression.js. Names are PROG_-prefixed because all app scripts share
// one global scope.
//
// Scoring philosophy: stability values are LOOKED UP from the static atlas
// below (researched values, docs §5) — never derived from interval arithmetic
// at runtime. Only the combination of looked-up values is computed.

// --- Grammar constants (§4) -------------------------------------------------

// Degrees are always counted in the MAJOR scale on the base root (Nashville
// practice), even for minor/modal progressions — this kills the classical
// minor-key VII/#vii ambiguity (docs §4.1).
const PROG_MAJOR_SCALE_OFFSETS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const PROG_ALT_VALUES = { '': 0, b: -1, bb: -2, '#': 1, '##': 2 };
const PROG_ALT_CHARS = { 0: '', '-1': 'b', '-2': 'bb', 1: '#', 2: '##' };

// Diatonic seventh-chord quality of each degree in the major scale: the default
// quality for a secondary-chord TARGET and for an omitted secondary numerator
// other than V (docs §4.3 rule 3).
const PROG_DIATONIC_SEVENTH = { I: 'maj7', II: 'm7', III: 'm7', IV: 'maj7', V: '7', VI: 'm7', VII: 'm7b5' };
const PROG_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Quality order for the autocomplete dropdown (§4.6): diatonic workhorses
// first, then triads, then extensions. The diatonic seventh of the numeral
// being typed is always suggested first.
const PROG_AC_QUALITY_ORDER = ['maj7', 'm7', '7', 'm7b5', 'dim7', 'maj', 'm', '6', 'm6',
    'sus4', '9', 'maj9', 'm9', '7b9', '7#9', '7#11', '7#5', '7b5', '13', 'm11',
    'm(maj7)', 'aug', 'dim', '11', '7b13', 'maj7#5', 'sus2'];

// Which chords.js CHORD_FAMILY hosts the book's voicings for each grammar
// quality (data-only coupling — nothing here requires chords.js at runtime).
const PROG_FAMILY_FOR_QUALITY = {
    'maj': 'major', 'm': 'minor', 'dim': 'diminished', 'aug': 'augmented',
    '6': 'sixth', 'm6': 'minorSixth', 'maj7': 'majorSeven', 'm7': 'minorSeven',
    '7': 'seven', 'm7b5': 'minorSevenFlatFive', 'dim7': 'diminishedSeven',
    'm(maj7)': 'minorMajorSeven', '9': 'ninth', 'm9': 'minorNinth',
    '13': 'thirteen', '7#5': 'sevenSharpFive', '7b5': 'sevenFlatFive',
    '7#9': 'sevenSharpNinth', '7b9': 'sevenFlatNinth', '7b13': 'sevenFlatThirteenth'
};

// Quality ids accepted by the grammar. Also the data source for the Phase-2
// autocomplete dropdown (numerals x qualities, docs §4.6) so suggestions can
// never drift from the parser.
const PROG_QUALITY_IDS = [
    'm(maj7)', 'maj7#5', 'm7b5', 'maj9', 'maj7', 'm11', 'dim7', '7b13', '7#11',
    '7b9', '7#9', '7b5', '7#5', 'm9', 'sus4', 'sus2', 'dim', 'aug', 'maj', 'm7',
    '13', '11', '9', '7', '6', 'm'
];

// Degree-name -> semitones above the root. Several names share a semitone:
// the spelling carries the voice-leading intent (§5.2).
const PROG_DEG_SEMI = {
    'P1': 0, 'b9': 1, 'b2': 1, 'M2': 2, 'M9': 2, '#9': 3, 'm3': 3, 'M3': 4,
    'P4': 5, 'P11': 5, 'b5': 6, '#11': 6, 'd5': 6, 'P5': 7, 'b13': 8, 'A5': 8,
    'M6': 9, 'd7': 9, 'A6': 10, 'm7': 10, 'M7': 11
};

// --- Chord-quality stability atlas (§5.2) ------------------------------------
//
// `stability` is each tone's rest-stability (0..1) — the researched synthesis
// of Parncutt's root-support weights, Lerdahl's pitch-space levels and the
// K-K profiles (docs §5.2). Hand-curated data; do not compute at runtime.
// Semitone sets match chords.js CHORD_FAMILIES wherever both define the same
// sonority (cross-checked in test_progression.js).

const PROG_QUALITIES = {
    'maj':     { symbol: '',        degrees: ['P1', 'M3', 'P5'],              stability: [1.00, 0.70, 0.80] },
    'm':       { symbol: 'm',       degrees: ['P1', 'm3', 'P5'],              stability: [1.00, 0.70, 0.80] },
    'dim':     { symbol: 'dim',     degrees: ['P1', 'm3', 'd5'],              stability: [1.00, 0.70, 0.50] },
    'aug':     { symbol: 'aug',     degrees: ['P1', 'M3', 'A5'],              stability: [1.00, 0.70, 0.45] },
    'sus4':    { symbol: 'sus4',    degrees: ['P1', 'P4', 'P5'],              stability: [1.00, 0.55, 0.80] },
    'sus2':    { symbol: 'sus2',    degrees: ['P1', 'M2', 'P5'],              stability: [1.00, 0.35, 0.80] },
    '6':       { symbol: '6',       degrees: ['P1', 'M3', 'P5', 'M6'],        stability: [1.00, 0.70, 0.80, 0.55] },
    'm6':      { symbol: 'm6',      degrees: ['P1', 'm3', 'P5', 'M6'],        stability: [1.00, 0.70, 0.80, 0.55] },
    'maj7':    { symbol: 'maj7',    degrees: ['P1', 'M3', 'P5', 'M7'],        stability: [1.00, 0.70, 0.80, 0.45] },
    'm7':      { symbol: 'm7',      degrees: ['P1', 'm3', 'P5', 'm7'],        stability: [1.00, 0.70, 0.80, 0.45] },
    '7':       { symbol: '7',       degrees: ['P1', 'M3', 'P5', 'm7'],        stability: [1.00, 0.70, 0.80, 0.45] },
    'm7b5':    { symbol: 'm7b5',    degrees: ['P1', 'm3', 'd5', 'm7'],        stability: [1.00, 0.70, 0.45, 0.45] },
    'dim7':    { symbol: 'dim7',    degrees: ['P1', 'm3', 'd5', 'd7'],        stability: [1.00, 0.65, 0.55, 0.45] },
    'm(maj7)': { symbol: 'm(maj7)', degrees: ['P1', 'm3', 'P5', 'M7'],        stability: [1.00, 0.70, 0.80, 0.45] },
    'maj7#5':  { symbol: 'maj7#5',  degrees: ['P1', 'M3', 'A5', 'M7'],        stability: [1.00, 0.70, 0.40, 0.45] },
    '7#5':     { symbol: '7#5',     degrees: ['P1', 'M3', 'A5', 'm7'],        stability: [1.00, 0.70, 0.40, 0.45] },
    '7b13':    { symbol: '7b13',    degrees: ['P1', 'M3', 'P5', 'm7', 'b13'], stability: [1.00, 0.70, 0.80, 0.45, 0.30] },
    '7b5':     { symbol: '7b5',     degrees: ['P1', 'M3', 'b5', 'm7'],        stability: [1.00, 0.70, 0.40, 0.45] },
    'maj9':    { symbol: 'maj9',    degrees: ['P1', 'M3', 'P5', 'M7', 'M9'],  stability: [1.00, 0.70, 0.80, 0.45, 0.35] },
    'm9':      { symbol: 'm9',      degrees: ['P1', 'm3', 'P5', 'm7', 'M9'],  stability: [1.00, 0.70, 0.80, 0.45, 0.35] },
    '9':       { symbol: '9',       degrees: ['P1', 'M3', 'P5', 'm7', 'M9'],  stability: [1.00, 0.70, 0.80, 0.45, 0.35] },
    'm11':     { symbol: 'm11',     degrees: ['P1', 'm3', 'P5', 'm7', 'M9', 'P11'], stability: [1.00, 0.70, 0.80, 0.45, 0.35, 0.25] },
    '11':      { symbol: '11',      degrees: ['P1', 'M9', 'P11', 'P5', 'm7'], stability: [1.00, 0.35, 0.25, 0.80, 0.45] },
    '13':      { symbol: '13',      degrees: ['P1', 'M3', 'P5', 'M6', 'm7', 'M9'], stability: [1.00, 0.70, 0.80, 0.30, 0.45, 0.35] },
    '7b9':     { symbol: '7b9',     degrees: ['P1', 'M3', 'P5', 'm7', 'b9'],  stability: [1.00, 0.70, 0.80, 0.45, 0.25] },
    '7#9':     { symbol: '7#9',     degrees: ['P1', 'M3', 'P5', 'm7', '#9'],  stability: [1.00, 0.70, 0.80, 0.45, 0.30] },
    '7#11':    { symbol: '7#11',    degrees: ['P1', 'M3', 'P5', 'm7', '#11'], stability: [1.00, 0.70, 0.80, 0.45, 0.35] }
};

// --- Scale stability atlas (§5.3) --------------------------------------------
//
// `degrees` are semitones above the scale root; `stability` the per-degree
// rest-stability (0..1) per docs §5.3: K-K probe-tone profiles verbatim
// (normalized to the tonic) for ionian/aeolian, documented curatorial values
// for unmeasured modes (Tan & Temperley familiarity, corpus rarity of b2/#4).
// `passing` lists degrees treated as passing tones — real in the line but
// exempt from the avoid-note penalty at 0.25x.

const PROG_SCALES = [
    { id: 'ionian',          name: 'major (ionian)',    family: 'heptatonic', tier: 1, tension: 0.15, degrees: [0, 2, 4, 5, 7, 9, 11],    stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45] },
    { id: 'dorian',          name: 'dorian',            family: 'heptatonic', tier: 1, tension: 0.25, degrees: [0, 2, 3, 5, 7, 9, 10],    stability: [1.00, 0.55, 0.70, 0.64, 0.82, 0.58, 0.45] },
    { id: 'phrygian',        name: 'phrygian',          family: 'heptatonic', tier: 2, tension: 0.55, degrees: [0, 1, 3, 5, 7, 8, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.82, 0.53, 0.45] },
    { id: 'lydian',          name: 'lydian',            family: 'heptatonic', tier: 1, tension: 0.35, degrees: [0, 2, 4, 6, 7, 9, 11],    stability: [1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45] },
    { id: 'mixolydian',      name: 'mixolydian',        family: 'heptatonic', tier: 1, tension: 0.25, degrees: [0, 2, 4, 5, 7, 9, 10],    stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45] },
    { id: 'aeolian',         name: 'natural minor (aeolian)', family: 'heptatonic', tier: 1, tension: 0.30, degrees: [0, 2, 3, 5, 7, 8, 10],    stability: [1.00, 0.56, 0.85, 0.56, 0.75, 0.53, 0.50] },
    { id: 'locrian',         name: 'locrian',           family: 'heptatonic', tier: 2, tension: 0.75, degrees: [0, 1, 3, 5, 6, 8, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.40, 0.58, 0.45] },
    { id: 'harmonicMinor',   name: 'harmonic minor',    family: 'heptatonic', tier: 2, tension: 0.60, degrees: [0, 2, 3, 5, 7, 8, 11],    stability: [1.00, 0.55, 0.85, 0.56, 0.75, 0.53, 0.55] },
    { id: 'melodicMinor',    name: 'melodic minor',     family: 'heptatonic', tier: 2, tension: 0.45, degrees: [0, 2, 3, 5, 7, 9, 11],    stability: [1.00, 0.55, 0.70, 0.60, 0.80, 0.58, 0.50] },
    { id: 'lydianDominant',  name: 'lydian dominant',   family: 'heptatonic', tier: 1, tension: 0.45, degrees: [0, 2, 4, 6, 7, 9, 10],    stability: [1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45] },
    { id: 'phrygianDominant',name: 'phrygian dominant', family: 'heptatonic', tier: 2, tension: 0.70, degrees: [0, 1, 4, 5, 7, 8, 10],    stability: [1.00, 0.40, 0.60, 0.64, 0.80, 0.53, 0.45] },
    { id: 'locrianNat2',     name: 'locrian ♮2',        family: 'heptatonic', tier: 3, tension: 0.70, degrees: [0, 2, 3, 5, 6, 8, 10],    stability: [1.00, 0.55, 0.70, 0.64, 0.40, 0.58, 0.45] },
    { id: 'dorianFlat2',     name: 'dorian ♭2',         family: 'heptatonic', tier: 3, tension: 0.60, degrees: [0, 1, 3, 5, 7, 9, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.82, 0.58, 0.45] },
    { id: 'lydianAugmented', name: 'lydian augmented',  family: 'heptatonic', tier: 3, tension: 0.55, degrees: [0, 2, 4, 6, 8, 9, 11],    stability: [1.00, 0.55, 0.69, 0.40, 0.45, 0.58, 0.45] },
    { id: 'altered',         name: 'altered',           family: 'heptatonic', tier: 2, tension: 0.85, degrees: [0, 1, 3, 4, 6, 8, 10],    stability: [1.00, 0.40, 0.35, 0.45, 0.40, 0.50, 0.50] },
    { id: 'majorPentatonic', name: 'major pentatonic',  family: 'pentatonic', tier: 1, tension: 0.10, degrees: [0, 2, 4, 7, 9],           stability: [1.00, 0.55, 0.69, 0.82, 0.58] },
    { id: 'minorPentatonic', name: 'minor pentatonic',  family: 'pentatonic', tier: 1, tension: 0.20, degrees: [0, 3, 5, 7, 10],          stability: [1.00, 0.70, 0.64, 0.82, 0.45] },
    { id: 'blues',           name: 'blues',             family: 'pentatonic', tier: 1, tension: 0.40, degrees: [0, 3, 5, 6, 7, 10],       stability: [1.00, 0.70, 0.64, 0.30, 0.82, 0.45], passing: [6] },
    { id: 'bebopDominant',   name: 'bebop dominant',    family: 'heptatonic', tier: 3, tension: 0.35, degrees: [0, 2, 4, 5, 7, 9, 10, 11], stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45, 0.30], passing: [11] },
    { id: 'wholeTone',       name: 'whole tone',        family: 'hexatonic',  tier: 2, tension: 0.70, degrees: [0, 2, 4, 6, 8, 10],       stability: [1.00, 0.50, 0.55, 0.50, 0.55, 0.50] },
    { id: 'diminishedHW',    name: 'diminished H–W',    family: 'octatonic',  tier: 2, tension: 0.65, degrees: [0, 1, 3, 4, 6, 7, 9, 10], stability: [1.00, 0.45, 0.45, 0.50, 0.45, 0.50, 0.45, 0.50] },
    { id: 'diminishedWH',    name: 'diminished W–H',    family: 'octatonic',  tier: 2, tension: 0.65, degrees: [0, 2, 3, 5, 6, 8, 9, 11], stability: [1.00, 0.50, 0.45, 0.50, 0.45, 0.50, 0.45, 0.50] }
];

// Arpeggio candidates are generated from the quality atlas (the arpeggio IS
// the chord's own stable tones), so they share the researched stabilities.
const PROG_ARP_QUALITIES = ['maj', 'm', 'dim', 'aug', 'sus4', 'maj7', 'm7', '7',
    'm7b5', 'dim7', 'm(maj7)', '6', 'm6', 'maj9', 'm9', '9'];

// Classical alias tokens with fixed pitch content (accepted, not advertised;
// docs §4.3 rule 4). Offsets are semitones above the base root.
const PROG_SPECIAL_TOKENS = {
    'N6':   { offset: 1, degrees: ['P1', 'M3'],               stability: [1.00, 0.70],              label: 'Neapolitan sixth (♭II)' },
    'N':    { offset: 1, degrees: ['P1', 'M3'],               stability: [1.00, 0.70],              label: 'Neapolitan (♭II)' },
    'It6':  { offset: 8, degrees: ['P1', 'M3', 'A6'],         stability: [1.00, 0.70, 0.30],        label: 'Italian sixth' },
    'Ger65': { offset: 8, degrees: ['P1', 'M3', 'P5', 'A6'],  stability: [1.00, 0.70, 0.80, 0.30],  label: 'German sixth' },
    'Fr43': { offset: 2, degrees: ['P1', 'm3', 'd5', 'M7'],   stability: [1.00, 0.70, 0.55, 0.30],  label: 'French sixth' }
};

// Display-only provenance labels keyed `${degreeOffsetSemitones}:${qualityId}`
// (docs §4.4). Metadata only — parsing and realization never depend on this.
const PROG_PROVENANCE = {
    '0:maj': 'tonic', '0:maj7': 'tonic maj7', '0:m7': 'tonic minor',
    '2:m7': 'supertonic (ii)', '4:m7': 'mediant (iii)',
    '5:maj7': 'subdominant (IV)', '5:7': 'blues IV7 — borrowed (Mixolydian)',
    '5:m7': 'minor iv — borrowed (Aeolian)', '5:m6': 'ivm6 — borrowed (melodic minor)',
    '7:7': 'dominant (V)', '7:7b9': 'altered dominant — harmonic-minor family',
    '7:m': 'minor v — borrowed (Aeolian/Dorian)',
    '9:m7': 'relative minor (vi)', '11:m7b5': 'leading-tone half-diminished',
    '10:maj7': 'backdoor — borrowed (Mixolydian/Aeolian)', '10:7': 'borrowed ♭VII7 (Mixolydian)',
    '1:7': 'tritone substitute of V (subV7)', '1:maj7': 'Neapolitan — borrowed (Phrygian)',
    '3:maj7': 'borrowed ♭III (Aeolian/Dorian)', '3:maj7#5': 'borrowed ♭IIImaj7♯5 (melodic minor)',
    '8:maj7': 'borrowed ♭VI (Aeolian)',
    '6:m7b5': '♯IVm7♭5 — passing half-diminished', '6:dim7': '♯IVdim7 — borrowed (harmonic minor)'
};

// Display labels (§8): scale-degree shorthand and chord-degree shorthand.
const PROG_SCALE_DEGREE_LABELS = { 0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♯4', 7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7' };
const PROG_DEGREE_NAME_LABELS = {
    'P1': '1', 'b9': '♭9', 'b2': '♭2', 'M2': '2', 'M9': '9', '#9': '♯9', 'm3': '♭3',
    'M3': '3', 'P4': '4', 'P11': '11', 'b5': '♭5', '#11': '♯11', 'd5': '♭5', 'P5': '5',
    'b13': '♭13', 'A5': '♯5', 'M6': '6', 'd7': '♭♭7', 'A6': '♯6', 'm7': '♭7', 'M7': 'maj7'
};

// v1 note spelling: one fixed mixed table (docs §11 — accidental preference is
// a display concern; pitch classes are what the model guarantees).
const PROG_NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function progNoteName(pc) {
    return PROG_NOTE_NAMES[((pc % 12) + 12) % 12];
}

// --- Parser (§4.2–§4.5) -------------------------------------------------------

// Unicode/alias folding (§4.3 rule 4): accept the ways people actually type.
function progFoldAliases(token) {
    return String(token)
        .replace(/♭/g, 'b').replace(/♯/g, '#')
        .replace(/Δ7/g, 'maj7').replace(/Δ/g, 'maj7')
        .replace(/°7/g, 'dim7').replace(/º7/g, 'dim7').replace(/°/g, 'dim')
        .replace(/ø7/g, 'm7b5').replace(/ø/g, 'm7b5')
        .replace(/min(?![a-z])/g, 'm')
        .replace(/o7$/, 'dim7')
        .replace(/-/g, 'm');
}

// Parse one degree token (after alias folding). Numeral order in the regex is
// longest-first so "iv" is not read as "I" + quality "v".
// Returns { ok: true, chord: {alt, numeral, qualityId, secondary} } |
// { ok: false, error }.
function progParseSingle(str) {
    const m = /^([b#]{1,2})?(vii|iii|vi|iv|ii|i|v)(.*)$/i.exec(String(str));
    if (!m) return { ok: false, error: 'expected [b/#] numeral [quality]' };
    const alt = PROG_ALT_VALUES[(m[1] || '').toLowerCase()];
    const numeral = m[2].toUpperCase();
    const qualityStr = m[3];
    if (qualityStr !== '' && !PROG_QUALITIES.hasOwnProperty(qualityStr)) {
        return { ok: false, error: 'unknown quality "' + qualityStr + '"' };
    }
    return {
        ok: true,
        chord: { alt: alt, numeral: numeral, qualityId: qualityStr || null, secondary: null }
    };
}

function progParseChordToken(token) {
    if (PROG_SPECIAL_TOKENS.hasOwnProperty(token)) {
        return { ok: true, special: PROG_SPECIAL_TOKENS[token], source: token };
    }
    const parts = progFoldAliases(token).split('/');
    if (parts.length > 2) return { ok: false, error: 'only one "/" (secondary) level' };
    const head = progParseSingle(parts[0]);
    if (!head.ok) return head;
    if (parts.length === 2) {
        const target = progParseSingle(parts[1]);
        if (!target.ok) return target;
        head.chord.secondary = target.chord;
    }
    head.source = token;
    return head;
}

// Tokenize a progression (§4.5): chords, '|' bar lines (display-only), '.'
// repeats (expanded against the previous chord, duration included), and error
// tokens that do not abort the line. A trailing "*N" sets the chord's length
// in bars (fractional allowed — the transport schedules in 8th notes); an
// unset duration falls back to the transport's bars-per-chord setting.
function progParseProgression(text) {
    const expanded = [];
    String(text).split(/\s+/).filter(Boolean).forEach(raw => {
        if (raw === '|') { expanded.push({ type: 'bar', source: raw }); return; }
        if (raw === '.') {
            const prev = expanded.length ? expanded[expanded.length - 1] : null;
            if (prev && (prev.type === 'chord' || prev.type === 'special')) {
                expanded.push(Object.assign({}, prev, { source: '.' }));
            } else {
                expanded.push({ type: 'error', source: raw, error: '"." has no previous chord' });
            }
            return;
        }
        let token = raw, bars = null;
        const dur = /^(.+)\*(\d+(?:\.\d+)?|\.\d+)$/.exec(raw);
        if (dur) {
            token = dur[1];
            bars = parseFloat(dur[2]);
            if (!isFinite(bars) || bars <= 0 || bars > 64) {
                expanded.push({ type: 'error', source: raw, error: 'bad length "*' + dur[2] + '" — use a positive number of bars' });
                return;
            }
        }
        const parsed = progParseChordToken(token);
        if (parsed.ok) expanded.push({ type: parsed.special ? 'special' : 'chord', source: raw, parsed: parsed, bars: bars });
        else expanded.push({ type: 'error', source: raw, error: parsed.error });
    });
    return expanded;
}

// --- Realization (§4.3) -------------------------------------------------------

// Default quality by syntactic role: an omitted secondary numerator is a
// dominant (V) or the degree's diatonic seventh; an omitted target quality is
// the degree's diatonic seventh; a plain chord with no suffix is a major triad.
function progQualityFor(chord, role) {
    if (chord.qualityId) return chord.qualityId;
    if (role === 'numerator') return chord.numeral === 'V' ? '7' : PROG_DIATONIC_SEVENTH[chord.numeral];
    if (role === 'target') return PROG_DIATONIC_SEVENTH[chord.numeral];
    return 'maj';
}

function progCanonicalLabel(chord, qualityId) {
    let label = PROG_ALT_CHARS[chord.alt] + chord.numeral + PROG_QUALITIES[qualityId].symbol;
    if (chord.secondary) {
        label += '/' + PROG_ALT_CHARS[chord.secondary.alt] + chord.secondary.numeral;
    }
    return label;
}

function progProvenanceFor(chord, offset, qualityId, target) {
    if (chord.secondary) {
        const tLabel = PROG_ALT_CHARS[chord.secondary.alt] + chord.secondary.numeral;
        if (chord.numeral === 'V') return 'secondary dominant of ' + tLabel;
        if (chord.numeral === 'VII') return 'secondary leading-tone chord of ' + tLabel;
        return 'applied ' + chord.numeral + ' of ' + tLabel;
    }
    const key = String(offset) + ':' + qualityId;
    return PROG_PROVENANCE.hasOwnProperty(key) ? PROG_PROVENANCE[key] : '';
}

// Realize a parsed chord against the base root. Degrees count in the major
// scale on the base root; a secondary numerator counts from its TARGET's root
// (music21 semantics, §4.3 rule 3). `role` picks the default-quality rule for
// chords whose quality suffix was omitted (docs §4.3 rule 3).
// Returns absolute pitch-class data.
function progRealizeChord(parsed, basePc, role) {
    if (parsed.special) {
        const spec = parsed.special;
        return {
            degreeLabel: parsed.source,
            rootPc: (basePc + spec.offset) % 12,
            qualityId: null,
            tones: spec.degrees.map((d, i) => ({
                pc: (basePc + spec.offset + PROG_DEG_SEMI[d]) % 12,
                deg: PROG_DEG_SEMI[d], degreeName: d, stability: spec.stability[i]
            })),
            provenance: spec.label,
            secondaryTarget: null,
            source: parsed.source
        };
    }
    const chord = parsed.chord;
    const offset = PROG_MAJOR_SCALE_OFFSETS[chord.numeral] + chord.alt;
    let rootPc, target = null, qualityId;
    if (chord.secondary) {
        target = progRealizeChord({ chord: chord.secondary }, basePc, 'target');
        rootPc = (target.rootPc + offset) % 12;
        qualityId = progQualityFor(chord, 'numerator');
    } else {
        rootPc = (basePc + offset) % 12;
        qualityId = progQualityFor(chord, role || 'plain');
    }
    const q = PROG_QUALITIES[qualityId];
    return {
        degreeLabel: progCanonicalLabel(chord, qualityId),
        rootPc: rootPc,
        qualityId: qualityId,
        tones: q.degrees.map((d, i) => ({
            pc: (rootPc + PROG_DEG_SEMI[d]) % 12,
            deg: PROG_DEG_SEMI[d], degreeName: d, stability: q.stability[i]
        })),
        provenance: progProvenanceFor(chord, offset, qualityId, target),
        secondaryTarget: target,
        source: parsed.source
    };
}

// Realize a full progression: drops bar tokens, links each chord to its
// successor (wrapping — loops make the last chord resolve into the first).
function progRealizeProgression(tokens, basePc) {
    const chords = tokens
        .filter(t => t.type === 'chord' || t.type === 'special')
        .map(t => {
            const chord = progRealizeChord(t.parsed, basePc);
            chord.bars = t.bars != null ? t.bars : null; // explicit length, *N (§4.5)
            return chord;
        });
    chords.forEach((c, i) => {
        c.index = i;
        c.next = chords.length > 1 ? chords[(i + 1) % chords.length] : null;
    });
    return chords;
}

// --- Scoring (§7) -------------------------------------------------------------

const PROG_WEIGHTS = { resolve: 0.6, penalty: 0.8, flow: 0.6 };

function progPcDist(a, b) {
    const d = Math.abs(a - b) % 12;
    return Math.min(d, 12 - d);
}

// Semitone proximity: common tone and half-step weigh 1.0, whole step 0.55
// (§7.2; Lerdahl's attraction model — target stability x source instability x
// closeness).
function progProx(d) {
    return d === 0 ? 1.0 : (d === 1 ? 1.0 : (d === 2 ? 0.55 : 0));
}

// Candidate pool for one chord (§6): every atlas scale rooted on the chord
// root plus the arpeggio family. Tones carry {pc, deg, stability, passing}.
function progBuildCandidates(chord) {
    const out = PROG_SCALES.map(s => ({
        id: s.id,
        name: s.name,
        family: s.family,
        tier: s.tier,
        noteCount: s.degrees.length,
        tones: s.degrees.map((d, i) => ({
            pc: (chord.rootPc + d) % 12,
            deg: d,
            degreeName: null,
            stability: s.stability[i],
            passing: (s.passing || []).indexOf(d) !== -1
        }))
    }));
    PROG_ARP_QUALITIES.forEach(qid => {
        const q = PROG_QUALITIES[qid];
        out.push({
            id: 'arp-' + qid,
            name: (q.symbol || 'major') + ' arpeggio',
            family: 'arpeggio',
            tier: 1,
            noteCount: q.degrees.length,
            tones: q.degrees.map((d, i) => ({
                pc: (chord.rootPc + PROG_DEG_SEMI[d]) % 12,
                deg: PROG_DEG_SEMI[d],
                degreeName: d,
                stability: q.stability[i],
                passing: false
            }))
        });
    });
    return out;
}

// Resolution kernel (§7.2; §16.1): tones of `from` resolving by step into the
// stable tones of `target`. `target` is anything with a `tones` array whose
// entries carry {pc, stability} — the next chord, or the next plan segment's
// scale (scale→scale transitions are the same math; T(p) stays anchored to the
// sounding chord, whose tone map is `chordTones`). Returns {res, resolvers};
// target tones may carry degreeName (chords) or deg (scales) for descriptions.
function progResolution(fromTones, chordTones, target) {
    const resolvers = [];
    let num = 0, den = 0;
    if (target) {
        fromTones.forEach(ct => {
            const T = chordTones.hasOwnProperty(ct.pc) ? 0.2 : 1.0;
            den += T;
            let best = null;
            target.tones.forEach(nt => {
                const d = progPcDist(ct.pc, nt.pc);
                const p = progProx(d);
                if (p > 0) {
                    const value = p * nt.stability;
                    if (!best || value > best.value) {
                        best = {
                            value: value, toPc: nt.pc, toDegreeName: nt.degreeName || null,
                            toDeg: nt.deg, dist: d
                        };
                    }
                }
            });
            if (best) {
                num += T * best.value;
                resolvers.push({
                    pc: ct.pc, deg: ct.deg, T: T, value: T * best.value,
                    toPc: best.toPc, toDegreeName: best.toDegreeName, toDeg: best.toDeg, dist: best.dist
                });
            }
        });
    }
    return { res: den > 0 ? num / den : 0, resolvers: resolvers };
}

// Score one candidate against a chord and its successor (§7.1–§7.3).
// Returns {fit, res, pen, score, overlap, resolvers, avoids} — the breakdown
// arrays double as description data (§8).
function progScoreCandidate(candidate, chord, next, weights) {
    weights = weights || PROG_WEIGHTS;
    const chordTones = {};
    let mass = 0;
    chord.tones.forEach(t => { chordTones[t.pc] = t; mass += t.stability; });

    // Fit — weighted overlap of stable tones, both stabilities multiplied,
    // normalized by the chord's total stability mass.
    let fitSum = 0;
    const overlap = chord.tones.map(t => {
        const sTone = candidate.tones.find(c => c.pc === t.pc) || null;
        const contrib = sTone ? sTone.stability * t.stability : 0;
        fitSum += contrib;
        return {
            pc: t.pc,
            degreeName: t.degreeName,
            present: !!sTone,
            scaleDegree: sTone ? PROG_SCALE_DEGREE_LABELS[sTone.deg] : null,
            contribution: contrib
        };
    });
    const fit = mass > 0 ? fitSum / mass : 0;

    // Resolution — scale tones resolving by step into the next chord's stable
    // tones; common tones included at prox 1. T(p): a non-chord tone wants a
    // destination (1.0); a chord tone may still connect (0.2). The kernel is
    // shared with plan-segment transitions (§16.1).
    const flow = progResolution(candidate.tones, chordTones, next);
    const res = flow.res;
    const resolvers = flow.resolvers;

    // Avoid-note penalty — a scale tone a semitone ABOVE a chord tone (avoid
    // note) or a semitone BELOW the chord root (♭9 over the root); passing
    // tones pay 0.25x.
    const avoids = [];
    let penSum = 0;
    candidate.tones.forEach(ct => {
        if (chordTones.hasOwnProperty(ct.pc)) return;
        const factor = ct.passing ? 0.25 : 1;
        chord.tones.forEach(t => {
            if ((ct.pc - t.pc + 12) % 12 === 1) {
                penSum += factor * t.stability;
                avoids.push({ pc: ct.pc, overPc: t.pc, kind: 'avoid', overName: t.degreeName });
            }
        });
        if ((chord.rootPc - ct.pc + 12) % 12 === 1) {
            penSum += factor * 1.0;
            avoids.push({ pc: ct.pc, overPc: chord.rootPc, kind: 'b9-over-root', overName: 'P1' });
        }
    });
    const pen = mass > 0 ? penSum / mass : 0;

    return {
        fit: fit, res: res, pen: pen,
        score: fit + weights.resolve * res - weights.penalty * pen,
        overlap: overlap, resolvers: resolvers, avoids: avoids
    };
}

// Rank all candidates for one chord in context (§7.4): sort by score, then
// note economy, catalog tier, name; dedupe by pitch-class set (§6). The
// family field lets the UI group arpeggio / pentatonic / heptatonic.
function progSuggestForChord(chord, weights) {
    const seen = {};
    const out = [];
    progBuildCandidates(chord).forEach(cand => {
        const key = cand.tones.map(t => t.pc).sort((a, b) => a - b).join(',');
        if (seen.hasOwnProperty(key)) return;
        seen[key] = true;
        out.push(Object.assign({ candidate: cand }, progScoreCandidate(cand, chord, chord.next, weights)));
    });
    out.sort((a, b) =>
        (b.score - a.score) ||
        (a.candidate.noteCount - b.candidate.noteCount) ||
        (a.candidate.tier - b.candidate.tier) ||
        (a.candidate.id < b.candidate.id ? -1 : 1));
    out.forEach((r, i) => { r.rank = i + 1; });
    return out;
}

// --- Scale plans within a chord (§16) ------------------------------------------
//
// A plan partitions ONE chord's span into ordered scale segments with
// per-boundary evaluation toggles. The chord's total length stays owned by the
// grammar (*N / bars-per-chord); segments only partition it. No plan, or a
// single-segment plan, is exactly the v2.0 single-pick behavior.

// Stability-weighted pitch-class distance between two tone sets (§16.1):
// symmetric-difference mass over total mass — 0 for identical sets, 1 for
// disjoint ones. Combination of looked-up stabilities only, same class of
// set math as the §6 dedupe key.
function progScaleDistance(aTones, bTones) {
    const aByPc = {}, bByPc = {};
    let diff = 0, total = 0;
    aTones.forEach(t => { aByPc[t.pc] = t.stability; total += t.stability; });
    bTones.forEach(t => { bByPc[t.pc] = t.stability; total += t.stability; });
    Object.keys(aByPc).forEach(pc => { if (!bByPc.hasOwnProperty(pc)) diff += aByPc[pc]; });
    Object.keys(bByPc).forEach(pc => { if (!aByPc.hasOwnProperty(pc)) diff += bByPc[pc]; });
    return total > 0 ? diff / total : 0;
}

// Candidate pool for one chord keyed by id (ids are unique across
// progBuildCandidates: scale ids plus arp-<quality> ids).
function progCandidatePool(chord) {
    const pool = {};
    progBuildCandidates(chord).forEach(c => { pool[c.id] = c; });
    return pool;
}

// Realize a plan against a chord's slot budget (bars × slotsPerBar — 8 slots
// per bar = straight eighths, the §9.3 divisions scale it).
// plan: {segments: [{id, bars}], links: [bool...]} — links[i] gates the
// boundary segments[i] -> segments[i+1]; bars null on the LAST segment means
// "absorb the remainder" (null elsewhere is treated as 1 bar). Last-absorbs
// clamp (§16.2): overflow truncates tail segments, a shrinking budget drops
// them, a growing one feeds the last; kept segments are at least half a bar;
// unknown scale ids drop their segment. Returns
// {segments: [{cand, bars, startSlot, slots}], links} or null when nothing
// valid remains.
function progRealizePlan(chord, plan, totalSlots, opts) {
    opts = opts || {};
    const spb = opts.slotsPerBar || 8;
    const halfBar = Math.round(spb / 2);
    if (!plan || !plan.segments || !plan.segments.length) return null;
    const pool = progCandidatePool(chord);
    const wanted = plan.segments.filter(s => s && pool.hasOwnProperty(s.id));
    if (!wanted.length) return null;
    const out = [];
    let cursor = 0;
    wanted.forEach((seg, i) => {
        const isLast = i === wanted.length - 1;
        let slots;
        if (isLast) {
            slots = totalSlots - cursor; // absorb the remainder
        } else {
            const bars = seg.bars == null ? 1 : seg.bars; // null is last-only; 1 bar if it appears mid-plan
            slots = Math.min(Math.max(halfBar, Math.round(bars * spb)), totalSlots - cursor);
        }
        if (slots <= 0) return; // budget exhausted — tail truncates
        if (!isLast && seg.bars != null && slots < halfBar && out.length) {
            out[out.length - 1].slots += slots; // runt segment merges left
            return;
        }
        out.push({ cand: pool[seg.id], bars: seg.bars, startSlot: cursor, slots: slots });
        cursor += slots;
    });
    if (!out.length) return null;
    return { segments: out, links: plan.links || [] };
}

// Rank candidates for plan slot k in context (§16.3). `segs` is a realized
// plan (progRealizePlan output). Score = fit + wF*resIn + wOut*resOut - wP*pen
// — internal boundaries (into the next segment) weigh wF, the chord-exit
// boundary weighs wR (v2.0 semantics); links gate the internal terms.
// opts.exitTarget overrides the exit target ({tones: [...]} — e.g. the next
// chord's first plan segment); opts.exitOff drops the exit term (the per-chord
// "resolution" checkbox). Entries carry res = resOut and flow = resIn plus
// both resolver breakdowns, so descriptions (§8) generate from them directly.
// With a one-segment plan and no opts the scores equal progSuggestForChord.
function progSuggestForSegment(chord, segs, k, weights, opts) {
    weights = weights || PROG_WEIGHTS;
    opts = opts || {};
    const wF = weights.flow === undefined ? 0.6 : weights.flow;
    const list = segs.segments;
    const prev = k > 0 ? list[k - 1].cand : null;
    const nextSeg = k + 1 < list.length ? list[k + 1].cand : null;
    const linkIn = k > 0 && segs.links[k - 1] !== false;
    const linkOut = k + 1 < list.length && segs.links[k] !== false;
    const exitTarget = opts.hasOwnProperty('exitTarget') ? opts.exitTarget : (chord.next || null);
    const exitOn = !opts.exitOff && !!exitTarget;
    const chordTones = {};
    chord.tones.forEach(t => { chordTones[t.pc] = t; });

    const seen = {};
    const out = [];
    progBuildCandidates(chord).forEach(cand => {
        const key = cand.tones.map(t => t.pc).sort((a, b) => a - b).join(',');
        if (seen.hasOwnProperty(key)) return;
        seen[key] = true;
        const base = progScoreCandidate(cand, chord, null, weights);
        let resIn = 0, inResolvers = [];
        if (prev && linkIn) {
            const f = progResolution(prev.tones, chordTones, cand);
            resIn = f.res; inResolvers = f.resolvers;
        }
        let resOut = 0, outResolvers = [], wOut = 0;
        if (nextSeg) {
            if (linkOut) {
                const f = progResolution(cand.tones, chordTones, nextSeg);
                resOut = f.res; outResolvers = f.resolvers; wOut = wF;
            }
        } else if (exitOn) {
            const f = progResolution(cand.tones, chordTones, exitTarget);
            resOut = f.res; outResolvers = f.resolvers; wOut = weights.resolve;
        }
        out.push({
            candidate: cand,
            fit: base.fit, pen: base.pen, res: resOut, flow: resIn,
            score: base.fit + wF * resIn + wOut * resOut - weights.penalty * base.pen,
            overlap: base.overlap, avoids: base.avoids,
            resolvers: outResolvers, inResolvers: inResolvers
        });
    });
    out.sort((a, b) =>
        (b.score - a.score) ||
        (a.candidate.noteCount - b.candidate.noteCount) ||
        (a.candidate.tier - b.candidate.tier) ||
        (a.candidate.id < b.candidate.id ? -1 : 1));
    out.forEach((r, i) => { r.rank = i + 1; });
    return out;
}

// Auto-build an n-segment plan (§16.6): greedy, deterministic (score, then
// tension, then id tie-breaks), even bar split with the last segment
// absorbing the remainder, links all on, arpeggios excluded. strategy:
// 'topN' (the fit ranking as-is) | 'ladder' (tension strictly rising) |
// 'arc' (climb, descend by nearest-lower tension, end on the starting scale)
// | 'contrast' (max successive scale distance under a fit floor).
// totalBars optional — without it each non-last segment takes 1 bar.
// Returns null when fewer than 2 usable scales exist.
function progAutoPlan(chord, n, strategy, weights, totalBars) {
    if (!(n >= 2)) return null;
    const w = weights || PROG_WEIGHTS;
    const wF = w.flow === undefined ? 0.6 : w.flow;
    const sug = progSuggestForChord(chord, w).filter(s => s.candidate.family !== 'arpeggio');
    if (sug.length < 2) return null;
    const pool = sug.map(s => s.candidate);
    const fitOf = {}, penOf = {};
    sug.forEach(s => { fitOf[s.candidate.id] = s.fit; penOf[s.candidate.id] = s.pen; });
    const tensionOf = c => {
        const s = PROG_SCALES.find(x => x.id === c.id);
        return s ? s.tension : 0.5;
    };
    const chordTones = {};
    chord.tones.forEach(t => { chordTones[t.pc] = t; });
    const flowScore = (cand, prev) =>
        fitOf[cand.id] + wF * progResolution(prev.tones, chordTones, cand).res - w.penalty * penOf[cand.id];
    const tie = (a, b, by) => by(a, b) || (a.id < b.id ? -1 : 1);
    const climb = (prev, scored) => pool
        .filter(c => tensionOf(c) > tensionOf(prev) + 0.04)
        .sort((a, b) => tie(a, b, scored
            ? (x, y) => flowScore(y, prev) - flowScore(x, prev)
            : (x, y) => tensionOf(x) - tensionOf(y)))[0] || null;
    const descend = prev => pool
        .filter(c => tensionOf(c) < tensionOf(prev) - 0.04)
        .sort((a, b) => tie(a, b, (x, y) => tensionOf(y) - tensionOf(x)))[0] || null;
    const farthest = prev => {
        const floor = 0.75 * Math.max.apply(null, pool.map(c => fitOf[c.id]));
        const eligible = pool.filter(c => c.id !== prev.id && fitOf[c.id] >= floor);
        const src = eligible.length ? eligible : pool.filter(c => c.id !== prev.id);
        return src.sort((a, b) => tie(a, b,
            (x, y) => progScaleDistance(prev.tones, y.tones) - progScaleDistance(prev.tones, x.tones)))[0] || null;
    };

    const seq = [pool[0]];
    if (strategy === 'ladder') {
        while (seq.length < n) {
            const next = climb(seq[seq.length - 1], true);
            if (!next) break;
            seq.push(next);
        }
    } else if (strategy === 'arc') {
        while (seq.length < Math.ceil(n / 2)) {
            const next = climb(seq[seq.length - 1], false);
            if (!next) break;
            seq.push(next);
        }
        while (seq.length < n - 1) {
            const next = descend(seq[seq.length - 1]);
            if (!next) break;
            seq.push(next);
        }
        if (seq.length < n) seq.push(pool[0]); // come home
    } else if (strategy === 'contrast') {
        while (seq.length < n) {
            const next = farthest(seq[seq.length - 1]);
            if (!next) break;
            seq.push(next);
        }
    } else { // 'topN'
        pool.slice(0, n).forEach(c => { if (seq.indexOf(c) === -1) seq.push(c); });
    }
    if (seq.length < 2) return null;

    const segments = seq.map((c, i) => ({
        id: c.id,
        bars: i === seq.length - 1
            ? null
            : (totalBars ? Math.max(0.5, Math.round((2 * totalBars) / seq.length) / 2) : 1)
    }));
    return { segments: segments, links: [] };
}

// Ghost positions for a boundary's changing tones (§16.8): for each string
// the current line touches, every ghost pc's frets inside the line's fret
// window (+/-2, clamped to the neck). Pure position math.
function progGhostPositions(linePositions, ghostPcs, stringOpenPcs) {
    const out = [];
    if (!linePositions.length || !ghostPcs.length) return out;
    const frets = linePositions.map(p => p.fret);
    const lo = Math.max(0, Math.min.apply(null, frets) - 2);
    const hi = Math.min(13, Math.max.apply(null, frets) + 2);
    const strings = [];
    linePositions.forEach(p => { if (strings.indexOf(p.string) === -1) strings.push(p.string); });
    strings.forEach(s => {
        ghostPcs.forEach(pc => {
            for (let oct = 0; oct < 2; oct++) {
                const fret = ((pc - stringOpenPcs[s]) % 12 + 12) % 12 + 12 * oct;
                if (fret >= lo && fret <= hi) out.push({ string: s, fret: fret, pc: ((pc % 12) + 12) % 12 });
            }
        });
    });
    return out;
}

// The playable position for a pitch class nearest a line's fret window —
// the notes of the "sound the link" dyad (§16.8). Deterministic: fret
// distance to the window's middle first, then lower strings.
function progPositionNearPc(pc, linePositions, stringOpenPcs) {
    if (!linePositions || !linePositions.length) return null;
    const frets = linePositions.map(p => p.fret);
    const mid = (Math.min.apply(null, frets) + Math.max.apply(null, frets)) / 2;
    let best = null;
    for (let s = 0; s < stringOpenPcs.length; s++) {
        for (let oct = 0; oct < 2; oct++) {
            const fret = ((pc - stringOpenPcs[s]) % 12 + 12) % 12 + 12 * oct;
            if (fret < 0 || fret > 13) continue;
            const score = Math.abs(fret - mid) + 0.1 * s;
            if (!best || score < best.score) best = { string: s, fret: fret, score: score };
        }
    }
    return best ? { string: best.string, fret: best.fret } : null;
}

// The strongest MOVING resolver per internal boundary (§16.8): the from→to
// pair the "sound the link" toggle plays at the boundary instead of the new
// segment's first eighth. Entry k is the boundary (k-1 → k); entry 0 is null.
function progLinkNotes(chord, segs) {
    if (!segs || segs.segments.length < 2) return null;
    const chordTones = {};
    chord.tones.forEach(t => { chordTones[t.pc] = t; });
    return segs.segments.map((sg, k) => {
        if (k === 0) return null;
        const moving = progResolution(segs.segments[k - 1].cand.tones, chordTones, sg.cand).resolvers
            .filter(r => r.dist > 0)
            .sort((a, b) => b.value - a.value);
        return moving.length ? moving[0] : null;
    });
}

// --- Voicing and position generation (§9.1) -----------------------------------
//
// All functions take the tuning as data (`stringOpenPcs`: pitch class of each
// open string, index 0 = highest-sounding string, the app convention; P4
// spacing assumed only where noted) so they stay DOM-free and Node-testable.

// Place a chords.js book form (CHORD_FORMS encoding: rel[i] = fret of
// span-string i minus the root fret, span-string 0 = the span's LOWEST string,
// which is app string `s`; form.rel[form.root] = 0). The root lands on the
// string whose fret is nearest `centerFret` with the whole span in frets
// [0, 13]; open positions are avoided (the book's forms are movable).
// Returns [{string, fret, isRoot}] or null if the form does not fit.
function progVoicingFromBookForm(form, rootPc, stringOpenPcs, opts) {
    opts = opts || {};
    const center = opts.centerFret === undefined ? 6 : opts.centerFret;
    const n = stringOpenPcs.length;
    const rels = form.rel.map(r => r); // may contain null (muted)
    const played = rels.filter(r => r !== null);
    const minRel = Math.min.apply(null, played);
    const maxRel = Math.max.apply(null, played);
    let best = null;
    for (let s = form.span - 1; s < n; s++) {
        const base = ((rootPc - stringOpenPcs[s]) % 12 + 12) % 12;
        const fret = base === 0 ? 12 : base; // movable: no open strings
        if (fret + minRel < 0 || fret + maxRel > 13) continue;
        if (!best || Math.abs(fret - center) < Math.abs(best.fret - center)) {
            best = { s: s, fret: fret };
        }
    }
    if (!best) return null;
    const out = [];
    rels.forEach((rel, i) => {
        if (rel === null) return;
        out.push({ string: best.s - i, fret: best.fret + rel, isRoot: i === form.root });
    });
    return out;
}

// Fallback voicing when no book form exists (maj9, m11, 11, maj7#5, specials):
// the root sits near `centerFret` on the neck's LOWER half (so the shape can
// build across the higher-sounding strings above it), then each such string
// takes the unused chord tone whose fret is closest to the previous one
// (window +/-3, frets 0..12), skipping strings with no candidate — the same
// shape logic the book's rel values follow. Fresh tones dominate the score so
// doubling only happens when a tone simply cannot be reached.
function progVoicingGreedy(chord, stringOpenPcs, opts) {
    opts = opts || {};
    const center = opts.centerFret === undefined ? 6 : opts.centerFret;
    const n = stringOpenPcs.length;
    let root = null;
    for (let s = Math.floor(n / 2); s < n; s++) {
        const fret = ((chord.rootPc - stringOpenPcs[s]) % 12 + 12) % 12;
        if (!root || Math.abs(fret - center) < Math.abs(root.fret - center)) {
            root = { s: s, fret: fret };
        }
    }
    const used = {};
    const out = [{ string: root.s, fret: root.fret, isRoot: true }];
    used[chord.rootPc] = true;
    let prevFret = root.fret;
    for (let s = root.s - 1; s >= 0 && out.length < 5; s--) {
        let best = null;
        chord.tones.forEach(t => {
            for (let k = 0; k < 2; k++) {
                const fret = ((t.pc - stringOpenPcs[s]) % 12 + 12) % 12 + 12 * k;
                if (fret < Math.max(0, prevFret - 3) || fret > Math.min(12, prevFret + 3)) continue;
                // unused tones first, then smallest move, then the more stable tone
                const score = (used[t.pc] ? 100 : 0) + Math.abs(fret - prevFret) -
                    0.001 * (t.stability || 0);
                if (!best || score < best.score) best = { fret: fret, pc: t.pc, score: score };
            }
        });
        if (best) {
            out.push({ string: s, fret: best.fret, isRoot: false });
            used[best.pc] = true;
            prevFret = best.fret;
        }
    }
    return out;
}

// Dispatch: book form when the quality has one, greedy otherwise. `forms` is
// the CHORD_FORMS map (passed in by the DOM layer / tests).
function progGenerateVoicing(chord, forms, stringOpenPcs, opts) {
    let placed = null;
    const familyId = chord.qualityId && PROG_FAMILY_FOR_QUALITY.hasOwnProperty(chord.qualityId)
        ? PROG_FAMILY_FOR_QUALITY[chord.qualityId] : null;
    if (forms && familyId && forms[familyId] && forms[familyId].length) {
        placed = progVoicingFromBookForm(forms[familyId][0], chord.rootPc, stringOpenPcs, opts);
    }
    const voicing = placed || progVoicingGreedy(chord, stringOpenPcs, opts);
    // decorate with pitch data for fretboard marking
    return voicing.map(p => Object.assign({}, p, {
        pc: (stringOpenPcs[p.string] + p.fret) % 12
    }));
}

// Ascending scale line (root ... octave, §9.2): the root starts near
// `centerFret` on the neck's LOWER half and every next semitone takes the
// position that stays closest to the position center — on a P4 neck this locks
// the line into one position, the shapes the sequence mode teaches.
// `tones` is a candidate's tones array ({pc, deg, ...}). Assumes P4 spacing.
// `opts.octaves` (default 1) extends the climb octave by octave for as long as
// a position exists in frets [0, 13] — long chords get taller lines (§9.3).
// Each returned position carries `abs` (absolute pitch) for phrase shaping.
function progScalePositions(tones, stringOpenPcs, opts) {
    opts = opts || {};
    const center = opts.centerFret === undefined ? 6 : opts.centerFret;
    const octaves = Math.max(1, opts.octaves || 1);
    const n = stringOpenPcs.length;
    // Absolute pitch numbers, octave-correct: string s sounds 5 semitones
    // above string s+1 (P4). The unwrap is CUMULATIVE from the lowest string —
    // a plain pc + 24 - 5*s would subtract the 5s from the pitch class itself
    // (only string 0 stayed correct; other strings landed a fifth off). The
    // +24 lift keeps every A positive.
    const A = new Array(n);
    A[n - 1] = (((stringOpenPcs[n - 1] % 12) + 12) % 12) + 24;
    for (let s = n - 2; s >= 0; s--) A[s] = A[s + 1] + 5;
    const rootPc = tones.length ? tones[0].pc : 0;

    let start = null;
    for (let s = Math.floor(n / 2); s < n; s++) {
        const base = ((rootPc - stringOpenPcs[s]) % 12 + 12) % 12;
        [base, base + 12].forEach(fret => {
            if (fret > 12) return;
            if (!start || Math.abs(fret - center) < Math.abs(start.fret - center)) {
                start = { s: s, fret: fret };
            }
        });
    }
    const rootAbs = A[start.s] + start.fret;
    const baseDegs = tones.map(t => t.deg).sort((a, b) => a - b);
    const semis = baseDegs.map(d => d); // octave 1 in scale order
    for (let o = 1; o < octaves; o++) baseDegs.forEach(d => semis.push(d + 12 * o));
    semis.push(12 * octaves); // close the last octave
    const baseCount = baseDegs.length + 1; // targets of octave 1 (skip = legacy)

    const out = [];
    let last = start;
    for (let i = 0; i < semis.length; i++) {
        const t = semis[i];
        const target = rootAbs + t;
        let best = null;
        for (let s = 0; s < n; s++) {
            const fret = target - A[s];
            if (fret < 0 || fret > 13) continue;
            // stay near the position center, prefer small steps and the same
            // string (in that order)
            const score = Math.abs(fret - center) + 0.5 * Math.abs(fret - last.fret) +
                (s === last.s ? 0 : 0.5);
            if (!best || score < best.score) best = { s: s, fret: fret, score: score, deg: t };
        }
        // octave-1 targets keep the legacy skip; the climb simply stops when
        // the neck runs out (no gaps in what is returned)
        if (best) {
            out.push({ string: best.s, fret: best.fret, deg: t, isRoot: t % 12 === 0, abs: target });
            last = best;
        } else if (i >= baseCount) break;
    }
    return out;
}

// One full up–down practice cycle of a scale (root → octave → back to the 2nd
// degree), 2N notes for an N-note scale; cycles tile the chord's eighth-note
// grid (§9.2).
function progScaleLine(tones, stringOpenPcs, opts) {
    const pos = progScalePositions(tones, stringOpenPcs, opts);
    return pos.concat(pos.slice(1, -1).reverse());
}

// The phrase's landing tone (§9.3): the scale tone a chord's phrase ENDS on —
// the strongest resolver into whatever comes next (usually the next chord),
// held so it rings across the boundary and the next strum "answers" it.
// Avoid notes over the CURRENT chord are excluded first: a landing note is
// sustained, so the classic semitone-above clash would ring (over G7→Cmaj7 the
// raw kernel loves C — the 4th of G mixolydian, which becomes Cmaj7's root —
// but held against G7 it is the textbook avoid note; E, the 13th that IS the
// next 3rd, is the playable answer). Atlas lookups only, no derivation.
// Returns {pc, toPc, dist, value}; toPc null when there is no target.
function progLandingTone(fromTones, chord, target) {
    const rootPc = fromTones.length ? fromTones[0].pc : 0;
    if (!target || !target.tones || !target.tones.length || !chord || !chord.tones) {
        return { pc: rootPc, toPc: null, dist: null, value: 0 };
    }
    const chordTones = {};
    chord.tones.forEach(t => { chordTones[t.pc] = t; });
    const avoid = {};
    fromTones.forEach(ct => {
        if (chordTones.hasOwnProperty(ct.pc)) return;
        chord.tones.forEach(t => {
            if ((ct.pc - t.pc + 12) % 12 === 1) avoid[ct.pc] = true;
        });
    });
    let best = null;
    progResolution(fromTones, chordTones, target).resolvers.forEach(r => {
        if (avoid[r.pc]) return;
        const stab = (fromTones.find(t => t.pc === r.pc) || {}).stability || 0;
        // value first, then closeness of the move, then restfulness of the tone
        const key = r.value * 100 - r.dist * 2 + stab;
        if (!best || key > best.key) {
            best = { pc: r.pc, toPc: r.toPc, dist: r.dist, value: r.value, key: key };
        }
    });
    return best || { pc: rootPc, toPc: null, dist: null, value: 0 };
}

// A played phrase through the scale that EXACTLY spans the chord's slot
// budget (§9.3) — the replacement for tiling a one-octave up-down cycle against
// the chord span, which cropped the line mid-phrase at the barline and restarted
// every chord on its root. The shape is what a player actually drafts:
//
//   · enter near where the PREVIOUS phrase landed (opts.nearAbs, absolute
//     pitch) — lines connect across chords instead of root-jumping;
//   · arch up while the budget allows (taller arches for longer chords — the
//     positions climb octave by octave until the neck runs out);
//   · walk back down to the landing tone (opts.endPc — progLandingTone's
//     choice), which absorbs the leftover time and rings across the boundary;
//   · durations from the stability atlas: restful tones (root/3rd/5th, ≥ .70)
//     land as quarter notes, color tones move as eighths — the rhythm spells
//     out which notes are structural;
//   · a one-eighth lead-in after the strum (S ≥ 6) so the comp speaks first.
//
// Divisions (§9.3): `opts.slotsPerBar` sets the grid — 8 slots/bar = straight
// eighths (default), 12 = triplet eighths (3 per beat), 16 = sixteenths. The
// duration ladder is grid-relative (structural = 2 slots, color = 1), so a
// finer grid packs the same arch into denser motion: at 16 the structural
// tones are eighths and color runs as sixteenths (double-time), at 12 the
// pairs feel like 12/8. `slots` is always in grid units: bars × slotsPerBar.
//
// Deterministic and DOM-free. Returns
// [{string, fret, pc, deg, abs, atSlot, dur, accent, role}] with role
// 'open' | 'rise' | 'peak' | 'fall' | 'land': events are strictly ordered,
// atSlot/dur are integers ≥ 0/≥ 1, and they cover [leadIn, slots) with no
// gaps or overlaps — the phrase always ends exactly at the boundary.
function progPhrase(tones, slots, stringOpenPcs, opts) {
    opts = opts || {};
    const S = Math.max(1, Math.round(slots));
    const spb = opts.slotsPerBar || 8; // grid: 8 = eighths, 12 = triplets, 16 = sixteenths
    if (!tones.length) return [];
    const pos = progScalePositions(tones, stringOpenPcs, {
        centerFret: opts.centerFret,
        octaves: opts.octaves || 3
    });
    if (!pos.length) return [];
    if (pos.length === 1 || S <= 2) {
        const p = pos[0];
        return [Object.assign({}, p, {
            pc: (stringOpenPcs[p.string] + p.fret) % 12,
            atSlot: 0, dur: S, accent: 1, role: 'land'
        })];
    }

    // stability by degree → duration shaping (≥ .70 as quarters)
    const stabByDeg = {};
    tones.forEach(t => {
        stabByDeg[t.deg % 12] = t.stability == null ? 0.5 : t.stability;
    });
    const stabOf = p => stabByDeg.hasOwnProperty(p.deg % 12) ? stabByDeg[p.deg % 12] : 0.5;

    const rootPc = tones[0].pc;
    const endPc = opts.endPc == null ? rootPc : ((opts.endPc % 12) + 12) % 12;
    let landIdx = 0;
    for (let i = 0; i < pos.length; i++) {
        if ((stringOpenPcs[pos[i].string] + pos[i].fret) % 12 === endPc) { landIdx = i; break; }
    }

    // lead-in: one eighth of the current grid (2 slots at sixteenths), only
    // once the span is past three quarters of a bar
    const leadUnit = spb >= 16 ? 2 : 1;
    let leadIn = opts.leadIn == null ? (S >= spb * 0.75 ? leadUnit : 0) : opts.leadIn;
    if (leadIn > S - 1) leadIn = Math.max(0, S - 1);
    const usable = S - leadIn;
    const small = usable <= spb * 0.75; // tiny budgets: everything moves by one slot
    const durOf = p => (small || stabOf(p) < 0.7) ? 1 : 2;

    // entry: the first-octave position closest to the previous phrase's
    // landing pitch (default: the root — a phrase from the bottom)
    let startIdx = 0;
    if (opts.nearAbs != null && isFinite(opts.nearAbs)) {
        const lim = Math.min(pos.length - 1, tones.length);
        for (let i = 1; i <= lim; i++) {
            if (Math.abs(pos[i].abs - opts.nearAbs) < Math.abs(pos[startIdx].abs - opts.nearAbs)) {
                startIdx = i;
            }
        }
    }

    // the walk: contiguous rise startIdx → peak, contiguous fall peak → landIdx
    const between = (a, b) => {
        const out = [];
        if (a === b) return out;
        const step = b > a ? 1 : -1;
        for (let i = a + step; i !== b; i += step) out.push(i);
        return out;
    };
    const cost = idxs => idxs.reduce((s, i) => s + durOf(pos[i]), 0);
    const rangeUp = (a, b) => {
        const out = [];
        for (let i = a; i <= b; i++) out.push(i);
        return out;
    };

    const floor = Math.max(startIdx, landIdx); // a peak below the landing is no arch
    let peak = floor;
    for (let cand = floor + 1; cand < pos.length; cand++) {
        if (cost(rangeUp(startIdx, cand)) + cost(between(cand, landIdx)) + 2 > usable) break;
        peak = cand;
    }
    // even a budget too small for the walk deserves a small arch (the fit
    // machinery below shrinks it back if truly needed)
    if (peak < Math.min(2, pos.length - 1)) peak = Math.min(2, pos.length - 1);

    let asc = rangeUp(startIdx, peak);
    let desc = between(peak, landIdx);
    let aDurs = asc.map(i => durOf(pos[i]));
    let dDurs = desc.map(i => durOf(pos[i]));
    let total = aDurs.concat(dDurs).reduce((a, b) => a + b, 0);
    // fit: leave at least one slot for the landing — first stretch quarters
    // (least stable first), then drop descent notes (leap in), then the peak
    const reduceOne = () => {
        const both = asc.concat(desc);
        let worst = -1, worstStab = Infinity;
        both.forEach((i, k) => {
            const d = k < asc.length ? aDurs[k] : dDurs[k - asc.length];
            const stab = stabOf(pos[i]);
            if (d > 1 && stab < worstStab) { worstStab = stab; worst = k; }
        });
        if (worst < 0) return false;
        if (worst < asc.length) aDurs[worst]--; else dDurs[worst - asc.length]--;
        total--;
        return true;
    };
    while (total + 1 > usable && reduceOne()) { /* stretched one quarter */ }
    while (total + 1 > usable && desc.length) {
        desc.pop(); dDurs.pop(); total--;
    }
    while (total + 1 > usable && asc.length > 1) {
        asc.pop(); aDurs.pop(); total--;
    }
    if (total + 1 > usable) { // nothing left to trim: the landing alone
        asc = []; desc = []; aDurs = []; dDurs = []; total = 0;
    }

    // emit
    const out = [];
    let at = leadIn;
    const idxs = asc.concat(desc);
    const durs = aDurs.concat(dDurs);
    const mergeLand = !desc.length && asc.length && asc[asc.length - 1] === landIdx;
    idxs.forEach((i, k) => {
        const role = mergeLand && k === idxs.length - 1 ? 'land'
            : (k === asc.length - 1 ? 'peak'
                : (k === 0 ? 'open' : (k < asc.length ? 'rise' : 'fall')));
        const p = pos[i];
        out.push({
            string: p.string, fret: p.fret, pc: (stringOpenPcs[p.string] + p.fret) % 12,
            deg: p.deg, abs: p.abs, atSlot: at, dur: durs[k], accent: 1, role: role
        });
        at += durs[k];
    });
    const landDur = Math.max(1, usable - total);
    if (!mergeLand) {
        const p = pos[landIdx];
        out.push({
            string: p.string, fret: p.fret, pc: (stringOpenPcs[p.string] + p.fret) % 12,
            deg: p.deg, abs: p.abs, atSlot: leadIn + total, dur: landDur, accent: 1, role: 'land'
        });
    } else {
        out[out.length - 1].dur += landDur; // the walk's last note IS the landing
    }

    // dynamics: beat hierarchy, stability, and the phrase's two goal notes
    out.forEach(ev => {
        let a = 0.80 + 0.28 * (stabByDeg.hasOwnProperty(ev.deg % 12) ? stabByDeg[ev.deg % 12] : 0.5);
        if (ev.atSlot % 2 !== 0) a *= 0.88;
        if (ev.role === 'peak') a *= 1.08;
        if (ev.role === 'land') a *= 1.05;
        ev.accent = Math.min(1.2, Math.max(0.55, Math.round(a * 100) / 100));
    });
    return out;
}

// Which candidate the transport plays for a chord with no explicit pick: the
// user's pick, else the top-ranked heptatonic (the practice default), else the
// overall top (§9.2).
function progDefaultCandidate(suggestions, pickId) {
    const picked = suggestions.find(s => s.candidate.id === pickId);
    if (picked) return picked.candidate;
    const hepta = suggestions.find(s => s.candidate.family === 'heptatonic');
    if (hepta) return hepta.candidate;
    return suggestions.length ? suggestions[0].candidate : null;
}

// --- Descriptions (§8) --------------------------------------------------------
//
// Card text generated from the same breakdown data the scores used — no
// per-pair hand-written prose.

// `targetLabel` names the resolution target in prose — "the next chord" (v2.0
// default) or e.g. "lydian" for a plan-segment target whose tones carry scale
// degrees instead of chord degreeNames (§16.3).
function progDescribe(result, chord, next, targetLabel) {
    const cand = result.candidate;
    const rootName = progNoteName(chord.rootPc);
    const isArp = cand.family === 'arpeggio';
    const title = isArp
        ? rootName + (PROG_QUALITIES[cand.id.slice(4)].symbol || ' major') + ' arpeggio'
        : rootName + ' ' + cand.name;
    const formula = cand.tones.map(t =>
        isArp ? PROG_DEGREE_NAME_LABELS[t.degreeName] : PROG_SCALE_DEGREE_LABELS[t.deg]
    ).join(' ');

    const present = result.overlap.filter(o => o.present);
    const missing = result.overlap.filter(o => !o.present);
    let overlapText = 'Chord tones: ' + present.map(o =>
        progNoteName(o.pc) + ' (' + PROG_DEGREE_NAME_LABELS[o.degreeName] +
        (o.scaleDegree ? ' = ' + o.scaleDegree : '') + ')'
    ).join(', ');
    overlapText += missing.length
        ? (present.length ? ' — missing ' + missing.map(m => PROG_DEGREE_NAME_LABELS[m.degreeName]).join(', ') : ' — none present')
        : ' — all present';

    const tLabel = targetLabel || 'the next chord';
    const toDegText = r => r.toDegreeName
        ? PROG_DEGREE_NAME_LABELS[r.toDegreeName]
        : (r.toDeg != null ? PROG_SCALE_DEGREE_LABELS[r.toDeg % 12] : '');
    let resolutionText = '';
    if (next) {
        resolutionText = result.resolvers
            .filter(r => r.value >= 0.08)
            .sort((a, b) => b.value - a.value)
            .slice(0, 4)
            .map(r => {
                const nm = progNoteName(r.pc);
                const deg = PROG_SCALE_DEGREE_LABELS[r.deg] || '';
                const toNm = progNoteName(r.toPc);
                if (r.dist === 0) {
                    return nm + ' (' + deg + ') is ' + toNm + ', a stable tone of ' + tLabel + ' — common tone';
                }
                const delta = (r.toPc - r.pc + 12) % 12;
                const dir = delta <= 2 ? 'up' : 'down';
                return nm + ' (' + deg + ') resolves a ' + (r.dist === 1 ? 'half-step' : 'whole-step') + ' ' + dir +
                    ' to ' + toNm + ' (' + toDegText(r) + ' of ' + tLabel + ')';
            }).join(' · ');
    }

    const avoidText = result.avoids.map(a => {
        if (a.kind === 'b9-over-root') {
            return progNoteName(a.pc) + ' sits a half-step below the root ' + progNoteName(a.overPc) + ' (♭9 over the root)';
        }
        return progNoteName(a.pc) + ' sits a half-step above ' + progNoteName(a.overPc) +
            ' (' + (PROG_DEGREE_NAME_LABELS[a.overName] || a.overName) + ') — avoid note';
    }).join(' · ');

    return { title: title, formula: formula, overlap: overlapText, resolution: resolutionText, avoid: avoidText };
}

// --- Preset library (§14.5; standards per the source screenshots) ---------------
//
// One-click starter progressions. Text must obey the same grammar as the
// editor (enforced by tests: every token of every preset parses cleanly and
// realizes at any base root). Schema:
//   group  — dropdown optgroup (labels in PROG_PRESET_GROUPS)
//   basePc — optional default base root as a pitch class: the jazz standards
//            ship in the key the source list gives them, and applying the
//            preset also applies that root; cadence presets leave it unset so
//            the user's current root stands
//   note   — one-liner shown in the option tooltip

const PROG_PRESET_GROUPS = { forms: 'Cadences & forms', standards: 'Jazz standards' };

const PROG_PRESETS = [
    { id: 'iivi',        group: 'forms', name: 'ii–V–I (major)',       text: 'IIm7 V7 Imaj7', note: 'the backbone cadence' },
    { id: 'iiviminor',   group: 'forms', name: 'ii–V–i (minor)',       text: 'IIm7b5 V7b9 Im7', note: 'half-diminished ii, altered V' },
    { id: 'turnaround',  group: 'forms', name: 'I–vi–ii–V turnaround', text: 'Imaj7 VIm7 IIm7 V7', note: 'the jazz turnaround' },
    { id: 'backdoor',    group: 'forms', name: 'Backdoor cadence',     text: 'IVm7 bVII7 Imaj7', note: 'minor iv + ♭VII7 resolving to I' },
    { id: 'andalusian',  group: 'forms', name: 'Andalusian',           text: 'Im7 bVImaj7 bVIImaj7 V7', note: 'i – ♭VI – ♭VII – V' },
    { id: 'dorianvamp',  group: 'forms', name: 'Dorian vamp (i–IV)',   text: 'Im7*4 IVm7*4', note: 'two chords, four bars each' },
    { id: 'blues',       group: 'forms', name: '12-bar blues',         text: 'I7*4 IV7*2 I7*2 V7 IV7 I7 V7', note: 'dominant-quality quick change' },
    { id: 'minorblues',  group: 'forms', name: '12-bar minor blues',   text: 'Im7 IV7 Im7*2 bVI7 V7 Im7*2 bVI7 V7 Im7 V7', note: 'i7 – IV7 with a ♭VI7 bar' },
    { id: 'rhythm',      group: 'forms', name: 'Rhythm changes (A)',   text: 'Imaj7 VI7 IIm7 V7 Imaj7 VI7 IIm7 V7', note: 'the A-section, I–VI7–ii–V twice' },
    { id: 'coltrane',    group: 'forms', name: 'Coltrane cycle',       text: 'III7 VI7 II7 V7 Imaj7', note: 'descending dominant cycle (Giant Steps)' },
    { id: 'tritone',     group: 'forms', name: 'Tritone-sub ii–V–I',   text: 'IIm7 bII7 Imaj7', note: 'iim7 – ♭II7 (subV) – I' },
    { id: 'neapolitan',  group: 'forms', name: 'Neapolitan approach',  text: 'bVImaj7 bIImaj7 V7 Imaj7', note: '♭VI – ♭II – V – I' }
];

// Jazz standards from the screenshots in standtards_to_implement/ — every
// entry carries its own default base root (basePc). Changes are the usual
// jam-session versions: one chord per bar (*1) or two (*0.5), no first/second
// endings; bar lines mark the form.
const PROG_STANDARDS = [
    // alphabetical by name; jam-session changes — one chord per bar (*1) or two
    // (*0.5), no first/second endings, | marks bars. Provenance per entry in
    // `note` and in docs/progression-lab.md §6 (lead sheets, researched changes,
    // and the Impro-Visor Imaginary Book corpus — bar-per-token, *N from
    // beats-per-bar, slash bass dropped).
    { group: 'standards', id: 'std-attya',        basePc: 8,  name: 'All the Things You Are', note: 'Kern — four keys, ends on the V7 turnaround',
      text: 'VIm7 IIm7 V7 Imaj7 IVmaj7 #IVm7*0.5 VII7*0.5 IIImaj7 IIImaj7 | IIIm7 VIm7 II7 Vmaj7 Imaj7 bIIm7*0.5 #IV7*0.5 VIImaj7 bVI7#9 | bIIm7 #IV7 VIImaj7 VIImaj7 bVIIm7 bIII7 bVImaj7 III7#9 | VIm7 IIm7 V7 Imaj7 IVmaj7 IVm7 IIIm7 bIIIm7 | IIm7 V7 Imaj7 VIIm7*0.5 III7#9*0.5' },
    { group: 'standards', id: 'std-alonetogether',basePc: 2,  name: 'Alone Together',        note: 'A section — minor drifting through ♭VI',
      text: 'Im7*2 bVIm7 bII7 bVmaj7 bIImaj7 bVIIm7b5 bIII7b9 bVIm7*2 IVm7b5 bVII7b9 bIIIm7 bVI7 bIImaj7*2' },
    { group: 'standards', id: 'std-anthropology', basePc: 10, name: 'Anthropology',          note: 'Parker — rhythm changes, I7–IV6 turn',
      text: 'I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I7 IV*0.5 IVm6*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 | I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I7 IV*0.5 IVm6*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.25 V7*0.25 I*0.25 I*0.25 | III7 III7 VI7 VI7 II7 II7 V7 V7 | I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I*0.5 VI7*0.5 IIm7*0.5 V7*0.5 I7 IV*0.5 IVm6*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.25 V7*0.25 I*0.25 I*0.25' },
    { group: 'standards', id: 'std-aprilinparis', basePc: 0,  name: 'April in Paris',        note: 'Duke — the cycle-of-fourths bridge',
      text: 'IIm7b5*0.25 IIm7b5*0.25 VII*0.25 Imaj7*0.25 Imaj7 IIm7b5*0.25 IIm7b5*0.25 bVI9*0.25 IIm7*0.25 IIm7 Imaj7*0.25 Imaj7*0.25 VIIdim7*0.25 I6*0.25 I6*0.25 Imaj7*0.25 VIm7*0.25 bVIdim7*0.25 Vm*0.5 Vm(maj7)*0.5 Isus4*0.5 I9*0.5 | V11*0.25 V11*0.25 VIIdim7*0.25 VIm7*0.25 VIm7 VIIm7b5*0.25 VIIm7b5*0.25 bVIdim7*0.25 VIm7*0.25 VIm7*0.5 VIm7*0.5 #IVm7b5 VII7*0.5 VII7b13*0.5 VIIm7*0.5 III7*0.5 IIIm7b5*0.5 VI7*0.5 | #IVm7b5*0.5 IVm7*0.5 I*0.5 bIIIdim7*0.5 IIm7*0.5 Vsus4*0.5 Imaj7*0.25 bVIImaj7*0.25 VIm7*0.25 Vm7*0.25 #IVm7b5*0.25 #IVm7b5*0.25 VIIm7b5*0.25 III7*0.25 VIm*0.5 VIm*0.5 #IVm7b5*0.5 VII7b13*0.5 IIImaj7*0.5 V7b9*0.5 | IIm7b5*0.25 IIm7b5*0.25 VII*0.25 Imaj7*0.25 Imaj7 IIIm7b5 VI7b9 VIm9*0.5 II13*0.5 IIm7*0.5 V7*0.5 Imaj7 Imaj7*0.5 V7b9*0.5' },
    { group: 'standards', id: 'std-armandos',     basePc: 0,  name: "Armando's Rhumba",      note: 'Corea — Cm6 montuno with dim7 walk-ups',
      text: 'Im6 II7 V7 Im6 Im6 II7 V7 Im6 | I7b9 IVm7 II7b9 Vm7 bVIdim7 II7 bIII bIII | bVIm bVIm7*0.25 bVIm7*0.25 V7*0.25 Im7*0.25 III7*0.25 IV7*0.25 #IV7*0.25 V7*0.125 V7*0.125 V7*0.125 V7#5*0.125 V7#5*0.125 V7#5*0.125 V7#5*0.125 V7#5*0.125 Im6 II7 V7 Im6 | Im6 II7 V7 Im6 I7b9 IVm7 II7b9 Vm7 | bVIdim7 II7 bIII bIII bVIm bVIm7*0.25 bVIm7*0.25 V7*0.25 Im7*0.25 III7*0.25 IV7*0.25 #IV7*0.25 V7*0.125 V7*0.125 V7*0.125 V7#5*0.125 V7#5*0.125 V7#5*0.125 | Im7 II7 V7b9 Im7 Im7 II7 V7b9 Im7 | I7b9 IVm7 II7b9 Vm7 bVIdim7 II7 bIII bIII | bVIm bVIm7*0.25 bVIm7*0.25 V7*0.25 Im7*0.25 III7*0.25 IV7*0.25 #IV7*0.25 V7*0.125 V7*0.125 V7*0.125 V7#5*0.125 V7#5*0.125 V7#5*0.125 Im*0.125 Im*0.125' },
    { group: 'standards', id: 'std-askmenow',     basePc: 1,  name: 'Ask Me Now',            note: 'Monk — chromatic planing in D♭',
      text: '#IVm7*0.25 VII7*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.25 VI7*0.25 bIIIm7*0.25 bVI7*0.25 IIm7*0.5 V7#5*0.5 bVII7b5*0.5 VI7#11*0.5 II7*0.5 bII7*0.5 Imaj7*0.5 II7#11*0.5 IIm7*0.5 V7b9*0.5 bVII7b5*0.25 VI7b5*0.25 bVI7b5*0.25 V7#5*0.25 | #IVm7*0.25 VII7*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.25 VI7*0.25 bIIIm7*0.25 bVI7*0.25 IIm7*0.5 V7#5*0.5 bVII7b5*0.5 VI7#11*0.5 II7*0.5 bII7*0.5 Imaj7*0.5 II7#11*0.5 IIm7*0.5 V7b9*0.5 I6 | IIm7*0.5 V7*0.5 Imaj7*0.25 Imaj7*0.25 IIIm7*0.25 bIII7*0.25 IIm7*0.5 bII9*0.5 Imaj7 II7 II7 IIm7*0.5 V7b9*0.5 IV13 | #IVm7*0.25 VII7*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.25 VI7*0.25 bIIIm7*0.25 bVI7*0.25 IIm7*0.5 V7#5*0.5 bVII7b5*0.5 VI7#11*0.5 II7*0.5 bII7*0.5 Imaj7*0.5 II7#11*0.5 IIm7*0.5 V7b9*0.5 I6' },
    { group: 'standards', id: 'std-autumnleaves', basePc: 7,  name: 'Autumn Leaves',         note: 'Kosma — the relative-major cycle',
      text: 'IVm7 bVII7 bIIImaj7 bVImaj7 IIm7b5 V7 Im7 Im6 | IVm7 bVII7 bIIImaj7 bVImaj7 IIm7b5 V7 Im6 Im6 | V7 V7 Im6 Im6 IVm7 bVII7 bIIImaj7 bIIImaj7 | IIm7b5 V7 Im7*0.5 IV7*0.5 bVIIm7*0.5 bIII7*0.5 IIm7b5 V7 Im6 I7' },
    { group: 'standards', id: 'std-beatrice',     basePc: 5,  name: 'Beatrice',              note: 'Sam Rivers — side-slipping maj7s',
      text: 'Imaj7 bIImaj7 Imaj7 bVIImaj7 | VIIm7 IV7 Vm7 I7 | IVmaj7 #IVm7 VII7 IVmaj7 | IIIm7 VI7 IIm7 V7' },
    { group: 'standards', id: 'std-beautifulove', basePc: 2,  name: 'Beautiful Love',        note: 'Van Alstyne — iø–V7b9 cycles in D minor',
      text: 'IIm7b5 V7b9 Im6 Im6 IVm7 bVII7 bIIImaj7 IIm7b5*0.5 V7*0.5 | Im6 IVm7 bVI7b5 IIm7b5*0.5 V7*0.5 Im6 Im6 bVI7b5 V7 | IIm7b5 V7 Im6 Im6 IVm7 bVII7 bIIImaj7 IIm7b5*0.5 V7*0.5 | Im6 IVm7 bVI7b5 V7 Im6 bVI7*0.5 V7*0.5 Im6 IIm7b5*0.5 V7*0.5' },
    { group: 'standards', id: 'std-blacknarc',    basePc: 8,  name: 'Black Narcissus',       note: 'Henderson — i7/ii7 vamps, lydian bridge',
      text: 'Im7 IIm7 Im7 IIm7 Im7 IIm7 Im7 bIIImaj7 | bVIIm7 Im7 bVIIm7 Im7 bVIIm7 Im7 bVIIm7 bIImaj7 | Vmaj7 VImaj7 IImaj7 IIImaj7 Vmaj7 VImaj7*0.5 IImaj7*0.5 VIImaj7*0.5 Imaj7*0.5 IImaj7*0.25 IIImaj7*0.25 IIImaj7*0.25' },
    { group: 'standards', id: 'std-bluebossa',    basePc: 0,  name: 'Blue Bossa',            note: '16 bars, minor to ♭II',
      text: 'Im7*2 IVm7*2 IIm7b5 V7 Im7*2 bIIIm7 bVI7 bIImaj7*2 IIm7b5 V7 Im7 V7' },
    { group: 'standards', id: 'std-blueingreen',  basePc: 7,  name: 'Blue in Green',         note: '10-bar modal form',
      text: 'Im II7b9 Vm7 bV7b9 IVmaj7 bVIIm7*0.5 bIII7*0.5 bVImaj7 IIm7*0.5 V7*0.5 Im II7b9' },
    { group: 'standards', id: 'std-bluesalice',   basePc: 5,  name: 'Blues for Alice',       note: 'Parker — the iii–VI–ii–V blues',
      text: 'I6 VIIm7*0.5 III7*0.5 VIm7 Vm7*0.5 I7*0.5 IV7 IVm7*0.5 bVII7*0.5 I6 bIIIm7*0.5 bVI7*0.5 | IIm7 V7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-bluesette',    basePc: 10, name: 'Bluesette',             note: 'Thielemans — three-key waltz',
      text: 'Imaj7 Imaj7 VIIm7b5 III7 VIm7 II7 Vm7 I7 | IVmaj7 IVmaj7 IVm7 bVII7 bIIImaj7 bIIImaj7 bIIIm7 bVI7 | bIImaj7 bIImaj7 IIm7b5 V7 IIIm7 bIII7 IIm7 V7' },
    { group: 'standards', id: 'std-bodyandsoul',  basePc: 1,  name: 'Body and Soul',          note: 'Green — chromatic iii–VI turns',
      text: 'IIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV9*0.5 IIIm7*0.5 bIIIdim7*0.5 IIm7 VIIm7*0.5 III7*0.5 VIm7*0.25 II7*0.25 IIm7*0.25 V7*0.25 I6*0.25 I6*0.25 IIIm7b5*0.25 VI7*0.25 | IIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV9*0.5 IIIm7*0.5 bIIIdim7*0.5 IIm7 VIIm7*0.5 III7*0.5 VIm7*0.25 II7*0.25 IIm7*0.25 V7*0.25 I6*0.25 I6*0.25 bIIIm7*0.25 bVI7*0.25 | bIImaj7*0.5 bIIIm7*0.5 IVm7*0.5 #IVm6*0.5 IVm7*0.25 bVII7*0.25 bIIIm7*0.25 bVI7*0.25 bIImaj7 bIIm7*0.5 #IV7*0.5 bIIIm7*0.5 IIdim7*0.5 bIIm7*0.5 #IV7*0.5 VII7*0.25 bVII7*0.25 VI7*0.25 VI7*0.25 | IIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV9*0.5 IIIm7*0.5 bIIIdim7*0.5 IIm7 VIIm7*0.5 III7*0.5 VIm7*0.25 II7*0.25 IIm7*0.25 V7*0.25 I6*0.25 I6*0.25 IIIm7b5*0.25 VI7*0.25' },
    { group: 'standards', id: 'std-bossaantigua', basePc: 8,  name: 'Bossa Antigua',         note: 'Desmond — ii–V ladder, no ii–V home',
      text: 'IIm7 V7 IIIm7 VIm7 IIm7 V7 IIIm7 VIm7 | IIm7 V7 IIIm7 VIm7 IIm7 #IVm7*0.5 VII7*0.5 IIImaj7 bII7 | #IVm7 VII7 bVIm7 bIIm7 #IVm7 VII7 IIIm7 VI7 | IIm7 V7 IIIm7 VIm7 IIm7 V7 Imaj7 IIIm7*0.5 VI7#9*0.5' },
    { group: 'standards', id: 'std-butbeautiful', basePc: 7, name: 'But Beautiful',          note: 'Van Heusen — ii–Vs through four keys',
      text: 'Imaj7 IIIm7b5*0.5 VI7b9*0.5 IIm7 #IVm7b5*0.5 VII7b9*0.5 Imaj7 IIIm7b5*0.5 VI7*0.5 II7 II7 | IIm7*0.5 V7*0.5 Imaj7*0.5 VIm7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.25 Imaj7*0.25 VIIm7b5*0.25 III7*0.25 VIm7 II7 IIm7 V7 | Imaj7 IIIm7b5*0.5 VI7b9*0.5 IIm7 #IVm7b5*0.5 VII7b9*0.5 Imaj7 IIIm7b5*0.5 VI7*0.5 II7 II7 | V7 IIIm7*0.5 VIm7*0.5 IIm7*0.25 IIm7*0.25 VIIm7b5*0.25 III7*0.25 VIm*0.5 bVII7*0.5 IIIm7*0.5 VI7b9*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-blackbird',    basePc: 5,  name: 'Bye Bye Blackbird',     note: 'Henderson — I6 to III7 chains',
      text: 'I6 IIm7*0.5 V7*0.5 I6 I6 I6 bIIIdim7 IIm7 V7 | IIm7 IIm IIm7 V7 IIm7 V7 I6 I6 | Vm7*0.5 I7*0.5 #IVm7*0.5 VII7*0.5 IVm7*0.5 bVII7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 IIm*0.5 IIm7*0.5 IIm*0.5 #IVm7*0.5 bVII7*0.5 IIm7*0.5 V7*0.5 | I6 IIm7*0.5 V7*0.5 I6 IIIm7b5*0.5 VI7*0.5 IIm7 V7 I6 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-cpw',          basePc: 11, name: 'Central Park West',     note: 'reduced chart — whole-step descent, loops as ♭II→I',
      text: 'Imaj7*2 #VIm7 II7 #Vmaj7*2 Vm7 I7 IVmaj7*2 IIIm7 VI7 bIImaj7*2' },
    { group: 'standards', id: 'std-ceora',        basePc: 8,  name: 'Ceora',                 note: 'AABA — Lee Morgan',
      text: 'Imaj7 IVmaj7 Imaj7 IVmaj7 IIIm7 VIm7 IIm7*0.5 V7*0.5 Imaj7 | Imaj7 IVmaj7 Imaj7 IVmaj7 IIIm7 VIm7 IIm7*0.5 V7*0.5 Imaj7 | IIm7 V7 VIImaj7*2 VIIm7 III7 VImaj7*2 | Imaj7 IVmaj7 Imaj7 IVmaj7 IIIm7 VIm7 IIm7*0.5 V7*0.5 Imaj7' },
    { group: 'standards', id: 'std-chelseabridge',basePc: 10, name: 'Chelsea Bridge',        note: 'Strayhorn — impressionist ♭III7♯11 blocks',
      text: 'IV7#11 bIII7#11 IV7#11*0.5 bIII7#11*0.5 I7 IVm7 bVII7 bIII bIII7*0.25 II7*0.25 bII7*0.25 I7*0.25 | IV7#11 bIII7#11 IV7#11*0.5 bIII7#11*0.5 I7 IVm7 bVII7 bIII bIII | bVIm7*0.5 bII7*0.5 #IV*0.5 VIdim7*0.5 bVIm7*0.5 V7*0.5 #IV7 VII*0.5 III7*0.5 VI VIm bIII7*0.25 II7*0.25 bII7*0.25 I7*0.25 | IV7#11 bIII7#11 IV7#11*0.5 bIII7#11*0.5 I7 IVm7 bVII7 bIII bIII' },
    { group: 'standards', id: 'std-cherokee',     basePc: 10, name: 'Cherokee',              note: 'Noble — 64 bars; the bridge runs the ii–V ladder',
      text: 'Imaj7 Imaj7 Vm7 I7 IVmaj7 IVmaj7 bVII9 bVII9 | Imaj7 Imaj7 II7 II7 IIm7 VI7b9 IIm7 V7#5 | Imaj7 Imaj7 Vm7 I7 IVmaj7 IVmaj7 bVII9 bVII9 | Imaj7 Imaj7 II7 II7 IIm7 V7 Imaj7 Imaj7 | bIIIm7 bVI7 bIImaj7 bIImaj7 bIIm7 #IV7 VIImaj7 VIImaj7 | VIIm7 III7 VImaj7 VImaj7 VIm7 II7 IIm7 V7#5 | Imaj7 Imaj7 Vm7 I7 IVmaj7 IVmaj7 bVII9 bVII9 | Imaj7 Imaj7 II7 II7 IIm7 V7 Imaj7 V7#9' },
    { group: 'standards', id: 'std-confirmation', basePc: 5,  name: 'Confirmation',          note: 'Parker — rhythm changes in F, alted turns',
      text: 'Imaj7 VIIm7b5*0.5 III7*0.5 VIm7*0.5 II7*0.5 Vm7*0.5 I7*0.5 IV7 IIIm7*0.5 VI7*0.5 II7 V7 | Imaj7 VIIm7b5*0.5 III7*0.5 VIm7*0.5 II7*0.5 Vm7*0.5 I7*0.5 IV7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 | Vm7 I7 IVmaj7 IVmaj7 bVIIm7 bIII7 bVImaj7 IIm7*0.5 V7*0.5 | Imaj7 VIIm7b5*0.5 III7*0.5 VIm7*0.5 II7*0.5 Vm7*0.5 I7*0.5 IV7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7' },
    { group: 'standards', id: 'std-coral',        basePc: 0,  name: 'Coral',                 note: 'Jarrett — the B-major shift, G♭ pedal',
      text: 'Im7*0.5 IV7*0.5 II*0.5 bVIImaj7*0.5 VIm7b5*0.5 II7b9*0.5 Vm7*0.5 I7*0.5 VIImaj7*0.5 #IVmaj7*0.5 bVIm7*0.5 VIImaj7*0.5 #IV*0.125 bVI*0.125 bVI*0.125 bVI*0.125 bIIm7*0.125 bIIm7*0.125 bIIm7*0.125 bIIm7*0.125 IVm9*0.25 IVm9*0.25 IIm7b5*0.25 V7b9*0.25 | Im11' },
    { group: 'standards', id: 'std-corcovado',    basePc: 0,  name: 'Corcovado',             note: 'Jobim — quiet-nights two-feel (34 bars)',
      text: 'VIm7 VIm7 bVIdim7 bVIdim7 Vm7 I7 IVmaj7 IVmaj7 | IVm7 bVII7 IIIm7b5 VI7#5 II7 II7 IIm7b5 V7*0.5 bVIdim7*0.5 | VIm7 VIm7 bVIdim7 bVIdim7 Vm7 I7 IVmaj7 IVmaj7 | IVm7 bVII7 IIIm7 VIm7*0.5 VI7*0.5 IIm7 V7 IIIm7b5 VI7#9 | IIm7 V7' },
    { group: 'standards', id: 'std-countdown',    basePc: 10, name: 'Countdown',             note: 'Coltrane-cycle reharm of Tune Up',
      text: 'IIm7*0.5 bIII7*0.5 bVImaj7*0.5 VII7*0.5 IIImaj7*0.5 V7*0.5 Imaj7*2 | Im7*0.5 bII7*0.5 #IVmaj7*0.5 VI7*0.5 IImaj7*0.5 IV7*0.5 bVIImaj7*2 | Vm7*0.5 #V7*0.5 bIImaj7*0.5 III7*0.5 VImaj7*0.5 I7*0.5 IVmaj7*2' },
    { group: 'standards', id: 'std-days',         basePc: 5,  name: 'Days of Wine and Roses', note: 'Mancini — A/B, two keys a step apart',
      text: 'Imaj7*2 bVII7 VI7b9*0.5 VI7*0.5 VI7 IIm7*2 IVm7 bVII7 IIIm7 VIm7 IIm7 V7 VIIm7b5*0.5 III7b9*0.5 VIm7*0.5 II7*0.5 IIm7 V7 | Imaj7 bVII7 VI7b9*0.5 VI7*0.5 VI7 IIm7*2 IVm7 bVII7 IIIm7 VIm7 #IVm7b5 IV7 IIIm7*0.5 VIm7*0.5 IIm7*0.5 V7*0.5 I6 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-deweysquare',  basePc: 3,  name: 'Dewey Square',          note: 'Parker — Bird blues with a rhythm-bridge',
      text: 'I6 V7 I6*2 IV7 III7 VIm7 II7 V7*2 I6 II7 | III7*2 VI7*2 II7*2 V7*2 | I6 V7 I6*2 IV7 III7 VIm7 II7 V7*2 I6 II7' },
    { group: 'standards', id: 'std-donnalee',     basePc: 8,  name: 'Donna Lee',             note: 'Parker — over Indiana changes',
      text: 'Imaj7*0.5 IV7*0.5 IIIm7*0.5 VI7*0.5 II7 II7 IIm7 IIm7*0.5 V7#5*0.5 Imaj7 Vm7*0.5 I7#5*0.5 | IVmaj7 bVII7 IIIm7 VI7b9 II7 II7#11 IIm7 V7 | Imaj7*0.5 IV7*0.5 IIIm7*0.5 VI7*0.5 II7 II7 VIIm7b5 III7#9 VIm VIIm7*0.5 III7*0.5 | VIm7 III7 VIm7 bIIIdim7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-earlyautumn', basePc: 0,  name: 'Early Autumn',          note: 'Burns — descending maj7 chain',
      text: 'Imaj7 VII7#9 bVIImaj7 VI7#9 bVImaj7 V7#9 IIIm7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 | Imaj7 VII7#9 bVIImaj7 VI7#9 bVImaj7 V7#9 Imaj7 Imaj7 | IIm7*0.5 V7*0.5 Imaj7*0.5 bIIIdim7*0.5 IIm7*0.5 V7*0.5 Imaj7 Im7*0.5 IV7*0.5 bVIImaj7*0.5 bIII7*0.5 IImaj7*0.25 bII7*0.25 I7*0.25 VII7#9*0.25 bVII7*0.25 VImaj7*0.25 bVI7*0.25 V7*0.25 | Imaj7 VII7#9 bVIImaj7 VI7#9 bVImaj7 V7#9 Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-emily',        basePc: 9,  name: 'Emily',                 note: 'Mandel — through-composed drift (A minor home)',
      text: 'bIIImaj7 Im7 IVm7 bVII7 bVIIm7 bIII7 bVImaj7 V7#9 | Imaj7 VIm7 IIm7 V7 Im7 IV7 IVm7 bVII7#9 | bIIImaj7 Im7 IVm7 bVII7 bVIIm7 bIII7 bVImaj7 IIm7b5*0.5 V7#9*0.5 | Im7 II7#5 Vm7 I7 IVm7 bVII7 Vm7b5 I7 | VIm7b5 bVI7 Vm7 I7 IVm7 bVII7 bIIImaj7 bVII7#9' },
    { group: 'standards', id: 'std-evidence',     basePc: 3,  name: 'Evidence',              note: 'Dameron — rhythm changes, Parker alterations',
      text: 'Imaj7 IIIm7*0.5 VI7b9*0.5 IIm7 IIm7*0.5 V7b9*0.5 #IV7 IVm7*0.5 bVII7*0.5 IIm7 II7#9 | Imaj7 IIIm7*0.5 VI7b9*0.5 IIm7 IIm7*0.5 V7b9*0.5 #IV7 IVm7*0.5 bVII7*0.5 IIm7 II7#9 | Vm7 I7#11 IVmaj9 bVII7 VIm7 III7b5 II13 V7b9 | Imaj7 IIIm7*0.5 VI7b9*0.5 IIm7 IIm7*0.5 V7b9*0.5 #IV7 IVm7*0.5 bVII7*0.5 IIm7 II7#9' },
    { group: 'standards', id: 'std-fall',         basePc: 4,  name: 'Fall',                  note: 'Shorter — sus-heavy 16-bar form',
      text: 'VIm11 V7b9 Isus4 bVIm6 VIm11 V7b9 Isus4 VIImaj7 bVIImaj7 bVII7b9 bIIIm11 Vm9*0.5 IIImaj7*0.5 IIsus4 V7b9 Im11*0.5 bVImaj7*0.5' },
    { group: 'standards', id: 'std-fallinggrace', basePc: 8,  name: 'Falling Grace',         note: 'Swallow — wide-roaming 26-bar form',
      text: 'Imaj7*2 #IV7 VIIm7 VIm7*0.5 II7*0.5 V6*0.5 #IV7*0.5 VIIm7 IIImaj VImaj7 #VIm7b5 #II7 #Vm7 bIIm7*0.5 #IV7*0.5 VIImaj7 IIIm7 #IIIdim7 IImaj7 Vmaj7 #Vm7b5 bII7 #IVm7*0.5 IV7#5*0.5 IIIm7*0.5 VI7*0.5 IImaj7 Vmaj7 Imaj7 IVmaj7' },
    { group: 'standards', id: 'std-flyme',        basePc: 9,  name: 'Fly Me To The Moon',    note: 'circle-of-fifths A section',
      text: 'Im7 IVm7 bVII7 bIIImaj7 bVImaj7 IIm7b5*0.5 V7*0.5 Im7 I7' },
    { group: 'standards', id: 'std-footprints',   basePc: 0,  name: 'Footprints',            note: 'Shorter — 24-bar waltz form (D7→D♭7 slide)',
      text: 'Im7*8 IVm7*4 Im7*4 II7*2 bII7*2 Im7*4' },
    { group: 'standards', id: 'std-giantsteps',   basePc: 11, name: 'Giant Steps',           note: '26-bar Coltrane cycle (Improv-Visor chart)',
      text: 'Imaj7*0.5 bIII9*0.5 bVImaj7*0.5 VII9*0.5 IIImaj7 bVIIm9*0.5 bIII9*0.5 bVImaj7*0.5 VII9*0.5 IIImaj7*0.5 V9*0.5 Imaj7 #IVm9*0.5 VII9*0.5 | IIImaj9 bVIIm9*0.5 bIII9*0.5 bVImaj7 IIm7*0.5 V9*0.5 Imaj7 #IVm9*0.5 VII9*0.5 IIImaj7 IIm7*0.5 V9*0.5' },
    { group: 'standards', id: 'std-havemet',      basePc: 5,  name: 'Have You Met Miss Jones', note: 'Rodgers — the key-shifting bridge',
      text: 'Imaj7 IIIm7*0.5 VI7*0.5 IIm7 V7 IIIm7 VIm7 bIIIm7*0.5 bVI7*0.5 IIm7*0.5 V7*0.5 | Imaj7 IIIm7*0.5 VI7*0.5 IIm7 V7 IIIm7 VIm7 IIm7*0.5 V7*0.5 Vm7*0.5 I7*0.5 | IVmaj7 bIIIm7*0.5 bVI7*0.5 bIImaj7 VIIm7*0.5 III7*0.5 VImaj7 bIIIm7*0.5 bVI7*0.5 bIImaj7 IIm7*0.5 V7*0.5 | Imaj7 IIIm7*0.5 VI7*0.5 IIm7 V7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7b9*0.5' },
    { group: 'standards', id: 'std-rainyday',     basePc: 7,  name: "Here's That Rainy Day", note: 'Van Heusen — chromatic A, ii–V bridge',
      text: 'Imaj7 bIII7 bVImaj7 bIImaj7 IIm7 V7 Imaj7 Vm7*0.5 I7*0.5 | IVm7 bVII7 bIIImaj7 bVImaj7 IIm7 V7 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 | Imaj7 bIII7 bVImaj7 bIImaj7 IIm7 V7 Imaj7 Vm7*0.5 I7*0.5 | IVmaj7 IIm7*0.5 V7*0.5 Imaj7 II7#11 IIm7 V7 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-hhm',          basePc: 7,  name: 'How High the Moon',     note: 'AABA — modulating bridge, iim7 of the new key',
      text: 'Imaj7*2 Im7 IV7 bVIImaj7*2 bVIIm7 bIII7 | Imaj7*2 Im7 IV7 bVIImaj7*2 bVIIm7 bIII7 | IIm7 V7 Imaj7*2 bIIm7 bV7 bVImaj7*2 | Imaj7*2 Im7 IV7 bVIImaj7*2 bVIIm7 bIII7 bVImaj7 IIm7b5*0.5 V7b9*0.5 I6' },
    { group: 'standards', id: 'std-ifallinlove',  basePc: 3,  name: 'I Fall in Love Too Easily', note: 'Styne/Cahn — short form through remote keys',
      text: 'VIIm7*0.5 III7*0.5 VI*0.5 II*0.5 bVIm7b5*0.5 bII7*0.5 #IVm bVIm7b5*0.5 bII7#5*0.5 #IVm bIIIm7*0.5 bVI7*0.5 bVIm7b5*0.5 bII7*0.5 | bIIIm7b5*0.5 bVI7*0.5 bII7 bIIm7*0.5 #IV7*0.5 VIIm VIIm7*0.5 III7*0.5 VI*0.5 #IV7*0.5 VIIm7*0.5 III7*0.5 VI*0.25 VI*0.25 bIIm7b5*0.25 #IV7#9*0.25' },
    { group: 'standards', id: 'std-rhapsody',     basePc: 3,  name: 'I Hear a Rhapsody',     note: 'Friso/Fragments — minor ii–V chains',
      text: 'VIm9*0.5 bIII7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV9*0.5 IIIm7b5*0.5 VI7b9*0.5 IIm7b5 V7 Imaj7 VIIm7b5*0.5 III7#9*0.5 | VIm9*0.5 bIII7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV9*0.5 IIIm7b5*0.5 VI7b9*0.5 IIm7b5 V7 Imaj7 #IVm7b5*0.5 VII7*0.5 | IIIm7 #IVm7b5*0.5 VII7*0.5 IIIm VIm7*0.5 II7*0.5 Vmaj7 IIm7 IV7 III7#9 | VIm9*0.5 bIII7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IIIm7b5*0.5 bVII7*0.5 VI7*0.5 IIm7b5 V7 Imaj7 VIIm7b5*0.5 III7*0.5' },
    { group: 'standards', id: 'std-ishouldcare',  basePc: 0,  name: 'I Should Care',         note: 'Stordahl — rising line over ii–V',
      text: 'IIm7*0.5 V7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIIm7b5 VI7#9 IIm7 IVm7*0.5 bVII7*0.5 | Imaj7 VIIm7b5*0.5 III7#9*0.5 Vm7*0.5 I7*0.5 IVmaj7 VIIm7b5*0.5 III7#9*0.5 VIm7 VIm7*0.5 II7*0.5 IIm7*0.5 V7*0.5 | #IVm7b5*0.5 VII7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIIm7b5 VI7#9 IIm7 IVm7*0.5 bVII7*0.5 | VIm7 VIIm7b5*0.5 III7#9*0.5 VIm7 II7*0.25 II7*0.25 II7*0.25 bIIIdim7*0.25 IIm7 V7 Imaj7*0.5 IVmaj7*0.5 IIIm7b5*0.5 VI7b9*0.5' },
    { group: 'standards', id: 'std-iremapril',    basePc: 7,  name: "I'll Remember April",   note: 'de Paul — A minor to G minor drift',
      text: 'Imaj7 Imaj7 Imaj7 Imaj7 Im Im Im6 Im | IIm7b5 V7 IIIm7b5 VI7 IIm7 V7 Imaj7 Imaj7*0.5 I7#9*0.5 | IVm7 bVII7 bIIImaj7 Vm7*0.5 I7*0.5 IVm7 bVII7 bIIImaj7 bIIImaj7 | IIm7 V7 Imaj7 Imaj7 VIIm7 III7 VImaj7 IIm7*0.5 V7*0.5 | Imaj7 Imaj7 Imaj7 Imaj7 Im Im Im6 Im | IIm7b5 V7 IIIm7b5 VI7 IIm7 V7 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-sentimental',  basePc: 5,  name: 'In a Sentimental Mood', note: 'Ellington — i–iv with inner maj7/6 shifts',
      text: 'Im*0.5 Im(maj7)*0.5 Im7*0.5 Im6*0.5 IIm*0.5 IIm(maj7)*0.5 IIm7*0.5 IIm6*0.5 III7#5 VIm7 VI7 IIm7*0.5 bII7*0.5 Imaj7 | bVImaj7*0.5 IVm7*0.5 bVIIm7*0.5 bVI7*0.5 bVImaj7*0.5 IVm7*0.5 bVIIm7*0.5 bVI7*0.5 bVImaj7*0.5 IVm7*0.5 bVII7*0.5 III7*0.5 bVImaj7*0.5 IVm7*0.5 bVIIm7*0.5 bVI7*0.5 IIm7 V7 | Im*0.5 Im(maj7)*0.5 Im7*0.5 Im6*0.5 IIm*0.5 IIm(maj7)*0.5 IIm7*0.5 IIm6*0.5 III7#5 VIm7 VI7 IIm7 V7b9 Imaj7' },
    { group: 'standards', id: 'std-sweetway',     basePc: 3,  name: 'In Your Own Sweet Way', note: 'Brubeck — the ♯IVm7♭5–VII7 launchpad',
      text: '#IVm7b5*0.5 VII7*0.5 IIIm7*0.5 VI7*0.5 VIm7*0.5 II7*0.5 Vmaj7*0.5 Imaj7*0.5 IVm7*0.5 bVII7*0.5 bIIImaj7*0.5 bVImaj7*0.5 VIm7b5*0.5 II7b9*0.5 Vmaj7 | #IVm7b5*0.5 VII7*0.5 IIIm7*0.5 VI7*0.5 VIm7*0.5 II7*0.5 Vmaj7*0.5 Imaj7*0.5 IVm7*0.5 bVII7*0.5 bIIImaj7*0.5 bVImaj7*0.5 VIm7b5*0.5 II7b9*0.5 Vmaj7 | bIIm7b5*0.5 #IV7#9*0.5 VIImaj7 bIIm7*0.5 #IV7*0.5 VIImaj7 VIIm7*0.5 III7*0.5 VImaj7 Im7*0.5 IV7*0.5 III7 | #IVm7b5*0.5 VII7*0.5 IIIm7*0.5 VI7*0.5 VIm7*0.5 II7*0.5 Vmaj7*0.5 Imaj7*0.5 IVm7*0.5 bVII7*0.5 bIIImaj7*0.5 bVImaj7*0.5 VIm7b5*0.5 II7b9*0.5 Vmaj7' },
    { group: 'standards', id: 'std-infanteyes',   basePc: 3,  name: 'Infant Eyes',           note: 'Shorter — suspended ballad in E♭',
      text: 'IIIm7 IIm7 Imaj7 #IV13 bIIImaj7 VIm7 Im7 Vsus4 | V13 Imaj7 bIImaj7 Imaj7 bIImaj7 bVImaj7 Vsus4 IVm7 | Isus4 VII7b9 IIIm7 IIm7 Imaj7 #IV13 bIIImaj7 VIm7 | Im7 Vsus4 Vsus4' },
    { group: 'standards', id: 'std-innerurge',    basePc: 7,  name: 'Inner Urge',            note: 'Henderson — four bars each, then the crunch',
      text: 'IVmaj7*4 VImaj7*4 bVImaj7*4 Vmaj7 VIIm7b5 bIII7#9 IVmaj7' },
    { group: 'standards', id: 'std-joyspring',    basePc: 5,  name: 'Joy Spring',            note: 'Brown — A sections that keep re-modulating',
      text: 'Imaj7 IIm7*0.5 V7*0.5 Imaj7 IVm7*0.5 bVII7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 bIIIm7*0.5 bVI7*0.5 | bIImaj7 bIIIm7*0.5 bVI7*0.5 bIImaj7 #IVm7*0.5 VII7*0.5 IVm7*0.5 bVII7*0.5 bIIIm7*0.5 bVI7*0.5 bIImaj7 IIIm7*0.5 VI7*0.5 | IImaj7 IIm7*0.5 V7*0.5 Imaj7 Im7*0.5 IV7*0.5 bVIImaj7 bIIIm7*0.5 bVI7*0.5 bIImaj7 IIm7*0.5 V7*0.5 | Imaj7 IIm7*0.5 V7*0.5 Imaj7 IVm7*0.5 bVII7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-mercedes',     basePc: 7,  name: 'Ladies in Mercedes',    note: 'Liebman — planing pairs of ii–Vs',
      text: 'Imaj7 Imaj7 IV7 IV7 IIIm7 IIIm7 VI7 VI7 | #IV7 #IV7 VIIm7 VIIm7 bVIm7b5 bVIm7b5 bII7b9 bII7b9 | #IVmaj7 #IVmaj7 VII7 VII7 bVIIm7 bVIIm7 bIII7 bIII7 | I7#5 I7#5 IVm7 IVm7 IIm7b5 IIm7b5 V7b9 V7b9' },
    { group: 'standards', id: 'std-ladybird',     basePc: 0,  name: 'Lady Bird',             note: 'Dameron — backdoor ii–V, whole-step bridge',
      text: 'Imaj7*2 IVm7 bVII7 Imaj7*2 IVm7*0.5 bVII7*0.5 Imaj7 | Imaj7*2 IVm7 bVII7 Imaj7*2 IVm7*0.5 bVII7*0.5 Imaj7 | bVImaj7 bII7 #IVmaj7 VII7 IIImaj7 VI7 IImaj7 V7 | Imaj7*2 IVm7 bVII7 Imaj7*2 IVm7*0.5 bVII7*0.5 Imaj7' },
    { group: 'standards', id: 'std-lakes',        basePc: 2,  name: 'Lakes (solo section)',  note: 'Metheny — D pedal A, then maj7 planing',
      text: 'I V IV V I V IV V | Imaj7*0.5 bVIIsus4*0.5 bIIImaj7*0.5 #IVsus4*0.5 VIImaj7*0.5 VIsus4*0.5 IImaj7*0.5 Isus4*0.5 IVmaj7*0.5 bIIIsus4*0.5 bVImaj7*0.5 VIIsus4*0.5 IIImaj7*0.5 IVsus4*0.5 bVIImaj7*0.5 Vsus4*0.5 | Imaj7*0.5 bVIIsus4*0.5 bIIImaj7*0.5 #IVsus4*0.5 VIImaj7*0.5 VIsus4*0.5 IImaj7*0.5 Isus4*0.5 IVmaj7*0.5 bIIIsus4*0.5 bVImaj7*0.5 VIIsus4*0.5 IIImaj7*0.5 IVsus4*0.5 bVIImaj7*0.5 Vsus4*0.5' },
    { group: 'standards', id: 'std-laura',        basePc: 0,  name: 'Laura',                 note: 'Raksin — chromatic A-section (sheet in C; the list showed B♭)',
      text: 'VIm9 IIsus4 II7b9 Vmaj9 I7*0.5 Vmaj7*0.5 Vm7 Vsus4 I7b9 IVmaj9*2 IVm7 bVIIsus4 bIIImaj7 V7#5 Im7 VIm7b5 II7b9 II9*0.5 Vmaj7*0.5' },
    { group: 'standards', id: 'std-mft',          basePc: 4,  name: 'My Favorite Things',    note: '3/4 — modal waltz, E minor',
      text: 'Im7 IIm7 Im7 IIm7 bVImaj7*2 IVm7 bVII7 bIIImaj7 bVImaj7 bIIImaj7 bVImaj7 IIm7b5 V7 Im7 IIm7 Im7 IIm7 bVImaj7*2 IVm7 bVII7 bIIImaj7 bVImaj7 bIIImaj7 bVImaj7 IIm7b5 V7 | Imaj7 IIm7 Imaj7 IIm7 IVmaj7*4 IVm7 bVII7 bIIImaj7 bVImaj7' },
    { group: 'standards', id: 'std-valentine',    basePc: 0,  name: 'My Funny Valentine',    note: 'C minor — inner-line shifts (Cm→CmMaj7→Cm7→Cm6)',
      text: 'Im Im(maj7) Im7 Im6 bVImaj7 bVIm6*0.5 IVm7b5*0.5 IIm7b5 V7b9 | Im Im(maj7) Im7 Im6 bVImaj7 IVm6 bVIm6 bVII7b9 | bIIImaj7*0.5 IVm7*0.5 Vm7*0.5 IVm7*0.5 bIIImaj7*0.5 IVm7*0.5 Vm7*0.5 IVm7*0.5 bIIImaj7*0.5 IVm7*0.5 V13*0.5 Im7*0.5 bVIIm7*0.5 VI13 bVImaj7*0.5 IIm7b5*0.5 V7b9*0.5 | Im Im(maj7) Im7 Im6 bVImaj7 IIm7b5*0.5 V7b9*0.5 Im*0.5 bVIIm7*0.5 VI7#11 bVImaj7*0.5 IVm7*0.5 bVII7b9*0.5 bIII6' },
    { group: 'standards', id: 'std-oleo',         basePc: 10, name: 'Oleo',                  note: 'rhythm changes — one full chorus',
      text: 'Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 V7 Imaj7*0.5 #Idim7*0.5 IIm7*0.5 V7*0.5 Imaj7 | Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 V7 Imaj7*0.5 #Idim7*0.5 IIm7*0.5 V7*0.5 bII7 | III7*2 VI7*2 II7*2 V7*2 | Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 VI7*0.5 IIm7*0.5 V7*0.5 V7 Imaj7*0.5 #Idim7*0.5 IIm7*0.5 V7*0.5 Imaj7' },
    { group: 'standards', id: 'std-onenote',      basePc: 10, name: 'One Note Samba',        note: 'Jobim — descending chromatic ii–V pairs',
      text: 'IIIm7 bIII7 IIm7 bII7b5 IIIm7 bIII7 IIm7 bII7b5 | Vm7 I7 IV IVm IIIm7 bIII7 IIm7*0.5 bII7b5*0.5 I | IVm7 bVII7 bIII bIII bIIIm7 bVI7 bII IIm7b5*0.5 bII7b5*0.5 | IIIm7 bIII7 IIm7 bII7b5 IIIm7 bIII7 IIm7 bII7b5 | Vm7 I7 IV IVm bIII II7 bII I' },
    { group: 'standards', id: 'std-nowhere',      basePc: 7,  name: 'Out of Nowhere',        note: 'Green — the B♭m7–E♭7 sidestep',
      text: 'Imaj7*2 bIIIm7 bVI7 Imaj7*2 IIIm7 VI7b9 IIm7 VI7b9 IIm7*2 bVI7*2 Vsus4 V7b9 | IIm7 VI7b9 IIm7 IVm6 IIIm7*0.5 bIIIdim7*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-pannonica',    basePc: 0,  name: 'Pannonica',             note: 'Monk — sus and bVI colors in C',
      text: 'Imaj7 bIIIm7*0.5 bVIsus4*0.5 IIm7*0.5 bVII7*0.5 bIIImaj7*0.5 VI7b5*0.5 bVI7*0.5 bII7*0.5 #IVmaj7*0.5 IV7b9*0.5 bIIIm7*0.25 bIIIm7*0.25 bVI7b9*0.25 V7b9*0.25 bIImaj7*0.5 bII6*0.5 | Imaj7 bIIIm7*0.5 bVIsus4*0.5 IIm7*0.5 bVII7*0.5 bIIImaj7*0.5 VI7b5*0.5 bVI7*0.5 bII7*0.5 #IVmaj7*0.5 IV7b9*0.5 bIIIm7*0.25 bIIIm7*0.25 bVI7b9*0.25 V7b9*0.25 bIImaj7*0.5 bII6*0.5 | Vm7*0.5 I7*0.5 Im7*0.5 IV7*0.5 #IV7 VIImaj7 IIm7*0.5 V7b9*0.5 Imaj7*0.25 Imaj7*0.25 Vm7*0.25 I7#11*0.25 VIIm7*0.5 III7*0.5 VI7#11*0.25 VI7#11*0.25 II7#5*0.25 V7b9*0.25 | Imaj7 bIIIm7*0.5 bVIsus4*0.5 IIm7*0.5 bVII7*0.5 bIIImaj7*0.5 VI7b5*0.5 bVI7*0.5 bII7*0.5 #IVmaj7*0.5 IV7b9*0.5 bIIIm7*0.25 bIIIm7*0.25 bVI7b9*0.25 V7b9*0.25 bIImaj7' },
    { group: 'standards', id: 'std-peace',        basePc: 10, name: 'Peace',                 note: 'Silver — two chords, whole-tone colors',
      text: 'VIIm7b5*0.5 III7b9*0.5 VIm7*0.5 II7*0.5 bIImaj7*0.25 bIImaj7*0.25 IIm7b5*0.25 V7b9*0.25 Imaj7 bIIm7*0.5 #IV7*0.5 VIImaj7*0.5 bVIm7*0.5 IVm7b5 bVII7b9 | bIIImaj7 II7#9*0.5 bII7#11*0.5 Imaj7' },
    { group: 'standards', id: 'std-solar',        basePc: 0,  name: 'Solar',                 note: 'Miles — 16-bar minor form',
      text: 'Im7*2 Vm7*2 I7*2 IVmaj7*2 IVm7*2 bVII7*2 bIIImaj7*2 IIm7b5*0.5 V7*0.5 Im7' },
    { group: 'standards', id: 'std-someday',      basePc: 10, name: 'Someday My Prince Will Come', note: 'Churchill — III7#5 and the G7 turn',
      text: 'Imaj9 III7#5 IVmaj7 VI13*0.25 VI13*0.25 VI7#9*0.25 IIm7 VI7#9 IIm7 Vsus4*0.25 Vsus4*0.25 IVdim7*0.25 | IIIm7 bIIIdim7 IIm7 V7*0.25 V13*0.25 IVdim7*0.25 IIIm7 bIIIdim7 IIm7 V7 | Imaj9 III7#5 IVmaj7 VI7#9 IIm7 VI7#9 IIm7 V7*0.25 V13*0.25 IVdim7*0.25 | IIIm7 I13 IVmaj7 #IVm7*0.25 #IVm7*0.25 VII7b9*0.25 Imaj7 VI7 IIm7 V7' },
    { group: 'standards', id: 'std-songfather',   basePc: 5,  name: 'Song For My Father',    note: 'Silver — Fm7 vamp, ♭VI7–V7#9 return',
      text: 'Im7 Im7 bVII7 bVII7 bVI7 V7#9 Im7 Im7 | Im7 Im7 bVII7 bVII7 bVI7 V7#9 Im7 Im7 | bVII9 bVII9 Im9 Im9 bVII9*0.5 bVI9*0.5 V7#9 Im11 Im11' },
    { group: 'standards', id: 'std-spain',        basePc: 11, name: 'Spain',                 note: 'Corea — condensed 24-bar loop (no 6/8 coda)',
      text: 'bVImaj7*4 V7*4 | IVm7 IVm7 bVII7 bVII7 bIIImaj7 bIIImaj7 bVImaj7 bVImaj7 | II7 II7 V7 V7 Isus4 Isus4 I7 I7' },
    { group: 'standards', id: 'std-stella',       basePc: 10, name: 'Stella By Starlight',   note: 'Young — ♯ivø and the bVIImaj7 half-dim run',
      text: '#IVm7b5 VII7 IIm7 V7 Vm7 I7 IVmaj7 bVII7#11 | Imaj7 #IVm7b5*0.5 VII7#9*0.5 IIIm7 Im7*0.5 IV7*0.5 Vmaj7 VIm7*0.5 II7*0.5 VIIm7b5 III7#9 | VI7#5 VI7#5 IIm7 IIm7 bVII7#11 bVII7#11 Imaj7 Imaj7 | #IVm7b5 VII7#9 IIIm7b5 VI7#9 IIm7b5 V7#9 Imaj7 Imaj7' },
    { group: 'standards', id: 'std-summertime',   basePc: 9,  name: 'Summertime',            note: 'Gershwin — 16-bar minor blues feel',
      text: 'IVm I7 IVm IVm*0.5 IV7#9*0.5 bVIIm bVIIm Vm7b5 I7#9 | IVm I7 IVm bVIIm7*0.5 bIII7*0.5 bVI Vm7b5*0.5 I7#9*0.5 IVm Vm7b5*0.5 I7#9*0.5' },
    { group: 'standards', id: 'std-sunny',        basePc: 9,  name: 'Sunny',                 note: 'Hebb — i–♭III–♭VI chain, V7#9',
      text: 'Im bVIIm7*0.5 bIII7*0.5 bVI7 IIm7b5*0.5 V7#9*0.5 Im bVIIm7*0.5 bIII7*0.5 bVI7 IIm7b5*0.5 V7#9*0.5 | Im Im Im Im bVIm IIm7b5*0.5 V7#9*0.5 Im V7#9' },
    { group: 'standards', id: 'std-atrain',       basePc: 0,  name: 'Take the A Train',      note: 'Strayhorn — II7b5 and the Fm6 turn',
      text: 'Imaj7 Imaj7 II7b5 II7b5 IIm7 V7 Imaj7 V7b9 | Imaj7 Imaj7 II7b5 II7b5 IIm7 V7 Imaj7 Vm7*0.5 I7*0.5 | IVmaj7 IVmaj7 IVmaj7 IVmaj7 II7 II7 IIm7 V7b9 | Imaj7 Imaj7 II7b5 II7b5 IIm7 V7 Imaj7 IIm7*0.5 V7b9*0.5' },
    { group: 'standards', id: 'std-dolphin',      basePc: 9,  name: 'The Dolphin',           note: 'Eça — A-major samba with bII color',
      text: 'Imaj7 II7 VII7#9 III7#9 bIIImaj7 bIIImaj7 VIm7b5 II7 | Vm7 Isus4 IVmaj7 bVI7#9 bIIm(maj7) bIIm7 bIIm6 I7#9 | IVmaj7 Vm7 IIIm7 VI7#9 IIm7b5 Vsus4 IVm7 bVII7 | IIm7 V7 III7#9 VI7#9 II7#9 V7#9 Imaj7 II7 | VII7#9 III7#9 VI7 II7 Vmaj7 bIII7 Vmaj7 bIII7 | IImaj7 Vmaj7' },
    { group: 'standards', id: 'std-duke',         basePc: 0,  name: 'The Duke',              note: 'Brubeck — dense inner-motion chart',
      text: 'Imaj7*0.5 IVmaj7*0.5 IIIm7*0.25 IIIm7*0.25 #IVm7*0.25 VII7*0.25 IIIm7*0.5 VIm7*0.5 IIm7*0.25 IIm7*0.25 IVm7*0.25 bVII7*0.25 bIIImaj7*0.5 bIImaj7*0.5 Im7*0.5 VII7#9*0.5 bVIIm7*0.25 bIII7*0.25 bVImaj7*0.25 bVImaj7*0.25 II7*0.5 bII7*0.5 | Imaj7*0.5 IVmaj7*0.5 IIIm7*0.25 IIIm7*0.25 #IVm7*0.25 VII7*0.25 IIIm7*0.5 VIm7*0.5 IIm7*0.25 IIm7*0.25 IVm7*0.25 bVII7*0.25 bIIImaj7*0.5 bIImaj7*0.5 Im7*0.5 VII7#9*0.5 bVIIm7*0.25 bIII7*0.25 bVImaj7*0.25 bVImaj7*0.25 II7*0.5 bII7*0.5 | IVmaj7*0.5 III7*0.5 II7*0.5 Imaj7*0.5 bVIIm7*0.5 bVImaj7*0.5 Vm7*0.25 I7*0.25 IVm7*0.25 IVm7*0.25 IIm7b5*0.25 bII7*0.25 bVI7*0.25 bVI7*0.25 Im7b5*0.25 IV7#11*0.25 bVIIm7*0.25 bVIIm7*0.25 bVImaj7*0.25 bVIIm7*0.25 bVImaj7*0.25 V7#9*0.25 IVm7*0.25 bIII7*0.25 bII13*0.25 bII13*0.25 | Imaj7*0.5 IVmaj7*0.5 IIIm7*0.25 IIIm7*0.25 #IVm7*0.25 VII7*0.25 IIIm7*0.5 VIm7*0.5 IIm7*0.25 IIm7*0.25 IVm7*0.25 bVII7*0.25 bIIImaj7*0.5 bIImaj7*0.5 Im7*0.5 VII7#9*0.5 bVIIm7*0.25 bIII7*0.25 bVImaj7*0.25 bVImaj7*0.25 II7*0.25 bII7*0.25 Imaj7*0.25 Imaj7*0.25 | IIIm6*0.5 I6*0.5 bVIaug*0.5 IVm6*0.5 I6*0.25 V9*0.25 I6*0.25 V9*0.25 I6*0.25 V7*0.25 Imaj7*0.25 Imaj7*0.25 IIIm7*0.5 Imaj7*0.5 VIm7*0.5 IVm6*0.5 I6*0.25 V9*0.25 I6*0.25 I6*0.25 V9*0.5 I6*0.5' },
    { group: 'standards', id: 'std-ipanema',      basePc: 5,  name: 'The Girl From Ipanema', note: 'Jobim — the ♭II7 side-step into F',
      text: 'Imaj7 Imaj7 II7 II7 IIm7 bII7#11 Imaj7 bII7#11 | Imaj7 Imaj7 II7 II7 IIm7 bII7#11 Imaj7 Imaj7 | bIImaj7 bIImaj7 #IV7 #IV7 bIIm7 bIIm7 VI7 VI7 | IIm7 IIm7 bVII7 bVII7 IIIm7 VI7 IIm7 V7#9 | Imaj7 Imaj7 II7 II7 IIm7 bII7#11 Imaj7 bII7#11' },
    { group: 'standards', id: 'std-therewill',    basePc: 3,  name: 'There Will Never Be Another You', note: 'Warren — E♭, ♯IVm7b5 launch',
      text: 'Imaj7 Imaj7 VIIm7b5 III7#9 VIm7 VIm7 Vm7 I7 | IVmaj7 IVm7*0.5 bVII7*0.5 Imaj7 VIm7 II13 II13 IIm7 V7 | Imaj7 Imaj7 VIIm7b5 III7#9 VIm7 VIm7 Vm7 I7 | IVmaj7 IVm7*0.5 bVII7*0.5 IIIm7*0.5 VIm7*0.5 bIIIdim7 Imaj7*0.5 IV7*0.5 III7#5*0.5 VI7b9*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 V7#5*0.5' },
    { group: 'standards', id: 'std-timeremem',    basePc: 11, name: 'Time Remembered',       note: 'Evans — rootless modal drift',
      text: 'Im9 bIImaj7 #IVmaj7 IVm9 bVIIm9*0.5 bIIIm7*0.5 bVIm7 IIImaj7 VImaj7 | bVIIm9 bIIIm9 bVIm7 bIIm7 #IVm9 IVm9 Im9 Im9 | IIIm9 bVIIm11 bIIm9 Vm9 Im9*0.5 bVIm9*0.5 IIImaj7 bIIIm9 bIIm9' },
    { group: 'standards', id: 'std-upjumped',     basePc: 10, name: 'Up Jumped Spring',      note: 'Hubbard — waltz with the Freddie bridge',
      text: 'Imaj7 VI7#9 IIm7 V7 VIm7 Vm7 #IVm7b5 VII7#9 | IIIm7 IVm7 IIIm7 IVm7 bIIm7b5 #IV7 IIm7b5 V7 | Imaj7 VI7#9 IIm7 V7 VIm7 Vm7 #IVm7b5 VII7#9 | IIIm7 IVm7 IIIm7 IVm7 IIm7 V7 Imaj7 VIIm7b5*0.25 VIIm7b5*0.25 III7b9*0.25 | VIm7 II7 Vmaj7 III7 bVIIm7 bIII7 IIm7 V7 | Imaj7 VI7#9 IIm7 V7 VIm7 Vm7 #IVm7b5 VII7#9 | IIIm7 IVm7 IIIm7 IVm7 IIm7 V7 bIImaj7 bIImaj7*0.25 Imaj7*0.25 Imaj7*0.25' },
    { group: 'standards', id: 'std-veryearly',    basePc: 0,  name: 'Very Early',            note: 'Evans — ♭VII9 planing in C',
      text: 'Imaj7 bVII9 bIIImaj7 bVI7#9 bIImaj7 V13 Imaj7 bVII9 | IImaj7 VIm7 #IVm7 VII7b9 IIIm7 bVI7 bIImaj7 V7#5 | Imaj7 bVII9 bIIImaj7 bVI7#9 bIImaj7 V13 Imaj7 bVII9 | IImaj7 VIm7 #IVm7 VII7b9 IIIm7 bVI7 bIImaj7 V7#5 | VIImaj7 bVI13 bIImaj7 bVII13 VIImaj7 V13 Imaj7 bVI13 | bIImaj7 V13 Imaj7 VI7b9 IIm7*0.25 IIm7*0.25 IIIm7*0.25 IV6*0.25 V13*0.25 V13*0.25 IIm7*0.25 IIIm*0.25 IIIm*0.25 IV*0.25 IV*0.25 V13*0.25 | IVmaj7*0.25 IVmaj7*0.25 IIIm7*0.25 IIm7*0.25 IIm7*0.25 Imaj7*0.25 VIImaj7' },
    { group: 'standards', id: 'std-virgo',        basePc: 5,  name: 'Virgo',                 note: 'Shorter — chromatic drift from F',
      text: 'Imaj7 IVm7*0.5 bVII7*0.5 VIm7b5*0.5 IV13*0.5 IIImaj7 IIIm9 Im7*0.5 IV13*0.5 VIIm7b5*0.5 bVII13*0.5 VImaj7 VIm7 Vm7*0.5 I7*0.5 bVII7*0.5 VI7b9*0.5 IIm7*0.5 bIII13*0.5 bIImaj7 VIm9*0.5 V7*0.5 IIm7 bVIm7*0.5 bII7*0.5 | Imaj7 IVm7*0.5 bVII7*0.5 VIm7b5*0.5 IV13*0.5 IIImaj7 IIIm7 Im7*0.5 IV13*0.5 VIIm7b5*0.5 bVII13*0.5 VIm7*0.5 bII7#5*0.5 Vm7*0.5 I7*0.5 IVmaj7 VII7#5*0.5 III7#5*0.5 VIm9 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-watermelon',   basePc: 5,  name: 'Watermelon Man',        note: 'Hancock — 16-bar blues with the ♯IV7',
      text: 'I7 I7 I7 I7 IV IV I7 I7 | V7 IV7 V7 IV7 V7*0.25 V7*0.25 V7*0.25 #IV7*0.25 IV7 I7 I7' },
    { group: 'standards', id: 'std-whenifall',    basePc: 3,  name: 'When I Fall in Love',   note: 'Heyman — I–VI–ii–V with remote keys',
      text: 'Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV7*0.5 bVII7#11*0.5 VI7#5*0.5 IIm7*0.5 bVI7*0.5 V7*0.5 V7b9*0.5 | Imaj7*0.5 #IV7#11*0.5 IVmaj7*0.5 bVII7*0.5 IIIm7*0.5 IVmaj7*0.5 IIIm7b5*0.5 VI7#9*0.5 IIm7*0.5 VII7#9*0.5 bVII7#11*0.5 VI7*0.5 IIm7*0.5 VI7#5*0.5 IIm7*0.5 V7*0.5 | Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 Imaj7*0.5 IV7*0.5 bVII7#11*0.5 VI7#5*0.5 IIm7 V7 | Imaj7*0.5 #IV7#9*0.5 IVmaj7*0.5 VII7*0.5 IIIm7*0.5 VI7*0.5 IIm7*0.5 bVII7*0.5 Imaj7*0.5 VI7#9*0.5 IIm7*0.5 V7*0.5 Imaj7 IIm7*0.5 V7*0.5' },
    { group: 'standards', id: 'std-whensunny',    basePc: 5,  name: 'When Sunny Gets Blue',  note: 'Fisher — bittersweet ♭-side moves',
      text: 'IIm7*0.5 V7*0.5 IVm7*0.5 bVII7*0.5 Imaj7*0.5 IIm7*0.5 IIIm7*0.5 VI7b9*0.5 #IVm7b5*0.25 #IVm7b5*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.5 bIIIdim7*0.5 IIm7*0.5 V7*0.5 IIIm7*0.5 VI7b9*0.5 | IIm7*0.5 V7*0.5 IVm7*0.5 bVII7*0.5 Imaj7*0.5 IIm7*0.5 IIIm7*0.5 VI7b9*0.5 #IVm7b5*0.25 #IVm7b5*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.5 bIIIdim7*0.5 IIm7*0.5 V7*0.5 VIIm7*0.5 III7*0.5 | VImaj7*0.5 VIIm7*0.5 bIIm7*0.5 #IV7*0.5 VIIm7*0.5 III7*0.5 VImaj7 VIm7*0.5 II7*0.5 Vmaj7*0.5 III7#9*0.5 VIm7*0.5 II7*0.5 IIm7*0.25 IIm7*0.25 IIIm7*0.25 VI7b9*0.25 | IIm7*0.5 V7*0.5 IVm7*0.5 bVII7*0.5 Imaj7*0.5 IIm7*0.5 IIIm7*0.5 VI7b9*0.5 #IVm7b5*0.25 #IVm7b5*0.25 IVm7*0.25 bVII7*0.25 IIIm7*0.5 bIIIdim7*0.5 IIm7*0.5 V7*0.5 Imaj7' },
];
PROG_PRESETS.push.apply(PROG_PRESETS, PROG_STANDARDS);

// --- Share links (§11, §16.9) ----------------------------------------------------

// Root-name -> pitch class, both spellings (encode always uses PROG_NOTE_NAMES).
const PROG_NOTE_PC = {
    'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5,
    'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11
};

// Display tension of a candidate (§16.4): atlas scales carry the curated
// number; arpeggios (chord tones only) read as the calmest.
function progTensionOf(cand) {
    const s = PROG_SCALES.find(x => x.id === cand.id);
    return s ? s.tension : 0.05;
}

// A candidate id the share grammar may carry (plan segments, picks): an atlas
// scale, or a chord-arpeggio reference into PROG_QUALITIES.
function progKnownScaleId(id) {
    return PROG_SCALES.some(s => s.id === id) ||
        (typeof id === 'string' && id.indexOf('arp-') === 0 &&
            PROG_QUALITIES.hasOwnProperty(id.slice(4)));
}

// The selectable phrase grids (§9.3), model-layer home so share decode can
// validate the `dv` key (the DOM layer's PL_DIVISIONS aliases this).
const PROG_DIVISIONS = { eighth: 2, triplet: 3, sixteenth: 4 };

// The transport/ranking knobs a full share link can carry, with their shipped
// defaults. Only non-default values encode, so a default-state link stays
// byte-identical to the bare v2.0 payload.
const PROG_SHARE_DEFAULTS = {
    bpm: 120, bars: 2, loop: true, countIn: false, swing: true, div: 'eighth',
    color: 0.5, flow: true, ghosts: true, linkDyads: true
};

// settings is plState-shaped {bpm, bars, loop, countIn, swing, div, color,
// flow, ghosts, linkDyads, noResolve}; picks is chord index -> scale id.
// Returns the '&k=v' block ('' when everything is default), keys in a fixed
// order so equal states encode equal links.
function progEncodeShareSettings(settings, picks) {
    const s = settings || {};
    const d = PROG_SHARE_DEFAULTS;
    const bool = v => v ? '1' : '0';
    const parts = [];
    if (typeof s.bpm === 'number' && isFinite(s.bpm) && Math.round(s.bpm) !== d.bpm) {
        parts.push('b=' + Math.round(s.bpm));
    }
    if (typeof s.bars === 'number' && isFinite(s.bars) && s.bars !== d.bars) {
        parts.push('bc=' + s.bars);
    }
    if (typeof s.loop === 'boolean' && s.loop !== d.loop) parts.push('l=' + bool(s.loop));
    if (typeof s.countIn === 'boolean' && s.countIn !== d.countIn) parts.push('ci=' + bool(s.countIn));
    if (typeof s.swing === 'boolean' && s.swing !== d.swing) parts.push('sw=' + bool(s.swing));
    if (typeof s.div === 'string' && PROG_DIVISIONS[s.div] && s.div !== d.div) parts.push('dv=' + s.div);
    if (typeof s.color === 'number' && isFinite(s.color) &&
        Math.round(s.color * 100) / 100 !== d.color) {
        parts.push('cw=' + (Math.round(s.color * 100) / 100));
    }
    if (typeof s.flow === 'boolean' && s.flow !== d.flow) parts.push('fl=' + bool(s.flow));
    if (typeof s.ghosts === 'boolean' && s.ghosts !== d.ghosts) parts.push('gh=' + bool(s.ghosts));
    if (typeof s.linkDyads === 'boolean' && s.linkDyads !== d.linkDyads) parts.push('ld=' + bool(s.linkDyads));
    const nr = s.noResolve;
    const nrIdx = nr ? Object.keys(nr).filter(i => nr[i]) : [];
    if (nrIdx.length) parts.push('nr=' + nrIdx.join(','));
    const pk = picks || {};
    const pkIdx = Object.keys(pk).filter(i => pk[i] && progKnownScaleId(pk[i]));
    if (pkIdx.length) parts.push('k=' + pkIdx.map(i => i + ':' + pk[i]).join(','));
    return parts.join('&');
}

// Parse '&'-joined key=value segments. Junk keys and malformed values drop
// per-key (one bad key never nukes a valid one); numbers clamp exactly like
// plRestore. Returns {settings, picks} holding only what parsed — absent
// keys leave the recipient's own values alone. chordCount (from the decoded
// progression) prunes stale pick indexes.
function progDecodeShareSettings(segments, chordCount) {
    const settings = {};
    const picks = {};
    const BOOL_KEYS = { l: 'loop', ci: 'countIn', sw: 'swing', fl: 'flow', gh: 'ghosts', ld: 'linkDyads' };
    segments.forEach(seg => {
        const eq = seg.indexOf('=');
        if (eq < 1) return;
        const key = seg.slice(0, eq);
        const val = seg.slice(eq + 1);
        if (key === 'b' || key === 'bc' || key === 'cw') {
            const n = parseFloat(val);
            if (!isFinite(n)) return;
            if (key === 'b') settings.bpm = Math.min(240, Math.max(40, n));
            else if (key === 'bc') settings.bars = Math.min(8, Math.max(1, n));
            else settings.color = Math.min(1, Math.max(0, n));
        } else if (BOOL_KEYS[key]) {
            if (val === '1' || val === '0') settings[BOOL_KEYS[key]] = val === '1';
        } else if (key === 'dv') {
            if (PROG_DIVISIONS[val]) settings.div = val;
        } else if (key === 'nr') {
            val.split(',').forEach(t => {
                if (/^\d+$/.test(t)) {
                    if (!settings.noResolve) settings.noResolve = {};
                    settings.noResolve[t] = true;
                }
            });
        } else if (key === 'k') {
            val.split(',').forEach(t => {
                const m = /^(\d+):([A-Za-z0-9_-]+)$/.exec(t);
                if (!m || !progKnownScaleId(m[2])) return;
                const idx = parseInt(m[1], 10);
                if (chordCount != null && idx >= chordCount) return;
                picks[idx] = m[2];
            });
        }
    });
    return { settings: settings, picks: picks };
}

// Plan suffix grammar (share links only — the editor itself never needs it):
//   Imaj7*4[ionian*2;lydian;ionian~01]
// segments joined by ';', each `id` or `id*bars` (the absorbing last segment
// has no *bars), then optional '~' + one 1/0 per internal boundary (omitted
// when they are all on). Commas still separate tokens; the payload is
// URL-encoded by the DOM layer, so nothing here can collide.
function progEncodePlanSuffix(plan) {
    if (!plan || !plan.segments || !plan.segments.length) return '';
    const segs = plan.segments.map(s => s.id + (s.bars != null ? '*' + s.bars : '')).join(';');
    const links = plan.links || [];
    const mask = plan.segments.slice(1).map((s, i) => links[i] === false ? '0' : '1').join('');
    const hasOff = mask.indexOf('0') !== -1;
    return '[' + segs + (hasOff ? '~' + mask : '') + ']';
}

function progDecodePlanSuffix(str) {
    const parts = String(str).split('~');
    if (parts.length > 2) return null;
    const linkPart = parts.length > 1 ? parts[1] : null;
    if (linkPart != null && !/^[01]*$/.test(linkPart)) return null;
    const segments = [];
    const raws = parts[0].split(';').filter(Boolean);
    if (!raws.length) return null;
    for (let i = 0; i < raws.length; i++) {
        const m = /^([^*]+?)(?:\*(\d+(?:\.\d+)?|\.\d+))?$/.exec(raws[i]);
        if (!m) return null;
        const id = m[1];
        if (!progKnownScaleId(id)) return null;
        const bars = m[2] != null ? parseFloat(m[2]) : null;
        if (m[2] != null && (!isFinite(bars) || bars <= 0 || bars > 64)) return null;
        segments.push({ id: id, bars: i === raws.length - 1 ? null : (bars == null ? 1 : bars) });
    }
    const links = [];
    for (let i = 0; i < segments.length - 1; i++) {
        links.push(linkPart != null && linkPart[i] === '0' ? false : true);
    }
    return { segments: segments, links: links };
}

// A progression collapses to a preset reference when nothing user-made rides
// on it: the text is the preset's (whitespace-insensitive) and no plans,
// picks or per-chord resolution overrides exist. The base root and transport
// settings do not count as modifications — the short link carries the root,
// and settings never ride it by design.
function progFindSharePreset(text, plans, picks, noResolve) {
    const empty = o => !o || !Object.keys(o).some(k => o[k]);
    if (!empty(plans) || !empty(picks) || !empty(noResolve)) return null;
    const norm = s => String(s).split(/\s+/).filter(Boolean).join(' ');
    const t = norm(text);
    if (!t) return null;
    const hit = PROG_PRESETS.find(p => norm(p.text) === t);
    return hit ? hit.id : null;
}

function progEncodePresetShare(presetId, basePc) {
    return '~' + presetId + '@' + progNoteName(basePc);
}

// `C@IIm7,V7,Imaj7` — root name + @ + comma-joined tokens (commas never occur
// in the grammar, and the payload is URL-encoded by the DOM layer, so '#' and
// unicode aliases survive). With `plans` (chord index -> plan, §16.9) each
// chord token gains its plan suffix; the absorbing last segment and the
// all-on link mask encode compactly. `picks` (chord index -> scale id for
// plan-less chords) and `settings` (§11 knobs) ride as an '&key=value' block
// after the tokens — the grammar never uses '&', so the split is unambiguous.
// A default state encodes no block at all (byte-identical to v2.0 links).
function progEncodeShare(basePc, text, plans, picks, settings) {
    const tokens = String(text).split(/\s+/).filter(Boolean);
    let payload = tokens;
    if (plans) {
        // chord indexes count parseable chords/specials in order — exactly
        // what progParseProgression expands (dots included)
        const expanded = progParseProgression(text);
        let ci = 0;
        payload = expanded.map(tok => {
            const isChord = tok.type === 'chord' || tok.type === 'special';
            const suffix = isChord && plans[ci] ? progEncodePlanSuffix(plans[ci]) : '';
            if (isChord) ci++;
            return tok.source + suffix;
        });
    }
    let out = progNoteName(basePc) + '@' + payload.join(',');
    const extra = progEncodeShareSettings(settings, picks);
    if (extra) out += '&' + extra;
    return out;
}

function progDecodeShare(str) {
    const raw = String(str).trim();
    // Preset short-form: "~id@root" — an unmodified shipped preset. The id is
    // never alias-folded (ids contain '-', which folding would rewrite).
    if (raw.charAt(0) === '~') {
        const pm = /^~([A-Za-z0-9_-]+)@([A-Ga-g][#b♯♭]{0,2})$/.exec(raw);
        if (!pm) return null;
        const preset = PROG_PRESETS.find(p => p.id === pm[1]);
        if (!preset) return null; // an older catalog quietly ignores the link
        const ppc = PROG_NOTE_PC[progFoldAliases(pm[2]).toUpperCase()];
        if (ppc === undefined) return null;
        return { basePc: ppc, text: preset.text, presetId: preset.id };
    }
    // Settings ride after '&' — split them off before the root/tokens regex.
    const amp = raw.indexOf('&');
    const main = amp === -1 ? raw : raw.slice(0, amp);
    const m = /^([A-Ga-g][#b♯♭]{0,2})@(.+)$/.exec(main);
    if (!m) return null;
    const pc = PROG_NOTE_PC[progFoldAliases(m[1]).toUpperCase()];
    if (pc === undefined) return null;
    const plans = {};
    const textParts = [];
    let ci = 0;
    m[2].split(',').forEach(rawTok => {
        const tok = rawTok.trim();
        if (!tok) return;
        let head = tok, suffix = null;
        const pm = /^(.+?)\[([^\]]*)\]$/.exec(tok);
        if (pm) {
            head = pm[1];
            suffix = progDecodePlanSuffix(pm[2]);
        }
        const isChord = head === '.' || progParseChordToken(head.replace(/\*\d+(?:\.\d+)?$/, '')).ok;
        if (isChord) {
            if (suffix) plans[ci] = suffix;
            ci++;
        }
        textParts.push(head);
    });
    const text = textParts.join(' ');
    if (!text) return null;
    const out = { basePc: pc, text: text };
    if (Object.keys(plans).length) out.plans = plans;
    if (amp !== -1) {
        const dec = progDecodeShareSettings(raw.slice(amp + 1).split('&'), ci);
        if (Object.keys(dec.picks).length) out.picks = dec.picks;
        if (Object.keys(dec.settings).length) out.settings = dec.settings;
    }
    return out;
}

// --- Top-level convenience ----------------------------------------------------

function progAnalyze(text, basePc, weights) {
    const tokens = progParseProgression(text);
    const chords = progRealizeProgression(tokens, basePc);
    return {
        tokens: tokens,
        chords: chords,
        suggestions: chords.map(c => progSuggestForChord(c, weights))
    };
}

// --- DOM layer (browser only; wired by initProgressionLab, called from the
// inline controller after the top bar exists) ---------------------------------
//
// Panel layout and behaviour per docs §3, §4.6, §10: editor with autocomplete,
// chord chips with "what you could type here" tooltips, base-root buttons,
// family-grouped suggestion cards with playback (chord + scale sounded
// together) and the selected scale marked on the main fretboard.

let plState = {
    open: false, text: 'IIm7 V7 Imaj7', basePc: 0, chordIdx: 0, pick: {},
    bpm: 120, bars: 2, loop: true, countIn: false, peek: false,
    expanded: {},   // family -> true when its card list is expanded past the top 6
    noResolve: {},  // chord index -> true when its ranking ignores the next chord
    plan: {},       // chord index -> {segments: [{id, bars}], links: [bool]} (§16)
    segIdx: 0,      // selected plan segment of the selected chord
    flow: true,     // global master: are internal boundaries evaluated at all
    color: 0.5,     // safety(0) <-> color(1) slider; 0.5 == the shipped weights
    ghosts: true,   // fretboard ghost pills for the next boundary's changes (§16.8)
    linkDyads: true, // play the strongest resolver pair at segment boundaries (§16.8)
    swing: true,    // off-beat eighths a third late — the jazz triplet feel (§9.3)
    div: 'eighth'   // the line's grid: eighth | triplet | sixteenth (§9.3 divisions)
};
let plAnalysis = null;
let plPulseTimers = [];
let plAcIndex = -1;
let plAcItems = [];

function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plStringOpenPcs() {
    return stringTunings.map(getNoteIndex);
}

function plQualitySymbol(qualityId) {
    return qualityId && PROG_QUALITIES[qualityId] ? PROG_QUALITIES[qualityId].symbol : '';
}

function plChordName(chord) {
    if (!chord.qualityId) return progNoteName(chord.rootPc);
    return progNoteName(chord.rootPc) + plQualitySymbol(chord.qualityId);
}

function plSave() {
    try {
        setCookie('p4lab', encodeURIComponent(JSON.stringify({
            t: plState.text, r: plState.basePc,
            b: plState.bpm, bc: plState.bars, l: plState.loop, ci: plState.countIn,
            nr: plState.noResolve,
            p: plState.plan, pk: plState.pick, fl: plState.flow, cw: plState.color,
            gh: plState.ghosts, ld: plState.linkDyads, sw: plState.swing, dv: plState.div
        })), 365);
    } catch (e) { /* cookie budget exhausted — non-fatal */ }
}

function plRestore() {
    try {
        const raw = getCookie('p4lab');
        if (!raw) return;
        const saved = JSON.parse(decodeURIComponent(raw));
        if (saved && typeof saved.t === 'string') plState.text = saved.t;
        if (saved && typeof saved.r === 'number') plState.basePc = ((saved.r % 12) + 12) % 12;
        if (saved && typeof saved.b === 'number') plState.bpm = Math.min(240, Math.max(40, saved.b));
        if (saved && typeof saved.bc === 'number') plState.bars = Math.min(8, Math.max(1, saved.bc));
        if (saved && typeof saved.l === 'boolean') plState.loop = saved.l;
        if (saved && typeof saved.ci === 'boolean') plState.countIn = saved.ci;
        if (saved && saved.nr && typeof saved.nr === 'object') plState.noResolve = saved.nr;
        if (saved && saved.p && typeof saved.p === 'object') plState.plan = saved.p;
        if (saved && saved.pk && typeof saved.pk === 'object') plState.pick = saved.pk;
        if (saved && typeof saved.fl === 'boolean') plState.flow = saved.fl;
        if (saved && typeof saved.cw === 'number') plState.color = Math.min(1, Math.max(0, saved.cw));
        if (saved && typeof saved.gh === 'boolean') plState.ghosts = saved.gh;
        if (saved && typeof saved.ld === 'boolean') plState.linkDyads = saved.ld;
        if (saved && typeof saved.sw === 'boolean') plState.swing = saved.sw;
        if (saved && PL_DIVS[saved.dv]) plState.div = saved.dv;
    } catch (e) { /* corrupted cookie — defaults stand */ }
}

// --- refresh pipeline ---------------------------------------------------------

function plRefresh() {
    plAnalysis = progAnalyze(plState.text, plState.basePc, plWeights());
    if (plState.chordIdx >= plAnalysis.chords.length) {
        plState.chordIdx = Math.max(0, plAnalysis.chords.length - 1);
    }
    plApplyResolveWeights();
    plRealizeAll();
    plRenderChips();
    plRenderTension();
    plRenderRoots();
    plRenderCards();
    if (plState.open) plShowSelection();
    plSave();
}

// Recompute the suggestions of chords whose "resolution" toggle is off, so
// their ranking is fit + avoid-notes only (§7.4, per-chord option).
function plApplyResolveWeights() {
    if (!plAnalysis) return;
    const w = plWeights();
    plAnalysis.chords.forEach((chord, i) => {
        if (plState.noResolve[i]) {
            plAnalysis.suggestions[i] = progSuggestForChord(chord,
                { resolve: 0, penalty: w.penalty });
        }
    });
}

// --- scale plans (§16): state helpers -------------------------------------------

let plPlans = null; // chord index -> realized plan (progRealizePlan output) or null
let plDrag = null;   // live boundary drag {i, k, moved, startX, baseBars, pxPerBar}

// The safety<->color slider reshapes the three weights together (§16.5); at
// its 0.5 middle they are exactly the shipped PROG_WEIGHTS.
function plWeights() {
    const v = Math.min(1, Math.max(0, plState.color));
    return { resolve: 0.2 + 0.8 * v, flow: 0.2 + 0.8 * v, penalty: 1.2 - 0.8 * v };
}

// A chord's span in bars: its explicit "*N", else the transport's global
// bars-per-chord setting — the budget a plan partitions (§16.2 ownership).
function plChordSpanBars(chord) {
    return chord && chord.bars != null ? chord.bars : plState.bars;
}

// Realize every chord's plan against its slot budget. The global flow toggle
// mutes all internal boundaries (links read as false) without touching the
// stored per-boundary toggles.
function plRealizeAll() {
    plPlans = plAnalysis ? plAnalysis.chords.map((chord, i) => {
        const plan = plState.plan[i];
        if (!plan || !plan.segments || !plan.segments.length) return null;
        const links = plState.flow ? (plan.links || []) : plan.segments.map(() => false);
        return progRealizePlan(chord, { segments: plan.segments, links: links }, plItemSlots(chord),
            { slotsPerBar: plSlotsPerBar() });
    }) : null;
}

// The exit target of chord i (§16.2): the next chord's first plan segment
// when it has one (carrying its candidate for labels), else the next chord.
function plExitTarget(i) {
    if (!plAnalysis || plAnalysis.chords.length < 2) return null;
    const j = (i + 1) % plAnalysis.chords.length;
    const nPlan = plPlans[j];
    if (nPlan) {
        const cand = nPlan.segments[0].cand;
        return { tones: cand.tones, cand: cand };
    }
    return plAnalysis.chords[j];
}

// The selected chord's realized plan, or null when it plays the v2.0 pick.
function plSelectedPlan() {
    const chord = plSelectedChord();
    if (!chord || !plPlans) return null;
    const segs = plPlans[chord.index];
    return segs && segs.segments.length ? segs : null;
}

function plSelectedSegIdx(segs) {
    return Math.min(plState.segIdx, segs.segments.length - 1);
}

// The candidate a plan-less chord plays (transport + strip display).
function plSingleCandidate(chord) {
    return progDefaultCandidate(plAnalysis.suggestions[chord.index] || [], plState.pick[chord.index]);
}

// Ensure a plan object exists for chord i, seeded from what is already
// playing, so "＋ add segment" grows the current choice.
function plEnsurePlan(i) {
    if (!plState.plan[i] || !plState.plan[i].segments || !plState.plan[i].segments.length) {
        const seed = plAnalysis.suggestions[i] && plAnalysis.suggestions[i].length
            ? progDefaultCandidate(plAnalysis.suggestions[i], plState.pick[i]) : null;
        plState.plan[i] = { segments: [{ id: seed ? seed.id : 'ionian', bars: null }], links: [] };
    }
    return plState.plan[i];
}

// Partition invariant (§16.2): the last segment always absorbs (bars null);
// a null mid-plan is pinned to 1 bar.
function plNormalizePlan(plan) {
    plan.segments.forEach((s, i) => {
        if (i === plan.segments.length - 1) s.bars = null;
        else if (s.bars == null) s.bars = 1;
    });
    if (!plan.links) plan.links = [];
    return plan;
}

// Set segment k's length in bars (snap ½): what it takes comes from the
// remainder the last segment absorbs; every non-last segment keeps >= ½ bar
// and the absorber keeps >= ½ bar, so the cap is the span minus the OTHER
// non-last segments' actual bars.
function plSetSegBars(i, k, bars) {
    const plan = plState.plan[i];
    if (!plan || !plan.segments[k] || k === plan.segments.length - 1) return;
    const span = plChordSpanBars(plAnalysis.chords[i]);
    const others = plan.segments.reduce((a, s, idx) =>
        idx !== k && idx !== plan.segments.length - 1 ? a + (s.bars || 1) : a, 0);
    const maxBars = Math.max(0.5, span - 0.5 - others);
    plan.segments[k].bars = Math.min(Math.max(0.5, Math.round(bars * 2) / 2), maxBars);
}

// Add a segment (§16.5): split the widest segment in half (½-bar floor) and
// seed the new slot with its own top-ranked candidate.
function plAddSegment(i) {
    const plan = plNormalizePlan(plEnsurePlan(i));
    if (plan.segments.length >= 8) return;
    const span = plChordSpanBars(plAnalysis.chords[i]);
    const used = plan.segments.slice(0, -1).reduce((a, s) => a + (s.bars || 1), 0);
    const sizes = plan.segments.map((s, idx) =>
        idx === plan.segments.length - 1 ? span - used : (s.bars || 1));
    let j = 0;
    sizes.forEach((sz, idx) => { if (sz > sizes[j]) j = idx; });
    const others = sizes.reduce((a, sz, idx) => (idx !== j ? a + sz : a), 0);
    // cap keeps every other segment >= 1/2 bar and the absorber >= 1/2 bar
    const half = Math.max(0.5, Math.min(Math.round(sizes[j]) / 2, span - 0.5 - others));
    if (j === plan.segments.length - 1) {
        plan.segments.splice(j, 0, { id: plan.segments[j].id, bars: half }); // before the absorber
    } else {
        plan.segments[j].bars = half;
        plan.segments.splice(j + 1, 0, { id: plan.segments[j].id, bars: Math.max(0.5, sizes[j] - half) });
    }
    plNormalizePlan(plan);
    const k = j === sizes.length - 1 ? j : j + 1;
    plState.segIdx = k;
    // seed the new slot from its own segment ranking — via the practice
    // default (top heptatonic), NOT the raw top card: arpeggios score
    // "safely" high (§7.4) and would silently replace what was playing
    const segs = progRealizePlan(plAnalysis.chords[i], plan, plItemSlots(plAnalysis.chords[i]));
    if (segs) {
        const sug = progSuggestForSegment(plAnalysis.chords[i], segs, k, plWeights(), { exitTarget: plExitTarget(i) });
        const seed = progDefaultCandidate(sug, null);
        if (seed) plan.segments[k].id = seed.id;
    }
    plPlanChanged(i);
}

// Remove segment k — its time merges into the right neighbor (a removed last
// segment just lets the new last absorb).
function plRemoveSegment(i, k) {
    const plan = plState.plan[i];
    if (!plan) return;
    if (plan.segments.length <= 1) { plClearPlan(i); return; }
    plan.segments.splice(k, 1);
    plNormalizePlan(plan);
    if (plState.segIdx >= plan.segments.length) plState.segIdx = plan.segments.length - 1;
    plPlanChanged(i);
}

// Drop the plan entirely — back to the v2.0 single pick.
function plClearPlan(i) {
    delete plState.plan[i];
    plState.segIdx = 0;
    plPlanChanged(i);
}

// Toggle whether boundary k (segment k -> k+1) participates in ranking.
function plToggleLink(i, k) {
    const plan = plState.plan[i];
    if (!plan) return;
    if (!plan.links) plan.links = [];
    plan.links[k] = plan.links[k] === false;
    plPlanChanged(i);
}

// ✨ auto (§16.6): value "strategy:n".
function plApplyAutoPlan(i, value) {
    const m = /^(\w+):(\d+)$/.exec(value);
    if (!m || !plAnalysis.chords[i]) return;
    const chord = plAnalysis.chords[i];
    const plan = progAutoPlan(chord, parseInt(m[2], 10), m[1], plWeights(), plChordSpanBars(chord));
    if (!plan) return;
    plState.plan[i] = plNormalizePlan(plan);
    plState.segIdx = 0;
    plPlanChanged(i);
}

// Shared tail for every plan mutation: re-realize, sync the running
// transport, persist, re-render.
function plPlanChanged(i) {
    plRealizeAll();
    plTransportUpdateItem(i);
    plSave();
    plRenderChips();
    plRenderTension();
    plRenderCards();
    plShowSelection();
}

// --- tension strip (§16.9): the whole progression's color arc -------------------
//
// One bar per plan segment (plan-less chords show their default candidate),
// width proportional to slots, height/opacity mapped from the atlas tension.
// Click selects that chord+segment (and jumps a running loop).

function plTensionCells() {
    if (!plAnalysis) return [];
    const cells = [];
    plAnalysis.chords.forEach((chord, i) => {
        const segs = plPlans ? plPlans[i] : null;
        if (segs && segs.segments.length) {
            segs.segments.forEach((sg, k) => cells.push({
                chord: i, seg: k, slots: sg.slots, tension: progTensionOf(sg.cand),
                label: plChordName(chord) + ' · ' + sg.cand.name
            }));
        } else {
            const cand = plSingleCandidate(chord);
            cells.push({
                chord: i, seg: 0, slots: plItemSlots(chord),
                tension: cand ? progTensionOf(cand) : 0,
                label: plChordName(chord) + (cand ? ' · ' + cand.name : '')
            });
        }
    });
    return cells;
}

function plRenderTension() {
    const wrap = document.getElementById('pl-tension');
    if (!wrap || !plAnalysis) return;
    wrap.innerHTML = '';
    const cells = plTensionCells();
    wrap.classList.toggle('hidden', !cells.length);
    const playing = plTransport && !plTransport.audition && plTransport.activeSeg;
    cells.forEach(c => {
        const bar = document.createElement('button');
        bar.type = 'button';
        bar.className = 'pl-tbar' +
            (playing && playing.idx === c.chord && playing.seg === c.seg ? ' active' : '') +
            (!playing && c.chord === plState.chordIdx ? ' current' : '');
        bar.style.flexGrow = Math.max(1, c.slots);
        bar.title = c.label + ' — tension ' + c.tension.toFixed(2) + ' · click to select';
        const fill = document.createElement('i');
        fill.style.height = Math.round(15 + c.tension * 85) + '%';
        fill.style.opacity = (0.35 + 0.65 * c.tension).toFixed(2);
        bar.appendChild(fill);
        bar.addEventListener('click', () => {
            plState.chordIdx = c.chord;
            plState.segIdx = c.seg;
            if (plTransport && !plTransport.audition) plTransportJump(c.chord);
            plRenderChips();
            plRenderTension();
            plRenderCards();
            plShowSelection();
        });
        wrap.appendChild(bar);
    });
}

function plSelectedChord() {
    if (!plAnalysis || !plAnalysis.chords.length) return null;
    return plAnalysis.chords[Math.min(plState.chordIdx, plAnalysis.chords.length - 1)];
}

function plSelectedSuggestions() {
    if (!plAnalysis || !plAnalysis.suggestions.length) return [];
    const i = Math.min(plState.chordIdx, plAnalysis.suggestions.length - 1);
    const segs = plPlans ? plPlans[i] : null;
    if (segs && segs.segments.length) {
        // plan mode: rank for the selected segment in plan context (§16.3)
        return progSuggestForSegment(plAnalysis.chords[i], segs, plSelectedSegIdx(segs),
            plWeights(), { exitTarget: plExitTarget(i), exitOff: !!plState.noResolve[i] });
    }
    return plAnalysis.suggestions[i] || [];
}

function plRenderChips() {
    const wrap = document.getElementById('pl-chips');
    if (!wrap || !plAnalysis) return;
    wrap.innerHTML = '';
    let chordIndex = 0;
    const focusIdx = (plTransport && plTransport.chordIdx != null) ? plTransport.chordIdx : plState.chordIdx;
    let focusChip = null;
    plAnalysis.tokens.forEach(token => {
        if (token.type === 'bar') {
            const bar = document.createElement('span');
            bar.className = 'pl-chip-bar';
            bar.textContent = '|';
            wrap.appendChild(bar);
            return;
        }
        if (token.type === 'error') {
            const chip = document.createElement('span');
            chip.className = 'pl-chip pl-error';
            chip.textContent = token.source;
            chip.title = token.error;
            wrap.appendChild(chip);
            return;
        }
        const chord = plAnalysis.chords[chordIndex];
        const idx = chordIndex;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'pl-chip' + (idx === plState.chordIdx ? ' selected' : '') +
            (plTransport && idx === plTransport.chordIdx ? ' pl-playing' : '');
        chip.innerHTML = '<span class="pl-deg">' + esc(chord.degreeLabel) + '</span>' +
            '<span class="pl-real">' + esc(plChordName(chord)) + '</span>' +
            (token.bars != null ? '<span class="pl-chipbars">*' + token.bars + '</span>' : '') +
            (plPlans && plPlans[idx] && plPlans[idx].segments.length > 1
                ? '<span class="pl-chipplan" title="scale plan: ' + plPlans[idx].segments.length + ' segments">×' + plPlans[idx].segments.length + '</span>'
                : '');
        if (chord.provenance) chip.title = chord.provenance;
        if (idx === focusIdx) focusChip = chip;
        chip.addEventListener('click', () => {
            plState.chordIdx = idx;
            if (plTransport) plTransportJump(idx);
            plRenderChips();
            plRenderCards();
            plShowSelection();
        });
        plChipTooltip(chip, chord);
        wrap.appendChild(chip);
        chordIndex++;
    });
    if (!plAnalysis.chords.length) {
        const hint = document.createElement('span');
        hint.className = 'pl-hintline';
        hint.textContent = 'Type chords as degrees — try “IIm7 V7 Imaj7” or “Im7 bVIImaj7 V7”';
        wrap.appendChild(hint);
    }
    // The strip can outgrow its 3-row window on long standards — keep the
    // playing (or selected) chip in view. Manual scrollTop, not scrollIntoView:
    // the panel itself is position:fixed and must never scroll the page.
    if (focusChip && wrap.scrollHeight > wrap.clientHeight) {
        const top = focusChip.offsetTop, bottom = top + focusChip.offsetHeight;
        if (top < wrap.scrollTop) wrap.scrollTop = top;
        else if (bottom > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = bottom - wrap.clientHeight;
    }
}

// --- chip tooltips (§4.6: "what you could type here") -------------------------

function plChipTooltip(chip, chord) {
    chip.addEventListener('mouseenter', () => plShowTip(chip, plTooltipText(chord)));
    chip.addEventListener('mouseleave', plHideTip);
}

function plTooltipText(chord) {
    const lines = [];
    lines.push('<b>' + esc(chord.degreeLabel) + ' → ' + esc(plChordName(chord)) + '</b>');
    const m = /^([b#]{0,2})(VII|VI|IV|V|III|II|I)/.exec(chord.degreeLabel);
    if (m) {
        const num = m[2];
        const words = { b: 'lowered a semitone', bb: 'lowered a whole tone', '#': 'raised a semitone', '##': 'raised a whole tone' };
        lines.push(esc(m[1] + num) + ' = degree ' + (PROG_NUMERALS.indexOf(num) + 1) +
            ' of the major scale (' + PROG_MAJOR_SCALE_OFFSETS[num] + ' semitones above the base root)' +
            (words[m[1]] ? ', ' + words[m[1]] : '') + ' → root ' + esc(progNoteName(chord.rootPc)));
    }
    if (chord.qualityId && PROG_QUALITIES[chord.qualityId]) {
        const q = PROG_QUALITIES[chord.qualityId];
        lines.push('quality ' + esc(q.symbol || 'major') + ' = ' +
            q.degrees.map(d => esc(PROG_DEGREE_NAME_LABELS[d])).join(' '));
    }
    lines.push(esc(plChordName(chord)) + ' = ' + chord.tones.map(t => esc(progNoteName(t.pc))).join(' '));
    if (chord.provenance) lines.push(esc(chord.provenance));
    // alternate spellings that land on the same root (docs §4.6)
    if (m && chord.qualityId) {
        const offset = (chord.rootPc - plState.basePc + 12) % 12;
        const symbol = plQualitySymbol(chord.qualityId);
        const alts = [];
        PROG_NUMERALS.forEach(numeral => {
            const alt = offset - PROG_MAJOR_SCALE_OFFSETS[numeral];
            if (Math.abs(alt) > 2) return;
            const altStr = alt === 0 ? '' : ({ '-1': 'b', '1': '#', '-2': 'bb', '2': '##' })[String(alt)];
            const label = altStr + numeral + symbol;
            if (label !== chord.degreeLabel) alts.push(label);
        });
        if (alts.length) lines.push('other spellings: ' + alts.map(esc).join(', '));
    }
    return lines.join('<br>');
}

function plShowTip(anchor, html) {
    const tip = document.getElementById('pl-tip');
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - 340, r.left)) + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
}

function plHideTip() {
    const tip = document.getElementById('pl-tip');
    if (tip) tip.classList.add('hidden');
}

// --- root buttons --------------------------------------------------------------

function plRenderRoots() {
    const wrap = document.getElementById('pl-roots');
    if (!wrap.children.length) {
        PROG_NOTE_NAMES.forEach((name, pc) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pl-root';
            btn.textContent = name;
            btn.addEventListener('click', () => {
                plTransportStop();
                plState.basePc = pc;
                plRefresh();
            });
            wrap.appendChild(btn);
        });
    }
    Array.prototype.forEach.call(wrap.children, (btn, i) => {
        btn.classList.toggle('selected', i === plState.basePc);
    });
}

// --- presets & share links (§11, §14.5) -----------------------------------------

function plApplyPreset(id) {
    const preset = PROG_PRESETS.find(p => p.id === id);
    if (!preset) return;
    plTransportStop();
    plState.text = preset.text;
    plState.chordIdx = 0;
    plState.pick = {};
    plState.noResolve = {};
    plState.plan = {}; // a new progression invalidates index-keyed plans
    plState.segIdx = 0;
    if (typeof preset.basePc === 'number') {
        plState.basePc = ((preset.basePc % 12) + 12) % 12; // a standard loads in its own key
    }
    const input = document.getElementById('pl-input');
    if (input) input.value = preset.text;
    plRefresh();
}

// The canonical public URL of the deployed app — what share links point at
// when the running page isn't reachable from outside (the Android WebView's
// virtual origin, file://, a localhost dev copy). A real deployment shares
// its own origin, so forks deployed elsewhere keep their own URL.
const PL_SITE_URL = 'https://mnikulenkov.github.io/P4_fretboard_trainer/';

function plShareBaseUrl() {
    if (typeof location === 'undefined') return PL_SITE_URL;
    const local = (location.protocol !== 'http:' && location.protocol !== 'https:') ||
        location.hostname === 'appassets.androidplatform.net' ||
        location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return local ? PL_SITE_URL : location.origin + location.pathname + location.search;
}

function plShareUrl() {
    // An unmodified preset collapses to "~id@root" — name and base root only
    // (§11); anything user-made (edits, plans, picks, toggles) goes full.
    const presetId = progFindSharePreset(plState.text, plState.plan, plState.pick, plState.noResolve);
    let payload;
    if (presetId) {
        payload = progEncodePresetShare(presetId, plState.basePc);
    } else {
        // picks ride for plan-less chords only (a plan owns its chord's sound)
        const picks = {};
        Object.keys(plState.pick).forEach(i => {
            if (plState.pick[i] && !plState.plan[i]) picks[i] = plState.pick[i];
        });
        payload = progEncodeShare(plState.basePc, plState.text, plState.plan, picks, {
            bpm: plState.bpm, bars: plState.bars, loop: plState.loop, countIn: plState.countIn,
            swing: plState.swing, div: plState.div, color: plState.color, flow: plState.flow,
            ghosts: plState.ghosts, linkDyads: plState.linkDyads, noResolve: plState.noResolve
        });
    }
    return plShareBaseUrl() + '#lab=' + encodeURIComponent(payload);
}

// On Android (P4Native bridge injected by MainActivity) the button opens the
// system share sheet — the native way out of a WebView. Elsewhere it copies.
function plCopyShare() {
    const url = plShareUrl();
    const native = !!(window.P4Native && typeof window.P4Native.share === 'function');
    const btn = document.getElementById('pl-share');
    const label = native ? '🔗 Share' : '🔗 Copy link';
    const reset = () => { if (btn) btn.textContent = label; };
    if (native) {
        try {
            window.P4Native.share(url, 'P4 Progression Lab');
            if (btn) { btn.textContent = '✓ Shared'; setTimeout(reset, 1600); }
            return;
        } catch (e) { /* bridge broke — fall through to the clipboard */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            if (btn) { btn.textContent = '✓ Link copied'; setTimeout(reset, 1600); }
        }, () => { window.prompt('Copy this link:', url); });
    } else {
        window.prompt('Copy this link:', url);
    }
}

// A shared link wins over the saved cookie (§11). Returns true when applied.
// The link is one-shot: after seeding the state the hash is stripped from the
// URL (same-document replaceState — no history entry), so reloading or
// reopening the page later does NOT reopen the lab.
function plApplyHash() {
    if (typeof location === 'undefined') return false;
    const hash = location.hash || '';
    if (hash.indexOf('#lab=') !== 0) return false;
    let decoded = null;
    try {
        decoded = progDecodeShare(decodeURIComponent(hash.slice(5)));
    } catch (e) { decoded = null; } // a stray '%' — treat as no link
    if (!decoded) return false;
    plTransportStop(); // a link applied mid-loop would strand the schedule
    plState.text = decoded.text;
    plState.basePc = decoded.basePc;
    plState.chordIdx = 0;
    plState.pick = decoded.picks || {}; // chosen scales ride the link (§11)
    plState.noResolve = (decoded.settings && decoded.settings.noResolve) || {};
    plState.plan = decoded.plans || {}; // scale plans ride the link (§16.9)
    plState.segIdx = 0;
    const s = decoded.settings || {};
    if (typeof s.bpm === 'number') plState.bpm = s.bpm;
    if (typeof s.bars === 'number') plState.bars = s.bars;
    if (typeof s.loop === 'boolean') plState.loop = s.loop;
    if (typeof s.countIn === 'boolean') plState.countIn = s.countIn;
    if (typeof s.swing === 'boolean') plState.swing = s.swing;
    if (PL_DIVS[s.div]) plState.div = s.div;
    if (typeof s.color === 'number') plState.color = s.color;
    if (typeof s.flow === 'boolean') plState.flow = s.flow;
    if (typeof s.ghosts === 'boolean') plState.ghosts = s.ghosts;
    if (typeof s.linkDyads === 'boolean') plState.linkDyads = s.linkDyads;
    if (decoded.presetId) {
        const sel = document.getElementById('pl-preset');
        if (sel) sel.value = decoded.presetId; // show what loaded
    }
    try {
        history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
        // file:// is an opaque origin: some browsers refuse replaceState with
        // a URL. location.replace does the same same-document cleanup without
        // adding a history entry. (It reloads the page — the hash is already
        // gone from that URL, so this cannot re-trigger the apply.)
        try { location.replace(location.href.split('#')[0]); } catch (e2) { /* leave it */ }
    }
    return true;
}

// --- suggestion cards ----------------------------------------------------------

const PL_FAMILY_ORDER = ['heptatonic', 'pentatonic', 'arpeggio', 'octatonic', 'hexatonic'];
const PL_FAMILY_SHOW = 6; // cards per family before the "+N more" toggle
const PL_FAMILY_LABEL = {
    heptatonic: 'Heptatonic & larger', pentatonic: 'Pentatonic & blues',
    arpeggio: 'Arpeggios', octatonic: 'Octatonic', hexatonic: 'Hexatonic'
};

function plMeter(label, value) {
    return '<span class="pl-meter">' + label + ' <span class="pl-bar"><i style="width:' +
        Math.round(Math.max(0, Math.min(1, value)) * 100) + '%"></i></span></span>';
}

// --- plan strip (§16.5): proportional segment timeline + boundary links ---------

function plSegBarsLabel(slots) {
    const b = slots / 8;
    return b === 1 ? '1 bar' : parseFloat(b.toFixed(2)) + ' bars';
}

function plShortScaleName(cand) {
    return String(cand.name).replace(/\s*\(.*?\)\s*/, '').trim();
}

function plSetSegmentScale(i, k, cand) {
    const plan = plState.plan[i];
    if (!plan || !plan.segments[k]) return;
    plan.segments[k].id = cand.id;
    plPlanChanged(i);
}

function plRenderPlan() {
    const wrap = document.getElementById('pl-plan');
    if (!wrap || !plAnalysis) return;
    wrap.innerHTML = '';
    const chord = plSelectedChord();
    if (!chord) return;
    const i = chord.index;
    const segs = plPlans ? plPlans[i] : null;
    const span = plChordSpanBars(chord);
    const single = !segs || segs.segments.length < 2;

    const head = document.createElement('div');
    head.className = 'pl-plan-head';
    head.innerHTML = '<span class="pl-plan-label">SCALE PLAN · ' +
        (single ? 'single scale' : segs.segments.length + ' segments') +
        ' · ' + span + (span === 1 ? ' bar' : ' bars') + '</span>';
    const NAMES = { topN: 'ranked', ladder: 'rising tension', arc: 'out & back', contrast: 'max contrast' };
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'pl-planplay';
    play.textContent = '▶ play plan';
    play.title = 'Audition this chord once with its whole scale plan — every segment for its own duration, link dyads at the boundaries. (Plan-less chords just play their current scale.)';
    play.addEventListener('click', () => plStartPlanAudition(chord));
    head.appendChild(play);
    const auto = document.createElement('select');
    auto.className = 'pl-planauto hb-quiz-exempt';
    auto.title = 'Build a plan automatically (replaces the current plan for this chord)';
    auto.appendChild(new Option('✨ auto…', ''));
    ['topN:3', 'topN:2', 'ladder:3', 'ladder:4', 'arc:3', 'arc:5', 'contrast:3'].forEach(v => {
        const parts = v.split(':');
        auto.appendChild(new Option(parts[1] + ' · ' + NAMES[parts[0]], v));
    });
    auto.addEventListener('change', () => {
        if (auto.value) {
            plApplyAutoPlan(i, auto.value);
            auto.value = '';
        }
    });
    head.appendChild(auto);
    // apply a strategy to EVERY chord at once (§16.9 — the "blues ramp" /
    // "Coltrane alternation" use cases: pick a form, then ladder or contrast
    // the whole progression)
    const all = document.createElement('select');
    all.className = 'pl-planauto hb-quiz-exempt';
    all.title = 'Apply the strategy to every chord, each plan split to fit its own span';
    all.appendChild(new Option('✨ all chords…', ''));
    ['topN:3', 'ladder:3', 'ladder:2', 'arc:3', 'contrast:3'].forEach(v => {
        const parts = v.split(':');
        all.appendChild(new Option(parts[1] + ' · ' + NAMES[parts[0]] + ' (all)', v));
    });
    all.addEventListener('change', () => {
        const m = /^(\w+):(\d+)$/.exec(all.value);
        all.value = '';
        if (!m || !plAnalysis) return;
        plAnalysis.chords.forEach((chord, ci) => {
            const plan = progAutoPlan(chord, parseInt(m[2], 10), m[1], plWeights(), plChordSpanBars(chord));
            if (plan) plState.plan[ci] = plNormalizePlan(plan);
        });
        plState.segIdx = 0;
        plPlanChanged(0);
    });
    head.appendChild(all);
    wrap.appendChild(head);

    const strip = document.createElement('div');
    strip.className = 'pl-plan-strip';
    const playing = plTransport && !plTransport.audition &&
        plTransport.chordIdx === i && plTransport.activeSeg;

    if (!segs) {
        // v2.0 single pick: what currently plays, plus the entry point (＋)
        const cand = plSingleCandidate(chord);
        const chip = document.createElement('div');
        chip.className = 'pl-seg' + (playing ? ' active' : '');
        chip.innerHTML = '<span class="pl-segname">' +
            (cand ? esc(progNoteName(chord.rootPc) + ' ' + plShortScaleName(cand)) : '—') + '</span>' +
            '<span class="pl-segbars">' + plSegBarsLabel(plItemSlots(chord)) + '</span>';
        strip.appendChild(chip);
    } else {
        segs.segments.forEach((seg, k) => {
            if (k > 0) strip.appendChild(plLinkButton(i, k - 1));
            const chip = document.createElement('div');
            chip.className = 'pl-seg' +
                (k === plSelectedSegIdx(segs) ? ' selected' : '') +
                (playing && plTransport.activeSeg.seg === k ? ' active' : '');
            chip.style.flexGrow = Math.max(1, seg.slots); // width == duration
            chip.title = seg.cand.name + ' — click to rank for this segment, ▾ for duration';
            chip.innerHTML = '<span class="pl-segname">' +
                esc(progNoteName(chord.rootPc) + ' ' + plShortScaleName(seg.cand)) + '</span>' +
                '<span class="pl-segbars">' + plSegBarsLabel(seg.slots) + '</span>' +
                '<span class="pl-segact">▾</span>';
            chip.addEventListener('click', e => {
                if (e.target.classList.contains('pl-segact')) return;
                plState.segIdx = k;
                plRenderCards();
                plShowSelection();
            });
            chip.querySelector('.pl-segact').addEventListener('click', e => {
                e.stopPropagation();
                plSegMenu(e.currentTarget, i, k);
            });
            strip.appendChild(chip);
        });
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pl-planbtn';
    add.textContent = '＋';
    add.title = single ? 'Split this chord into a scale plan' : 'Add a segment (splits the widest)';
    add.addEventListener('click', () => plAddSegment(i));
    strip.appendChild(add);

    wrap.appendChild(strip);
}

// The 🔗/⛓ boundary control: click toggles evaluation, drag resizes (§16.5).
function plLinkButton(i, k) {
    const plan = plState.plan[i];
    const on = plState.flow && !!plan && plan.links[k] !== false;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pl-link' + (on ? '' : ' off') + (plState.flow ? '' : ' muted');
    btn.textContent = on ? '🔗' : '⛓';
    btn.title = !plState.flow
        ? 'flow is off globally — boundaries are not evaluated (see the flow checkbox)'
        : (on ? 'boundary evaluated — click to ignore it, drag to resize'
              : 'boundary ignored — click to evaluate it, drag to resize');
    btn.addEventListener('pointerdown', e => plLinkPointerDown(e, i, k));
    return btn;
}

function plLinkPointerDown(e, i, k) {
    if (e.button !== undefined && e.button !== 0) return;
    const plan = plState.plan[i];
    if (!plan || !plan.segments[k]) return;
    const strip = document.querySelector('#pl-plan .pl-plan-strip');
    const span = plChordSpanBars(plAnalysis.chords[i]);
    const drag = {
        i: i, k: k, moved: false, startX: e.clientX,
        baseBars: plan.segments[k].bars || 1,
        pxPerBar: strip && span > 0 ? strip.clientWidth / span : 48
    };
    plDrag = drag;
    const move = ev => {
        const dx = ev.clientX - drag.startX;
        if (!drag.moved && Math.abs(dx) < 5) return;
        drag.moved = true;
        plSetSegBars(i, k, drag.baseBars + dx / drag.pxPerBar);
        plRenderPlan(); // cheap re-layout only; commit on release
    };
    const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        plDrag = null;
        if (drag.moved) plPlanChanged(i);
        else plToggleLink(i, k); // a tap, not a drag
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    e.preventDefault();
}

function plHideSegMenu() {
    const menu = document.getElementById('pl-planmenu');
    if (menu) menu.classList.add('hidden');
}

// Per-segment ▾ menu: duration steppers/presets, remove, clear.
function plSegMenu(anchor, i, k) {
    const menu = document.getElementById('pl-planmenu');
    const plan = plState.plan[i];
    const segs = plPlans ? plPlans[i] : null;
    if (!menu || !plan || !segs || !segs.segments[k]) return;
    menu.innerHTML = '';
    const isLast = k === plan.segments.length - 1;
    const act = fn => () => { plHideSegMenu(); fn(); plPlanChanged(i); };
    const add = (text, fn, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (title) b.title = title;
        b.addEventListener('click', act(fn));
        menu.appendChild(b);
    };
    if (isLast) {
        const info = document.createElement('div');
        info.className = 'pl-planmenu-info';
        info.textContent = 'fills the rest of the chord (' + plSegBarsLabel(segs.segments[k].slots) +
            ') — resize via the boundary to its left';
        menu.appendChild(info);
    } else {
        add('− ½ bar', () => plSetSegBars(i, k, (plan.segments[k].bars || 1) - 0.5));
        add('+ ½ bar', () => plSetSegBars(i, k, (plan.segments[k].bars || 1) + 0.5));
        [0.5, 1, 1.5, 2, 3, 4].forEach(bars =>
            add(bars + (bars === 1 ? ' bar' : ' bars'), () => plSetSegBars(i, k, bars)));
    }
    add('✕ remove segment', () => plRemoveSegment(i, k));
    add('clear plan (single scale)', () => plClearPlan(i));
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 230, r.left)) + 'px';
    menu.style.top = (r.bottom + 6) + 'px';
    menu.classList.remove('hidden');
}

function plRenderCards() {
    plRenderPlan();
    const head = document.getElementById('pl-suggest-head');
    const wrap = document.getElementById('pl-cards');
    head.innerHTML = '';
    wrap.innerHTML = '';
    const chord = plSelectedChord();
    if (!chord) return;
    const suggestions = plSelectedSuggestions();
    const next = chord.next;
    const resolveBox = document.getElementById('pl-resolve');
    if (resolveBox) resolveBox.checked = !plState.noResolve[chord.index];

    // Plan context (§16.3): the cards' resolution lines target the next
    // segment when one exists, else the chord exit (which may be the next
    // chord's own first segment).
    const segs = plPlans ? plPlans[chord.index] : null;
    const k = segs && segs.segments.length ? plSelectedSegIdx(segs) : -1;
    const nextSegCand = k >= 0 && k + 1 < segs.segments.length ? segs.segments[k + 1].cand : null;
    let target = next, targetLabel = null;
    if (nextSegCand) {
        target = { tones: nextSegCand.tones };
        targetLabel = progNoteName(chord.rootPc) + ' ' + plShortScaleName(nextSegCand);
    } else if (k >= 0 && next) {
        const exit = plExitTarget(chord.index);
        if (exit && exit.cand) {
            target = exit;
            targetLabel = 'the next chord’s ' + plShortScaleName(exit.cand);
        }
    }
    const ctx = { segMode: k >= 0, segK: k, target: target, targetLabel: targetLabel };

    let segHead = '';
    if (k >= 0) {
        segHead = ' · segment ' + (k + 1) + '/' + segs.segments.length + ': ' +
            esc(progNoteName(chord.rootPc) + ' ' + plShortScaleName(segs.segments[k].cand)) +
            (nextSegCand ? ' → ' + esc(plShortScaleName(nextSegCand)) : '');
    }
    head.innerHTML = '<b>' + esc(plChordName(chord)) + '</b> — ' + esc(chord.degreeLabel) +
        ' in ' + esc(progNoteName(plState.basePc)) +
        (chord.provenance ? ' · ' + esc(chord.provenance) : '') + segHead +
        (next
            ? (plState.noResolve[chord.index]
                ? ' · resolution off — ranked by fit &amp; avoid notes only'
                : ' · resolves to ' + esc(plChordName(next)))
            : ' · single chord — no resolution context');

    PL_FAMILY_ORDER.forEach(family => {
        const group = suggestions.filter(s => s.candidate.family === family);
        if (!group.length) return;
        const expanded = !!plState.expanded[family];
        const shown = expanded ? group : group.slice(0, PL_FAMILY_SHOW);
        const h = document.createElement('div');
        h.className = 'pl-family-head';
        h.textContent = PL_FAMILY_LABEL[family] + ' · ' + group.length;
        wrap.appendChild(h);
        shown.forEach(s => wrap.appendChild(plCard(s, chord, next, ctx)));
        if (group.length > PL_FAMILY_SHOW) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'pl-more';
            more.textContent = expanded
                ? '− show fewer'
                : '+ ' + (group.length - PL_FAMILY_SHOW) + ' more in this family';
            more.title = expanded ? 'Collapse to the top ' + PL_FAMILY_SHOW
                : 'Show all ' + group.length + ' in ' + PL_FAMILY_LABEL[family].toLowerCase();
            more.addEventListener('click', () => {
                plState.expanded[family] = !expanded;
                plRenderCards();
            });
            wrap.appendChild(more);
        }
    });
}

function plCard(s, chord, next, ctx) {
    const cand = s.candidate;
    ctx = ctx || {};
    const desc = progDescribe(s, chord, ctx.target || next, ctx.targetLabel);
    const selectedId = ctx.segMode
        ? (plState.plan[chord.index] && plState.plan[chord.index].segments[ctx.segK]
            ? plState.plan[chord.index].segments[ctx.segK].id : null)
        : plState.pick[chord.index];
    const card = document.createElement('div');
    card.className = 'pl-card' + (selectedId === cand.id ? ' selected' : '');
    card.innerHTML =
        '<div class="pl-card-top"><span class="pl-rank">#' + s.rank + '</span>' +
        '<span class="pl-name">' + esc(desc.title) + '</span>' +
        '<span class="pl-meters">' + plMeter('fit', s.fit) +
        (ctx.segMode ? plMeter('in', s.flow || 0) : '') +
        plMeter('res', (next || ctx.target) ? s.res : 0) +
        (s.pen > 0.001 ? '<span class="pl-pen">pen ' + s.pen.toFixed(2) + '</span>' : '') +
        '</span></div>' +
        '<div class="pl-formula">' + esc(desc.formula) + '</div>' +
        '<div class="pl-desc">' + esc(desc.overlap) + '</div>' +
        (desc.resolution ? '<div class="pl-desc">' + esc(desc.resolution) + '</div>' : '') +
        (desc.avoid ? '<div class="pl-desc pl-avoid">⚠ ' + esc(desc.avoid) + '</div>' : '') +
        '<div class="pl-actions">' +
        '<button type="button" data-act="both">▶ chord + scale</button>' +
        '<button type="button" data-act="scale">scale</button>' +
        '<button type="button" data-act="chord">chord</button>' +
        '<button type="button" data-act="neck">on fretboard</button></div>';

    card.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') return;
        if (ctx.segMode) plSetSegmentScale(chord.index, ctx.segK, cand);
        else plSetPick(chord, cand);
        plRenderCards();
        plShowCandidate(chord, cand);
    });
    card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (ctx.segMode) plSetSegmentScale(chord.index, ctx.segK, cand);
            else plSetPick(chord, cand);
            const act = btn.getAttribute('data-act');
            if (act === 'chord') plStartAudition(chord, cand, 'chord');
            else if (act === 'scale') plStartAudition(chord, cand, 'scale');
            else if (act === 'both') plStartAudition(chord, cand, 'both');
            else if (act === 'neck') { plShowCandidate(chord, cand); plSetPeek(true); }
            plRenderCards();
        });
    });
    return card;
}

// --- playback (§9.2) ------------------------------------------------------------

function plStopPulse() {
    plPulseTimers.forEach(clearTimeout);
    plPulseTimers = [];
    document.querySelectorAll('.fret.playing').forEach(el => el.classList.remove('playing'));
}

function plFretCell(string, fret) {
    return fret === 0
        ? document.querySelector('.string[data-string="' + string + '"] .fret.open')
        : document.querySelector('.string[data-string="' + string + '"] .fret[data-fret="' + fret + '"]');
}

function plVoicingFor(chord) {
    return progGenerateVoicing(chord,
        typeof CHORD_FORMS !== 'undefined' ? CHORD_FORMS : null, plStringOpenPcs());
}

// One-shot audition of a single chord with the transport's EXACT timing:
// the same phrase playback, strum at each bar line, lasting the chord's slots
// (bars × 8 — explicit "*N" honored). The card buttons ("chord + scale",
// "scale", "chord") use this so what you audition is what "Play progression"
// will play. mode: 'both' | 'scale' | 'chord'.
function plStartAudition(chord, cand, mode) {
    const ctx = typeof initAudioContext === 'function' ? initAudioContext() : null;
    if (!ctx) return;
    plTransportStop(); // an audition and the running loop are mutually exclusive
    if (typeof stopSequencePlayback === 'function') stopSequencePlayback();
    plStopPulse();
    plReadTransportInputs(); // fresh BPM / bars from the inputs

    const chain = plMakeChain(ctx);
    const withScale = mode !== 'chord' && cand;
    const item = {
        chord: chord,
        cand: withScale ? cand : null,
        voicing: plVoicingFor(chord),
        slots: plItemSlots(chord),
        noStrum: mode === 'scale',
        leadIn: mode === 'scale' ? 0 : undefined, // no strum to speak first
        idx: chord.index
    };
    plTransport = {
        ctx: ctx, master: chain.master, body: chain.body, voices: [], uiTimers: [],
        items: [item], chordIdx: 0,
        slotEighth: 0,
        subdiv: plSubdiv(), slotsPerBar: plSlotsPerBar(),
        slotSec: (60 / plState.bpm) / plSubdiv(),
        nextTime: ctx.currentTime + 0.12,
        audition: true // one pass, no loop, no count-in, no Play-button takeover
    };
    plBuildPhrases(plTransport.items);
    plTransport.timer = setInterval(plTransportTick, 25);
}

// --- transport (§9.2, §9.3) ------------------------------------------------------
//
// A lookahead conductor on the AudioContext clock: one shared effects chain
// for the whole loop (the sound.js lesson — per-note full chains overload the
// audio thread), light two-voice notes scheduled ~180 ms ahead by a 25 ms
// timer. Chords re-strum each bar; the selected scale plays as a PHRASE (§9.3)
// that spans the chord exactly — entry connected to the previous chord's
// landing, stability-weighted durations, a held landing tone that rings across
// the barline. UI changes (chip highlight, neck pulse) are wall-clock timeouts
// aimed at the same scheduled times.

let plTransport = null;

// Off-beat eighths delayed by a third of an eighth — the light triplet feel
// (2:1 at full push would be 0.5; 0.33 is a relaxed, in-the-pocket swing).
const PL_SWING = 0.33;

// The line's grid (§9.3 divisions): slots per BEAT per division — straight
// eighths (default), triplet eighths (12/8 lilt, 3 per beat), sixteenths
// (double-time runs). Bars × these × 4 = slots per bar.
const PL_DIVS = PROG_DIVISIONS; // §9.3 grids — shared with share-link decode
const PL_DIV_LABELS = { eighth: '8ths', triplet: 'triplets', sixteenth: '16ths' };

function plSubdiv() {
    return PL_DIVS[plState.div] || 2;
}

function plSlotsPerBar() {
    return plSubdiv() * 4;
}

function plSetPick(chord, cand) {
    plState.pick[chord.index] = cand.id;
    plTransportUpdateItem(chord.index);
}

function plFreq(pos) {
    const freq = getOpenStringFreqs()[pos.string];
    return freq ? freq * Math.pow(2, pos.fret / 12) : 0;
}

// A slot's actual start time: swing pushes the off-beat EIGHTHS late — any
// slot that lands exactly on an odd eighth (integer position on the eighth
// grid) — by a third of an eighth; on-beat notes and strums stay on the grid.
// Triplet division carries its own lilt and never shifts; sixteenths swing
// only their eighth-note skeleton, the 16ths inside stay straight.
function plSlotWhen(t, slot, when) {
    if (!plState.swing) return when;
    const eighthIdx = (slot * 2) / t.subdiv;
    return Number.isInteger(eighthIdx) && eighthIdx % 2 === 1
        ? when + t.slotSec * t.subdiv * PL_SWING / 2
        : when;
}

// Fill every transport item with its phrases (§9.3). Chained by `nearAbs`:
// each phrase enters near where the previous one landed, so the line connects
// across chord boundaries instead of jumping to each new root. A segment's
// landing is the "sound the link" dyad's from-tone when dyads are on (the
// scheduler then plays only the to-tone — the from is already ringing); else
// progLandingTone's strongest non-avoid resolver into the next segment /
// next chord. Re-run wholesale on pick/plan/bars changes — cheap and always
// consistent with the current state.
function plBuildPhrases(items) {
    let near = null;
    items.forEach(item => {
        const leadIn = item.leadIn;
        const finish = evs => {
            near = evs && evs.length ? evs[evs.length - 1].abs : near;
            return evs;
        };
        if (item.segs && item.segs.segments.length) {
            item.events = null;
            item.segEvents = item.segs.segments.map((sg, k) => {
                let endPc = null;
                const ln = item.linkNotes && item.linkNotes[k + 1];
                if (plState.linkDyads && ln) endPc = ln.pc;
                if (endPc == null) {
                    const target = k + 1 < item.segs.segments.length
                        ? item.segs.segments[k + 1].cand
                        : plExitTarget(item.idx);
                    endPc = progLandingTone(sg.cand.tones, item.chord, target).pc;
                }
                return finish(progPhrase(sg.cand.tones, sg.slots, plStringOpenPcs(),
                    { endPc: endPc, nearAbs: near, leadIn: leadIn, slotsPerBar: plSlotsPerBar() }));
            });
        } else {
            item.segEvents = null;
            item.events = item.cand
                ? finish(progPhrase(item.cand.tones, item.slots, plStringOpenPcs(), {
                    endPc: progLandingTone(item.cand.tones, item.chord, plExitTarget(item.idx)).pc,
                    nearAbs: near, leadIn: leadIn, slotsPerBar: plSlotsPerBar()
                }))
                : null;
        }
    });
}

// One light note on the transport's shared chain (two voices, like
// playSequenceNotes' staggered line).
// One shared effects chain (mirrors playSequenceNotes — the sound.js lesson:
// per-note full chains overload the audio thread). Used by BOTH the loop
// transport and the one-shot card auditions, so they sound identical.
function plMakeChain(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 250;
    body.gain.value = 5;
    body.Q.value = 2;
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx);
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const wet = ctx.createGain();
    wet.gain.value = 0.15;
    master.connect(body);
    body.connect(dry);
    dry.connect(ctx.destination);
    body.connect(convolver);
    convolver.connect(wet);
    wet.connect(ctx.destination);
    return { master: master, body: body };
}

function plTransportVoice(t, freq, when, decay, peak) {
    if (!isFinite(freq) || freq <= 0) return;
    [
        { type: 'triangle', detune: 0, gain: peak * 0.7 },
        { type: 'sine', detune: 4, gain: peak * 0.3 }
    ].forEach(v => {
        const osc = t.ctx.createOscillator();
        const gain = t.ctx.createGain();
        osc.type = v.type;
        osc.frequency.setValueAtTime(freq, when);
        osc.detune.setValueAtTime(v.detune, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(v.gain, when + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
        osc.connect(gain);
        gain.connect(t.body);
        osc.start(when);
        osc.stop(when + decay + 0.05);
        t.voices.push(osc);
    });
}

// A chord's length in grid slots: its explicit "*N" bars, else the
// transport's global bars-per-chord setting (default 2), on the current
// division's grid (8/12/16 slots per bar — §9.3).
function plItemSlots(chord) {
    const bars = chord && chord.bars != null ? chord.bars : plState.bars;
    return Math.max(1, Math.round(bars * plSlotsPerBar()));
}

function plTransportStart() {
    if (!plAnalysis || !plAnalysis.chords.length) return;
    const ctx = initAudioContext();
    if (!ctx) return;
    plTransportStop();
    plStopPulse();
    plReadTransportInputs();

    const chain = plMakeChain(ctx);
    const master = chain.master, body = chain.body;

    const items = plAnalysis.chords.map((chord, i) => {
        const segs = plPlans ? plPlans[i] : null;
        const usePlan = segs && segs.segments.length;
        const cand = usePlan ? null : progDefaultCandidate(plAnalysis.suggestions[i] || [], plState.pick[i]);
        return {
            chord: chord,
            cand: cand,
            segs: usePlan ? segs : null,
            linkNotes: usePlan ? progLinkNotes(chord, segs) : null,
            voicing: plVoicingFor(chord),
            slots: plItemSlots(chord),
            idx: i
        };
    });
    plBuildPhrases(items);

    plTransport = {
        ctx: ctx, master: master, body: body, voices: [], uiTimers: [],
        items: items, chordIdx: Math.min(plState.chordIdx, items.length - 1),
        slotEighth: 0,
        subdiv: plSubdiv(), slotsPerBar: plSlotsPerBar(),
        slotSec: (60 / plState.bpm) / plSubdiv(),
        nextTime: ctx.currentTime + 0.15
    };

    if (plState.countIn) {
        const beat = 60 / plState.bpm;
        for (let b = 0; b < 4; b++) {
            plTransportVoice(plTransport, 1100, plTransport.nextTime + b * beat, 0.08, 0.25);
        }
        plTransport.nextTime += 4 * beat;
    }

    plTransport.timer = setInterval(plTransportTick, 25);
    plTransportPlayButton(true);
}

// `soft`: the transport reached its natural end (single pass done, loop off) —
// let the final strum and the last landing note ring out with a slow fade
// instead of chopping every voice dead at the barline (the cropped-loop sound
// v2.0 had). A user stop cuts quickly but still ramps 80 ms to stay click-free.
function plTransportStop(soft) {
    if (!plTransport) return;
    const t = plTransport;
    plTransport = null;
    if (t.timer) clearInterval(t.timer);
    t.uiTimers.forEach(clearTimeout);
    const now = t.ctx.currentTime;
    const fade = soft ? 1.4 : 0.08;
    try {
        t.master.gain.cancelScheduledValues(now);
        t.master.gain.setValueAtTime(Math.max(0.0001, t.master.gain.value), now);
        t.master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    } catch (e) { /* gain automation refused — fall through to hard stop */ }
    t.voices.forEach(v => {
        try { v.stop(now + fade + 0.05); } catch (e) { /* already stopped */ }
    });
    setTimeout(() => {
        try { t.master.disconnect(); } catch (e) { /* already disconnected */ }
    }, (fade + 0.2) * 1000);
    plStopPulse();
    plTransportPlayButton(false);
    plRenderChips();
    plRenderTension(); // clear the playing highlight from the tension strip
    if (plState.open) plShowSelection(); // the neck returns to the selection
}

function plTransportToggle() {
    if (plTransport) plTransportStop();
    else plTransportStart();
}

// Jump the running loop to a chord (chip click during playback). One-shot
// auditions are a single item — nothing to jump to.
function plTransportJump(idx) {
    if (!plTransport || plTransport.audition) return;
    plTransport.chordIdx = idx;
    plTransport.slotEighth = 0;
    plTransport.nextTime = Math.max(plTransport.nextTime, plTransport.ctx.currentTime + 0.05);
}

// Live pick/plan changes while the loop runs: refresh the item, then rebuild
// every phrase (entries chain through the previous landing, so one change
// reshapes its neighbors too).
function plTransportUpdateItem(idx) {
    if (!plTransport || plTransport.audition) return;
    const item = plTransport.items[idx];
    if (!item) return;
    const segs = plPlans ? plPlans[idx] : null;
    const usePlan = segs && segs.segments.length;
    item.segs = usePlan ? segs : null;
    item.linkNotes = usePlan ? progLinkNotes(item.chord, segs) : null;
    item.cand = usePlan ? null
        : progDefaultCandidate(plAnalysis.suggestions[idx] || [], plState.pick[idx]);
    plBuildPhrases(plTransport.items);
}

function plTransportTick() {
    const t = plTransport;
    if (!t || !t.items[t.chordIdx]) { if (t) plTransportStop(); return; }
    const lookahead = 0.18;
    while (t.nextTime < t.ctx.currentTime + lookahead) {
        // wrap first so live duration changes take effect immediately
        while (t.slotEighth >= t.items[t.chordIdx].slots) {
            t.slotEighth = 0;
            t.chordIdx++;
            if (t.chordIdx >= t.items.length) {
                if (t.audition || !plState.loop) {
                    plTransportStop(true); // natural end: ring out, don't chop
                    return;
                }
                t.chordIdx = 0;
            }
        }
        if (!t.items[t.chordIdx]) { plTransportStop(); return; }
        plTransportScheduleSlot(t, t.nextTime);
        t.nextTime += t.slotSec;
        t.slotEighth++;
    }
}

// Which plan segment owns a slot (§16.5): {seg, index} or null.
function plSegAt(item, slot) {
    if (!item.segs) return null;
    let found = null;
    item.segs.segments.forEach((sg, i) => {
        if (slot >= sg.startSlot && slot < sg.startSlot + sg.slots) found = { seg: sg, index: i };
    });
    return found;
}

// Neck pulse for one position (shared by the line notes and link dyads);
// `ms` tracks the note's sounding length so held notes pulse longer.
function plPulseCell(pos, ms) {
    const el = plFretCell(pos.string, pos.fret);
    if (el) {
        el.classList.add('playing');
        setTimeout(() => el.classList.remove('playing'),
            Math.min(700, Math.max(300, ms || 300)));
    }
}

function plTransportScheduleSlot(t, when) {
    const item = t.items[t.chordIdx];
    const slot = t.slotEighth;
    const delayMs = Math.max(0, (when - t.ctx.currentTime) * 1000);

    // strum at the chord's start and at each bar line (scale-only auditions
    // skip it); re-strums sit back a little so the downbeat speaks most
    if (!item.noStrum && slot % t.slotsPerBar === 0) {
        const first = slot === 0;
        item.voicing.forEach((p, i) => {
            plTransportVoice(t, plFreq(p), when + i * 0.012, 2.2, first ? 0.20 : 0.15);
        });
        t.uiTimers.push(setTimeout(() => {
            plTransportChordChange(item);
        }, delayMs));
    }

    const cur = plSegAt(item, slot);
    // segment phrases are local to their segment (atSlot 0..slots) — the
    // chord's slot grid is offset by the segment's startSlot
    const evs = cur ? (item.segEvents ? item.segEvents[cur.index] : null) : item.events;
    const localSlot = cur ? slot - cur.seg.startSlot : slot;
    let playedLink = false;
    if (cur && cur.seg.startSlot === slot) {
        // segment boundary: the neck switches to the new scale's pills (§16.8)
        t.uiTimers.push(setTimeout(() => plTransportSegChange(item, cur.index), delayMs));
        // "sound the link": the boundary's strongest moving resolver. The
        // previous phrase landed ON the from-tone when dyads are on (built
        // that way in plBuildPhrases), so only the to-tone is struck — the
        // held landing note becomes the dyad's first half.
        if (plState.linkDyads && cur.index > 0 && item.linkNotes && item.linkNotes[cur.index]) {
            const r = item.linkNotes[cur.index];
            const prevEvs = item.segEvents ? item.segEvents[cur.index - 1] : null;
            const landed = prevEvs && prevEvs.length ? prevEvs[prevEvs.length - 1] : null;
            const alreadyRinging = !!(landed && landed.pc === r.pc);
            const fromPos = landed && alreadyRinging ? landed
                : (prevEvs && prevEvs.length ? progPositionNearPc(r.pc, prevEvs, plStringOpenPcs()) : null);
            const toPos = evs && evs.length ? progPositionNearPc(r.toPc, evs, plStringOpenPcs()) : null;
            if (fromPos && !alreadyRinging) {
                plTransportVoice(t, plFreq(fromPos), when, 0.35, 0.32);
                t.uiTimers.push(setTimeout(() => plPulseCell(fromPos), delayMs));
            }
            if (toPos) {
                const grace = t.slotSec * t.subdiv / 4; // a quarter-beat grace
                plTransportVoice(t, plFreq(toPos), when + grace, 0.45, 0.36);
                t.uiTimers.push(setTimeout(() => plPulseCell(toPos), delayMs + grace * 1000));
            }
            playedLink = !!(fromPos || toPos);
        }
    }
    const ev = !playedLink && evs ? evs.find(e => e.atSlot === localSlot) : null;
    if (ev) {
        // a phrase note: rings to its notated length (a touch past it, so
        // legato holds connect), dynamics from the phrase's accent contour.
        // The decay floor shrinks with the grid so dense divisions stay crisp.
        const noteWhen = plSlotWhen(t, slot, when);
        const decay = Math.min(2.6, Math.max(Math.min(0.30, t.slotSec * 2.4),
            ev.dur * t.slotSec * 1.3));
        plTransportVoice(t, plFreq(ev), noteWhen, decay, 0.36 * ev.accent);
        t.uiTimers.push(setTimeout(() => plPulseCell(ev, decay * 1000),
            Math.max(0, (noteWhen - t.ctx.currentTime) * 1000)));
    }
}

// A plan audition: one pass over ONE chord with its whole realized plan —
// every segment for its own duration, link dyads at the boundaries, the strip
// and neck following along (follow: true) without moving the selection.
// Plan-less chords fall back to their default/pick candidate.
function plStartPlanAudition(chord) {
    const ctx = typeof initAudioContext === 'function' ? initAudioContext() : null;
    if (!ctx || !chord) return;
    plTransportStop();
    if (typeof stopSequencePlayback === 'function') stopSequencePlayback();
    plStopPulse();
    plReadTransportInputs();

    const chain = plMakeChain(ctx);
    const segs = plPlans ? plPlans[chord.index] : null;
    const usePlan = segs && segs.segments.length;
    const cand = usePlan ? null : progDefaultCandidate(plAnalysis.suggestions[chord.index] || [], plState.pick[chord.index]);
    const item = {
        chord: chord,
        cand: cand,
        segs: usePlan ? segs : null,
        linkNotes: usePlan ? progLinkNotes(chord, segs) : null,
        voicing: plVoicingFor(chord),
        slots: plItemSlots(chord),
        idx: chord.index
    };
    plTransport = {
        ctx: ctx, master: chain.master, body: chain.body, voices: [], uiTimers: [],
        items: [item], chordIdx: 0,
        slotEighth: 0,
        subdiv: plSubdiv(), slotsPerBar: plSlotsPerBar(),
        slotSec: (60 / plState.bpm) / plSubdiv(),
        nextTime: ctx.currentTime + 0.12,
        audition: true, // one pass, no loop, no Play-button takeover
        follow: true    // ...but the strip/neck DO follow the segments
    };
    plBuildPhrases(plTransport.items);
    plTransport.timer = setInterval(plTransportTick, 25);
}

// Selection follows the playback: chip highlight, cards and neck re-render.
// Auditions are one-shot probes: they mark their scale on the neck but never
// move the user's chord/segment selection — resetting segIdx here used to
// snap the strip and card list back to segment 1 mid-probe, so the NEXT card
// press targeted (and overwrote) the wrong segment.
function plTransportChordChange(item) {
    if (plTransport && plTransport.audition) {
        if (item.cand) plShowCandidate(item.chord, item.cand);
        return;
    }
    plState.chordIdx = item.idx;
    plState.segIdx = 0;
    plTransport.activeSeg = item.segs ? { idx: item.idx, seg: 0 } : null;
    plRenderChips();
    plRenderTension();
    plRenderCards();
    if (item.cand) plShowCandidate(item.chord, item.cand);
    else if (item.segs && item.segs.segments.length) {
        plShowCandidate(item.chord, item.segs.segments[0].cand, plGhostTones(item.segs, 0));
    }
}

// A plan segment boundary crossed during playback: highlight it in the strip
// and switch the neck pills to the new scale (ghosts now preview the NEXT
// boundary). Card auditions don't follow; plan auditions (follow) highlight
// visually but still never move the selection.
function plTransportSegChange(item, k) {
    if (!plTransport) return;
    if (plTransport.audition && !plTransport.follow) return;
    plTransport.activeSeg = { idx: item.idx, seg: k };
    if (item.idx === plState.chordIdx && item.segs && item.segs.segments[k]) {
        if (!plTransport.audition) plState.segIdx = k;
        plRenderPlan();
        plRenderTension();
        plShowCandidate(item.chord, item.segs.segments[k].cand, plGhostTones(item.segs, k));
    }
}

function plTransportPlayButton(running) {
    const btn = document.getElementById('pl-play-prog');
    if (!btn) return;
    btn.innerHTML = running ? '⏹ Stop' : '▶ Play progression';
    btn.classList.toggle('running', running);
}

function plReadTransportInputs() {
    const bpm = document.getElementById('pl-bpm');
    const bars = document.getElementById('pl-bars');
    const loop = document.getElementById('pl-loop');
    const countIn = document.getElementById('pl-countin');
    if (bpm) plState.bpm = Math.min(240, Math.max(40, parseInt(bpm.value, 10) || 120));
    if (bars) plState.bars = Math.min(8, Math.max(1, parseInt(bars.value, 10) || 2));
    if (loop) plState.loop = loop.checked;
    if (countIn) plState.countIn = countIn.checked;
}

function plWriteTransportInputs() {
    const bpm = document.getElementById('pl-bpm');
    const bars = document.getElementById('pl-bars');
    const loop = document.getElementById('pl-loop');
    const countIn = document.getElementById('pl-countin');
    const flow = document.getElementById('pl-flow');
    const color = document.getElementById('pl-color');
    const ghosts = document.getElementById('pl-ghosts');
    const linkDyads = document.getElementById('pl-linkdyads');
    const swing = document.getElementById('pl-swing');
    const div = document.getElementById('pl-div');
    if (bpm) bpm.value = plState.bpm;
    if (bars) bars.value = plState.bars;
    if (loop) loop.checked = plState.loop;
    if (countIn) countIn.checked = plState.countIn;
    if (flow) flow.checked = plState.flow;
    if (color) color.value = plState.color;
    if (ghosts) ghosts.checked = plState.ghosts;
    if (linkDyads) linkDyads.checked = plState.linkDyads;
    if (swing) swing.checked = plState.swing;
    if (div) div.value = plState.div;
}

// BPM / bars / loop apply live while the loop runs; count-in affects the next
// start. A global bars change only re-times chords without an explicit "*N".
function plTransportSettingsChanged() {
    const wasBpm = plState.bpm, wasBars = plState.bars;
    plReadTransportInputs();
    if (plTransport) {
        if (wasBpm !== plState.bpm) plTransport.slotSec = (60 / plState.bpm) / plTransport.subdiv;
        if (wasBars !== plState.bars) {
            plTransport.items.forEach(item => {
                if (item.chord.bars == null) item.slots = plItemSlots(item.chord);
            });
            plBuildPhrases(plTransport.items); // phrases must span the new spans
        }
    }
    plSave();
}

// Division change (8ths / triplets / 16ths, §9.3): the slot grid rescales, so
// plans re-realize against the new slots-per-bar and a running transport is
// re-timed in place (the current chord restarts from its top, like a jump).
function plDivisionChanged() {
    plState.div = document.getElementById('pl-div').value || 'eighth';
    plRealizeAll();
    plRenderPlan();
    plRenderTension();
    if (plTransport && !plTransport.audition) {
        const t = plTransport;
        t.subdiv = plSubdiv();
        t.slotsPerBar = plSlotsPerBar();
        t.slotSec = (60 / plState.bpm) / t.subdiv;
        t.items.forEach((item, i) => {
            item.slots = plItemSlots(item.chord);
            const segs = plPlans ? plPlans[i] : null;
            const usePlan = segs && segs.segments.length;
            item.segs = usePlan ? segs : null;
            item.linkNotes = usePlan ? progLinkNotes(item.chord, segs) : null;
            item.cand = usePlan ? null
                : progDefaultCandidate(plAnalysis.suggestions[i] || [], plState.pick[i]);
        });
        plBuildPhrases(t.items);
        t.slotEighth = 0;
        t.nextTime = Math.max(t.nextTime, t.ctx.currentTime + 0.05);
    }
    plSave();
}

// --- fretboard display ------------------------------------------------------------

// Tones that APPEAR at the boundary into segment k+1 (§16.8): the pc-set
// diff against the current segment — what the ghost pills mark.
function plGhostTones(segs, k) {
    if (!segs || k == null || k + 1 >= segs.segments.length) return null;
    const curPcs = {};
    segs.segments[k].cand.tones.forEach(t => { curPcs[t.pc] = true; });
    return segs.segments[k + 1].cand.tones.filter(t => !curPcs[t.pc]);
}

function plShowSelection() {
    const chord = plSelectedChord();
    if (!chord) return;
    const segs = plPlans ? plPlans[chord.index] : null;
    if (segs && segs.segments.length) {
        const k = plSelectedSegIdx(segs);
        plShowCandidate(chord, segs.segments[k].cand, plGhostTones(segs, k));
        return;
    }
    const pick = plSelectedSuggestions().find(s => s.candidate.id === plState.pick[chord.index]);
    if (pick) plShowCandidate(chord, pick.candidate);
}

// `ghostTones` (optional): tones the NEXT segment introduces — marked as
// dashed ghost pills so the boundary's actual fret changes are visible
// before they happen (§16.8).
function plShowCandidate(chord, cand, ghostTones) {
    if (typeof renderFretboard === 'function') renderFretboard();
    const marked = {};
    const linePos = progScalePositions(cand.tones, plStringOpenPcs());
    linePos.forEach(p => {
        const el = plFretCell(p.string, p.fret);
        if (!el) return;
        el.classList.add('active');
        if (p.isRoot) el.classList.add('root-note');
        const pill = document.createElement('div');
        pill.className = 'note-display' + (p.isRoot ? ' root-pill' : '');
        pill.textContent = PROG_SCALE_DEGREE_LABELS[p.deg % 12];
        el.appendChild(pill);
        marked[p.string + ':' + p.fret] = true;
    });
    if (ghostTones && ghostTones.length && plState.ghosts) {
        progGhostPositions(linePos, ghostTones.map(t => t.pc), plStringOpenPcs()).forEach(gp => {
            const el = plFretCell(gp.string, gp.fret);
            if (!el || marked[gp.string + ':' + gp.fret]) return;
            marked[gp.string + ':' + gp.fret] = true;
            el.classList.add('pl-ghost');
            const tone = ghostTones.find(t => t.pc === gp.pc);
            const pill = document.createElement('div');
            pill.className = 'note-display pl-ghostpill';
            pill.textContent = tone ? PROG_SCALE_DEGREE_LABELS[tone.deg % 12] : progNoteName(gp.pc);
            el.appendChild(pill);
        });
    }
    plVoicingFor(chord).forEach(p => {
        const el = plFretCell(p.string, p.fret);
        if (!el) return;
        el.classList.add('active', 'pl-mark-chord');
        if (p.isRoot) el.classList.add('root-note');
        if (!marked[p.string + ':' + p.fret]) {
            const pill = document.createElement('div');
            pill.className = 'note-display';
            pill.textContent = progNoteName(p.pc);
            el.appendChild(pill);
        }
    });
}

function plClearNeckMarks() {
    document.querySelectorAll('#fretboard .note-display').forEach(el => el.remove());
    if (typeof renderFretboard === 'function') renderFretboard();
}

// --- autocomplete (§4.6) ------------------------------------------------------------

function plTokenAtEnd(value) {
    const m = /\S+$/.exec(value);
    return m ? m[0] : '';
}

function plQualityToken(qid) {
    return qid === 'maj' ? '' : qid;
}

function plAcCompute(token) {
    const out = [];
    const slash = token.lastIndexOf('/');
    const head = slash === -1 ? '' : token.slice(0, slash + 1);
    const frag = slash === -1 ? token : token.slice(slash + 1);
    const m = /^([b#]{0,2})([IVXivx]*)(.*)$/.exec(frag);
    if (!m) return out;
    const alt = m[1];
    const numPart = m[2].toUpperCase();
    const qualityPart = m[3];
    const numerals = PROG_NUMERALS.filter(n => n.startsWith(numPart));
    numerals.forEach(numeral => {
        const prefix = head + alt + numeral;
        if (qualityPart === '') {
            out.push(prefix + plQualityToken(PROG_DIATONIC_SEVENTH[numeral]));
            PROG_AC_QUALITY_ORDER.forEach(q => out.push(prefix + plQualityToken(q)));
        } else {
            PROG_AC_QUALITY_ORDER.forEach(q => {
                if (plQualityToken(q).indexOf(qualityPart) === 0) out.push(prefix + plQualityToken(q));
            });
        }
    });
    const seen = {};
    return out.filter(tok => (seen.hasOwnProperty(tok) ? false : (seen[tok] = true)));
}

function plAcUpdate() {
    const input = document.getElementById('pl-input');
    const ac = document.getElementById('pl-ac');
    plAcItems = plAcCompute(plTokenAtEnd(input.value)).slice(0, 10);
    plAcIndex = -1;
    if (!plAcItems.length) {
        ac.classList.add('hidden');
        ac.innerHTML = '';
        return;
    }
    ac.innerHTML = '';
    plAcItems.forEach(tok => {
        const parsed = progParseChordToken(tok);
        const name = parsed.ok ? ' — ' + esc(plChordName(progRealizeChord(parsed, plState.basePc))) : '';
        const item = document.createElement('div');
        item.className = 'pl-ac-item';
        item.innerHTML = '<b>' + esc(tok) + '</b>' + name;
        item.addEventListener('mousedown', e => {
            e.preventDefault();
            plAcAccept(tok);
        });
        ac.appendChild(item);
    });
    ac.classList.remove('hidden');
}

function plAcAccept(tok) {
    const input = document.getElementById('pl-input');
    input.value = input.value.replace(/\S+$/, '') + tok + ' ';
    document.getElementById('pl-ac').classList.add('hidden');
    plState.text = input.value;
    plRefresh();
    input.focus();
}

function plAcMove(delta) {
    const ac = document.getElementById('pl-ac');
    if (ac.classList.contains('hidden')) return false;
    const items = ac.querySelectorAll('.pl-ac-item');
    if (!items.length) return false;
    plAcIndex = (plAcIndex + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('active', i === plAcIndex));
    return true;
}

// --- panel lifecycle ------------------------------------------------------------

// Peek mode: shrink the panel to a corner pill so the markings it put on the
// fretboard are actually visible (the "on fretboard" action, the transport's
// note pulse). The lab stays open — transport, chips and marks keep running;
// the pill (or L, or the 🎼 button) brings the panel back.
function plSetPeek(on) {
    plState.peek = !!on;
    const panel = document.getElementById('progression-panel');
    if (panel) panel.classList.toggle('pl-peek', plState.peek);
}

// The reveal half of opening the lab, without the state plumbing — used both
// by openProgressionLab (after restore + hash-apply) and by the hashchange
// path, where plApplyHash has already seeded the state and plRestore must
// NOT run (it would clobber the just-applied link with the cookie).
function plRevealLab() {
    plState.open = true;
    // close sibling popups (the top bar's mutual-exclusion convention)
    ['circle-of-fifths-tooltip', 'instructions-tooltip', 'settings-popup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    if (typeof closeHandbook === 'function') closeHandbook();
    const panel = document.getElementById('progression-panel');
    panel.classList.remove('hidden');
    plSetPeek(false);
    document.getElementById('pl-input').value = plState.text;
    plWriteTransportInputs();
    plRefresh();
}

function openProgressionLab() {
    initProgressionLab();
    plRestore();
    plApplyHash(); // a shared #lab= link beats the cookie (§11)
    plRevealLab();
}

function closeProgressionLab() {
    plState.open = false;
    plSetPeek(false);
    plHideTip();
    plHideSegMenu();
    plTransportStop();
    if (typeof stopSequencePlayback === 'function') stopSequencePlayback();
    const panel = document.getElementById('progression-panel');
    if (panel) panel.classList.add('hidden');
    plClearNeckMarks();
    plSave();
}

function toggleProgressionLab() {
    const panel = document.getElementById('progression-panel');
    if (panel && !panel.classList.contains('hidden')) {
        if (plState.peek) plSetPeek(false); // peeked: restore the panel first
        else closeProgressionLab();
    } else openProgressionLab();
}

function initProgressionLab() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('progression-panel')) return;

    // Top-bar button, right after the settings button (the click-outside
    // closer addresses buttons by id, so the bar order is free to change).
    const topBar = document.querySelector('.top-bar');
    if (topBar && !document.getElementById('topbar-progression')) {
        const labButton = document.createElement('button');
        labButton.className = 'top-bar-button';
        labButton.id = 'topbar-progression';
        labButton.innerHTML = '🎼';
        labButton.title = 'Progression Lab (L)';
        labButton.addEventListener('click', function (event) {
            event.stopPropagation();
            toggleProgressionLab();
        });
        const settingsBtn = document.getElementById('topbar-settings');
        if (settingsBtn && settingsBtn.parentElement === topBar) {
            topBar.insertBefore(labButton, settingsBtn.nextSibling);
        } else {
            topBar.insertBefore(labButton, topBar.lastChild);
        }
    }

    const panel = document.createElement('div');
    panel.id = 'progression-panel';
    panel.className = 'instructions-tooltip pl-popup hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Progression Lab');
    // The Android bridge (P4Native) turns the share button into the system
    // share sheet; everywhere else it copies the link.
    const plNativeShare = !!(window.P4Native && typeof window.P4Native.share === 'function');
    panel.innerHTML =
        '<div class="pl-head">' +
        '<span class="pl-title">🎼 Progression Lab</span>' +
        '<span class="pl-hint">degrees over the base root · <b>b/#</b> alters a degree · <b>V7/II</b> secondary · <b>.</b> repeats · <b>|</b> bar · <b>*N</b> bars per chord</span>' +
        '<button type="button" class="pl-headbtn" id="pl-peek" title="Shrink the panel — keep the fretboard markings visible">👁 fretboard</button>' +
        '<button type="button" class="pl-close" id="pl-close" title="Close (Esc)">✕</button>' +
        '</div>' +
        '<div class="pl-editor">' +
        '<input id="pl-input" class="hb-quiz-exempt" type="text" autocomplete="off" spellcheck="false" ' +
        'placeholder="IIm7 V7 Imaj7 — type degrees, ↑↓ for suggestions">' +
        '<div id="pl-ac" class="pl-ac hidden"></div>' +
        '</div>' +
        '<div id="pl-chips" class="pl-chips"></div>' +
        '<div id="pl-tension" class="pl-tension" title="Tension across the progression — one bar per scale segment, width = duration, height = color level. Click to jump."></div>' +
        '<div class="pl-controls">' +
        '<span class="pl-roots-label">Base root</span>' +
        '<div id="pl-roots" class="pl-roots"></div>' +
        '<select id="pl-preset" class="pl-select hb-quiz-exempt" title="Load a preset progression">' +
        '<option value="">Presets…</option></select>' +
        '<button type="button" id="pl-share" class="pl-sharebtn" title="Share a link that opens the lab on this progression, root, chosen scales and settings">🔗 ' +
        (plNativeShare ? 'Share' : 'Copy link') + '</button>' +
        '</div>' +
        '<div class="pl-controls pl-transport-row">' +
        '<button type="button" id="pl-play-prog" class="pl-playbtn" ' +
        'title="Space (when nothing is focused) also toggles the transport">▶ Play progression</button>' +
        '<label class="pl-ctl">BPM <input id="pl-bpm" class="hb-quiz-exempt" type="number" min="40" max="240" step="1" value="120"></label>' +
        '<label class="pl-ctl">bars/chord <input id="pl-bars" class="hb-quiz-exempt" type="number" min="1" max="8" step="1" value="2"></label>' +
        '<label class="pl-ctl pl-check"><input id="pl-loop" type="checkbox" checked> loop</label>' +
        '<label class="pl-ctl pl-check"><input id="pl-countin" type="checkbox" class="hb-quiz-exempt"> count-in</label>' +
        '<label class="pl-ctl pl-check" title="Off-beat eighths play a third late — the relaxed jazz triplet feel. Straight eighths when off (triplet division carries its own lilt and never shifts)">' +
        '<input id="pl-swing" type="checkbox" class="hb-quiz-exempt" checked> swing</label>' +
        '<label class="pl-ctl">feel <select id="pl-div" class="pl-select hb-quiz-exempt" title="The scale line’s grid: straight eighths (the default), triplet eighths (a 12/8 lilt) or sixteenths (double-time runs — structural tones still land as eighths). Durations always follow the stability atlas">' +
        '<option value="eighth">8ths</option>' +
        '<option value="triplet">triplets</option>' +
        '<option value="sixteenth">16ths</option>' +
        '</select></label>' +
        '<label class="pl-ctl pl-color" title="Left: prefer safety — avoid notes weigh more. Right: prefer color — resolution and flow weigh more. The middle is the default research weighting">' +
        'safety <input id="pl-color" class="hb-quiz-exempt" type="range" min="0" max="1" step="0.1" value="0.5"> color</label>' +
        '<label class="pl-ctl pl-check" title="On the fretboard: dashed ghost pills mark the tones the NEXT segment introduces (the pc-set diff at the boundary) — see the move before you make it">' +
        '<input id="pl-ghosts" type="checkbox" class="hb-quiz-exempt" checked> what changes</label>' +
        '<label class="pl-ctl pl-check" title="At each segment boundary, play the strongest moving resolver (from-tone into to-tone) instead of the new scale’s first eighth note — hear why the transition works">' +
        '<input id="pl-linkdyads" type="checkbox" class="hb-quiz-exempt" checked> sound link</label>' +
        '</div>' +
        '<div class="pl-suggest">' +
        '<div id="pl-plan" class="pl-plan"></div>' +
        '<div class="pl-suggest-bar">' +
        '<div id="pl-suggest-head" class="pl-suggest-head"></div>' +
        '<label class="pl-ctl pl-check" title="Unchecked: rank this chord by fit and avoid notes only, ignoring the move into the next chord">' +
        '<input id="pl-resolve" type="checkbox" class="hb-quiz-exempt" checked> resolution</label>' +
        '<label class="pl-ctl pl-check" title="Unchecked: internal scale-to-scale boundaries are not evaluated — fit, avoid notes and the chord exit only">' +
        '<input id="pl-flow" type="checkbox" class="hb-quiz-exempt" checked> flow</label>' +
        '</div>' +
        '<div id="pl-cards" class="pl-cards"></div>' +
        '</div>' +
        '<div id="pl-tip" class="pl-tip hidden"></div>' +
        '<div id="pl-planmenu" class="pl-planmenu hidden"></div>' +
        '<button type="button" class="pl-peekpill" id="pl-peekpill" title="Back to the Progression Lab (L)">🎼 Progression Lab ▲</button>';
    document.body.appendChild(panel);

    document.getElementById('pl-close').addEventListener('click', closeProgressionLab);
    document.getElementById('pl-peek').addEventListener('click', () => plSetPeek(true));
    document.getElementById('pl-peekpill').addEventListener('click', () => plSetPeek(false));
    document.getElementById('pl-play-prog').addEventListener('click', plTransportToggle);
    const presetSelect = document.getElementById('pl-preset');
    const presetGroups = {}; // group key -> its <optgroup>
    PROG_PRESETS.forEach(preset => {
        const group = preset.group || '';
        if (!presetGroups[group]) {
            presetGroups[group] = document.createElement('optgroup');
            presetGroups[group].label = PROG_PRESET_GROUPS[group] || 'Presets';
            presetSelect.appendChild(presetGroups[group]);
        }
        const opt = document.createElement('option');
        opt.value = preset.id;
        opt.textContent = typeof preset.basePc === 'number'
            ? preset.name + ' · ' + progNoteName(preset.basePc)
            : preset.name;
        opt.title = preset.text +
            (typeof preset.basePc === 'number' ? ' (root ' + progNoteName(preset.basePc) + ')' : '') +
            ' — ' + preset.note;
        presetGroups[group].appendChild(opt);
    });
    presetSelect.addEventListener('change', () => {
        if (presetSelect.value) plApplyPreset(presetSelect.value);
    });
    document.getElementById('pl-share').addEventListener('click', plCopyShare);
    document.getElementById('pl-flow').addEventListener('change', () => {
        plState.flow = document.getElementById('pl-flow').checked;
        plRealizeAll();
        plRenderCards();
        plSave();
    });
    document.getElementById('pl-color').addEventListener('input', () => {
        plState.color = parseFloat(document.getElementById('pl-color').value) || 0.5;
        plRefresh(); // re-analyze with the reshaped weights, re-render, save
    });
    document.getElementById('pl-ghosts').addEventListener('change', () => {
        plState.ghosts = document.getElementById('pl-ghosts').checked;
        plShowSelection(); // re-mark the neck with or without ghosts
        plSave();
    });
    document.getElementById('pl-linkdyads').addEventListener('change', () => {
        plState.linkDyads = document.getElementById('pl-linkdyads').checked;
        // segment landings are chosen to meet the dyad's from-tone — rebuild
        if (plTransport && !plTransport.audition) plBuildPhrases(plTransport.items);
        plSave();
    });
    document.getElementById('pl-swing').addEventListener('change', () => {
        plState.swing = document.getElementById('pl-swing').checked;
        plSave(); // read live per note — nothing to rebuild
    });
    document.getElementById('pl-div').addEventListener('change', plDivisionChanged);
    // the per-segment ▾ menu closes on any tap outside itself
    document.addEventListener('pointerdown', e => {
        const menu = document.getElementById('pl-planmenu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) plHideSegMenu();
    }, true);
    document.getElementById('pl-resolve').addEventListener('change', () => {
        const chord = plSelectedChord();
        if (!chord) return;
        const box = document.getElementById('pl-resolve');
        if (box.checked) delete plState.noResolve[chord.index];
        else plState.noResolve[chord.index] = true;
        const w = plWeights();
        plAnalysis.suggestions[chord.index] = progSuggestForChord(chord,
            box.checked ? w : { resolve: 0, penalty: w.penalty });
        plTransportUpdateItem(chord.index);
        plRenderCards();
        plShowSelection();
        plSave();
    });
    ['pl-bpm', 'pl-bars', 'pl-loop', 'pl-countin'].forEach(id => {
        document.getElementById(id).addEventListener('change', plTransportSettingsChanged);
    });
    const input = document.getElementById('pl-input');
    input.addEventListener('input', () => {
        plTransportStop(); // the progression changed — the loop's schedule is stale
        plState.text = input.value;
        plRefresh();
        plAcUpdate();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') {
            if (plAcMove(1)) e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            if (plAcMove(-1)) e.preventDefault();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (plAcIndex >= 0 && plAcItems[plAcIndex]) {
                e.preventDefault();
                plAcAccept(plAcItems[plAcIndex]);
            } else {
                document.getElementById('pl-ac').classList.add('hidden');
            }
        } else if (e.key === 'Escape') {
            document.getElementById('pl-ac').classList.add('hidden');
            e.stopPropagation();
        }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => {
            const ac = document.getElementById('pl-ac');
            if (ac) ac.classList.add('hidden');
        }, 150);
    });

    document.addEventListener('keydown', e => {
        const typing = document.activeElement &&
            (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
        if (e.key === 'Escape' && plState.open) closeProgressionLab();
        else if (!typing && (e.key === 'l' || e.key === 'L')) toggleProgressionLab();
        else if (e.key === ' ' && plState.open && document.activeElement === document.body) {
            // spacebar drives the transport while the lab is open (§2), but
            // never at the expense of typing or focused buttons
            e.preventDefault();
            plTransportToggle();
        } else if (!typing && plState.open && (e.key === '[' || e.key === ']')) {
            // nudge the boundary right of the selected segment by ±½ bar (§16.5)
            const chord = plSelectedChord();
            const segs = chord && plPlans ? plPlans[chord.index] : null;
            if (segs && segs.segments.length > 1) {
                const k = plSelectedSegIdx(segs);
                if (k < segs.segments.length - 1) {
                    e.preventDefault();
                    const plan = plState.plan[chord.index];
                    plSetSegBars(chord.index, k, (plan.segments[k].bars || 1) + (e.key === ']' ? 0.5 : -0.5));
                    plPlanChanged(chord.index);
                }
            }
        }
    });

    // Handbook cross-link, and shared #lab= links open the lab on arrival.
    // Detect without consuming: openProgressionLab restores the cookie FIRST
    // and then applies the hash, so the link wins over the cookie (§11). (The
    // old consume-then-open order let plRestore clobber the just-applied
    // link for any returning user.)
    const hbOpen = document.getElementById('hb-open-lab');
    if (hbOpen) hbOpen.addEventListener('click', () => {
        if (typeof closeHandbook === 'function') closeHandbook();
        openProgressionLab();
    });
    // A #lab= hash arriving AFTER load (a link pasted into the URL bar, or
    // the Android bridge setting location.hash for a shared progression)
    // seeds the state and reveals the lab. replaceState stripping does not
    // refire hashchange, and non-lab hashes never match, so no loops.
    window.addEventListener('hashchange', () => {
        if ((location.hash || '').indexOf('#lab=') !== 0) return;
        if (plApplyHash()) plRevealLab();
    });
    if (/^#lab=/.test(location.hash || '')) openProgressionLab();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PROG_MAJOR_SCALE_OFFSETS: PROG_MAJOR_SCALE_OFFSETS,
        PROG_ALT_VALUES: PROG_ALT_VALUES,
        PROG_DIATONIC_SEVENTH: PROG_DIATONIC_SEVENTH,
        PROG_NUMERALS: PROG_NUMERALS,
        PROG_AC_QUALITY_ORDER: PROG_AC_QUALITY_ORDER,
        PROG_FAMILY_FOR_QUALITY: PROG_FAMILY_FOR_QUALITY,
        PROG_QUALITY_IDS: PROG_QUALITY_IDS,
        PROG_DEG_SEMI: PROG_DEG_SEMI,
        PROG_QUALITIES: PROG_QUALITIES,
        PROG_SCALES: PROG_SCALES,
        PROG_ARP_QUALITIES: PROG_ARP_QUALITIES,
        PROG_SPECIAL_TOKENS: PROG_SPECIAL_TOKENS,
        PROG_PROVENANCE: PROG_PROVENANCE,
        PROG_SCALE_DEGREE_LABELS: PROG_SCALE_DEGREE_LABELS,
        PROG_DEGREE_NAME_LABELS: PROG_DEGREE_NAME_LABELS,
        PROG_NOTE_NAMES: PROG_NOTE_NAMES,
        PROG_WEIGHTS: PROG_WEIGHTS,
        PROG_PRESETS: PROG_PRESETS,
        PROG_NOTE_PC: PROG_NOTE_PC,
        PROG_DIVISIONS: PROG_DIVISIONS,
        PROG_SHARE_DEFAULTS: PROG_SHARE_DEFAULTS,
        encodeShare: progEncodeShare,
        decodeShare: progDecodeShare,
        encodePresetShare: progEncodePresetShare,
        findSharePreset: progFindSharePreset,
        knownScaleId: progKnownScaleId,
        foldAliases: progFoldAliases,
        parseSingle: progParseSingle,
        parseChordToken: progParseChordToken,
        parseProgression: progParseProgression,
        qualityFor: progQualityFor,
        canonicalLabel: progCanonicalLabel,
        provenanceFor: progProvenanceFor,
        realizeChord: progRealizeChord,
        realizeProgression: progRealizeProgression,
        buildCandidates: progBuildCandidates,
        scoreCandidate: progScoreCandidate,
        suggestForChord: progSuggestForChord,
        resolution: progResolution,
        scaleDistance: progScaleDistance,
        candidatePool: progCandidatePool,
        realizePlan: progRealizePlan,
        suggestForSegment: progSuggestForSegment,
        autoPlan: progAutoPlan,
        ghostPositions: progGhostPositions,
        positionNearPc: progPositionNearPc,
        linkNotes: progLinkNotes,
        tensionOf: progTensionOf,
        encodePlanSuffix: progEncodePlanSuffix,
        decodePlanSuffix: progDecodePlanSuffix,
        describe: progDescribe,
        analyze: progAnalyze,
        noteName: progNoteName,
        pcDist: progPcDist,
        voicingFromBookForm: progVoicingFromBookForm,
        voicingGreedy: progVoicingGreedy,
        generateVoicing: progGenerateVoicing,
        scalePositions: progScalePositions,
        scaleLine: progScaleLine,
        landingTone: progLandingTone,
        phrase: progPhrase,
        defaultCandidate: progDefaultCandidate,
        initProgressionLab: initProgressionLab,
        toggleProgressionLab: toggleProgressionLab,
        startTransport: plTransportStart,
        startAudition: plStartAudition,
        stopTransport: plTransportStop,
        toggleTransport: plTransportToggle,
        jumpTransport: plTransportJump
    };
}
