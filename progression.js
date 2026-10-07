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
    { id: 'ionian',          name: 'major (ionian)',    family: 'heptatonic', tier: 1, degrees: [0, 2, 4, 5, 7, 9, 11],    stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45] },
    { id: 'dorian',          name: 'dorian',            family: 'heptatonic', tier: 1, degrees: [0, 2, 3, 5, 7, 9, 10],    stability: [1.00, 0.55, 0.70, 0.64, 0.82, 0.58, 0.45] },
    { id: 'phrygian',        name: 'phrygian',          family: 'heptatonic', tier: 2, degrees: [0, 1, 3, 5, 7, 8, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.82, 0.53, 0.45] },
    { id: 'lydian',          name: 'lydian',            family: 'heptatonic', tier: 1, degrees: [0, 2, 4, 6, 7, 9, 11],    stability: [1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45] },
    { id: 'mixolydian',      name: 'mixolydian',        family: 'heptatonic', tier: 1, degrees: [0, 2, 4, 5, 7, 9, 10],    stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45] },
    { id: 'aeolian',         name: 'natural minor (aeolian)', family: 'heptatonic', tier: 1, degrees: [0, 2, 3, 5, 7, 8, 10],    stability: [1.00, 0.56, 0.85, 0.56, 0.75, 0.53, 0.50] },
    { id: 'locrian',         name: 'locrian',           family: 'heptatonic', tier: 2, degrees: [0, 1, 3, 5, 6, 8, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.40, 0.58, 0.45] },
    { id: 'harmonicMinor',   name: 'harmonic minor',    family: 'heptatonic', tier: 2, degrees: [0, 2, 3, 5, 7, 8, 11],    stability: [1.00, 0.55, 0.85, 0.56, 0.75, 0.53, 0.55] },
    { id: 'melodicMinor',    name: 'melodic minor',     family: 'heptatonic', tier: 2, degrees: [0, 2, 3, 5, 7, 9, 11],    stability: [1.00, 0.55, 0.70, 0.60, 0.80, 0.58, 0.50] },
    { id: 'lydianDominant',  name: 'lydian dominant',   family: 'heptatonic', tier: 1, degrees: [0, 2, 4, 6, 7, 9, 10],    stability: [1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45] },
    { id: 'phrygianDominant',name: 'phrygian dominant', family: 'heptatonic', tier: 2, degrees: [0, 1, 4, 5, 7, 8, 10],    stability: [1.00, 0.40, 0.60, 0.64, 0.80, 0.53, 0.45] },
    { id: 'locrianNat2',     name: 'locrian ♮2',        family: 'heptatonic', tier: 3, degrees: [0, 2, 3, 5, 6, 8, 10],    stability: [1.00, 0.55, 0.70, 0.64, 0.40, 0.58, 0.45] },
    { id: 'dorianFlat2',     name: 'dorian ♭2',         family: 'heptatonic', tier: 3, degrees: [0, 1, 3, 5, 7, 9, 10],    stability: [1.00, 0.35, 0.70, 0.64, 0.82, 0.58, 0.45] },
    { id: 'lydianAugmented', name: 'lydian augmented',  family: 'heptatonic', tier: 3, degrees: [0, 2, 4, 6, 8, 9, 11],    stability: [1.00, 0.55, 0.69, 0.40, 0.45, 0.58, 0.45] },
    { id: 'altered',         name: 'altered',           family: 'heptatonic', tier: 2, degrees: [0, 1, 3, 4, 6, 8, 10],    stability: [1.00, 0.40, 0.35, 0.45, 0.40, 0.50, 0.50] },
    { id: 'majorPentatonic', name: 'major pentatonic',  family: 'pentatonic', tier: 1, degrees: [0, 2, 4, 7, 9],           stability: [1.00, 0.55, 0.69, 0.82, 0.58] },
    { id: 'minorPentatonic', name: 'minor pentatonic',  family: 'pentatonic', tier: 1, degrees: [0, 3, 5, 7, 10],          stability: [1.00, 0.70, 0.64, 0.82, 0.45] },
    { id: 'blues',           name: 'blues',             family: 'pentatonic', tier: 1, degrees: [0, 3, 5, 6, 7, 10],       stability: [1.00, 0.70, 0.64, 0.30, 0.82, 0.45], passing: [6] },
    { id: 'bebopDominant',   name: 'bebop dominant',    family: 'heptatonic', tier: 3, degrees: [0, 2, 4, 5, 7, 9, 10, 11], stability: [1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45, 0.30], passing: [11] },
    { id: 'wholeTone',       name: 'whole tone',        family: 'hexatonic',  tier: 2, degrees: [0, 2, 4, 6, 8, 10],       stability: [1.00, 0.50, 0.55, 0.50, 0.55, 0.50] },
    { id: 'diminishedHW',    name: 'diminished H–W',    family: 'octatonic',  tier: 2, degrees: [0, 1, 3, 4, 6, 7, 9, 10], stability: [1.00, 0.45, 0.45, 0.50, 0.45, 0.50, 0.45, 0.50] },
    { id: 'diminishedWH',    name: 'diminished W–H',    family: 'octatonic',  tier: 2, degrees: [0, 2, 3, 5, 6, 8, 9, 11], stability: [1.00, 0.50, 0.45, 0.50, 0.45, 0.50, 0.45, 0.50] }
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

