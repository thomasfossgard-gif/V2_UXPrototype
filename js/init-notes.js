// ===== MODULE: init-notes.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== INIT =====

setupZoneTools();

renderPalette();

applyMode();

applyUiTheme();

// Set --game-bar-bottom so palette panel clears the mode bar

(function() {

  const gb = document.getElementById('game-bar');

  if (gb) document.documentElement.style.setProperty('--game-bar-bottom', (gb.offsetHeight + 16 + 8) + 'px');

})();



// Load bundled level if one has been embedded (works for all visitors on any device).

if (IS_ONLINE) {

  if (BUNDLED_LEVEL) try { loadLevelData(BUNDLED_LEVEL); } catch (_) {}

  updateMoneyDisplay();

} else {

  const localRaw = localStorage.getItem(DEFAULT_SAVE_KEY);

  if (localRaw) {

    try { loadLevelData(JSON.parse(localRaw)); } catch (_) {

      if (BUNDLED_LEVEL) try { loadLevelData(BUNDLED_LEVEL); } catch (_) {}

    }

  } else if (BUNDLED_LEVEL) {

    try { loadLevelData(BUNDLED_LEVEL); } catch (_) {}

  }

  updateMoneyDisplay();

}



// ===== NOTE PANEL CONTROLS =====

let noteToolRadius = 30;



// Konva circle cursor — lives in world space, scales with zoom automatically

_noteCircleCursor = new Konva.Circle({

  radius: noteToolRadius, listening: false, visible: false,

  fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.45)', strokeWidth: 1,

  dash: [4, 3],

});

uiLayer.add(_noteCircleCursor);



stage.on('mousemove.noteCursor', () => {

  if (currentMode !== 'noteMode') return;

  const p = getWorldPointer();

  if (p) { _noteCircleCursor.position(p); _noteCircleCursor.visible(true); }

  uiLayer.batchDraw();

});

stage.on('mouseleave.noteCursor', () => { _noteCircleCursor.visible(false); uiLayer.batchDraw(); });



// Tool button — activates / deactivates note mode

document.getElementById('note-tool-btn').addEventListener('click', () => {

  setMode(currentMode === 'noteMode' ? 'gameInteract' : 'noteMode');

});



// Size slider

document.getElementById('note-size-slider').addEventListener('input', e => {

  noteToolRadius = parseInt(e.target.value);

  document.getElementById('note-size-label').textContent = noteToolRadius + ' px';

  _noteCircleCursor.radius(noteToolRadius);

  uiLayer.batchDraw();

});



// Show Notes toggle

document.getElementById('note-show-btn').addEventListener('click', () => {

  toggleNotes();

  document.getElementById('note-show-btn').classList.toggle('active', notesVisible);

});



// ===== NOTE SYSTEM =====

// Right-click any canvas element ? Add / edit a note.

// N key toggles note pins on the canvas.

// Notes persist in localStorage. Each entry stores element identity + user text

// visibly; metadata (_createdAt, _updatedAt) is saved but never displayed.



const NOTES_STORAGE_KEY = 'uxprototype.notes.v1';

let notes = [];          // [{ elementId, elementName, elementKind, text, worldX, worldY, _createdAt, _updatedAt }]

let notesVisible = false;

let _rightClickInfo = null; // set on RMB mousedown, consumed by contextmenu handler



// --- Storage ---

function loadNotes() {

  try { const r = localStorage.getItem(NOTES_STORAGE_KEY); if (r) notes = JSON.parse(r); } catch (_) { notes = []; }

}

function saveNotes() {

  try { localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes)); } catch (_) {}

  // Mirror to notes.json via dev server (silent fail if not running)

  fetch('/save-notes', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify(notes),

  }).catch(() => {});

}

loadNotes();



// --- Note layer (sits above everything, world-space) ---

const noteLayer = new Konva.Layer({ listening: true });

stage.add(noteLayer);



// --- Element identification ---

