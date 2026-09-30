const triads = {
    major: {
        name: 'Major',
        symbol: '',  // Empty string because major is implied
        intervals: [0, 4, 7] // Root, Major 3rd, Perfect 5th
    },
    minor: {
        name: 'Minor',
        symbol: 'm',
        intervals: [0, 3, 7] // Root, Minor 3rd, Perfect 5th
    },
    diminished: {
        name: 'Diminished',
        symbol: 'o',
        intervals: [0, 3, 6] // Root, Minor 3rd, Diminished 5th
    },
    augmented: {
        name: 'Augmented',
        symbol: '+',
        intervals: [0, 4, 8] // Root, Major 3rd, Augmented 5th
    }
};

// Define practical guitar triad shapes based on CAGED system
// These shapes follow standard guitar fingerings with small spans (3-4 frets max)
const triadShapes = {
    major: {
        // Root position triads (root in bass)
        root: [
            // E-shape (strings are relative to the root string)
            [[0, 0], [1, 0], [2, 1]],  // E shape (strings 4,5,6 or 1,2,3)
            // A-shape
            [[0, 0], [1, 2], [2, 2]],  // A shape 
            // C-shape
            [[0, 0], [1, 1], [2, 0]],  // C shape
            // G-shape compact version
            [[0, 0], [1, 0], [2, 3]]   // G shape simplified
        ],
        // First inversion triads (3rd in bass)
        first: [
            [[0, 0], [1, 0], [2, 2]],  // E-based 1st inversion
            [[0, 0], [1, 3], [2, 2]],  // A-based 1st inversion
            [[0, 0], [1, 2], [2, 0]],  // C-based 1st inversion
            [[0, 0], [1, 2], [2, 4]]   // Compact 1st inversion
        ],
        // Second inversion triads (5th in bass)
        second: [
            [[0, 0], [1, 2], [2, 2]],  // E-based 2nd inversion
            [[0, 0], [1, 0], [2, 0]],  // A-based 2nd inversion
            [[0, 0], [1, 0], [2, 1]],  // D-based 2nd inversion
            [[0, 0], [1, 1], [2, 3]]   // Compact 2nd inversion
        ]
    },
    minor: {
        // Root position triads (root in bass)
        root: [
            // Em-shape
            [[0, 0], [1, 0], [2, 0]],  // Em shape
            // Am-shape
            [[0, 0], [1, 1], [2, 2]],  // Am shape
            // Dm-shape
            [[0, 0], [1, 1], [2, 3]],  // Dm shape
            // Custom compact shape
            [[0, 0], [1, 3], [2, 3]]   // Compact minor shape
        ],
        // First inversion triads (♭3rd in bass)
        first: [
            [[0, 0], [1, 3], [2, 3]],  // Em-based 1st inversion (♭3rd, 5th, root)
            [[0, 0], [1, 3], [2, 2]],  // Am-based 1st inversion (♭3rd, root, 5th)
            [[0, 0], [1, 2], [2, 1]],  // Dm-based 1st inversion (♭3rd, 5th, root)
            [[0, 0], [1, 2], [2, 0]]   // Compact 1st inversion (♭3rd, root, 5th)
        ],
        // Second inversion triads (5th in bass)
        second: [
            [[0, 0], [1, 3], [2, 3]],  // Em-based 2nd inversion
            [[0, 0], [1, 0], [2, 0]],  // Am-based 2nd inversion
            [[0, 0], [1, 0], [2, 2]],  // Compact 2nd inversion
            [[0, 0], [1, 2], [2, 3]]   // Dm-based 2nd inversion
        ]
    },
    diminished: {
        root: [
            [[0, 0], [1, 0], [2, -1]],  // Edim shape
            [[0, 0], [1, 1], [2, 1]],   // Adim shape
            [[0, 0], [1, 0], [2, 2]],   // Compact dim shape
            [[0, 0], [1, 3], [2, 2]]    // Ddim shape
        ],
        first: [
            [[0, 0], [1, 0], [2, 3]],   // 1st inversion
            [[0, 0], [1, 2], [2, 1]],   // Compact 1st inversion
            [[0, 0], [1, 3], [2, 0]],   // Alternative 1st inversion
            [[0, 0], [1, 0], [2, 0]]    // Simple 1st inversion
        ],
        second: [
            [[0, 0], [1, 3], [2, 3]],   // 2nd inversion
            [[0, 0], [1, 0], [2, -1]],  // Compact 2nd inversion
            [[0, 0], [1, 0], [2, 1]],   // Alternative 2nd inversion
            [[0, 0], [1, 2], [2, 0]]    // Simple 2nd inversion
        ]
    },
    augmented: {
        root: [
            [[0, 0], [1, 0], [2, 1]],   // E+ shape
            [[0, 0], [1, 1], [2, 1]],   // A+ shape
            [[0, 0], [1, 1], [2, 0]],   // Compact aug shape
            [[0, 0], [1, 4], [2, 4]]    // D+ shape
        ],
        first: [
            [[0, 0], [1, 0], [2, 1]],   // 1st inversion
            [[0, 0], [1, 1], [2, 0]],   // Compact 1st inversion
            [[0, 0], [1, 1], [2, 1]],   // Alternative 1st inversion
            [[0, 0], [1, 0], [2, 0]]    // Simple 1st inversion
        ],
        second: [
            [[0, 0], [1, 1], [2, 0]],   // 2nd inversion
            [[0, 0], [1, 0], [2, 0]],   // Compact 2nd inversion
            [[0, 0], [1, 0], [2, 1]],   // Alternative 2nd inversion
            [[0, 0], [1, 1], [2, 1]]    // Simple 2nd inversion
        ]
    }
};

