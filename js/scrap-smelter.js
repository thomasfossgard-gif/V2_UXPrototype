// ===== MODULE: scrap-smelter.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== GROUND SCRAP =====

function drawGroundScrap(gs) {

  const t = SCRAP_TYPES.find(s => s.id === gs.type);

  const VGS = VISUAL_STYLES.groundScrap;

  const grp = new Konva.Group({ x: gs.x, y: gs.y, id: gs.id, rotation: isIngotType(gs.type) ? 0 : gs.rotation, name: 'ground-scrap' });

  grp.add(makeScrapShape(gs.type, {

    x: 0, y: 0, radius: VGS.radius,

    fill: t?.color || '#aaa',

    stroke: VGS.strokeColor, strokeWidth: VGS.strokeWidth,

    listening: true, name: 'ground-scrap-shape',

  }));

  grp.draggable(engineVisible);

  grp.on('mousedown', e => {

    if (currentMode === 'deleteMode') {

      e.cancelBubble = true;

      showConfirm(e.evt.clientX, e.evt.clientY, 'Remove scrap?', () => deleteGroundScrap(gs));

    }

  });

  grp.on('mouseenter', () => { if (engineVisible) stage.container().style.cursor = 'grab'; });

  grp.on('mouseleave', () => { stage.container().style.cursor = 'default'; });

  grp.on('dragstart', () => { stage.container().style.cursor = 'grabbing'; });

  grp.on('dragend', () => {

    const nx = snap(grp.x()), ny = snap(grp.y());

    grp.position({ x: nx, y: ny });

    gs.x = nx; gs.y = ny;

    nodeLayer.batchDraw();

    stage.container().style.cursor = engineVisible ? 'grab' : 'default';

  });

  nodeLayer.add(grp);

  grp.moveToBottom(); // render under piles

  nodeLayer.batchDraw();

}

function deleteGroundScrap(gs) {

  groundScrap = groundScrap.filter(s => s.id !== gs.id);

  nodeLayer.findOne('#' + gs.id)?.destroy();

  nodeLayer.batchDraw();

}

function placeGroundScrap(tpl, x, y) {

  const gs = { id: uid(), type: tpl.scrapType, x, y, rotation: Math.random() * 360 };

  groundScrap.push(gs);

  drawGroundScrap(gs);

}



// ===== SMELTER =====

function smelterSpacing() {

  const VB = VISUAL_STYLES.smelterBody, VP = VISUAL_STYLES.pileSquare;

  return VB.width / 2 + VP.size / 2 + VB.gap;

}

function placeSmelter(tpl, x, y) {

  const sp = smelterSpacing(), smId = uid();

  const inNode  = { id: uid(), kind: 'object', templateId: tpl.id, x: snap(x - sp), y: snap(y), color: VISUAL_STYLES.smelterInputPile.color,  items: 0, scrap: [], shape: 'rect', label: '', smelterId: smId, smelterRole: 'input'  };

  const outNode = { id: uid(), kind: 'object', templateId: tpl.id, x: snap(x + sp), y: snap(y), color: VISUAL_STYLES.smelterOutputPile.color, items: 0, scrap: [], shape: 'rect', label: '', smelterId: smId, smelterRole: 'output' };

  nodes.push(inNode, outNode);

  drawNode(inNode); drawNode(outNode);

  const sm = { id: smId, name: 'Smelter ' + (smelters.length + 1), x: snap(x), y: snap(y), inputNodeId: inNode.id, outputNodeId: outNode.id, state: 'idle', processingType: null, progress: 0, maxWorkers: 1, workerSlots: [null], smelterType: null };

  smelters.push(sm);

  drawSmelter(sm);

}

function updateSmelterLabel(sm) {
  const label = sm.smelterType ? (SCRAP_TYPES.find(t => t.id === sm.smelterType)?.label + ' Smelter') : 'Smelter';
  const fontSize = sm.smelterType ? 7 : 9;
  const text = nodeLayer.findOne('#' + sm.id)?.findOne('.smelter-label');
  if (!text) return;
  text.text(label); text.fontSize(fontSize); nodeLayer.batchDraw();
}

