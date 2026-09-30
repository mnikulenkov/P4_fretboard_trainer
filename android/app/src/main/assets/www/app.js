// Utility functions for consistent note handling
const noteUtils = {
    // Maps between sharp and flat representations
    equivalents: {
        'F#': 'Gb',
        'C#': 'Db',
        'G#': 'Ab',
        'D#': 'Eb',
        'A#': 'Bb'
    },
    
    // All notes in standard order (using sharp notation as canonical)
    allNotes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    
    // Natural notes only
    naturalNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    
    // Accidental notes (sharp form)
    accidentalNotes: ['C#', 'D#', 'F#', 'G#', 'A#'],

    // Natural notes that lie a half-tone apart (no accidental between them)
    halfToneNotes: ['B', 'C', 'E', 'F'],

    // Random spelling state: canonical sharp note -> the spelling currently in
    // play. Filled by reshuffleNotation() and read by getDisplayPreference(),
    // so every display of a note within one exercise agrees; the map is drawn
    // anew on every exercise while "Randomize notation" is on.
    notationRandom: {},

    // "Randomize notation" (the Circle of Fifths toggle) - on by default
    isNotationRandomized: function() {
        return localStorage.getItem('notationRandomize') !== 'off';
    },

    setNotationRandomized: function(on) {
        localStorage.setItem('notationRandomize', on ? 'on' : 'off');
    },

    // Redraw the sharp/flat spelling of every enharmonic note from scratch
    reshuffleNotation: function() {
        Object.keys(this.equivalents).forEach(sharp => {
            this.notationRandom[sharp] = Math.random() < 0.5
                ? sharp
                : this.equivalents[sharp];
        });
    },

    // What a Circle of Fifths position (canonical sharp key) shows right now:
    // the live random draw when randomize is on, the stored pick otherwise
    currentSpelling: function(sharpKey) {
        if (this.isNotationRandomized() && this.notationRandom[sharpKey]) {
            return this.notationRandom[sharpKey];
        }
        return getCookie(`circle_${sharpKey}`) || sharpKey;
    },

    // Get the preferred display for a note based on Circle of Fifths settings
    getDisplayPreference: function(note) {
        // Natural notes have no alternative display
        if (!note.includes('#') && !note.includes('b')) {
            return note;
        }

        // Convert note to canonical (sharp) form if it's flat
        let canonicalNote = note;
        if (note.includes('b')) {
            for (const [sharp, flat] of Object.entries(this.equivalents)) {
                if (flat === note) {
                    canonicalNote = sharp;
                    break;
                }
            }
        }

        // Randomized spelling (the Circle of Fifths toggle) wins over the
        // manually picked spellings
        if (this.isNotationRandomized() && this.notationRandom[canonicalNote]) {
            return this.notationRandom[canonicalNote];
        }

        // Look up display preference from Circle of Fifths
        const preference = getCookie(`circle_${canonicalNote}`);
        if (preference) {
            return preference;
        }

        // No preference found, return the original note
        return note;
    },
    
    // Check if two notes are equivalent (e.g., F# and Gb)
    areEquivalent: function(note1, note2) {
        if (note1 === note2) return true;
        
        for (const [sharp, flat] of Object.entries(this.equivalents)) {
            if ((note1 === sharp && note2 === flat) || 
                (note1 === flat && note2 === sharp)) {
                return true;
            }
        }
        
        return false;
    },
    
    // Get available notes based on the current study mode
    getNotesForStudyMode: function() {
        // Check checkbox states with the CORRECT IDs from HTML
        // (no optional chaining — keeps this parseable on pre-Chromium-80 WebViews)
        const naturalsBox = document.getElementById('naturals');
        const accidentalsBox = document.getElementById('sharpsFlats');
        const halfTonesBox = document.getElementById('naturalsHalfTones');
        const naturalOnly = (naturalsBox && naturalsBox.checked) || false;
        const accidentalsOnly = (accidentalsBox && accidentalsBox.checked) || false;
        const halfTonesOnly = (halfTonesBox && halfTonesBox.checked) || false;

        console.log("Filter checkboxes (correct IDs):", { naturalOnly, accidentalsOnly, halfTonesOnly });

        if (halfTonesOnly) {
            // Focused drill: practice only the half-tone naturals (B/C and E/F),
            // regardless of the other note-type checkboxes
            console.log("Using naturals half-tones:", this.halfToneNotes);
            return [...this.halfToneNotes]; // Return a copy to avoid mutations
        }

        if (naturalOnly && !accidentalsOnly) {
            console.log("Using natural notes only:", this.naturalNotes);
            return [...this.naturalNotes]; // Return a copy to avoid mutations
        } else if (!naturalOnly && accidentalsOnly) {
            console.log("Using accidentals only:", this.accidentalNotes);
            return [...this.accidentalNotes]; // Return a copy to avoid mutations
        } else {
            // Both checked or both unchecked = all notes
            console.log("Using all notes:", this.allNotes);
            return [...this.allNotes]; // Return a copy to avoid mutations
        }
    },
    
    // Generate answer choices that respect study mode and display preferences
    generateAnswerChoices: function(correctNote) {
        console.log('generateAnswerChoices in app.js', correctNote);
        const notePool = this.getNotesForStudyMode();
        
        // Always include the correct answer (in canonical form)
        let choices = [correctNote];
        
        // Add random incorrect answers from the appropriate note pool
        while (choices.length < 4) { // Assuming 4 total answer choices
            const randomNote = notePool[Math.floor(Math.random() * notePool.length)];
            
            // Avoid duplicates and equivalents
            if (!choices.some(note => this.areEquivalent(note, randomNote))) {
                choices.push(randomNote);
            }
        }
        
        // Shuffle the choices
        choices = this.shuffleArray(choices);
        
        // Apply display preferences
        return choices.map(note => this.getDisplayPreference(note));
    },
    
    // Helper function to shuffle an array
    shuffleArray: function(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
}; 

// Helper to get canonical form (sharp version) of any note
function getCanonicalForm(note) {
    if (note.includes('b')) {
        // Convert flat to sharp for canonical storage
        for (const [sharp, flat] of Object.entries(noteUtils.equivalents)) {
            if (flat === note) return sharp;
        }
    }
    return note;
}

// Theme toggling functionality
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    
    // Check for saved theme preference or use default
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    // Toggle theme when button is clicked
    themeToggle.addEventListener('click', function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
    
    function updateThemeIcon(theme) {
        themeIcon.textContent = theme === 'dark' ? '🌕' : '🌑';  // Full white moon for dark mode, full dark moon for light mode
    }
    
    // Update accidental notes array based on Circle of Fifths preferences
    updateAccidentalNotesFromPreferences();
    
    // Force a full refresh of all circle preferences
    refreshCirclePreferences();
    
}); 

