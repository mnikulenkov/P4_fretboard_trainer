// Handbook: the in-app reference guide (📖 button / H key).
//
// Two layers, mirroring the codebase's convention:
//   1. a DOM-free MODEL layer below (Node-testable via test_handbook.js) that turns
//      the app's catalogues (chords.js, sequences.js, intervals.js, mnemonics.js)
//      into display-ready data for the five handbook sections;
//   2. a DOM layer further down (browser only) that renders those models into
//      mini-diagram galleries inside #handbook-tooltip.
//
// Every model builder takes explicit opts (string pitches / string count / tuning
// names) and never reads stringTunings, document or cookies; the DOM layer feeds it
// the live instrument, so a tuning switch re-renders naturally.
//
// Diagram orientation (matches the quiz fretboard and .mn-scheme): rows = strings,
// app index 0 (highest string) on top, frets increase left -> right.
//
// Interval math (app string index 0 = highest; one step toward the bass = +5 semitones
// at the same fret): the note `semis` above a root at (R, F) on the string k steps
// toward the HIGHEST string (R - k) sits at fret F + (semis - 5k), playable exactly
// when semis >= 5k - the P4 ladder (P4 = same fret one string higher, P8 = two strings
// higher at fret +2).

const HANDBOOK_BASE_FRET = 5;        // anchor fret for sequence diagrams
const HANDBOOK_MAX_INTERVAL_STRINGS = 3; // strings an interval fingering may span
const HANDBOOK_CHORD_MAX_FRET = 17;  // generous window for placeChordForm
const HANDBOOK_INTERVAL_FRET_MIN = 1;   // lowest fret-window start offered
const HANDBOOK_INTERVAL_FRET_MAX = 16;  // matches the app's fret-range maximum

// --- Model layer (DOM-free) ----------------------------------------------------