function applySmelterTypeColors(sm) {
  const scrapType = SCRAP_TYPES.find(t => t.id === sm.smelterType);
  const inColor  = scrapType ? scrapType.color : VISUAL_STYLES.smelterInputPile.color;
  const outColor = scrapType ? scrapType.color : VISUAL_STYLES.smelterOutputPile.color;
  [{ nodeId: sm.inputNodeId, color: inColor }, { nodeId: sm.outputNodeId, color: outColor }].forEach(({ nodeId, color }) => {
    const node = nodes.find(n => n.id === nodeId); if (!node) return;
    node.color = color;
    const shape = nodeLayer.findOne('#' + nodeId)?.findOne('.nodeshape'); if (!shape) return;
    shape.stroke(color); nodeLayer.batchDraw();
  });
}

function drawSmelter(sm) {

  const VB = VISUAL_STYLES.smelterBody;

  const VP = VISUAL_STYLES.pileSquare;

  const VL = VISUAL_STYLES.smelterLamp;

  const VSp = VISUAL_STYLES.smelterSpinner;

  const grp = new Konva.Group({ x: sm.x, y: sm.y, id: sm.id, name: 'smelter-body' });

  grp.add(new Konva.Rect({ x: -VB.width/2, y: -VB.height/2, width: VB.width, height: VB.height, fill: VB.color, stroke: VB.strokeColor, strokeWidth: VB.strokeWidth, cornerRadius: VB.cornerRadius, name: 'smelter-rect' }));

  grp.add(new Konva.Rect({ x: -VB.width/2 + 4, y: VB.height/2 - VB.progressHeight - 4, width: 0, height: VB.progressHeight, fill: VB.progressColor, cornerRadius: 2, name: 'smelter-progress' }));

  const smelterLabel = sm.smelterType ? (SCRAP_TYPES.find(t => t.id === sm.smelterType)?.label + ' Smelter') : 'Smelter';
  const smelterLabelSize = sm.smelterType ? 7 : 9;
  grp.add(new Konva.Text({ x: -VB.width/2, y: -VB.height/2 + 5, width: VB.width, text: smelterLabel, fontSize: smelterLabelSize, fontFamily: 'system-ui, sans-serif', fill: 'rgba(255,255,255,0.5)', align: 'center', listening: false, name: 'smelter-label' }));

  grp.add(new Konva.Circle({ x: -VB.width/2 + VL.radius + 3, y: 0, radius: VL.radius, fill: VL.offColor, stroke: VL.strokeColor, strokeWidth: VL.strokeWidth, listening: false, name: 'smelter-lamp-input' }));

  grp.add(new Konva.Circle({ x: 0, y: VB.height/2 - VL.radius - 3, radius: VL.radius, fill: VL.offColor, stroke: VL.strokeColor, strokeWidth: VL.strokeWidth, listening: false, name: 'smelter-lamp-op' }));

  grp.add(new Konva.Rect({ x: 0, y: 0, offsetX: VSp.length/2, offsetY: VSp.width/2, width: VSp.length, height: VSp.width, fill: VSp.color, cornerRadius: VSp.cornerRadius, listening: false, name: 'smelter-spinner' }));

  const VSt = VISUAL_STYLES.smelterStation;

  const stY = VB.height / 2 + VSt.offsetY;

  grp.add(new Konva.Rect({ x: -VSt.width/2, y: stY, width: VSt.width, height: VSt.height, fill: VSt.fill, cornerRadius: VSt.cornerRadius, name: 'smelter-station' }));

  grp.add(new Konva.Rect({ x: -VSt.width/2 + VSt.innerPad, y: stY + VSt.innerPad, width: VSt.width - VSt.innerPad*2, height: VSt.height - VSt.innerPad*2, fill: VSt.innerFill, stroke: VSt.innerStroke, strokeWidth: VSt.innerStrokeWidth, cornerRadius: VSt.innerCornerRadius, listening: false, name: 'smelter-station-inner' }));

  grp.on('mousedown', e => {

    if (currentMode === 'deleteMode') { e.cancelBubble = true; showConfirm(e.evt.clientX, e.evt.clientY, 'Delete smelter?', () => deleteSmelter(sm)); }

    else if (currentMode === 'inspectMode') { e.cancelBubble = true; openInspectPanel('smelter', sm, e.evt.clientX, e.evt.clientY); }

    else if (currentMode === 'gameInteract') { e.cancelBubble = true; startSmelterMove(sm, grp); }

  });

  let _smFocusPushed = false;

  grp.on('mouseenter.pilefocus', () => { if (!_smFocusPushed) { _smFocusPushed = true; enterPileFocus(); } });

  grp.on('mouseleave.pilefocus', () => { if (_smFocusPushed) { _smFocusPushed = false; leavePileFocus(); } });

  nodeLayer.add(grp);

  const inGrp  = nodeLayer.findOne('#' + sm.inputNodeId);

  const outGrp = nodeLayer.findOne('#' + sm.outputNodeId);

  const pileLabel = (pGrp, text) => {

    if (!pGrp) return;

    pGrp.add(new Konva.Text({ x: -VP.size/2, y: -VP.size/2 + 5, width: VP.size, text, fontSize: 9, fontFamily: 'system-ui, sans-serif', fill: 'rgba(255,255,255,0.5)', align: 'center', listening: false }));

  };

  pileLabel(inGrp, 'Input');

  pileLabel(outGrp, 'Output');

  nodeLayer.batchDraw();

  drawSmelterSlot(sm);

  [grp, inGrp, outGrp].forEach(g => {

    if (!g) return;

    g.on('mouseenter.smelterslot', () => { clearTimeout(sm._hoverLeaveTimer); showSmelterSlot(sm); });

    g.on('mouseleave.smelterslot', () => { sm._hoverLeaveTimer = setTimeout(() => hideSmelterSlot(sm), 80); });

  });

}

