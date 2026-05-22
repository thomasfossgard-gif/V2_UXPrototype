// ===== MODULE: debug.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== DEBUG PANEL =====

// Physical objects (workers, piles, scrap) are always visible — never toggled by view mode.

// Only informational/virtual overlays belong in VISUAL_TYPES.

let _routeSlotsVisible = false; // set synchronously by routeSlots.apply; used by refresh functions to gate icon/grid visibility independent of fade animation timing
let _hoverRevealActive = false; // true while ViewHoverReveal is active; bypasses _routeSlotsVisible gate so slot portraits stay live

const VISUAL_TYPES = [

  {

    key: 'workerLabels', label: 'Worker Labels', layer: 'virtual',

    getInstances: () => workers.map(w => {

      const tpl = palette.workers.find(t => t.id === w.templateId);

      const n = tpl?.name ?? '';

      return { id: w.id + '_lbl', label: (n ? n[0].toUpperCase() + n.slice(1) : w.id) + ' label' };

    }),

    apply: vis => { workerLayer.find('.workerlabel').forEach(el => el.visible(vis)); workerLayer.batchDraw(); }

  },

  {

    key: 'routes', label: 'Routes', layer: 'virtual',

    getInstances: () => routes.map(r => ({ id: r.id, label: r.fromId + ' ? ' + r.toId })),

    apply: (vis, inMs = 0, outMs = 0) => {

      const ms = vis ? inMs : outMs;

      edgeLayer.find('.routepath').forEach(el => {

        if (ms > 0) {

          if (vis) {

            if (!el.visible()) { el.opacity(0); el.visible(true); }

            fadeNode(el, 1, ms);

          } else {

            if (el.visible()) fadeNode(el, 0, ms, () => { el.visible(false); edgeLayer.batchDraw(); });

          }

        } else {

          if (el._fadeTween) { el._fadeTween.destroy(); el._fadeTween = null; }

          el.opacity(1); el.visible(vis);

        }

      });

      edgeLayer.batchDraw();

    }

  },

  {

    key: 'routeSlots', label: 'Route Slots', layer: 'virtual',

    getInstances: () => routes.map(r => ({ id: r.id + '_slot', label: 'Slot for ' + r.id })),

    apply: (vis, inMs = 0, outMs = 0) => {

      const effectiveVis = vis && !lineDraft;

      _routeSlotsVisible = effectiveVis; // set before any animation so refresh functions see correct intent

      const ms = effectiveVis ? inMs : outMs;

      uiLayer.find('.route-slot').forEach(s => {

        const rect = s.findOne('.slot-rect');

        const fadeRect = (target) => {

          if (!rect) return;

          if (ms > 0) {

            if (target) {

              if (!rect.visible()) { rect.opacity(0); rect.visible(true); }

              fadeNode(rect, 1, ms);

            } else {

              if (rect.visible()) fadeNode(rect, 0, ms, () => { rect.visible(false); uiLayer.batchDraw(); });

            }

          } else {

            if (rect._fadeTween) { rect._fadeTween.destroy(); rect._fadeTween = null; }

            rect.opacity(1); rect.visible(target);

          }

        };

        fadeRect(effectiveVis);

        const chipGrid = s.findOne('.slot-chip-grid');

        if (chipGrid) {

          if (ms > 0) {

            if (effectiveVis) {

              if (!chipGrid.visible()) { chipGrid.opacity(0); chipGrid.visible(true); }

              fadeNode(chipGrid, 1, ms);

            } else {

              if (chipGrid.visible()) fadeNode(chipGrid, 0, ms, () => { chipGrid.visible(false); uiLayer.batchDraw(); });

            }

          } else {

            if (chipGrid._fadeTween) { chipGrid._fadeTween.destroy(); chipGrid._fadeTween = null; }

            chipGrid.opacity(1); chipGrid.visible(effectiveVis);

          }

        }

        if (!effectiveVis) {

          const menuGrp = s.findOne('.slot-menu');

          if (menuGrp?.visible()) fadeNode(menuGrp, 0, ms, () => { menuGrp.visible(false); uiLayer.batchDraw(); });

          ['.slot-delhit', '.slot-gearhit', '.slot-revhit'].forEach(n => s.findOne(n)?.visible(false));

        }

      });

      // Show/hide mini-slots

      routes.forEach(r => (r._miniSlots || []).forEach(sl => {

        if (!sl) return;

        if (ms > 0) {

          if (effectiveVis) {

            sl.listening(true);

            if (!sl.visible()) { sl.opacity(0); sl.visible(true); }

            fadeNode(sl, 1, ms);

          } else {

            if (sl.visible()) fadeNode(sl, 0, ms, () => { sl.listening(false); sl.visible(false); uiLayer.batchDraw(); });

          }

        } else {

          if (sl._fadeTween) { sl._fadeTween.destroy(); sl._fadeTween = null; }

          sl.listening(effectiveVis); sl.opacity(1); sl.visible(effectiveVis);

        }

      }));

      uiLayer.batchDraw();

    }

  },

  {

    key: 'grid', label: 'Grid', layer: 'virtual',

    getInstances: () => [{ id: 'grid', label: 'Background grid' }],

    apply: vis => { gridLayer.visible(vis); gridLayer.batchDraw(); }

  },

];



// Initialize per-view default visibility from VISUAL_TYPES.

Object.keys(VIEW_MODES).forEach(viewKey => {

  VISUAL_TYPES.forEach(t => {

    let val = 'visible';

    if (viewKey === 'ViewGhost') {

      // Routes visible in ghost view; workerLabels stay live on workerLayer so they

      // track animated positions without lag. Other virtual types use ghost overlays.

      val = (t.key === 'routes' || t.key === 'routeSlots' || t.key === 'workerLabels') ? 'visible' : 'hidden';

    } else if (viewKey !== 'ViewHoverReveal' && (t.key === 'routes' || t.key === 'routeSlots' || t.key === 'workerLabels')) {

      val = 'hidden'; // Routes and worker labels only visible in ghost/hover view.

    }

    VIEW_MODES[viewKey].visible[t.key] = val;

  });

});



// Persistence — save edits across reloads.

const VIEW_MODES_STORAGE_KEY = 'uxprototype.viewModes.v3';

function saveViewModes() {

  try {

    const data = {};

    Object.entries(VIEW_MODES).forEach(([k, v]) => { data[k] = { ...v.visible }; });

    localStorage.setItem(VIEW_MODES_STORAGE_KEY, JSON.stringify(data));

  } catch (e) { /* localStorage may be unavailable (e.g. file://, private mode) */ }

}

function loadViewModes() {

  try {

    const raw = localStorage.getItem(VIEW_MODES_STORAGE_KEY);

    if (!raw) return;

    const data = JSON.parse(raw);

    Object.entries(data).forEach(([viewKey, vis]) => {

      if (!VIEW_MODES[viewKey] || !vis) return;

      Object.entries(vis).forEach(([typeKey, val]) => {

        if (VIS_STATES.includes(val)) VIEW_MODES[viewKey].visible[typeKey] = val;

      });

    });

  } catch (e) { /* ignore corrupt data */ }

}



let debugOpen = false;