function buildElementInfo(id, fallbackWorldPos) {

  const gameNode = nodes.find(n => n.id === id);

  if (gameNode) {

    const allTpls = [...(palette.objects || []), ...(palette.decorations || [])];

    const tpl = allTpls.find(t => t.id === gameNode.templateId);

    const name = tpl?.label || gameNode.templateId || id;

    const kind = gameNode.smelterRole ? 'Smelter ' + gameNode.smelterRole + ' pile' : 'Pile';

    return { id, name, kind, worldX: gameNode.x, worldY: gameNode.y };

  }

  const worker = workers.find(w => w.id === id);

  if (worker) {

    const tpl = palette.workers.find(t => t.id === worker.templateId);

    return { id, name: tpl?.name || id, kind: 'Worker', worldX: worker.x, worldY: worker.y };

  }

  const sm = smelters.find(s => s.id === id);

  if (sm) return { id, name: 'Smelter', kind: 'Smelter', worldX: sm.x, worldY: sm.y };

  const route = routes.find(r => r.id === id);

  if (route) return { id, name: 'Route', kind: 'Route', worldX: fallbackWorldPos?.x ?? 0, worldY: fallbackWorldPos?.y ?? 0 };

  return { id, name: id, kind: '', worldX: fallbackWorldPos?.x ?? 0, worldY: fallbackWorldPos?.y ?? 0 };

}



function getElementInfoFromKonvaNode(target, worldPos) {

  const gameLayers = [nodeLayer, workerLayer, uiLayer, edgeLayer];

  let n = target;

  while (n) {

    const parent = n.getParent();

    if (!parent) break;

    if (gameLayers.includes(parent)) {

      const id = typeof n.id === 'function' ? n.id() : null;

      if (id) return buildElementInfo(id, worldPos);

      break;

    }

    n = parent;

  }

  // Fallback: no recognised game element — return a positional note anchor

  return { id: null, name: null, kind: null, worldX: worldPos.x, worldY: worldPos.y };

}



// --- World-space multi-hit scan for note mode ---

// Uses noteToolRadius as the uniform sampling radius — matches the Konva circle cursor.

// Computes distance to closest point of each object's bounding volume.