const PROG_WEIGHTS = { resolve: 0.6, penalty: 0.8 };

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
    // destination (1.0); a chord tone may still connect (0.2).
    const resolvers = [];
    let resNum = 0, resDen = 0;
    if (next) {
        candidate.tones.forEach(ct => {
            const T = chordTones.hasOwnProperty(ct.pc) ? 0.2 : 1.0;
            resDen += T;
            let best = null;
            next.tones.forEach(nt => {
                const d = progPcDist(ct.pc, nt.pc);
                const p = progProx(d);
                if (p > 0) {
                    const value = p * nt.stability;
                    if (!best || value > best.value) best = { value: value, toPc: nt.pc, toDegreeName: nt.degreeName, dist: d };
                }
            });
            if (best) {
                resNum += T * best.value;
                resolvers.push({
                    pc: ct.pc, deg: ct.deg, T: T, value: T * best.value,
                    toPc: best.toPc, toDegreeName: best.toDegreeName, dist: best.dist
                });
            }
        });
    }
    const res = resDen > 0 ? resNum / resDen : 0;

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

// Ascending one-octave scale line (root ... octave, §9.2): the root starts
// near `centerFret` on the neck's LOWER half and every next semitone takes the
// position that stays closest to the position center — on a P4 neck this locks
// the line into one position, the shapes the sequence mode teaches.
// `tones` is a candidate's tones array ({pc, deg, ...}). Assumes P4 spacing.
function progScalePositions(tones, stringOpenPcs, opts) {
    opts = opts || {};
    const center = opts.centerFret === undefined ? 6 : opts.centerFret;
    const n = stringOpenPcs.length;
    // Absolute pitch numbers, octave-correct: each lower string sounds 5
    // semitones below the previous one (P4). The +24 lift keeps them positive.
    const A = stringOpenPcs.map((pc, s) => pc + 24 - 5 * s);
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
    const semis = tones.map(t => t.deg).sort((a, b) => a - b);
    semis.push(12); // close the octave

    const out = [];
    let last = start;
    semis.forEach(t => {
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
        if (best) {
            out.push({ string: best.s, fret: best.fret, deg: t, isRoot: t % 12 === 0 });
            last = best;
        }
    });
    return out;
}