// Debug panel View Modes tab operates on VIEW MODES directly (purely visual states).

// Auto-sync only follows the effective view; doesn't tie to game mode at all.

let debugActiveView = 'ViewDefault';

let debugActiveTab = 'viewmodes';

const expandedTypes = new Set();



// Hitbox visualization state — Debug ? Options ? Hitboxes.

// The list is DERIVED automatically from any Konva shape whose name starts with 'hitbox-'.

// Adding a new hitbox category = just create a shape named 'hitbox-foo' on any layer;

// it'll show up in the panel with no further wiring.

const hitboxShow = {}; // keyed by suffix after 'hitbox-'

const HITBOX_LAYERS = () => [nodeLayer, workerLayer, edgeLayer, uiLayer];

function discoverHitboxes() {

  const groups = new Map(); // suffix -> { key, label, shapes }

  HITBOX_LAYERS().forEach(layer => {

    layer.find('Shape, Rect').forEach(s => {

      if (s.listening()) return; // functional hitboxes handle events — exclude from debug toggle

      const n = s.name && s.name();

      if (!n) return;

      // a shape can have multiple class-names (space-separated); find any starting with 'hitbox-'

      const cls = n.split(/\s+/).find(c => c.startsWith('hitbox-'));

      if (!cls) return;

      const suffix = cls.slice('hitbox-'.length);

      if (!groups.has(suffix)) {

        const label = suffix.charAt(0).toUpperCase() + suffix.slice(1) + 's';

        groups.set(suffix, { key: suffix, label, shapes: [] });

      }

      groups.get(suffix).shapes.push(s);

    });

  });

  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));

}

function applyHitboxVisibility() {

  const groups = discoverHitboxes();

  groups.forEach(g => {

    const show = !!hitboxShow[g.key];

    g.shapes.forEach(s => s.visible(show));

  });

  HITBOX_LAYERS().forEach(l => l.batchDraw());

}



let debugPreviewing = false; // true while the panel is overriding the live view



// Generic fade helper — tween a node's opacity to target. Cancels any running fade

// on the same node first. Stores the tween on `node._fadeTween` to avoid stacking.

function fadeNode(node, target, ms, onComplete) {

  if (!node) { if (onComplete) onComplete(); return; }

  if (node._fadeTween) { node._fadeTween.destroy(); node._fadeTween = null; }

  if (node.opacity() === target) { if (onComplete) onComplete(); return; }

  if (ms <= 0) {

    node.opacity(target);

    if (onComplete) onComplete();

    return;

  }

  node._fadeTween = new Konva.Tween({

    node, duration: ms / 1000, opacity: target,

    onFinish: () => { node._fadeTween = null; if (onComplete) onComplete(); },

  });

  node._fadeTween.play();

}



// Ghost fade — tween revealLayer.opacity on enter/exit so ghost objects don't pop in/out.

let _ghostActive = false;

let _ghostTween = null;

function fadeGhostTo(target, onComplete) {

  if (_ghostTween) { _ghostTween.destroy(); _ghostTween = null; }

  if (revealLayer.opacity() === target) { if (onComplete) onComplete(); return; }

  const VG = VISUAL_STYLES.ghostFade;

  const dur = (target === 1 ? VG.inMs : VG.outMs) / 1000;

  if (dur <= 0) {

    revealLayer.opacity(target);

    revealLayer.batchDraw();

    if (onComplete) onComplete();

    return;

  }

  _ghostTween = new Konva.Tween({

    node: revealLayer,

    duration: dur,

    opacity: target,

    onFinish: () => { _ghostTween = null; if (onComplete) onComplete(); },

  });

  _ghostTween.play();

}



function buildRevealGhosts(includeRoutes = true) {

  const wasActive = _ghostActive;

  _ghostActive = true;

  if (!wasActive) dlog('ghost', 'build (fade-in)');

  revealLayer.destroyChildren();

  if (includeRoutes) {

    edgeLayer.find('.routepath').forEach(el => {

      revealLayer.add(new Konva.Path({ data: el.data(), stroke: 'rgba(255,255,255,0.25)', strokeWidth: el.strokeWidth(), lineCap: 'round', lineJoin: 'round', listening: false }));

    });

    uiLayer.find('.route-slot').forEach(grp => {

      const rect = grp.findOne('Rect'); if (!rect) return;

      revealLayer.add(new Konva.Rect({ x: grp.x() + rect.x(), y: grp.y() + rect.y(), width: rect.width(), height: rect.height(), cornerRadius: rect.cornerRadius(), stroke: 'rgba(255,255,255,0.25)', strokeWidth: rect.strokeWidth(), dash: rect.dash(), fill: 'rgba(255,255,255,0.03)', listening: false }));

    });

  }

  nodeLayer.find('.node').forEach(nodeGrp => {

    if (currentMode === 'liftWorker') return;

    const node = nodes.find(n => n.id === nodeGrp.id());

    if (!node) return;

    let drawX = nodeGrp.x(), drawY = nodeGrp.y();

    if (lineDraft) {

      if (lineDraft.fromNode.id !== node.id) return;

      const ep = lineDraft.endB.position();

      drawX = ep.x; drawY = ep.y;

    } else {

      if (nodeGrp.id() !== _hoveredNodeId) return;

    }

    const counts = {};

    (node.scrap || []).forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });

    const entries = SCRAP_TYPES.map(t => [t, counts[t.id] || 0]).filter(([, c]) => c > 0);

    entries.sort((a, b) => b[1] - a[1]);

    if (entries.length > 0) {

      const VS = VISUAL_STYLES.scrapStack;

      const maxCount = entries[0][1];

      const spacing = maxCount <= VS.normalizeThreshold ? VS.naturalSpacing : VS.maxHeight / (maxCount - 1);

      const totalW = (entries.length - 1) * VS.columnSpacing;

      const startX = drawX - totalW / 2;

      entries.forEach(([tpl, count], col) => {

        const cx = startX + col * VS.columnSpacing;

        for (let i = count - 1; i >= 0; i--) {

          const cy = drawY + VS.baseOffsetY - i * spacing;

          revealLayer.add(new Konva.RegularPolygon({

            x: cx, y: cy, sides: 3, radius: VS.radius,

            fill: VS.fill,

            stroke: VS.stroke, strokeWidth: VS.strokeWidth,

            listening: false,

          }));

        }

      });

    }

  });

  // Zone scrap stacks — always shown in ghost view, follow cursor if drafted from this zone

  zones.forEach(zone => {

    if (!(zone.scrap?.length)) return;

    const zp = zonePos(zone);

    let drawX = zp.x, drawY = zp.y;

    if (lineDraft && lineDraft.fromNode.id === zone.id) {

      const ep = lineDraft.endB.position();

      drawX = ep.x; drawY = ep.y;

    }

    const counts = {};

    (zone.scrap).forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });

    const entries = SCRAP_TYPES.map(t => [t, counts[t.id] || 0]).filter(([, c]) => c > 0);

    entries.sort((a, b) => b[1] - a[1]);

    if (!entries.length) return;

    const VS = VISUAL_STYLES.scrapStack;

    const maxCount = entries[0][1];

    const spacing = maxCount <= VS.normalizeThreshold ? VS.naturalSpacing : VS.maxHeight / (maxCount - 1);

    const totalW = (entries.length - 1) * VS.columnSpacing;

    const startX = drawX - totalW / 2;

    entries.forEach(([tpl, count], col) => {

      const cx = startX + col * VS.columnSpacing;

      for (let i = count - 1; i >= 0; i--) {

        const cy = drawY + VS.baseOffsetY - i * spacing;

        revealLayer.add(new Konva.RegularPolygon({

          x: cx, y: cy, sides: 3, radius: VS.radius,

          fill: VS.fill, stroke: VS.stroke, strokeWidth: VS.strokeWidth,

          listening: false,

        }));

      }

    });

  });

  revealLayer.batchDraw();

  if (!wasActive) {

    revealLayer.opacity(0);

    fadeGhostTo(1);

  }

}