function _noteModeHitTestAll(wx, wy) {

  const R = noteToolRadius;

  const hits = [];

  function boxDist(cx, cy, hw, hh) {

    const dx = Math.max(0, Math.abs(wx - cx) - hw);

    const dy = Math.max(0, Math.abs(wy - cy) - hh);

    return Math.hypot(dx, dy);

  }

  // Workers (priority 5)

  const wHalf = VISUAL_STYLES.worker.size / 2;

  for (const w of workers) {

    const dist = boxDist(w.x, w.y, wHalf, wHalf);

    if (dist <= R) hits.push({ priority: 5, dist, layer: 'Workers', info: buildElementInfo(w.id, { x: wx, y: wy }) });

  }

  // Smelters: unified bounding box spanning body + station (priority 4)

  const VB = VISUAL_STYLES.smelterBody, VSt = VISUAL_STYLES.smelterStation;

  for (const sm of smelters) {

    const top  = sm.y - VB.height / 2;

    const bot  = sm.y + VB.height / 2 + VSt.offsetY + VSt.height;

    const cy   = (top + bot) / 2, hh = (bot - top) / 2;

    const dist = boxDist(sm.x, cy, VB.width / 2, hh);

    if (dist <= R) hits.push({ priority: 4, dist, layer: 'Smelters', info: buildElementInfo(sm.id, { x: wx, y: wy }) });

  }

  // Nodes / piles (priority 3)

  for (const node of nodes) {

    const half = node.kind === 'idleZone' ? VISUAL_STYLES.idleZone.size / 2 : VISUAL_STYLES.pileSquare.size / 2;

    const dist = boxDist(node.x, node.y, half, half);

    if (dist <= R) hits.push({ priority: 3, dist, layer: 'World Objects', info: buildElementInfo(node.id, { x: wx, y: wy }) });

  }

  // Ground scrap (priority 2)

  for (const gs of groundScrap) {

    const dist = Math.hypot(wx - gs.x, wy - gs.y);

    if (dist <= R) hits.push({ priority: 2, dist, layer: 'Ground', info: { id: gs.id, name: gs.type, kind: 'Ground Scrap', worldX: gs.x, worldY: gs.y } });

  }

  // Paint zones — cursor circle extends the blob's brush radius (priority 1)

  const zr = VISUAL_STYLES.zone.brushRadius + R;

  for (const zone of zones) {

    if (zone.circles.some(c => (c.x - wx) ** 2 + (c.y - wy) ** 2 <= zr * zr)) {

      const pos = zonePos(zone);

      hits.push({ priority: 1, dist: Math.hypot(wx - pos.x, wy - pos.y), layer: 'Zones', info: { id: zone.id, name: 'Paint Zone', kind: 'Zone', worldX: wx, worldY: wy } });

    }

  }

  // Routes — line segment distance (priority 0)

  for (const route of routes) {

    const from = nodes.find(n => n.id === route.fromId);

    const to   = nodes.find(n => n.id === route.toId);

    if (!from || !to) continue;

    const dx = to.x - from.x, dy = to.y - from.y, lenSq = dx * dx + dy * dy;

    const t = lenSq ? Math.max(0, Math.min(1, ((wx - from.x) * dx + (wy - from.y) * dy) / lenSq)) : 0;

    const dist = Math.hypot(wx - (from.x + t * dx), wy - (from.y + t * dy));

    if (dist <= R) hits.push({ priority: 0, dist, layer: 'Routes', info: buildElementInfo(route.id, { x: wx, y: wy }) });

  }

  hits.sort((a, b) => b.priority - a.priority || a.dist - b.dist);



  // Pass 2: Konva pixel scan — catches UI shapes (slots, snap targets) not in game-data arrays.

  // hudLayer is listening:false so getAllIntersections won't reach it; handled separately below.

  const sp2 = { x: wx * stage.scaleX() + stage.x(), y: wy * stage.scaleY() + stage.y() };

  try {

    const skipLayers = new Set([workerLayer, nodeLayer, gridLayer, zoneLayer, liftDimLayer, revealLayer, noteLayer, edgeLayer]);

    const seenKey = new Set();

    for (const shape of stage.getAllIntersections(sp2)) {

      const kLayer = shape.getLayer();

      if (!kLayer || skipLayers.has(kLayer)) continue;

      const layerLabel = kLayer === uiLayer ? 'UI (slots)' : null;

      if (!layerLabel) continue;

      // Walk ancestors to collect semantic refs

      let cur = shape, smRef = null, rtRef = null, chipNum = null, slotIdx = null;

      while (cur) {

        smRef    = smRef    || cur.smelterRef;

        rtRef    = rtRef    || cur.routeRef;

        if (chipNum  == null && cur._chipNum   != null) chipNum  = cur._chipNum;

        if (slotIdx  == null && cur.slotIndex  != null) slotIdx  = cur.slotIndex;

        cur = cur.parent;

      }

      let named = shape;

      while (named && !named.name()) named = named.parent;

      const shapeName = named?.name() || 'shape';

      // Key by semantic content, not shape name — avoids duplicates from nested shapes in same slot

      const key = layerLabel + ':' + (smRef?.id || rtRef?.id ? (smRef?.id || '') + ':' + (rtRef?.id || '') + ':' + (slotIdx ?? '') : shapeName);

      if (seenKey.has(key)) continue;

      seenKey.add(key);

      const lines = [];

      if (smRef) {

        const smW = (smRef.workerSlots || []).map(id => id ? workers.find(w => w.id === id) : null).find(Boolean) ?? null;

        const smWName = smW ? (palette.workers.find(t => t.id === smW.templateId)?.name || smW.id) : 'none';

        lines.push(`Smelter slot  ?  ${smRef.id}`);

        lines.push(`  worker: ${smWName}  |  state: ${smRef.state || 'idle'}`);

      } else if (rtRef) {

        lines.push(`Route slot  ?  ${rtRef.id}${slotIdx != null ? '  [slot ' + slotIdx + ']' : ''}`);

        const assigned = (rtRef.workerSlots || []).filter(Boolean).map(id => {

          const wk = workers.find(w => w.id === id);

          return wk ? (palette.workers.find(t => t.id === wk.templateId)?.name || id) : id;

        });

        lines.push(`  workers: ${assigned.join(', ') || 'none'}${chipNum != null ? '  |  chip: #' + chipNum : ''}`);

      } else {

        lines.push(shapeName);

      }

      hits.push({ priority: -1, dist: 0, layer: layerLabel, info: { id: null, name: shapeName, kind: layerLabel, worldX: wx, worldY: wy }, _konvaText: lines.join('\n') });

    }

  } catch (_) {}



  // Pass 3: HUD panel scan — hudLayer is listening:false so use _findSnapBarAtPointer.

  const snapBar = _findSnapBarAtPointer(null);

  if (snapBar) {

    const { w: bw, bar } = snapBar;

    const job = bar.job;

    const lines = [

      `Job bar chip  ?  worker: ${bw.name || bw.id}`,

      `  job: ${jobLabel(job)}  |  chip: #${job.chipNum ?? '?'}`,

    ];

    hits.push({ priority: -1, dist: 0, layer: 'HUD (panels)', info: { id: null, name: 'Job bar chip', kind: 'HUD', worldX: wx, worldY: wy }, _konvaText: lines.join('\n') });

  }



  return hits;

}