function getAvailableTriadTypes() {
    const types = [];
    if (document.getElementById('majorTriads').checked) types.push('major');
    if (document.getElementById('minorTriads').checked) types.push('minor');
    if (document.getElementById('diminishedTriads').checked) types.push('diminished');
    if (document.getElementById('augmentedTriads').checked) types.push('augmented');
    
    // Default to major if nothing is selected
    return types.length > 0 ? types : ['major'];
}

function getAvailableStrings() {
    return Array.from(document.querySelectorAll('.string:checked'))
        .map(cb => parseInt(cb.value))
        .sort((a, b) => a - b); // Sort in ascending order
}

function formatChordName(root, type, inversion, positions) {
    // For root position, simply return the chord name with no slash
    if (inversion === 0) {
        return `${root}${triads[type].symbol}`;
    }
    
    // For inversions, find the actual bass note by looking at the lowest string
    // (highest string number is the lowest-pitched string on guitar)
    const sortedPositions = [...positions].sort((a, b) => b[0] - a[0]);
    
    // Get the lowest string position [string, fret]
    const bassString = sortedPositions[0][0];
    const bassFret = sortedPositions[0][1];
    
    // Calculate the actual note played on that string/fret
    const stringTuning = stringTunings[bassString];
    const stringTuningIndex = getNoteIndex(stringTuning);
    const bassNoteIndex = (stringTuningIndex + bassFret) % 12;
    
    // Use a guaranteed clean list of note names - no chord symbols possible
    const cleanNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const bassNote = cleanNoteNames[bassNoteIndex];
    
    // Return the proper chord name with slash notation
    return `${root}${triads[type].symbol}/${bassNote}`;
}