function clearRevealGhosts() {

  if (!_ghostActive) {

    revealLayer.destroyChildren();

    revealLayer.batchDraw();

    return;

  }

  _ghostActive = false;

  dlog('ghost', 'clear (fade-out)');

  fadeGhostTo(0, () => {

    revealLayer.destroyChildren();

    revealLayer.batchDraw();

  });

}



// Hover reveal depth — both pile hover and worker hover push ViewHoverReveal.

let workerHoverDepth = 0;

function enterWorkerHover() { workerHoverDepth++; dlog('hover', 'enter worker (depth=' + workerHoverDepth + ')'); if (workerHoverDepth === 1) pushViewFocus('ViewGhost'); }

function exitWorkerHover()  { if (workerHoverDepth === 0) return; workerHoverDepth--; dlog('hover', 'leave worker (depth=' + workerHoverDepth + ')'); if (workerHoverDepth === 0) popViewFocus(); }



// Resolve the effective vis state for a type in a given view, following 'inherit'

// back to ViewDefault. Returns 'visible' | 'hidden' | 'highlighted'.

function resolveVisState(viewKey, typeKey) {

  const state = VIEW_MODES[viewKey] && VIEW_MODES[viewKey].visible[typeKey];

  if (!state || state === 'inherit') return VIEW_MODES.ViewDefault.visible[typeKey] || 'visible';

  return state;

}



// ===== DEBUG CONSOLE =====

// Ring buffer of semantic visual events. Toggle with '. Filter via input.

// Newest entries are bright white, older fade to grey by group (logs within

// the same ~50ms cluster share a group).

const _dlogBuf = [];

const DLOG_MAX = 200;

let _dlogGroup = 0;

let _dlogLastTime = 0;

let _dconsoleOn = false;

let _dconsoleFilter = '';

let _dconsoleScheduled = false;

function dlog(tag, msg) {

  const now = performance.now();

  if (now - _dlogLastTime > 50) _dlogGroup++;

  _dlogLastTime = now;

  _dlogBuf.push({ tag, msg, group: _dlogGroup });

  if (_dlogBuf.length > DLOG_MAX) _dlogBuf.shift();

  if (_dconsoleOn && !_dconsoleScheduled) {

    _dconsoleScheduled = true;

    requestAnimationFrame(() => { _dconsoleScheduled = false; renderDebugConsole(); });

  }

}

function renderDebugConsole() {

  const body = document.getElementById('dconsole-body');

  if (!body) return;

  const flt = _dconsoleFilter.toLowerCase();

  const filtered = flt

    ? _dlogBuf.filter(e => e.tag.toLowerCase().includes(flt) || e.msg.toLowerCase().includes(flt))

    : _dlogBuf;

  // Newest at top. Age = how many groups behind the latest visible group this entry is.

  const latestGroup = filtered.length ? filtered[filtered.length - 1].group : 0;

  const rows = [];

  for (let i = filtered.length - 1; i >= 0; i--) {

    const e = filtered[i];

    const age = Math.min(4, latestGroup - e.group);

    rows.push(`<div class="dlog-row dlog-age-${age}"><span class="dlog-tag">${e.tag}</span><span class="dlog-msg">${e.msg}</span></div>`);

  }

  body.innerHTML = rows.join('');

}

function toggleDebugConsole() {

  _dconsoleOn = !_dconsoleOn;

  const el = document.getElementById('dconsole');

  if (el) el.hidden = !_dconsoleOn;

  if (_dconsoleOn) renderDebugConsole();

}

{

  const filter = document.getElementById('dconsole-filter');

  const clear  = document.getElementById('dconsole-clear');

  const close  = document.getElementById('dconsole-close');

  if (filter) filter.addEventListener('input', e => { _dconsoleFilter = e.target.value; renderDebugConsole(); });

  if (clear)  clear.addEventListener('click', () => { _dlogBuf.length = 0; renderDebugConsole(); });

  if (close)  close.addEventListener('click', () => { _dconsoleOn = false; const el = document.getElementById('dconsole'); if (el) el.hidden = true; });

}



function applyDebugVisibility() {

  dlog('apply', 'view=' + getEffectiveView());

  // The Debug ? View Modes tab is purely about visual states. While the user is

  // previewing a specific view via the panel, that view drives the live display.

  // Otherwise, the effective view (game mode default + viewFocusStack) does.

  const effectiveView = viewFocusStack.length

    ? viewFocusStack[viewFocusStack.length - 1]

    : MODES[currentMode].view;

  // ViewHoverReveal is readonly — track the panel to its public alias ViewGhost.

  const panelView = effectiveView === 'ViewHoverReveal' ? 'ViewGhost' : effectiveView;

  if (!debugPreviewing && debugActiveView !== panelView) {

    debugActiveView = panelView;

    if (debugOpen) renderDebugPanel();

  }

  const view = debugPreviewing ? debugActiveView : effectiveView;

  const showAnchors = (view === 'ViewGhost' || view === 'ViewHoverReveal');

  edgeLayer.find('.mini-anchor').forEach(a => a.visible(showAnchors));

  if (view === 'ViewHoverReveal') {

    _hoverRevealActive = true;

    VISUAL_TYPES.forEach(t => t.apply(false));

    buildRevealGhosts();

    edgeLayer.batchDraw();

    refreshAllSlotPortraits();

    return;

  }

  _hoverRevealActive = false;

  const VG = VISUAL_STYLES.ghostFade;

  if (view === 'ViewGhost') {

    VISUAL_TYPES.forEach(t => t.apply(resolveVisState('ViewGhost', t.key) !== 'hidden', VG.inMs, VG.outMs));

    buildRevealGhosts(false);

    routes.forEach(route => {

      const stroke = VISUAL_STYLES.route.strokeColor;

      edgeLayer.findOne('#' + route.id)?.findOne('.routepath')?.stroke(stroke);

      uiLayer.findOne('#slot_' + route.id)?.findOne('Rect')?.stroke(stroke);

    });

    edgeLayer.batchDraw();

    uiLayer.batchDraw();

    refreshAllSlotPortraits();

    return;

  }

  clearRevealGhosts();

  if (!VIEW_MODES[view]) return;

  VISUAL_TYPES.forEach(t => t.apply(resolveVisState(view, t.key) !== 'hidden', VG.inMs, VG.outMs));

  refreshAllSlotPortraits();

}