// --- noteMode click handler ---

stage.on('click.noteMode', () => {

  if (currentMode !== 'noteMode') return;

  const sp = stage.getPointerPosition();

  if (!sp) return;

  const wx = (sp.x - stage.x()) / stage.scaleX();

  const wy = (sp.y - stage.y()) / stage.scaleY();

  // If an existing note pin is nearby, edit it instead of creating a new one

  const NOTE_PIN_R = 15;

  const nearNote = notes.find(n => n.worldX != null && Math.hypot(n.worldX - wx, n.worldY - wy) <= NOTE_PIN_R);

  if (nearNote) {

    const info = buildElementInfo(nearNote.elementId, { x: nearNote.worldX, y: nearNote.worldY });

    openNoteDialog(info);

    return;

  }

  const hits = _noteModeHitTestAll(wx, wy);

  const primary = hits.length ? hits[0].info : { id: null, name: null, kind: null, worldX: wx, worldY: wy };

  openNoteDialog(primary, hits);

});



// --- Context capture ---

function captureElementContext(info) {

  const lines = [];

  function nodeLbl(n) {

    if (!n) return '(unknown)';

    if (n.label) return n.label;

    if (n.smelterRole) return `Smelter ${n.smelterRole} pile`;

    const tpl = [...(palette.objects || []), ...(palette.decorations || [])].find(t => t.id === n.templateId);

    if (tpl?.label) return tpl.label;

    return n.kind || n.templateId || n.id;

  }

  function workerLbl(w) {

    if (!w) return '(unknown)';

    const tpl = palette.workers.find(t => t.id === w.templateId);

    return tpl?.name || w.templateId || w.id;

  }

  function scrapStr(scrap) {

    if (!scrap || !scrap.length) return '(empty)';

    const c = {};

    scrap.forEach(s => { c[s.type] = (c[s.type] || 0) + 1; });

    return Object.entries(c).map(([t, n]) => `${t} ×${n}`).join(', ');

  }

  function invStr(inv) {

    if (!inv || !Object.keys(inv).length) return '(empty)';

    return Object.entries(inv).map(([t, n]) => `${t} ×${n}`).join(', ');

  }

  function jobStr(job) {

    if (job.type === 'route') {

      const r = routes.find(r => r.id === job.id);

      if (!r) return `route ${job.id} (deleted)`;

      return `route ? ${nodeLbl(nodes.find(n => n.id === r.fromId))} ? ${nodeLbl(nodes.find(n => n.id === r.toId))}`;

    }

    if (job.type === 'smelter') {

      const sm = smelters.find(s => s.id === job.id);

      return sm ? `smelter (state: ${sm.state})` : `smelter ${job.id} (deleted)`;

    }

    return JSON.stringify(job);

  }



  const id = info.id;

  const node = id ? nodes.find(n => n.id === id) : null;

  if (node) {

    const roleStr = node.smelterRole ? ` [${node.smelterRole} pile]` : '';

    lines.push(`PILE: ${nodeLbl(node)}${roleStr}`);

    lines.push(`  id:       ${node.id}`);

    lines.push(`  template: ${node.templateId}`);

    lines.push(`  position: (${Math.round(node.x)}, ${Math.round(node.y)})`);

    lines.push(`  items:    ${node.items ?? 0}`);

    lines.push(`  scrap:    ${scrapStr(node.scrap)}`);

    if (node.smelterRole && node.smelterId) {

      const sm = smelters.find(s => s.id === node.smelterId);

      if (sm) lines.push(`  smelter:  ${node.smelterId} | state: ${sm.state} | processing: ${sm.processingType || 'none'} | progress: ${Math.round((sm.progress || 0) * 100)}%`);

    }

    const connRoutes = routes.filter(r => r.fromId === id || r.toId === id);

    lines.push(`\nCONNECTED ROUTES (${connRoutes.length})`);

    if (!connRoutes.length) { lines.push('  (none)'); }

    else connRoutes.forEach(r => {

      const dir = r.fromId === id ? '?' : '?';

      const other = r.fromId === id ? nodeLbl(nodes.find(n => n.id === r.toId)) : nodeLbl(nodes.find(n => n.id === r.fromId));

      const allowed = (r.allowedTypes || []).join(', ') || 'all';

      lines.push(`  ${dir} ${other} | workers: ${(r.workerIds||[]).length} | allowed: ${allowed} | id: ${r.id}`);

    });

    const servingWorkers = workers.filter(w => (w.jobs || []).some(j => {

      if (j.type !== 'route') return false;

      const r = routes.find(r => r.id === j.id);

      return r && (r.fromId === id || r.toId === id);

    }));

    lines.push(`\nWORKERS SERVING THIS PILE (${servingWorkers.length})`);

    if (!servingWorkers.length) { lines.push('  (none)'); }

    else servingWorkers.forEach(w => lines.push(`  ${workerLbl(w)} | state: ${w.state} | id: ${w.id}`));

    return lines.join('\n');

  }



  const worker = id ? workers.find(w => w.id === id) : null;

  if (worker) {

    lines.push(`WORKER: ${workerLbl(worker)}`);

    lines.push(`  id:        ${worker.id}`);

    lines.push(`  template:  ${worker.templateId}`);

    lines.push(`  state:     ${worker.state}`);

    lines.push(`  position:  (${Math.round(worker.x)}, ${Math.round(worker.y)})`);

    lines.push(`  capacity:  ${worker.capacity}`);

    lines.push(`  inventory: ${invStr(worker.inventory)}`);

    const jobs = worker.jobs || [];

    lines.push(`\nJOBS (${jobs.length})`);

    if (!jobs.length) { lines.push('  (idle — no jobs assigned)'); }

    else jobs.forEach((job, i) => lines.push(`  [${i === 0 ? 'active' : i}] ${jobStr(job)}`));

    return lines.join('\n');

  }



  const sm = id ? smelters.find(s => s.id === id) : null;

  if (sm) {

    lines.push(`SMELTER`);

    lines.push(`  id:          ${sm.id}`);

    lines.push(`  position:    (${Math.round(sm.x)}, ${Math.round(sm.y)})`);

    lines.push(`  state:       ${sm.state}`);

    lines.push(`  processing:  ${sm.processingType || 'none'}`);

    lines.push(`  progress:    ${Math.round((sm.progress || 0) * 100)}%`);

    const _smW = (sm.workerSlots || []).map(id => id ? workers.find(w => w.id === id) : null).find(Boolean) ?? null;

    const _smWName = _smW ? (palette.workers.find(t => t.id === _smW.templateId)?.name || _smW.id) : '(none)';

    lines.push(`  worker:      ${_smWName}`);

    const inNode = nodes.find(n => n.id === sm.inputNodeId);

    const outNode = nodes.find(n => n.id === sm.outputNodeId);

    lines.push(`\nINPUT PILE: ${sm.inputNodeId}`);

    if (inNode) {

      lines.push(`  items: ${inNode.items ?? 0} | scrap: ${scrapStr(inNode.scrap)}`);

      lines.push(`  routes: ${routes.filter(r => r.fromId === sm.inputNodeId || r.toId === sm.inputNodeId).length}`);

    }

    lines.push(`\nOUTPUT PILE: ${sm.outputNodeId}`);

    if (outNode) {

      lines.push(`  items: ${outNode.items ?? 0} | scrap: ${scrapStr(outNode.scrap)}`);

      lines.push(`  routes: ${routes.filter(r => r.fromId === sm.outputNodeId || r.toId === sm.outputNodeId).length}`);

    }

    return lines.join('\n');

  }



  const route = id ? routes.find(r => r.id === id) : null;

  if (route) {

    lines.push(`ROUTE`);

    lines.push(`  id:            ${route.id}`);

    lines.push(`  from:          ${nodeLbl(nodes.find(n => n.id === route.fromId))} (${route.fromId})`);

    lines.push(`  to:            ${nodeLbl(nodes.find(n => n.id === route.toId))} (${route.toId})`);

    lines.push(`  allowed types: ${(route.allowedTypes || []).join(', ') || 'all'}`);

    const wIds = route.workerIds || [];

    lines.push(`\nWORKERS (${wIds.length})`);

    if (!wIds.length) { lines.push('  (none assigned)'); }

    else wIds.forEach(wId => {

      const w = workers.find(w => w.id === wId);

      lines.push(w ? `  ${workerLbl(w)} | state: ${w.state} | id: ${wId}` : `  ${wId} (not found)`);

    });

    return lines.join('\n');

  }



  const gs = id ? groundScrap.find(g => g.id === id) : null;

  if (gs) {

    const scrapTpl = SCRAP_TYPES.find(t => t.id === gs.type);

    lines.push(`GROUND SCRAP: ${scrapTpl?.label || gs.type}`);

    lines.push(`  id:       ${gs.id}`);

    lines.push(`  position: (${Math.round(gs.x)}, ${Math.round(gs.y)})`);

    lines.push(`  rotation: ${Math.round(gs.rotation)}°`);

    return lines.join('\n');

  }



  const zone = id ? zones.find(z => z.id === id) : null;

  if (zone) {

    const pos = zonePos(zone);

    lines.push(`PAINT ZONE`);

    lines.push(`  id:      ${zone.id}`);

    lines.push(`  circles: ${zone.circles.length} (brush strokes)`);

    lines.push(`  center:  (${Math.round(pos.x)}, ${Math.round(pos.y)})`);

    return lines.join('\n');

  }



  lines.push(`CANVAS POSITION`);

  lines.push(`  world: (${Math.round(info.worldX)}, ${Math.round(info.worldY)})`);

  return lines.join('\n');

}



