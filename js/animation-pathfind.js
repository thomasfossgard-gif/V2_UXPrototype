// ===== MODULE: animation-pathfind.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== SCRAP ARC ANIMATION =====

function animateScrapArc(fromX, fromY, toX, toY, typeId) {

  const t = SCRAP_TYPES.find(s => s.id === typeId);

  const shape = makeScrapShape(typeId, {

    x: fromX, y: fromY, radius: 7,

    fill: t?.color ?? '#fff', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 1,

    listening: false,

  });

  uiLayer.add(shape);

  const duration = 0.38;

  const arcH = Math.max(30, Math.hypot(toX - fromX, toY - fromY) * 0.45);

  const start = performance.now();

  (function tick() {

    const p = Math.min(1, (performance.now() - start) / (duration * 1000));

    shape.x(fromX + (toX - fromX) * p);

    shape.y(fromY + (toY - fromY) * p - arcH * Math.sin(Math.PI * p));

    shape.opacity(p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15);

    uiLayer.batchDraw();

    if (p < 1) requestAnimationFrame(tick);

    else { wakeAnimation(); shape.destroy(); }

  })();

}



// ===== DEBUG OVERLAY =====

const _debugSeen = new Set();

function showDebugError(e) {

  const msg = e?.stack || String(e);

  if (_debugSeen.has(msg)) return;

  _debugSeen.add(msg);

  const el = document.createElement('div');

  el.className = 'debug-error';

  el.textContent = msg;

  document.getElementById('debug-overlay').appendChild(el);

  setTimeout(() => { el.remove(); _debugSeen.delete(msg); }, 8000);

}



// ===== ANIMATION (worker shuttle + route dash) =====

// Pathfinding parameters — all exposed in the gameplay panel.






const CHIP_SHOP_PARAMS = {
  prices: [40, 80, 160],
  maxChips: 3,
};

let playerMoney = 0;

let _winState = 0;




// Seed per-worker phrase pools from global defaults (overridden by Save to Code once saved)

palette.workers.forEach(tpl => {

  if (!tpl.chillWalk)    tpl.chillWalk    = WORKER_STATE_CHATTER.chill_walk.slice();

  if (!tpl.chillRest)    tpl.chillRest    = WORKER_STATE_CHATTER.chill_rest.slice();

  if (!tpl.chillPhrases) tpl.chillPhrases = CHILL_PHRASES.slice();

});



// ===== A* PATHFINDER =====

function _cellKey(cx, cy) { return cx + ',' + cy; }

function _worldToCell(x, y) {

  const c = PATHFIND_PARAMS.cellSize;

  return { cx: Math.round(x / c), cy: Math.round(y / c) };

}

function _cellToWorld(cx, cy) {

  const c = PATHFIND_PARAMS.cellSize;

  return { x: cx * c, y: cy * c };

}

// Returns array of world {x,y} waypoints, or null if no path found.

// routeWps: the route waypoints used for cost-bias (cells near them are cheaper).

function findPathAStar(fromX, fromY, toX, toY, routeWps) {

  const CELL = PATHFIND_PARAMS.cellSize;

  const MAX   = PATHFIND_PARAMS.maxIterations;

  // Build impassable obstacle set (cells occupied by obstacle nodes)

  const blocked = new Set();

  const obsHalf = Math.ceil(VISUAL_STYLES.pileSquare.size / 2 / CELL);

  nodes.forEach(n => {

    if (n.kind !== 'obstacle') return;

    const nc = _worldToCell(n.x, n.y);

    for (let dx = -obsHalf; dx <= obsHalf; dx++)

      for (let dy = -obsHalf; dy <= obsHalf; dy++)

        blocked.add(_cellKey(nc.cx + dx, nc.cy + dy));

  });

  // Build route-near cell set for cost bias

  const nearRoute = new Set();

  if (routeWps && routeWps.length > 1) {

    for (let i = 0; i < routeWps.length - 1; i++) {

      const a = routeWps[i], b = routeWps[i + 1];

      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL * 0.5)));

      for (let s = 0; s <= steps; s++) {

        const t = s / steps;

        const c = _worldToCell(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

        for (let dx = -1; dx <= 1; dx++)

          for (let dy = -1; dy <= 1; dy++)

            nearRoute.add(_cellKey(c.cx + dx, c.cy + dy));

      }

    }

  }

  const fc = _worldToCell(fromX, fromY);

  const tc = _worldToCell(toX,   toY);

  // Chebyshev heuristic — admissible for 8-directional movement

  const h  = (cx, cy) => Math.max(Math.abs(cx - tc.cx), Math.abs(cy - tc.cy));

  const moveCost = key => nearRoute.has(key) ? PATHFIND_PARAMS.costOnRoute : PATHFIND_PARAMS.costOffRoute;

  const open   = new Map();

  const closed = new Set();

  open.set(_cellKey(fc.cx, fc.cy), { cx: fc.cx, cy: fc.cy, g: 0, f: h(fc.cx, fc.cy), parent: null });

  let iters = 0;

  // 8-directional neighbors: cardinals cost 1×, diagonals cost v2×

  const DIRS = [

    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],

    [-1,-1, Math.SQRT2], [1,-1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],

  ];

  while (open.size > 0 && iters++ < MAX) {

    // Pick lowest-f node

    let bk = null, best = null;

    for (const [k, n] of open) { if (!best || n.f < best.f) { bk = k; best = n; } }

    open.delete(bk); closed.add(bk);

    if (best.cx === tc.cx && best.cy === tc.cy) {

      // Reconstruct path

      const cells = [];

      let cur = best;

      while (cur) { cells.unshift(cur); cur = cur.parent; }

      const path = cells.map(c => _cellToWorld(c.cx, c.cy));

      if (path.length > 0) path[0] = { x: fromX, y: fromY };

      if (path.length > 1) path[path.length - 1] = { x: toX, y: toY };

      return _simplifyPath(path);

    }

    for (const [dx, dy, stepCost] of DIRS) {

      const nx = best.cx + dx, ny = best.cy + dy;

      const nk = _cellKey(nx, ny);

      if (closed.has(nk) || blocked.has(nk)) continue;

      const g = best.g + stepCost * moveCost(nk);

      const ex = open.get(nk);

      if (!ex || g < ex.g) open.set(nk, { cx: nx, cy: ny, g, f: g + h(nx, ny), parent: best });

    }

  }

  return null;

}