// Instance state catalog — drives the Instance States section. Each entry is a

// (type, state) pair with a function that returns the matching live instances.

const workerLabel = w => {

  const tpl = palette.workers.find(t => t.id === w.templateId);

  const n = tpl && tpl.name;

  return n ? n.charAt(0).toUpperCase() + n.slice(1) : w.id;

};

const INSTANCE_STATE_DEFS = [

  { type: 'Piles', state: 'hovered',

    list: () => nodes.filter(n => n.states && n.states.hovered),

    label: n => 'Pile ' + n.id },

  { type: 'Workers', state: 'lifting',

    list: () => workers.filter(w => w.states && w.states.lifting),

    label: workerLabel },

  { type: 'Workers', state: 'walking',

    list: () => workers.filter(w => w.targetX != null),

    label: workerLabel },

  { type: 'Workers', state: 'to_source',

    list: () => workers.filter(w => w.state === 'to_source'),

    label: workerLabel },

  { type: 'Workers', state: 'to_dest',

    list: () => workers.filter(w => w.state === 'to_dest'),

    label: workerLabel },

  { type: 'Workers', state: 'to_slot',

    list: () => workers.filter(w => w.state === 'to_slot'),

    label: workerLabel },

  { type: 'Workers', state: 'waiting',

    list: () => workers.filter(w => w.state === 'waiting'),

    label: workerLabel },

  { type: 'Routes', state: 'recentlyCreated',

    list: () => routes.filter(r => r.states && r.states.recentlyCreated),

    label: r => r.fromId + ' ? ' + r.toId },

];



function renderInstanceStates() {

  const tbody = document.getElementById('instance-state-rows');

  if (!tbody) return;

  let html = '';

  let lastType = null;

  INSTANCE_STATE_DEFS.forEach(def => {

    if (def.type !== lastType) {

      html += '<tr class="istate-type-row"><td colspan="2">' + def.type + '</td></tr>';

      lastType = def.type;

    }

    const matches = def.list();

    const count = matches.length;

    const cls = 'istate-row ' + (count > 0 ? 'has' : 'zero');

    const labels = matches.map(def.label).join(', ');

    const stateCell = def.state + (labels ? ' <span style="color:#666;font-size:10px"> — ' + labels + '</span>' : '');

    html += '<tr class="' + cls + '"><td>' + stateCell + '</td><td>' + count + '</td></tr>';

  });

  tbody.innerHTML = html;

}



let lastDebugSignature = '';

function renderDebugPanel() {

  const modeBtnsEl = document.getElementById('debug-mode-btns');

  const tbody = document.getElementById('debug-type-rows');

  if (!modeBtnsEl || !tbody) return;



  // Skip re-render if nothing relevant has actually changed.

  // Without this, the 100ms refresh nukes rows mid-click and the click event

  // is lost between mousedown and mouseup.

  const sig = JSON.stringify({

    view: debugActiveView,

    expanded: [...expandedTypes].sort(),

    vis: VIEW_MODES,

    counts: VISUAL_TYPES.map(t => t.getInstances().length),

    instLabels: VISUAL_TYPES

      .filter(t => expandedTypes.has(t.key))

      .map(t => t.getInstances().map(i => i.label)),

    iStates: INSTANCE_STATE_DEFS.map(d => d.list().length),

  });

  if (sig === lastDebugSignature) return;

  lastDebugSignature = sig;

  renderInstanceStates();



  modeBtnsEl.innerHTML = '';

  Object.entries(VIEW_MODES).forEach(([key, v]) => {

    if (v.readonly) return;

    const btn = document.createElement('button');

    btn.className = 'dbg-mode-btn' + (debugActiveView === key ? ' active' : '');

    btn.textContent = v.display;

    btn.onclick = () => {

      debugActiveView = key;

      // Previewing means: pin the live view to debugActiveView regardless of game mode.

      const effectiveView = viewFocusStack.length

        ? viewFocusStack[viewFocusStack.length - 1]

        : MODES[currentMode].view;

      debugPreviewing = (debugActiveView !== effectiveView);

      applyDebugVisibility();

      renderDebugPanel();

    };

    modeBtnsEl.appendChild(btn);

  });



  const vis = (VIEW_MODES[debugActiveView] && VIEW_MODES[debugActiveView].visible) || {};

  let html = '';

  let lastLayer = null;

  const layerLabel = { physical: 'Physical', virtual: 'Virtual' };

  VISUAL_TYPES.forEach(type => {

    if (type.layer !== lastLayer) {

      lastLayer = type.layer;

      html += '<tr><td colspan="2" style="padding:8px 8px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:' +

        (type.layer === 'physical' ? '#6ab0f5' : '#a78bfa') + ';border-top:1px solid #1c1c1c">' +

        (layerLabel[type.layer] || type.layer) + '</td></tr>';

    }

    const instances = type.getInstances();

    const state = vis[type.key] || 'visible'; // 'visible' | 'hidden' | 'highlighted' | 'inherit'

    const resolvedState = resolveVisState(debugActiveView, type.key);

    const isVisibleish = (resolvedState !== 'hidden');

    const isExpanded = expandedTypes.has(type.key);

    const canExpand = instances.length > 0;

    const expandIcon = canExpand ? (isExpanded ? '?' : '?') : '·';

    const cursorStyle = canExpand ? 'cursor:pointer' : 'cursor:default';

    const stateLabel = state === 'inherit'

      ? 'Inherit (' + resolvedState.charAt(0).toUpperCase() + resolvedState.slice(1) + ')'

      : state.charAt(0).toUpperCase() + state.slice(1);

    const isDefault = (debugActiveView === 'ViewDefault');

    const tooltip = isDefault

      ? 'Click to cycle: visible ? hidden'

      : 'Click to cycle: visible ? hidden ? inherit (falls back to ViewDefault)';



    html +=

      '<tr class="dbg-type-row" data-action="expand" data-key="' + type.key + '" style="' + cursorStyle + '">' +

        '<td class="dbg-label">' + expandIcon + ' ' + type.label +

          ' <span class="dbg-count">(' + instances.length + ')</span></td>' +

        '<td class="dbg-vis-cell">' +

          '<button class="dbg-vis-btn state-' + state +

            '" data-action="toggle" data-key="' + type.key + '" title="' + tooltip + '">' +

            stateLabel +

          '</button>' +

        '</td>' +

      '</tr>';



    if (isExpanded) {

      instances.forEach(inst => {

        html +=

          '<tr class="dbg-inst-row">' +

            '<td class="dbg-inst-label">? ' + inst.label + '</td>' +

            '<td class="dbg-vis-cell"><span class="dbg-inst-dot ' + (isVisibleish ? 'on' : '') + '">?</span></td>' +

          '</tr>';

      });

    }

  });

  tbody.innerHTML = html;

}



// Event delegation at the DOCUMENT level — survives every re-render

// and doesn't care when the rows came into existence.

