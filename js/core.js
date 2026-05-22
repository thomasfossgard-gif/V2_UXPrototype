// ===== MODULE: core.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).


// ===== STATE =====

const GRID = 10;


function isIngotType(type) { return type === 'ingot' || (!!type && type.endsWith('_ingot')); }

const defaultAllowedTypes = () => Object.fromEntries(SCRAP_TYPES.map(t => [t.id, true]));







// ===== VISUAL STYLES =====

// Single source of truth for the visual properties of every non-menu object type.

// The Visuals tab in the gameplay panel reads/writes this and pushes updates into

// existing Konva shapes via applyVisualStyles(). Refactored draw* functions read

// from here so newly created shapes pick up edits too.


// Deep clone so the live config can be mutated without losing the canonical defaults.


{ const _it = SCRAP_TYPES.find(t => t.id === 'ingot'); if (_it) _it.color = VISUAL_STYLES.ingot.color; }



function applyUiTheme() {

  const T = VISUAL_STYLES.uiTheme;

  const r = document.documentElement.style;

  r.setProperty('--ui-panel-bg',          T.panelBg);

  r.setProperty('--ui-panel-border',       T.panelBorder);

  r.setProperty('--ui-panel-border-width', T.panelBorderWidth + 'px');

  r.setProperty('--ui-panel-radius',       T.panelCornerRadius + 'px');

  r.setProperty('--ui-shadow',             `${T.shadowOffsetX}px ${T.shadowOffsetY}px ${T.shadowBlur}px ${T.shadowColor}`);

  r.setProperty('--ui-pad-x',             T.paddingX + 'px');

  r.setProperty('--ui-pad-y',             T.paddingY + 'px');

  r.setProperty('--ui-text',              T.textColor);

  r.setProperty('--ui-text-secondary',    T.textSecondaryColor);

  r.setProperty('--ui-btn-bg',            T.btnBg);

  r.setProperty('--ui-btn-border',        T.btnBorder);

  r.setProperty('--ui-btn-border-width',  T.btnBorderWidth + 'px');

  r.setProperty('--ui-btn-radius',        T.btnCornerRadius + 'px');

  r.setProperty('--ui-btn-text',          T.btnTextColor);

  r.setProperty('--ui-btn-active-bg',     T.btnActiveBg);

  r.setProperty('--ui-btn-active-text',   T.btnActiveTextColor);

  r.setProperty('--ui-font-size',         T.fontSize + 'px');

  r.setProperty('--ui-font-family',       T.fontFamily || 'system-ui');

  r.setProperty('--ui-font-weight',       T.fontBold ? '700' : '400');

  if (typeof buildAllJobPanels === 'function') buildAllJobPanels();

}



let nodes = [];       // { id, templateId, x, y, color, items }

let routes = [];      // { id, fromId, toId, workerId }

let workers = [];     // { id, templateId, color, capacity, x, y, routeId, inventory, ... }

const DIRECT_WORKER_SELECT_ENABLED = false;

let selectedWorker = null; // worker under direct player control

let groundScrap = []; // { id, type, x, y, rotation }

let zones = [];        // { id, circles: [{x, y}] }

let smelters = [];     // { id, x, y, inputNodeId, outputNodeId, state, processingType, progress }

var _noteCircleCursor = null; // assigned later after uiLayer exists; var avoids TDZ in applyMode

let _activeZoneId = null;

let _zonePainting = false;

let _hoveredZoneId = null;

let _zoneBrushCursor = null;

let _zoneCursorForbidden = null;

const _zoneAnchors = new Map(); // zone.id  ? Konva.Circle anchor node

const _pileAnchors = new Map(); // node.id  ? Konva.Circle anchor dot

// ===== MODE SYSTEM =====

// Two-layer system:

//   GAME MODES — what the player is doing (set by tools + gestures). Controls cursor,

//                tool highlight, label.

//   VIEW MODES — what is visible (presentation only). Each game mode maps to a default

//                view; a separate viewFocusStack can transiently push a different view

//                without disturbing the game mode (e.g. hovering a pile in gameInteract

//                shows routes by pushing 'ViewGhost' on the stack).

// View mode = single record per view: display label + per-type visibility state.