function getRandomTriad() {
    const minFret = parseInt(document.getElementById('minFret').value);
    const maxFret = parseInt(document.getElementById('maxFret').value);
    const selectedStrings = getAvailableStrings();

    if (selectedStrings.length < 3) {
        alert('Please select at least 3 strings for triad mode');
        document.getElementById('noteMode').checked = true;
        getRandomNote();
        return;
    }

    // Get available inversions
    const inversions = [];
    if (document.getElementById('rootPosition').checked) inversions.push(0);
    if (document.getElementById('firstInversion').checked) inversions.push(1);
    if (document.getElementById('secondInversion').checked) inversions.push(2);
    
    if (inversions.length === 0) {
        alert('Please select at least one triad inversion');
        document.getElementById('rootPosition').checked = true;
        inversions.push(0);
    }

    // Get available triad types
    const triadTypes = getAvailableTriadTypes();
    
    // Clean note names only
    const cleanNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Maximum attempts to find a valid triad to prevent infinite loops
    const maxAttempts = 20;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        attempts++;
        
        // Select random root note, type and inversion
        const rootNote = cleanNotes[Math.floor(Math.random() * cleanNotes.length)];
        const triadType = triadTypes[Math.floor(Math.random() * triadTypes.length)];
        const inversion = inversions[Math.floor(Math.random() * inversions.length)];
        
        // Get the intervals for this triad type
        const intervals = triads[triadType].intervals;
        const rootIndex = getNoteIndex(rootNote);
        
        // Calculate the actual notes of this triad (chromatic indices)
        const triadNotes = intervals.map(interval => (rootIndex + interval) % 12);
        
        // Find valid string sets from available strings
        const validStringSets = [];
        for (let i = 0; i <= selectedStrings.length - 3; i++) {
            // Get consecutive strings
            validStringSets.push(selectedStrings.slice(i, i + 3));
        }
        
        if (validStringSets.length === 0) {
            alert('Need at least 3 consecutive strings selected');
            return;
        }
        
        // Try to place the triad on the fretboard
        let position = null;
        
        // Try each valid string set
        for (const stringSet of validStringSets) {
            // Sort strings by pitch (bass to treble)
            const sortedStrings = [...stringSet].sort((a, b) => b - a);
            
            // Get the triad notes in the correct order based on inversion
            let orderedNotes;
            if (inversion === 0) {
                // Root position: Root, 3rd, 5th
                orderedNotes = [triadNotes[0], triadNotes[1], triadNotes[2]];
            } else if (inversion === 1) {
                // First inversion: 3rd, 5th, Root
                orderedNotes = [triadNotes[1], triadNotes[2], triadNotes[0]];
            } else {
                // Second inversion: 5th, Root, 3rd
                orderedNotes = [triadNotes[2], triadNotes[0], triadNotes[1]];
            }
            
            // Try to place these notes on these strings
            position = calculateValidTriadPosition(sortedStrings, orderedNotes, minFret, maxFret);
            
            if (position) break;
        }
        
        // If we couldn't find a position, try with a slightly expanded fret range
        if (!position) {
            const expandedMinFret = Math.max(0, minFret - 2);
            const expandedMaxFret = Math.min(24, maxFret + 2);
            
            for (const stringSet of validStringSets) {
                const sortedStrings = [...stringSet].sort((a, b) => b - a);
                
                let orderedNotes;
                if (inversion === 0) {
                    orderedNotes = [triadNotes[0], triadNotes[1], triadNotes[2]];
                } else if (inversion === 1) {
                    orderedNotes = [triadNotes[1], triadNotes[2], triadNotes[0]];
                } else {
                    orderedNotes = [triadNotes[2], triadNotes[0], triadNotes[1]];
                }
                
                position = calculateValidTriadPosition(sortedStrings, orderedNotes, expandedMinFret, expandedMaxFret);
                
                if (position) break;
            }
        }
        
        // If we found a valid position, use it
        if (position) {
            // Set current chord and update display
            currentChord = position;
            const actualChordName = determineActualChordName(position);
            correctChordName = actualChordName;

            // Clear other modes' stale state
            currentString = undefined;
            currentFret = undefined;
            correctNote = null;
            currentSequencePattern = null;
            currentSequenceName = null;
            currentMnemonic = null;
            currentInterval = null;
            currentChordVoicing = null;

            renderFretboard();
            document.getElementById('feedback').textContent = '';
            generateAnswerButtons();
            return; // Successfully found a triad
        }
    }
    
    // If we've tried too many times and still can't find a valid triad
    alert("Couldn't find a valid triad with current settings. Try expanding your fret range or selecting different strings.");
    // Default to root position if we're having trouble
    if (document.getElementById('firstInversion').checked || document.getElementById('secondInversion').checked) {
        document.getElementById('rootPosition').checked = true;
    }
}