// --- Dialog ---

const _noteDlgOverlay = document.getElementById('note-dialog-overlay');



function openNoteDialog(info, allHits) {

  // Use elementId if known, otherwise fall back to a world-position key

  const noteKey = info.id || ('pos_' + Math.round(info.worldX) + '_' + Math.round(info.worldY));

  info = { ...info, id: noteKey };

  const existing = notes.find(n => n.elementId === noteKey);

  const kindLabel = [info.kind, info.name].filter(Boolean).join(' — ') || 'Canvas position';

  const capturedData = (() => {

    if (!allHits || allHits.length === 0) return captureElementContext(info);

    const layerOrder = ['Workers', 'Smelters', 'World Objects', 'Routes', 'Ground', 'Zones', 'UI (slots)', 'HUD (panels)', 'Routes (visual)'];

    const groups = {};

    for (const h of allHits) { const l = h.layer || 'Other'; (groups[l] = groups[l] || []).push(h); }

    const ordered = layerOrder.filter(l => groups[l]);

    for (const l of Object.keys(groups)) { if (!ordered.includes(l)) ordered.push(l); }

    return ordered.map(l =>

      `-- ${l} --\n` + groups[l].map(h => h._konvaText ?? captureElementContext(h.info)).join('\n\n')

    ).join('\n\n');

  })();

  document.getElementById('note-dlg-kind').textContent = kindLabel;

  document.getElementById('note-dlg-id').textContent   = info.id ? 'ID: ' + info.id : '';

  document.getElementById('note-dlg-data').textContent = capturedData;

  document.getElementById('note-dlg-text').value       = existing ? existing.text : '';

  document.getElementById('note-dlg-delete').style.display = existing ? '' : 'none';

  _noteDlgOverlay._info = info;

  _noteDlgOverlay._capturedData = capturedData;

  _noteDlgOverlay.hidden = false;

  document.getElementById('note-dlg-text').focus();

}

