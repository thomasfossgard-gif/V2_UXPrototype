// ===== MODULE: auto-playback.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== AUTO MODE =====

function scoreAutoTarget(target, type) {
  let hasWork = false;
  let workersAssigned = 0;
  if (type === 'route') {
    const ep = routeEndpoints(target);
    if (!ep) return 0;
    const allowed = target.allowedTypes || defaultAllowedTypes();
    hasWork = isZone(ep.fn)
      ? !!closestZoneScrap(ep.fn, 0, 0, allowed)
      : SCRAP_TYPES.some(t => allowed[t.id] && (ep.fn.scrap || []).some(p => p.type === t.id));
    workersAssigned = (target.workerSlots || []).filter(s => s !== null).length;
    if (workersAssigned >= (target.workerSlots || []).length) return 0;
  } else if (type === 'smelter') {
    const inp = nodes.find(n => n.id === target.inputNodeId);
    const c = {};
    (inp?.scrap || []).forEach(s => { if (!isIngotType(s.type)) c[s.type] = (c[s.type] || 0) + 1; });
    hasWork = target.state === 'processing' || Object.keys(c).some(t => c[t] >= SMELTER_PARAMS.ingotCost && (!target.smelterType || t === target.smelterType));
    workersAssigned = (target.workerSlots || []).filter(s => s !== null).length;
    if (workersAssigned >= (target.workerSlots || []).length) return 0;
  }
  return hasWork ? 1 / (workersAssigned + 1) : 0;
}

function autoAssignWorker(w) {
  if (!w.autoMode) return;
  if ((w.thirst || 0) >= 100) return;

  // Cooldown — prevent re-assignment more than once every 3 seconds
  const now = Date.now();
  if (w._autoAssignedAt && now - w._autoAssignedAt < 3000) return;
  w._autoAssignedAt = now;

  // Collect slot positions for recall animation before removing jobs
  const toRemove = (w.jobs || []).filter(j => !j.locked);
  const recalls = [];
  for (const job of toRemove) {
    const target = job.type === 'route'
      ? routes.find(r => r.id === job.id)
      : smelters.find(s => s.id === job.id);
    if (!target) continue;
    const si = (target.workerSlots || []).indexOf(w.id);
    const ms = si !== -1 ? (target._miniSlots || [])[si] : null;
    if (ms) recalls.push({ sx: ms.x(), sy: ms.y() });
  }

  // Remove jobs from world state
  toRemove.forEach(job => {
    _removeJobWorldRef(w, job);
    w.jobs = w.jobs.filter(j => j !== job);
  });

  // Play recall animations and compute max duration
  let recallMs = 0;
  recalls.forEach(r => {
    const dist = Math.hypot(r.sx - w.x, r.sy - w.y);
    const PP = PATHFIND_PARAMS;
    const power = (PP.returnPower ?? 2) * (PP.throwPower ?? 1);
    recallMs = Math.max(recallMs, Math.max(0.06, dist / (400 * power)) * 1000);
    returnChip(r.sx, r.sy, w.x, w.y, w.color);
  });

  refreshWorkerJobPanel(w);

  // After recalls land, score and throw new chips
  setTimeout(() => {
    if (!w.autoMode) return;

    // Count free slots
    const lockedJobs = (w.jobs || []).filter(j => j.locked);
    const freeSlots = (w.chipCount || 4) - lockedJobs.length;
    if (freeSlots <= 0) return;

    // Compute available chip numbers
    const usedNums = new Set(lockedJobs.map(j => j.chipNum).filter(n => n != null));
    const availNums = [];
    for (let n = 1; n <= (w.chipCount || 4); n++) { if (!usedNums.has(n)) availNums.push(n); }

    // Score all candidates
    const candidates = [
      ...routes.map(r => ({ type: 'route', target: r, score: scoreAutoTarget(r, 'route') })),
      ...smelters.map(s => ({ type: 'smelter', target: s, score: scoreAutoTarget(s, 'smelter') })),
    ].filter(c => c.score > 0).sort((a, b) => b.score - a.score);

    const picks = candidates.slice(0, freeSlots);

    picks.forEach((pick, i) => {
      const chipNum = availNums[i] ?? (lockedJobs.length + i + 1);

      // Stagger each throw by 500ms so chips fly one at a time
      setTimeout(() => {
        if (!w.autoMode) return; // worker may have been toggled off during delay

        const slotIdx = (pick.target.workerSlots || []).indexOf(null);
        if (slotIdx === -1) return;

        const ms = (pick.target._miniSlots || [])[slotIdx];
        let tx = ms ? ms.x() : pick.target.x;
        let ty = ms ? ms.y() : pick.target.y;

        // Track in-flight
        w._inFlight = (w._inFlight || 0) + 1;
        w._inFlightNums = [...(w._inFlightNums || []), chipNum];

        const t = pick.target, tp = pick.type;
        throwChip(w.x, w.y, tx, ty, w.color, () => {
          w._inFlight = Math.max(0, (w._inFlight || 0) - 1);
          w._inFlightNums = (w._inFlightNums || []).filter(n => n !== chipNum);
          // Check slot still free (another worker may have taken it)
          const si = (t.workerSlots || []).indexOf(null);
          if (si === -1) return true;
          t.workerSlots[si] = w.id;
          w.jobs.push({ type: tp, id: t.id, chipNum });
          refreshWorkerJobPanel(w);
          updateWorkerVisual(w);
          refreshAllSlotPortraits();
          return true;
        });
      }, i * 500);
    });
  }, recallMs + 100);
}

function setWorkerAutoMode(w, on) {
  w.autoMode = on;
  if (on) autoAssignWorker(w);
  updateWorkerVisual(w);
  rebuildAutoPanel();
}

