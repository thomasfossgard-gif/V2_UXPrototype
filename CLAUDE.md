# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚑ THIS IS V2 — read first

This repo (`V2_UXPrototype`, folder `C:\CodingPractice\UXPrototypeV2`) is the **active development line**. It began on 2026-05-22 as a byte-for-byte copy of v1 (`APP_VERSION 0.1.2#522`).

- **v1 is frozen** in a separate repo (`C:\CodingPractice\UXPrototype`, tag `v1.0-player-playable`) — a known-good playable build. Do not touch it. All new work happens HERE.
- **Sequencing (agreed):** copy exact → verify ✅ → **modularize ✅** → redesign. Don't modularize and redesign in the same step.
- **Stage 2 — DONE (branch `stage2-modularize`): modularized** the ~24k-line single `index.html`. CSS → `css/styles.css`; the JS was split along the `// ===== SECTION =====` seams into **ordered plain `<script src>` files in `js/`** (NOT ES modules — see [Code layout](#code-layout)). It's a behavior-preserving split: same code, same order, one shared global scope. The dev-server "Save to Code" endpoints were re-pointed from `index.html` to `js/config.data.js`. (Also cleaned out inert duplicated/corrupted trailing junk inherited from the v1 copy.)
- **Stage 3 — design direction (NEXT, not built yet):** drop **chips & slots entirely** (removes Yard Shop chip buying, chip-fan hitboxes, `refreshChipRow`, `chipCount`, slot UI). Workers get job **TYPES/roles** ("carrier", "machinist") instead of parallel slots. Route assignment rethought to key off role, not chips. Explore **direct control** of workers — scaffolding exists (`state !== 'commanded'` already in the tick loop).
- The owner is a senior 3D artist, sole maintainer, **no programming background** — give human explanations and warn before risky actions.

## What This Project Is

A single-page interactive UX prototype for a factory/logistics game — workers pick up scrap, follow routes, deposit into smelters. Built in vanilla JavaScript + Konva.js (2D canvas). There is no build step, no bundler, no framework. As of Stage 2 the app is split across files: **`index.html`** is now a thin shell (HTML markup + ordered `<script>` tags), the JavaScript lives in **`js/*.js`**, and the CSS in **`css/styles.css`**.

## Running the App

```bat
serve.bat
```

Opens a Python dev server on port **8765**. Visit `http://localhost:8765` in a browser.

The server does more than serve files — it intercepts POST requests to patch specific code blocks **in `js/config.data.js`** in-place (no reload needed). Stage 2 gathered every settings block these endpoints edit into that one file, so the regex/marker logic is unchanged — only the target file moved (`DATA` in `dev_server.py`). These endpoints are:

| Endpoint | What it patches (in `js/config.data.js`) |
|---|---|
| `/save-visual-styles` | `VISUAL_STYLES_DEFAULT` block |
| `/save-gameplay-params` | `PATHFIND_PARAMS`, `SMELTER_PARAMS`, `WORKER_TIMINGS` (+ optional `MONEY_PARAMS`) |
| `/save-worker-palette` | `palette.workers` array (also syncs `BUNDLED_LEVEL`) |
| `/save-worker-props` | `palette.workers` + gameplay params in one shot |
| `/save-thirst-params` | `THIRST_PARAMS` block |
| `/save-talking` | `WORKER_STATE_CHATTER`, `CHILL_PHRASES`, chatter chance, bubble duration |
| `/save-bundled-level` | `BUNDLED_LEVEL` block |
| `/save-notes` | Writes `notes.json` (the only endpoint that doesn't touch `js/config.data.js`) |

## Key Constants (all in `js/config.data.js`, loaded first)

| Constant | Purpose |
|---|---|
| `APP_VERSION` | Version string — **bump before every commit** (format: `'MAJOR.MINOR.PATCH#BUILD'`) |
| `VISUAL_STYLES_DEFAULT` | Master defaults for all visual properties (~100+ keys) |
| `VISUAL_STYLES` | Live working copy of the above; all rendering reads from this |
| `PATHFIND_PARAMS` | A* pathfinder tuning |
| `SMELTER_PARAMS` | Processing machine behaviour |
| `WORKER_TIMINGS` | Agent movement and action timing |
| `palette` | Draggable template definitions (workers, decorations, smelters, obstacles) |
| `BUNDLED_LEVEL` | Serialized default level (compact JSON embedded in code) |

## Architecture

### Code layout

After Stage 2 the JS is split into **plain classic `<script src>` files** (NOT ES modules — no `import`/`export`, no `type="module"`). They load **in order** and all share **one global scope**, exactly as when everything was inline: every function and the state arrays are mutually visible, and inline `onclick=` handlers still resolve. **Load order = original source order, and it matters** — `index.html` lists the tags in the required sequence; `js/config.data.js` is loaded first (so its data globals exist before any logic runs) and `js/init-notes.js` is last (it boots the app). The `// ===== SECTION =====` markers are preserved inside the files.

Where the old sections now live (in load order):

| File | Sections |
|---|---|
| `js/config.data.js` | All tunable data the dev server edits: `APP_VERSION`, `SCRAP_TYPES`, `palette`, `VISUAL_STYLES_DEFAULT`/`VISUAL_STYLES`, the `*_PARAMS`, chatter, `BUNDLED_LEVEL` |
| `js/core.js` | STATE, VISUAL STYLES (state arrays), MODE SYSTEM, KONVA STAGE, PAN & ZOOM |
| `js/palette-tools.js` | PALETTE UI, TOOL SELECTION, PALETTE DRAG-AND-DROP |
| `js/scrap-smelter.js` | GROUND SCRAP, SMELTER |
| `js/zones-nodes.js` | ZONE BLOB TOOL, PLACE / DRAW NODES |
| `js/workers-place.js` | PLACE / DRAW WORKERS, LIFT DIM |
| `js/routes.js` | ANCHOR DIRECTIONS, MINI-ANCHOR HELPERS, ROUTE DRAFTING / HOVER / RENDER |
| `js/worker-jobs.js` | WORKER LIFTING & ASSIGNMENT, JOB PANEL HUD, CHIP THROW SYSTEM |
| `js/panels.js` | DELETE / CONFIRM DIALOG, PROPERTY WINDOW, INSPECT PANEL, HINT |
| `js/animation-pathfind.js` | SCRAP ARC ANIMATION, DEBUG OVERLAY, ANIMATION, A* PATHFINDER |
| `js/auto-playback.js` | AUTO MODE, PLAYBACK |
| `js/debug.js` | DEBUG PANEL, DEBUG CONSOLE, WORKER PROPS PANEL |
| `js/save-engine.js` | LEVEL SAVE / LOAD, ENGINE MODE, META-CONTROLS |
| `js/visuals-tab.js` | VISUALS TAB |
| `js/init-notes.js` | INIT, NOTE PANEL CONTROLS, NOTE SYSTEM (**loaded last** — boots the app) |

When adding a new file, insert its `<script>` tag in `index.html` at the right point in the sequence. Stage 3 (chips & slots removal) will mostly touch `js/worker-jobs.js`, `js/routes.js`, `js/workers-place.js`, and the worker data in `js/config.data.js`.

### Scene Graph (Konva layers, bottom to top)

```
gridLayer       background grid (non-interactive)
edgeLayer       route lines
zoneLayer       paint zones
nodeLayer       piles, buildings, obstacles
liftDimLayer    worker-lift overlay
uiLayer         job panels, slot UI
workerLayer     worker sprites
revealLayer     hover reveal effects
hudLayer        pan/zoom-invariant HUD
_dragLayer      lazy — created on first palette drag
```

### Global State Arrays

```js
nodes[]         // Piles, buildings, decorations, smelter I/O nodes
routes[]        // Pathfinding routes between nodes
workers[]       // Mobile agents with inventory & job assignments
groundScrap[]   // Loose items on the map
zones[]         // Circular paint zones for worker assignment
smelters[]      // Processing machines with input/output slots
```

### Mode System

Two independent layers:
- **Game mode** (active tool): `gameInteract`, `drawRoutes`, `deleteMode`, `inspectMode`, `paintZone`, `eraseZone`, `noteMode`, `liftWorker`
- **View mode** (presentation): `ViewDefault`, `ViewGhost`, `ViewHoverReveal`

`setMode()` switches game mode. `pushTransientMode()` / `viewFocusStack` handles temporary view changes (e.g. hover revealing a route) without disturbing the active tool.

### VISUAL_STYLES System

All visual properties live in `VISUAL_STYLES_DEFAULT` and are cloned into `VISUAL_STYLES` at startup. To add or change a visual property:

1. Add the key + default value to the correct type entry in `VISUAL_STYLES_DEFAULT`
2. Register an apply handler in `applyVisualStyles(typeKey)` if it's a new type
3. Add the type to `VS_TYPE_LABELS` and a group in `VS_GROUPS` to expose it in the Visuals panel

The panel auto-generates controls from key types: numbers → number input, booleans → checkbox, `rgba(...)`/`#hex` → colour picker, `fontFamily` → dropdown.

The Visuals tab "Save to Code" button posts to `/save-visual-styles`, which rewrites `VISUAL_STYLES_DEFAULT` in `js/config.data.js` so tweaked values become the new defaults.

### Worker & Job System

Workers have `routeId`, `smelterId` (current), and a `jobs[]` array (in progress — data model refactor deferred until slot UI is finalised). Jobs are visualised as draggable chips in the Job Panel HUD. Priority = insertion order.

### Pile Center Anchor

The circular handle at the centre of each pile is called the **pile center anchor** in code:
- Visual style key: `pileCenterAnchor`
- DOM name: `'center-anchor'`
- Variable: `anchorDot`
- Stored in: `_pileAnchors` map (node.id → Konva.Circle)

## Conventions

- **ID generation:** `uid()` throughout
- **Grid snapping:** `snap(x)`
- **Colour + alpha:** `colorAlpha(hex, alpha)`
- **Batch redraws:** use `batchDraw()` — avoid forcing repaints manually
- **Idle gating:** animation frames are stopped when the world is idle; don't break that gate
- **Section markers:** major code sections are delimited with `// ===== SECTION_NAME =====`

## Files to Know

| File | Purpose |
|---|---|
| `index.html` | Thin shell — HTML markup + ordered `<script>` tags (CDN, `js/config.data.js`, then the logic modules) |
| `css/styles.css` | All app styles (extracted from the old inline `<style>`) |
| `js/config.data.js` | Tunable data/config; the **only** file the dev server's Save endpoints rewrite |
| `js/*.js` | The 14 logic modules — see [Code layout](#code-layout) for the section map |
| `dev_server.py` | Dev HTTP server; static serving + in-place patching of `js/config.data.js` |
| `serve.bat` | Starts the dev server |
| `TODO.md` | Active task list (add entries with `[ ] Task [date time]` format) |
| `saves/` | User-created level saves (JSON download/upload via browser) |
| `icons/` | Worker avatar PNGs and toolbar icons |
