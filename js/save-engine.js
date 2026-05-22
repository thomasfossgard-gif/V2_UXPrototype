// ===== MODULE: save-engine.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== LEVEL SAVE / LOAD =====

const LEVEL_VERSION = 1;

function serializeLevel() {

  return {

    version: LEVEL_VERSION,

    savedAt: new Date().toISOString(),

    stage: { x: stage.x(), y: stage.y(), scale: stage.scaleX() },

    palette: {

      objects: palette.objects.map(o => ({ id: o.id, kind: o.kind, color: o.color })),

      workers: palette.workers.map(w => ({ id: w.id, kind: w.kind, color: w.color, capacity: w.capacity, name: w.name, chipCount: w.chipCount ?? 4 })),

    },

    nodes: nodes.map(n => ({

      id: n.id, templateId: n.templateId, kind: n.kind, x: n.x, y: n.y, color: n.color, items: n.items,

      shape: n.shape, label: n.label, scrap: n.scrap || [],

      smelterId: n.smelterId, smelterRole: n.smelterRole,

    })),

    routes: routes.map(r => ({

      id: r.id, name: r.name, maxWorkers: r.maxWorkers ?? 4, workerSlots: r.workerSlots || [null, null, null, null],

      fromId: r.fromId, toId: r.toId, workerIds: r.workerIds || [],

      allowedTypes: r.allowedTypes || defaultAllowedTypes(),

    })),

    workers: workers.map(w => ({

      id: w.id, templateId: w.templateId, color: w.color, capacity: w.capacity,

      chipCount: w.chipCount ?? 4,

      x: w.x, y: w.y, jobs: (w.jobs || []).filter(j => j.type !== 'move'), inventory: w.inventory || {},

      state: w.state || 'idle',

      targetX: w.targetX, targetY: w.targetY,

    })),

    groundScrap: groundScrap.map(gs => ({ id: gs.id, type: gs.type, x: gs.x, y: gs.y, rotation: gs.rotation })),

    zones: zones.map(z => ({ id: z.id, circles: z.circles.map(c => ({ x: c.x, y: c.y })), scrap: (z.scrap || []).map(s => ({ type: s.type })) })),

    smelters: smelters.map(s => ({ id: s.id, name: s.name, x: s.x, y: s.y, inputNodeId: s.inputNodeId, outputNodeId: s.outputNodeId, maxWorkers: s.maxWorkers ?? 1, workerSlots: s.workerSlots || [null], smelterType: s.smelterType || null })),

    viewModes: Object.fromEntries(Object.entries(VIEW_MODES).map(([k, v]) => [k, { visible: { ...v.visible } }])),

    jobPanelPos: { x: VISUAL_STYLES.jobPanel.x, y: VISUAL_STYLES.jobPanel.y },

    jobPanelCollapsed: _jobPanelCollapsed,

    autoPanelCollapsed: _autoPanelCollapsed,

    autoPanelPos: { ..._autoPanelPos },

    yardShopPos: { ..._yardShopPos },

    helpPanelPos:       { ..._helpPanelPos },
    helpPanelCollapsed: _helpPanelCollapsed,
    autoWorkVisible:    _autoWorkVisible,
    jobPanelVisible:    _jobPanelVisible,

    nextId,

  };

}