function randomPointInIdleZone(iz) {

  const half = (VISUAL_STYLES.idleZone.size / 2) - 15;

  return {

    x: iz.x + (Math.random() * 2 - 1) * half,

    y: iz.y + (Math.random() * 2 - 1) * half,

  };

}



// -- Direct worker control --

function selectWorker(w) {

  if (selectedWorker && selectedWorker !== w) deselectWorker();

  selectedWorker = w;

  w.path = null; w.pathIdx = 0;

  w.targetX = null; w.targetY = null;

  w._commandResumeTimer = null;

  w.state = 'commanded';

  const blob = workerLayer.findOne('#' + w.id)?.findOne('.selection-blob');

  if (blob) { blob.visible(true); workerLayer.batchDraw(); }

}

function deselectWorker() {

  if (!selectedWorker) return;

  const w = selectedWorker;

  selectedWorker = null;

  w._commandResumeTimer = WORKER_TIMINGS.idleTimeoutSec;

  const blob = workerLayer.findOne('#' + w.id)?.findOne('.selection-blob');

  if (blob) { blob.visible(false); workerLayer.batchDraw(); }

}

function workerStartJourney(w, route, targetNode, nextState) {

  const wps = routeWaypoints(route);

  const bias = nextState === 'to_source' ? wps.slice().reverse() : wps;

  const tPos = entityXY(targetNode);

  const jAngle = Math.random() * Math.PI * 2;

  const jR = Math.random() * WORKER_TIMINGS.jitterRadius;

  tPos.x += Math.cos(jAngle) * jR; tPos.y += Math.sin(jAngle) * jR;

  const path = findPathAStar(w.x, w.y, tPos.x, tPos.y, bias);

  if (path) {

    w.path = path; w.pathIdx = 0; w.state = nextState;

  } else {

    w.path = null; w.state = 'waiting';

    workerSay(w, "Can't find the way, boss!");

  }

}

// Advance worker along its computed path; returns true when destination reached.

function workerAdvancePath(w, dt) {

  if (!w.path || w.pathIdx >= w.path.length) return true;

  let remaining = PATHFIND_PARAMS.workerSpeed * (w.speedMult ?? 1) * dt;

  while (remaining > 0 && w.pathIdx < w.path.length) {

    const tgt = w.path[w.pathIdx];

    const dx = tgt.x - w.x, dy = tgt.y - w.y;

    const dist = Math.hypot(dx, dy);

    if (dist <= remaining || dist < 0.5) {

      w.x = tgt.x; w.y = tgt.y; remaining -= dist; w.pathIdx++;

    } else {

      w.x += (dx / dist) * remaining; w.y += (dy / dist) * remaining; remaining = 0;

    }

  }

  return w.pathIdx >= w.path.length;

}



function _applyWorkerSeparation() {

  const { sepRadius, sepStrength, yieldRadius, yieldDuration } = WORKER_TIMINGS;

  for (let i = 0; i < workers.length; i++) {

    for (let j = i + 1; j < workers.length; j++) {

      const a = workers[i], b = workers[j];

      const dx = a.x - b.x, dy = a.y - b.y;

      const dist = Math.hypot(dx, dy);

      if (dist >= sepRadius || dist < 0.01) continue;

      const overlap = sepRadius - dist;

      const push = overlap * sepStrength * 0.5;

      const nx = dx / dist, ny = dy / dist;

      a.x += nx * push; a.y += ny * push;

      b.x -= nx * push; b.y -= ny * push;

      if (dist < yieldRadius) {

        const aMoving = a.path && a.pathIdx < a.path.length;

        const bMoving = b.path && b.pathIdx < b.path.length;

        if (aMoving && bMoving) {

          const yielder = a.id < b.id ? a : b;

          if (!(yielder._yieldTimer > 0)) yielder._yieldTimer = yieldDuration;

        }

      }

    }

  }

}



// dashes flow from?to — read from VISUAL_STYLES.route.animSpeed

function randomPointInZone(zone) {

  if (!zone.circles.length) return zonePos(zone);

  const c = zone.circles[Math.floor(Math.random() * zone.circles.length)];

  const r = VISUAL_STYLES.zone.brushRadius * Math.sqrt(Math.random());

  const angle = Math.random() * Math.PI * 2;

  return { x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) };

}

function closestZoneScrap(zone, wx, wy, allowed) {

  let best = null, bestD = Infinity;

  for (const gs of groundScrap) {

    if (!allowed[gs.type]) continue;

    if (!isPointInZone(zone, gs.x, gs.y)) continue;

    const d = (gs.x - wx) ** 2 + (gs.y - wy) ** 2;

    if (d < bestD) { bestD = d; best = gs; }

  }

  return best;

}



let routeDashOffset = 0;

let _idleFrameCount = 0;

let _lastInputTime = Date.now();

let tickRot = 0;

let _dragRagdoll = null;        // ragdoll particles + shapes — active during tri drag

const _dragPhysAnchor = { x: 0, y: 0 };

const tickIndicatorEl = document.getElementById('tick-indicator');

function isWorldIdle() {

  if (activeFlashes.length > 0) return false;

  if (_dragRagdoll) return false;

  return workers.every(w => w.state === 'chill_rest');

}

function wakeAnimation() {

  if (gamePaused) return;

  _idleFrameCount = 0;

  anim.start(); // no-op if already running

}