document.addEventListener('click', e => {

  if (!e.target.closest || !e.target.closest('#debug-panel')) return;

  const btn = e.target.closest('[data-action="toggle"]');

  if (btn) {

    e.stopPropagation();

    console.log('[debug] toggle vis:', btn.dataset.key);

    toggleDebugVis(btn.dataset.key);

    return;

  }

  const row = e.target.closest('[data-action="expand"]');

  if (row) {

    console.log('[debug] expand:', row.dataset.key);

    toggleDebugExpand(row.dataset.key);

  }

});



function toggleDebugExpand(typeKey) {

  if (expandedTypes.has(typeKey)) expandedTypes.delete(typeKey);

  else expandedTypes.add(typeKey);

  renderDebugPanel();

}



function toggleDebugVis(typeKey) {

  const v = VIEW_MODES[debugActiveView];

  if (!v) return;

  const cur = v.visible[typeKey] || 'visible';

  // ViewDefault: 2-state toggle (visible ? hidden).

  // Contextual modes: 3-state cycle (visible ? hidden ? inherit ? visible).

  const cycle = (debugActiveView === 'ViewDefault')

    ? ['visible', 'hidden']

    : ['visible', 'hidden', 'inherit'];

  const idx = cycle.indexOf(cur);

  v.visible[typeKey] = cycle[(idx + 1) % cycle.length];

  // Preview the change live if the panel's active view differs from the effective view.

  const effectiveView = viewFocusStack.length

    ? viewFocusStack[viewFocusStack.length - 1]

    : MODES[currentMode].view;

  debugPreviewing = (debugActiveView !== effectiveView);

  applyDebugVisibility();

  renderDebugPanel();

}



// When the cursor leaves the debug panel, return the live view to the actual game mode.

(() => {

  const panel = document.getElementById('debug-panel');

  if (!panel) return;

  panel.addEventListener('mouseleave', () => {

    if (!debugPreviewing) return;

    debugPreviewing = false;

    // Snap the debug active view back to the current effective view.

    debugActiveView = viewFocusStack.length

      ? viewFocusStack[viewFocusStack.length - 1]

      : MODES[currentMode].view;

    applyDebugVisibility();

    renderDebugPanel();

  });

})();



const LOCAL_VIS_RULES = [

  {

    name: 'Route slot',

    driver: 'Route occupancy',

    note: 'The slot indicator is hidden when a worker is assigned to the route. The routeSlots apply() function adds this condition on top of global visibility.',

  },

  {

    name: 'Carry indicator',

    driver: 'Worker inventory',

    note: 'Per-type triangles shown above a worker when their inventory is non-empty. Toggled by updateWorkerVisual().',

  },

];



function renderLocalPane() {

  const pane = document.getElementById('debug-local-pane');

  if (!pane) return;

  pane.innerHTML = LOCAL_VIS_RULES.map(r =>

    `<div class="local-rule">

      <div class="local-rule-name">${r.name}</div>

      <div class="local-rule-driver">${r.driver}</div>

      <div class="local-rule-note">${r.note}</div>

    </div>`

  ).join('');

}



function renderWorkersPane() {

  const pane = document.getElementById('debug-workers-pane');

  if (!pane) return;

  const ROUTE_PHASES = [

    { state: 'idle',          label: 'IDLE' },

    { state: 'to_source',     label: '?SRC' },

    { state: 'to_zone_scrap', label: '?ZONE' },

    { state: 'to_dest',       label: '?DEST' },

    { state: 'to_slot',       label: '?SLOT' },

    { state: 'waiting',       label: 'WAIT' },

    { state: 'no_work',       label: 'NO WORK', rest: true },

    { state: 'to_idle_zone',  label: '?IDLE', rest: true },

    { state: 'chilling',      label: 'ZZZ', rest: true },

    { state: 'chill_walk',    label: 'WANDER', rest: true },

    { state: 'chill_rest',    label: 'REST', rest: true },

    { state: 'thinking',      label: 'THINK', rest: true },

  ];

  const SMELTER_PHASES = [

    { state: 'idle',       label: 'IDLE' },

    { state: 'to_smelter', label: '?SMELT' },

    { state: 'at_smelter', label: 'WORKING' },

  ];

  let html = '';

  workers.forEach(w => {

    const tpl = palette.workers.find(p => p.id === w.templateId);

    const name = tpl ? tpl.name.charAt(0).toUpperCase() + tpl.name.slice(1) : w.id;

    let jobLabel = 'unassigned';

    let phases = null;

    const activeJob = w.jobs?.[0];

    if (activeJob?.type === 'route') { jobLabel = 'Route'; phases = ROUTE_PHASES; }

    else if (activeJob?.type === 'smelter') { jobLabel = 'Smelter'; phases = SMELTER_PHASES; }

    html += `<div class="wq-worker-card">`;

    html += `<div class="wq-worker-header"><span class="wq-worker-name" style="color:${w.color}">${name}</span><span class="wq-job-label">${jobLabel} · ${w.state}</span></div>`;

    if (phases) {

      html += `<div class="wq-pipeline">`;

      phases.forEach((p, i) => {

        const active = w.state === p.state;

        const cls = 'wq-phase' + (active ? (p.rest ? ' wq-rest-active' : ' wq-active') : '');

        html += `<div class="${cls}">${p.label}</div>`;

        if (i < phases.length - 1) html += `<span class="wq-arrow">›</span>`;

      });

      html += `</div>`;

    } else {

      html += `<div class="wq-no-job">no active job</div>`;

    }

    html += `</div>`;

  });

  if (!workers.length) html = '<div style="color:#555;font-style:italic;padding:10px;font-size:10px">No workers in scene.</div>';

  pane.innerHTML = html;

}



// ===== WORKER PROPS PANEL =====

let _wpActiveTab = 0;

let _talkActiveTab = 'settings';



function _wpEsc(s) {

  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

}



