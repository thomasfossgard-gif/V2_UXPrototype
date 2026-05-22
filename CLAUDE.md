# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

A single-page interactive UX prototype for a factory/logistics game — workers pick up scrap, follow routes, deposit into smelters. Built in vanilla JavaScript + Konva.js (2D canvas). The entire app lives in one file: **`index.html`** (~10,700 lines). There is no build step, no bundler, no framework.

## Running the App

```bat
serve.bat
```

Opens a Python dev server on port **8765**. Visit `http://localhost:8765` in a browser.

The server does more than serve files — it intercepts POST requests to patch specific code blocks inside `index.html` in-place (no reload needed). These endpoints are:

| Endpoint | What it patches in index.html |
|---|---|
| `/save-visual-styles` | `VISUAL_STYLES_DEFAULT` block |
| `/save-gameplay-params` | `PATHFIND_PARAMS`, `SMELTER_PARAMS`, `WORKER_TIMINGS` |
| `/save-worker-palette` | Worker template definitions |
| `/save-worker-props` | Worker property metadata |
| `/save-notes` | Writes `notes.json` |

## Key Constants (top of index.html)

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

The Visuals tab "Save to Code" button posts to `/save-visual-styles`, which rewrites `VISUAL_STYLES_DEFAULT` in `index.html` so tweaked values become the new defaults.

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
| `index.html` | The entire app |
| `dev_server.py` | Dev HTTP server with in-place patching |
| `serve.bat` | Starts the dev server |
| `TODO.md` | Active task list (add entries with `[ ] Task [date time]` format) |
| `saves/` | User-created level saves (JSON download/upload via browser) |
| `icons/` | Worker avatar PNGs and toolbar icons |
