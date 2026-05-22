// ===== MODULE: workers-place.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== PLACE / DRAW WORKERS =====

function placeWorker(tpl, x, y) {

  const w = {

    id: uid(), templateId: tpl.id, color: tpl.color, capacity: tpl.capacity,

    chipCount: tpl.chipCount ?? 1,

    speedMult: tpl.speedMult ?? 1, intelligenceSpeed: tpl.intelligenceSpeed ?? 1,

    description: tpl.description ?? 'I am ' + (tpl.name ?? ''),

    thirstRate: tpl.thirstRate ?? 3,

    x: x, y: y, jobs: [], inventory: {}, thirst: 0, bladder: 0,

    autoMode: false,

    state: 'idle', path: null, pathIdx: 0,

    targetX: null, targetY: null,

    states: { lifting: false },

  };

  workers.push(w);

  drawWorker(w);

  hideHint();

}

function drawWorker(w) {

  const tpl = palette.workers.find(t => t.id === w.templateId);

  const name = tpl?.name ?? '';

  const displayName = name ? name[0].toUpperCase() + name.slice(1) : '';



  const VW = VISUAL_STYLES.worker, VC = VISUAL_STYLES.carryIndicator;

  const VT = VISUAL_STYLES.trafficLightMan;



  // Figure geometry (group centered at 0,0)

  const _headCY   = VT.headOffsetY + VT.headRadius;

  const _torsoTop = _headCY + VT.headRadius + VT.neckGap;

  const _legsTop  = _torsoTop + VT.torsoHeight + VT.legGap;

  const _totalH   = _legsTop + VT.legHeight;

  const figHalfW  = VT.torsoWidth / 2 + VT.armGap + VT.armWidth;

  const figHalfH  = _totalH / 2;

  const headTopY  = VT.headOffsetY - figHalfH;



  const grp = new Konva.Group({ x: w.x, y: w.y, id: w.id, name: 'worker' });



  // Selection blob — flattened ellipse at feet, rendered behind everything

  const VS = VISUAL_STYLES.workerSelection;

  const selBlob = new Konva.Ellipse({

    name: 'selection-blob',

    x: 0, y: VS.offsetY,

    radiusX: VS.radiusX, radiusY: VS.radiusY,

    fill: VS.color, opacity: VS.opacity,

    stroke: VS.strokeColor, strokeWidth: VS.strokeWidth,

    visible: false, listening: false,

  });

  grp.add(selBlob);



  // Traffic-light figure — listening: false, mouse passes through to hitboxes

  const figure = makeTrafficLightKonva(tpl?.color || '#888');

  figure.listening(false);

  grp.add(figure);



  const ringPad = VISUAL_STYLES.hitboxWorker.padX;

  const ringPadY = VISUAL_STYLES.hitboxWorker.padY;

  const ringOffsetY = VISUAL_STYLES.hitboxWorker.offsetY ?? 0;



  // Carry stack — dynamically rebuilt by updateWorkerVisual on each inventory change

  const carry = new Konva.Group({ y: VC.offsetY, name: 'carry', listening: false });

  grp.add(carry);



  if (displayName) {

    const label = new Konva.Text({

      text: displayName, fontSize: VW.labelFontSize, fontFamily: 'system-ui, sans-serif',

      fill: VW.labelColor, y: figHalfH + VW.labelOffsetY, listening: false, name: 'workerlabel',

    });

    label.x(-label.width() / 2);

    grp.add(label);

  }



  // Body hitbox — covers full figure, handles hover + click-to-select

  const bodyHitbox = new Konva.Rect({

    x: -(figHalfW + ringPad), y: -(figHalfH + ringPadY) + ringOffsetY,

    width: (figHalfW + ringPad) * 2, height: _totalH + ringPadY * 2,

    fill: 'rgba(0,0,0,0.001)', listening: true, name: 'hitbox-worker',

  });

  grp.add(bodyHitbox);



  bodyHitbox.on('pointerdown', e => {

    if (!DIRECT_WORKER_SELECT_ENABLED) return;

    if (e.evt.button !== 0) return;

    if (_chipDragInProgress) return;

    e.cancelBubble = true;

    if (selectedWorker === w) deselectWorker();

    else selectWorker(w);

  });



  // Chip hover row — blank chips shown above worker head on hover

  const chipRow = new Konva.Group({ name: 'chip-row', visible: false, listening: true });

  grp.add(chipRow);



  // Fan layout: returns [{cx, cy, rotation}] for N chips spread in a symmetric arc.

  // Closes over headTopY. cx/cy are in worker-group-local coords.

  function chipFanPositions(N) {

    if (N === 0) return [];

    const VCH = VISUAL_STYLES.chip;

    const R      = VCH.fanRadius ?? 22;

    const spread = N === 1 ? 0 : (VCH.fanSpreadDeg ?? 25);

    const pivotY = headTopY - VCH.offsetY;

    const arcCY  = pivotY - R;

    return Array.from({ length: N }, (_, i) => {

      const t   = N === 1 ? 0 : i / (N - 1);

      const deg = -spread + t * 2 * spread;

      const rad = deg * Math.PI / 180;

      return { cx: Math.sin(rad) * R, cy: arcCY + Math.cos(rad) * R, rotation: deg };

    });

  }



  function refreshChipRow() {

    chipRow.destroyChildren();

    const VCH      = VISUAL_STYLES.chip;

    const available = Math.max(0, (w.chipCount || 4) - (w.jobs || []).length - (w._inFlight || 0));

    const totalSlots = Math.min(w.chipCount || WORKER_TIMINGS.jobBarSlots, 5);

    const ghostCount = Math.max(0, totalSlots - available);

    const allCount   = available + ghostCount;

    const badgeW   = VCH.badgeWidth ?? 22;

    const badgeH   = VCH.height;

    if (allCount === 0) return;



    // -- FAN STATE: real chips then ghost slots, spread in arc --

    const positions  = chipFanPositions(allCount);

    const stackY     = headTopY - VCH.offsetY;

    const bounceOff  = VCH.fanBounceOffset ?? 8;

    const spreadDur  = VCH.fanSpreadDuration ?? 0.16;

    const bounceDur  = VCH.fanBounceDuration ?? 0.32;

    const staggerMs  = VCH.fanStaggerMs ?? 40;



    const _inUseNums = new Set([

      ...(w.jobs || []).map(j => j.chipNum).filter(n => n != null),

      ...(w._inFlightNums || []),

    ]);

    const _avNums = [];

    for (let n = 1; n <= (w.chipCount || 4); n++) { if (!_inUseNums.has(n)) _avNums.push(n); }

    positions.forEach(({ cx, cy, rotation }, idx) => {

      const isGhost = idx >= available;

      const chipGrp = new Konva.Group({

        x: 0, y: stackY + bounceOff, rotation: 0,

        listening: false, name: 'fan-chip',

      });

      chipGrp._stackY = stackY + bounceOff;



      if (!isGhost) {

        // idx=0 drawn first (bottom) = highest available number; idx=N-1 = top = lowest

        const chipNum = _avNums[available - 1 - idx] ?? (available - idx);

        chipGrp._chipNum = chipNum;

        chipGrp.add(_makeChip(VCH.fanScale ?? 1, tpl?.color || null, chipNum));

      } else {

        chipGrp._isGhost = true;

        chipGrp.add(

          new Konva.Rect({

            x: -badgeW / 2, y: -badgeH / 2, width: badgeW, height: badgeH,

            cornerRadius: VCH.cornerRadius ?? 3,

            fill: VCH.ghostFill ?? 'rgba(255,255,255,0.07)',

            stroke: VCH.ghostStrokeColor ?? 'rgba(255,255,255,0.28)',

            strokeWidth: VCH.ghostStrokeWidth ?? 1,

            listening: false,

          }),

          new Konva.Text({

            x: -badgeW / 2, y: -badgeH / 2, width: badgeW, height: badgeH,

            text: '?', fontSize: VCH.numFontSize ?? 16, fontFamily: 'monospace',

            fill: VCH.ghostTextColor ?? 'rgba(255,255,255,0.38)',

            align: 'center', verticalAlign: 'middle', listening: false,

          })

        );

      }



      chipRow.add(chipGrp);



      // Staggered open: spread laterally (EaseOut) then bounce vertically (ElasticEaseOut)

      setTimeout(() => {

        if (!chipGrp.getLayer()) return; // guard: hovered away before timer fires

        new Konva.Tween({

          node: chipGrp, duration: spreadDur,

          x: cx, y: cy + bounceOff, rotation,

          easing: Konva.Easings.EaseOut,

          onFinish() {

            new Konva.Tween({

              node: chipGrp, duration: bounceDur,

              y: cy, easing: Konva.Easings.ElasticEaseOut,

            }).play();

          },

        }).play();

      }, idx * staggerMs);

    });

    // Ghost chips behind real chips
    chipRow.children.slice().forEach(c => { if (c._isGhost) c.moveToBottom(); });

    // Hitbox covering entire fan arc

    const R  = VCH.fanRadius ?? 22;

    const VHT = VISUAL_STYLES.hitboxTri;

    const px = VHT.padX ?? 8, py = VHT.padY ?? 6;

    const pivotY = headTopY - VCH.offsetY;

    const hitbox = new Konva.Rect({

      x:      -(R + badgeW / 2 + px),

      y:      pivotY - R - badgeH / 2 - py + (VHT.offsetY ?? 0),

      width:  (R + badgeW / 2 + px) * 2,

      height: R + badgeH + py * 2,

      fill: 'rgba(0,0,0,0.001)', listening: available > 0, name: 'hitbox-chip',

    });

    w._chipHitbox = hitbox;

    w._fanCenterOffset = pivotY - R / 2 + (VHT.offsetY ?? 0);

    hitbox.on('mouseenter', () => {

      w._fanActive = true;

      _pickCursorActive = true;

      containerEl.style.cursor = _pickCursorUrl;

      workerLayer.batchDraw();

    });

    hitbox.on('mousemove', () => {

      const pos = stage.getPointerPosition();

      if (!pos) return;

      const fanChips = chipRow.find('.fan-chip').filter(fc => !fc._isGhost);

      let nearest = null, bestD = Infinity;

      for (const fc of fanChips) { const ap = fc.getAbsolutePosition(); const d = Math.hypot(ap.x - pos.x, ap.y - pos.y); if (d < bestD) { bestD = d; nearest = fc; } }

      fanChips.forEach(fc => {

        const r = fc.findOne('.chip-rect');

        if (!r) return;

        const isNearest = fc === nearest;

        r.fill(tpl?.color ? colorAlpha(tpl.color, isNearest ? VCH.hoverFillAlpha : VCH.fillAlpha) : VISUAL_STYLES.chipSlot.fill);

        r.stroke(isNearest ? VCH.hoverStrokeColor : VCH.strokeColor);

      });

      workerLayer.batchDraw();

    });

    hitbox.on('mouseleave', () => {

      w._fanActive = false;

      if (_proximityHoveredWorker !== w) w._onProximityLeave?.();

      _pickCursorActive = false;

      if (!w.states._chipDragging) containerEl.style.cursor = MODES[currentMode].cursor;

      chipRow.find('.chip-rect').forEach(r => {

        r.fill(tpl?.color ? colorAlpha(tpl.color, VCH.fillAlpha) : VISUAL_STYLES.chipSlot.fill);

        r.stroke(VCH.strokeColor);

      });

      workerLayer.batchDraw();

    });

    hitbox.on('mousedown', e => {

      if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

      e.cancelBubble = true;

      const clickPos = stage.getPointerPosition();

      const fanChips = chipRow.find('.fan-chip').filter(fc => !fc._isGhost);

      let pickedChipNum = null;

      if (clickPos && fanChips.length) {

        let best = null, bestD = Infinity;

        for (const fc of fanChips) {

          const ap = fc.getAbsolutePosition();

          const d = Math.hypot(ap.x - clickPos.x, ap.y - clickPos.y);

          if (d < bestD) { bestD = d; best = fc; }

        }

        if (best?._chipNum != null) pickedChipNum = best._chipNum;

      }

      startChipDrag(pickedChipNum);

    });

    chipRow.add(hitbox);

  }

  w._refreshChipRow = refreshChipRow;

  refreshChipRow();



  // Group hover — driven by stage-level proximity handler (_proximityHoveredWorker)

  w._onProximityEnter = () => {

    w.states.hovered = true;

    if (!w.states._chipDragging && !_chipDragInProgress && _slotHoverCount === 0 && selectedWorker !== w) { workerSay(w, 'hm?'); enterWorkerHover(); refreshChipRow(); chipRow.visible(true); }

    workerLayer.batchDraw();

  };

  w._onProximityLeave = () => {

    const _pos = stage.getPointerPosition();

    if (_pos && w._chipHitbox && stage.getIntersection(_pos) === w._chipHitbox) { w._fanActive = true; return; }

    if (!w.states._chipDragging) containerEl.style.cursor = MODES[currentMode].cursor;

    w.states.hovered = false;

    if (!w.states._chipDragging) {

      exitWorkerHover();

      const fanChips = chipRow.find('.fan-chip');

      if (!fanChips.length) {

        chipRow.visible(false); workerLayer.batchDraw();

      } else {

        const dur = VISUAL_STYLES.chip.fanCloseDuration ?? 0.14;

        let done = 0;

        fanChips.forEach(chip => {

          new Konva.Tween({

            node: chip, duration: dur,

            x: 0, y: chip._stackY, rotation: 0,

            easing: Konva.Easings.EaseIn,

            onFinish() {

              if (++done === fanChips.length) { chipRow.visible(false); workerLayer.batchDraw(); }

            },

          }).play();

        });

      }

    }

  };



  // Chip drag — drag a blank chip token from worker to a slot to assign a job

  function startChipDrag(chipNum) {

    const _available = Math.max(0, (w.chipCount || 4) - (w.jobs || []).length - (w._inFlight || 0));

    if (_available <= 0) return;

    w.states._chipDragging = true;

    w.targetX = null; w.targetY = null;

    w.states.lifting = true;

    showLiftDim();

    pushTransientMode('liftWorker');

    const dl = _ensureDragLayer();

    const VCH = VISUAL_STYLES.chip;

    const startP = getWorldPointer() || { x: grp.x(), y: grp.y() };

    const dragChip = _makeChip(1, tpl?.color || null, chipNum);

    dragChip.x(startP.x); dragChip.y(startP.y);

    dl.add(dragChip);

    const trail = new Konva.Path({

      stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, dash: [8, 6], dashOffset: routeDashOffset,

      lineCap: 'butt', lineJoin: 'round', opacity: 0.85, listening: false, name: 'drag-trail',

    });

    dl.add(trail);

    let _snapSlot = null, _prevSnapSlot = null;

    const highlightSlot = slot => {

      if (slot === _prevSnapSlot) return;

      if (_prevSnapSlot?.routeRef) { _prevSnapSlot.routeRef._liftHover = false; _prevSnapSlot.routeRef._liftHoverSlot = undefined; refreshSlotPortrait(_prevSnapSlot.routeRef); }

      if (_prevSnapSlot?.smelterRef) { _prevSnapSlot.smelterRef._liftHover = false; refreshSmelterSlot(_prevSnapSlot.smelterRef); }

      _prevSnapSlot = slot;

      if (slot?.routeRef) { slot.routeRef._liftHover = true; slot.routeRef._liftHoverSlot = slot.slotIndex; refreshSlotPortrait(slot.routeRef); }

      if (slot?.smelterRef) { slot.smelterRef._liftHover = true; refreshSmelterSlot(slot.smelterRef); }

    };

    const onMove = () => {

      const worldP = getWorldPointer(); if (!worldP) return;

      dragChip.x(worldP.x); dragChip.y(worldP.y);

      const wx = grp.x(), wy = grp.y(), cx2 = worldP.x, cy2 = worldP.y;

      const dx = cx2 - wx, dy = cy2 - wy, len = Math.hypot(dx, dy);

      trail.data(len < 2 ? `M ${wx} ${wy}` : (() => {

        const mx = (wx + cx2) / 2, my = (wy + cy2) / 2, curve = Math.min(len * 0.25, 48);

        return `M ${wx} ${wy} Q ${mx - dy/len*curve} ${my - Math.abs(dx)/len*curve} ${cx2} ${cy2}`;

      })());

      const visibleSlots = uiLayer.find('.slot').filter(s => s.findOne('Rect')?.isVisible());

      let best = null, bestD2 = 50 * 50;

      for (const s of visibleSlots) { const sdx = s.x() - worldP.x, sdy = s.y() - worldP.y; if (sdx*sdx + sdy*sdy < bestD2) { bestD2 = sdx*sdx + sdy*sdy; best = s; } }

      _snapSlot = best; highlightSlot(best);

      uiLayer.batchDraw(); workerLayer.batchDraw(); dl.batchDraw();

    };

    const onUp = () => {

      stage.off('mousemove.chipdrag'); stage.off('mouseup.chipdrag');

      trail.destroy(); dragChip.destroy();

      hideLiftDim(); highlightSlot(null); while (pileFocusDepth > 0) leavePileFocus(); routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });

      w.states._chipDragging = false; w.states.lifting = false;

      exitWorkerHover();

      containerEl.style.cursor = MODES[currentMode].cursor;

      chipRow.visible(false);

      popTransientMode();

      const throwSx = grp.x(), throwSy = grp.y();

      const chipColor = tpl?.color || '#888';

      const _afterThrow = () => { refreshWorkerJobPanel(w); refreshChipRow(); updateWorkerVisual(w); uiLayer.batchDraw(); workerLayer.batchDraw(); };

      if (_snapSlot?.smelterRef) {

        const sm = _snapSlot.smelterRef;

        (w._inFlightNums = w._inFlightNums || []).push(chipNum);

        w._inFlight = (w._inFlight || 0) + 1;

        throwChip(throwSx, throwSy, _snapSlot.x(), _snapSlot.y(), chipColor, () => {

          w._inFlightNums = (w._inFlightNums || []).filter(n => n !== chipNum);

          w._inFlight = Math.max(0, (w._inFlight || 0) - 1);

          if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), throwSx, throwSy, chipColor); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

          const _smSlotIdx2 = _snapSlot.slotIndex ?? 0;

          if (!sm.workerSlots[_smSlotIdx2]) {

            const oldSmelterJob = w.jobs.find(j => j.type === 'smelter');

            if (oldSmelterJob) {

              const oldSm = smelters.find(s => s.id === oldSmelterJob.id);

              if (oldSm) { const oi = (oldSm.workerSlots || []).indexOf(w.id); if (oi !== -1) oldSm.workerSlots[oi] = null; refreshSmelterSlot(oldSm); updateSmelterLamps(oldSm); }

              w.jobs = w.jobs.filter(j => j !== oldSmelterJob);

            }

            sm.workerSlots[_smSlotIdx2] = w.id; w.jobs.push({ type: 'smelter', id: sm.id, chipNum });

            w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

            refreshSmelterSlot(sm); updateSmelterLamps(sm); workerSay(w, 'On the job!'); _afterThrow();

          } else { returnChip(_snapSlot.x(), _snapSlot.y(), throwSx, throwSy, chipColor); }

        }); return;

      } else if (_snapSlot?.routeRef) {

        const chosen = _snapSlot.routeRef, slotIdx = _snapSlot.slotIndex ?? 0;

        if (chosen.workerSlots[slotIdx] === w.id) {
          const _sx = _snapSlot.x(), _sy = _snapSlot.y(), _rx = w.x, _ry = w.y;
          setTimeout(() => returnChip(_sx, _sy, _rx, _ry, w.color), 150);
        } else { const _dispId = chosen.workerSlots[slotIdx]; if (_dispId) { const _dw = workers.find(wk => wk.id === _dispId); if (_dw) { const _sx = _snapSlot.x(), _sy = _snapSlot.y(), _dx = _dw.x, _dy = _dw.y; setTimeout(() => returnChip(_sx, _sy, _dx, _dy, _dw.color), 150); } } }

        (w._inFlightNums = w._inFlightNums || []).push(chipNum);

        w._inFlight = (w._inFlight || 0) + 1;

        throwChip(throwSx, throwSy, _snapSlot.x(), _snapSlot.y(), chipColor, () => {

          w._inFlightNums = (w._inFlightNums || []).filter(n => n !== chipNum);

          w._inFlight = Math.max(0, (w._inFlight || 0) - 1);

          if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), throwSx, throwSy, chipColor); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

          if (chosen.workerSlots[slotIdx] === w.id) {
            const ej = w.jobs.find(j => j.type === 'route' && j.id === chosen.id);
            if (ej) { ej.chipNum = chipNum; refreshSlotPortrait(chosen); workerSay(w, 'Reassigned!'); _afterThrow(); }
            return true;
          }

          if (chosen.workerSlots.includes(w.id) && chosen.workerSlots[slotIdx] !== w.id) {

            returnChip(_snapSlot.x(), _snapSlot.y(), throwSx, throwSy, chipColor); return;

          }

          const displaced = chosen.workerSlots[slotIdx];

          if (displaced && displaced !== w.id) {

            const dw = workers.find(wk => wk.id === displaced);

            if (dw) { dw.jobs = dw.jobs.filter(j => !(j.type === 'route' && j.id === chosen.id)); dw.state = 'idle'; dw.path = null; refreshWorkerJobPanel(dw); if (dw._refreshChipRow) dw._refreshChipRow(); }

          }

          chosen.workerSlots[slotIdx] = w.id;

          chosen.workerIds = chosen.workerSlots.filter(Boolean);

          w.jobs.push({ type: 'route', id: chosen.id, chipNum });

          w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSlotPortrait(chosen); holdRouteView(chosen.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); workerSay(w, 'Back to work!'); _afterThrow(); return true;

        }); return;

      } else {

        // If dropped on this worker's own free panel slot ? cancel (chip stays available)

        const mousePos = stage.getPointerPosition();

        if (mousePos && w._chipSlotsGrp) {

          const emptySlots = w._chipSlotsGrp.find('.panel-chip-free');

          const hitSlot = emptySlots.find(r => {

            const ap = r.getAbsolutePosition();

            return mousePos.x >= ap.x && mousePos.x <= ap.x + r.width() &&

                   mousePos.y >= ap.y && mousePos.y <= ap.y + r.height();

          });

          if (hitSlot) { _afterThrow(); return; }

        }

        const worldP2 = getWorldPointer();

        if (worldP2) {

          const destX = snap(worldP2.x), destY = snap(worldP2.y);

          (w._inFlightNums = w._inFlightNums || []).push(chipNum);

          w._inFlight = (w._inFlight || 0) + 1;

          throwChip(throwSx, throwSy, destX, destY, chipColor, () => {

            w._inFlightNums = (w._inFlightNums || []).filter(n => n !== chipNum);

            w._inFlight = Math.max(0, (w._inFlight || 0) - 1);

            if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(destX, destY, throwSx, throwSy, chipColor); workerSay(w, 'No work without fluids!'); _afterThrow(); return; }

            const moveJob = { type: 'move', id: uid(), x: destX, y: destY, chipNum };

            w.jobs.push(moveJob);

            createGroundChipToken(w, moveJob);

            updateGroundChipNumbers(w);

            workerSay(w, 'On my way!'); _afterThrow();

          }); return;

        }

      }

      _afterThrow();

    };

    stage.on('mousemove.chipdrag', onMove);

    stage.on('mouseup.chipdrag', onUp);

  }



  workerLayer.add(grp);



  workerLayer.batchDraw();

}