// Parse 'F#2' -> { note: 'F#', octave: 2 } with a tiny local rule (handbook.js must
// not depend on tuning.js, which touches document/localStorage)
const HB_FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
function hbParseNote(name) {
    const match = /^([A-G][#b]?)(-?\d+)?$/.exec(name);
    if (!match) return { note: name, octave: null };
    const note = HB_FLAT_TO_SHARP[match[1]] || match[1];
    return { note: note, octave: match[2] === undefined ? null : parseInt(match[2], 10) };
}

// Section 1 - the P4 tuning: one row per live string
function buildTuningSectionModel(opts) {
    const strings = opts.stringTunings.map((name, index) => {
        const parsed = hbParseNote(name);
        return {
            index: index,
            note: parsed.note,
            octave: parsed.octave,
            label: parsed.note + (parsed.octave === null ? '' : parsed.octave)
        };
    });
    return {
        count: opts.stringTunings.length,
        lowest: opts.stringTunings[opts.stringTunings.length - 1],
        strings: strings
    };
}

// Section 3 - chords: every book form that fits the instrument, placed once at a
// canonical position on the bottom string group (group low = count-1, root fret from
// the book, clamped so every fret stays >= 1)
function buildChordSectionModel(opts) {
    const pitches = opts.stringPitches;
    const count = pitches.length;
    const groupLow = count - 1;
    let total = 0;
    let hidden = 0;
    const families = CHORD_FAMILIES.map(family => {
        const forms = [];
        (CHORD_FORMS[family.id] || []).forEach((form, formIndex) => {
            total++;
            if (form.span > count) { hidden++; return; }
            const played = form.rel.filter(v => v !== null);
            const minRel = Math.min.apply(null, played);
            const rootFret = Math.max(form.book.rootFret, 1 - minRel);
            const placed = placeChordForm(form, groupLow, rootFret, pitches,
                1, HANDBOOK_CHORD_MAX_FRET);
            if (!placed) return; // unreachable: strings and frets are in range by construction
            const frets = placed.positions.map(p => p[1]);
            forms.push({
                formIndex: formIndex,
                span: form.span,
                rel: form.rel,
                omits: form.omits || [],
                rootFret: rootFret,
                fretMin: Math.min.apply(null, frets),
                fretMax: Math.max.apply(null, frets),
                positions: placed.positions,
                rootIndex: placed.rootIndex,
                rootPc: placed.rootPc,
                name: chordName(placed.rootPc, family),
                inversion: chordFormInversion(form, family),
                mutedStrings: form.rel.reduce((list, value, i) => {
                    if (value === null) list.push(i);
                    return list;
                }, [])
            });
        });
        return {
            id: family.id,
            symbol: family.symbol,
            tier: family.tier,
            degrees: family.degrees,
            formula: family.formula,
            forms: forms
        };
    });
    return { totalFormCount: total, hiddenFormCount: hidden, families: families };
}

// Short interval names for a caption (same spellings the Interval section uses,
// without the parentheticals). Keyed by semitone count 1..11.
const HB_STACK_INTERVALS = {
    1: 'm2', 2: 'M2', 3: 'm3', 4: 'M3', 5: 'P4', 6: 'TT',
    7: 'P5', 8: 'm6', 9: 'M6', 10: 'm7', 11: 'M7'
};

// The intervals stacked between the chord's consecutive tones in the order the
// formula builds them (a major triad is M3 + m3, a minor triad m3 + M3, a
// half-diminished 7th m3 + m3 + M3). The degrees arrays are stored in that same
// stacked order; each tone is lifted an octave (+12) whenever it would sit at or
// below the previous one, so a 9th lands a third above the b7, not below the root.
function chordStackedIntervals(degrees) {
    const gaps = [];
    let prev = degrees[0];
    for (let i = 1; i < degrees.length; i++) {
        let current = degrees[i];
        while (current <= prev) current += 12;
        gaps.push(HB_STACK_INTERVALS[current - prev]);
        prev = current;
    }
    return gaps;
}

// The narrowest one-octave applicature whose string descent fits the instrument.
// Never fails: the single-string shape (mask 0, minRow 0) is always in the list.
function narrowestFittingShape(intervalNames, stringCount) {
    const shapes = enumerateSequenceShapes(intervalNames);
    for (const shape of shapes) {
        if (-shape.minRow <= stringCount - 1) return shape;
    }
    return shapes[0];
}

// Section 4 - scales & arpeggios: one narrowest-fitting one-octave shape per catalog
// entry, anchored at the bottom string with the lowest fret exactly HANDBOOK_BASE_FRET
function buildSequenceSectionModel(opts) {
    const count = opts.stringCount;
    const rootString = count - 1;
    const items = SEQUENCE_CATALOG.map(entry => {
        const shape = narrowestFittingShape(entry.intervals, count);
        const rootFret = HANDBOOK_BASE_FRET - shape.relMin;
        const notes = shape.rows.map((row, i) => ({
            string: rootString + row,
            fret: rootFret + shape.frets[i],
            label: shape.labels[i],
            isRoot: shape.labels[i] === 'P1' || shape.labels[i] === 'P8'
        }));
        return {
            entry: entry,
            width: shape.width,
            minRow: shape.minRow,
            rootString: rootString,
            rootFret: rootFret,
            notes: notes
        };
    });
    return { items: items };
}

// Section 2 - intervals: per selected semitone count, one diagram per fingering
// whose string count fits the vertical range (minStrings..maxStrings) and whose
// frets stay inside the horizontal window. The root anchors at minFret; a span-k
// fingering spans frets minFret..minFret + semis - 5k, so a narrow window hides
// wide fingerings (a same-string octave needs 13 frets). Intervals whose every
// fingering is filtered out are dropped from the model.
function buildIntervalSectionModel(opts) {
    const count = opts.stringCount;
    const minFret = opts.minFret === undefined ? HANDBOOK_INTERVAL_FRET_MIN : opts.minFret;
    const maxFret = opts.maxFret === undefined ? HANDBOOK_INTERVAL_FRET_MAX : opts.maxFret;
    const minStrings = opts.minStrings === undefined ? 1 : opts.minStrings;
    const maxStrings = Math.min(
        opts.maxStrings === undefined ? HANDBOOK_MAX_INTERVAL_STRINGS : opts.maxStrings,
        count);
    const enabled = opts.enabledSemis || INTERVAL_LIST.map(entry => entry.semis);
    const rootString = count - 1;
    const intervals = INTERVAL_LIST
        .filter(entry => enabled.indexOf(entry.semis) !== -1)
        .map(entry => {
            const diagrams = [];
            const spanLimit = Math.min(maxStrings - 1, Math.floor(entry.semis / 5), count - 1);
            for (let strings = minStrings; strings <= spanLimit + 1; strings++) {
                const span = strings - 1;
                const noteFret = minFret + entry.semis - 5 * span;
                if (noteFret > maxFret) continue;
                diagrams.push({
                    span: span,
                    strings: strings,
                    rootString: rootString,
                    rootFret: minFret,
                    noteString: rootString - span,
                    noteFret: noteFret
                });
            }
            return {
                semis: entry.semis,
                name: INTERVAL_NAMES[entry.semis],
                label: entry.label,
                diagrams: diagrams
            };
        })
        .filter(interval => interval.diagrams.length > 0);
    return { intervals: intervals };
}

// Section 5 - the mnemonics map: one octave per string letter, open string
// (fret 0) through fret 12 - the strip every fretboard diagram promises:
// first column the open string, last column the octave. (The drills still
// read the window from fret 1.)
function buildMnemonicSchemeModel(opts) {
    const letters = lettersForCount(opts.stringCount) || MNEMONIC_LETTERS.slice(0, 6);
    const rows = letters.map(letter => {
        const shapes = MNEMONIC_ROWS[letter];
        const cells = [];
        for (let fret = 0; fret <= 12; fret++) {
            const noteLetter = letterAtFret(letter, fret);
            let shapeIndex = -1;
            shapes.forEach((shape, index) => {
                if (shape.frets.indexOf(fret) !== -1) shapeIndex = index;
            });
            // fret 0 = the open string: the PREVIOUS octave's end of the cycle.
            // Flagged so the renderer dims it - each string must read as exactly
            // 3 shape groups growing out of that ghost. On the F and C strings
            // the open note is a natural (E, B) and IS the last shape's top
            // note one octave down, so it keeps that shape's tint; on the other
            // strings it is one of the skipped sharps, shown by name. (Sharp
            // frets 1-12 also match no shape, but they are plain gap cells.)
            const wrap = fret === 0;
            if (wrap && noteLetter !== null) shapeIndex = 2;
            let internal = false;
            shapes.forEach(shape => {
                if (fret > shape.frets[0] && fret < shape.frets[shape.frets.length - 1]) {
                    internal = true;
                }
            });
            cells.push({ fret: fret, noteLetter: noteLetter, tint: shapeIndex,
                internal: internal, wrap: wrap,
                openName: wrap ? MNEMONIC_OPEN_NOTES[letter] : null });
        }
        return { letter: letter, cells: cells };
    });
    return { letters: letters, rows: rows };
}

// --- Sub-navigation models (the per-section jump chips) ------------------------
// Long sections are navigated with a sticky chip bar: one chip per jump target.
// These builders turn a section model into chip entries ({key, label?, count?})
// so the DOM layer stays dumb; keys mint the target element ids
// (hb-target-<section>-<key>).

// Chords: one chip per family that actually fits the instrument (families whose
// every form spans more strings than the instrument render no card), in catalog
// order, carrying the family's form count
function chordSubnavEntries(model) {
    return model.families
        .filter(family => family.forms.length > 0)
        .map(family => ({ key: family.id, formCount: family.forms.length }));
}

// Intervals: one chip per rendered interval card (already filtered by the view
// options), in INTERVAL_LIST order, with the short name as the label
function intervalSubnavEntries(model) {
    return model.intervals.map(interval => ({ key: interval.semis, label: interval.name }));
}

// Sequences: one chip per non-empty Arpeggios/Scales x tier block, in render
// order (group first, tier ascending), with each block's card count
function sequenceSubnavEntries(items) {
    const blocks = [];
    [{ group: 'arpeggio', label: 'Arpeggios' }, { group: 'scale', label: 'Scales' }]
        .forEach(groupInfo => {
            for (let tier = 1; tier <= 3; tier++) {
                const count = items.filter(item =>
                    item.entry.group === groupInfo.group && item.entry.tier === tier).length;
                if (count > 0) {
                    blocks.push({
                        key: groupInfo.group + '-' + tier,
                        label: groupInfo.label + ' T' + tier,
                        count: count
                    });
                }
            }
        });
    return blocks;
}

// Node export for test_handbook.js (mirrors sequences.js; browsers ignore this)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HANDBOOK_BASE_FRET: HANDBOOK_BASE_FRET,
        HANDBOOK_MAX_INTERVAL_STRINGS: HANDBOOK_MAX_INTERVAL_STRINGS,
        HANDBOOK_INTERVAL_FRET_MIN: HANDBOOK_INTERVAL_FRET_MIN,
        HANDBOOK_INTERVAL_FRET_MAX: HANDBOOK_INTERVAL_FRET_MAX,
        buildTuningSectionModel: buildTuningSectionModel,
        buildChordSectionModel: buildChordSectionModel,
        buildSequenceSectionModel: buildSequenceSectionModel,
        buildIntervalSectionModel: buildIntervalSectionModel,
        buildMnemonicSchemeModel: buildMnemonicSchemeModel,
        chordStackedIntervals: chordStackedIntervals,
        chordSubnavEntries: chordSubnavEntries,
        intervalSubnavEntries: intervalSubnavEntries,
        sequenceSubnavEntries: sequenceSubnavEntries,
        narrowestFittingShape: narrowestFittingShape
    };
}