function closeNoteDialog() { _noteDlgOverlay.hidden = true; }



document.getElementById('note-dlg-save').addEventListener('click', () => {

  const info = _noteDlgOverlay._info;

  const text = document.getElementById('note-dlg-text').value.trim();

  if (!text) return;

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const idx = notes.findIndex(n => n.elementId === info.id);

  const entry = {

    elementId: info.id, elementName: info.name, elementKind: info.kind,

    text, worldX: info.worldX, worldY: info.worldY,

    capturedData: _noteDlgOverlay._capturedData || null,

    _createdAt: idx >= 0 ? notes[idx]._createdAt : now,

    _updatedAt: now,

  };

  if (idx >= 0) notes[idx] = entry; else notes.push(entry);

  saveNotes();

  closeNoteDialog();

  if (notesVisible) renderNotePins();

  renderNoteList();

});



document.getElementById('note-dlg-delete').addEventListener('click', () => {

  const info = _noteDlgOverlay._info;

  notes = notes.filter(n => n.elementId !== info.id);

  saveNotes();

  closeNoteDialog();

  if (notesVisible) renderNotePins();

  renderNoteList();

});



document.getElementById('note-dlg-cancel').addEventListener('click', closeNoteDialog);



document.getElementById('note-dlg-copy').addEventListener('click', () => {

  const text = document.getElementById('note-dlg-data').textContent;

  navigator.clipboard.writeText(text).then(() => {

    const btn = document.getElementById('note-dlg-copy');

    btn.textContent = 'Copied!';

    setTimeout(() => { btn.textContent = 'Copy text'; }, 1500);

  });

});