function updateSmelterLamps(sm) {

  const grp = nodeLayer.findOne('#' + sm.id); if (!grp) return;

  const VL = VISUAL_STYLES.smelterLamp;

  const inp = nodes.find(n => n.id === sm.inputNodeId);

  const scrapCount = inp ? (inp.scrap || []).filter(s => !isIngotType(s.type) && (!sm.smelterType || s.type === sm.smelterType)).length : 0;

  const smWorker = (sm.workerSlots || []).map(id => id ? workers.find(w => w.id === id) : null).find(Boolean) ?? null;

  const atSmelter = smWorker?.state === 'at_smelter';

  const lampKey = scrapCount + '|' + atSmelter + '|' + (sm.smelterType || '');

  if (sm._lampKey === lampKey) return;

  sm._lampKey = lampKey;

  const inputLamp = grp.findOne('.smelter-lamp-input');

  if (inputLamp) {

    if (scrapCount === 0) inputLamp.fill(VL.offColor);

    else if (scrapCount < SMELTER_PARAMS.ingotCost) inputLamp.fill(VL.someColor);

    else inputLamp.fill(VL.readyColor);

  }

  const opLamp = grp.findOne('.smelter-lamp-op');

  if (opLamp) opLamp.fill(atSmelter ? VL.activeColor : VL.offColor);

  nodeLayer.batchDraw();

}

function updateSmelterProgress(sm) {

  const grp = nodeLayer.findOne('#' + sm.id); if (!grp) return;

  const bar = grp.findOne('.smelter-progress');

  if (bar) { bar.width(sm.state === 'processing' ? sm.progress * (VISUAL_STYLES.smelterBody.width - 8) : 0); nodeLayer.batchDraw(); }

}

function showSmelterSlot(sm) {

  if (sm._hoverViewActive) return;

  _enterSlotHover();

  sm._hoverViewActive = true;

  const grp = uiLayer.findOne('#slot_sm_' + sm.id); if (!grp) return;

  const VG = VISUAL_STYLES.ghostFade;

  [grp.findOne('.slot-rect'), grp.findOne('.slot-chip-grid')].forEach(n => {

    if (!n) return;

    if (!n.visible()) { n.opacity(0); n.visible(true); }

    fadeNode(n, 1, VG.inMs);

  });

  uiLayer.batchDraw();

}

function hideSmelterSlot(sm) {

  if (!sm._hoverViewActive) return;

  sm._hoverViewActive = false;

  _exitSlotHover();

  const v = getEffectiveView();

  if (v === 'ViewGhost' || v === 'ViewHoverReveal') return;

  const grp = uiLayer.findOne('#slot_sm_' + sm.id); if (!grp) return;

  const VG = VISUAL_STYLES.ghostFade;

  [grp.findOne('.slot-rect'), grp.findOne('.slot-chip-grid')].forEach(n => {

    if (n?.visible()) fadeNode(n, 0, VG.outMs, () => { n.visible(false); uiLayer.batchDraw(); });

  });

}

function smelterSlotPos(sm) {

  const VB = VISUAL_STYLES.smelterBody, VSR = VISUAL_STYLES.slotRect;

  return { x: sm.x, y: sm.y + VB.height / 2 + VSR.size / 2 + 8 };

}

