# Design

A light, quiet workspace where the match score is the loudest thing on the page.

## Colours (src/app/globals.css, `:root`)

| Token | Hex | Use |
|---|---|---|
| `--paper` | #ffffff | Page background, inputs, buttons |
| `--mist` / `--mist-2` | #f5f6f9 / #eceef3 | Side panels, table headers, hover, segmented controls |
| `--line` / `--line-strong` | #e3e6ec / #cbd0d9 | Dividers between rows; input and button borders |
| `--ink` / `--ink-2` / `--ink-3` | #1b2130 / #4a5263 / #646c7d | Text: primary, secondary, muted |
| `--jacaranda` (+ `-deep`, `-soft`) | #5a4bd1 | The one accent: primary buttons, active nav, focus, links, selection |
| `--eucalyptus` / `--olive` / `--wattle` / `--slate` / `--pale` | #13803f / #5d8a12 / #b45f06 / #6b7385 / #8a91a0 | Match-score ramp only: 85+, 70+, 50+, 21+, 0–20 |
| `--danger` | #c4321f | Errors, over-limit spend |

Jacaranda is the only decorative colour. Green, olive, amber and grey are reserved for match strength; spend categories use their own five series colours (Today page).

## Type

- **Bricolage Grotesque** (`--display`): page titles, section titles, score numerals, money figures.
- **Figtree** (`--text`): everything else. Body 15px / 1.55, tabular numerals throughout.
- Sentence case everywhere; no all-caps labels, no eyebrows above headings.

## Layout

- Top bar with wordmark, text nav and a spend pill (today's spend and credit left on every page). Phones get a bottom tab bar.
- Jobs are a **ranked list of rows**, not cards: score column, title + facts with icons, reason, meta, actions. The top match on Today is a larger feature row.
- Today and job detail use content + 340px side rail (Mist panels). Profile and Settings use a two-column form: section title and explanation on the left, fields on the right.
- Breakpoints: 1020px (rail drops below; job-detail rail moves above), 720px (phone layout, tab bar).

## Components

Buttons (default bordered, `.btn-primary` jacaranda, `.btn-quiet`, `.btn-sm`, `.icon-btn`), inputs with jacaranda focus ring, `.segmented` filters, `.chip` saved searches, `.badge` statuses, `.panel`, `.feed-row`, `.spend-bar`, `.sheet` (resume preview as a real page), `.doc-tabs`, `.save-bar`.

## Motion

One moment: the score bars fill on load. Everything else only responds to the user. `prefers-reduced-motion` turns animation off.