// State values: 'hidden' | 'visible' | 'highlighted'. ('highlighted' renders the

// same as 'visible' for now — placeholder until per-type highlighting lands.)

const VIEW_MODES = {

  ViewDefault:     { display: 'View Default',  visible: {} },

  ViewGhost:       { display: 'View Ghost',    visible: {} },

  ViewHoverReveal: { display: 'Hover Reveal',  visible: {}, readonly: true },

};

const VIS_STATES = ['visible', 'hidden', 'highlighted', 'inherit']; // 'inherit' only valid in contextual modes

const COG_CURSOR  = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text y="20" font-size="20">?</text></svg>')}") 12 12, auto`;

let noteCursorSize = 24;

let _noteIconBase64 = '';

function colorAlpha(hex, alpha) {

  if (!hex || hex[0] !== '#') return `rgba(255,255,255,${alpha})`;

  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r},${g},${b},${alpha})`;

}

function buildNoteCursor(size) {

  const s = Math.round(size);

  const half = Math.floor(s / 2);

  const href = _noteIconBase64 || 'icons/icon_deleteroute.png';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><image href="${href}" width="${s}" height="${s}"/></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${half} ${half}, crosshair`;

}

function setNoteCursorSize(size) {

  noteCursorSize = size;

  MODES.noteMode.cursor = buildNoteCursor(size);

  if (currentMode === 'noteMode') containerEl.style.cursor = MODES.noteMode.cursor;

}

const ICON_NOTE = new Image();

ICON_NOTE.onload = () => {

  const c = document.createElement('canvas');

  c.width = ICON_NOTE.naturalWidth; c.height = ICON_NOTE.naturalHeight;

  c.getContext('2d').drawImage(ICON_NOTE, 0, 0);

  _noteIconBase64 = c.toDataURL();

  setNoteCursorSize(noteCursorSize);

};

ICON_NOTE.src = 'icons/icon_deleteroute.png';

const MODES = {

  gameInteract: { display: 'Game Interact', tool: 'select',     cursor: 'default',     view: 'ViewDefault' },

  drawRoutes:   { display: 'Draw Routes',   tool: 'line',       cursor: 'crosshair',   view: 'ViewGhost' },

  deleteMode:   { display: 'Delete',        tool: 'delete',     cursor: 'not-allowed', view: 'ViewDefault' },

  liftWorker:   { display: 'Lift Worker',   tool: null,         cursor: 'grabbing',    view: 'ViewGhost' },

  inspectMode:  { display: 'Inspect',       tool: 'inspect',    cursor: COG_CURSOR,    view: 'ViewDefault' },

  paintZone:    { display: 'Paint Zone',     tool: 'paintZone',  cursor: 'none',        view: 'ViewDefault' },

  eraseZone:    { display: 'Erase Zone',     tool: 'eraseZone',  cursor: 'none',        view: 'ViewDefault' },

  noteMode:     { display: 'Note',           tool: 'note',       cursor: 'none',                         view: 'ViewDefault' },

};

const TOOL_TO_MODE = { select: 'gameInteract', line: 'drawRoutes', delete: 'deleteMode', inspect: 'inspectMode', paintZone: 'paintZone', eraseZone: 'eraseZone', note: 'noteMode' };

let currentMode = 'gameInteract';

let prevMode = null; // saved game mode while a transient game mode (liftWorker) is active

const viewFocusStack = []; // ordered list of pushed view-mode names; topmost wins

function pushViewFocus(view) { viewFocusStack.push(view); dlog('view', 'push ' + view + ' (depth=' + viewFocusStack.length + ')'); applyDebugVisibility(); }

function popViewFocus()       { const v = viewFocusStack.pop(); dlog('view', 'pop  ' + v + ' (depth=' + viewFocusStack.length + ')'); applyDebugVisibility(); }



// "Held" route view — set after a route is created so it stays visible until the

// user clicks something else (e.g. empty canvas, a worker, a tool). Clicking another

// pile or starting a new route doesn't release it.

let routeViewHeld = false;

let recentlyCreatedRouteId = null;

let _filterPanel = null;

let _filterGhost = null;

let _anchorDragState = null;

let _hitboxDebugLayer = null;

const _hitboxPinnedTypes = new Set();