const anim = new Konva.Animation(frame => {

  const dt = Math.min(0.05, frame.timeDiff / 1000) * gameSpeed;

  let dirty = false;

  workers.forEach(w => { try {

    if (w.states?.hovered && w.state !== 'commanded') return;

    if (w._yieldTimer > 0) { w._yieldTimer -= dt; updateWorkerVisual(w); dirty = true; return; }

    // -- Direct player control --

    if (w.state === 'commanded') {

      if (w.path) workerAdvancePath(w, dt);

      if (w._commandResumeTimer != null) {

        w._commandResumeTimer -= dt;

        if (w._commandResumeTimer <= 0) { w._commandResumeTimer = null; w.state = 'idle'; }

      }

      updateWorkerVisual(w); dirty = true; return;

    }

    // -- Free-walk: commanded to a world point (lift-drop in free space) --

    // Activate pending move job if nothing else is driving free-walk

    if (w.jobs[0]?.type === 'move' && w.targetX == null) {

      w.targetX = w.jobs[0].x; w.targetY = w.jobs[0].y;

    }

    if (w.targetX != null) {

      const dx = w.targetX - w.x, dy = w.targetY - w.y;

      const dist = Math.hypot(dx, dy);

      const step = PATHFIND_PARAMS.workerSpeed * (w.speedMult ?? 1) * dt;

      if (dist <= step || dist === 0) {

        w.x = w.targetX; w.y = w.targetY;

        w.targetX = null; w.targetY = null;

        // Recover ground chip if this walk was a move job

        if (w.jobs[0]?.type === 'move') {

          const mj = w.jobs.shift();

          destroyGroundChipToken(mj.id);

          updateGroundChipNumbers(w);

          refreshWorkerJobPanel(w);

          refreshPanelChipSlots(w); // belt-and-suspenders: ensure slot row always reflects pickup

          hudLayer.batchDraw();

          if (w._refreshChipRow) w._refreshChipRow();

        }

      } else {

        w.x += (dx / dist) * step;

        w.y += (dy / dist) * step;

      }

      updateWorkerVisual(w);

      dirty = true;

      return;

    }

    // State-entry narration: fires once each time state changes

    if (w._prevState !== w.state) {

      const _chillState = w.state === 'chill_walk' || w.state === 'chill_rest';
      const _thirstStuck = _chillState && (w.thirst || 0) >= 100 && !nodes.some(n => n.kind === 'fridge' && (n.drinks ?? 0) > 0);

      if (_thirstStuck && Math.random() < 0.5) {
        workerSay(w, "I'm too thirsty to work!");
      } else {
        let c = WORKER_STATE_CHATTER[w.state];

        if (_chillState) {

          const _tpl = palette.workers.find(t => t.id === w.templateId);

          c = w.state === 'chill_walk' ? (_tpl?.chillWalk || c) : (_tpl?.chillRest || c);

        }

        if (c && (!_chillState || Math.random() < _chillChatterChance)) workerSay(w, Array.isArray(c) ? c[Math.floor(Math.random() * c.length)] : c);
      }

      w._prevState = w.state;

    }



    // -- Universal states: run for ALL workers regardless of assignment --

    const activeJobHasWork = (job) => {

      const j = job ?? w.jobs[0];

      if (!j) return false;

      if (j.type === 'route') {

        const r = routes.find(x => x.id === j.id);

        const ep = r && routeEndpoints(r);

        if (!ep) return false;

        const allowed = r.allowedTypes || defaultAllowedTypes();

        return isZone(ep.fn)

          ? !!closestZoneScrap(ep.fn, w.x, w.y, allowed)

          : SCRAP_TYPES.some(t => allowed[t.id] && (ep.fn.scrap || []).some(p => p.type === t.id));

      }

      if (j.type === 'smelter') {

        const sm = smelters.find(s => s.id === j.id); if (!sm) return false;

        const inp = nodes.find(n => n.id === sm.inputNodeId);

        const c = {}; (inp?.scrap || []).forEach(s => { if (s.type !== 'ingot') c[s.type] = (c[s.type] || 0) + 1; });

        return sm.state === 'processing' || Object.values(c).some(v => v >= SMELTER_PARAMS.ingotCost);

      }

      if (j.type === 'move') return true;

      return false;

    };

    const bestAvailableJob = () => {

      if (!w.jobs.length) return null;

      const sorted = [...w.jobs].sort((a, b) => (a.chipNum ?? 99) - (b.chipNum ?? 99));

      return sorted.find(j => activeJobHasWork(j)) ?? sorted[0];

    };

    const promoteBestJob = () => {

      if (!w.jobs.length) return false;

      const sorted = [...w.jobs].sort((a, b) => (a.chipNum ?? 99) - (b.chipNum ?? 99));

      const best = sorted.find(j => activeJobHasWork(j)); // no fallback — only promote when work exists

      if (!best || best === w.jobs[0]) return false;

      const idx = w.jobs.indexOf(best);

      w.jobs.unshift(w.jobs.splice(idx, 1)[0]);

      w.state = 'idle'; w.path = null;

      refreshWorkerJobPanel(w);

      return true;

    };

    if (['to_idle_zone', 'chilling', 'chill_walk', 'chill_rest', 'to_fridge', 'drinking', 'to_outhouse', 'outhouse_waiting', 'using_outhouse'].includes(w.state)) {

      switch (w.state) {

        case 'to_idle_zone': {

          const arrived = workerAdvancePath(w, dt);

          if (arrived) w.state = 'chilling';

          break;

        }

        case 'chilling': {

          const _best = bestAvailableJob();

          if (_best && activeJobHasWork(_best) && (w.thirst || 0) < 100 && (w.bladder || 0) < 100) {

            if (_best !== w.jobs[0]) { const _bi = w.jobs.indexOf(_best); w.jobs.unshift(w.jobs.splice(_bi, 1)[0]); refreshWorkerJobPanel(w); }

            w._thinkTimer = 0; w.state = w.jobs[0]?.type === 'smelter' ? 'idle' : 'thinking'; break;

          }

          if (w.autoMode) autoAssignWorker(w);

          if ((w.thirst || 0) >= 100) {
            if (nodes.some(n => n.kind === 'fridge' && (n.drinks ?? 0) > 0)) { workerGoToFridge(w); break; }
          }

          const iz = nodes.find(n => n.kind === 'idleZone');

          if (iz) { const pt = randomPointInIdleZone(iz); w.path = [pt]; w.pathIdx = 0; w.state = 'chill_walk'; }

          break;

        }

        case 'chill_walk': {

          const _wi1 = w.jobs.findIndex(j => activeJobHasWork(j));

          if (_wi1 >= 0 && (w.thirst || 0) < 100 && (w.bladder || 0) < 100) { if (_wi1 > 0) { w.jobs.unshift(w.jobs.splice(_wi1, 1)[0]); refreshWorkerJobPanel(w); } w._thinkTimer = 0; w.state = w.jobs[0]?.type === 'smelter' ? 'idle' : 'thinking'; break; }

          const arrived = workerAdvancePath(w, dt);

          if (arrived) { w._chillWaitTimer = WORKER_TIMINGS.chillMinSec + Math.random() * (WORKER_TIMINGS.chillMaxSec - WORKER_TIMINGS.chillMinSec); w.state = 'chill_rest'; }

          break;

        }

        case 'chill_rest': {

          const _wi2 = w.jobs.findIndex(j => activeJobHasWork(j));

          if (_wi2 >= 0 && (w.thirst || 0) < 100 && (w.bladder || 0) < 100) { if (_wi2 > 0) { w.jobs.unshift(w.jobs.splice(_wi2, 1)[0]); refreshWorkerJobPanel(w); } w._thinkTimer = 0; w.state = w.jobs[0]?.type === 'smelter' ? 'idle' : 'thinking'; break; }

          w._chillWaitTimer -= dt;

          if (w._chillWaitTimer <= 0) {

            if ((w.thirst || 0) >= 100 && nodes.some(n => n.kind === 'fridge' && (n.drinks ?? 0) > 0)) { workerGoToFridge(w); break; }

            if (w.bladder > THIRST_PARAMS.bladderThreshold) {
              const t = (w.bladder - THIRST_PARAMS.bladderThreshold) / (100 - THIRST_PARAMS.bladderThreshold);
              const prob = 0.01 + 0.99 * Math.pow(t, THIRST_PARAMS.bladderCurveExp);
              if (Math.random() < prob) { workerGoToOuthouse(w); break; }
            }

            if (w.autoMode) { w.state = 'chilling'; break; }

            const iz = nodes.find(n => n.kind === 'idleZone');

            if (iz) { const pt = randomPointInIdleZone(iz); w.path = [pt]; w.pathIdx = 0; w.state = 'chill_walk'; }

          }

          break;

        }

        case 'to_fridge': {

          const arrived = workerAdvancePath(w, dt);

          if (arrived) {

            const f = w._targetFridge;

            if (f && (f.drinks ?? 0) > 0) {

              f.drinks = Math.max(0, (f.drinks ?? 0) - 1); updateFridgeDrinksLabel(f); rebuildYardShopPanel();

              w._drinkTimer = THIRST_PARAMS.drinkDuration;

              w.state = 'drinking';

              workerSay(w, 'Ahhh...');

            } else {

              workerGoToFridge(w);

            }

          }

          break;

        }

        case 'drinking': {

          w._drinkTimer = (w._drinkTimer || 0) - dt;

          if (w._drinkTimer <= 0) {

            w.thirst = 0;

            w._targetFridge = null;

            const _prevBladder = w.bladder || 0;

            w.bladder = Math.min(100, _prevBladder + THIRST_PARAMS.bladderFillPerDrink);

            if (_prevBladder < THIRST_PARAMS.bladderThreshold && w.bladder >= THIRST_PARAMS.bladderThreshold)

              workerSay(w, "Nature's calling, boss!");

            w.state = 'chilling';

          }

          break;

        }

        case 'to_outhouse': {

          const arrived = workerAdvancePath(w, dt);

          if (arrived) {

            const ot = w._targetOuthouse;

            if (ot && !ot.occupant) {

              ot.occupant = w;

              w._outhouseTimer = THIRST_PARAMS.outhouseDuration;

              w.state = 'using_outhouse';

              workerSay(w, 'Phew...');

            } else {

              w.state = 'outhouse_waiting';

            }

          }

          break;

        }

        case 'outhouse_waiting': {

          const ot = w._targetOuthouse;

          if (!ot) { w.state = 'chilling'; break; }

          if (!ot.occupant) {

            ot.occupant = w;

            w._outhouseTimer = THIRST_PARAMS.outhouseDuration;

            w.state = 'using_outhouse';

            workerSay(w, 'Phew...');

          }

          break;

        }

        case 'using_outhouse': {

          w._outhouseTimer = (w._outhouseTimer || 0) - dt;

          if (w._outhouseTimer <= 0) {

            const ot = w._targetOuthouse;

            if (ot) {

              if (ot.occupant === w) ot.occupant = null;

              ot.waiting = (ot.waiting || []).filter(x => x !== w);

            }

            w.bladder = 0;

            w._targetOuthouse = null;

            w.state = 'chilling';

          }

          break;

        }

      }

      updateWorkerVisual(w); dirty = true; return;

    }



    // -- Unassigned workers: boredom timer ? idle zone --

    if (!w.jobs.length) {

      if (w.inventory && Object.values(w.inventory).some(v => v > 0)) dropWorkerInventory(w);

      if (w.state === 'idle') {

        if (!w._idleSince) w._idleSince = Date.now();

        if (Date.now() - w._idleSince >= WORKER_TIMINGS.idleTimeoutSec * 1000) { w._idleSince = null; workerReturnToIdleZone(w); }

      } else {

        w._idleSince = null;

      }

      updateWorkerVisual(w); dirty = true; return;

    }

    w._idleSince = null;



    // Promote highest-priority available job at decision points

    if (['idle', 'waiting', 'to_slot'].includes(w.state)) promoteBestJob();



    // -- Smelter machine --

    if (w.jobs[0]?.type === 'smelter') {

      const j0 = w.jobs[0];

      const sm = smelters.find(s => s.id === j0.id);

      if (!sm) { w.jobs = w.jobs.filter(j => j !== j0); return; }

      switch (w.state) {

        case 'idle': workerReturnToSmelterSlot(w, sm); break;

        case 'to_smelter': { const arrived = workerAdvancePath(w, dt); if (arrived) w.state = 'at_smelter'; break; }

        case 'at_smelter': {

          const inp = nodes.find(n => n.id === sm.inputNodeId);

          const counts = {}; (inp?.scrap || []).forEach(s => { if (!isIngotType(s.type)) counts[s.type] = (counts[s.type] || 0) + 1; });

          const hasWork = sm.state === 'processing' || Object.keys(counts).some(t => counts[t] >= SMELTER_PARAMS.ingotCost && (!sm.smelterType || t === sm.smelterType));

          if (!hasWork) {

            w._noWorkTimer = (w._noWorkTimer || 0) + dt;

            if (w._noWorkTimer >= WORKER_TIMINGS.noWorkEnterSec) { w._noWorkTimer = 0; w.state = 'no_work'; }

          } else { w._noWorkTimer = 0; }

          break;

        }

        case 'no_work': {

          w._noWorkTimer = (w._noWorkTimer || 0) + dt;

          const inp2 = nodes.find(n => n.id === sm.inputNodeId);

          const c2 = {}; (inp2?.scrap || []).forEach(s => { if (!isIngotType(s.type)) c2[s.type] = (c2[s.type] || 0) + 1; });

          if (Object.keys(c2).some(t => c2[t] >= SMELTER_PARAMS.ingotCost && (!sm.smelterType || t === sm.smelterType))) {

            workerSay(w, 'Ok I can work again!'); w._prevState = 'to_smelter'; w._noWorkTimer = 0; workerReturnToSmelterSlot(w, sm);

          } else if (w._noWorkTimer >= WORKER_TIMINGS.noWorkWaitSec) {

            w._noWorkTimer = 0;

            if (!promoteBestJob()) workerReturnToIdleZone(w);

          }

          break;

        }

      }

      updateWorkerVisual(w); dirty = true; return;

    }



    // -- Route machine --

    if (w.jobs[0]?.type !== 'route') return;

    const route = routes.find(j => j.id === w.jobs[0].id); if (!route) return;

    const ep = routeEndpoints(route); if (!ep) return;

    const { fn, tn } = ep;



    switch (w.state) {

      case 'idle':

        workerStartJourney(w, route, fn, 'to_source');

        break;

      case 'to_source': {

        const arrived = workerAdvancePath(w, dt);

        if (arrived) {

          const allowed = route.allowedTypes || defaultAllowedTypes();

          if (!w.inventory) w.inventory = {};

          if (isZone(fn)) {

            // Zone source: roam to individual ground scrap items within the zone

            const target = closestZoneScrap(fn, w.x, w.y, allowed);

            if (target) {

              w.targetScrapId = target.id;

              w.path = [{ x: target.x, y: target.y }];

              w.pathIdx = 0;

              w.state = 'to_zone_scrap';

            } else {

              workerSay(w, 'No scrap in zone!');

              workerReturnToSlot(w, route);

            }

          } else {

            const carried = () => Object.values(w.inventory).reduce((a, b) => a + b, 0);

            const fnPos = entityXY(fn);

            let pickedUp = false;

            while (carried() < w.capacity) {

              const pickType = SCRAP_TYPES.find(t => allowed[t.id] && (fn.scrap || []).some(p => p.type === t.id));

              if (!pickType) break;

              const idx = fn.scrap.map(p => p.type).lastIndexOf(pickType.id);

              fn.scrap.splice(idx, 1);

              w.inventory[pickType.id] = (w.inventory[pickType.id] || 0) + 1;

              animateScrapArc(fnPos.x, fnPos.y, w.x, w.y, pickType.id);

              pickedUp = true;

            }

            if (pickedUp) {

              refreshNodeItems(fn); updateNodeStack(fn);

              workerSay(w, 'Hup!');

              workerStartJourney(w, route, tn, 'to_dest');

            } else {

              workerSay(w, 'No more scrap!');

              workerReturnToSlot(w, route);

            }

          }

        }

        break;

      }

      case 'to_zone_scrap': {

        const arrived = workerAdvancePath(w, dt);

        if (arrived) {

          const allowed = route.allowedTypes || defaultAllowedTypes();

          if (!w.inventory) w.inventory = {};

          const gs = groundScrap.find(g => g.id === w.targetScrapId);

          if (gs && allowed[gs.type]) {

            groundScrap = groundScrap.filter(g => g.id !== gs.id);

            nodeLayer.findOne('#' + gs.id)?.destroy();

            nodeLayer.batchDraw();

            w.inventory[gs.type] = (w.inventory[gs.type] || 0) + 1;

            animateScrapArc(gs.x, gs.y, w.x, w.y, gs.type);

          }

          w.targetScrapId = null;

          const carried = Object.values(w.inventory).reduce((a, b) => a + b, 0);

          if (carried < w.capacity) {

            const next = closestZoneScrap(fn, w.x, w.y, allowed);

            if (next) {

              w.targetScrapId = next.id;

              w.path = [{ x: next.x, y: next.y }];

              w.pathIdx = 0;

              break; // stay in to_zone_scrap

            }

          }

          workerSay(w, 'Hup!');

          workerStartJourney(w, route, tn, 'to_dest');

        }

        break;

      }

      case 'to_dest': {

        const arrived = workerAdvancePath(w, dt);

        if (arrived) {

          const inv = w.inventory || {};

          if (Object.values(inv).some(v => v > 0)) {

            if (isZone(tn)) {

              Object.entries(inv).forEach(([type, count]) => {

                for (let i = 0; i < count; i++) {

                  const pt = randomPointInZone(tn);

                  animateScrapArc(w.x, w.y, pt.x, pt.y, type);

                  const gs = { id: uid(), type, x: pt.x, y: pt.y, rotation: Math.random() * 360 };

                  groundScrap.push(gs);

                  drawGroundScrap(gs);

                }

              });

            } else {

              if (!Array.isArray(tn.scrap)) tn.scrap = [];

              Object.entries(inv).forEach(([type, count]) => {

                animateScrapArc(w.x, w.y, tn.x, tn.y, type);

                for (let i = 0; i < count; i++) tn.scrap.push({ type });

              });

              refreshNodeItems(tn); updateNodeStack(tn);

            }

            w.inventory = {};

            workerSay(w, 'Oof!');

            const _prevThirst = w.thirst || 0;
            const _thirstTpl = palette.workers.find(t => t.id === w.templateId);
            w.thirst = Math.min(100, _prevThirst + (_thirstTpl?.thirstRate ?? 3));

            if (_prevThirst < THIRST_PARAMS.thirstThreshold && w.thirst >= THIRST_PARAMS.thirstThreshold) workerSay(w, "Boss, I'm getting thirsty!");

          }

          if (w.thirst >= 100) { workerGoToFridge(w); break; }

          if (w.bladder > THIRST_PARAMS.bladderThreshold) {
            const t = (w.bladder - THIRST_PARAMS.bladderThreshold) / (100 - THIRST_PARAMS.bladderThreshold);
            const prob = 0.01 + 0.99 * Math.pow(t, THIRST_PARAMS.bladderCurveExp);
            if (Math.random() < prob) { workerGoToOuthouse(w); break; }
          }

          if (w.autoMode) { autoAssignWorker(w); w.state = 'chilling'; break; }

          if (promoteBestJob()) break;

          workerStartJourney(w, route, fn, 'to_source');

        }

        break;

      }

      case 'to_slot': {

        const arrived = workerAdvancePath(w, dt);

        if (arrived) w.state = 'waiting';

        break;

      }

      case 'waiting': {

        const allowed = route.allowedTypes || defaultAllowedTypes();

        const hasScrap = isZone(fn)

          ? !!closestZoneScrap(fn, w.x, w.y, allowed)

          : SCRAP_TYPES.some(t => allowed[t.id] && (fn.scrap || []).some(p => p.type === t.id));

        if (hasScrap) {

          w._noWorkTimer = 0;

          workerStartJourney(w, route, fn, 'to_source');

        } else {

          w._noWorkTimer = (w._noWorkTimer || 0) + dt;

          if (w._noWorkTimer >= WORKER_TIMINGS.noWorkEnterSec) {

            w._noWorkTimer = 0;

            w.state = 'no_work';

          }

        }

        break;

      }

      case 'no_work': {

        const allowed = route.allowedTypes || defaultAllowedTypes();

        const hasScrap = isZone(fn)

          ? !!closestZoneScrap(fn, w.x, w.y, allowed)

          : SCRAP_TYPES.some(t => allowed[t.id] && (fn.scrap || []).some(p => p.type === t.id));

        if (hasScrap) {

          w._noWorkTimer = 0;

          w._thinkTimer = 0;

          w.state = 'thinking';

        } else {

          w._noWorkTimer = (w._noWorkTimer || 0) + dt;

          if (w._noWorkTimer >= WORKER_TIMINGS.noWorkWaitSec) {

            w._noWorkTimer = 0;

            if (!promoteBestJob()) workerReturnToIdleZone(w);

          }

        }

        break;

      }

      case 'thinking': {

        w._thinkTimer = (w._thinkTimer || 0) + dt;

        if (w._thinkTimer >= PATHFIND_PARAMS.thinkTime) {

          w._thinkTimer = 0;

          workerSay(w, 'Ok I can work again!');

          w._prevState = 'to_source';

          workerStartJourney(w, route, fn, 'to_source');

        }

        break;

      }

    }

    updateWorkerVisual(w);

    dirty = true;

  } catch(e) { showDebugError(e); } });

  _applyWorkerSeparation();

  // -- Smelter processing --

  smelters.forEach(sm => {

    const inp = nodes.find(n => n.id === sm.inputNodeId);

    const out = nodes.find(n => n.id === sm.outputNodeId);

    if (!inp || !out) return;

    const smWorker = (sm.workerSlots || []).map(id => id ? workers.find(w => w.id === id) : null).find(w => w?.state === 'at_smelter') ?? null;

    const workerReady = smWorker?.state === 'at_smelter';

    if (!workerReady) {

      if (sm.state === 'processing') { sm.state = 'idle'; sm.progress = 0; updateSmelterProgress(sm); }

      updateSmelterLamps(sm); return;

    }

    if (sm.state === 'idle') {

      const counts = {};

      (inp.scrap || []).forEach(s => { if (!isIngotType(s.type)) counts[s.type] = (counts[s.type] || 0) + 1; });

      const available = Object.keys(counts).find(t => counts[t] >= SMELTER_PARAMS.ingotCost && (!sm.smelterType || t === sm.smelterType));

      if (available) { sm.state = 'processing'; sm.processingType = available; sm.progress = 0; updateSmelterProgress(sm); dirty = true; }

    } else if (sm.state === 'processing') {

      sm.progress += dt / SMELTER_PARAMS.conversionTimeSec;

      const VSp = VISUAL_STYLES.smelterSpinner;

      sm.spinnerRot = ((sm.spinnerRot || 0) + VSp.speed * 360 * dt) % 360;

      nodeLayer.findOne('#' + sm.id)?.findOne('.smelter-spinner')?.rotation(sm.spinnerRot);

      if (sm.progress >= 1) {

        sm.progress = 0; sm.state = 'idle'; sm.spinnerRot = 0;

        nodeLayer.findOne('#' + sm.id)?.findOne('.smelter-spinner')?.rotation(0);

        let removed = 0;

        inp.scrap = inp.scrap.filter(s => (s.type === sm.processingType && removed < SMELTER_PARAMS.ingotCost) ? (removed++, false) : true);

        refreshNodeItems(inp); updateNodeStack(inp);

        if (!Array.isArray(out.scrap)) out.scrap = [];

        out.scrap.push({ type: sm.smelterType ? sm.smelterType + '_ingot' : 'ingot' });

        refreshNodeItems(out); updateNodeStack(out);

      }

      updateSmelterProgress(sm);

      dirty = true;

    }

    updateSmelterLamps(sm);

  });

  tickFlashes();

  if (routes.length > 0 && !isWorldIdle()) {

    routeDashOffset -= VISUAL_STYLES.route.animSpeed * dt;

    edgeLayer.find('.routepath').forEach(p => p.dashOffset(routeDashOffset));

    uiLayer.find('.drag-trail').forEach(p => p.dashOffset(routeDashOffset));

    dirty = true;

  }

  if (_dragRagdoll) {

    const VG = VISUAL_STYLES.physicsGhost;

    const T  = VISUAL_STYLES.trafficLightMan;

    const dtN = Math.min(frame.timeDiff / 16.67, 3);

    const rag = _dragRagdoll;

    const step = p => {

      const vx = (p.x - p.px) * VG.damping, vy = (p.y - p.py) * VG.damping;

      p.px = p.x; p.py = p.y;

      p.x += vx; p.y += vy + VG.gravity * T.mass * dtN;

    };

    const pull = (p, ax, ay, dist) => {

      const dx = p.x - ax, dy = p.y - ay, d = Math.hypot(dx, dy) || 0.001;

      if (d > dist) { p.x = ax + dx/d * dist; p.y = ay + dy/d * dist; }

    };

    // Head = anchor + offsetY

    const hx = _dragPhysAnchor.x, hy = _dragPhysAnchor.y + VG.offsetY;

    // Neck

    step(rag.neck); pull(rag.neck, hx, hy, T.headRadius + T.neckGap + 1);

    // Torso bottom

    step(rag.torsoBot); pull(rag.torsoBot, rag.neck.x, rag.neck.y, T.torsoHeight);

    // Torso orientation

    const tdx = rag.torsoBot.x - rag.neck.x, tdy = rag.torsoBot.y - rag.neck.y;

    const tlen = Math.hypot(tdx, tdy) || 0.001;

    const tx = tdx/tlen, ty = tdy/tlen;   // along torso

    const rx = ty,       ry = -tx;         // right perp (clockwise 90°)

    // Shoulder attachment points

    const armOffX = T.torsoWidth/2 + T.armGap + T.armWidth/2;

    const shLx = rag.neck.x + tx*T.armOffsetY - rx*armOffX;

    const shLy = rag.neck.y + ty*T.armOffsetY - ry*armOffX;

    const shRx = rag.neck.x + tx*T.armOffsetY + rx*armOffX;

    const shRy = rag.neck.y + ty*T.armOffsetY + ry*armOffX;

    step(rag.armL); pull(rag.armL, shLx, shLy, T.armHeight);

    step(rag.armR); pull(rag.armR, shRx, shRy, T.armHeight);

    // Hip attachment points

    const legOffX = T.legSeparation/2 + T.legWidth/2;

    const hipLx = rag.torsoBot.x + tx*T.legGap - rx*legOffX;

    const hipLy = rag.torsoBot.y + ty*T.legGap - ry*legOffX;

    const hipRx = rag.torsoBot.x + tx*T.legGap + rx*legOffX;

    const hipRy = rag.torsoBot.y + ty*T.legGap + ry*legOffX;

    step(rag.legL); pull(rag.legL, hipLx, hipLy, T.legHeight);

    step(rag.legR); pull(rag.legR, hipRx, hipRy, T.legHeight);

    // Update Konva shapes — rects pivot at top-center, rotation from atan2(dx,dy)

    const ang = (sx, sy, ex, ey) => Math.atan2(ex - sx, ey - sy) * 180 / Math.PI;

    const len = (sx, sy, ex, ey) => Math.hypot(ex - sx, ey - sy);

    rag.ragHead.x(hx); rag.ragHead.y(hy);

    rag.ragTorso.x(rag.neck.x); rag.ragTorso.y(rag.neck.y); rag.ragTorso.rotation(ang(rag.neck.x, rag.neck.y, rag.torsoBot.x, rag.torsoBot.y)); rag.ragTorso.height(len(rag.neck.x, rag.neck.y, rag.torsoBot.x, rag.torsoBot.y));

    rag.ragArmL.x(shLx); rag.ragArmL.y(shLy); rag.ragArmL.rotation(ang(shLx, shLy, rag.armL.x, rag.armL.y)); rag.ragArmL.height(len(shLx, shLy, rag.armL.x, rag.armL.y));

    rag.ragArmR.x(shRx); rag.ragArmR.y(shRy); rag.ragArmR.rotation(ang(shRx, shRy, rag.armR.x, rag.armR.y)); rag.ragArmR.height(len(shRx, shRy, rag.armR.x, rag.armR.y));

    rag.ragLegL.x(hipLx); rag.ragLegL.y(hipLy); rag.ragLegL.rotation(ang(hipLx, hipLy, rag.legL.x, rag.legL.y)); rag.ragLegL.height(len(hipLx, hipLy, rag.legL.x, rag.legL.y));

    rag.ragLegR.x(hipRx); rag.ragLegR.y(hipRy); rag.ragLegR.rotation(ang(hipRx, hipRy, rag.legR.x, rag.legR.y)); rag.ragLegR.height(len(hipRx, hipRy, rag.legR.x, rag.legR.y));

    dirty = true;

  }

  tickRot += 360 * dt;

  tickIndicatorEl.style.transform = `rotate(${tickRot}deg)`;

  if (dirty) {

    workerLayer.batchDraw();

    edgeLayer.batchDraw();

    uiLayer.batchDraw();

  }

  if (!gamePaused && Date.now() - _lastInputTime > 1800000) setGamePaused(true);

});