function downloadLevel() {

  const json = JSON.stringify(serializeLevel(), null, 2);

  const blob = new Blob([json], { type: 'application/json' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  a.download = `level-${stamp}.json`;

  document.body.appendChild(a); a.click(); document.body.removeChild(a);

  URL.revokeObjectURL(url);

  setLevelStatus('Saved ' + a.download);

}

function clearAllLevelShapes() {

  nodeLayer.destroyChildren();

  edgeLayer.destroyChildren();

  zoneLayer.destroyChildren();

  workerLayer.destroyChildren();

  if (_zoneBrushCursor) _zoneBrushCursor.remove();

  if (_zoneCursorForbidden) _zoneCursorForbidden.remove();

  uiLayer.destroyChildren();

  if (_zoneBrushCursor) uiLayer.add(_zoneBrushCursor);

  if (_zoneCursorForbidden) uiLayer.add(_zoneCursorForbidden);

  _zoneAnchors.clear();

  _pileAnchors.clear();

  nodes = []; routes = []; workers = []; groundScrap = []; zones = []; smelters = [];

  _activeZoneId = null;

}

function loadLevelData(data) {

  if (!data || data.version !== LEVEL_VERSION) {

    throw new Error('Unsupported level version: ' + (data && data.version));

  }

  clearAllLevelShapes();
  playerMoney = MONEY_PARAMS.startingFunds;


  // Palette colors/capacities (template instances reference these)

  if (data.palette && Array.isArray(data.palette.objects)) {

    data.palette.objects.forEach(o => {

      const ex = palette.objects.find(p => p.id === o.id);

      if (ex && o.color) ex.color = o.color;

    });

  }

  if (data.palette && Array.isArray(data.palette.workers)) {

    data.palette.workers.forEach(o => {

      const ex = palette.workers.find(p => p.id === o.id);

      if (!ex) return;

      if (o.color) ex.color = o.color;

      if (typeof o.capacity === 'number') ex.capacity = o.capacity;

      if (o.name) ex.name = o.name;

      if (typeof o.chipCount === 'number') ex.chipCount = o.chipCount;

    });

  }



  // Ground scrap (before nodes so it renders beneath piles)

  (data.groundScrap || []).forEach(gs => {

    const item = { id: gs.id, type: gs.type, x: gs.x, y: gs.y, rotation: gs.rotation || 0 };

    groundScrap.push(item);

    drawGroundScrap(item);

  });



  // Zones

  (data.zones || []).forEach(z => {

    const zone = { id: z.id, circles: (z.circles || []).map(c => ({ x: c.x, y: c.y })), scrap: (z.scrap || []).map(s => ({ type: s.type })) };

    zones.push(zone);

    redrawZone(zone);

    spawnZoneAnchor(zone);

  });



  // Smelters (before nodes so piles can be found by id after node load)

  (data.smelters || []).forEach(s => {

    const sm = { id: s.id, name: s.name || ('Smelter ' + (smelters.length + 1)), x: s.x, y: s.y, inputNodeId: s.inputNodeId, outputNodeId: s.outputNodeId, state: 'idle', processingType: null, progress: 0, maxWorkers: s.maxWorkers ?? 1, workerSlots: s.workerSlots ? [...s.workerSlots] : (s.workerId ? [s.workerId] : [null]), smelterType: s.smelterType || null };

    smelters.push(sm);

  });



  // Nodes

  (data.nodes || []).forEach(n => {

    let scrap = n.scrap || [];

    if (!Array.isArray(scrap)) { const arr = []; Object.entries(scrap).forEach(([type, count]) => { for (let i = 0; i < count; i++) arr.push({ type }); }); scrap = arr; }

    const _nodeColor = n.smelterRole === 'input' ? VISUAL_STYLES.smelterInputPile.color : n.smelterRole === 'output' ? VISUAL_STYLES.smelterOutputPile.color : n.color;

    const _tplRef = palette.objects.find(p => p.id === n.templateId);

    const _subtype = n.subtype || _tplRef?.subtype;

    const node = { id: n.id, templateId: n.templateId, kind: n.kind || 'object', x: n.x, y: n.y, color: _nodeColor, items: scrap.length, shape: n.shape || 'rect', label: n.label || '', scrap, smelterId: n.smelterId, smelterRole: n.smelterRole, ...(_subtype && { subtype: _subtype }), ...(n.kind === 'fridge' && { drinks: n.drinks ?? THIRST_PARAMS.fridgeCapacity }), ...(n.kind === 'outhouse' && { occupant: null, waiting: [] }) };

    nodes.push(node);

    drawNode(node);

  });

  // Draw smelter bodies (after nodes so piles are already rendered beneath)

  smelters.forEach(sm => drawSmelter(sm));

  // Apply typed smelter pile colors after both nodes and smelter bodies are drawn
  smelters.forEach(sm => { if (sm.smelterType) { applySmelterTypeColors(sm); updateSmelterLabel(sm); } });

  // Routes (also creates slots)

  (data.routes || []).forEach(r => {

    const maxW = r.maxWorkers ?? 4;

    const ws = r.workerSlots ? [...r.workerSlots] : new Array(maxW).fill(null);

    if (!r.workerSlots) (r.workerIds || []).forEach((id, i) => { if (i < maxW) ws[i] = id; });

    const route = {

      id: r.id, name: r.name || ('Route ' + (routes.length + 1)),

      maxWorkers: maxW,

      workerSlots: ws,

      fromId: r.fromId, toId: r.toId, workerIds: ws.filter(Boolean),

      allowedTypes: r.allowedTypes || defaultAllowedTypes(),

      states: { recentlyCreated: false },

    };

    routes.push(route);

    drawRoute(route);

  });

  // Workers

  (data.workers || []).forEach(wd => {

    const workerTpl = palette.workers.find(t => t.id === wd.templateId);

    const w = {

      id: wd.id, templateId: wd.templateId, color: workerTpl?.color ?? wd.color, capacity: workerTpl?.capacity ?? wd.capacity ?? 1,

      chipCount: workerTpl?.chipCount ?? wd.chipCount ?? 4,

      speedMult: workerTpl?.speedMult ?? wd.speedMult ?? 1,

      x: wd.x, y: wd.y, jobs: (() => { const j = Array.isArray(wd.jobs) ? [...wd.jobs] : []; if (!j.length && wd.routeId) j.push({ type: 'route', id: wd.routeId }); if (!j.length && wd.smelterId) j.push({ type: 'smelter', id: wd.smelterId }); return j; })(), inventory: wd.inventory || {},

      autoMode: wd.autoMode ?? false,

      state: 'idle', path: null, pathIdx: 0,

      targetX: wd.targetX != null ? wd.targetX : null,

      targetY: wd.targetY != null ? wd.targetY : null,

      states: { lifting: false },

    };

    workers.push(w);

    drawWorker(w);

  });



  // ID counter + color rotation

  if (typeof data.nextId === 'number') nextId = data.nextId;



  // Jobs panel position

  if (data.jobPanelPos) {

    VISUAL_STYLES.jobPanel.x = data.jobPanelPos.x;

    VISUAL_STYLES.jobPanel.y = data.jobPanelPos.y;

  }

  if (typeof data.jobPanelCollapsed === 'boolean') _jobPanelCollapsed = data.jobPanelCollapsed;
  if (typeof data.autoPanelCollapsed === 'boolean') _autoPanelCollapsed = data.autoPanelCollapsed;
  if (data.autoPanelPos) { _autoPanelPos.x = data.autoPanelPos.x ?? _autoPanelPos.x; _autoPanelPos.y = data.autoPanelPos.y ?? _autoPanelPos.y; }
  if (data.yardShopPos) { _yardShopPos.x = data.yardShopPos.x ?? _yardShopPos.x; _yardShopPos.y = data.yardShopPos.y ?? _yardShopPos.y; }
  if (data.helpPanelPos) { _helpPanelPos.x = data.helpPanelPos.x ?? _helpPanelPos.x; _helpPanelPos.y = data.helpPanelPos.y ?? _helpPanelPos.y; }
  if (typeof data.helpPanelCollapsed === 'boolean') _helpPanelCollapsed = data.helpPanelCollapsed;
  if (typeof data.autoWorkVisible    === 'boolean') _autoWorkVisible    = data.autoWorkVisible;
  if (typeof data.jobPanelVisible    === 'boolean') _jobPanelVisible    = data.jobPanelVisible;



  // Stage transform

  if (data.stage) {

    stage.scale({ x: data.stage.scale || 1, y: data.stage.scale || 1 });

    stage.position({ x: data.stage.x || 0, y: data.stage.y || 0 });

    drawGrid();

    stage.batchDraw();

    updateHudTransform();

  }

  // View modes

  if (data.viewModes) {

    Object.entries(data.viewModes).forEach(([k, v]) => {

      if (VIEW_MODES[k] && v && v.visible) {

        Object.entries(v.visible).forEach(([typeKey, val]) => {

          if (VIS_STATES.includes(val)) VIEW_MODES[k].visible[typeKey] = val;

        });

      }

    });

  }



  // Re-render dependent UI



  renderPalette();

  applyMode();

  applyHitboxVisibility();

  buildAllJobPanels();

}

function uploadLevel() {

  const input = document.createElement('input');

  input.type = 'file';

  input.accept = '.json,application/json';

  input.onchange = e => {

    const file = e.target.files && e.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {

      try {

        const data = JSON.parse(reader.result);

        loadLevelData(data);

        setLevelStatus('Loaded ' + file.name);

      } catch (err) {

        setLevelStatus('Load failed: ' + err.message);

      }

    };

    reader.readAsText(file);

  };

  input.click();

}

function setLevelStatus(msg) {

  const el = document.getElementById('level-status');

  if (el) el.textContent = msg;

}

document.getElementById('btn-save-level').addEventListener('click', downloadLevel);

document.getElementById('btn-load-level').addEventListener('click', uploadLevel);



// ===== ENGINE MODE =====

let engineVisible = false;

function _applyDecorationInteractivity() {

  nodeLayer.find('.decoration').forEach(grp => {

    grp.draggable(engineVisible);

    grp.listening(engineVisible);

  });

  nodeLayer.batchDraw();

}

function _applyGroundScrapInteractivity() {

  nodeLayer.find('.ground-scrap').forEach(grp => {

    grp.draggable(engineVisible);

  });

  nodeLayer.batchDraw();

}

function toggleEngineMode() {

  engineVisible = !engineVisible;

  _applyDecorationInteractivity();

  _applyGroundScrapInteractivity();

  const d = engineVisible ? '' : 'none';

  document.getElementById('gp-toggle').style.display = d;

  document.getElementById('debug-toggle').style.display = d;

  document.getElementById('engine-top-bar').style.display = engineVisible ? 'flex' : 'none';

  if (!engineVisible) {

    if (gpOpen) toggleGpPanel();

    if (debugOpen) toggleDebugPanel();

    document.querySelectorAll('.eng-panel').forEach(p => p.style.display = 'none');

    document.querySelectorAll('.eng-top-btn').forEach(b => b.classList.remove('active'));

  }

}



// Note mode button — opens/closes the note panel (does not activate the tool)

document.getElementById('eng-auto-panel-btn').addEventListener('click', () => {
  const btn = document.getElementById('eng-auto-panel-btn');
  _autoWorkVisible = _autoPanelGrp ? !_autoPanelGrp.visible() : true;
  if (_autoPanelGrp) {
    _autoPanelGrp.visible(_autoWorkVisible);
    hudLayer.batchDraw();
  } else {
    buildAutoPanel();
  }
  btn.classList.toggle('active', _autoWorkVisible);
  rebuildHelpPanel();
});

document.getElementById('eng-note-mode-btn').addEventListener('click', () => {

  const panel = document.getElementById('note-panel');

  const btn   = document.getElementById('eng-note-mode-btn');

  if (!panel.hidden) {

    panel.hidden = true;

    btn.classList.remove('active');

    document.getElementById('note-list-panel').hidden = true;

    noteListOpen = false;

    document.getElementById('note-list-btn').classList.remove('active');

    if (currentMode === 'noteMode') setMode('gameInteract');

  } else {

    const r = btn.getBoundingClientRect();

    panel.style.top  = (r.bottom + 6) + 'px';

    panel.style.left = r.left + 'px';

    panel.hidden = false;

    btn.classList.add('active');

  }

});



// Engine top bar — open/close dropdown panels

document.querySelectorAll('.eng-top-btn[data-eng-panel]').forEach(btn => {

  btn.addEventListener('click', () => {

    const panelId = btn.dataset.engPanel;

    const panel = document.getElementById(panelId);

    const isOpen = panel.style.display !== 'none';

    document.querySelectorAll('.eng-panel').forEach(p => p.style.display = 'none');

    document.querySelectorAll('.eng-top-btn[data-eng-panel]').forEach(b => b.classList.remove('active'));

    if (isOpen && panelId === 'eng-panel-thirst') { clearInterval(_thirstPaneInterval); _thirstPaneInterval = null; }

    if (!isOpen) {

      const r = btn.getBoundingClientRect();

      panel.style.top = (r.bottom + 6) + 'px';

      panel.style.left = r.left + 'px';

      panel.style.display = '';

      btn.classList.add('active');

      if (panelId === 'eng-panel-workers') renderWorkersPane();

      if (panelId === 'eng-panel-workerprops') renderWorkerPropsPane();

      if (panelId === 'eng-panel-talking') renderTalkingPane();

      if (panelId === 'eng-panel-thirst') {

        renderThirstPane();

        _thirstPaneInterval = setInterval(updateThirstWorkers, 1000);

      } else {

        clearInterval(_thirstPaneInterval);

        _thirstPaneInterval = null;

      }

      if (panelId === 'eng-panel-objects') renderPalette();

      if (panelId === 'eng-panel-hitboxes') { renderHitboxesTab(); renderOptionsPane(); }

    }

  });

});

// Engine panel close buttons

document.querySelectorAll('.eng-panel-close').forEach(btn => {

  btn.addEventListener('click', () => {

    const panel = btn.closest('.eng-panel');

    if (panel.id === 'eng-panel-thirst') { clearInterval(_thirstPaneInterval); _thirstPaneInterval = null; }

    panel.style.display = 'none';

    document.querySelectorAll(`.eng-top-btn[data-eng-panel="${panel.id}"]`).forEach(b => b.classList.remove('active'));

  });

});

// Palette toggle button

document.getElementById('palette-toggle-btn')?.addEventListener('click', () => {

  const panel = document.getElementById('eng-panel-objects');

  const isVisible = panel.style.display !== 'none';

  if (!isVisible) {

    setMode('gameInteract'); // clears all tool-btn active states via applyMode

    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));

    panel.style.display = 'flex';

    document.getElementById('palette-toggle-btn').classList.add('active');

  } else {

    panel.style.display = 'none';

    document.getElementById('palette-toggle-btn').classList.remove('active');

    applyMode();

  }

});