const HITBOX_TYPE_TO_NAMES = {

  hitboxPile:       ['hitbox-pile'],

  hitboxAnchor:     ['anchor-hit'],

  hitboxRouteHover: ['hover-hit-route'],

  hitboxWorker:     ['hitbox-worker'],

  hitboxTri:        ['hitbox-chip'],

  hitboxSlot:       ['hitbox-slot'],

  hitboxSlotHover:  ['hover-hit-slot'],

  hitboxSlotIcons:  ['slot-delhit', 'slot-gearhit'],

  hitboxMiniAnchor: ['mini-anchor'],

};

function holdRouteView(routeId) {

  if (routeViewHeld) return;

  routeViewHeld = true;

  recentlyCreatedRouteId = routeId || null;

  if (recentlyCreatedRouteId) {

    const r = routes.find(x => x.id === recentlyCreatedRouteId);

    if (r) { if (!r.states) r.states = {}; r.states.recentlyCreated = true; }

  }

  pushViewFocus('ViewGhost');

}

function releaseHeldRouteView() {

  if (!routeViewHeld) return;

  routeViewHeld = false;

  if (recentlyCreatedRouteId) {

    const r = routes.find(x => x.id === recentlyCreatedRouteId);

    if (r && r.states) r.states.recentlyCreated = false;

    recentlyCreatedRouteId = null;

  }

  popViewFocus();

}

const ROUTE_UI_NAMES = new Set([

  'node', 'hitbox-pile', 'anchor-hit', 'hover-hit-route',

  'hitbox-chip', 'hitbox-slot', 'hover-hit-slot', 'mini-anchor',

]);

function isPointerOverRouteUI() {

  const pos = stage.getPointerPosition();

  if (!pos) return false;

  let n = stage.getIntersection(pos);

  while (n && n !== stage) {

    if (typeof n.name === 'function' && ROUTE_UI_NAMES.has(n.name())) return true;

    n = n.getParent ? n.getParent() : null;

  }

  return false;

}

function getEffectiveView() {

  if (viewFocusStack.length) return viewFocusStack[viewFocusStack.length - 1];

  return MODES[currentMode].view;

}



function setMode(name) {

  if (!MODES[name]) return;

  dlog('mode', 'set ' + currentMode + ' ? ' + name);

  currentMode = name;

  applyMode();

}

function pushTransientMode(name) {

  if (currentMode === name) return;

  prevMode = currentMode;

  currentMode = name;

  applyMode();

  if (name === 'liftWorker') refreshAllSlotPortraits();

}

function popTransientMode() {

  if (prevMode) { currentMode = prevMode; prevMode = null; applyMode(); if (currentMode !== 'liftWorker') refreshAllSlotPortraits(); }

}



// Reference-counted pile focus: any number of things (hovering a pile in the level,

// hovering a pile in the palette, dragging a pile out of the palette) can request

// the Route View visual mode. View-only — does NOT change the game mode.

let pileFocusDepth = 0;

let _hoveredNodeId = null;

let _anchorHovered = false;

function enterPileFocus() {

  pileFocusDepth++;

  dlog('hover', 'enter pile (depth=' + pileFocusDepth + ')');

  if (pileFocusDepth === 1) pushViewFocus('ViewGhost');

}

function leavePileFocus() {

  if (pileFocusDepth === 0) return;

  pileFocusDepth--;

  dlog('hover', 'leave pile (depth=' + pileFocusDepth + ')');

  if (pileFocusDepth === 0) {

    popViewFocus();

    if (!lineDraft) {

      _pileAnchors.forEach((dot, nodeId) => { if (nodeId !== _hoveredNodeId) anchorShrinkOut(dot); });

      zones.forEach(z => { if (z.id !== _hoveredZoneId) hideZoneAnchor(z); });

    }

  }

}



// Central place for all mode-driven visual changes.

// As more contextual UX is added, extend the per-mode branches below

// (e.g. dim workers when drawing routes, glow piles in addItems, etc.).

