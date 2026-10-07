# Progression Lab — Design Document

A new, self-contained section for the P4 Fretboard Trainer: the user enters a **chord
progression in degrees/functions** (no absolute roots), sets a **base root**, and the app
suggests **scales and arpeggios to play over each chord**, ranked by how their stable
tones fit the current chord *and* resolve into the next one. Everything is playable —
chord and scale sounded together — and viewable on the P4 fretboard.

This is **not** a quiz mode and shares nothing with the exercise engine except the audio
chain, the catalogs, and the fretboard renderer.

---

## 1. Goals and non-goals

**Goals**

1. Degree-based progression entry that handles **non-diatonic chords** without requiring
   the user to know functional-harmony theory (§4).
2. Ranked scale/arpeggio suggestions where the ranking is driven by **pre-researched,
   static stability data** — "how it feels to the human ear" — never computed at runtime (§5).
3. Suggestions explain themselves: interval formula, overlap with the current chord,
   resolution into the next chord (§8).
4. Play chords + scale simultaneously to hear the fit; see the scale on the P4 neck (§9).

**Non-goals (v1)**

- No absolute-chord input (iReal-style `Cmaj7` entry). Degrees are the point; absolute
  names are *output*.
- No figured-bass inversions / slash bass (`V65`, `I/3`). Slash syntax is reserved for
  secondary chords.
- No AI/generative soloing, no automatic reharmonization.

---

## 2. Placement in the app

Follows the **handbook pattern** (a separate overlay panel with its own engine), not the
`Modes` quiz registry:

| Concern | Decision |
|---|---|
| New file | `progression.js` — two layers like `handbook.js`: a DOM-free **model layer** (parser, catalogs, stability atlas, scoring, description generation, Node-testable via the `module.exports` guard) and a **DOM layer** (panel UI, runs only when opened). |
| Entry point | Toolbar button (🎼) + keyboard shortcut `L` (handbook owns `H`). Overlay panel, `Esc` closes. |
| Tests | `test_progression.js` at repo root, plain `check()`-style harness like `test_chords.js`. |
| Wiring | `<script src="progression.js">` tag in `index.html`; new styles in `styles.css`; copy into `android/app/src/main/assets/www/` + update the `cp` list in `android/README.md`. |
| Quiz isolation | The lab's inputs must not regenerate quiz questions. Verify how the global `change` listeners (`index.html:1873-1888`) are scoped; if they are delegated broadly, give the panel its own `stopPropagation` (same concern the handbook solves with `hb-quiz-exempt`). Spacebar inside the open panel drives the transport, not `playCurrentSound()`. |
| State | Cookie-based like the rest of the app (`p4lab`), plus URL-hash deep links for sharing (§11). |

Reused as-is: `sound.js` (shared audio context + effects chain), `fretboard.js`
(`renderFretboard` + `.active`/`.root-note`/`.playing` classes, `showSequenceLabels`-style
pill labels), `app.js` `noteUtils` for spelling, `chords.js` `CHORD_FAMILIES` semitone
sets, `sequences.js` `SEQUENCE_CATALOG` interval spellings and `INTERVALS`.

---

## 3. User flow

1. **Open the lab** (🎼 / `L`). Panel shows: progression editor, base-root selector,
   transport controls, chord strip, and a suggestion list.
2. **Type a progression** in degrees: `IIm7 V7 Imaj7` or `Im7 bVIImaj7 bIIImaj7 IVm7`
   or `V7b9/VI ...`. Parsed chords appear as **chips** showing both views: the degree
   token (`bVIImaj7`) and the realized chord (`B♭maj7` once a base root is set).
   Chips with a borrowed/functional provenance show a small annotation ("backdoor",
   "tritone sub", "Neapolitan", "secondary dominant" — §4.4).
3. **Set the base root** (note buttons, default C) and optionally the display accidental
   preference. All chips re-realize instantly.
4. **Pick a chord** (click a chip; during playback the selection follows the transport).
   The suggestion list shows ranked scales/arpeggios for that chord *in progression
   context* (next chord is taken into account; the last chord wraps to the first).
5. **Explore suggestions**: each card shows name + realized root, interval formula,
   fit/resolution/avoid breakdown (§8), and buttons: *play chord + scale*,
   *play scale alone*, *play chord alone*, *show on fretboard*.
6. **Run the transport**: loops the progression at a chosen BPM and bars-per-chord,
   strumming each chord and playing the selected scale up/down over it, with the current
   scale note pulsing on the fretboard.

---

## 4. Progression input — the degree grammar

### 4.1 Research summary (why this design)

Systems surveyed: classical case-coded roman numerals (DCML standard, music21), jazz
all-caps numerals with chord-symbol suffixes (Mehegan), Nashville Number System, Riemann/
Russian function theory (`T-S-D`, `DD`, `НII`), software grammars (music21
`roman.RomanNumeral`, RomanText, Hookpad palette input, iReal Pro), and non-functional
options (root-interval entry, neo-Riemannian transformations). Full source list in §15.

Conclusions that drive the design:

- **Jazz all-caps numerals + explicit quality suffix** beats classical case-coding for
  us: case double-encodes quality and collides with extensions (a lowercase `vii` cannot
  host `maj7`), while the suffix vocabulary (`maj7`, `m7b5`, `7b9`, `o7`, `aug`, …)
  already exists verbatim in `chords.js` `CHORD_FAMILIES` symbols — the parser maps
  tokens onto existing chord-type IDs with zero new quality machinery.
- **Accidentals are always relative to the major scale on the base root** (Nashville
  practice), even for minor/modal progressions. This one rule eliminates the classical
  minor-key `VII` vs `#vii` ambiguity: A minor is simply
  `Im7 bIIImaj7 IVm7 bVII7`, and `bVII7 → Im7` reads as the backdoor cadence exactly as
  a jazz player expects.
- **Modal borrowing needs no syntax**: `bVIImaj7` *is* the pitch content; "borrowed from
  Mixolydian" is display-layer metadata (§4.4). Berklee's chord-scale frame treats
  borrowed chords as transient chords anyway — no canonical interchange matrix exists,
  so we annotate rather than encode.
- **Secondary dominants / applied chords** get the standard `/` syntax (`V7/II`), which
  music21 and DCML both use. Tritone subs need nothing: `bII7` is the degree-arithmetic
  answer (`subV7/II` accepted as sugar).
- **Root-interval and neo-Riemannian entry** are non-idiomatic for the target user (NRT
  is triads-only); deferred to a v2 transposition operator (§14).

### 4.2 Grammar

