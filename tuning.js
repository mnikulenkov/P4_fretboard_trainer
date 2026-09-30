// Tuning support: perfect-fourths only.
// A tuning is defined by just two things: the open LOWEST string's note and the
// number of strings — every higher string sits 5 semitones (a perfect fourth) above
// the one below it, e.g. E2 A2 D3 G3 C4 F4 for a 6-string.
// stringTunings[0] is the highest-pitched string (rendered at the top of the
// fretboard); each entry is a canonical note name with octave, e.g. 'E4', 'F#2'.

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
const A4_FREQUENCY = 440;
const MIN_STRINGS = 4;
const MAX_STRINGS = 8;
const MAX_OCTAVE = 6;
const TUNING_STORAGE_KEY = 'guitarTrainerTuning';
const STRING_SEMITONE_SPACING = 5; // perfect fourth

// The active tuning, derived from tuningLowest/tuningStringCount
let stringTunings = [];
let tuningLowest = 'E2';
let tuningStringCount = 6;

// 'F#2' -> { note: 'F#', octave: 2 }. The octave is optional ('F#', 'Gb' also parse;
// their octave is null) and flats are converted to sharp names ('Gb2' -> 'F#').
function parseNoteName(value) {
    const match = /^([A-G])([#b]?)(-?\d+)?$/.exec(String(value).trim());
    if (!match) return { note: null, octave: null };
    let note = match[1] + match[2];
    if (FLAT_TO_SHARP[note]) note = FLAT_TO_SHARP[note];
    return { note, octave: match[3] === undefined ? null : parseInt(match[3], 10) };
}

function isValidTuningEntry(value) {
    const parsed = parseNoteName(value);
    return parsed.note !== null && parsed.octave !== null &&
        parsed.octave >= 0 && parsed.octave <= MAX_OCTAVE;
}

// Chromatic index (0 = C) of a note name, with or without an octave suffix
function getNoteIndex(value) {
    const { note } = parseNoteName(value);
    return note ? CHROMATIC_NOTES.indexOf(note) : -1;
}

// Frequency of an open string derived from its note name and octave (A4 = 440 Hz)
function getNoteFrequency(value) {
    const { note, octave } = parseNoteName(value);
    if (note === null) return null;
    const semitonesFromA4 = (octave - 4) * 12 + (getNoteIndex(note) - CHROMATIC_NOTES.indexOf('A'));
    return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / 12);
}

// Open-string frequencies for the active tuning, indexed by string number
function getOpenStringFreqs() {
    return stringTunings.map(getNoteFrequency);
}

function normalizeTuning(strings) {
    return strings.filter(isValidTuningEntry).map(value => {
        const { note, octave } = parseNoteName(value);
        return note + octave;
    });
}

// The note `semitones` above the given note
function noteAbove(value, semitones) {
    const { note, octave } = parseNoteName(value);
    let index = getNoteIndex(note) + semitones;
    let newOctave = octave;
    while (index > 11) {
        index -= 12;
        newOctave += 1;
    }
    return CHROMATIC_NOTES[index] + newOctave;
}

function highestStringNote(lowest, count) {
    let note = lowest;
    for (let i = 1; i < count; i++) note = noteAbove(note, STRING_SEMITONE_SPACING);
    return note;
}

function isValidP4Tuning(lowest, count) {
    const parsed = parseNoteName(lowest);
    if (parsed.note === null || parsed.octave === null) return false;
    if (parsed.octave < 0 || parsed.octave > MAX_OCTAVE) return false;
    if (count < MIN_STRINGS || count > MAX_STRINGS) return false;
    return isValidTuningEntry(highestStringNote(lowest, count));
}

// Build the tuning from lowest string + string count (index 0 = highest string,
// matching the stringTunings convention used everywhere else)
function buildStringTunings(lowest, count) {
    const lowToHigh = [lowest];
    for (let i = 1; i < count; i++) {
        lowToHigh.push(noteAbove(lowToHigh[i - 1], STRING_SEMITONE_SPACING));
    }
    return normalizeTuning(lowToHigh).reverse();
}

function applyP4Tuning(lowest, count) {
    if (!isValidP4Tuning(lowest, count)) return false;
    tuningLowest = normalizeTuning([lowest])[0];
    tuningStringCount = count;
    stringTunings = buildStringTunings(tuningLowest, count);
    renderTuningEditor();
    renderStringCheckboxes();
    return true;
}

// Re-render everything that depends on the tuning and start a fresh question
function refreshAfterTuningChange() {
    renderFretboard();
    saveTuningSettings();
    // The mnemonics option is gated on the tuning being half-step-down all fourths
    if (typeof updateMnemonicsAvailability === 'function') {
        updateMnemonicsAvailability();
    }
    if (typeof startNewQuestion === 'function') {
        startNewQuestion();
    }
}

// --- Tuning settings UI -----------------------------------------------------

// Largest octave the lowest string may have for this string count while keeping
// the highest string within MAX_OCTAVE
function maxLowestOctave(count) {
    for (let oct = MAX_OCTAVE; oct >= 0; oct--) {
        if (isValidTuningEntry(highestStringNote('C' + oct, count))) return oct;
    }
    return 0;
}

function renderTuningEditor() {
    const noteSelect = document.getElementById('tuning-lowest-note');
    const octaveSelect = document.getElementById('tuning-lowest-octave');
    const countSelect = document.getElementById('tuning-string-count');
    if (!noteSelect || !octaveSelect || !countSelect) return;

    // Populate the dropdowns once
    if (noteSelect.options.length === 0) {
        CHROMATIC_NOTES.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            noteSelect.appendChild(option);
        });
        for (let n = MIN_STRINGS; n <= MAX_STRINGS; n++) {
            const option = document.createElement('option');
            option.value = n;
            option.textContent = n;
            countSelect.appendChild(option);
        }
        noteSelect.addEventListener('change', () => onTuningEditorChange());
        octaveSelect.addEventListener('change', () => onTuningEditorChange());
        countSelect.addEventListener('change', () => onTuningEditorChange());
    }

    const { note, octave } = parseNoteName(tuningLowest);

    // The octave list shrinks as the string count grows (highest string <= octave 6);
    // drop the selection down if the current octave no longer fits.
    const maxOctave = maxLowestOctave(tuningStringCount);
    if (parseInt(octaveSelect.value, 10) > maxOctave ||
        octaveSelect.options.length !== maxOctave + 1) {
        octaveSelect.innerHTML = '';
        for (let oct = 0; oct <= maxOctave; oct++) {
            const option = document.createElement('option');
            option.value = oct;
            option.textContent = oct;
            octaveSelect.appendChild(option);
        }
        octaveSelect.value = Math.min(octave, maxOctave);
    } else {
        octaveSelect.value = octave;
    }

    noteSelect.value = note;
    countSelect.value = tuningStringCount;
}