function applyMode() {

  const m = MODES[currentMode];

  // mode label

  const lbl = document.getElementById('mode-label');

  if (lbl) lbl.textContent = 'Mode: ' + m.display;

  // cursor

  containerEl.style.cursor = m.cursor;

  // tool button highlighting

  document.querySelectorAll('.tool-btn').forEach(btn => {

    btn.classList.toggle('active', btn.dataset.tool === m.tool);

  });

  // bottom-bar mutual exclusivity: close Build palette when a game tool activates

  if (['select', 'delete', 'paintZone', 'eraseZone'].includes(m.tool)) {

    document.getElementById('palette-toggle-btn')?.classList.remove('active');

    const _pp = document.getElementById('eng-panel-objects');

    if (_pp) _pp.style.display = 'none';

  }

  // cancel any in-progress line draft when leaving drawRoutes

  if (currentMode !== 'drawRoutes') cancelLineDraft();

  // sync inspect button active state; close panel when leaving inspect mode

  const inspectBtn = document.getElementById('btn-inspect-tool');

  if (inspectBtn) inspectBtn.classList.toggle('active', currentMode === 'inspectMode');

  if (currentMode !== 'inspectMode') closeInspectPanel();

  // sync note panel tool button; note mode bar button stays active while panel is open

  const noteToolBtn = document.getElementById('note-tool-btn');

  if (noteToolBtn) noteToolBtn.classList.toggle('active', currentMode === 'noteMode');

  // show/hide Konva circle cursor

  if (_noteCircleCursor) {

    _noteCircleCursor.visible(currentMode === 'noteMode');

    uiLayer.batchDraw();

  }



  // --- contextual visibility hooks ---

  // Pile highlight: thicker stroke when targetable for the current mode.

  nodeLayer.find('.nodeshape').forEach(s => {

    const active = currentMode === 'drawRoutes' || currentMode === 'deleteMode';

    s.strokeWidth(active ? 3 : 1.5);

    if (currentMode === 'deleteMode') {

      if (!s._baseStroke) s._baseStroke = s.stroke();

      s.stroke('#ff3b3b');

    } else if (s._baseStroke) {

      s.stroke(s._baseStroke); s._baseStroke = null;

    }

  });

  nodeLayer.batchDraw();

  // Worker dim: dim assigned workers in drawRoutes (focus on routes); highlight all in liftWorker.

  workerLayer.find('.worker').forEach(g => {

    if (currentMode === 'drawRoutes') g.opacity(0.4);

    else g.opacity(1);

  });

  workerLayer.batchDraw();

  applyDebugVisibility(); // also calls refreshAllSlotPortraits

  // Zone brush cursor visibility + state reset

  if (_zoneBrushCursor) {

    const inZone = currentMode === 'paintZone' || currentMode === 'eraseZone';

    _zoneBrushCursor.visible(inZone);

    if (_zoneCursorForbidden) _zoneCursorForbidden.visible(false);

    uiLayer.batchDraw();

  }

  if (currentMode !== 'paintZone') { _activeZoneId = null; _zonePainting = false; }

  if (currentMode !== 'eraseZone') _zonePainting = false;

}

let nextId = 1;

const uid = () => 'i' + (nextId++);

const snap = v => Math.round(v / GRID) * GRID;



// ===== KONVA STAGE =====

const containerEl = document.getElementById('canvas-container');

const stage = new Konva.Stage({

  container: 'canvas',

  width: containerEl.clientWidth,

  height: containerEl.clientHeight,

});

const gridLayer = new Konva.Layer({ listening: false });

const edgeLayer = new Konva.Layer();

const zoneLayer = new Konva.Layer({ listening: true });

const nodeLayer = new Konva.Layer();

const workerLayer = new Konva.Layer();

// Lift dim — sits above all physical content, below UI (slots, ragdoll, mirror tri)

const liftDimLayer = new Konva.Layer({ listening: false });

const liftDimRect  = new Konva.Rect({

  x: -50000, y: -50000, width: 100000, height: 100000,

  fill: VISUAL_STYLES.liftDim.color, opacity: 0, listening: false, name: 'lift-dim-rect',

});

liftDimLayer.add(liftDimRect);

const routeDraftLayer = new Konva.Layer({ listening: false });

const uiLayer = new Konva.Layer();

const revealLayer = new Konva.Layer({ listening: false });

stage.add(gridLayer, edgeLayer, zoneLayer, nodeLayer, liftDimLayer, routeDraftLayer, uiLayer, workerLayer, revealLayer);