document.getElementById('note-dlg-text').addEventListener('keydown', e => {

  if (e.key === 'Escape') { e.stopPropagation(); closeNoteDialog(); }

  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) document.getElementById('note-dlg-save').click();

});



// Close dialog on overlay background click

_noteDlgOverlay.addEventListener('click', e => { if (e.target === _noteDlgOverlay) closeNoteDialog(); });



// Esc closes context menu and dialog

document.addEventListener('keydown', e => {

  if (e.key === 'Escape') {

    if (selectedWorker) { deselectWorker(); return; }

    hideNoteContextMenu(); closeNoteDialog();

  }

});



// --- Note pins (Konva, world-space, scale-compensated) ---

function renderNotePins() {

  noteLayer.destroyChildren();

  if (!notesVisible) { noteLayer.batchDraw(); return; }

  const sc = 1 / stage.scaleX();

  notes.forEach(note => {

    if (note.worldX == null || note.worldY == null) return;

    const grp = new Konva.Group({ x: note.worldX, y: note.worldY, listening: true });

    grp.add(new Konva.Circle({

      radius: 11 * sc, fill: '#e8c840', stroke: '#9a7d10', strokeWidth: 1.5 * sc, listening: false,

    }));

    grp.add(new Konva.Text({

      text: '??', fontSize: 12 * sc, offsetX: 6 * sc, offsetY: 7 * sc, listening: false,

    }));

    const tooltip = document.getElementById('note-tooltip');

    grp.on('mouseenter', e => {

      containerEl.style.cursor = 'pointer';

      tooltip.textContent = note.elementName + '\n' + note.text;

      tooltip.style.left = (e.evt.clientX + 14) + 'px';

      tooltip.style.top  = (e.evt.clientY - 14) + 'px';

      tooltip.hidden = false;

    });

    grp.on('mousemove', e => {

      tooltip.style.left = (e.evt.clientX + 14) + 'px';

      tooltip.style.top  = (e.evt.clientY - 14) + 'px';

    });

    grp.on('mouseleave', () => {

      containerEl.style.cursor = MODES[currentMode].cursor;

      tooltip.hidden = true;

    });

    grp.on('click', e => {

      e.cancelBubble = true;

      tooltip.hidden = true;

      const info = buildElementInfo(note.elementId, { x: note.worldX, y: note.worldY });

      openNoteDialog(info);

    });

    noteLayer.add(grp);

  });

  noteLayer.batchDraw();

}



