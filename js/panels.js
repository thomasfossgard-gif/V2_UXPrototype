// ===== MODULE: panels.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== DELETE / CONFIRM DIALOG =====

let confirmEl = null;

function showConfirm(cx, cy, msg, onYes) {

  if (confirmEl) confirmEl.remove();

  confirmEl = document.createElement('div');

  confirmEl.id = 'confirm-dialog';

  confirmEl.style.left = Math.min(cx, window.innerWidth - 200) + 'px';

  confirmEl.style.top = Math.min(cy, window.innerHeight - 60) + 'px';

  confirmEl.innerHTML = msg + ' <button id="cy">Yes</button><button id="cn">No</button>';

  document.body.appendChild(confirmEl);

  document.getElementById('cy').onclick = () => { onYes(); closeConfirm(); };

  document.getElementById('cn').onclick = closeConfirm;

}

function closeConfirm() { if (confirmEl) { confirmEl.remove(); confirmEl = null; } }

document.addEventListener('mousedown', e => {

  if (confirmEl && !confirmEl.contains(e.target)) closeConfirm();

}, true);



function deleteNode(node) {

  if (node.smelterId) { deleteSmelter(smelters.find(s => s.id === node.smelterId)); return; }

  routes.filter(j => j.fromId === node.id || j.toId === node.id).slice().forEach(deleteRoute);

  nodes = nodes.filter(n => n.id !== node.id);

  _pileAnchors.delete(node.id);

  const g = nodeLayer.findOne('#' + node.id); if (g) g.destroy();

  nodeLayer.batchDraw();

  renderPalette();

}

function deleteRoute(route) {

  wakeAnimation();

  if (_filterPanel && _filterPanel.route.id === route.id) closeRouteFilter(false);

  exitRouteHover(route);

  for (const wid of (route.workerIds || [])) {

    const w = workers.find(x => x.id === wid);

    if (w) { w.jobs = w.jobs.filter(j => !(j.type === 'route' && j.id === route.id)); w.state = 'idle'; w.path = null; refreshWorkerJobPanel(w); }

  }

  (route._miniSlots || []).forEach(ms => { if (ms) ms.destroy(); });

  route._miniSlots = null;

  routes = routes.filter(j => j.id !== route.id);

  const g = edgeLayer.findOne('#' + route.id); if (g) g.destroy();

  const slot = uiLayer.findOne('#slot_' + route.id);

  if (slot) slot.destroy();

  refreshSlotLayout();

  edgeLayer.batchDraw();

  uiLayer.batchDraw();

}