function workerSay(w, text) {

  const grp = workerLayer.findOne('#' + w.id); if (!grp) return;

  grp.findOne('.speechbubble')?.destroy();

  const VSB = VISUAL_STYLES.speechBubble;

  const pad = VSB.padding, tailW = 4, tailH = 3;

  const bubble = new Konva.Group({ name: 'speechbubble', listening: false });

  const label = new Konva.Text({

    text, fontSize: VSB.fontSize, fontFamily: VSB.fontFamily,

    fontStyle: 'bold', fill: VSB.textColor, listening: false,

  });

  const tw = label.width(), th = label.height();

  const bg = new Konva.Rect({ x: 0, y: 0, width: tw + pad * 2, height: th + pad * 2, fill: VSB.background, cornerRadius: VSB.cornerRadius, listening: false });

  const tail = new Konva.Line({ points: [0, (th + pad * 2) / 2 - tailH / 2, -tailW, (th + pad * 2) / 2, 0, (th + pad * 2) / 2 + tailH / 2], fill: VSB.background, closed: true, listening: false });

  label.position({ x: pad, y: pad });

  bubble.add(bg, tail, label);

  bubble.position({ x: 12, y: -(th / 2 + pad) });

  grp.add(bubble);

  workerLayer.batchDraw();

  setTimeout(() => { bubble.destroy(); workerLayer.batchDraw(); }, VSB.durationMs);

}



