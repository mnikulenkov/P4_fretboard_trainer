const circleKeys = [
    { key: 'C', angle: 0 },
    { key: 'G', angle: 30 },
    { key: 'D', angle: 60 },
    { key: 'A', angle: 90 },
    { key: 'E', angle: 120 },
    { key: 'B', angle: 150 },
    { key: 'F#', alt: 'Gb', angle: 180 },
    { key: 'C#', alt: 'Db', angle: 210 },
    { key: 'G#', alt: 'Ab', angle: 240 },
    { key: 'D#', alt: 'Eb', angle: 270 },
    { key: 'Bb', alt: 'A#', angle: 300 },
    { key: 'F', angle: 330 }
];

function renderCircleOfFifths() {
    const container = document.getElementById('circle-container');
    if (!container) return;
    container.innerHTML = '';
    const size = Math.min(container.offsetWidth, container.offsetHeight);
    const radius = size / 2;
    circleKeys.forEach(key => {
        const angleRad = (key.angle * Math.PI) / 180;
        const x = radius + (radius * 0.7) * Math.cos(angleRad);
        const y = radius + (radius * 0.7) * Math.sin(angleRad);

        const keyDiv = document.createElement('div');
        keyDiv.className = 'circle-key';
        const canonicalKey = key.key.includes('#') ? key.key : (key.alt || key.key);
        keyDiv.textContent = key.alt
            ? noteUtils.currentSpelling(canonicalKey)
            : key.key;
        if (key.alt) keyDiv.classList.add('sharp-flat');
        keyDiv.style.left = `${x}px`;
        keyDiv.style.top = `${y}px`;

        keyDiv.addEventListener('click', () => {
            if (key.alt) {
                // A manual pick takes control: switch randomize off first
                if (noteUtils.isNotationRandomized()) {
                    noteUtils.setNotationRandomized(false);
                    const randomizeBox = document.getElementById('cof-randomize');
                    if (randomizeBox) randomizeBox.checked = false;
                }
                const current = keyDiv.textContent;
                const newKey = current === key.key ? key.alt : key.key;
                keyDiv.textContent = newKey;

                // Store preference in cookie (use the sharp version as the key)
                const canonicalKey = key.key.includes('#') ? key.key : key.alt;
                setCookie(`circle_${canonicalKey}`, newKey, 30);

                // Update any displayed notes on the page to maintain consistency
                updateDisplayedNotes();
            }
        });

        container.appendChild(keyDiv);
    });
}

// Add function to update displayed notes when preferences change
function updateDisplayedNotes() {
    // Update answer buttons if they exist
    const answerButtons = document.querySelectorAll('.answer-button');
    answerButtons.forEach(button => {
        if (button.dataset.canonicalNote) {
            button.textContent = noteUtils.getDisplayPreference(button.dataset.canonicalNote);
        }
    });

    // Update any other displayed notes as needed
}