// --- DOM layer (browser only; runs when the handbook is opened) -----------------
//
// Static prose lives in index.html's section markup; these renderers fill only the
// dynamic sub-containers (#hb-tuning-map, #hb-interval-cards, ...). Sections render
// lazily and re-render when the tuning signature changes.

function hbTuningSignature() {
    return stringTunings.join(',');
}

const hbSectionIds = ['tuning', 'intervals', 'chords', 'sequences', 'mnemonics'];
const hbSectionTitles = {
    tuning: 'The P4 tuning',
    intervals: 'Intervals',
    chords: 'Chords & voicings',
    sequences: 'Scales & arpeggios',
    mnemonics: 'Mnemonics'
};
const hbRenderedSignature = {};

// Open-note label of an app string index, honouring sharp/flat preferences
function hbStringLabel(string) {
    const parsed = hbParseNote(stringTunings[string]);
    return noteUtils.getDisplayPreference(parsed.note) +
        (parsed.octave === null ? '' : parsed.octave);
}

// Note name of an absolute pitch, honouring sharp/flat preferences
function hbNoteName(pitch) {
    return noteUtils.getDisplayPreference(CHORD_SHARPS[((pitch % 12) + 12) % 12]);
}

// --- Sub-navigation: sticky chip bar + scrollspy + name filter ------------------
//
// The three long sections (intervals, chords, sequences) get a sticky chip bar
// at the top of the scroll pane. Chips jump to their card (smooth scroll, brief
// flash), the scrollspy highlights the chip of the block currently at the top,
// and the sequences bar also carries a live name filter over the 146 entries.

// Px of slack when deciding which target the view has reached
const HB_SUBNAV_SLACK = 12;

function hbContentEl() {
    return document.querySelector('.hb-content');
}

// The id of the section currently shown (first non-hidden section)
function hbActiveSection() {
    for (let i = 0; i < hbSectionIds.length; i++) {
        const section = document.getElementById('hb-sec-' + hbSectionIds[i]);
        if (section && !section.classList.contains('hidden')) return hbSectionIds[i];
    }
    return 'tuning';
}

// Build the chips of a section's bar. labelOf resolves an entry's chip text
// (chords resolve their display names against CHORD_FAMILY_LABELS here).
function hbRenderSubnav(section, entries, labelOf) {
    const row = document.getElementById('hb-chiprow-' + section);
    if (!row) return;
    row.innerHTML = '';

    const top = document.createElement('button');
    top.type = 'button';
    top.className = 'hb-chip';
    top.textContent = '↑ Top';
    top.addEventListener('click', () => hbScrollToTarget(section, null));
    row.appendChild(top);

    entries.forEach(entry => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'hb-chip';
        chip.textContent = labelOf(entry);
        chip.dataset.target = 'hb-target-' + section + '-' + entry.key;
        chip.addEventListener('click', () => hbScrollToTarget(section, entry.key));
        row.appendChild(chip);
    });
}

// Scroll the pane so the target sits just below the sticky bar; null scrolls
// back to the section's top. Ancient WebViews lack ScrollToOptions - fall back
// to a plain jump.
function hbScrollToTarget(section, key) {
    const content = hbContentEl();
    if (!content) return;
    let top = 0;
    if (key !== null) {
        const target = document.getElementById('hb-target-' + section + '-' + key);
        if (!target) return;
        top = target.getBoundingClientRect().top - content.getBoundingClientRect().top +
            content.scrollTop - hbSubnavHeight(section) - HB_SUBNAV_SLACK;
        hbFlashTarget(target);
    }
    try {
        content.scrollTo({ top: top, behavior: 'smooth' });
    } catch (error) {
        content.scrollTop = top;
    }
}

// Brief outline pulse so the jumped-to card is easy to spot
function hbFlashTarget(target) {
    target.classList.remove('hb-flash');
    void target.offsetWidth; // restart a possibly running animation
    target.classList.add('hb-flash');
    setTimeout(() => target.classList.remove('hb-flash'), 1100);
}