// One full up–down practice cycle of a scale (root → octave → back to the 2nd
// degree), 2N notes for an N-note scale; cycles tile the chord's eighth-note
// grid (§9.2).
function progScaleLine(tones, stringOpenPcs, opts) {
    const pos = progScalePositions(tones, stringOpenPcs, opts);
    return pos.concat(pos.slice(1, -1).reverse());
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

function progDescribe(result, chord, next) {
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
                    return nm + ' (' + deg + ') is ' + toNm + ', a stable tone of the next chord — common tone';
                }
                const delta = (r.toPc - r.pc + 12) % 12;
                const dir = delta <= 2 ? 'up' : 'down';
                return nm + ' (' + deg + ') resolves a ' + (r.dist === 1 ? 'half-step' : 'whole-step') + ' ' + dir +
                    ' to ' + toNm + ' (' + (PROG_DEGREE_NAME_LABELS[r.toDegreeName] || '') + ' of the next chord)';
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

// --- Share links (§11) ---------------------------------------------------------

// Root-name -> pitch class, both spellings (encode always uses PROG_NOTE_NAMES).
const PROG_NOTE_PC = {
    'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5,
    'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11
};

// `C@IIm7,V7,Imaj7` — root name + @ + comma-joined tokens (commas never occur
// in the grammar, and the payload is URL-encoded by the DOM layer, so '#' and
// unicode aliases survive).
function progEncodeShare(basePc, text) {
    const tokens = String(text).split(/\s+/).filter(Boolean);
    return progNoteName(basePc) + '@' + tokens.join(',');
}

function progDecodeShare(str) {
    const m = /^([A-Ga-g][#b♯♭]{0,2})@(.+)$/.exec(String(str).trim());
    if (!m) return null;
    const pc = PROG_NOTE_PC[progFoldAliases(m[1]).toUpperCase()];
    if (pc === undefined) return null;
    const text = m[2].split(',').map(tok => tok.trim()).filter(Boolean).join(' ');
    if (!text) return null;
    return { basePc: pc, text: text };
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
    noResolve: {}   // chord index -> true when its ranking ignores the next chord
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
            nr: plState.noResolve
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
    } catch (e) { /* corrupted cookie — defaults stand */ }
}

// --- refresh pipeline ---------------------------------------------------------

function plRefresh() {
    plAnalysis = progAnalyze(plState.text, plState.basePc);
    if (plState.chordIdx >= plAnalysis.chords.length) {
        plState.chordIdx = Math.max(0, plAnalysis.chords.length - 1);
    }
    plApplyResolveWeights();
    plRenderChips();
    plRenderRoots();
    plRenderCards();
    if (plState.open) plShowSelection();
    plSave();
}

// Recompute the suggestions of chords whose "resolution" toggle is off, so
// their ranking is fit + avoid-notes only (§7.4, per-chord option).
function plApplyResolveWeights() {
    if (!plAnalysis) return;
    plAnalysis.chords.forEach((chord, i) => {
        if (plState.noResolve[i]) {
            plAnalysis.suggestions[i] = progSuggestForChord(chord,
                { resolve: 0, penalty: PROG_WEIGHTS.penalty });
        }
    });
}

function plSelectedChord() {
    if (!plAnalysis || !plAnalysis.chords.length) return null;
    return plAnalysis.chords[Math.min(plState.chordIdx, plAnalysis.chords.length - 1)];
}

function plSelectedSuggestions() {
    if (!plAnalysis || !plAnalysis.suggestions.length) return [];
    return plAnalysis.suggestions[Math.min(plState.chordIdx, plAnalysis.suggestions.length - 1)] || [];
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
            (token.bars != null ? '<span class="pl-chipbars">*' + token.bars + '</span>' : '');
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
    if (typeof preset.basePc === 'number') {
        plState.basePc = ((preset.basePc % 12) + 12) % 12; // a standard loads in its own key
    }
    const input = document.getElementById('pl-input');
    if (input) input.value = preset.text;
    plRefresh();
}

function plShareUrl() {
    return location.origin + location.pathname + location.search +
        '#lab=' + encodeURIComponent(progEncodeShare(plState.basePc, plState.text));
}

function plCopyShare() {
    const url = plShareUrl();
    const btn = document.getElementById('pl-share');
    const reset = () => { if (btn) btn.textContent = '🔗 Copy link'; };
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
    const decoded = progDecodeShare(decodeURIComponent(hash.slice(5)));
    if (!decoded) return false;
    plState.text = decoded.text;
    plState.basePc = decoded.basePc;
    plState.chordIdx = 0;
    plState.pick = {};
    plState.noResolve = {};
    try {
        history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
        // file:// is an opaque origin: some browsers refuse replaceState with
        // a URL. location.replace does the same same-document cleanup without
        // adding a history entry.
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

function plRenderCards() {
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

    head.innerHTML = '<b>' + esc(plChordName(chord)) + '</b> — ' + esc(chord.degreeLabel) +
        ' in ' + esc(progNoteName(plState.basePc)) +
        (chord.provenance ? ' · ' + esc(chord.provenance) : '') +
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
        shown.forEach(s => wrap.appendChild(plCard(s, chord, next)));
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

function plCard(s, chord, next) {
    const cand = s.candidate;
    const desc = progDescribe(s, chord, next);
    const card = document.createElement('div');
    card.className = 'pl-card' + (plState.pick[chord.index] === cand.id ? ' selected' : '');
    card.innerHTML =
        '<div class="pl-card-top"><span class="pl-rank">#' + s.rank + '</span>' +
        '<span class="pl-name">' + esc(desc.title) + '</span>' +
        '<span class="pl-meters">' + plMeter('fit', s.fit) + plMeter('res', next ? s.res : 0) +
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
        plSetPick(chord, cand);
        plRenderCards();
        plShowCandidate(chord, cand);
    });
    card.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            plSetPick(chord, cand);
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
// eighth notes at the current BPM, up–down scale cycles, a strum at each bar
// line, lasting the chord's slots (bars × 8 — explicit "*N" honored). The card
// buttons ("chord + scale", "scale", "chord") use this so what you audition
// is what "Play progression" will play. mode: 'both' | 'scale' | 'chord'.
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
        line: withScale ? progScaleLine(cand.tones, plStringOpenPcs()) : [],
        slots: plItemSlots(chord),
        noStrum: mode === 'scale',
        idx: chord.index
    };
    plTransport = {
        ctx: ctx, master: chain.master, body: chain.body, voices: [], uiTimers: [],
        items: [item], chordIdx: 0,
        slotEighth: 0,
        eighthSec: (60 / plState.bpm) / 2,
        nextTime: ctx.currentTime + 0.12,
        audition: true // one pass, no loop, no count-in, no Play-button takeover
    };
    plTransport.timer = setInterval(plTransportTick, 25);
}

// --- transport (§9.2) ------------------------------------------------------------
//
// A lookahead conductor on the AudioContext clock: one shared effects chain
// for the whole loop (the sound.js lesson — per-note full chains overload the
// audio thread), light two-voice notes scheduled ~180 ms ahead by a 25 ms
// timer. Chords re-strum each bar; the selected scale runs as eighth notes in
// up–down cycles across the chord's span. UI changes (chip highlight, neck
// pulse) are wall-clock timeouts aimed at the same scheduled times.

let plTransport = null;

function plSetPick(chord, cand) {
    plState.pick[chord.index] = cand.id;
    plTransportUpdateItem(chord.index);
}

function plFreq(pos) {
    const freq = getOpenStringFreqs()[pos.string];
    return freq ? freq * Math.pow(2, pos.fret / 12) : 0;
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

// A chord's length in 8th-note slots: its explicit "*N" bars, else the
// transport's global bars-per-chord setting (default 2).
function plItemSlots(chord) {
    const bars = chord && chord.bars != null ? chord.bars : plState.bars;
    return Math.max(1, Math.round(bars * 8));
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
        const cand = progDefaultCandidate(plAnalysis.suggestions[i] || [], plState.pick[i]);
        return {
            chord: chord,
            cand: cand,
            voicing: plVoicingFor(chord),
            line: cand ? progScaleLine(cand.tones, plStringOpenPcs()) : [],
            slots: plItemSlots(chord),
            idx: i
        };
    });

    plTransport = {
        ctx: ctx, master: master, body: body, voices: [], uiTimers: [],
        items: items, chordIdx: Math.min(plState.chordIdx, items.length - 1),
        slotEighth: 0,
        eighthSec: (60 / plState.bpm) / 2,
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

function plTransportStop() {
    if (!plTransport) return;
    const t = plTransport;
    plTransport = null;
    if (t.timer) clearInterval(t.timer);
    t.uiTimers.forEach(clearTimeout);
    t.voices.forEach(v => {
        try { v.stop(); } catch (e) { /* already stopped */ }
    });
    try { t.master.disconnect(); } catch (e) { /* already disconnected */ }
    plStopPulse();
    plTransportPlayButton(false);
    plRenderChips();
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

// Live pick changes while the loop runs.
function plTransportUpdateItem(idx) {
    if (!plTransport) return;
    const item = plTransport.items[idx];
    if (!item) return;
    item.cand = progDefaultCandidate(plAnalysis.suggestions[idx] || [], plState.pick[idx]);
    item.line = item.cand ? progScaleLine(item.cand.tones, plStringOpenPcs()) : [];
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
                    plTransportStop(); // one-shot auditions end after a single pass
                    return;
                }
                t.chordIdx = 0;
            }
        }
        if (!t.items[t.chordIdx]) { plTransportStop(); return; }
        plTransportScheduleSlot(t, t.nextTime);
        t.nextTime += t.eighthSec;
        t.slotEighth++;
    }
}