function renderWorkerPropsPane() {

  const tabBar = document.getElementById('wp-tab-bar');

  const content = document.getElementById('wp-tab-content');

  const toolbar = document.getElementById('wp-toolbar');

  if (!tabBar || !content) return;

  if (_wpActiveTab !== 'timings' && _wpActiveTab >= palette.workers.length) _wpActiveTab = 0;



  tabBar.innerHTML = palette.workers.map((tpl, i) => {

    const label = tpl.name ? tpl.name[0].toUpperCase() + tpl.name.slice(1) : tpl.id;

    return `<button class="wp-tab${i === _wpActiveTab ? ' active' : ''}" data-wi="${i}" style="color:${tpl.color}">${_wpEsc(label)}</button>`;

  }).join('') + `<button class="wp-tab${'timings' === _wpActiveTab ? ' active' : ''}" data-wi="timings" style="color:#888;margin-left:auto">Timings</button>`;



  tabBar.querySelectorAll('.wp-tab').forEach(btn => {

    btn.addEventListener('click', () => {

      _wpActiveTab = btn.dataset.wi === 'timings' ? 'timings' : parseInt(btn.dataset.wi);

      renderWorkerPropsPane();

    });

  });



  if (toolbar) toolbar.hidden = (_wpActiveTab === 'timings');



  if (_wpActiveTab === 'timings') {

    const row = (label, obj, key, step, min, title) => `

      <tr>

        <td class="wp-label" title="${title ?? ''}">${label}</td>

        <td><input class="wp-input wp-num" type="number" step="${step}" min="${min ?? 0}"

            value="${obj[key]}" data-wt-obj="${obj === PATHFIND_PARAMS ? 'pfp' : obj === SMELTER_PARAMS ? 'smp' : 'wt'}" data-wt-key="${key}" /></td>

      </tr>`;

    content.innerHTML = `



      <table class="wp-table">

        <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Thinking</td></tr>

        ${row('Think time (s)', PATHFIND_PARAMS, 'thinkTime', 0.5, 0, 'Pause before starting each new job')}

        ${row('No-work enter (s)', WORKER_TIMINGS, 'noWorkEnterSec', 0.5, 0, 'Seconds waiting at empty source before giving up')}

        ${row('No-work wait (s)', WORKER_TIMINGS, 'noWorkWaitSec', 0.5, 0, 'Seconds in no-work before re-checking for a job')}

        <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:10px 0 4px;font-weight:700">Idle / Chill</td></tr>

        ${row('Idle timeout (s)', WORKER_TIMINGS, 'idleTimeoutSec', 1, 0, 'Seconds idle before worker walks to idle zone')}

        ${row('Chill rest min (s)', WORKER_TIMINGS, 'chillMinSec', 0.5, 0, 'Minimum rest duration at idle zone')}

        ${row('Chill rest max (s)', WORKER_TIMINGS, 'chillMaxSec', 0.5, 0, 'Maximum rest duration at idle zone')}

        <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:10px 0 4px;font-weight:700">Smelter</td></tr>

        ${row('Conversion time (s)', SMELTER_PARAMS, 'conversionTimeSec', 0.5, 0.1, 'Time to smelt one batch')}

        <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:10px 0 4px;font-weight:700">Collision</td></tr>

        ${row('Sep. radius (px)',   WORKER_TIMINGS, 'sepRadius',     1,    0, 'Push workers apart when closer than this')}

        ${row('Sep. strength',      WORKER_TIMINGS, 'sepStrength',   0.05, 0, 'Fraction of overlap corrected per frame')}

        ${row('Yield radius (px)',  WORKER_TIMINGS, 'yieldRadius',   1,    0, 'Pause lower-priority worker when this close')}

        ${row('Yield duration (s)', WORKER_TIMINGS, 'yieldDuration', 0.05, 0, 'How long yielding worker pauses')}

      </table>`;

    content.querySelectorAll('[data-wt-key]').forEach(inp => {

      inp.addEventListener('input', () => {

        const v = parseFloat(inp.value);

        if (!Number.isFinite(v)) return;

        const obj = inp.dataset.wtObj === 'pfp' ? PATHFIND_PARAMS : inp.dataset.wtObj === 'smp' ? SMELTER_PARAMS : WORKER_TIMINGS;

        obj[inp.dataset.wtKey] = v;

      });

    });

    return;

  }



  const tpl = palette.workers[_wpActiveTab];

  if (!tpl) { content.innerHTML = ''; return; }



  const speedVal = (tpl.speedMult ?? 1).toFixed(2);

  const intVal   = (tpl.intelligenceSpeed ?? 1).toFixed(2);

  const desc     = tpl.description ?? ('I am ' + (tpl.name ?? ''));



  content.innerHTML = `

    <table class="wp-table">

      <tr><td class="wp-label">Name</td>

          <td><input class="wp-input" data-field="name" value="${_wpEsc(tpl.name ?? '')}" /></td></tr>

      <tr><td class="wp-label">Color</td>

          <td><input type="color" class="wp-color" data-field="color" value="${tpl.color ?? '#888888'}" /></td></tr>

      <tr><td class="wp-label">Carry capacity</td>

          <td><input class="wp-input wp-num" type="number" data-field="capacity" min="1" max="20" step="1" value="${tpl.capacity ?? 1}" /></td></tr>

      <tr><td class="wp-label">Chip count</td>

          <td><input class="wp-input wp-num" type="number" data-field="chipCount" min="1" max="8" step="1" value="${tpl.chipCount ?? 4}" /></td></tr>

      <tr><td class="wp-label">Thirst rate</td>

          <td><input class="wp-input wp-num" type="number" data-field="thirstRate" min="0" max="100" step="1" value="${tpl.thirstRate ?? 3}" /></td></tr>

      <tr><td class="wp-label">Speed mult</td>

          <td><input class="wp-input wp-num" type="number" data-field="speedMult" min="0.1" max="5" step="0.05" value="${speedVal}" /></td></tr>

      <tr><td class="wp-label">Intelligence speed <span class="wp-todo" title="Hooks into reaction delays — not yet implemented">TODO</span></td>

          <td><input class="wp-input wp-num" type="number" data-field="intelligenceSpeed" min="0.1" max="5" step="0.05" value="${intVal}" /></td></tr>

      <tr><td class="wp-label">Description <span class="wp-todo" title="Not yet used in-game">TODO</span></td>

          <td><textarea class="wp-textarea" data-field="description" rows="2">${_wpEsc(desc)}</textarea></td></tr>

    </table>`;



  content.querySelectorAll('[data-field]').forEach(inp => {

    const onChange = () => {

      const field = inp.dataset.field;

      const raw = inp.type === 'number' ? parseFloat(inp.value) : inp.value;

      const val = (inp.type === 'number' && isNaN(raw)) ? (tpl[field] ?? 0) : raw;

      tpl[field] = val;

      workers.filter(w => w.templateId === tpl.id).forEach(w => {

        if (field === 'color') {

          w.color = val;

          const grp = workerLayer.findOne('#' + w.id);

          if (grp) { const ws = grp.findOne('.workercircle'); if (ws) { ws.fill(val); ws.stroke(val); } }

          workerLayer.batchDraw();

        } else if (field === 'capacity')          { w.capacity = val; }

        else if (field === 'chipCount')            { w.chipCount = val; buildAllJobPanels(); }

        else if (field === 'thirstRate')            { w.thirstRate = val; }

        else if (field === 'speedMult')            { w.speedMult = val; }

        else if (field === 'intelligenceSpeed')    { w.intelligenceSpeed = val; }

        else if (field === 'description')          { w.description = val; }

      });

      if (field === 'name' || field === 'color') {

        const tab = tabBar.querySelector(`[data-wi="${_wpActiveTab}"]`);

        if (tab) { tab.style.color = tpl.color; if (field === 'name') tab.textContent = val ? val[0].toUpperCase() + val.slice(1) : tpl.id; }

      }

    };

    inp.addEventListener('input', onChange);

    inp.addEventListener('change', onChange);

  });

}