function deleteWorker(w) {

  for (const job of (w.jobs || [])) {

    if (job.type === 'route') {

      const r = routes.find(j => j.id === job.id);

      if (r) { r.workerSlots = (r.workerSlots || [null,null,null,null]).map(s => s === w.id ? null : s); r.workerIds = r.workerSlots.filter(Boolean); refreshSlotPortrait(r); }

    } else if (job.type === 'smelter') {

      const sm = smelters.find(s => s.id === job.id);

      if (sm) { const oi = (sm.workerSlots || []).indexOf(w.id); if (oi !== -1) sm.workerSlots[oi] = null; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

    }

  }

  if (_proximityHoveredWorker === w) { _proximityHoveredWorker = null; }

  if (w._targetOuthouse) { const ot = w._targetOuthouse; if (ot.occupant === w) ot.occupant = null; ot.waiting = (ot.waiting || []).filter(x => x !== w); }

  workers = workers.filter(x => x.id !== w.id);

  const g = workerLayer.findOne('#' + w.id); if (g) g.destroy();

  workerLayer.batchDraw();

}



// ===== PROPERTY WINDOW =====

const propWin = document.getElementById('property-window');

propWin.querySelector('.close').onclick = () => { propWin.hidden = true; };

function openTemplateProps(tpl) {

  document.getElementById('prop-title').textContent = (tpl.kind === 'worker' ? 'Worker' : 'Pile') + ' Properties';

  const body = document.getElementById('prop-body');

  body.innerHTML = '';



  const r1 = document.createElement('div'); r1.className = 'row';

  const l1 = document.createElement('label'); l1.textContent = 'Color';

  const ci = document.createElement('input'); ci.type = 'color'; ci.value = tpl.color;

  ci.oninput = () => { tpl.color = ci.value; renderPalette(); refreshTemplateInstances(tpl); };

  r1.append(l1, ci); body.appendChild(r1);



  if (tpl.kind === 'worker') {

    const r2 = document.createElement('div'); r2.className = 'row';

    const l2 = document.createElement('label'); l2.textContent = 'Capacity';

    const ni = document.createElement('input'); ni.type = 'number'; ni.min = 1; ni.max = 20; ni.value = tpl.capacity;

    ni.oninput = () => { tpl.capacity = Math.max(1, parseInt(ni.value) || 1); renderPalette(); refreshTemplateInstances(tpl); };

    r2.append(l2, ni); body.appendChild(r2);

  }



  propWin.hidden = false;

}

function refreshTemplateInstances(tpl) {

  if (tpl.kind === 'worker') {

    workers.filter(w => w.templateId === tpl.id).forEach(w => {

      w.color = tpl.color; w.capacity = tpl.capacity;

      w.chipCount = tpl.chipCount ?? w.chipCount;

      w.speedMult = tpl.speedMult ?? 1;

      w.intelligenceSpeed = tpl.intelligenceSpeed ?? 1;

      w.description = tpl.description ?? w.description;

      const grp = workerLayer.findOne('#' + w.id);

      if (grp) {

        const ws = grp.findOne('.workercircle');

        ws.fill(tpl.color); ws.stroke(tpl.color);

      }

    });

    workerLayer.batchDraw();

  } else {

    nodes.filter(n => n.templateId === tpl.id).forEach(n => {

      n.color = tpl.color;

      const grp = nodeLayer.findOne('#' + n.id);

      if (grp) {

        const ns = grp.findOne('.nodeshape');

        ns.fill(tpl.color); ns.stroke(tpl.color);

      }

    });

    nodeLayer.batchDraw();

  }

}



// ===== INSPECT PANEL =====

let inspectTarget = null;



function openInspectPanel(type, entity, clientX, clientY) {

  inspectTarget = { type, entity };

  const panel = document.getElementById('inspect-panel');

  const title = document.getElementById('inspect-title');

  const idEl  = document.getElementById('inspect-id');

  const body  = document.getElementById('inspect-body');

  body.innerHTML = '';



  if (type === 'pile') {

    title.textContent = 'Pile';

    idEl.textContent  = 'ID: ' + entity.id + '  ·  pos ' + entity.x + ', ' + entity.y;



    if (SCRAP_TYPES.length) {

        const hdr = document.createElement('div');

        hdr.style.cssText = 'font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:700';

        hdr.textContent = 'Scrap contents';

        body.appendChild(hdr);

        SCRAP_TYPES.forEach(tpl => addInspectScrapRow(body, tpl, entity));

        const div = document.createElement('hr');

        div.className = 'inspect-divider';

        body.appendChild(div);

    }



    addInspectRow(body, 'Color', 'color', entity.color, null, null, v => {

      entity.color = v;

      const grp = nodeLayer.findOne('#' + entity.id);

      if (grp) {

        grp.findOne('.nodeshape').fill(v);

        grp.findOne('.nodeshape').stroke(v);

        nodeLayer.batchDraw();

      }

    });



  } else if (type === 'worker') {

    const tpl  = palette.workers.find(t => t.id === entity.templateId);

    const name = tpl?.name ?? '';

    title.textContent = 'Worker' + (name ? ' — ' + name[0].toUpperCase() + name.slice(1) : '');

    idEl.textContent  = 'ID: ' + entity.id;



    addInspectRow(body, 'Capacity', 'number', entity.capacity, 1, 20, v => {

      entity.capacity = v;

    

    });





  } else if (type === 'route') {

    title.textContent = 'Route';

    idEl.textContent  = entity.fromId + ' ? ' + entity.toId + '  ·  ID: ' + entity.id;

    addInspectRow(body, 'Max Workers', 'number', entity.maxWorkers ?? 4, 1, 4, v => {

      setRouteMaxWorkers(entity, Math.round(v));

    });



  } else if (type === 'smelter') {

    title.textContent = entity.name || 'Smelter';

    idEl.textContent = 'ID: ' + entity.id;

    const typeRow = document.createElement('div'); typeRow.className = 'inspect-row';
    const typeLabel = document.createElement('label'); typeLabel.textContent = 'Type';
    const typeSelect = document.createElement('select');
    [{ value: '', label: 'Generic' }, ...SCRAP_TYPES.filter(t => !isIngotType(t.id)).map(t => ({ value: t.id, label: t.label }))]
      .forEach(opt => { const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; if ((entity.smelterType ?? '') === opt.value) o.selected = true; typeSelect.appendChild(o); });
    typeSelect.addEventListener('change', () => { entity.smelterType = typeSelect.value || null; applySmelterTypeColors(entity); updateSmelterLabel(entity); });
    typeRow.appendChild(typeLabel); typeRow.appendChild(typeSelect); body.appendChild(typeRow);

    addInspectRow(body, 'Max Workers', 'number', entity.maxWorkers ?? 1, 1, 4, v => {

      setSmelterMaxWorkers(entity, Math.round(v));

    });



  }



  // Position near click, keeping inside viewport

  const W = 240, H = 180, M = 12;

  let px = clientX + M;

  let py = clientY + M;

  if (px + W > window.innerWidth)  px = clientX - W - M;

  if (py + H > window.innerHeight) py = clientY - H - M;

  panel.style.left = Math.max(M, px) + 'px';

  panel.style.top  = Math.max(M, py) + 'px';

  panel.hidden = false;

}



function addInspectRow(container, label, type, value, min, max, onChange) {

  const row = document.createElement('div');

  row.className = 'row';

  const lbl = document.createElement('label');

  lbl.textContent = label;

  const inp = document.createElement('input');

  inp.type  = type;

  inp.value = value;

  if (type === 'number') {

    if (min != null) inp.min = min;

    if (max != null) inp.max = max;

    inp.oninput = () => {

      const v = parseInt(inp.value);

      if (!isNaN(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)));

    };

  } else {

    inp.oninput = () => onChange(inp.value);

  }

  row.append(lbl, inp);

  container.appendChild(row);

  return inp;

}