function plTransportScheduleSlot(t, when) {
    const item = t.items[t.chordIdx];
    const slot = t.slotEighth;
    const delayMs = Math.max(0, (when - t.ctx.currentTime) * 1000);

    // strum at the chord's start and at each bar line (scale-only auditions skip it)
    if (!item.noStrum && slot % 8 === 0) {
        item.voicing.forEach((p, i) => {
            plTransportVoice(t, plFreq(p), when + i * 0.012, 2.2, 0.20);
        });
        t.uiTimers.push(setTimeout(() => {
            plTransportChordChange(item);
        }, delayMs));
    }

    if (item.line.length) {
        const note = item.line[slot % item.line.length];
        plTransportVoice(t, plFreq(note), when, 0.5, 0.40);
        t.uiTimers.push(setTimeout(() => {
            const el = plFretCell(note.string, note.fret);
            if (el) {
                el.classList.add('playing');
                setTimeout(() => el.classList.remove('playing'), 300);
            }
        }, delayMs));
    }
}

// Selection follows the playback: chip highlight, cards and neck re-render.
function plTransportChordChange(item) {
    plState.chordIdx = item.idx;
    plRenderChips();
    plRenderCards();
    if (item.cand) plShowCandidate(item.chord, item.cand);
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
    if (bpm) bpm.value = plState.bpm;
    if (bars) bars.value = plState.bars;
    if (loop) loop.checked = plState.loop;
    if (countIn) countIn.checked = plState.countIn;
}