function startSlotChipDragGeneric(w, sourceGrp, savedChipNum, savedSlotIdx) {

  showLiftDim();

  pushTransientMode('liftWorker');

  const dl = _ensureDragLayer();

  const VC = VISUAL_STYLES.chip;

  const startP = getWorldPointer() || { x: sourceGrp.x(), y: sourceGrp.y() };

  const dragChip = _makeChip(1, w.color, savedChipNum);

  dragChip.x(startP.x); dragChip.y(startP.y);

  dl.add(dragChip);

  const trail = new Konva.Path({

    stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, dash: [8, 6], dashOffset: routeDashOffset,

    lineCap: 'butt', lineJoin: 'round', opacity: 0.85, listening: false, name: 'drag-trail',

  });

  dl.add(trail);

  let _snapSlot = null, _prevSnapSlot = null;

  const hl = slot2 => {

    if (slot2 === _prevSnapSlot) return;

    if (_prevSnapSlot?.routeRef) { _prevSnapSlot.routeRef._liftHover = false; _prevSnapSlot.routeRef._liftHoverSlot = undefined; refreshSlotPortrait(_prevSnapSlot.routeRef); }

    if (_prevSnapSlot?.smelterRef) { _prevSnapSlot.smelterRef._liftHover = false; refreshSmelterSlot(_prevSnapSlot.smelterRef); }

    _prevSnapSlot = slot2;

    if (slot2?.routeRef) { slot2.routeRef._liftHover = true; slot2.routeRef._liftHoverSlot = slot2.slotIndex; refreshSlotPortrait(slot2.routeRef); }

    if (slot2?.smelterRef) { slot2.smelterRef._liftHover = true; refreshSmelterSlot(slot2.smelterRef); }

  };

  const onMove = () => {

    const wp = getWorldPointer(); if (!wp) return;

    dragChip.x(wp.x); dragChip.y(wp.y);

    const sx = sourceGrp.x(), sy = sourceGrp.y(), dx = wp.x - sx, dy = wp.y - sy, len = Math.hypot(dx, dy);

    trail.data(len < 2 ? `M ${sx} ${sy}` : (() => {

      const mx = (sx + wp.x) / 2, my = (sy + wp.y) / 2, curve = Math.min(len * 0.25, 48);

      return `M ${sx} ${sy} Q ${mx - dy/len*curve} ${my - Math.abs(dx)/len*curve} ${wp.x} ${wp.y}`;

    })());

    const vs = uiLayer.find('.slot').filter(s => s.findOne('Rect')?.isVisible());

    let best = null, bd2 = 50 * 50;

    for (const s of vs) { const sdx = s.x() - wp.x, sdy = s.y() - wp.y; if (sdx*sdx + sdy*sdy < bd2) { bd2 = sdx*sdx + sdy*sdy; best = s; } }

    _snapSlot = best; hl(best); uiLayer.batchDraw(); dl.batchDraw();

  };

  const onUp = () => {

    stage.off('mousemove.slotchipdrag'); stage.off('mouseup.slotchipdrag');

    trail.destroy(); dragChip.destroy();

    hideLiftDim(); hl(null); popTransientMode(); while (pileFocusDepth > 0) leavePileFocus(); routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });

    const srcX = sourceGrp.x(), srcY = sourceGrp.y();

    const _afterThrow = () => { refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow(); updateWorkerVisual(w); uiLayer.batchDraw(); workerLayer.batchDraw(); };

    if (_snapSlot?.smelterRef) {

      const sm = _snapSlot.smelterRef;

      const _smSlotIdx = _snapSlot.slotIndex ?? 0;

      throwChip(srcX, srcY, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), srcX, srcY, w.color); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

        if (!sm.workerSlots[_smSlotIdx]) {

          const oldSm2 = w.jobs.find(j => j.type === 'smelter');

          if (oldSm2) { const osm = smelters.find(s => s.id === oldSm2.id); if (osm) { const oi = (osm.workerSlots || []).indexOf(w.id); if (oi !== -1) osm.workerSlots[oi] = null; refreshSmelterSlot(osm); updateSmelterLamps(osm); } w.jobs = w.jobs.filter(j => j !== oldSm2); }

          sm.workerSlots[_smSlotIdx] = w.id; w.jobs.push({ type: 'smelter', id: sm.id, chipNum: savedChipNum });

          w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSmelterSlot(sm); updateSmelterLamps(sm); workerSay(w, 'On the job!'); _afterThrow();

        } else { returnChip(_snapSlot.x(), _snapSlot.y(), srcX, srcY, w.color); }

      }); return;

    } else if (_snapSlot?.routeRef) {

      const ch = _snapSlot.routeRef, slotIdx = _snapSlot.slotIndex ?? 0;

      const _preDisp = ch.workerSlots[slotIdx];

      const _workerAlreadyInRoute = ch.workerSlots.includes(w.id) && ch.workerSlots[slotIdx] !== w.id;
      const _dw2 = (_preDisp && !_workerAlreadyInRoute) ? workers.find(wk => wk.id === _preDisp) : null;

      if (_dw2) { const _ex = _snapSlot.x(), _ey = _snapSlot.y(), _dx = _dw2.x, _dy = _dw2.y; setTimeout(() => returnChip(_ex, _ey, _dx, _dy, _dw2.color), 150); }
      if (_workerAlreadyInRoute) { const _ei = ch.workerSlots.indexOf(w.id); const _es = ch._miniSlots?.[_ei]; if (_es) setTimeout(() => throwChip(_es.x(), _es.y(), srcX, srcY, w.color, null), 150); }

      throwChip(srcX, srcY, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), srcX, srcY, w.color); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

        if (ch.workerSlots.includes(w.id) && ch.workerSlots[slotIdx] !== w.id) {
          const myExistingJob = w.jobs.find(j => j.type === 'route' && j.id === ch.id);
          if (myExistingJob) {
            const oldChipNum = myExistingJob.chipNum;
            myExistingJob.chipNum = savedChipNum;
            const srcRoute = sourceGrp?.routeRef;
            if (srcRoute && savedSlotIdx !== undefined && srcRoute.workerSlots[savedSlotIdx] === null) {
              srcRoute.workerSlots[savedSlotIdx] = w.id;
              srcRoute.workerIds = srcRoute.workerSlots.filter(Boolean);
              w.jobs.push({ type: 'route', id: srcRoute.id, chipNum: oldChipNum });
              refreshSlotPortrait(srcRoute);
            }
            w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;
            refreshSlotPortrait(ch);
            refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow();
            workerSay(w, 'Swapped!'); _afterThrow(); return true;
          }
          returnChip(_snapSlot.x(), _snapSlot.y(), srcX, srcY, w.color); return;
        }

        const displaced = ch.workerSlots[slotIdx];

        if (displaced) {

          const dw = workers.find(wk => wk.id === displaced);

          if (dw) {

            const _dwChipNum = dw.jobs.find(j => j.type === 'route' && j.id === ch.id)?.chipNum;

            dw.jobs = dw.jobs.filter(j => !(j.type === 'route' && j.id === ch.id));

            const srcRoute = sourceGrp?.routeRef;

            if (srcRoute && savedSlotIdx !== undefined && srcRoute.workerSlots[savedSlotIdx] === null) {

              srcRoute.workerSlots[savedSlotIdx] = dw.id;

              srcRoute.workerIds = srcRoute.workerSlots.filter(Boolean);

              dw.jobs.push({ type: 'route', id: srcRoute.id, chipNum: _dwChipNum });

              refreshSlotPortrait(srcRoute);

            } else {

              dw.state = 'idle'; dw.path = null;

            }

            refreshWorkerJobPanel(dw); if (dw._refreshChipRow) dw._refreshChipRow();

          }

        }

        ch.workerSlots[slotIdx] = w.id;

        ch.workerIds = ch.workerSlots.filter(Boolean);

        w.jobs.push({ type: 'route', id: ch.id, chipNum: savedChipNum });

        w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

        refreshSlotPortrait(ch); holdRouteView(ch.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); workerSay(w, 'Back to work!'); _afterThrow(); return true;

      }); return;

    } else {

      const wp2 = getWorldPointer();

      if (wp2) {

        const destX = snap(wp2.x), destY = snap(wp2.y);

        throwChip(srcX, srcY, destX, destY, w.color, () => {

          if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(destX, destY, srcX, srcY, w.color); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

          const moveJob = { type: 'move', id: uid(), x: destX, y: destY, chipNum: savedChipNum };

          w.jobs.push(moveJob);

          createGroundChipToken(w, moveJob);

          updateGroundChipNumbers(w);

          workerSay(w, 'On my way!'); _afterThrow();

        }); return;

      }

      // Snap-back: restore to original slot position

      if (sourceGrp.routeRef && savedSlotIdx !== undefined) {

        const r = sourceGrp.routeRef;

        r.workerSlots[savedSlotIdx] = w.id;

        r.workerIds = r.workerSlots.filter(Boolean);

        w.jobs.push({ type: 'route', id: r.id, chipNum: savedChipNum });

        refreshSlotPortrait(r);

      }

    }

    _afterThrow();

  };

  stage.on('mousemove.slotchipdrag', onMove);

  stage.on('mouseup.slotchipdrag', onUp);

}