anim.start();

// Watchdog: restart animation loop if RAF dies (e.g. backgrounded tab)

setInterval(() => { if (!gamePaused) Konva.Animation._handleAnimation(); }, 1000);



// ===== PLAYBACK =====

let gamePaused = false;

let gameSpeed = 1;

function setGamePaused(paused) {

  if (gamePaused === paused) return;

  gamePaused = paused;

  if (paused) { anim.stop(); pushViewFocus('ViewGhost'); }

  else        { _idleFrameCount = 0; _lastInputTime = Date.now(); anim.start(); popViewFocus(); }

  document.getElementById('pb-play').classList.toggle('active', !paused);

  document.getElementById('pb-pause').classList.toggle('active', paused);

}

document.getElementById('pb-play').addEventListener('click', () => setGamePaused(false));

document.getElementById('pb-pause').addEventListener('click', () => setGamePaused(true));

function setGameSpeed(n) { gameSpeed = n; }

document.addEventListener('mousedown', () => { _lastInputTime = Date.now(); });

document.addEventListener('keydown', e => {

  _lastInputTime = Date.now();

  const _tag = e.target.tagName;

  if (e.code === 'Space' && _tag !== 'INPUT' && _tag !== 'TEXTAREA' && !e.target.isContentEditable) {

    e.preventDefault();

    setGamePaused(!gamePaused);

  }

  if ((e.key === 'h' || e.key === 'H') && !e.repeat) {

    const all = Object.values(HITBOX_TYPE_TO_NAMES).flat();

    refreshHitboxOverlay(all);

  }

  if (e.key === "'" && !e.repeat) {

    const t = e.target;

    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    toggleDebugConsole();

  }

  if ((e.key === 'e' || e.key === 'E') && !e.repeat) {

    const t = e.target;

    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

    toggleEngineMode();

  }

  if (e.key === '1' && !e.repeat) { const t = e.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) setGameSpeed(1); }

  if (e.key === '2' && !e.repeat) { const t = e.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) setGameSpeed(2); }

  if (e.key === '3' && !e.repeat) { const t = e.target; if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) setGameSpeed(4); }

});