function _simplifyPath(pts) {

  if (pts.length <= 2) return pts;

  const out = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {

    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];

    if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 0.5) out.push(b);

  }

  out.push(pts[pts.length - 1]);

  return out;

}



// Compute A* path for worker to targetNode; set state to nextState or 'waiting' on failure.

function workerReturnToSlot(w, route) {

  const sa = route.slotAnchor;

  if (!sa) { w.state = 'waiting'; return; }

  const dx = sa.x - w.x, dy = sa.y - w.y;

  if (dx * dx + dy * dy < 4) { w.state = 'waiting'; return; }

  const path = findPathAStar(w.x, w.y, sa.x, sa.y, routeWaypoints(route));

  if (path) { w.path = path; w.pathIdx = 0; w.state = 'to_slot'; }

  else { w.state = 'waiting'; }

}

function workerReturnToIdleZone(w) {

  const _tpl = palette.workers.find(t => t.id === w.templateId);

  const _dp = (_tpl?.chillPhrases?.length) ? _tpl.chillPhrases : CHILL_PHRASES;

  workerSay(w, _dp[Math.floor(Math.random() * _dp.length)]);

  const iz = nodes.find(n => n.kind === 'idleZone');

  if (!iz) { w.state = 'chilling'; return; }

  const dx = iz.x - w.x, dy = iz.y - w.y;

  if (dx * dx + dy * dy < 100) { w.state = 'chilling'; return; }

  const path = findPathAStar(w.x, w.y, iz.x, iz.y, []);

  if (path) { w.path = path; w.pathIdx = 0; w.state = 'to_idle_zone'; }

  else { w.state = 'chilling'; }

}

function updateFridgeDrinksLabel(node) {
  if (node._drinksLabel) {
    const d = node.drinks ?? 0;
    node._drinksLabel.text(`${d} / ${THIRST_PARAMS.fridgeCapacity}`);
    node._drinksLabel.fill(d === 0 ? 'rgba(200,40,40,1)' : 'rgba(255,255,255,0.55)');
    nodeLayer.batchDraw();
  }
}

function workerGoToFridge(w) {
  const fridges = nodes.filter(n => n.kind === 'fridge' && (n.drinks ?? 0) > 0);
  if (!fridges.length) { workerSay(w, 'No drinks left, boss!'); workerReturnToIdleZone(w); return; }
  const nearest = fridges.reduce((best, f) => {
    const dx = f.x - w.x, dy = f.y - w.y;
    const d = dx * dx + dy * dy;
    return d < best.d ? { f, d } : best;
  }, { f: fridges[0], d: Infinity }).f;
  workerSay(w, 'Time for a drink!');
  const dx = nearest.x - w.x, dy = nearest.y - w.y;
  if (dx * dx + dy * dy < 400) { nearest.drinks = Math.max(0, (nearest.drinks ?? 0) - 1); updateFridgeDrinksLabel(nearest); rebuildYardShopPanel(); w._targetFridge = nearest; w._drinkTimer = THIRST_PARAMS.drinkDuration; w.state = 'drinking'; return; }
  const path = findPathAStar(w.x, w.y, nearest.x, nearest.y, []);
  if (path) { w.path = path; w.pathIdx = 0; w._targetFridge = nearest; w.state = 'to_fridge'; }
  else { workerReturnToIdleZone(w); }
}

function workerGoToOuthouse(w) {
  const outhouses = nodes.filter(n => n.kind === 'outhouse');
  if (!outhouses.length) { workerReturnToIdleZone(w); return; }
  const nearest = outhouses.reduce((best, o) => {
    const dx = o.x - w.x, dy = o.y - w.y;
    const d = dx * dx + dy * dy;
    return d < best.d ? { o, d } : best;
  }, { o: outhouses[0], d: Infinity }).o;
  if (!nearest.waiting) nearest.waiting = [];
  if (!nearest.waiting.includes(w)) nearest.waiting.push(w);
  workerSay(w, 'Gotta go!');
  const dx = nearest.x - w.x, dy = nearest.y - w.y;
  if (dx * dx + dy * dy < 400) {
    w._targetOuthouse = nearest;
    if (!nearest.occupant) { nearest.occupant = w; w._outhouseTimer = THIRST_PARAMS.outhouseDuration; w.state = 'using_outhouse'; }
    else { w.state = 'outhouse_waiting'; }
    return;
  }
  const path = findPathAStar(w.x, w.y, nearest.x, nearest.y, []);
  if (path) { w.path = path; w.pathIdx = 0; w._targetOuthouse = nearest; w.state = 'to_outhouse'; }
  else { workerReturnToIdleZone(w); }
}