function generateNoteAnswerOptions(correctNote) {
    // Get the canonical form of the correct note
    const canonicalCorrect = getCanonicalForm(correctNote);
    
    // Get available notes based on study mode
    const notePool = noteUtils.getNotesForStudyMode();
    
    // CRITICAL FIX: Check if the correct note is actually in the study pool
    // If not, we need to select a new correct note from the pool
    if (!notePool.includes(canonicalCorrect) && 
        !notePool.some(note => noteUtils.areEquivalent(note, canonicalCorrect))) {
        // The correct note isn't in our study pool! Get a new one from the pool
        const randomIndex = Math.floor(Math.random() * notePool.length);
        correctNote = notePool[randomIndex];
        
        // Update global correct note
        window.correctNote = correctNote;
        
        // Reposition on fretboard
        const stringFretCombinations = findNoteLocations(correctNote);
        const position = selectRandomLocation(stringFretCombinations);
        currentString = position.string;
        currentFret = position.fret;
        renderFretboard();
    }
    
    // Create answer choices using the filtered note pool
    let choices = [canonicalCorrect]; // Start with correct answer
    
    // Add random incorrect answers from the note pool
    while (choices.length < 4) {
        const randomNote = notePool[Math.floor(Math.random() * notePool.length)];
        if (!choices.some(note => noteUtils.areEquivalent(note, randomNote))) {
            choices.push(randomNote);
        }
    }
    
    // Shuffle the choices
    const shuffledChoices = noteUtils.shuffleArray(choices);
    
    // Apply display preferences from Circle of Fifths
    return shuffledChoices.map(note => {
        // Ensure we're using canonical form before getting preference
        return noteUtils.getDisplayPreference(getCanonicalForm(note));
    });
} 

// Enhanced function to update accidental notes array with better logging
function updateAccidentalNotesFromPreferences() {
    // Start with the canonical sharp versions
    const accidentals = ['C#', 'D#', 'F#', 'G#', 'A#'];
    
    // Log the cookies for debugging
    console.log("Current Circle of Fifths cookie values:");
    accidentals.forEach(note => {
        console.log(`circle_${note}: ${getCookie(`circle_${note}`)}`);
    });
    
    // Replace each with the user's preferred display version
    noteUtils.accidentalNotes = accidentals.map(note => {
        const preference = getCookie(`circle_${note}`);
        return preference || note; // Use preference if available, otherwise keep the sharp version
    });
    
    console.log("Updated accidental notes array:", noteUtils.accidentalNotes);
}

// Create a new function that forces a refresh of all Circle of Fifths cookies
function refreshCirclePreferences() {
    // Get all Circle of Fifths keys that have alternatives
    const keysWithAlts = circleKeys.filter(k => k.alt);
    
    keysWithAlts.forEach(key => {
        // Get the canonical key (the sharp version)
        const canonicalKey = key.key.includes('#') ? key.key : key.alt;
        
        // Get current preference
        const currentPreference = getCookie(`circle_${canonicalKey}`);
        
        console.log(`Current preference for ${canonicalKey}: ${currentPreference}`);
        
        // If no preference is set, set default (the key displayed in the circle)
        if (!currentPreference) {
            // Get the element from the circle
            const keyElement = document.querySelector(`.circle-key[data-note="${canonicalKey}"]`);
            if (keyElement) {
                const displayed = keyElement.textContent;
                setCookie(`circle_${canonicalKey}`, displayed, 30);
                console.log(`Setting default for ${canonicalKey} to ${displayed}`);
            } else {
                // If element doesn't exist yet, set default based on circleKeys definition
                const defaultDisplay = key.key; // Use key.key as default
                setCookie(`circle_${canonicalKey}`, defaultDisplay, 30);
                console.log(`Setting initial default for ${canonicalKey} to ${defaultDisplay}`);
            }
        }
    });
    
    // Now update the accidental notes array
    updateAccidentalNotesFromPreferences();
}

// Wait for full document load, not just DOM content loaded
window.addEventListener('load', function() {
    console.log("Window fully loaded - refreshing Circle preferences");
    setTimeout(refreshCirclePreferences, 500); // Short delay to ensure circle is rendered
});

function updateDisplayedNotes() {
    // First update the accidentals array
    updateAccidentalNotesFromPreferences();
    
    // Then update displayed buttons
    const answerButtons = document.querySelectorAll('.answer-button');
    answerButtons.forEach(button => {
        if (button.dataset.canonicalNote) {
            button.textContent = noteUtils.getDisplayPreference(button.dataset.canonicalNote);
        }
    });
} 