function hbSubnavHeight(section) {
    const bar = document.getElementById('hb-subnav-' + section);
    return bar && bar.offsetHeight ? bar.offsetHeight : 0;
}

// The sticky group headers of the sequences section sit directly under the
// chip bar; their sticky offset is measured, not assumed
function hbUpdateStickyOffset() {
    const content = hbContentEl();
    if (content) {
        content.style.setProperty('--hb-subnav-h', hbSubnavHeight(hbActiveSection()) + 'px');
    }
}

// Highlight the chip whose target the view has reached and keep it visible in
// the horizontally scrolling chip row. rAF-throttled from the scroll event.
let hbSpyFrame = null;

function hbScrollSpy() {
    hbSpyFrame = null;
    const section = hbActiveSection();
    const row = document.getElementById('hb-chiprow-' + section);
    if (!row) return;
    const chips = Array.prototype.slice.call(row.querySelectorAll('.hb-chip[data-target]'));
    if (chips.length === 0) return;
    const content = hbContentEl();
    const threshold = content.getBoundingClientRect().top + hbSubnavHeight(section) +
        HB_SUBNAV_SLACK;

    let active = null;
    chips.forEach(chip => {
        const target = document.getElementById(chip.dataset.target);
        if (!target || target.classList.contains('hidden')) return;
        if (target.getBoundingClientRect().top <= threshold) active = chip;
    });
    chips.forEach(chip => chip.classList.toggle('active', chip === active));
    if (active) hbCenterChip(active, row);
}

function hbCenterChip(chip, row) {
    const left = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
    try {
        row.scrollTo({ left: left, behavior: 'smooth' });
    } catch (error) {
        row.scrollLeft = left;
    }
}

// The shared mini-diagram component. spec = { title, badges: [..], fretMin, fretMax,
// rows: [{ string, label, muted }], cells: { 'string:fret': { text, root, pill } },
// onPlay }. Rows are given top-first (highest string on top).
function hbRenderDiagram(spec) {
    const diagram = document.createElement('div');
    diagram.className = 'hb-diagram';

    const title = document.createElement('div');
    title.className = 'hb-diagram-title';
    title.textContent = spec.title;
    (spec.badges || []).forEach(badgeText => {
        const badge = document.createElement('span');
        badge.className = 'hb-badge';
        badge.textContent = badgeText;
        title.appendChild(badge);
    });
    diagram.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'hb-grid';

    const header = document.createElement('div');
    header.className = 'hb-row hb-header-row';
    const corner = document.createElement('span');
    corner.className = 'hb-string-label';
    header.appendChild(corner);
    for (let fret = spec.fretMin; fret <= spec.fretMax; fret++) {
        const number = document.createElement('span');
        number.className = 'hb-fret-number';
        number.textContent = fret;
        header.appendChild(number);
    }
    grid.appendChild(header);

    spec.rows.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'hb-row' + (row.muted ? ' hb-muted-row' : '');
        const label = document.createElement('span');
        label.className = 'hb-string-label';
        label.textContent = row.label;
        rowEl.appendChild(label);
        if (row.muted) {
            const mute = document.createElement('span');
            mute.className = 'hb-muted';
            mute.textContent = '×';
            rowEl.appendChild(mute);
        } else {
            for (let fret = spec.fretMin; fret <= spec.fretMax; fret++) {
                const cellEl = document.createElement('span');
                cellEl.className = 'hb-cell';
                const cell = spec.cells[row.string + ':' + fret];
                if (cell) {
                    cellEl.classList.add('hb-mark');
                    if (cell.root) cellEl.classList.add('hb-root');
                    if (cell.pill) {
                        const pill = document.createElement('span');
                        pill.className = 'hb-pill' + (cell.root ? ' hb-pill-root' : '');
                        pill.textContent = cell.text;
                        cellEl.appendChild(pill);
                    } else {
                        cellEl.textContent = cell.text;
                    }
                }
                rowEl.appendChild(cellEl);
            }
        }
        grid.appendChild(rowEl);
    });
    diagram.appendChild(grid);

    if (spec.onPlay) {
        diagram.title = 'Click to play';
        diagram.addEventListener('click', () => {
            diagram.classList.add('hb-playing');
            setTimeout(() => diagram.classList.remove('hb-playing'), 500);
            spec.onPlay();
        });
    }
    return diagram;
}

// Card with a title, an optional caption and a diagram gallery
function hbCard(titleText, captionText) {
    const card = document.createElement('div');
    card.className = 'hb-card';
    const title = document.createElement('div');
    title.className = 'hb-card-title';
    title.textContent = titleText;
    card.appendChild(title);
    if (captionText) {
        const caption = document.createElement('div');
        caption.className = 'hb-card-caption';
        caption.textContent = captionText;
        card.appendChild(caption);
    }
    const gallery = document.createElement('div');
    gallery.className = 'hb-gallery';
    card.appendChild(gallery);
    return { card: card, gallery: gallery };
}

function hbGroupHeader(text) {
    const header = document.createElement('div');
    header.className = 'hb-group-header';
    header.textContent = text;
    return header;
}

// Section 1: the live string map (prose is static HTML)
function hbRenderTuning() {
    const container = document.getElementById('hb-tuning-map');
    if (!container) return;
    container.innerHTML = '';
    const model = buildTuningSectionModel({ stringTunings: stringTunings });
    model.strings.forEach(s => {
        const row = document.createElement('div');
        row.className = 'hb-stringmap-row';
        const name = document.createElement('span');
        name.className = 'hb-stringmap-name';
        name.textContent = 'String ' + (model.count - s.index);
        row.appendChild(name);
        const note = document.createElement('span');
        note.className = 'hb-stringmap-note';
        note.textContent = noteUtils.getDisplayPreference(s.note) +
            (s.octave === null ? '' : s.octave);
        row.appendChild(note);
        if (s.index === 0) {
            const tag = document.createElement('span');
            tag.className = 'hb-stringmap-tag';
            tag.textContent = 'highest';
            row.appendChild(tag);
        }
        if (s.index === model.count - 1) {
            const tag = document.createElement('span');
            tag.className = 'hb-stringmap-tag';
            tag.textContent = 'lowest';
            row.appendChild(tag);
        }
        container.appendChild(row);
    });
}