// BPM / bars / loop apply live while the loop runs; count-in affects the next
// start. A global bars change only re-times chords without an explicit "*N".
function plTransportSettingsChanged() {
    const wasBpm = plState.bpm, wasBars = plState.bars;
    plReadTransportInputs();
    if (plTransport) {
        if (wasBpm !== plState.bpm) plTransport.eighthSec = (60 / plState.bpm) / 2;
        if (wasBars !== plState.bars) {
            plTransport.items.forEach(item => {
                if (item.chord.bars == null) item.slots = plItemSlots(item.chord);
            });
        }
    }
    plSave();
}

// --- fretboard display ------------------------------------------------------------

function plShowSelection() {
    const chord = plSelectedChord();
    if (!chord) return;
    const pick = plSelectedSuggestions().find(s => s.candidate.id === plState.pick[chord.index]);
    if (pick) plShowCandidate(chord, pick.candidate);
}

function plShowCandidate(chord, cand) {
    if (typeof renderFretboard === 'function') renderFretboard();
    const marked = {};
    progScalePositions(cand.tones, plStringOpenPcs()).forEach(p => {
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

function openProgressionLab() {
    initProgressionLab();
    plRestore();
    plApplyHash(); // a shared #lab= link beats the cookie
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

function closeProgressionLab() {
    plState.open = false;
    plSetPeek(false);
    plHideTip();
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
        '<div class="pl-controls">' +
        '<span class="pl-roots-label">Base root</span>' +
        '<div id="pl-roots" class="pl-roots"></div>' +
        '<select id="pl-preset" class="pl-select hb-quiz-exempt" title="Load a preset progression">' +
        '<option value="">Presets…</option></select>' +
        '<button type="button" id="pl-share" class="pl-sharebtn" title="Copy a link that opens the lab on this progression and root">🔗 Copy link</button>' +
        '</div>' +
        '<div class="pl-controls pl-transport-row">' +
        '<button type="button" id="pl-play-prog" class="pl-playbtn" ' +
        'title="Space (when nothing is focused) also toggles the transport">▶ Play progression</button>' +
        '<label class="pl-ctl">BPM <input id="pl-bpm" class="hb-quiz-exempt" type="number" min="40" max="240" step="1" value="120"></label>' +
        '<label class="pl-ctl">bars/chord <input id="pl-bars" class="hb-quiz-exempt" type="number" min="1" max="8" step="1" value="2"></label>' +
        '<label class="pl-ctl pl-check"><input id="pl-loop" type="checkbox" checked> loop</label>' +
        '<label class="pl-ctl pl-check"><input id="pl-countin" type="checkbox" class="hb-quiz-exempt"> count-in</label>' +
        '</div>' +
        '<div class="pl-suggest">' +
        '<div class="pl-suggest-bar">' +
        '<div id="pl-suggest-head" class="pl-suggest-head"></div>' +
        '<label class="pl-ctl pl-check" title="Unchecked: rank this chord by fit and avoid notes only, ignoring the move into the next chord">' +
        '<input id="pl-resolve" type="checkbox" class="hb-quiz-exempt" checked> resolution</label>' +
        '</div>' +
        '<div id="pl-cards" class="pl-cards"></div>' +
        '</div>' +
        '<div id="pl-tip" class="pl-tip hidden"></div>' +
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
    document.getElementById('pl-resolve').addEventListener('change', () => {
        const chord = plSelectedChord();
        if (!chord) return;
        const box = document.getElementById('pl-resolve');
        if (box.checked) delete plState.noResolve[chord.index];
        else plState.noResolve[chord.index] = true;
        plAnalysis.suggestions[chord.index] = progSuggestForChord(chord,
            box.checked ? PROG_WEIGHTS : { resolve: 0, penalty: PROG_WEIGHTS.penalty });
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
        }
    });

    // Handbook cross-link, and shared #lab= links open the lab on arrival
    // (the hash then wins over the saved cookie, §11).
    const hbOpen = document.getElementById('hb-open-lab');
    if (hbOpen) hbOpen.addEventListener('click', () => {
        if (typeof closeHandbook === 'function') closeHandbook();
        openProgressionLab();
    });
    if (plApplyHash()) openProgressionLab();
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
        encodeShare: progEncodeShare,
        decodeShare: progDecodeShare,
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
        describe: progDescribe,
        analyze: progAnalyze,
        noteName: progNoteName,
        pcDist: progPcDist,
        voicingFromBookForm: progVoicingFromBookForm,
        voicingGreedy: progVoicingGreedy,
        generateVoicing: progGenerateVoicing,
        scalePositions: progScalePositions,
        scaleLine: progScaleLine,
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