function drawSmelterSlot(sm) {

  uiLayer.findOne('#slot_sm_' + sm.id)?.destroy();

  const pos = smelterSlotPos(sm);

  const grp = new Konva.Group({ id: 'slot_sm_' + sm.id, name: 'slot', x: pos.x, y: pos.y });

  grp.smelterRef = sm;

  const VSR = VISUAL_STYLES.slotRect;

  const slotHalf = VSR.size / 2;

  const slot = new Konva.Rect({

    x: -slotHalf, y: -slotHalf, width: VSR.size, height: VSR.size, cornerRadius: VSR.cornerRadius,

    stroke: VSR.strokeColor, strokeWidth: VSR.strokeWidth,

    fill: VSR.fill, visible: true, name: 'slot-rect',

  });

  const chipGrid = createSlotChipGrid(sm.maxWorkers ?? 1);

  // Per-chip mousedown handlers for lifting workers out

  for (let _ci = 0; _ci < (sm.maxWorkers ?? 1); _ci++) {

    const _slotIdx = _ci;

    chipGrid.findOne('.slot-chip-' + _ci)?.on('mousedown', e => {

      if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

      const wId = (sm.workerSlots || [])[_slotIdx];

      const w = wId ? workers.find(x => x.id === wId) : null; if (!w) return;

      e.cancelBubble = true;

      const _savedNum = w.jobs.find(j => j.type === 'smelter' && j.id === sm.id)?.chipNum;

      sm.workerSlots[_slotIdx] = null;

      w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === sm.id));

      w.state = 'idle'; w.path = null;

      refreshSmelterSlot(sm); updateSmelterLamps(sm);

      refreshWorkerJobPanel(w);

      if (w._refreshChipRow) w._refreshChipRow();

      startSlotChipDragGeneric(w, grp, _savedNum, _slotIdx);

    });

  }


  grp.on('mouseenter.smelterslot', () => { clearTimeout(sm._hoverLeaveTimer); showSmelterSlot(sm); });

  grp.on('mouseleave.smelterslot', () => { sm._hoverLeaveTimer = setTimeout(() => hideSmelterSlot(sm), 80); });

  grp.add(slot, chipGrid);

  uiLayer.add(grp);

  // Mini-slots: individual snap targets, one per chip position

  const VC2 = VISUAL_STYLES.chip;

  const VSR2 = VISUAL_STYLES.slotRect;

  const _mScale = VISUAL_STYLES.chipSlot.scale ?? 0.85;

  const _mHW = ((VC2.badgeWidth ?? 20) * _mScale) / 2;

  const _mHH = ((VC2.height ?? 20) * _mScale) / 2;

  const _cpOff = _slotPositions(sm.maxWorkers ?? 1, VSR2.slotChipSpreadX, VSR2.slotChipSpreadY);

  sm._miniSlots = _cpOff.map((off, i) => {

    const ms = new Konva.Group({ name: 'slot', x: pos.x + off[0], y: pos.y + off[1], visible: true, listening: true });

    ms.add(new Konva.Rect({ x: -_mHW, y: -_mHH, width: _mHW * 2, height: _mHH * 2, fill: 'transparent' }));

    ms.smelterRef = sm;

    ms.slotIndex = i;

    ms.on('mouseenter', () => { clearTimeout(sm._hoverLeaveTimer); showSmelterSlot(sm); });

    ms.on('mouseleave', () => { sm._hoverLeaveTimer = setTimeout(() => hideSmelterSlot(sm), 80); });

    ms.on('mousedown', e => {

      if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

      const wId = (sm.workerSlots || [])[i]; if (!wId) return;

      e.cancelBubble = true;

      const w = workers.find(x => x.id === wId); if (!w) return;

      const _savedNum = w.jobs.find(j => j.type === 'smelter' && j.id === sm.id)?.chipNum;

      sm.workerSlots[i] = null;

      w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === sm.id));

      w.state = 'idle'; w.path = null;

      refreshSmelterSlot(sm); updateSmelterLamps(sm);

      refreshWorkerJobPanel(w);

      if (w._refreshChipRow) w._refreshChipRow();

      startSlotChipDragGeneric(w, grp, _savedNum, i);

    });

    ms.on('contextmenu', e => {

      if (currentMode !== 'gameInteract') return;

      e.cancelBubble = true;

      const wId = (sm.workerSlots || [])[i]; if (!wId) return;

      const w = workers.find(x => x.id === wId); if (!w) return;

      sm.workerSlots[i] = null;

      w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === sm.id));

      w.state = 'idle'; w.path = null; w.inventory = {};

      refreshSmelterSlot(sm); updateSmelterLamps(sm);

      refreshWorkerJobPanel(w);

      if (w._refreshChipRow) w._refreshChipRow();

      returnChip(grp.x(), grp.y(), w.x, w.y, w.color);

    });

    uiLayer.add(ms);

    return ms;

  });

  refreshSmelterSlot(sm);

}