// Interval-section view options, persisted like the app's other settings.
// Stored as a versioned cookie: "1:<json>".
const HB_INTERVAL_COOKIE = 'hbIntervalView';
const HB_INTERVAL_VERSION = 1;

function hbDefaultIntervalState() {
    return {
        minFret: HANDBOOK_INTERVAL_FRET_MIN,
        maxFret: HANDBOOK_INTERVAL_FRET_MAX,
        minStrings: 1,
        maxStrings: HANDBOOK_MAX_INTERVAL_STRINGS,
        semis: INTERVAL_LIST.map(entry => entry.semis)
    };
}

function hbClampInt(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function hbNormalizeIntervalState(state) {
    // Keep min <= max so the ranges are always a proper window
    if (state.minFret > state.maxFret) {
        const tmp = state.minFret; state.minFret = state.maxFret; state.maxFret = tmp;
    }
    if (state.minStrings > state.maxStrings) {
        const tmp = state.minStrings; state.minStrings = state.maxStrings; state.maxStrings = tmp;
    }
    return state;
}

function loadHbIntervalState() {
    const raw = typeof getCookie === 'function' ? getCookie(HB_INTERVAL_COOKIE) : null;
    if (raw !== null && raw !== '') {
        const colon = raw.indexOf(':');
        const version = colon === -1 ? 0 : parseInt(raw.slice(0, colon), 10);
        if (version === HB_INTERVAL_VERSION) {
            try {
                const stored = JSON.parse(raw.slice(colon + 1));
                const defaults = hbDefaultIntervalState();
                const semis = Array.isArray(stored.semis)
                    ? stored.semis.map(Number)
                        .filter(semis => INTERVAL_NAMES[semis] !== undefined)
                    : [];
                return hbNormalizeIntervalState({
                    minFret: hbClampInt(stored.minFret,
                        HANDBOOK_INTERVAL_FRET_MIN, HANDBOOK_INTERVAL_FRET_MAX,
                        defaults.minFret),
                    maxFret: hbClampInt(stored.maxFret,
                        HANDBOOK_INTERVAL_FRET_MIN, HANDBOOK_INTERVAL_FRET_MAX,
                        defaults.maxFret),
                    minStrings: hbClampInt(stored.minStrings, 1,
                        HANDBOOK_MAX_INTERVAL_STRINGS, defaults.minStrings),
                    maxStrings: hbClampInt(stored.maxStrings, 1,
                        HANDBOOK_MAX_INTERVAL_STRINGS, defaults.maxStrings),
                    semis: semis.length > 0 ? semis : defaults.semis
                });
            } catch (error) { /* malformed cookie - fall back to defaults */ }
        }
    }
    return hbDefaultIntervalState();
}

function saveHbIntervalState(state) {
    if (typeof setCookie !== 'function') return;
    setCookie(HB_INTERVAL_COOKIE,
        HB_INTERVAL_VERSION + ':' + JSON.stringify(state), SETTINGS_COOKIE_DAYS);
}

// The options bar (fret window, string range, interval checklist). Built lazily
// with the section so the app's generic init-time input listeners never attach.
function hbRenderIntervalOptions(state) {
    const bar = document.getElementById('hb-interval-options');
    if (!bar) return;
    bar.innerHTML = '';

    const change = () => {
        const next = hbNormalizeIntervalState({
            minFret: parseInt(document.getElementById('hb-iv-fret-min').value, 10),
            maxFret: parseInt(document.getElementById('hb-iv-fret-max').value, 10),
            minStrings: parseInt(document.getElementById('hb-iv-str-min').value, 10),
            maxStrings: parseInt(document.getElementById('hb-iv-str-max').value, 10),
            semis: Array.from(document.querySelectorAll('#hb-iv-list .hb-iv-checkbox:checked'))
                .map(cb => parseInt(cb.value, 10))
        });
        // An empty checklist is a valid (if useless) view: the cards area then
        // shows the explanatory note. Only cookie LOADING falls back to all.
        saveHbIntervalState(next);
        hbRenderIntervalOptions(next);
        hbRenderIntervalCards(next);
    };

    // Horizontal range: the fret window the fingerings must fit in
    const fretRow = document.createElement('div');
    fretRow.className = 'hb-options-row';
    fretRow.appendChild(hbOptionsLabel('Frets:'));
    fretRow.appendChild(hbFretSelect('hb-iv-fret-min', state.minFret, change));
    fretRow.appendChild(hbOptionsLabel('to'));
    fretRow.appendChild(hbFretSelect('hb-iv-fret-max', state.maxFret, change));
    bar.appendChild(fretRow);

    // Vertical range: how many strings a fingering may span
    const spanRow = document.createElement('div');
    spanRow.className = 'hb-options-row';
    spanRow.appendChild(hbOptionsLabel('Strings:'));
    const strMin = document.createElement('select');
    strMin.id = 'hb-iv-str-min';
    const strMax = document.createElement('select');
    strMax.id = 'hb-iv-str-max';
    [strMin, strMax].forEach(select => {
        for (let strings = 1; strings <= HANDBOOK_MAX_INTERVAL_STRINGS; strings++) {
            const option = document.createElement('option');
            option.value = strings;
            option.textContent = strings === 1 ? '1 (same string)' : strings;
            select.appendChild(option);
        }
        select.className = 'hb-options-select';
        select.addEventListener('change', change);
    });
    strMin.value = state.minStrings;
    strMax.value = state.maxStrings;
    spanRow.appendChild(strMin);
    spanRow.appendChild(hbOptionsLabel('to'));
    spanRow.appendChild(strMax);
    bar.appendChild(spanRow);

    // Interval checklist with All/None bulk buttons
    const listRow = document.createElement('div');
    listRow.className = 'hb-options-row';
    listRow.appendChild(hbOptionsLabel('Intervals:'));
    [['hb-iv-all', true], ['hb-iv-none', false]].forEach(([id, checked]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'seq-bulk';
        button.textContent = checked ? 'All' : 'None';
        button.addEventListener('click', () => {
            document.querySelectorAll('#hb-iv-list .hb-iv-checkbox').forEach(cb => {
                cb.checked = checked;
            });
            change();
        });
        listRow.appendChild(button);
    });
    const list = document.createElement('div');
    list.id = 'hb-iv-list';
    list.className = 'seq-options';
    INTERVAL_LIST.forEach(entry => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'hb-iv-checkbox';
        checkbox.value = entry.semis;
        checkbox.checked = state.semis.indexOf(entry.semis) !== -1;
        checkbox.addEventListener('change', change);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + entry.label));
        list.appendChild(label);
    });
    listRow.appendChild(list);
    bar.appendChild(listRow);
}