```ebnf
progression  = { chord | bar | repeat } ;              (* tokens separated by whitespace *)
bar          = "|" ;                                   (* purely visual; ignored *)
repeat       = "." ;                                   (* repeat previous chord *)
chord        = [alt] numeral quality [ "/" chord ] [ "*" number ] ;  (* one nesting level;
                                                            *N = bars this chord lasts *)
alt          = "b" | "#" | "bb" | "##" ;
numeral      = "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" ;  (* case-insensitive input,
                                                            canonicalized to upper *)
quality      = "maj7" | "maj7#5" | "m(maj7)" | "m7b5" | "maj9" | "m7" | "m9" | "m6" | "m11"
             | "dim7" | "dim" | "aug" | "7b13" | "7#11" | "7b9" | "7#9" | "7b5" | "7#5"
             | "13" | "11" | "9" | "maj" | "7" | "6" | "m" | "sus4" | "sus2" | "" ;
number       = positive decimal (fractional allowed — eighth-note resolution; cap 64) ;
```

Token regex (alternation order matters — longest quality first):

```js
/^(?<alt>[b#]{1,2})?(?<rn>III|II|IV|I|VII|VI|V)(?<q>m\(maj7\)|m7b5|maj7#5|maj7|maj9|m7|m9|m6|m11|dim7|dim|aug|7b13|7#11|7b9|7#9|7b5|7#5|13|11|9|7|6|m|maj|sus4|sus2)?(?<sec>\/.+)?$/
```

### 4.3 Semantics (the load-bearing rules)

1. **Root of a plain chord** = `baseRootSemitone + MAJOR_SCALE_OFFSET[numeral] + altSemitones`,
   where `MAJOR_SCALE_OFFSET = {I:0, II:2, III:4, IV:5, V:7, VI:9, VII:11}`. Always the
   major scale, regardless of how minor the progression is.
2. **Quality is always explicit in the suffix**; empty = major triad. Numeral case
   carries no meaning (accepted case-insensitively — `ii7`, `IIm7`, `iim7` all parse;
   display is canonical upper + suffix).
3. **Secondary chords**: the numerator is measured from the *target*. `V7/II` = dominant
   seventh a fifth above the II chord's root. The target itself parses as a degree chord
   of the global reference. Default qualities when omitted: numerator `V` → `7`; target
   numeral → its **diatonic seventh-chord quality in the major scale**
   (`I:maj7, II:m7, III:m7, IV:maj7, V:7, VI:m7, VII:m7b5`). One nesting level allowed
   (`V7/V/V`), music21-compatible.
4. **Unicode/alias folding on input**: `♭→b`, `♯→#`, `°7/o7→dim7`, `ø7→m7b5`,
   `Δ→maj7`, `-→m`, `min→m`, `ø→m7b5`. Optional classical aliases accepted but not
   advertised: `N6`/`bII6`, `It6`, `Ger65`, `Fr43` → fixed pitch sets (music21
   precedent).
5. **`.` repeats the previous chord** (vamps: `Imaj7 . . .`).
6. **`*N` sets the chord's length in bars** (`Imaj7*4`, fractional `*0.5` allowed) —
   shipped from the former v2 duration idea. An unset length falls back to the
   transport's bars-per-chord setting (default 2); `.` copies the length too.

### 4.4 Example tokens (base root C, major reference)

| Token | Realized | Provenance annotation (display only) |
|---|---|---|
| `Imaj7` | Cmaj7 | tonic |
| `IIm7 V7 Imaj7` | Dm7 G7 Cmaj7 | ii–V–I |
| `V7/II` | A7 | secondary dominant (of Dm7) |
| `VIIm7b5/V` | F♯m7b5 | secondary leading-tone half-dim |
| `bVIImaj7` | B♭maj7 | borrowed: Mixolydian/Aeolian ("backdoor" when → I) |
| `IV7` | F7 | borrowed: Mixolydian (blues IV) |
| `IVm7`, `IVm6` | Fm7, Fm6 | borrowed: Aeolian / melodic minor (minor iv) |
| `bII7` | D♭7 | tritone sub (subV7) |
| `#IVm7b5` | F♯m7b5 | passing half-dim |
| `#IVdim7` | F♯dim7 | borrowed: harmonic minor |
| `V7b9` | G7♭9 | altered dominant (→ harmonic minor / altered scale) |
| `Im7 bVIImaj7 bIIImaj7` (root A) | Am7 Gmaj7 Cmaj7 | minor-key flow in major-reference arithmetic |
| `bIIImaj7#5` | E♭maj7♯5 | borrowed: melodic minor |

`FUNCTION_TAGS`: a static lookup (degree offset + quality → label) used for the chip
annotations and the handbook cheat-sheet. It is metadata only — parsing never depends
on it.

### 4.5 Parser behavior

- Tokenizes on whitespace; `|` tokens are dropped after counting bars (future: per-bar
  durations).
- A token that fails the regex is kept as an **error chip** (red, message on hover) and
  skipped in realization — the rest of the progression still works. No modal dialogs.
- Parser output (model layer, pure):
  `{ alt, numeral, qualityId, secondary?: <parsed chord>, }` per token; a separate
  `realize(tokens, baseRootPc)` returns per-chord `{ degreeLabel, rootPc, rootName,
  qualityId, pitchClasses, provenance }`.

### 4.6 Input discovery aids

Two affordances so the grammar never has to be memorized:

1. **Suggestion dropdown (as you type).** While a token is being edited, a dropdown
   under the input lists valid completions for what's typed so far:
   - a numeral fragment (`b`, `IV`, `#`) suggests numerals with accidentals
     (`bVII`, `#IV`, …);
   - a complete numeral suggests numeral + quality pairs ordered by commonness — the
     diatonic seventh of that degree first (`IIm7` before `II7`), then triads and
     extensions from the catalog;
   - after `/`, target numerals are suggested the same way.
   Keyboard: ↑/↓ to move, Enter or Tab to accept, Esc to dismiss; clicks work too.
   Suggestions come from the same static tables the parser uses (numerals × quality
   ids), so the dropdown can never drift from the grammar.
2. **Chip tooltips ("what you could type here").** Hovering (long-press on touch) a
   chord chip shows: the token's anatomy broken down (`bVII` = 7th degree of the
   major scale, lowered a semitone → G in A major; `maj7` = the quality), the
   realized chord and its tones, the provenance note, and **alternate tokens that
   produce the same realized chord** (`bII7` ≡ `subV7/I` sugar; `III7` ≡ `V7/VI`) so
   users learn the notation by inspection.

---

## 5. The stability model — researched data, not runtime math

> **Principle:** stability values live in a hand-curated static atlas inside
> `progression.js`. The runtime only ever *looks up* values and combines them; it never
> derives stability from interval arithmetic.

### 5.1 Two separate concepts, two separate datasets

1. **Rest-stability** — how much a tone *is at rest* inside its sonority, played in
   isolation. Used for the overlap/fit score. Grounded in:
   - Krumhansl–Kessler probe-tone key profiles (empirical listener ratings — the values
     below are these ratings normalized to 0…1) for scale degrees;
   - Lerdahl's tonal pitch-space ordering (octave > fifth > third > remaining diatonic >
     chromatic) and jazz pedagogy's chord-tone vs color-tone doctrine for chord members.