const hudLayer = new Konva.Layer({ listening: false });

stage.add(hudLayer);

// dragLayer is added lazily on first chip drag so it sits above all other layers (including noteLayer)

let _dragLayer = null;

function _ensureDragLayer() {

  if (!_dragLayer) { _dragLayer = new Konva.Layer({ listening: false }); stage.add(_dragLayer); }

  return _dragLayer;

}

function updateHudTransform() {

  const s = stage.scaleX();

  hudLayer.scale({ x: 1/s, y: 1/s });

  hudLayer.position({ x: -stage.x()/s, y: -stage.y()/s });

  hudLayer.batchDraw();

}

updateHudTransform();

const versionEl = document.getElementById('version-label');

versionEl.textContent = 'v' + APP_VERSION;

fetch('/git-branch')

  .then(r => r.json())

  .then(d => { if (d.branch) versionEl.textContent = '[' + d.branch + ' | ' + (d.folder || '?') + '] v' + APP_VERSION; })

  .catch(() => {});



const reloadBtn = document.getElementById('meta-reload-btn');

reloadBtn.addEventListener('click', () => location.reload());

function flagUpdateAvailable() {

  reloadBtn.classList.add('has-update');

  reloadBtn.title = 'Update available — click to reload';

}



// On deployed Pages: compare APP_VERSION string from fetched HTML.

async function checkLatestVersion() {

  try {

    const res = await fetch(location.href + '?_v=' + Date.now());

    const text = await res.text();

    const match = text.match(/APP_VERSION\s*=\s*'([^']+)'/);

    if (!match) return;

    const latest = match[1];

    if (latest !== APP_VERSION) {

      versionEl.textContent = 'v' + APP_VERSION + ' — v' + latest + ' available';

      versionEl.style.color = 'rgba(255,200,80,0.7)';

      flagUpdateAvailable();

    }

  } catch (_) {}

}



// On local server: poll HEAD for ETag/Last-Modified changes (no full download).

let initialFileStamp = null;

async function checkFileChanged() {

  try {

    const url = location.origin + location.pathname + '?_v=' + Date.now();

    const res = await fetch(url, { method: 'HEAD' });

    const stamp = res.headers.get('etag') || res.headers.get('last-modified');

    if (!stamp) return;

    if (initialFileStamp === null) { initialFileStamp = stamp; return; }

    if (stamp !== initialFileStamp) flagUpdateAvailable();

  } catch (_) {}

}



if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') { checkLatestVersion(); setInterval(checkLatestVersion, 60_000); checkFileChanged(); setInterval(checkFileChanged, 3_000); }



// Konva's getPointerPosition returns SCREEN-relative coords (within the stage container),

// not world coords. With pan/zoom on, anything that compares against world-space data

// (node positions, slot positions, snap-to-grid, ghost placement) must use this helper.

function getWorldPointer() {

  const p = stage.getPointerPosition();

  if (!p) return null;

  const scale = stage.scaleX() || 1;

  return { x: (p.x - stage.x()) / scale, y: (p.y - stage.y()) / scale };

}



window.addEventListener('resize', () => {

  stage.width(containerEl.clientWidth);

  stage.height(containerEl.clientHeight);

  drawGrid();

  rebuildYardShopPanel();

  rebuildAutoPanel();

  buildAllJobPanels();

});



gridLayer.add(new Konva.Shape({

  listening: false,

  sceneFunc(ctx) {

    const scale = stage.scaleX() || 1;

    const sx = stage.x(), sy = stage.y();

    const x0 = -sx / scale, y0 = -sy / scale;

    const x1 = (stage.width() - sx) / scale;

    const y1 = (stage.height() - sy) / scale;

    const gx0 = Math.floor(x0 / GRID) * GRID;

    const gy0 = Math.floor(y0 / GRID) * GRID;

    const gx1 = Math.ceil(x1 / GRID) * GRID;

    const gy1 = Math.ceil(y1 / GRID) * GRID;

    const raw = ctx._context;

    raw.beginPath();

    raw.strokeStyle = 'rgba(255,255,255,0.08)';

    raw.lineWidth = 1 / scale;

    for (let x = gx0; x <= gx1; x += GRID) { raw.moveTo(x, gy0); raw.lineTo(x, gy1); }

    for (let y = gy0; y <= gy1; y += GRID) { raw.moveTo(gx0, y); raw.lineTo(gx1, y); }

    raw.stroke();

  },

}));