function hbOptionsLabel(text) {
    const label = document.createElement('span');
    label.className = 'hb-options-label';
    label.textContent = text;
    return label;
}

function hbFretSelect(id, value, onChange) {
    const select = document.createElement('select');
    select.id = id;
    select.className = 'hb-options-select';
    for (let fret = HANDBOOK_INTERVAL_FRET_MIN; fret <= HANDBOOK_INTERVAL_FRET_MAX; fret++) {
        const option = document.createElement('option');
        option.value = fret;
        option.textContent = fret;
        select.appendChild(option);
    }
    select.value = value;
    select.addEventListener('change', onChange);
    return select;
}

// Section 2: options bar + one card per selected interval, one diagram per
// fingering that fits the ranges
function hbRenderIntervals() {
    const state = loadHbIntervalState();
    hbRenderIntervalOptions(state);
    hbRenderIntervalCards(state);
}

function hbRenderIntervalCards(state) {
    const container = document.getElementById('hb-interval-cards');
    if (!container) return;
    container.innerHTML = '';
    const count = stringTunings.length;
    const pitches = stringTunings.map(absoluteSemis);
    const model = buildIntervalSectionModel({
        stringCount: count,
        minFret: state.minFret,
        maxFret: state.maxFret,
        minStrings: state.minStrings,
        maxStrings: state.maxStrings,
        enabledSemis: state.semis
    });

    hbRenderSubnav('intervals', intervalSubnavEntries(model), entry => entry.label);

    if (model.intervals.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hb-note';
        empty.textContent = 'No interval fingering fits these options - widen the fret window, allow more strings or enable more intervals.';
        container.appendChild(empty);
        return;
    }

    model.intervals.forEach(iv => {
        const card = hbCard(iv.label,
            iv.semis + ' semitones above the root — inversion: ' +
            INTERVAL_NAMES[12 - iv.semis]);
        card.card.id = 'hb-target-intervals-' + iv.semis;
        iv.diagrams.forEach(d => {
            const strings = d.span === 0 ? [d.rootString] : [d.noteString, d.rootString];
            strings.sort((a, b) => a - b); // highest string on top
            const rows = strings.map(string => ({
                string: string, label: hbStringLabel(string), muted: false
            }));
            const cells = {};
            cells[d.rootString + ':' + d.rootFret] = {
                text: hbNoteName(pitches[d.rootString] + d.rootFret), root: true
            };
            cells[d.noteString + ':' + d.noteFret] = {
                text: hbNoteName(pitches[d.noteString] + d.noteFret), root: false
            };
            card.gallery.appendChild(hbRenderDiagram({
                title: d.span === 0 ? 'on 1 string' : 'across ' + (d.span + 1) + ' strings',
                fretMin: Math.min(d.rootFret, d.noteFret),
                fretMax: Math.max(d.rootFret, d.noteFret),
                rows: rows,
                cells: cells,
                onPlay: () => playSequenceNotes([
                    { string: d.rootString, fret: d.rootFret },
                    { string: d.noteString, fret: d.noteFret }
                ])
            }));
        });
        container.appendChild(card.card);
    });
    hbScrollSpy();
}

// Section 3: one card per chord family, one diagram per book form that fits
function hbRenderChords() {
    const container = document.getElementById('hb-chord-cards');
    if (!container) return;
    container.innerHTML = '';
    const count = stringTunings.length;
    const pitches = stringTunings.map(absoluteSemis);
    const groupLow = count - 1;
    const model = buildChordSectionModel({ stringPitches: pitches });

    hbRenderSubnav('chords', chordSubnavEntries(model), entry => {
        if (typeof CHORD_FAMILY_LABELS !== 'undefined' && CHORD_FAMILY_LABELS[entry.key]) {
            return CHORD_FAMILY_LABELS[entry.key];
        }
        const family = CHORD_FAMILIES.find(f => f.id === entry.key);
        return family.symbol === '' ? 'major' : family.symbol;
    });

    const hiddenNote = document.getElementById('hb-chord-hidden-note');
    if (hiddenNote) {
        hiddenNote.textContent = model.hiddenFormCount > 0
            ? model.hiddenFormCount + ' of the 66 voicings span more strings than this ' +
              'instrument and are not shown — add strings to see them.'
            : '';
        hiddenNote.classList.toggle('hidden', model.hiddenFormCount === 0);
    }

    model.families.forEach(familyModel => {
        if (familyModel.forms.length === 0) return;
        const label = typeof CHORD_FAMILY_LABELS !== 'undefined' && CHORD_FAMILY_LABELS[familyModel.id]
            ? CHORD_FAMILY_LABELS[familyModel.id]
            : (familyModel.symbol === '' ? 'major' : familyModel.symbol);
        const card = hbCard(label,
            familyModel.formula + ' · ' +
            chordStackedIntervals(familyModel.degrees).join(' + '));
        card.card.id = 'hb-target-chords-' + familyModel.id;
        familyModel.forms.forEach(formModel => {
            // Span-string i sits on app string groupLow - i; display highest first
            const rows = [];
            for (let i = formModel.span - 1; i >= 0; i--) {
                const string = groupLow - i;
                rows.push({
                    string: string,
                    label: hbStringLabel(string),
                    muted: formModel.rel[i] === null
                });
            }
            // Pure movable shapes: only the root's slot is labelled ('R'); the other
            // tones are plain dots, so no diagram names a concrete root or chord
            const cells = {};
            formModel.positions.forEach((position, index) => {
                const isRoot = index === formModel.rootIndex;
                cells[position[0] + ':' + position[1]] = {
                    text: isRoot ? 'R' : '',
                    root: isRoot
                };
            });
            const badges = formModel.omits.map(omit => 'no ' + omit);
            if (formModel.inversion > 0) {
                badges.push(['', '1st inv', '2nd inv', '3rd inv'][formModel.inversion]);
            }
            card.gallery.appendChild(hbRenderDiagram({
                title: 'Shape ' + (formModel.formIndex + 1),
                badges: badges,
                fretMin: formModel.fretMin,
                fretMax: formModel.fretMax,
                rows: rows,
                cells: cells,
                onPlay: () => playChord(formModel.positions)
            }));
        });
        container.appendChild(card.card);
    });
    hbScrollSpy();
}