2. **Tendency (resolution)** — how strongly a tone *wants to move*, and where. Used for
   the next-chord score. Grounded in classical voice-leading pedagogy and jazz
   tendency-tone doctrine: leading tone up, chordal 7th down by step, 4th over major
   chords down to the 3rd, avoid notes (scale tone a half step above a chord tone).
   Lerdahl's formalization of melodic attraction (1996/2001) — *attraction of x to y ≈
   stability of y × instability of x × closeness* — is exactly the shape of the
   resolution score in §7.2, so the formula has a theoretical pedigree, not just
   pedagogical folklore.

These are deliberately **not** folded into one number: a tone can be at rest in the
scale yet still be a tendency tone *relative to the next chord* (the 7th of a V7 is
stable inside G7 harmony and simultaneously the strongest resolver into Imaj7).

### 5.2 Chord-tone rest-stability (per quality, by interval from chord root)

Synthesis of three converging lines of evidence — Parncutt's psychoacoustic
root-support weights (P1 = 1 > P5 = 1/2 > M3 = 1/3 > m7 = 1/4; Parncutt 1988),
Lerdahl's pitch-space levels (root > fifth > third > remaining diatonic > chromatic),
and the empirical K–K profiles (relative 5th ≈ .72–.82, 3rd ≈ .52–.85):