document.addEventListener('keyup', e => {

  if (e.key === 'h' || e.key === 'H') refreshHitboxOverlay();

});



function refreshHitboxOverlay(namesOverride) {

  const names = namesOverride ?? Array.from(_hitboxPinnedTypes).flatMap(t => HITBOX_TYPE_TO_NAMES[t] ?? []);

  if (_hitboxDebugLayer) { _hitboxDebugLayer.destroy(); _hitboxDebugLayer = null; }

  if (!names.length) return;

  _hitboxDebugLayer = new Konva.Layer({ listening: false });

  stage.add(_hitboxDebugLayer);

  const sx = stage.scaleX(), sy = stage.scaleY();

  const spx = stage.x(), spy = stage.y();



  // Ordered topmost-first: workerLayer wins over uiLayer wins over edgeLayer, etc.

  const LAYER_META = [

    { layer: workerLayer, short: 'worker', fill: 'rgba(255,80,80,0.28)',  stroke: 'rgba(255,110,110,0.9)', text: 'rgba(255,170,170,0.95)' },

    { layer: uiLayer,     short: 'ui',     fill: 'rgba(255,165,40,0.28)', stroke: 'rgba(255,185,60,0.9)',  text: 'rgba(255,215,130,0.95)' },

    { layer: edgeLayer,   short: 'edge',   fill: 'rgba(60,220,160,0.28)', stroke: 'rgba(80,240,190,0.9)',  text: 'rgba(140,255,215,0.95)' },

    { layer: nodeLayer,   short: 'node',   fill: 'rgba(80,150,255,0.28)', stroke: 'rgba(110,175,255,0.9)', text: 'rgba(170,210,255,0.95)' },

    { layer: gridLayer,   short: 'grid',   fill: 'rgba(190,80,255,0.28)', stroke: 'rgba(210,110,255,0.9)', text: 'rgba(225,165,255,0.95)' },

  ];



  // Collect in hit-priority order: topmost layer first, within layer reversed (last child = topmost = wins)

  const entries = [];

  for (const meta of LAYER_META) {

    for (const name of names) {

      const found = meta.layer.find('.' + name);

      for (let i = found.length - 1; i >= 0; i--) entries.push({ shape: found[i], name, meta });

    }

  }



  entries.forEach(({ shape, name, meta }, idx) => {

    const r = shape.getClientRect();

    const wx = (r.x - spx) / sx, wy = (r.y - spy) / sy;

    const ww = r.width / sx, wh = r.height / sy;

    _hitboxDebugLayer.add(new Konva.Rect({

      x: wx, y: wy, width: ww, height: wh,

      fill: meta.fill, stroke: meta.stroke, strokeWidth: 1.5 / sx, listening: false,

    }));

    _hitboxDebugLayer.add(new Konva.Text({

      x: wx + 2 / sx, y: wy + 2 / sy,

      text: `#${idx + 1} [${meta.short}]\n${name}`,

      fontSize: 9 / sx, lineHeight: 1.3,

      fill: meta.text, listening: false,

    }));

  });



  _hitboxDebugLayer.batchDraw();

}