// Draggable engine panels (skip palette panel — it is anchored)

document.querySelectorAll('.eng-panel-header').forEach(header => {

  header.addEventListener('mousedown', e => {

    if (e.target.classList.contains('eng-panel-close')) return;

    const panel = header.closest('.eng-panel');

    if (panel.id === 'eng-panel-objects') return; // palette is anchored, not draggable

    e.preventDefault();

    const rect = panel.getBoundingClientRect();

    let startX = e.clientX, startY = e.clientY;

    let startL = rect.left, startT = rect.top;

    header.style.cursor = 'grabbing';

    const onMove = e => {

      panel.style.left = (startL + e.clientX - startX) + 'px';

      panel.style.top  = (startT + e.clientY - startY) + 'px';

    };

    const onUp = () => {

      header.style.cursor = '';

      document.removeEventListener('mousemove', onMove);

      document.removeEventListener('mouseup', onUp);

    };

    document.addEventListener('mousemove', onMove);

    document.addEventListener('mouseup', onUp);

  });

});



// ===== META-CONTROLS =====

const DEFAULT_SAVE_KEY = 'uxproto_default_level';

const IS_ONLINE = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';


function setMetaStatus(msg, ok) {

  const el = document.getElementById('meta-status');

  if (!el) return;

  el.textContent = msg;

  el.style.color = ok ? '#2ecc71' : '#e67e22';

  clearTimeout(el._t);

  el._t = setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);

}