| Interval | Stability | Note |
|---|---|---|
| P1 (root) | 1.00 | Parncutt weight 1; Lerdahl level (a) |
| P5 | 0.80 | Parncutt 1/2; Lerdahl level (b); d5/A5 in dim/aug chords: 0.40–0.55 |
| M3 / m3 | 0.70 | Lerdahl level (c); guide tone — quality-defining |
| m7 / M7 / d7 | 0.45 | Parncutt m7 = 1/4; guide tone, but a tendency tone |
| M6/m6, sus P4 | 0.55 | sus2 (M2): 0.35 |
| M9/m9 | 0.35 | Parncutt M2 = 1/5; "available tension" territory |
| A11 (#11) / M13 | 0.35 / 0.30 | P4-an-octave-up 11th: 0.25 — avoid-note-prone |
| b9, #9, b13 | 0.25–0.30 | dominant-altered tensions only; near-avoid elsewhere |

Schema: `CHORD_STABILITY[qualityId][intervalName] = value`, one entry per tone of the
quality (validated in tests against `CHORD_FAMILIES` degree sets).

### 5.3 Scale-degree rest-stability (per scale, by interval from scale root)

**Base data (measured).** Krumhansl–Kessler probe-tone ratings — listeners rated how
well each chromatic tone "fits" an established key; verbatim vectors (cross-checked
against music21's `KrumhanslSchmuckler` implementation):

| pc from tonic | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Major | 6.35 | 2.23 | 3.48 | 2.33 | 4.38 | 4.09 | 2.52 | 5.19 | 2.39 | 3.66 | 2.29 | 2.88 |
| Minor | 6.33 | 2.68 | 3.52 | 5.38 | 2.60 | 3.53 | 2.54 | 4.75 | 3.98 | 2.69 | 3.34 | 3.17 |

**Normalization:** divide by the tonic's rating (major ÷ 6.35, minor ÷ 6.33); those
values are used verbatim for the two measured scales:

- **Ionian**: 1.00 (1) · 0.55 (2) · 0.69 (3) · **0.64 (4)** · 0.82 (5) · 0.58 (6) ·
  0.45 (7) — note the measured profile ranks the 4th *above* the 2nd (4.09 vs 3.48).
- **Aeolian**: 1.00 (1) · 0.56 (2) · **0.85 (♭3)** · 0.56 (4) · 0.75 (5) · 0.53 (♭6) ·
  0.50 (♭7) — in minor the ♭3 is the second most stable tone after the tonic.

**No measured profiles exist for the other modes.** Tan & Temperley (2017) measured
only *familiarity*: ionian/aeolian strongest, dorian/mixolydian intermediate, phrygian
weakest; corpus data (Temperley, Waller & de Clercq 2015) shows ♭2 and ♯4 are the
rarest melodic degrees. Unmeasured modes therefore take the generic interval curve
(root > 5th > 3rd > 4th > 6th > 2nd > 7th) with documented adjustments: damped ♭2
(phrygian) and ♯4 (lydian) at 0.35–0.40 (corpus rarity + upward tendency), damped ♭5
in locrian; harmonic/melodic minor interpolated between the ionian/aeolian anchors
(their raised 7th ≈ 0.55 reflects the K–K minor profile's elevated leading tone,
3.98); symmetric scales near-uniform internally — their distinctiveness comes from
*which* chord tones they contain, not internal hierarchy.

| Scale (root = 1) | Degree stabilities (in scale order) |
|---|---|
| Ionian | 1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45 |
| Dorian | 1.00, 0.55, 0.70, 0.64, 0.82, 0.58, 0.45 |
| Phrygian | 1.00, 0.35, 0.70, 0.64, 0.82, 0.53, 0.45 |
| Lydian | 1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45 |
| Mixolydian | 1.00, 0.55, 0.69, 0.64, 0.82, 0.58, 0.45 |
| Aeolian | 1.00, 0.56, 0.85, 0.56, 0.75, 0.53, 0.50 |
| Locrian | 1.00, 0.35, 0.70, 0.64, 0.40, 0.58, 0.45 |
| Locrian ♮2 (MM mode 6) | 1.00, 0.55, 0.70, 0.64, 0.40, 0.58, 0.45 |
| Dorian ♭2 (MM mode 2) | 1.00, 0.35, 0.70, 0.64, 0.82, 0.58, 0.45 |
| Harmonic minor | 1.00, 0.55, 0.85, 0.56, 0.75, 0.53, 0.55 |
| Melodic minor | 1.00, 0.55, 0.70, 0.60, 0.80, 0.58, 0.50 |
| Altered (super locrian) | 1.00, 0.40, 0.35, 0.45, 0.40, 0.50, 0.50 |
| Lydian dominant | 1.00, 0.55, 0.69, 0.40, 0.82, 0.58, 0.45 |
| Major pentatonic | 1.00, —, 0.69, —, 0.82, 0.58, — |
| Minor pentatonic | 1.00, —, 0.70, 0.64, 0.82, —, 0.45 |
| Blues | minor pentatonic + ♯4 at 0.30, flagged `passing` |
| Bebop dominant | mixolydian + M7 at 0.30, flagged `passing` |
| Whole tone | 1.00, then 0.45–0.55 near-uniform (symmetric) |
| Diminished (H–W / W–H) | 1.00, then 0.45–0.55 near-uniform (symmetric) |

Coverage policy: the ~24 tier-1 scales above get hand-curated entries; remaining
catalog scales fall back to fit-only scoring (no stability map ⇒ resolution term 0)
and are flagged "limited data" in the UI. Curating all 146 catalog entries is data
entry over time, gated by the test in §13.

**Passing-tone flag.** A scale degree may be flagged `passing` (blues #4, bebop scales'
extra tones): it is real in the line but exempt from the avoid-note penalty at 0.25×.
This is how bebop dominant (mixolydian + M7) doesn't get destroyed by its own
chromatic tone.

### 5.4 Optional tendency annotations

Where pedagogy is unambiguous, a degree may carry a fixed tendency, used as a small
*bonus* (not the main mechanism): ionian/melodic-minor M7 `+1` (leading tone up),
ionian P4 `−1` (down to the 3rd), mixolydian m7 `−1` (down to the next chord's 3rd).
The main resolution mechanism stays generic (§7) so it works for any progression.

---

## 6. Catalogs

- **Chord qualities**: `qualityId` maps onto `CHORD_FAMILIES` ids/symbols wherever one
  exists (the 22 families cover nearly all grammar qualities). Qualities missing from
  `chords.js` (e.g. `maj9`, `m11`, `13`) are defined in a `PROG_QUALITIES` extension
  map in `progression.js` (semiTone sets + stability rows). `CHORD_FAMILIES` itself is
  left untouched so the chord quiz and its `CHORD_FORMS` ground-truth tests are
  unaffected.
- **Scales/arpeggios**: referenced from `SEQUENCE_CATALOG` by name/id (interval
  spellings and tiers come free). The stability atlas keys off the same ids.
- **Pitch-class-set canonicalization**: suggestions are ranked per *pc-set*, not per
  catalog name — C ionian over Dm7 and D dorian are the same pitch set, so they dedupe
  into one card titled by the most idiomatic name for that chord root (D dorian).
  Aliasing data: which rotation of which parent scale names a pc-set rooted on the
  chord root.
- **Preset catalog**: `PROG_PRESETS` in two `<optgroup>`s (`PROG_PRESET_GROUPS`):
  *forms* (cadences, blues, rhythm changes…, no `basePc` — the user's root stands) and
  *standards* — 79 jazz standards carrying `basePc`, the key the source list gives
  them, so applying the preset also applies its root. Standards texts were converted
  from the Impro-Visor "Imaginary Book" chart corpus (carey-bunks
  `Jazz-Chord-Progressions-Corpus`) plus swiss-jazz.ch lead sheets and researched
  changes: jam-session versions, one chord per token with `*N` durations from the
  sheet's beats-per-bar, slash bass dropped, first/second endings folded. Options read
  `name · RootName` with the changes in the tooltip.

---

## 7. Ranking algorithm

For each scale candidate `s` over chord `c_i` with successor `c_n = c_(i+1) mod N`:

All stabilities are looked up in the atlas, re-anchored to absolute pitch classes
(offsets from the **base root**, so cross-chord math is plain integer semitones mod 12).
`S_s(pc)`, `S_c(pc)`, `S_n(pc)` are those functions; absent tones = 0.

### 7.1 Fit — weighted overlap of stable tones (current chord)

```
Fit(s, c) = Σ_pc S_s(pc) · S_c(pc)  /  Σ_pc S_c(pc)
```

Every overlapping tone contributes the **product of both stabilities** (both sides
count, per the design brief). Normalizing by the chord's total stability mass makes
Fit = 1 the theoretical ceiling (every chord tone present in the scale with perfect
scale-stability). A scale can contain a chord tone yet score little there if the tone
is an unstable degree of that scale (e.g. the b9 of an altered scale).

### 7.2 Resolution — stable tones leading into the next chord

```
For each scale tone p:
    T(p)  = 1      if p is not a tone of c        (a tension that wants a destination)
            0.2    if p is a chord tone           (may still connect)
    best(p) = max over stable tones t of c_n with |p − t| ≤ 2 semitones:
                 prox(|p−t|) · S_n(t),   where t = p is allowed (prox = 1, common tone)
    prox  = 1.0 for a semitone, 0.55 for a whole step, 0 otherwise
Res(s, c→n) = Σ_p T(p) · best(p)  /  Σ_p T(p)
```

This captures the brief exactly: scale tones that *resolve by step into stable tones of
the next chord* (semitone approach counts more than whole-step; common tones carry
their next-chord stability), weighted by how much each tone needed to move at all.
Single-chord progressions: Res = 0 and the ranking is fit-only (noted in the UI).

### 7.3 Avoid-note penalty

```
Pen(s, c) = Σ over scale tones p ∉ c:
               S_c(t)    if p sits one semitone ABOVE a chord tone t   (avoid note)
               S_c(root) if p sits one semitone BELOW the chord root    (♭9 over root)
               × 0.25    if p is flagged `passing`
normalized: Pen /= Σ_pc S_c(pc)
```

Two classic rules, both from the literature: the **avoid note** — a scale tone a half
step above a chord tone clashes (the 11 over a major chord; Levine p. 23; a tension is
only "available" a *whole* step above a chord tone — Berklee) — and the **minor ninth
over the root** (Persichetti grades the m9 as the sharpest dissonance; arranging
practice forbids it against the root). The second term is load-bearing: it is what
makes G ionian's F♯ unacceptable over G7, not just its clash with the ♭7. Flagged
passing tones pay 0.25×.

### 7.4 Final score, ordering, and families

```
Score = Fit + wR · Res − wP · Pen        defaults wR = 0.6, wP = 0.8
Ties:  fewer notes first  →  catalog tier (commonness)  →  name
```

**Emergent behavior to design around (verified by hand, §7.5):** because Fit is
normalized by chord mass, subset scales (arpeggios, pentatonics) that contain all chord
tones score as high as richer scales while taking fewer risks. That is musically true —
the minor pentatonic *is* a safe shell over m7 — but it would crowd the top of the list
with trivial answers. Therefore suggestions are presented **grouped by family** —
Arpeggios / Pentatonic & hexatonic / Heptatonic & larger — each family ranked by Score,
showing its top 6 cards with a "+N more in this family" **expand toggle** (sticky per
family). A per-chord **"resolution" checkbox** (on by default) drops the Res term from
that chord's ranking when unchecked — fit and avoid notes only. Weights are
user-adjustable ("prefer color / prefer safety" slider reshaping wR, wP). The atlas
names the obvious scales plainly: ionian is displayed as **"major (ionian)"** and
aeolian as **"natural minor (aeolian)"**.

### 7.5 Worked example — `IIm7 V7 Imaj7` in C (hand-computed with the atlas)

Chord masses (root 1.00 + 3rd 0.70 + 5th 0.80 + 7th 0.45): Dm7 = G7 = Cmaj7 = 2.95.

**Over Dm7 (next: G7):**

| Candidate | Fit | Res | Pen | Score | Notes |
|---|---|---|---|---|---|
| D minor pentatonic | 0.80 | 0.84 | 0 | **1.30** | safe shell — wins its family |
| D dorian | 0.80 | 0.70 | 0 | **1.22** | B = common tone with G7's 3rd; E→F, C→B resolvers |
| D aeolian | 0.82 | 0.70 | 0.27 | **1.02** | demoted: B♭ is an avoid note (half-step above the 5th A) despite resolving nicely up to B |

Dorian beats aeolian for exactly the reason a teacher would give — the model's "why"
matches the pedagogy. Note the max-rule at work: F (the chord's ♭7) scores its best
resolution as a whole-step fall to G (0.55 × 1.00), beating holding it as G7's ♭7
(1.0 × 0.45) — attraction favors nearby stability over static commonality.

**Over G7 (next: Cmaj7):**

| Candidate | Fit | Res | Pen | Score |
|---|---|---|---|---|
| G lydian dominant | 0.79 | 0.72 | 0 | **1.23** |
| G mixolydian | 0.79 | 0.72 | 0.24 | **1.04** | C (the 4th) is the classic avoid note over V7 |
| G ionian | 0.72 | 0.74 | 0.73 | **0.59** | no ♭7 (Fit drop) + *three* clashes: C over the 3rd, F♯ over the ♭7, F♯ as ♭9 over the root |

Note the detail: ionian posts the **highest Res** of the three (its F♯ is a textbook
leading tone into G) and still finishes last — the model can like a resolution while
rejecting the tone that makes it. The ♭9-over-root term (§7.3) deepens the gap
(0.86 → 0.59) and matters even more for scales like harmonic minor rooted on the
dominant, whose M7 is exactly that clash.

**Over Cmaj7 (next: Dm7, wrapping):**

| Candidate | Fit | Res | Pen | Score |
|---|---|---|---|---|
| C lydian | 0.79 | 0.77 | 0 | **1.26** |
| C ionian | 0.79 | 0.77 | 0.24 | **1.07** | demoted by the F avoid note (half-step above E) |

All numbers in this section are machine-verified: `test_progression.js` anchors its
scoring regression tests to this table (711 checks).

Lydian over ionian on a major tonic is the standard Berklee recommendation, and the
algorithm arrives at it from the stability data alone — a strong validation that the
atlas + scoring reproduce expert judgment. (Weights are tunable; at defaults lydian and
mixolydian-adjacent results stay close enough that both cards explain themselves.)

---

## 8. Generated descriptions

Every card's text is generated from the same lookups the scores used (no separate
hand-written per-pair prose — impossible at catalog scale):

- **Formula**: degree shorthand from the catalog's interval spellings:
  `D dorian — 1 2 b3 4 5 6 b7`.
- **Overlap**: per chord tone: `D = root · F = b3 · A = 5 · C = b7 — all chord tones
  present`; missing tones called out (`no b7`); low-stability inclusions flagged
  (`contains B♭, unstable as the scale's b6`).
- **Avoid notes**: `B♭ sits a half-step above the 5th (A) — an avoid note over m7;
  pass through it or land elsewhere`.
- **Resolution**: from the Res terms, sorted by contribution:
  `B (6) is the 3rd of G7 — hold it over the barline · C (b7) drops a half-step to B ·
  E (2) falls a whole step to D (5 of G7)`.

---

## 9. Playback and the fretboard

### 9.1 Voicing generation (P4-native)

- Families with a `CHORD_FORMS` entry reuse those movable voicings (place the form's
  root on the nearest fret to position 5).
- Otherwise, generate a voicing from the pitch-class set over the app's current
  `stringTunings` (P4 default): root placed on a low-middle string, then each next
  string takes the chord tone minimizing fret displacement (frets 0–12, skip strings
  that would jump > 4 frets). Tuning-aware for free — works in any tuning the app
  supports.

### 9.2 Transport (new capability — `sound.js` has no scheduler today)

A small `Transport` in the DOM layer: `start/stop`, lookahead scheduling via a
`setTimeout` chain with a cancellation token (consistent with the app's existing
`stopSequencePlayback` approach; Web Audio contexts are already user-gesture-gated).

- **BPM** input (default 120), **bars per chord** (default 2), **loop** toggle,
  optional count-in click.
- Per chord: strum the voicing (`playChord`), re-strum each bar; play the selected
  scale as even eighth notes ascending then descending across the chord's span.
  The card audition buttons ("chord + scale" / "scale" / "chord") run the SAME
  conductor as a one-shot single-chord pass — identical sound, speed and bar count
  as "Play progression" (a `plStartAudition` transport item with `audition: true`;
  no loop, no count-in, no Play-button takeover).
- While running: the active chord chip is highlighted, the current scale note pulses on
  the fretboard (`.playing` class), and the fretboard shows the scale's degree pills
  via the `showSequenceLabels` machinery (root pill styled like the app's existing
  root pills).
- Transport selection follows playback; manual chip click during playback jumps the
  loop to that chord.

---

## 10. UI layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ PROGRESSION LAB                                              [Esc ✕] │
│ [ IIm7  V7  Imaj7        ]  ← editor input (chips render below)     │
│ ( Dm7 )( G7 )( Cmaj7 )   ← chord chips: degree + realized + provenance │
│ Root: C  ♯/♭ pref  ·  BPM 120  ·  2 bars  ·  loop ▣  ·  ▶ / ⏹       │
├──────────────────────────────────────────────────────────────────────┤
│ SELECTED: G7 (V7)  →  next: Cmaj7        [arps|pents|heptatonic]    │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ 1. G mixolydian      1 2 3 4 5 6 b7     Fit ▓▓▓▓▓▓░ Res ▓▓▓▓░░  │  │
│ │    all chord tones present · C(4) avoid note · F(b7)→E half-step │  │
│ │    [chord+scale ▶] [scale] [chord] [on fretboard]               │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ 2. G lydian dominant …                                          │  │
│ └────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│ [ fretboard with current scale/degree pills — reuses main renderer ] │
└──────────────────────────────────────────────────────────────────────┘
```

Panel is an overlay like the handbook's; the main fretboard stays live underneath and
is commandeered by the lab while open (restored on close). Because a centered modal
covers the neck it just marked, the panel has a **peek mode**: the 👁 header button
(and the "on fretboard" card action) shrink it to a corner pill while the lab keeps
running — marks, transport pulse and all; the pill, `L`, or the 🎼 button restore it.

---

## 11. State and sharing

- Cookie `p4lab` (respecting the app's ~4 KB budget): base root, accidental preference,
  BPM, bars, weights, last progression, and a short history list (progression tokens
  are compact; trim oldest beyond budget).
- **URL hash deep links**: `#lab=C@IIm7,V7,Imaj7` — cheap sharing; the hash never hits
  a server, safe on GitHub Pages and in the Android WebView. The panel's 🔗 button
  builds and copies the link (payload URL-encoded so `#` in tokens survives); a
  `#lab=` hash present on load opens the lab seeded with that progression and root,
  overriding the cookie. The deep link is **one-shot**: once applied, the hash is
  stripped from the URL with a same-document `history.replaceState`, so reloading or
  reopening the page does not reopen the lab (the progression itself persists via the
  cookie).

---

## 12. Implementation plan

| Phase | Contents |
|---|---|
| 1 — model | `progression.js` model layer: grammar + parser + alias folding, `realize()`, `PROG_QUALITIES`, stability atlas (+passing flags), pc-set canonicalization, scoring, description generation. `test_progression.js` alongside. **Done — 711 checks green.** |
| 2 — panel | DOM layer: editor + chips + root selector + suggestion cards (static playback via existing `playChord`/`playSequenceNotes`), autocomplete dropdown and chip tooltips (§4.6). Script tag, styles, toolbar button, `L` shortcut, quiz isolation. **Done** — voicing generation reuses the book's `CHORD_FORMS` where the quality has a family, greedy shapes otherwise (both Node-tested); the 🎼 button sits right after the settings button — toolbar buttons carry `topbar-*` ids and the click-outside closer looks them up by id, so bar order carries no coupling. |
| 3 — transport | Loop scheduler, BPM/bars, chord+scale simultaneous playback, fretboard pills + pulse, selection follow. **Done** — a lookahead conductor (25 ms timer, ~180 ms horizon) on the AudioContext clock using ONE shared effects chain with light two-voice notes for both strums and scale line (the `sound.js` audio-thread lesson); BPM/bars/loop apply live, count-in optional; chip clicks jump the running loop; Space toggles the transport when nothing is focused. |
| 4 — polish | Preset progression library (§14), URL sharing, handbook section, Android asset refresh. **Done** — a 12-entry preset dropdown (`PROG_PRESETS`, model-layer data tested for clean parsing at any base root: ii–V–I major/minor, turnaround, backdoor, Andalusian, dorian vamp, 12-bar blues major/minor, rhythm-changes A, Coltrane cycle, tritone-sub, Neapolitan); 🔗 copies a `#lab=` share link (`progEncodeShare`/`progDecodeShare` round-trip tested; clipboard API with a prompt fallback for the WebView) and a `#lab=` hash on load opens the lab seeded with the shared progression, winning over the cookie; handbook gained a 6th section (`lab`) with the degree-notation cheat sheet, the token table from §4.4 and the stability-philosophy summary, plus an "Open the Progression Lab" cross-link button wired by `initProgressionLab`. |
| 5 — standards library | The jazz-standards list from the user's screenshots as a second preset group, each in its own key. **Done** — 79 standards in `PROG_STANDARDS` (group `standards`, `<optgroup>` "Jazz standards", option text `name · Root`, changes in the tooltip), each entry carrying `basePc` so applying the preset also applies its root. Charts sourced from the Impro-Visor Imaginary Book corpus (converted mechanically: bar tokens, `*N` from beats-per-bar, slash bass dropped, compound qualities folded to grammar ones), swiss-jazz.ch lead sheets (Falling Grace, Virgo, Days of Wine and Roses, Footprints, In a Sentimental Mood, Laura, My Funny Valentine, My Favorite Things, Out of Nowhere) and researched changes (Blue in Green, Ceora, Beatrice, Inner Urge, Countdown, Central Park West). Tests: every standard parses cleanly at its own root and realizes in range (5373 checks); the hash smoke asserts the standards optgroup and that a preset applies its root. Skipped: *Ambleside* (Terrasson original — no chart found); *Laurie* entered as *Laura* (the standard the list means, swiss-jazz sheet in C — the list showed B♭; the root buttons transpose in one click). |

---

## 13. Test plan (`test_progression.js`)

- **Parser**: every §4.4 token → expected `{alt, numeral, quality, secondary}`; alias
  folding (`Δ`, `°7`, `ø`, `-`); error tokens don't abort the list; `.` repeat;
  `|` ignored.
- **Realization**: `bVIImaj7` at C → root pc 10, quality maj7; `V7/II` at C → A7
  (pc 9); minor-key flow example; accidental preference affects spelling only, never
  pitch classes.
- **Atlas integrity**: every quality in the grammar has a stability row covering
  exactly its `CHORD_FAMILIES`/`PROG_QUALITIES` degree set; every tier-1 scale has a
  full stability map; values in [0,1]; no runtime derivation paths (spot-check that
  scoring only reads the atlas).
- **Scoring sanity** (regression anchors from §7.5): over IIm7 → dorian > aeolian;
  over V7 → mixolydian & lydian dominant > ionian; over Imaj7 → lydian > ionian;
  arpeggio Fit ≈ family max; pc-set dedupe (C ionian ≡ D dorian over Dm7).
- **Descriptions**: golden-string checks for one card per anchor case.
- **Voicing**: generated voicings contain exactly the chord's pitch classes; fret
  spans within limits; P4 tuning assumption explicit in fixtures.

---

## 14. Improvements and future ideas

1. **Fretboard-first suggestions** (the differentiator): show each candidate scale as
   positions on the P4 neck; long-term, rank by playability in P4 (position shifts).
2. **Voice-leading advisor**: pick the next scale's fingering that minimizes hand
   movement from the previous chord's — a P4-specific superpower (symmetric tuning
   makes shifts predictable).
3. **Resolution-ear playback variant**: play only the tendency→target pairs across the
   barline (C→B, F→E) so the user *hears why* a scale resolves well. Cheap to build
   from the Res breakdown.
4. **Ear-training bridge** (ties into the app's trainer DNA): play chord + one of two
   candidate scales; user identifies which. Scored like the existing quiz modes.
5. **Preset library**: ii–V–I (major/minor), backdoor `bVIImaj7 → Imaj7`, Andalusian
   `Im7 bVImaj7 bVmaj7 IVmaj7`… careful: Andalusian in major-reference arithmetic is
   `Im7 bVImaj7 bVIImaj7 V7`-style; blues (dominant-quality I7 IV7 V7), rhythm changes
   A-section, Coltrane `IIIm7 VI7 IIm7 V7` cycles, modal vamps, Neapolitan examples.
   **Shipped** — the forms group covers exactly these (12 entries), and the standards
   group (§6, phase 5) grew the library to 91 presets, each standard in its own key.
6. **Transposition operator** (v2 grammar): `@+4` or `^m3` prefix meaning "this chord's
   root = previous root + interval" for sequences/planing that have no functional
   explanation — the honest answer to non-functional harmony without neo-Riemannian
   obscurity.
7. **User-tunable atlas**: since stability is "to the human ear", let advanced users
   nudge values (stored in the cookie) — the tool adapts to their ear, and defaults
   stay research-backed.
8. **Progression analysis labels**: detect common fragments (ii–V–I, backdoor, tritone
   sub, circle-of-fifths run) and annotate the chord strip — display candy from the
   same `FUNCTION_TAGS` data.
9. **Duration syntax**: `Imaj7*2` two bars per token — **shipped** (per-chord `*N`,
   fractional allowed; slash-bass via `/` on a note name remains v2).
10. **Export**: MIDI or plain-text chart of progression + chosen scale per chord.

---

## 15. Research bibliography

**Stability / perception (§5):** Krumhansl & Kessler 1982, *Psychological Review*
89(4), doi:10.1037/0033-295X.89.4.334; Krumhansl 1990 ch. 2 (profiles verbatim,
cross-checked against music21 `analysis/discrete.py`); Lerdahl 1988, *Music
Perception* 5(3); Lerdahl 1996 "Calculating Tonal Tension", *MP* 13(3); Lerdahl 2001
*Tonal Pitch Space*; de Haas et al. 2008 (ISMIR) for the basic-space table; Parncutt
1988, *MP* 6(1) (root-support weights; reference implementation
github.com/pmcharrison/parn88); Parncutt 2011, *MP* 28(4); Tan & Temperley 2017, *MP*
34(3) (mode familiarity); Temperley 1999, *MP* 17(1) and Temperley/Waller/de Clercq
2015 (corpus profiles, rock degree frequencies); Albrecht & Shanahan 2013, *MP* 31(1);
Vuvan/Prince/Schmuckler 2011, *MP* 28(5) (natural/harmonic/melodic minor variants);
Huron 2006, *Sweet Anticipation* (profiles as learned statistical frequency).
Pedagogy: Levine, *The Jazz Piano Book* p. 23 (avoid notes); Mulholland & Hojnacki,
*The Berklee Book of Jazz Harmony* and Pease & Pullig, *Modern Jazz Voicings*
(available-tension rule); Persichetti, *Twentieth-Century Harmony* (minor ninth as
sharpest dissonance); Kostka & Payne, *Tonal Harmony* (tendency-tone resolutions);
Nettles & Graf, *The Chord Scale Theory & Jazz Harmony* (Berklee Press).

**Notation (§4):** Wikipedia: Roman numeral analysis; DCML Harmonic Annotation
Guidelines 2.3.0; music21 `roman.py` + `harmonicFunction`; Tymoczko/Gotham/Cuthbert/
Ariza, *The RomanText Format* (ISMIR 2019); Wikipedia: Nashville Number System;
Sweetwater NNS guide; ChordText spec; Hookpad User Guide; iReal Pro forums/Technimo
docs; Impro-Visor repo; jaelliott24.wordpress.com (Mehegan/RN conventions);
JazzGuitar.be (bII7 vs subV); Wikipedia: Borrowed chord; Master the Score / Learn Jazz
Standards / Piano With Jonny (modal interchange); Open Music Theory (neo-Riemannian);
Riemann, *Harmony Simplified* (1896); Russian tradition (Sposobin) via solfamusictheory
and college harmony programs.

---

## 16. Scale plans — multiple scales within one chord (v2.1 design)

Real playing rarely holds one chord-scale for a whole chord: over a static `Imaj7*4`
the line might move ionian → lydian → ionian, over a two-bar V7 mixolydian →
altered for the last half. §16 adds a second level under the progression: a
**scale plan** per chord — an ordered list of **segments** partitioning the chord's
span, each segment a scale (or arpeggio) with a duration in bars. Everything in
§5/§7 applies unchanged at this level too: segments *fit* the chord they sound
over, and consecutive scales *resolve into each other* (or don't) by exactly the
§7.2 mechanism.

### 16.1 The reuse insight

`progScoreCandidate`'s resolution term never inspects `next` as a chord — it only
reads `next.tones[].pc/.stability`, and scale candidates already carry per-tone
stability from the atlas. So a scale→scale transition is the same kernel with a
scale as the target:

```
Res(seg_k → seg_k+1) = §7.2 formula, next := {tones: seg_k+1.cand.tones}
```

`T(p)` (the "needs to move" weight) stays anchored to the **chord** — the harmony
does not change at a segment boundary, only the line's palette does — which is what
the current code already computes. The Res block is extracted into
`progResolution(fromTones, chordTones, target)` and shared by both call sites.

Hand-computed anchors over Cmaj7 (machine-pinned in §16.7):

| Transition | Res | Note |
|---|---|---|
| C ionian → C ionian | 0.664 | self: common tones + B→C leading-tone wrap |
| C ionian → C lydian | 0.664 | equal! F's best destination is E in *both* scales — smoothness here is common-tone driven |
| C ionian → C altered | 0.550 | everything resolves by half-step but only 2 common tones survive |
| G mixolydian → G altered (over G7) | 0.526 | the classic "straighten out then go out" move is legal but a real jump |

That ionian→lydian ties ionian→ionian is exactly why a second metric is needed:
**variety**. `progScaleDistance(a, b)` = stability-weighted symmetric difference
of the pc-sets over total mass (0 identical, 1 disjoint — same class of set math
as the §6 dedupe key, no runtime stability derivation): dist(ionian, lydian) =
0.113, dist(ionian, altered) = 0.623.

### 16.2 Data model

```js
plan = {
    segments: [ { id: 'ionian', bars: 2 }, { id: 'lydian', bars: 1 }, ... ],
    links:    [ true, false, ... ]   // links[i] gates boundary seg_i → seg_(i+1)
}
```

- Durations in bars, fractional (½ minimum — the transport's eighth grid);
  `bars: null` on the **last** segment = absorb the remainder.
- **Ownership:** the chord's total span belongs to the grammar (`Imaj7*4` /
  global bars-per-chord); segments only *partition* it. Realization clamps with
  the last-absorbs rule — a shrinking budget drops tail segments, a growing one
  feeds the last; unknown scale ids drop their segment; an empty/invalid plan
  realizes to `null` (= v2.0 single-pick behavior, `plState.pick` maps to a
  one-segment plan).
- The exit boundary (last segment → next chord) resolves into the next chord's
  **first segment's tones** when that chord has a plan, else the next chord's
  tones — the §7.2 behavior verbatim.

### 16.3 Segment ranking

Ranking a candidate `c` for slot `k` of a realized plan:

```
Score_k(c) = Fit(c, chord) + wF·resIn + wOut·resOut − wP·Pen(c, chord)
resIn  = Res(seg_(k−1) → c)          0 when k = 0 or links[k−1] off
resOut = Res(c → seg_(k+1))          wOut = wF;  0 when links[k] off
       | Res(c → exitTarget)         wOut = wR;  the per-chord "resolution"
                                               checkbox gates this (unchanged)
```

Internal boundaries weigh `wF` (flow, default 0.6); the chord-exit boundary keeps
`wR` — so a one-segment chord scores byte-identically to v2.0 (`progSuggestForChord`),
which the tests pin by array equality. Cards gain a **flow** meter (resIn) next to
fit/res, and their resolution line reads segment→segment ("F (4) resolves a
half-step up to F♯ (♯4 of lydian)") — generated from the same resolver breakdown.

### 16.4 New curated data: `tension` per scale

One hand-curated number per `PROG_SCALES` entry (atlas philosophy: looked up,
never derived): ionian .15 · dorian .25 · phrygian .55 · lydian .35 ·
mixolydian .25 · aeolian .30 · locrian .75 · harmonic minor .60 ·
melodic minor .45 · lydian dominant .45 · phrygian dominant .70 ·
locrian ♮2 .70 · dorian ♭2 .60 · lydian augmented .55 · altered .85 ·
major pentatonic .10 · minor pentatonic .20 · blues .40 · bebop dominant .35 ·
whole tone .70 · diminished .65. It powers auto-plan strategies and the
tension-curve sparkline (§16.6); it never enters Fit/Res/Pen.

### 16.5 Interaction spec (duration + evaluation)

Duration is **boundary dragging on a proportional timeline** — chip widths equal
durations; dragging a boundary (snap ½ bar) transfers bars between neighbors, so
the total never changes. Touch/keyboard fallback: per-chip `▾` menu with ±½-bar
stepper and presets; `[`/`]` nudge. `＋ add segment` splits the largest segment
in half (min ½ bar) and seeds the slot with its top-ranked candidate; `✕` merges
into the right neighbor. Span changes re-partition by the last-absorbs rule.
Tooltips show real time ("2 bars ≈ 4.0 s at 120 BPM").

Evaluation is **per boundary**: a 🔗/⛓ link icon between adjacent segment chips
toggles whether that boundary participates in ranking (tooltip names the pair);
toggling re-ranks both adjacent slots and drops the arrow line from both cards'
descriptions. The chord-exit boundary keeps the existing per-chord `resolution`
checkbox. A global `flow` master toggle + `wF` weight (safety↔color slider,
which also reshapes wR/wP — the still-unshipped §7.4 slider) sit in the controls
row. `✨ auto` respects the links (it scores only enabled boundaries), so manual
toggles and auto plans compose.

| Level | Control | Affects |
|---|---|---|
| Global | `flow` toggle + weight slider | all boundaries' inclusion/weights |
| Per boundary (internal) | 🔗/⛓ between chips | resOut of the left + resIn of the right segment |
| Per boundary (exit) | existing `resolution` checkbox | last segment → next chord |
| Per segment | duration (drag / `▾` / `[`]`) | transport slots, strip width |

### 16.6 Auto-plan strategies

`progAutoPlan(chord, n, strategy, weights, totalBars)` — greedy, deterministic
(full tie-breakers: score → tension → id), even bar split with last-absorbs,
links all on, arpeggios excluded:

- **topN** — the fit ranking as-is (the vanilla default);
- **ladder** — tension strictly rising (build over a vamp);
- **arc** — out and back, ending on the starting scale (ionian → lydian → ionian);
- **contrast** — maximize successive `progScaleDistance` under a fit floor
  (side-slipping).

### 16.7 Test plan additions

- Backward compat: `null` plan and one-segment plans reproduce
  `progSuggestForChord` scores exactly (array equality); §7.5 anchors untouched.
- Kernel anchors: the §16.1 table, both directions; distance anchors; distance
  symmetry; distance 0 for identical sets.
- Plan realization: slot math (startSlot/slots sums to budget), last-absorbs
  under shrink/grow, min-½-bar clamp, unknown-id drop, empty → null.
- Segment ranking: links off zeroes the matching term only; exit checkbox ==
  `noResolve` for one-segment chords; dedupe + ordering stable.
- Auto-plan: determinism per strategy; ladder strictly rising tension; arc
  returns to start; contrast distance ≥ topN distance; respects n > pool → null.

### 16.8 Implementation plan

| Phase | Contents |
|---|---|
| 6 — model | `progResolution` extraction, `tension` fields, `progScaleDistance`, `progRealizePlan`, `progSuggestForSegment`, `progAutoPlan`, segment descriptions, exports, tests (§16.7). **Done** — 5435 checks green (all §16.1 anchors land exactly on the hand-computed values; one-segment plans reproduce the v2.0 ranking byte-identically, array-equality pinned). |
| 7 — UI | plan strip (proportional timeline, boundary drag, link toggles), segment-aware cards + flow meter, `flow`/weight controls, cookie `p`/`fl`/`cw` fields. **Done** — strip chips size by duration (`flex-grow` = slots) with 🔗/⛓ boundary buttons that toggle on tap and resize on drag (½-bar snap, `#pl-planmenu` for steppers/presets/remove, `[`/`]` keyboard nudge); cards gain the `in` (resIn) meter and segment→segment resolution lines; `flow` checkbox + safety↔color slider (0.5 middle == the shipped weights) reshape wR/wF/wP through `plWeights()`; chip badges `×N`; presets/hash resets clear plans. Basic per-segment transport scheduling and neck switching shipped here too (below) — the strip would lie if silent. |
| 8 — transport | what-changes ghost pills (pc-set diff vs the next segment), "sound the link" dyads at internal boundaries. Per-segment scheduling, segment-highlight follow and neck pill switching already shipped with Phase 7. **Done** — `plGhostTones` diffs the pc-sets and `progGhostPositions` marks the appearing tones as dashed `.pl-ghost` pills one window around the current line (toggle *what changes*, cookie `gh`); `progLinkNotes` picks each boundary's strongest *moving* resolver and the transport plays it as a from→to dyad (half-eighth grace) in place of the new segment's first line note, pulsing both cells (toggle *sound link*, cookie `ld`) — over `Imaj7[ionian→lydian]` that is F→E, the 4 falling to 3. **Bugfix that fell out of the ghost tests:** `progScalePositions`' absolute scaffold was `pc + 24 − 5·s` over pitch *classes* — subtracting the fourths changes the pitch class itself, so every string but the highest has marked (and, through the transport, *played*) wrong notes since v2.0; the scaffold is now unwrapped cumulatively from the lowest string, and per-cell "sounds the degree it claims" checks pin it (`(openPc + fret) % 12` convention, 5632 checks green; the old tests only asserted self-consistency inside the broken coordinate space). |
| 9 — polish | tension-curve sparkline across the progression, plan presets (blues ramp, Coltrane alternation), share-link plan encoding, handbook section, Android asset refresh. **Done** — the tension strip under the chord chips renders one bar per segment (width = duration, height/opacity = `progTensionOf`, click jumps, live highlight follows the transport); the plan strip's *✨ all chords* applies a strategy to every chord at once (the blues-ramp / Coltrane-alternation recipes are "ladder/contrast over a form preset"); share links carry plans as compact suffixes (`Imaj7*4[ionian*2;lydian;ionian~01]`, `progEncodeShare`/`progDecodeShare`, junk-tolerant, legacy links unchanged); the handbook gained a *Scale plans* section and the share bullet documents suffixes; Android `www/` refreshed and asset URLs bumped to `?v=2.1`. 5647 checks green. |