function refreshSmelterSlot(sm) {

  const grp = uiLayer.findOne('#slot_sm_' + sm.id); if (!grp) return;

  const VSR = VISUAL_STYLES.slotRect;

  const slotRect = grp.findOne('.slot-rect');

  const slots = sm.workerSlots || [null];

  const occupied = slots.some(Boolean);

  const chipGrid = grp.findOne('.slot-chip-grid');

  if (chipGrid) {

    chipGrid.visible(true);

    const colors = Array(sm.maxWorkers ?? 1).fill(null);

    const nums = Array(sm.maxWorkers ?? 1).fill(null);

    slots.forEach((id, i) => {

      const wk = workers.find(x => x.id === id);

      if (wk) {

        colors[i] = wk.color;

        const ji = wk.jobs.findIndex(j => j.type === 'smelter' && j.id === sm.id);

        nums[i] = ji >= 0 ? (wk.jobs[ji]?.chipNum ?? null) : null;

      }

    });

    if (sm._liftHover) {

      const hi = colors.findIndex(c => !c);

      if (hi !== -1) colors[hi] = 'rgba(255,255,255,0.45)';

    } else if (currentMode === 'liftWorker') { const ni = colors.findIndex(c => !c); if (ni !== -1) colors[ni] = 'rgba(255,255,255,0.15)'; }

    const visible = _visibleSlotCount(sm);

    applyChipGrid(chipGrid, colors.slice(0, visible), nums.slice(0, visible));

    // Progressive display

    chipGrid.children.forEach(child => {

      if (/^slot-chip-\d+$/.test(child.name())) {

        const idx = parseInt(child.name().replace('slot-chip-', ''));

        child.visible(idx < visible);

      }

    });

    // Large-mode chip resize

    const _smLMVSR = VISUAL_STYLES.slotRect;

    const _smLMVCC = VISUAL_STYLES.chip;

    const _smLMVCS = VISUAL_STYLES.chipSlot;

    const _smLMLarge = _slotIsLargeMode(sm);

    const _smLMLargeW = (_smLMVSR.size ?? 40) - 4;

    const _smLMNormW = (_smLMVCC.badgeWidth ?? 20) * (_smLMVCS.scale ?? 0.85);

    const _smLMChipW = _smLMLarge ? _smLMLargeW : _smLMNormW;

    const _smLMSX = _smLMVSR.slotChipSpreadX ?? 9, _smLMSY = _smLMVSR.slotChipSpreadY ?? 9;

    const _smLMPositions = _smLMLarge ? [[0, 0]] :

      [[-_smLMSX, -_smLMSY], [_smLMSX, -_smLMSY], [-_smLMSX, _smLMSY], [_smLMSX, _smLMSY]].slice(0, visible);

    chipGrid.children.forEach(child => {

      if (!/^slot-chip-\d+$/.test(child.name())) return;

      const _smLMIdx = parseInt(child.name().replace('slot-chip-', ''));

      if (_smLMIdx >= _smLMPositions.length) return;

      const [_smLMPx, _smLMPy] = _smLMPositions[_smLMIdx];

      child.x(_smLMPx - _smLMChipW / 2); child.y(_smLMPy - _smLMChipW / 2);

      child.width(_smLMChipW); child.height(_smLMChipW);

      const _smLMLbl = chipGrid.findOne('.slot-chip-num-' + _smLMIdx);

      if (_smLMLbl) {

        const _smLMBase = _smLMVCC.numFontSize ?? 8;

        _smLMLbl.fontSize(_smLMLarge ? Math.round(_smLMBase * _smLMLargeW / _smLMNormW) : _smLMBase);

        _smLMLbl.x(_smLMLarge ? 0 : (_smLMPx + (_smLMVCC.numOffsetX ?? 0)));

        _smLMLbl.y(_smLMLarge ? (_smLMVCC.numOffsetYLarge ?? 0) : (_smLMPy + (_smLMVCC.numOffsetY ?? 0)));

        _smLMLbl.offsetX(_smLMLbl.width() / 2); _smLMLbl.offsetY(_smLMLbl.height() / 2);

      }

    });

    // Sync mini-slot snap targets (smelters always visible, not toggled by _routeSlotsVisible)

    (sm._miniSlots || []).forEach((ms, i) => {

      const show = i < visible;

      if (!ms) return;

      ms.visible(show); ms.listening(show);

      const _smMsRect = ms.findOne('Rect');

      if (_smMsRect) {

        const _smMsHW = _smLMLarge ? (_smLMLargeW / 2 + 1) : _smLMNormW / 2;

        _smMsRect.x(-_smMsHW); _smMsRect.y(-_smMsHW); _smMsRect.width(_smMsHW * 2); _smMsRect.height(_smMsHW * 2);

      }

    });

  }

  uiLayer.batchDraw();

}