function saveDefault() {

  try {

    const data = serializeLevel();

    localStorage.setItem(DEFAULT_SAVE_KEY, JSON.stringify(data));

    setMetaStatus('Saved as local default.', true);

  } catch (e) {

    setMetaStatus('Save failed.', false);

  }

}



async function markBundledLevel() {

  try {

    const data = serializeLevel();

    const resp = await fetch('/save-bundled-level', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(data),

    });

    const json = await resp.json();

    if (json.ok) setMetaStatus('Level marked. Deploy to publish online.', true);

    else setMetaStatus('Mark failed: ' + json.error, false);

  } catch (e) {

    setMetaStatus('Mark failed: ' + e.message, false);

  }

}





function loadDefault() {

  const raw = localStorage.getItem(DEFAULT_SAVE_KEY);

  if (!raw) { setMetaStatus('No saved default.', false); return; }

  try {

    loadLevelData(JSON.parse(raw));

    setMetaStatus('Loaded.', true);

  } catch (e) {

    setMetaStatus('Load failed: ' + e.message, false);

  }

}



document.getElementById('btn-save-default').addEventListener('click', saveDefault);

document.getElementById('btn-load-default').addEventListener('click', loadDefault);

document.getElementById('btn-mark-level').addEventListener('click', markBundledLevel);