function refreshNodeItems(node) {

  node.items = (node.scrap || []).length;

  const v = getEffectiveView();

  if ((v === 'ViewGhost' || v === 'ViewHoverReveal') && node.id === _hoveredNodeId) buildRevealGhosts();

}



function addInspectScrapRow(container, scrapTpl, pileNode) {

  const row = document.createElement('div');

  row.className = 'row';

  row.style.gap = '4px';



  const dot = document.createElement('div');

  dot.style.cssText = 'width:10px;height:10px;flex-shrink:0;clip-path:polygon(50% 4%,4% 96%,96% 96%);background:' + scrapTpl.color;



  const lbl = document.createElement('label');

  lbl.textContent = scrapTpl.label || scrapTpl.id;

  lbl.style.flex = '1';



  const btnStyle = 'width:22px;height:22px;background:#1a1d23;border:1px solid #444;color:#ccc;border-radius:3px;cursor:pointer;font-size:15px;line-height:1;padding:0;flex-shrink:0';

  const minus = document.createElement('button');

  minus.textContent = '-'; minus.style.cssText = btnStyle;

  const countEl = document.createElement('span');

  countEl.style.cssText = 'width:22px;text-align:center;font-size:12px;color:#fff;display:inline-block;flex-shrink:0';

  countEl.textContent = (pileNode.scrap || []).filter(p => p.type === scrapTpl.id).length;

  const plus = document.createElement('button');

  plus.textContent = '+'; plus.style.cssText = btnStyle;



  const update = delta => {

    if (!Array.isArray(pileNode.scrap)) pileNode.scrap = [];

    if (delta > 0) {

      pileNode.scrap.push({ type: scrapTpl.id });

    } else {

      const idx = pileNode.scrap.map(p => p.type).lastIndexOf(scrapTpl.id);

      if (idx !== -1) pileNode.scrap.splice(idx, 1);

    }

    countEl.textContent = pileNode.scrap.filter(p => p.type === scrapTpl.id).length;

    refreshNodeItems(pileNode);

    updateNodeStack(pileNode);

  };

  minus.onclick = () => update(-1);

  plus.onclick  = () => update(1);



  row.append(dot, lbl, minus, countEl, plus);

  container.appendChild(row);

}



function openRouteFilter(route) {

  hideFilterGhost(route);

  closeRouteFilter(false);

  const result = buildFilterPanelGroup(route, { ghost: false });

  if (!result) return;

  const { group, draft } = result;

  _filterPanel = { group, route, draft, painting: false, paintValue: null };

  uiLayer.add(group);

  uiLayer.batchDraw();

}