function workerReturnToSmelterSlot(w, sm) {

  const sa = smelterSlotPos(sm);

  const dx = sa.x - w.x, dy = sa.y - w.y;

  if (dx * dx + dy * dy < 4) { w.state = 'at_smelter'; return; }

  const path = findPathAStar(w.x, w.y, sa.x, sa.y, []);

  if (path) { w.path = path; w.pathIdx = 0; w.state = 'to_smelter'; }

  else { w.state = 'at_smelter'; }

}

function dropWorkerInventory(w) {

  if (!w.inventory) return;

  Object.entries(w.inventory).forEach(([type, count]) => {

    for (let i = 0; i < count; i++) {

      const gs = { id: uid(), type, x: w.x + (Math.random() - 0.5) * 10, y: w.y + (Math.random() - 0.5) * 10, rotation: Math.random() * 360 };

      groundScrap.push(gs);

      drawGroundScrap(gs);

    }

  });

  w.inventory = {};

}

function deleteSmelter(sm) {

  (sm.workerSlots || []).forEach(wId => {

    if (!wId) return;

    const w = workers.find(x => x.id === wId);

    if (w) { w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === sm.id)); w.state = 'idle'; refreshWorkerJobPanel(w); }

  });

  const inp = nodes.find(n => n.id === sm.inputNodeId);

  const out = nodes.find(n => n.id === sm.outputNodeId);

  if (inp) deleteNode(inp);

  if (out) deleteNode(out);

  smelters = smelters.filter(s => s.id !== sm.id);

  nodeLayer.findOne('#' + sm.id)?.destroy();

  uiLayer.findOne('#slot_sm_' + sm.id)?.destroy();

  nodeLayer.batchDraw();

  uiLayer.batchDraw();

}