document.getElementById('btn-mark-level').style.display = IS_ONLINE ? 'none' : '';

document.getElementById('btn-clear-level').addEventListener('click', () => {

  clearAllLevelShapes();

  spawnInitialWorkers(); // calls buildAllJobPanels internally



  clearRevealGhosts();

  applyDebugVisibility();

  [nodeLayer, edgeLayer, workerLayer, uiLayer, revealLayer].forEach(l => l.batchDraw());

  setMetaStatus('Level cleared.', true);

});



document.getElementById('btn-inspect-tool').addEventListener('click', () => {

  if (currentMode === 'inspectMode') setMode('gameInteract');

  else setMode('inspectMode');

});



let gpOpen = false;

let gpPanelWidth = 280;

function setGpPanelWidth(w) {

  gpPanelWidth = Math.round(w);

  document.getElementById('gp-panel').style.setProperty('--gp-w', gpPanelWidth + 'px');

  if (gpOpen) document.getElementById('gp-toggle').style.left = gpPanelWidth + 'px';

}

function toggleGpPanel() {

  gpOpen = !gpOpen;

  document.getElementById('gp-panel').classList.toggle('open', gpOpen);

  document.getElementById('gp-toggle').style.left = gpOpen ? gpPanelWidth + 'px' : '0';

}

document.getElementById('gp-resize-handle').addEventListener('mousedown', e => {

  e.preventDefault();

  const handle = e.currentTarget;

  const startX = e.clientX, startW = gpPanelWidth;

  handle.classList.add('dragging');

  const onMove = e => setGpPanelWidth(Math.max(180, Math.min(700, startW + e.clientX - startX)));

  const onUp = () => {

    handle.classList.remove('dragging');

    document.removeEventListener('mousemove', onMove);

    document.removeEventListener('mouseup', onUp);

  };

  document.addEventListener('mousemove', onMove);

  document.addEventListener('mouseup', onUp);

});