function renderThirstPane() {

  const content = document.getElementById('thirst-content');

  if (!content) return;

  const row = (label, obj, key, step, min) => `
    <tr>
      <td class="wp-label">${label}</td>
      <td><input class="wp-input wp-num" data-tp-key="${key}" type="number" min="${min ?? 0}" step="${step}" value="${obj[key]}" style="width:70px"/></td>
    </tr>`;

  content.innerHTML = `
    <table class="wp-table" style="margin-bottom:10px">
      <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Settings</td></tr>
      ${row('Thirst warning threshold', THIRST_PARAMS, 'thirstThreshold', 1, 1)}
      ${row('Bladder warning threshold', THIRST_PARAMS, 'bladderThreshold', 1, 1)}
      ${row('Drink duration (s)', THIRST_PARAMS, 'drinkDuration', 0.1, 0.1)}
    </table>
    <table class="wp-table" style="margin-bottom:10px">
      <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Fridge</td></tr>
      ${row('Max drinks', THIRST_PARAMS, 'fridgeCapacity', 1, 1)}
      ${row('Drink cost ($)', THIRST_PARAMS, 'drinkCost', 1, 0)}
      ${row('Bladder fill/drink', THIRST_PARAMS, 'bladderFillPerDrink', 1, 1)}
    </table>
    <table class="wp-table" style="margin-bottom:10px">
      <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Outhouse</td></tr>
      ${row('Use duration (s)', THIRST_PARAMS, 'outhouseDuration', 0.1, 0.1)}
      ${row('Curve exponent', THIRST_PARAMS, 'bladderCurveExp', 0.1, 0.1)}
    </table>
    <table class="wp-table" style="margin-bottom:10px">
      <tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Probability test</td></tr>
      <tr>
        <td class="wp-label">Bladder value</td>
        <td>
          <input id="tp-test-bladder" type="number" min="0" max="100" step="1"
            value="${Math.round(THIRST_PARAMS.bladderThreshold)}"
            class="wp-input wp-num" style="width:55px"/>
          <span id="tp-test-prob" style="margin-left:6px;font-size:11px;color:#8ef">—</span>
        </td>
      </tr>
    </table>
    <div id="thirst-workers-inner"></div>`;

  content.querySelectorAll('input[data-tp-key]').forEach(inp => {

    inp.addEventListener('change', () => {

      const k = inp.dataset.tpKey;

      if (k in THIRST_PARAMS) THIRST_PARAMS[k] = parseFloat(inp.value);

    });

  });

  const testInput = content.querySelector('#tp-test-bladder');
  const testSpan  = content.querySelector('#tp-test-prob');

  function updateTestProb() {
    const bladder = parseFloat(testInput.value) || 0;
    if (bladder <= THIRST_PARAMS.bladderThreshold) {
      testSpan.textContent = '0% (below threshold)';
      testSpan.style.color = '#888';
    } else {
      const t = (bladder - THIRST_PARAMS.bladderThreshold) / (100 - THIRST_PARAMS.bladderThreshold);
      const p = 0.01 + 0.99 * Math.pow(t, THIRST_PARAMS.bladderCurveExp);
      testSpan.textContent = (p * 100).toFixed(1) + '%';
      testSpan.style.color = p > 0.5 ? '#f88' : '#8ef';
    }
  }

  testInput.addEventListener('input', updateTestProb);
  updateTestProb();

  updateThirstWorkers();

}

function updateThirstWorkers() {

  const el = document.getElementById('thirst-workers-inner');

  if (!el) return;

  const barColor     = v => v >= 80 ? '#e74c3c' : v >= 60 ? '#f39c12' : '#3498db';
  const bladderColor = v => v >= 80 ? '#e74c3c' : v >= 60 ? '#f39c12' : '#27ae60';

  el.innerHTML = `
    <table class="wp-table">
      <tr>
        <td colspan="4" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;font-weight:700">Workers</td>
      </tr>
      ${workers.map(w => {
        const tpl  = palette.workers.find(t => t.id === w.templateId);
        const name = tpl?.name ?? w.id;
        const t    = Math.round(w.thirst  || 0);
        const b    = Math.round(w.bladder || 0);
        return `<tr>
          <td class="wp-label" style="color:${tpl?.color ?? '#fff'}">${name}</td>
          <td style="min-width:80px">
            <div style="background:#333;border-radius:3px;height:8px;width:80px;overflow:hidden">
              <div style="background:${barColor(t)};width:${t}%;height:100%;border-radius:3px"></div>
            </div>
            <span style="font-size:9px;color:#aaa;margin-left:4px">${t}</span>
          </td>
          <td style="min-width:80px">
            <div style="background:#333;border-radius:3px;height:8px;width:80px;overflow:hidden">
              <div style="background:${bladderColor(b)};width:${b}%;height:100%;border-radius:3px"></div>
            </div>
            <span style="font-size:9px;color:#aaa;margin-left:4px">${b}</span>
          </td>
          <td style="font-size:9px;color:#888">${w.state}</td>
        </tr>`;
      }).join('')}
    </table>`;

}

let _thirstPaneInterval = null;

function renderTalkingPane() {

  const content = document.getElementById('talk-content');

  if (!content) return;

  const VSB = VISUAL_STYLES.speechBubble;

  const parseLines = ta => ta.value.split('\n').map(s => s.trim()).filter(Boolean);



  const sec = label => `<tr><td colspan="2" style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:10px 0 4px;font-weight:700">${label}</td></tr>`;

  const numRow = (label, id, val, min, max, step) =>

    `<tr><td class="wp-label">${label}</td><td><input class="wp-input wp-num" id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${val}" style="width:80px"/></td></tr>`;

  const strRow = (label, id, val) =>

    `<tr><td class="wp-label" style="white-space:nowrap">${label}</td><td><input class="wp-input" id="${id}" type="text" value="${_wpEsc(val)}"/></td></tr>`;

  const phraseBlock = (label, countId, count, taId, lines) => `

    <div style="margin-top:10px">

      <div style="color:#4a90e2;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:2px 0 3px;font-weight:700">

        ${label} <span id="${countId}" style="color:#666;font-weight:400;text-transform:none">(${count})</span>

      </div>

      <textarea id="${taId}" class="wp-textarea" rows="6" style="width:100%;box-sizing:border-box;resize:vertical;font-size:10px;line-height:1.5">${lines.map(l => _wpEsc(l)).join('\n')}</textarea>

    </div>`;



  const STATE_LABELS = {

    idle: 'Idle', to_source: 'To source', to_zone_scrap: 'Searching zone',

    to_dest: 'Delivering', to_slot: 'To post', waiting: 'Waiting for scrap',

    to_smelter: 'To smelter', at_smelter: 'At smelter',

    no_work: 'No work', chilling: 'Chilling (arrive)', thinking: 'Thinking', commanded: 'Commanded',

  };



  const tabs = [

    { id: 'settings', label: 'Settings', color: '#888' },

    ...palette.workers.map(tpl => ({ id: tpl.id, label: tpl.name.charAt(0).toUpperCase() + tpl.name.slice(1), color: tpl.color })),

  ];



  content.innerHTML = `

    <div style="display:flex;gap:4px;padding:6px 0 8px;border-bottom:1px solid #333;margin-bottom:6px">

      ${tabs.map(t => `<button class="wp-tab${t.id === _talkActiveTab ? ' active' : ''}" data-ti="${t.id}" style="color:${t.color};background:${t.id === _talkActiveTab ? '#2a2a2a' : 'transparent'};border:1px solid ${t.id === _talkActiveTab ? '#555' : '#333'};border-radius:3px;padding:3px 8px;font-size:10px;cursor:pointer">${t.label}</button>`).join('')}

    </div>

    <div id="talk-tab-inner"></div>`;



  content.querySelectorAll('.wp-tab[data-ti]').forEach(btn => {

    btn.addEventListener('click', () => { _talkActiveTab = btn.dataset.ti; renderTalkingPane(); });

  });



  const inner = document.getElementById('talk-tab-inner');



  if (_talkActiveTab === 'settings') {

    inner.innerHTML = `

      <table class="wp-table">

        ${sec('Speech Bubble')}

        ${numRow('Duration (ms)', 'talk-dur', VSB.durationMs, 200, 10000, 100)}

        ${sec('Chill Chatter')}

        ${numRow('Say chance (%)', 'talk-chance', Math.round(_chillChatterChance * 100), 0, 100, 1)}

        ${sec('State Phrases')}

        ${Object.entries(STATE_LABELS).map(([k, lbl]) => strRow(lbl, 'talk-st-' + k, WORKER_STATE_CHATTER[k] ?? '')).join('')}

      </table>`;



    document.getElementById('talk-dur').addEventListener('input', e => {

      const v = parseInt(e.target.value); if (!isNaN(v) && v >= 200) VSB.durationMs = v;

    });

    document.getElementById('talk-chance').addEventListener('input', e => {

      const v = parseFloat(e.target.value); if (!isNaN(v)) _chillChatterChance = Math.max(0, Math.min(100, v)) / 100;

    });

    Object.keys(STATE_LABELS).forEach(k => {

      document.getElementById('talk-st-' + k)?.addEventListener('input', e => { WORKER_STATE_CHATTER[k] = e.target.value; });

    });

  } else {

    const tpl = palette.workers.find(t => t.id === _talkActiveTab);

    if (!tpl) return;

    inner.innerHTML =

      phraseBlock('Walk Phrases', 'twk-walk-count', tpl.chillWalk.length, 'twk-walk', tpl.chillWalk) +

      phraseBlock('Rest Phrases', 'twk-rest-count', tpl.chillRest.length, 'twk-rest', tpl.chillRest) +

      phraseBlock('Departure Phrases', 'twk-dep-count', tpl.chillPhrases.length, 'twk-dep', tpl.chillPhrases);



    document.getElementById('twk-walk').addEventListener('change', e => {

      tpl.chillWalk = parseLines(e.target);

      document.getElementById('twk-walk-count').textContent = '(' + tpl.chillWalk.length + ')';

    });

    document.getElementById('twk-rest').addEventListener('change', e => {

      tpl.chillRest = parseLines(e.target);

      document.getElementById('twk-rest-count').textContent = '(' + tpl.chillRest.length + ')';

    });

    document.getElementById('twk-dep').addEventListener('change', e => {

      tpl.chillPhrases = parseLines(e.target);

      document.getElementById('twk-dep-count').textContent = '(' + tpl.chillPhrases.length + ')';

    });

  }

}