function startSmelterMove(sm, grp) {

  if (!engineVisible) return;

  const inp = nodes.find(n => n.id === sm.inputNodeId);

  const out = nodes.find(n => n.id === sm.outputNodeId);

  const inGrp  = inp ? nodeLayer.findOne('#' + inp.id)  : null;

  const outGrp = out ? nodeLayer.findOne('#' + out.id)  : null;

  const slotGrp = uiLayer.findOne('#slot_sm_' + sm.id);

  const sp = smelterSpacing();

  const onMove = () => {

    const p = getWorldPointer(); if (!p) return;

    sm.x = snap(p.x); sm.y = snap(p.y);

    grp.position({ x: sm.x, y: sm.y });

    if (slotGrp) { const sp2 = smelterSlotPos(sm); slotGrp.position({ x: sp2.x, y: sp2.y }); }

    if (inp  && inGrp)  { inp.x  = snap(p.x - sp); inp.y  = snap(p.y); inGrp.position({  x: inp.x, y: inp.y }); redrawRoutesTouching(inp.id);  }

    if (out  && outGrp) { out.x  = snap(p.x + sp); out.y  = snap(p.y); outGrp.position({ x: out.x, y: out.y }); redrawRoutesTouching(out.id); }

    nodeLayer.batchDraw();

  };

  stage.on('mousemove.nodedrag', onMove);

  stage.on('mouseup.nodedrag', () => { stage.off('mousemove.nodedrag'); stage.off('mouseup.nodedrag'); });

}