// ===== LIFT DIM =====

let _liftMirrorTri = null;

function showLiftDim() {

  liftDimRect.fill(VISUAL_STYLES.liftDim.color);

  const dur = VISUAL_STYLES.liftDim.fadeDuration;

  if (dur > 0) { liftDimRect.to({ opacity: 1, duration: dur }); }

  else { liftDimRect.opacity(1); liftDimLayer.batchDraw(); }

  workerLayer.zIndex(workerLayer.zIndex() - 1); // send workers behind slots during chip drag

}

function hideLiftDim() {

  const dur = VISUAL_STYLES.liftDim.fadeDuration;

  if (dur > 0) { liftDimRect.to({ opacity: 0, duration: dur }); }

  else { liftDimRect.opacity(0); liftDimLayer.batchDraw(); }

  workerLayer.zIndex(workerLayer.zIndex() + 1); // restore workers above slots

}

function _enterSlotHover() {

  _slotHoverCount++;

  if (_slotHoverCount === 1) workerLayer.zIndex(workerLayer.zIndex() - 1);

}

function _exitSlotHover() {

  if (_slotHoverCount === 0) return;

  _slotHoverCount--;

  if (_slotHoverCount === 0) workerLayer.zIndex(workerLayer.zIndex() + 1);

}



function updateWorkerVisual(w) {

  const grp = workerLayer.findOne('#' + w.id);

  if (!grp) return;

  grp.position({ x: w.x, y: w.y });

  // Rebuild carry stack: one triangle per carried item, stacked vertically upward

  const carry = grp.findOne('.carry');

  if (carry) {

    carry.destroyChildren();

    const VC = VISUAL_STYLES.carryIndicator;

    let idx = 0;

    SCRAP_TYPES.forEach(t => {

      const count = (w.inventory || {})[t.id] || 0;

      for (let i = 0; i < count; i++) {

        carry.add(makeScrapShape(t.id, {

          x: 0, y: -(idx * VC.stackSpacing),

          radius: VC.radius, rotation: t.id === 'ingot' ? 0 : 180,

          fill: t.color, stroke: VC.strokeColor, strokeWidth: VC.strokeWidth,

          listening: false,

        }));

        idx++;

      }

    });

  }

}