// Calculate a valid position for the specified notes on the specified strings
function calculateValidTriadPosition(strings, notes, minFret, maxFret) {
    const positions = [];
    const candidateFrets = [];
    
    // For each string-note pair, find possible frets
    for (let i = 0; i < 3; i++) {
        const string = strings[i];
        const note = notes[i];
        
        // Calculate what fret gives us this note on this string
        const stringTuning = stringTunings[string];
        const tuningIndex = getNoteIndex(stringTuning);
        
        // Find the fret that produces this note
        let fret = (note - tuningIndex + 12) % 12;
        
        // Collect all possible frets within the range
        const possibleFrets = [];
        while (fret <= maxFret) {
            if (fret >= minFret) {
                possibleFrets.push(fret);
            }
            fret += 12;
        }
        
        // If no possible frets for this string-note pair, return null
        if (possibleFrets.length === 0) return null;
        
        candidateFrets.push({ string, possibleFrets });
    }
    
    // Try all combinations of frets to find one within a 5-fret span
    for (const fret1 of candidateFrets[0].possibleFrets) {
        for (const fret2 of candidateFrets[1].possibleFrets) {
            for (const fret3 of candidateFrets[2].possibleFrets) {
                const allFrets = [fret1, fret2, fret3];
                const minFretInShape = Math.min(...allFrets);
                const maxFretInShape = Math.max(...allFrets);
                
                // Check if the fret span is within 5 frets (inclusive)
                if (maxFretInShape - minFretInShape <= 4) {
                    return [
                        [candidateFrets[0].string, fret1],
                        [candidateFrets[1].string, fret2],
                        [candidateFrets[2].string, fret3]
                    ];
                }
            }
        }
    }
    
    // If no valid combination found within 5-fret span
    return null;
}

// Determine the actual chord name based on the notes in the position
function determineActualChordName(positions) {
    // Calculate the actual notes being played
    const notes = positions.map(pos => {
        const [string, fret] = pos;
        const stringNote = stringTunings[string];
        const stringIndex = getNoteIndex(stringNote);
        return (stringIndex + fret) % 12;
    });
    
    // Find the lowest note (bass)
    const lowestStringPos = [...positions].sort((a, b) => b[0] - a[0])[0];
    const bassString = lowestStringPos[0];
    const bassFret = lowestStringPos[1];
    
    // Calculate the bass note
    const bassStringNote = stringTunings[bassString];
    const bassStringIndex = getNoteIndex(bassStringNote);
    const bassNoteIndex = (bassStringIndex + bassFret) % 12;
    
    // Clean note names
    const cleanNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const bassNote = cleanNoteNames[bassNoteIndex];
    
    // Try to identify the chord
    // Sort the notes to compare with triad intervals
    const sortedNotes = [...notes].sort((a, b) => a - b);
    
    // Try each possible root note
    for (let i = 0; i < 3; i++) {
        const possibleRoot = sortedNotes[i];
        
        // Check against each triad type
        for (const [type, triadInfo] of Object.entries(triads)) {
            // Calculate what the triad notes would be with this root
            const expectedNotes = triadInfo.intervals.map(interval => 
                (possibleRoot + interval) % 12
            );
            
            // Check if these match our notes (in any order)
            if (hasAllNotes(sortedNotes, expectedNotes)) {
                const rootNoteName = cleanNoteNames[possibleRoot];
                
                // If the bass note is the root, return simple chord name
                if (bassNoteIndex === possibleRoot) {
                    return `${rootNoteName}${triadInfo.symbol}`;
                } else {
                    // Otherwise, it's a slash chord
                    return `${rootNoteName}${triadInfo.symbol}/${bassNote}`;
                }
            }
        }
    }
    
    // If no standard triad is found, return a description based on the bass note
    return `${bassNote} triad`;
}

// Helper function to check if all notes from one array are in another
function hasAllNotes(notesArray, targetNotes) {
    if (notesArray.length !== targetNotes.length) return false;

    // Check if every target note is in the notes array
    return targetNotes.every(note => notesArray.includes(note));
}