function reverseRoute(route) {

  wakeAnimation();

  const { fromId, toId, fromSide, toSide, fromSideManual, toSideManual } = route;

  route.fromId = toId; route.toId = fromId;

  route.fromSide = toSide; route.toSide = fromSide;

  route.fromSideManual = toSideManual; route.toSideManual = fromSideManual;

  (route.workerIds || []).forEach(wId => {

    const w = workers.find(x => x.id === wId); if (!w) return;

    w.state = 'idle'; w.path = null; w.inventory = {};

  });

  const _grp = edgeLayer.findOne('#' + route.id);

  if (_grp) {
    const _fromA = getRouteAnchor(route, route.fromId);
    const _toA   = getRouteAnchor(route, route.toId);
    const _fromCircle = _grp.findOne('.mini-anchor-from');
    const _toCircle   = _grp.findOne('.mini-anchor-to');
    if (_fromA && _fromCircle) { _fromCircle.position({ x: _fromA.x, y: _fromA.y }); _fromCircle.rotation(halfCircleRotationDeg(_fromA.side)); }
    if (_toA   && _toCircle)   { _toCircle.position({ x: _toA.x, y: _toA.y });       _toCircle.rotation(anchorRotationDeg(_toA.side, false)); }
    const _pd = routePathData(route);
    _grp.findOne('.routepath')?.data(_pd);
    _grp.findOne('.hover-hit-route')?.data(_pd);
  }

  if (getEffectiveView() === 'ViewHoverReveal') buildRevealGhosts();

  edgeLayer.batchDraw();

  uiLayer.batchDraw();

}



function closeRouteFilter(confirm) {

  if (!_filterPanel) return;

  const { group, route, draft } = _filterPanel;

  if (confirm) Object.assign(route.allowedTypes, draft);

  group.destroy();

  uiLayer.batchDraw();

  _filterPanel = null;

  exitRouteHover(route);

}



function closeInspectPanel() {

  const panel = document.getElementById('inspect-panel');

  if (panel) panel.hidden = true;

  inspectTarget = null;

}



// ===== HINT =====

function applyHintPosition() {

  const h = document.getElementById('hint'); if (!h) return;

  const V = VISUAL_STYLES.hintText;

  h.style.top = V.offsetY + 'px';

  h.style.marginLeft = V.offsetX + 'px';

}

applyHintPosition();

function hideHint() { document.getElementById('hint').style.display = 'none'; }



// ============================================================================

// FLASH UTILITIES

// Reusable timed visual effects driven by the animation loop.

//   singleFlash({ duration, onValue, onDone })   — value 1?0 linearly, then onDone, removed

//   lookAtMeFlash({ duration, onValue })         — sine pulse 0?0.5?0 (peaks 0.5), continuous,

//                                                  returns the entry; stop with stopFlash(entry)

// onValue receives the current "intensity" each tick — apply it to whichever shape property you want.

// ============================================================================

const activeFlashes = [];

function singleFlash(opts) {

  const f = {

    type: 'single',

    duration: opts.duration || 333,

    onValue: opts.onValue,

    onDone: opts.onDone,

    startTime: performance.now(),

  };

  activeFlashes.push(f);

  return f;

}

function lookAtMeFlash(opts) {

  const f = {

    type: 'loop',

    duration: opts.duration || 2000,

    onValue: opts.onValue,

    startTime: performance.now(),

  };

  activeFlashes.push(f);

  return f;

}

function stopFlash(entry) {

  const i = activeFlashes.indexOf(entry);

  if (i >= 0) activeFlashes.splice(i, 1);

}

function tickFlashes() {

  const now = performance.now();

  for (let i = activeFlashes.length - 1; i >= 0; i--) {

    const f = activeFlashes[i];

    const elapsed = now - f.startTime;

    if (f.type === 'single') {

      if (elapsed >= f.duration) {

        try { f.onValue(0); } catch (_) {}

        if (f.onDone) try { f.onDone(); } catch (_) {}

        activeFlashes.splice(i, 1);

      } else {

        try { f.onValue(1 - elapsed / f.duration); } catch (_) {}

      }

    } else if (f.type === 'loop') {

      const t = (elapsed % f.duration) / f.duration;

      const v = Math.sin(t * Math.PI) * 0.5; // 0 ? 0.5 ? 0 sine wave

      try { f.onValue(v); } catch (_) {}

    }

  }

}

function flashRouteCreated(route) {

  const grp = edgeLayer.findOne('#' + route.id); if (!grp) return;

  const ep = routeEndpoints(route); if (!ep) return;

  const overlay = new Konva.Path({

    data: routePathData(route),

    stroke: '#ffffff', strokeWidth: 14, lineCap: 'round', lineJoin: 'round',

    listening: false, opacity: 1, name: 'route-flash',

  });

  grp.add(overlay);

  singleFlash({

    duration: 333,

    onValue: v => overlay.opacity(v),

    onDone: () => overlay.destroy(),

  });

}