function drawGrid() { gridLayer.batchDraw(); }

drawGrid();



// ===== PAN & ZOOM =====

const ZOOM_FACTOR = 1.1;

const ZOOM_MIN = 1.5;

const ZOOM_MAX = 3;

stage.on('wheel', e => {

  e.evt.preventDefault();

  const oldScale = stage.scaleX();

  const pointer = stage.getPointerPosition();

  if (!pointer) return;

  const worldPoint = {

    x: (pointer.x - stage.x()) / oldScale,

    y: (pointer.y - stage.y()) / oldScale,

  };

  let newScale = e.evt.deltaY < 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR;

  newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));

  stage.scale({ x: newScale, y: newScale });

  stage.position({

    x: pointer.x - worldPoint.x * newScale,

    y: pointer.y - worldPoint.y * newScale,

  });

  drawGrid();

  stage.batchDraw();

  updateHudTransform();

  if (notesVisible) renderNotePins();

});



// Pan only when LMB-down on empty canvas (not on a shape).

let panStart = null;

stage.container().addEventListener('contextmenu', e => { e.preventDefault(); if (!engineVisible) setMode('gameInteract'); });

stage.on('mousedown', e => {

  if (e.evt.button !== 0) return;

  if (e.target !== stage) return; // ignore if a shape was hit

  if (currentMode === 'paintZone' || currentMode === 'eraseZone') return;

  panStart = {

    cx: e.evt.clientX, cy: e.evt.clientY,

    sx: stage.x(),     sy: stage.y(),

  };

  containerEl.style.cursor = 'grabbing';

});

window.addEventListener('mousemove', e => {

  if (!panStart) return;

  stage.x(panStart.sx + (e.clientX - panStart.cx));

  stage.y(panStart.sy + (e.clientY - panStart.cy));

  drawGrid();

  stage.batchDraw();

  updateHudTransform();

});

window.addEventListener('mouseup', () => {

  cancelLineDraft();

  if (!panStart) return;

  panStart = null;

  containerEl.style.cursor = MODES[currentMode].cursor;

});





// suppress browser context menu over canvas (allow direct-control deselect to fire first)

containerEl.addEventListener('contextmenu', e => e.preventDefault());



// Direct worker control — world click sends selected worker to point

stage.on('mousedown.directControl', e => {

  if (!selectedWorker) return;

  if (e.evt.button !== 0) return;

  if (currentMode !== 'gameInteract') return;

  const tgtLayer = e.target?.getLayer?.();

  if (tgtLayer === uiLayer || tgtLayer === workerLayer || tgtLayer === hudLayer) return;

  const p = getWorldPointer(); if (!p) return;

  const path = findPathAStar(selectedWorker.x, selectedWorker.y, p.x, p.y, []);

  if (path) { selectedWorker.path = path; selectedWorker.pathIdx = 0; wakeAnimation(); }

});



// Right-click anywhere deselects

stage.on('contextmenu.directControl', e => {

  if (selectedWorker) { e.evt.preventDefault(); deselectWorker(); }

});

// Engine-mode right-click: open inspect panel for whatever is under the cursor
stage.on('contextmenu.engineInspect', e => {
  if (!engineVisible) return;
  e.evt.preventDefault();

  if (_proximityHoveredWorker) {
    openInspectPanel('worker', _proximityHoveredWorker, e.evt.clientX, e.evt.clientY);
    return;
  }

  let target = e.target;
  while (target && target !== stage) {
    const n = typeof target.name === 'function' ? target.name() : null;
    const id = typeof target.id === 'function' ? target.id() : null;
    if (n === 'node') {
      const node = nodes.find(x => x.id === id);
      if (node) { openInspectPanel('pile', node, e.evt.clientX, e.evt.clientY); return; }
    }
    if (n === 'smelter-body') {
      const sm = smelters.find(x => x.id === id);
      if (sm) { openInspectPanel('smelter', sm, e.evt.clientX, e.evt.clientY); return; }
    }
    if (n === 'route') {
      const route = routes.find(x => x.id === id);
      if (route) { openInspectPanel('route', route, e.evt.clientX, e.evt.clientY); return; }
    }
    target = target.getParent?.();
  }
});