let _talkFlashTimer = null;

function talkFlash(msg, ok) {

  const el = document.getElementById('talk-flash');

  if (!el) return;

  el.textContent = msg;

  el.style.color = ok ? '#4caf50' : '#e74c3c';

  clearTimeout(_talkFlashTimer);

  _talkFlashTimer = setTimeout(() => { el.textContent = ''; }, 4000);

}

async function talkSaveToCode() {

  const btn = document.getElementById('talk-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-talking', {

      method: 'POST', headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        chatter: WORKER_STATE_CHATTER,

        chill_phrases: CHILL_PHRASES,

        chill_chance: _chillChatterChance,

        bubble_duration: VISUAL_STYLES.speechBubble.durationMs,

        workers: palette.workers,

      }),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    talkFlash('Saved to index.html ?', true);

  } catch (err) {

    const msg = String(err.message || err);

    talkFlash(/Failed to fetch|NetworkError/i.test(msg) ? '? Needs dev server (serve.bat)' : '? Save failed: ' + msg, false);

  } finally {

    if (btn) btn.disabled = false;

  }

}



let _wpFlashTimer = null;

function wpFlash(msg, ok) {

  const el = document.getElementById('wp-flash');

  if (!el) return;

  el.textContent = msg;

  el.style.color = ok ? '#4caf50' : '#e74c3c';

  clearTimeout(_wpFlashTimer);

  _wpFlashTimer = setTimeout(() => { el.textContent = ''; }, 4000);

}



async function wpSaveToCode() {

  const btn = document.getElementById('wp-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-worker-props', {

      method: 'POST', headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ workers: palette.workers, pathfind: PATHFIND_PARAMS, smelter: SMELTER_PARAMS, worker: WORKER_TIMINGS }),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Sync localStorage so a subsequent hard-refresh doesn't re-apply stale palette.workers.

    try {

      const saved = JSON.parse(localStorage.getItem(DEFAULT_SAVE_KEY) || 'null');

      if (saved && saved.palette) {

        saved.palette.workers = palette.workers.map(w => ({ id: w.id, kind: w.kind, color: w.color, capacity: w.capacity, name: w.name, chipCount: w.chipCount ?? 4 }));

        localStorage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(saved));

      }

    } catch (_) {}

    wpFlash('Saved to index.html ?', true);

  } catch (err) {

    const msg = String(err.message || err);

    wpFlash(/Failed to fetch|NetworkError/i.test(msg) ? '? Needs dev server (serve.bat)' : '? Save failed: ' + msg, false);

  } finally {

    if (btn) btn.disabled = false;

  }

}



function setDebugTab(tab) {

  debugActiveTab = tab;

  document.querySelectorAll('#debug-tab-bar .debug-tab').forEach(b => {

    b.classList.toggle('active', b.dataset.tab === tab);

  });

  const vm = document.getElementById('debug-viewmodes-pane');

  const op = document.getElementById('debug-options-pane');

  const lc = document.getElementById('debug-local-pane');

  if (vm) vm.hidden = (tab !== 'viewmodes');

  if (op) op.hidden = (tab !== 'options');

  if (lc) lc.hidden = (tab !== 'local');

  if (tab === 'options') renderOptionsPane();

  else if (tab === 'local') renderLocalPane();

  else renderDebugPanel();

}

document.querySelectorAll('#debug-tab-bar .debug-tab').forEach(b => {

  b.addEventListener('click', () => setDebugTab(b.dataset.tab));

});



function renderOptionsPane() {

  const tbody = document.getElementById('hitbox-rows');

  if (!tbody) return;

  const groups = discoverHitboxes();

  let html = '';

  if (groups.length === 0) {

    html = '<tr><td colspan="2" style="color:#666;font-style:italic;text-align:center;padding:14px">No hitboxes in scene yet.</td></tr>';

  } else {

    groups.forEach(g => {

      html +=

        '<tr>' +

          '<td>' + g.label + ' <span style="color:#666;font-size:10px">(' + g.shapes.length + ')</span></td>' +

          '<td><input type="checkbox" data-hitbox="' + g.key + '"' +

            (hitboxShow[g.key] ? ' checked' : '') + '></td>' +

        '</tr>';

    });

  }

  tbody.innerHTML = html;

  tbody.querySelectorAll('input[type=checkbox]').forEach(cb => {

    cb.addEventListener('change', () => {

      hitboxShow[cb.dataset.hitbox] = cb.checked;

      applyHitboxVisibility();

    });

  });

}