// Section 4: one card per catalog entry (narrowest one-octave applicature),
// grouped Arpeggios/Scales x tier. The 146 cards get the chip bar with a name
// filter; the group headers double as jump targets and stick under the bar.
function hbRenderSequences() {
    const container = document.getElementById('hb-sequence-cards');
    if (!container) return;
    container.innerHTML = '';
    hbSeqGroups.length = 0;
    const model = buildSequenceSectionModel({ stringCount: stringTunings.length });

    hbRenderSubnav('sequences', sequenceSubnavEntries(model.items), entry => entry.label);

    [{ group: 'arpeggio', label: 'Arpeggios' }, { group: 'scale', label: 'Scales' }]
        .forEach(groupInfo => {
            for (const tier of [1, 2, 3]) {
                const items = model.items.filter(item =>
                    item.entry.group === groupInfo.group && item.entry.tier === tier);
                if (items.length === 0) continue;
                const header = hbGroupHeader(groupInfo.label + ' — Tier ' + tier);
                header.id = 'hb-target-sequences-' + groupInfo.group + '-' + tier;
                container.appendChild(header);
                const group = { header: header, cards: [] };
                items.forEach(item => {
                    const card = hbCard(item.entry.name, item.entry.intervals.join(' '));

                    const strings = Array.from(new Set(item.notes.map(n => n.string)))
                        .sort((a, b) => a - b); // highest string on top
                    const rows = strings.map(string => ({
                        string: string, label: hbStringLabel(string), muted: false
                    }));
                    const cells = {};
                    item.notes.forEach(note => {
                        cells[note.string + ':' + note.fret] = {
                            text: ROMAN_DEGREES[note.label],
                            root: note.isRoot,
                            pill: true
                        };
                    });
                    const frets = item.notes.map(n => n.fret);
                    card.gallery.appendChild(hbRenderDiagram({
                        title: 'frets ' + Math.min.apply(null, frets) + '–' +
                            Math.max.apply(null, frets),
                        fretMin: Math.min.apply(null, frets),
                        fretMax: Math.max.apply(null, frets),
                        rows: rows,
                        cells: cells,
                        onPlay: () => playSequenceNotes(
                            item.notes.map(n => ({ string: n.string, fret: n.fret })))
                    }));
                    container.appendChild(card.card);
                    group.cards.push({ el: card.card, name: item.entry.name.toLowerCase() });
                });
                hbSeqGroups.push(group);
            }
        });

    // The fresh cards must respect a filter typed before the re-render
    hbApplySeqFilter();
    hbUpdateStickyOffset();
}

// Group index for the name filter, rebuilt by every hbRenderSequences() call
const hbSeqGroups = [];

// Live name filter over the sequence cards: hides non-matching cards (and their
// emptied group headers), disables chips whose group ran empty and shows a
// "nothing matches" note. An empty query restores the full list.
function hbApplySeqFilter() {
    const input = document.getElementById('hb-seq-search');
    if (!input || hbSeqGroups.length === 0) return;
    const clear = document.getElementById('hb-seq-clear');
    const emptyNote = document.getElementById('hb-seq-empty');
    const needle = input.value.trim().toLowerCase();

    if (clear) clear.hidden = needle === '';
    let shown = 0;
    hbSeqGroups.forEach(group => {
        let groupShown = 0;
        group.cards.forEach(card => {
            const match = needle === '' || card.name.indexOf(needle) !== -1;
            card.el.classList.toggle('hidden', !match);
            if (match) { groupShown++; shown++; }
        });
        group.header.classList.toggle('hidden', groupShown === 0);
    });
    if (emptyNote) emptyNote.classList.toggle('hidden', shown > 0 || needle === '');

    const row = document.getElementById('hb-chiprow-sequences');
    if (row) {
        Array.prototype.slice.call(row.querySelectorAll('.hb-chip[data-target]')).forEach(chip => {
            const target = document.getElementById(chip.dataset.target);
            chip.disabled = target === null || target.classList.contains('hidden');
        });
    }
    hbScrollSpy();
}

// Section 5: the mnemonics map (prose is static HTML moved from the old guide popup)
function hbRenderMnemonics() {
    hbRenderScheme();
    hbUpdateMnemonicsAvailability();
}