// Reset all hover depths when mouse exits the canvas — prevents stuck ViewGhost state.

containerEl.addEventListener('mouseleave', () => {

  while (pileFocusDepth > 0) leavePileFocus();

  while (workerHoverDepth > 0) exitWorkerHover();

});

// Konva misses mouseleave on fast drags — detect via mousemove that cursor is off all pile groups.

stage.on('mousemove.pileLeaveGuard', () => {

  if (!_hoveredNodeId && !_anchorHovered) return;

  const pos = stage.getPointerPosition();

  if (!pos) return;

  let n = stage.getIntersection(pos);

  let overPile = false;

  while (n && n !== stage) {

    if (typeof n.name === 'function' && n.name() === 'node') { overPile = true; break; }

    n = n.getParent ? n.getParent() : null;

  }

  if (!overPile) {

    if (_hoveredNodeId) {

      anchorShrinkOut(_pileAnchors.get(_hoveredNodeId));

      _hoveredNodeId = null;

      if (pileFocusDepth > 0) leavePileFocus();

    }

    if (_anchorHovered) {

      _anchorHovered = false;

      if (pileFocusDepth > 0) leavePileFocus();

    }

  }

});



// Worker proximity hover — nearest worker center wins regardless of z-order or hitbox overlap.

let _proximityHoveredWorker = null;

stage.on('mousemove.workerProximity', () => {

  const mp = getWorldPointer();

  if (!mp) return;

  const radius = VISUAL_STYLES.hitboxWorker.hoverRadius;

  let closest = null, closestDist = Infinity;

  workers.forEach(w => {

    if (!w._onProximityEnter) return;

    const fanY = w.y + (w._fanCenterOffset ?? 0);

    const d = Math.hypot(mp.x - w.x, mp.y - fanY);

    if (d < radius && d < closestDist) { closest = w; closestDist = d; }

  });

  if (closest === _proximityHoveredWorker) return;

  if (_proximityHoveredWorker) _proximityHoveredWorker._onProximityLeave?.();

  _proximityHoveredWorker = closest;

  if (closest) closest._onProximityEnter?.();

});

containerEl.addEventListener('mouseleave', () => {

  if (_proximityHoveredWorker) { _proximityHoveredWorker._onProximityLeave?.(); _proximityHoveredWorker = null; }

});



// Release the held route view when the user clicks something that isn't a pile.

// Uses a native DOM listener so Konva's cancelBubble on route/slot handlers

// cannot silently swallow the click before it reaches us.

containerEl.addEventListener('mousedown', e => {

  const rect = containerEl.getBoundingClientRect();

  const stageCoords = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  const _hit = stage.getIntersection(stageCoords);

  if (_filterPanel) {
    let _onPanel = false, _c = _hit;
    const _fpSlotGrp = uiLayer.findOne('#slot_' + _filterPanel.route.id);
    while (_c && _c !== stage) { if (_c === _filterPanel.group || _c === _fpSlotGrp) { _onPanel = true; break; } _c = _c.getParent?.(); }
    if (!_onPanel) closeRouteFilter(false);
  }

  let n = _hit;

  const _activeRouteIds = new Set(routes.filter(r => r._hoverViewActive).flatMap(r => [r.id, 'slot_' + r.id]));

  while (n && n !== stage) {

    if (typeof n.name === 'function' && n.name() === 'node') return;

    const _nid = typeof n.id === 'function' ? n.id() : null;
    if (_nid && _activeRouteIds.has(_nid)) return;

    n = n.getParent ? n.getParent() : null;

  }

  releaseHeldRouteView();

  while (pileFocusDepth > 0) leavePileFocus();

  while (workerHoverDepth > 0) exitWorkerHover();

  routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });

  if (viewFocusStack.length > 0) { viewFocusStack.length = 0; applyDebugVisibility(); }

});

document.addEventListener('mousedown', e => {

  if (containerEl.contains(e.target)) return;

  releaseHeldRouteView();

  while (pileFocusDepth > 0) leavePileFocus();

}, true);



