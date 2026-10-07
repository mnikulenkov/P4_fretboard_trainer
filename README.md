# P4 Fretboard Trainer

A fretboard trainer for **all-fourths (P4) tuned** stringed instruments — guitar and bass, 4 to 8 strings. Runs as a plain web app (no frameworks, no build step, no dependencies) and ships as an offline Android app.

**New: the Progression Lab** — enter chord progressions as degrees and get ranked scale/arpeggio suggestions with audio and fretboard playback, scale plans inside each chord, phrase playback over the loop, a 91-preset library (79 jazz standards, each in its own key), and share links. See [the section below](#progression-lab).

This is a **fork** of [gWOLF3/guitartrainer](https://github.com/gWOLF3/guitartrainer), reworked for all-fourths tuning.

## What it trains

- **Note** — name the highlighted note on the fretboard: naturals, sharps/flats, half-tone pairs, or the **mnemonics** system (currently one: the *half-step-down C major scale* — fret 1 of every string is a natural, and each string's naturals group into 3 fixed shapes)
- **Interval** — name the interval from the red root, fingered across 1–3 strings; regular or inversion drills
- **Identify interval sequence** — recognize scale & arpeggio shapes (146 movable shapes, filterable by name)
- **Chords** — identify real movable P4 voicings: 66 shapes across 22 chord types, with root/type distractors, inversion drills and enharmonic-twin handling
- **Triad (legacy)** — the original generic 3-string triad mode, kept for old habits

Everything is generated on the fly for your current instrument: string count and lowest string are adjustable, and the whole trainer, not just the diagrams, follows the P4 symmetry (any shape works at any fret and on any string group).

## Progression Lab

The 🎼 button (or `L`) opens a self-contained lab for playing over changes — an explorer, not a quiz:

- **Enter progressions as degrees** — `IIm7 V7 Imaj7`, backdoor `bVIImaj7`, secondary `V7/II` — with accidentals always relative to the major scale on the base root, so minor keys need no special case. Pick a **base root** and every chip shows the realized chord (`Dm7 G7 Cmaj7`), borrowed-chord provenance included
- **Ranked scale suggestions per chord** — driven by a pre-researched *stability atlas* (Krumhansl–Kessler probe-tone ratings, Lerdahl's tonal pitch space, Parncutt's root-support weights), never runtime interval math: fit with the current chord, resolution into the next, avoid-note penalties. Every card explains itself and auditions chord + scale together, on the P4 neck
- **Scale plans** — several scales *inside* one chord (`ionian → lydian → ionian` over a vamp): drag the segment boundaries, rank transitions between scales, see dashed ghost pills for what the next segment changes, and hear the strongest resolver at each boundary as a dyad
- **Phrase playback** — the transport loops the progression and plays a line that spans each chord exactly: it enters near where the previous phrase left off, arches up (stable tones as quarter notes, color tones as eighths), and lands on the tone that best resolves into the next chord. Swing feel, count-in, and straight-8th/triplet/16th grids included
- **91 presets** — 12 forms (ii–V–I variants, both 12-bar blues, rhythm changes, Coltrane cycle, Neapolitan…) and 79 jazz standards from *All of Me* to *Giant Steps*, each loading in its own key
- **Share links** — 🔗 copies a URL that restores the whole session: progression, root, chosen scales, scale plans and every non-default setting. An unmodified preset collapses to just its name and root (`#lab=~std-autumnleaves@G`). On Android the button opens the system share sheet, and `p4fretboard://` deep links open the app on a shared progression

The full design document — the degree grammar, the stability data, the scoring math, and the research bibliography — lives in [`docs/progression-lab.md`](docs/progression-lab.md).

## The Handbook

The 📖 button (or `H`) opens the in-app reference guide rendered for your live tuning: the P4 tuning itself, every interval fingering, all 66 chord voicings as pure movable shapes, every scale/arpeggio shape, and the mnemonics with a visual scheme. Its sixth section is the **Progression Lab companion**: the degree-notation cheat sheet, a common-tokens table, how the ranking works (and why it reproduces standard pedagogy from the data alone), scale plans, and the transport. Long sections carry a chip bar for jumping straight to a family, plus a name filter; every diagram is clickable to hear it.

Also in the top bar: a circle of fifths, light/dark themes, and playback of whatever is on the fretboard.

## Run it (browser)

The app keeps its score and settings in cookies, so serve it rather than opening `file://`:

```sh
node server.js       # then open http://localhost:3000
```

`server.js` is a zero-dependency static server — the app itself is plain HTML/CSS/JS.

## Android app

The `android/` folder is a small WebView shell around the same web app, bundled fully offline (no `INTERNET` permission — it cannot touch the network). Build instructions and toolchain layout are in [`android/README.md`](android/README.md).

Note for building releases: `keystore.properties` and `release.keystore` are **gitignored** on purpose — provide your own signing config to build installable release APKs.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | the whole UI: markup, styles hookup, and the app's inline controller script |
| `styles.css` | all styling (light/dark themes via CSS variables) |
| `fretboard.js`, `sound.js`, `tuning.js` | fretboard rendering & note lookup, Web Audio playback, tuning state |
| `app.js` | shared note-handling utilities (sharp/flat equivalents, name parsing) |
| `triads.js`, `getTriadShape.js` | legacy triad mode: data and shape generation |
| `intervals.js`, `sequences.js`, `chords.js`, `mnemonics.js` | the mode engines (DOM-free, unit-testable) |
| `progression.js` | the Progression Lab: degree grammar, stability atlas, scoring, plan/phrase model, transport, panel (same DOM-free/testable split) |
| `handbook.js`, `circleOfFifths.js` | the reference guide and the circle of fifths |
| `docs/progression-lab.md` | the Progression Lab design document |
| `server.js` | zero-dependency dev server |
| `android/` | the WebView shell and its Gradle project |

## Credits

Forked from [gWOLF3/guitartrainer](https://github.com/gWOLF3/guitartrainer) — the original trainer this project builds upon.