function onTuningEditorChange() {
    const note = document.getElementById('tuning-lowest-note').value;
    const octave = document.getElementById('tuning-lowest-octave').value;
    const count = parseInt(document.getElementById('tuning-string-count').value, 10);
    if (applyP4Tuning(note + octave, count)) {
        refreshAfterTuningChange();
    } else {
        // Should not happen while the editor only offers valid combinations
        renderTuningEditor();
    }
}

// Practice checkboxes for the current strings (labels follow the active tuning)
function renderStringCheckboxes() {
    const container = document.getElementById('string-checkboxes');
    if (!container) return;

    // Keep the user's checked strings when the tuning changes; new strings start checked
    const previouslyChecked = new Set(
        Array.from(container.querySelectorAll('.string:checked')).map(cb => cb.value)
    );

    container.innerHTML = '';
    const lastIndex = stringTunings.length - 1;

    stringTunings.forEach((tuning, index) => {
        const { note, octave } = parseNoteName(tuning);
        let displayName = note;
        if (typeof noteUtils !== 'undefined') {
            displayName = noteUtils.getDisplayPreference(note);
        }

        let text = `${displayName}${octave}`;
        if (index === 0) text += ' (high)';
        if (index === lastIndex) text += ' (low)';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'string';
        checkbox.value = index;
        checkbox.checked = previouslyChecked.size === 0 || previouslyChecked.has(String(index));

        // These checkboxes are generated after the app's generic input listeners are
        // attached, so they carry their own: new question + persist on change
        checkbox.addEventListener('change', () => {
            if (typeof startNewQuestion === 'function') {
                startNewQuestion();
            }
            if (typeof saveSettings === 'function') saveSettings();
        });

        const label = document.createElement('label');
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(text));
        container.appendChild(label);
    });
}

// --- Persistence ------------------------------------------------------------

function saveTuningSettings() {
    try {
        localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify({
            lowest: tuningLowest,
            count: tuningStringCount
        }));
    } catch (error) {
        console.warn('Could not save tuning settings:', error);
    }
}

// Absolute semitone count (octave * 12 + pitch class) of a note+octave string
function absoluteSemis(value) {
    const { note, octave } = parseNoteName(value);
    return octave * 12 + CHROMATIC_NOTES.indexOf(note);
}

// True when adjacent strings are all a perfect fourth apart, descending in pitch
// (stringTunings convention: index 0 = highest)
function isAllFourths(strings) {
    for (let i = 0; i < strings.length - 1; i++) {
        if (absoluteSemis(strings[i]) - absoluteSemis(strings[i + 1]) !== STRING_SEMITONE_SPACING) {
            return false;
        }
    }
    return true;
}

function loadTuningSettings() {
    let lowest = 'E2';
    let count = 6;

    try {
        const saved = JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY) || 'null');
        if (saved && typeof saved.lowest === 'string' && saved.count) {
            // Current shape: lowest string + string count
            if (isValidP4Tuning(saved.lowest, saved.count)) {
                lowest = saved.lowest;
                count = saved.count;
            }
        } else if (saved && Array.isArray(saved.strings)) {
            // Legacy shape ({preset, strings}): keep it only if it already was
            // all-fourths; anything else (standard tuning, open tunings, ...)
            // moves to the all-fourths default.
            const strings = normalizeTuning(saved.strings);
            if (strings.length >= MIN_STRINGS && strings.length <= MAX_STRINGS &&
                isAllFourths(strings)) {
                lowest = strings[strings.length - 1];
                count = strings.length;
            }
        }
    } catch (error) {
        console.warn('Could not load tuning settings:', error);
    }

    applyP4Tuning(lowest, count);
    // Persist the new shape so the migration happens exactly once
    saveTuningSettings();
}