// --- Toggle ---

function toggleNotes() {

  notesVisible = !notesVisible;

  renderNotePins();

}



// --- Note list panel ---

let noteListOpen = false;



function renderNoteList() {

  const panel = document.getElementById('note-list-panel');

  if (!noteListOpen) return;

  if (!notes.length) {

    panel.innerHTML = '<div class="note-list-empty">No notes yet.</div>';

    return;

  }

  panel.innerHTML = '';

  notes.forEach((note, idx) => {

    const item = document.createElement('div');

    item.className = 'note-list-item';

    const kindLabel = [note.elementKind, note.elementName].filter(Boolean).join(' — ') || note.elementId || 'Position';

    const info = document.createElement('div');

    info.className = 'note-list-item-info';

    info.title = note.text || '';

    info.innerHTML = `<div class="note-list-item-kind">${kindLabel}</div><div class="note-list-item-text">${note.text || '(no text)'}</div>`;

    info.addEventListener('click', () => {

      const ni = buildElementInfo(note.elementId, { x: note.worldX, y: note.worldY });

      openNoteDialog(ni);

    });

    const del = document.createElement('button');

    del.className = 'note-list-item-del';

    del.textContent = '?';

    del.title = 'Delete note';

    del.addEventListener('click', () => {

      notes = notes.filter(n => n.elementId !== note.elementId);

      saveNotes();

      if (notesVisible) renderNotePins();

      renderNoteList();

    });

    item.appendChild(info);

    item.appendChild(del);

    panel.appendChild(item);

  });

}



// Capture HUD button — snapshot whatever inspect panel is open into a note

document.getElementById('note-capture-btn').addEventListener('click', () => {

  const inspectPanel = document.getElementById('inspect-panel');

  if (inspectPanel && !inspectPanel.hidden && inspectTarget) {

    const { type, entity } = inspectTarget;

    let wx = 0, wy = 0;

    if (type === 'pile')   { wx = entity.x; wy = entity.y; }

    else if (type === 'worker') { wx = entity.x; wy = entity.y; }

    else if (type === 'route') {

      const fn = nodes.find(n => n.id === entity.fromId);

      const tn = nodes.find(n => n.id === entity.toId);

      wx = ((fn?.x ?? 0) + (tn?.x ?? 0)) / 2;

      wy = ((fn?.y ?? 0) + (tn?.y ?? 0)) / 2;

    }

    openNoteDialog(buildElementInfo(entity.id, { x: wx, y: wy }));

    return;

  }

  // Nothing recognized — flash the button

  const btn = document.getElementById('note-capture-btn');

  const orig = btn.textContent;

  btn.textContent = 'No HUD open';

  btn.style.color = '#c66';

  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1600);

});



document.getElementById('note-list-btn').addEventListener('click', () => {

  const panel = document.getElementById('note-list-panel');

  const btn = document.getElementById('note-list-btn');

  noteListOpen = !noteListOpen;

  btn.classList.toggle('active', noteListOpen);

  if (noteListOpen) {

    const notePanel = document.getElementById('note-panel');

    const r = notePanel.getBoundingClientRect();

    panel.style.top  = (r.bottom + 6) + 'px';

    panel.style.left = r.left + 'px';

    panel.hidden = false;

    renderNoteList();

  } else {

    panel.hidden = true;

  }

});