function hbRenderScheme() {
    const container = document.getElementById('hb-mn-scheme');
    if (!container) return;
    container.innerHTML = '';
    const model = buildMnemonicSchemeModel({ stringCount: stringTunings.length });
    const tints = ['mn-shape-a', 'mn-shape-b', 'mn-shape-c'];

    const header = document.createElement('div');
    header.className = 'mn-string-row';
    const headerLabel = document.createElement('span');
    headerLabel.className = 'mn-string-label';
    header.appendChild(headerLabel);
    for (let fret = 0; fret <= 12; fret++) {
        const number = document.createElement('span');
        number.className = 'mn-fret-number';
        number.textContent = fret;
        header.appendChild(number);
    }
    container.appendChild(header);

    model.rows.forEach(row => {
        const rowEl = document.createElement('div');
        rowEl.className = 'mn-string-row';
        const label = document.createElement('span');
        label.className = 'mn-string-label';
        label.textContent = row.letter;
        rowEl.appendChild(label);
        row.cells.forEach(cell => {
            const cellEl = document.createElement('span');
            cellEl.className = 'mn-cell';
            if (cell.noteLetter !== null) {
                cellEl.classList.add(tints[cell.tint]);
                cellEl.textContent = cell.noteLetter;
            } else if (cell.openName) {
                // The open string of an accidental-tuned string: shown by name,
                // dimmed like the gap sharp it is
                cellEl.classList.add('mn-gap-sep');
                cellEl.textContent = cell.openName;
            } else {
                cellEl.classList.add(cell.internal ? 'mn-gap-internal' : 'mn-gap-sep');
                cellEl.textContent = cell.internal ? '#' : '·';
            }
            if (cell.wrap) cellEl.classList.add('mn-wrap');
            rowEl.appendChild(cellEl);
        });
        container.appendChild(rowEl);
    });
}

// Show the unlock hint when the live tuning is not half-step-down all fourths
// (same wording as the settings-popup hint)
function hbUpdateMnemonicsAvailability() {
    const hint = document.getElementById('hb-mnemonics-availability');
    if (!hint) return;
    const available = isMnemonicTuningAvailable(stringTunings.length,
        getNoteIndex(stringTunings[stringTunings.length - 1]));
    hint.classList.toggle('hidden', available);
    hint.textContent = available ? '' :
        'Requires a half-step-down all-fourths tuning: lowest string D# (4/6 strings) or A# (5/7 strings)';
}

function renderHandbookSection(id) {
    const signature = hbTuningSignature();
    if (id === 'tuning') hbRenderTuning();
    else if (id === 'intervals') hbRenderIntervals();
    else if (id === 'chords') hbRenderChords();
    else if (id === 'sequences') hbRenderSequences();
    else if (id === 'mnemonics') hbRenderMnemonics();
    hbRenderedSignature[id] = signature;
}

function hbShowSection(id) {
    hbSectionIds.forEach(sectionId => {
        const section = document.getElementById('hb-sec-' + sectionId);
        if (section) section.classList.toggle('hidden', sectionId !== id);
    });
    document.querySelectorAll('.hb-nav-button').forEach(button => {
        button.classList.toggle('active', button.dataset.hbSection === id);
    });
    const title = document.getElementById('hb-title');
    if (title) title.textContent = hbSectionTitles[id];
    if (hbRenderedSignature[id] !== hbTuningSignature()) renderHandbookSection(id);
    if (typeof setCookie === 'function') setCookie(HB_SECTION_COOKIE, id, SETTINGS_COOKIE_DAYS);
    const content = document.querySelector('.hb-content');
    if (content) content.scrollTop = 0;
    // Sticky offsets and chip states belong to the section now in view
    hbUpdateStickyOffset();
    hbScrollSpy();
}

// The handbook reopens on the section the user last read (the Guide button's
// explicit target still wins)
const HB_SECTION_COOKIE = 'hbLastSection';

function openHandbook(sectionId) {
    const popup = document.getElementById('handbook-tooltip');
    if (popup) popup.classList.remove('hidden');
    let target = sectionId;
    if (!target && typeof getCookie === 'function') {
        const saved = getCookie(HB_SECTION_COOKIE);
        if (saved !== null && hbSectionIds.indexOf(saved) !== -1) target = saved;
    }
    hbShowSection(target || 'tuning');
}

function closeHandbook() {
    const popup = document.getElementById('handbook-tooltip');
    if (popup) popup.classList.add('hidden');
}

function toggleHandbook() {
    const popup = document.getElementById('handbook-tooltip');
    if (!popup) return;
    if (popup.classList.contains('hidden')) openHandbook();
    else closeHandbook();
}

// Wired once from the top-bar setup block in index.html
function initHandbook() {
    document.querySelectorAll('.hb-nav-button').forEach(button => {
        button.addEventListener('click', () => hbShowSection(button.dataset.hbSection));
    });
    const close = document.querySelector('.hb-close');
    if (close) close.addEventListener('click', closeHandbook);

    // Scrollspy: throttled to one update per frame while the pane scrolls
    const content = document.querySelector('.hb-content');
    if (content) {
        content.addEventListener('scroll', () => {
            if (hbSpyFrame !== null) return;
            hbSpyFrame = window.requestAnimationFrame(hbScrollSpy);
        });
    }

    // Sequence name filter: debounced while typing; Esc in the field clears it
    const search = document.getElementById('hb-seq-search');
    if (search) {
        let timer = null;
        search.addEventListener('input', () => {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(hbApplySeqFilter, 120);
        });
        search.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                search.value = '';
                hbApplySeqFilter();
            }
        });
    }
    const clear = document.getElementById('hb-seq-clear');
    if (clear) {
        clear.addEventListener('click', () => {
            const field = document.getElementById('hb-seq-search');
            field.value = '';
            hbApplySeqFilter();
            field.focus();
        });
    }

    document.addEventListener('keydown', event => {
        const popup = document.getElementById('handbook-tooltip');
        if (event.key === 'Escape' && popup && !popup.classList.contains('hidden')) {
            closeHandbook();
        }
        if ((event.key === 'h' || event.key === 'H') &&
            document.activeElement &&
            document.activeElement.tagName !== 'INPUT' &&
            document.activeElement.tagName !== 'TEXTAREA') {
            event.preventDefault();
            toggleHandbook();
        }
    });
}
