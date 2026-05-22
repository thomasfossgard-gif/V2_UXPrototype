// ===== MODULE: routes.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== ANCHOR DIRECTIONS =====

// Each anchor side has a unit "outward" direction. Routes leave/arrive perpendicular

// to the pile's side, so the first/last segment of any route is always in this direction.

const ANCHOR_DIRS = {

  top:    { x: 0,  y: -1 },

  right:  { x: 1,  y:  0 },

  bottom: { x: 0,  y:  1 },

  left:   { x: -1, y:  0 },

};

function anchorDir(key) { return ANCHOR_DIRS[key] || { x: 1, y: 0 }; }



// Build a list of orthogonal waypoints between two anchors that respects both directions:

// each route stubs out perpendicular to its source side and arrives perpendicular to its

// target side. `stub` is the length of the perpendicular leg before the path can turn.



function pointsToPathData(pts, radius = 14) {

  if (!pts || pts.length < 2) return '';

  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {

    const prev = pts[i-1], curr = pts[i], next = pts[i+1];

    const v1x = curr.x - prev.x, v1y = curr.y - prev.y;

    const l1 = Math.hypot(v1x, v1y) || 1;

    const v2x = next.x - curr.x, v2y = next.y - curr.y;

    const l2 = Math.hypot(v2x, v2y) || 1;

    const r = Math.min(radius, l1 / 2, l2 / 2);

    const bx = curr.x - (v1x / l1) * r, by = curr.y - (v1y / l1) * r;

    const ax = curr.x + (v2x / l2) * r, ay = curr.y + (v2y / l2) * r;

    d += ` L ${bx} ${by} Q ${curr.x} ${curr.y} ${ax} ${ay}`;

  }

  d += ` L ${pts[pts.length-1].x} ${pts[pts.length-1].y}`;

  return d;

}





// Route convenience wrappers — resolve endpoints + directions in one place.

// ===== MINI-ANCHOR HELPERS =====

function closestSideTo(node, other) {

  const dx = other.x - node.x, dy = other.y - node.y;

  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';

  return dy > 0 ? 'bottom' : 'top';

}

function sidePerp(side) {

  if (side === 'right') return { x: 1, y: 0 };

  if (side === 'left')  return { x: -1, y: 0 };

  if (side === 'top')   return { x: 0, y: -1 };

  return { x: 0, y: 1 }; // bottom

}

function closestSide(fromNode, toNode) {

  const dx = toNode.x - fromNode.x, dy = toNode.y - fromNode.y;

  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';

  return dy >= 0 ? 'bottom' : 'top';

}

function ensureRouteSides(route) {

  const fn = findEntity(route.fromId);

  const tn = findEntity(route.toId);

  if (!fn || !tn) return;

  const fp = entityXY(fn), tp = entityXY(tn);

  if (!isZone(fn) && !route.fromSideManual) route.fromSide = closestSide(fp, tp);

  if (!isZone(tn) && !route.toSideManual)   route.toSide   = closestSide(tp, fp);

}

function getPileAnchors(nodeId) {

  const node = nodes.find(n => n.id === nodeId);

  if (!node) return {};

  const halfSize = VISUAL_STYLES.pileSquare.size / 2;

  const sideRoutes = { right: [], left: [], top: [], bottom: [] };

  routes.forEach(route => {

    let isFrom, otherId;

    if (route.fromId === nodeId) { isFrom = true;  otherId = route.toId; }

    else if (route.toId === nodeId) { isFrom = false; otherId = route.fromId; }

    else return;

    ensureRouteSides(route);

    const side = isFrom ? route.fromSide : route.toSide;

    const other = findEntity(otherId); if (!other) return;

    const op = entityXY(other);

    const angle = Math.atan2(op.y - node.y, op.x - node.x);

    sideRoutes[side].push({ route, angle, isFrom });

  });

  Object.values(sideRoutes).forEach(arr => arr.sort((a, b) => a.angle - b.angle));

  const anchors = {};

  Object.entries(sideRoutes).forEach(([side, arr]) => {

    arr.forEach(({ route }, i) => {

      const t = (i + 0.5) / arr.length;

      const off = (t - 0.5) * 2 * halfSize;

      let x, y;

      const ao = VISUAL_STYLES.miniAnchor.offset;

      if (side === 'right')       { x = node.x + halfSize + ao; y = node.y + off; }

      else if (side === 'left')   { x = node.x - halfSize - ao; y = node.y + off; }

      else if (side === 'top')    { x = node.x + off;           y = node.y - halfSize - ao; }

      else                        { x = node.x + off;           y = node.y + halfSize + ao; }

      anchors[route.id] = { x, y, side };

    });

  });

  return anchors;

}

function getZoneRouteAnchor(zone, route) {

  const pos = zonePos(zone);

  const otherId = zone.id === route.fromId ? route.toId : route.fromId;

  const other = findEntity(otherId);

  const otherPos = other ? entityXY(other) : pos;

  return { x: pos.x, y: pos.y, side: closestSide(pos, otherPos) };

}

function getRouteAnchor(route, nodeId) {

  if (_anchorDragState && _anchorDragState.route.id === route.id) {

    const isFrom = _anchorDragState.isFromEnd;

    if ((isFrom && nodeId === route.fromId) || (!isFrom && nodeId === route.toId)) {

      return { x: _anchorDragState.x, y: _anchorDragState.y, side: _anchorDragState.side };

    }

  }

  const zone = zones.find(z => z.id === nodeId);

  if (zone) return getZoneRouteAnchor(zone, route);

  return getPileAnchors(nodeId)[route.id];

}

function pointOnPerimeter(node, mx, my) {

  const halfSize = VISUAL_STYLES.pileSquare.size / 2;

  const dx = mx - node.x, dy = my - node.y;

  if (Math.abs(dx) > Math.abs(dy)) {

    return {

      x: node.x + Math.sign(dx || 1) * halfSize,

      y: node.y + Math.max(-halfSize, Math.min(halfSize, dy)),

      side: dx > 0 ? 'right' : 'left',

    };

  }

  return {

    x: node.x + Math.max(-halfSize, Math.min(halfSize, dx)),

    y: node.y + Math.sign(dy || 1) * halfSize,

    side: dy > 0 ? 'bottom' : 'top',

  };

}

function countSideRoutes(nodeId, side, excludeRouteId) {

  let n = 0;

  routes.forEach(r => {

    if (r.id === excludeRouteId) return;

    if (r.fromId === nodeId && r.fromSide === side) n++;

    else if (r.toId === nodeId && r.toSide === side) n++;

  });

  return n;

}



// Returns the single bend point (if any) for an octilinear path from a to b.

// Travels diagonally until aligned on one axis, then straight to the target.

function octilinearConnector(a, b) {

  const dx = b.x - a.x, dy = b.y - a.y;

  const adx = Math.abs(dx), ady = Math.abs(dy);

  if (adx < 0.5 || ady < 0.5) return [];

  if (Math.abs(adx - ady) < 0.5) return [];

  if (adx < ady) { const half = (ady - adx) / 2; return [{ x: a.x, y: a.y + Math.sign(dy) * half }, { x: b.x, y: b.y - Math.sign(dy) * half }]; }

  const half = (adx - ady) / 2; return [{ x: a.x + Math.sign(dx) * half, y: a.y }, { x: b.x - Math.sign(dx) * half, y: b.y }];

}

function buildRouteSegments(route, useAnchor = true) {

  const fromAnchor = getRouteAnchor(route, route.fromId);

  const toAnchor   = getRouteAnchor(route, route.toId);

  if (!fromAnchor || !toAnchor) return null;

  const stubLen = VISUAL_STYLES.miniAnchor.stubLength;

  const fp = sidePerp(fromAnchor.side);

  const tp = sidePerp(toAnchor.side);

  const fStub = { x: fromAnchor.x + fp.x * stubLen, y: fromAnchor.y + fp.y * stubLen };

  const tStub = { x: toAnchor.x   + tp.x * stubLen, y: toAnchor.y   + tp.y * stubLen };

  const sa = useAnchor && route.slotAnchor;

  if (sa) {

    return [

      { x: fromAnchor.x, y: fromAnchor.y },

      fStub,

      ...octilinearConnector(fStub, sa),

      sa,

      ...octilinearConnector(sa, tStub),

      tStub,

      { x: toAnchor.x, y: toAnchor.y },

    ];

  }

  return [

    { x: fromAnchor.x, y: fromAnchor.y },

    fStub,

    ...octilinearConnector(fStub, tStub),

    tStub,

    { x: toAnchor.x, y: toAnchor.y },

  ];

}



function spreadSlotAnchors() {

  if (!routes.length) return;

  const MIN_DIST = VISUAL_STYLES.slotRect.size + 12;

  const REPULSE_K = 0.5;

  const SPRING_K  = 0.08;

  const MAX_ITER  = 80;

  const natural = routes.map((r, i) => {

    const wp = buildRouteSegments(r, false);

    const n = wp && wp.length >= 2 ? pointAtFraction(wp, 0.5) : null;

    // tiny index offset breaks ties when two routes share the same midpoint

    return n ? { x: n.x + i * 0.01, y: n.y } : null;

  });

  const pos = natural.map(n => n ? { ...n } : null);

  for (let iter = 0; iter < MAX_ITER; iter++) {

    const forces = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < routes.length; i++) {

      if (!pos[i]) continue;

      for (let j = i + 1; j < routes.length; j++) {

        if (!pos[j]) continue;

        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;

        const dist = Math.hypot(dx, dy);

        if (dist >= MIN_DIST) continue;

        const f  = dist < 0.01 ? REPULSE_K * MIN_DIST : REPULSE_K * (MIN_DIST - dist);

        const nx = dist < 0.01 ? Math.cos(i * 2.618) : dx / dist;

        const ny = dist < 0.01 ? Math.sin(i * 2.618) : dy / dist;

        forces[i].x += nx * f; forces[i].y += ny * f;

        forces[j].x -= nx * f; forces[j].y -= ny * f;

      }

    }

    let maxF = 0;

    for (let i = 0; i < routes.length; i++) {

      if (!pos[i] || !natural[i]) continue;

      forces[i].x += SPRING_K * (natural[i].x - pos[i].x);

      forces[i].y += SPRING_K * (natural[i].y - pos[i].y);

      pos[i].x += forces[i].x;

      pos[i].y += forces[i].y;

      maxF = Math.max(maxF, Math.hypot(forces[i].x, forces[i].y));

    }

    if (maxF < 0.1) break;

  }

  routes.forEach((r, i) => { if (pos[i]) r.slotAnchor = pos[i]; });

}



function refreshSlotLayout() {

  spreadSlotAnchors();

  const VSR3 = VISUAL_STYLES.slotRect;

  const _cpOffsets = [[-VSR3.slotChipSpreadX, -VSR3.slotChipSpreadY], [VSR3.slotChipSpreadX, -VSR3.slotChipSpreadY], [-VSR3.slotChipSpreadX, VSR3.slotChipSpreadY], [VSR3.slotChipSpreadX, VSR3.slotChipSpreadY]];

  routes.forEach(r => {

    const grp = edgeLayer.findOne('#' + r.id); if (!grp) return;

    const pd = routePathData(r);

    grp.findOne('.routepath')?.data(pd);

    grp.findOne('.hover-hit-route')?.data(pd);

    const slot = uiLayer.findOne('#slot_' + r.id); if (!slot) return;

    const sa = r.slotAnchor; if (!sa) return;

    slot.position({ x: sa.x, y: sa.y });

    if (_filterPanel?.route.id === r.id) _filterPanel.group.position({ x: sa.x, y: sa.y });

    (r._miniSlots || []).forEach((ms, i) => { if (ms) ms.position({ x: sa.x + _cpOffsets[i][0], y: sa.y + _cpOffsets[i][1] }); });

  });

}



function routePathData(route) {

  const segs = buildRouteSegments(route);

  if (!segs || segs.length < 2) return '';

  const r = VISUAL_STYLES.route.cornerRadius || 0;

  if (r <= 0 || segs.length < 3) {

    let d = `M ${segs[0].x} ${segs[0].y}`;

    for (let i = 1; i < segs.length; i++) d += ` L ${segs[i].x} ${segs[i].y}`;

    return d;

  }

  let d = `M ${segs[0].x} ${segs[0].y}`;

  for (let i = 1; i < segs.length - 1; i++) {

    const prev = segs[i - 1], cur = segs[i], next = segs[i + 1];

    const lenIn  = Math.hypot(cur.x - prev.x, cur.y - prev.y);

    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);

    const ri = Math.min(r, lenIn / 2, lenOut / 2);

    const enterX = cur.x - (cur.x - prev.x) / (lenIn || 1) * ri;

    const enterY = cur.y - (cur.y - prev.y) / (lenIn || 1) * ri;

    const exitX  = cur.x + (next.x - cur.x) / (lenOut || 1) * ri;

    const exitY  = cur.y + (next.y - cur.y) / (lenOut || 1) * ri;

    d += ` L ${enterX} ${enterY} Q ${cur.x} ${cur.y} ${exitX} ${exitY}`;

  }

  const last = segs[segs.length - 1];

  d += ` L ${last.x} ${last.y}`;

  return d;

}



function routeWaypoints(route) {

  return buildRouteSegments(route) || [];

}



function fractionToSegment(wp, frac) {

  let total = 0;

  const segs = [];

  for (let i = 0; i < wp.length - 1; i++) {

    const len = Math.hypot(wp[i+1].x - wp[i].x, wp[i+1].y - wp[i].y);

    segs.push(len); total += len;

  }

  let target = total * frac;

  for (let i = 0; i < segs.length; i++) {

    if (target <= segs[i]) {

      return { segIdx: i, segT: segs[i] === 0 ? 0 : target / segs[i] };

    }

    target -= segs[i];

  }

  return { segIdx: wp.length - 2, segT: 1 };

}

function pointAtFraction(wp, frac) {

  let total = 0;

  const segs = [];

  for (let i = 0; i < wp.length - 1; i++) {

    const len = Math.hypot(wp[i+1].x - wp[i].x, wp[i+1].y - wp[i].y);

    segs.push(len); total += len;

  }

  let target = total * frac;

  for (let i = 0; i < segs.length; i++) {

    if (target <= segs[i]) {

      const t = segs[i] === 0 ? 0 : target / segs[i];

      return { x: wp[i].x + (wp[i+1].x - wp[i].x) * t, y: wp[i].y + (wp[i+1].y - wp[i].y) * t };

    }

    target -= segs[i];

  }

  return wp[wp.length - 1];

}



// ===== ROUTE DRAFTING =====

let lineDraft = null;

let _draftHighlights = [];

function gpPanelTable(rows) {

  return `<table style="width:100%;border-collapse:collapse;font-size:12px">

    ${rows.map(([k,v]) => `

      <tr>

        <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:45%">${k}</td>

        <td style="color:#ddd;padding:5px 4px;border-bottom:1px solid #1c1c1c">${v}</td>

      </tr>`).join('')}

  </table>`;

}

function gpSectionTitle(label) {

  return `<div style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">${label}</div>`;

}



function showNodeInGpPanel(node) {

  if (!gpOpen) toggleGpPanel();

  if (typeof gpSwitchTab === 'function') gpSwitchTab('gameplay');

  const content = document.getElementById('gp-content');

  content.innerHTML = gpSectionTitle('Pile') + gpPanelTable([

    ['ID',       node.id],

    ['Position', `${Math.round(node.x)}, ${Math.round(node.y)}`],

    ['Items',    node.items],

    ['Routes',   routes.filter(r => r.fromId === node.id || r.toId === node.id).length],

  ]);

}



function showWorkerInGpPanel(w) {

  if (!gpOpen) toggleGpPanel();

  if (typeof gpSwitchTab === 'function') gpSwitchTab('gameplay');

  const tpl = palette.workers.find(t => t.id === w.templateId);

  const name = tpl?.name ?? '';

  const activeRouteJob = w.jobs?.find(j => j.type === 'route');

  const route = activeRouteJob ? routes.find(r => r.id === activeRouteJob.id) : null;

  const content = document.getElementById('gp-content');

  content.innerHTML = gpSectionTitle('Character') + `

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">

      <img src="icons/icon_worker_${name}.png" style="width:52px;height:52px;border-radius:8px;border:2px solid #444">

      <span style="font-size:16px;font-weight:700;color:#ddd;text-transform:capitalize">${name}</span>

    </div>` +

    gpPanelTable([

      ['ID',        w.id],

      ['Capacity',  w.capacity],

      ['Chips',     w.chipCount ?? 4],

      ['Jobs',      (w.jobs || []).length],

      ['Route',     route ? `${route.fromId} ? ${route.toId}` : '—'],

      ['Position',  `${Math.round(w.x)}, ${Math.round(w.y)}`],

    ]);

}



function onNodeMouseDown(e, node, grp) {

  if (e.evt.button === 1) {

    e.evt.preventDefault();

    showNodeInGpPanel(node);

    return;

  }

  if (currentMode === 'inspectMode') {

    e.cancelBubble = true;

    openInspectPanel('pile', node, e.evt.clientX, e.evt.clientY);

    return;

  } else if (currentMode === 'drawRoutes') {

    // Routes now start exclusively from anchor circles. Body clicks are no-ops in this mode.

    return;

  } else if (currentMode === 'deleteMode') {

    e.cancelBubble = true;

    showConfirm(e.evt.clientX, e.evt.clientY, 'Delete pile?', () => deleteNode(node));

  } else if (currentMode === 'gameInteract') {

    e.cancelBubble = true;

    startNodeMove(node, grp);

  }

}

function startNodeMove(node, grp) {

  if (node.smelterId) { const sm = smelters.find(s => s.id === node.smelterId); if (sm) startSmelterMove(sm, nodeLayer.findOne('#' + sm.id)); return; }

  if ((node.subtype === 'exportPallet' || node.kind === 'sign' || node.kind === 'fridge' || node.kind === 'outhouse') && !engineVisible) return;

  if (!engineVisible && node.scrap && node.scrap.length > 0) return;

  const onMove = () => {

    const p = getWorldPointer();

    if (!p) return;

    node.x = snap(p.x); node.y = snap(p.y);

    grp.position({ x: node.x, y: node.y });

    redrawRoutesTouching(node.id);

    nodeLayer.batchDraw();

    if (getEffectiveView() === 'ViewHoverReveal' || getEffectiveView() === 'ViewGhost') buildRevealGhosts();

  };

  const onUp = () => {

    stage.off('mousemove.nodedrag');

    stage.off('mouseup.nodedrag');

  };

  stage.on('mousemove.nodedrag', onMove);

  stage.on('mouseup.nodedrag', onUp);

}



function onAnchorMouseDown(e, node, anchorKey) {

  if (e.evt.button !== 0) return;

  e.cancelBubble = true;

  startLineDraft(node, anchorKey);

}

function startLineDraft(fromNode) {

  cancelLineDraft();

  const VR = VISUAL_STYLES.route;

  const VMA = VISUAL_STYLES.miniAnchor;

  const path = new Konva.Path({ stroke: VR.strokeColor, strokeWidth: VR.strokeWidth, dash: [8, 6], lineCap: 'butt', lineJoin: 'round' });

  const endB = new Konva.Circle({ x: fromNode.x, y: fromNode.y, radius: VMA.radius * 0.65, fill: VMA.fill, stroke: VMA.strokeColor, strokeWidth: VMA.strokeWidth, listening: false });

  uiLayer.add(path, endB);

  lineDraft = { fromNode, path, endB };

  dlog('draft', 'start from ' + fromNode.id);

  zones.forEach(z => showZoneAnchor(z));

  _pileAnchors.forEach(dot => anchorBounceIn(dot));

  showLiftDim();

  const VPA = VISUAL_STYLES.pileCenterAnchor;

  _pileAnchors.forEach((dot, nodeId) => {

    const n = nodes.find(n => n.id === nodeId);

    if (!n) return;

    const c = new Konva.Circle({ x: n.x, y: n.y, radius: VPA.radius, fill: VPA.fill, stroke: VPA.stroke, strokeWidth: VPA.strokeWidth, listening: false });

    routeDraftLayer.add(c);

    _draftHighlights.push(c);

  });

  zones.forEach(z => {

    const pos = zonePos(z);

    const c = new Konva.Circle({ x: pos.x, y: pos.y, radius: VPA.radius, fill: VPA.fill, stroke: VPA.stroke, strokeWidth: VPA.strokeWidth, listening: false });

    routeDraftLayer.add(c);

    _draftHighlights.push(c);

  });

  routeDraftLayer.batchDraw();

  pushViewFocus('ViewGhost');

  uiLayer.find('.route-slot').forEach(s => {

    s.findOne('.slot-rect')?.visible(false);

    ['.slot-chip-grid', '.slot-menu', '.slot-delhit', '.slot-gearhit', '.slot-revhit'].forEach(n => s.findOne(n)?.visible(false));

  });

  buildRevealGhosts(false);

  uiLayer.batchDraw();

}

function cancelLineDraft() {

  if (!lineDraft) return;

  dlog('draft', 'end');

  lineDraft.path.destroy();

  lineDraft.endB.destroy();

  lineDraft = null;

  _draftHighlights.forEach(c => c.destroy());

  _draftHighlights = [];

  routeDraftLayer.batchDraw();

  hideLiftDim();

  zones.forEach(z => { if (z.id !== _hoveredZoneId) hideZoneAnchor(z); });

  _pileAnchors.forEach((dot, nodeId) => { if (nodeId !== _hoveredNodeId) anchorShrinkOut(dot); });

  popViewFocus();

  uiLayer.batchDraw();

}

function nodeAtPoint(x, y, excludeId) {

  for (const n of nodes) {

    if (excludeId && n.id === excludeId) continue;

    if (n.kind === 'idleZone') continue;

    const dx = n.x - x, dy = n.y - y;

    if (dx*dx + dy*dy <= 11*11) return n;

  }

  return null;

}

function entityAtPoint(x, y, excludeId) {

  const n = nodeAtPoint(x, y, excludeId);

  if (n) return n;

  for (const z of zones) {

    if (excludeId && z.id === excludeId) continue;

    const pos = zonePos(z);

    const dx = pos.x - x, dy = pos.y - y;

    if (dx*dx + dy*dy <= 11*11) return z;

  }

  return null;

}

stage.on('mousemove', () => {

  if (!lineDraft) return;

  const p = getWorldPointer(); if (!p) return;

  const hitEntity = entityAtPoint(p.x, p.y, lineDraft.fromNode.id);

  const hitPos = hitEntity ? entityXY(hitEntity) : null;

  const wx = lineDraft.fromNode.x, wy = lineDraft.fromNode.y;

  const cx2 = hitPos ? hitPos.x : p.x;

  const cy2 = hitPos ? hitPos.y : p.y;

  const dx = cx2 - wx, dy = cy2 - wy, len = Math.hypot(dx, dy);

  let pd;

  if (len < 2) {

    pd = `M ${wx} ${wy}`;

  } else {

    const VR = VISUAL_STYLES.route;

    const handle = VR.draftTurnRadius;

    const fp = sidePerp(closestSide(lineDraft.fromNode, { x: cx2, y: cy2 }));

    const tp = sidePerp(closestSide({ x: cx2, y: cy2 }, lineDraft.fromNode));

    pd = `M ${wx} ${wy} C ${wx + fp.x*handle} ${wy + fp.y*handle} ${cx2 + tp.x*handle} ${cy2 + tp.y*handle} ${cx2} ${cy2}`;

  }

  lineDraft.path.data(pd);

  lineDraft.endB.position({ x: cx2, y: cy2 });

  buildRevealGhosts(false);

  uiLayer.batchDraw();

});

stage.on('mouseup', () => {

  if (!lineDraft) return;

  const p = getWorldPointer();

  const hitEntity = p ? entityAtPoint(p.x, p.y, lineDraft.fromNode.id) : null;

  let created = false;

  if (hitEntity) {

    const exists = routes.some(j =>

      (j.fromId === lineDraft.fromNode.id && j.toId === hitEntity.id) ||

      (j.toId === lineDraft.fromNode.id && j.fromId === hitEntity.id)

    );

    if (!exists) {

      const route = {

        id: uid(),

        name: 'Route ' + (routes.length + 1),

        maxWorkers: 4,

        workerSlots: [null, null, null, null],

        fromId: lineDraft.fromNode.id, toId: hitEntity.id,

        workerIds: [],

        allowedTypes: defaultAllowedTypes(),

        states: { recentlyCreated: true },

      };

      routes.push(route);

      wakeAnimation();

      drawRoute(route);

      flashRouteCreated(route);

      refreshSlotLayout();

      created = route;

    }

  }

  cancelLineDraft();

  if (created) holdRouteView(created.id);

});





// ===== ROUTE HOVER (shared by route path and slot) =====

function setSlotIconsVisible(route, visible) {

  const slotGrp = uiLayer.findOne('#slot_' + route.id);

  if (!slotGrp) return;

  dlog('slot', (visible ? 'show' : 'hide') + ' icons (' + route.id + ')');

  const VG = VISUAL_STYLES.ghostFade;

  const VSM = VISUAL_STYLES.slotMenu;

  const ms = visible ? VG.inMs : VG.outMs;

  const menuGrp = slotGrp.findOne('.slot-menu');

  if (menuGrp) {

    if (visible) { menuGrp.visible(true); fadeNode(menuGrp, VSM.restOpacity, ms); }

    else { fadeNode(menuGrp, 0, ms, () => menuGrp.visible(false)); }

  }

  // Hit areas: keep visibility toggle synchronous (no visible fade)

  ['.slot-gearhit', '.slot-delhit', '.slot-revhit'].forEach(n => slotGrp.findOne(n)?.visible(visible));

  if (!visible) hideFilterGhost(route);

  uiLayer.batchDraw();

}



// Shared builder for the route filter panel — used by both the real panel and ghost preview.

// Returns { group, draft, triShapes, refreshTris } where draft/triShapes/refreshTris are

// only meaningful in non-ghost mode.

function buildFilterPanelGroup(route, { ghost = false } = {}) {

  const T   = VISUAL_STYLES.uiTheme;

  const VRF = VISUAL_STYLES.routeFilter;

  const slotGrp = uiLayer.findOne('#slot_' + route.id);

  if (!slotGrp) return null;



  const N = SCRAP_TYPES.length;

  const pad = VRF.padding, triR = VRF.triRadius, spacing = VRF.triSpacing;

  const btnH = T.fontSize + 6, btnW = T.fontSize + 14, btnGap = 4;

  const panelW = pad * 2 + (N - 1) * spacing + triR * 2;

  const panelH = pad + triR * 2 + VRF.gapY + btnH + pad;

  const slotHalf = VISUAL_STYLES.slotRect.size / 2;

  const panelTop = -(panelH + slotHalf + 8);



  const group = new Konva.Group({

    x: slotGrp.x(), y: slotGrp.y(),

    opacity: ghost ? 0.35 : 1,

    listening: !ghost,

    name: ghost ? 'filter-ghost-panel' : 'route-filter-panel',

  });



  // Background

  group.add(new Konva.Rect({

    x: -panelW / 2, y: panelTop, width: panelW, height: panelH,

    fill: T.panelBg, stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,

    cornerRadius: T.panelCornerRadius,

    shadowColor: T.shadowColor, shadowBlur: T.shadowBlur,

    shadowOffset: { x: T.shadowOffsetX, y: T.shadowOffsetY }, shadowOpacity: 1,

    listening: false,

  }));



  // Scrap filter triangles

  const triY = panelTop + pad + triR;

  const startX = -(N - 1) * spacing / 2;

  const draft = { ...route.allowedTypes };



  const refreshTris = () => {

    SCRAP_TYPES.forEach((t, i) => triShapes[i].fill(draft[t.id] !== false ? t.color : 'transparent'));

    uiLayer.batchDraw();

  };



  const triShapes = SCRAP_TYPES.map((t, i) => {

    const tri = makeScrapShape(t.id, {

      x: startX + i * spacing, y: triY, radius: triR,

      fill: draft[t.id] !== false ? t.color : 'transparent',

      stroke: t.color, strokeWidth: VRF.triStrokeWidth, listening: false,

    });

    if (!ghost) {

      tri.listening(true);

      tri.on('mousedown', e => {

        e.cancelBubble = true;

        _filterPanel.paintValue = draft[t.id] !== false ? false : true;

        _filterPanel.painting = true;

        draft[t.id] = _filterPanel.paintValue;

        refreshTris();

        const stop = () => { if (_filterPanel) _filterPanel.painting = false; window.removeEventListener('mouseup', stop); };

        window.addEventListener('mouseup', stop);

      });

      tri.on('mouseenter', () => {

        if (!_filterPanel?.painting) return;

        draft[t.id] = _filterPanel.paintValue;

        refreshTris();

      });

    }

    return tri;

  });

  triShapes.forEach(s => group.add(s));



  // Confirm / cancel buttons — flat uiTheme style

  const btnRowY = panelTop + panelH - pad - btnH;

  const confirmBtnX = panelW / 2 - pad - btnW;

  const cancelBtnX  = confirmBtnX - btnGap - btnW;

  const makeFlatBtn = (text, x, onDown) => {

    const grp = new Konva.Group({ x, y: btnRowY, listening: !ghost });

    const bg = new Konva.Rect({

      x: 0, y: 0, width: btnW, height: btnH,

      fill: T.btnBg, stroke: T.btnBorder, strokeWidth: T.btnBorderWidth,

      cornerRadius: T.btnCornerRadius, listening: false,

    });

    const lbl = new Konva.Text({

      x: 0, y: 0, width: btnW, height: btnH,

      text, fontSize: T.fontSize, fontFamily: T.fontFamily || 'system-ui',

      fill: T.btnTextColor, verticalAlign: 'middle', align: 'center',

      listening: false,

    });

    grp.add(bg, lbl);

    if (!ghost) {

      grp.on('mouseenter', () => { bg.fill(T.btnActiveBg); lbl.fill(T.btnActiveTextColor); uiLayer.batchDraw(); document.body.style.cursor = 'pointer'; });

      grp.on('mouseleave', () => { bg.fill(T.btnBg); lbl.fill(T.btnTextColor); uiLayer.batchDraw(); document.body.style.cursor = ''; });

      grp.on('mousedown', e => { e.cancelBubble = true; onDown(); });

    }

    return grp;

  };

  const confirmBtn = makeFlatBtn('✓', confirmBtnX, () => closeRouteFilter(true));

  const cancelBtn  = makeFlatBtn('✕', cancelBtnX,  () => closeRouteFilter(false));

  group.add(confirmBtn, cancelBtn);



  return { group, draft, triShapes, refreshTris };

}



function showFilterGhost(route) {

  hideFilterGhost();

  if (_filterPanel && _filterPanel.route.id === route.id) return;

  const result = buildFilterPanelGroup(route, { ghost: true });

  if (!result) return;

  _filterGhost = { group: result.group, route };

  uiLayer.add(result.group);

  uiLayer.batchDraw();

}



function hideFilterGhost(route) {

  if (!_filterGhost) return;

  if (route && _filterGhost.route.id !== route.id) return;

  _filterGhost.group.destroy();

  uiLayer.batchDraw();

  _filterGhost = null;

}



let _slotIconTipTimer = null;

const _slotIconTipEl = document.getElementById('slot-icon-tooltip');

function _showSlotIconTip(text, clientX, clientY) {

  clearTimeout(_slotIconTipTimer);

  _slotIconTipTimer = setTimeout(() => {

    _slotIconTipEl.textContent = text;

    _slotIconTipEl.style.left = (clientX + 12) + 'px';

    _slotIconTipEl.style.top  = (clientY - 32) + 'px';

    _slotIconTipEl.hidden = false;

  }, 200);

}

function _hideSlotIconTip() {

  clearTimeout(_slotIconTipTimer);

  _slotIconTipEl.hidden = true;

}

function enterRouteHover(route) {

  if (route._hoverViewActive) return;

  _enterSlotHover();

  route._hoverViewActive = true;

  dlog('hover', 'enter route (' + route.id + ')');

  pushViewFocus('ViewGhost');

  setSlotIconsVisible(route, true);

}

function exitRouteHover(route) {

  if (!route._hoverViewActive) return;

  if (_filterPanel && _filterPanel.route.id === route.id) return;

  route._hoverViewActive = false;

  dlog('hover', 'leave route (' + route.id + ')');

  setSlotIconsVisible(route, false);

  popViewFocus();

  _exitSlotHover();

}



// ===== ROUTE RENDER =====

// Rotation for mini anchor triangle: source points away from pile, dest points toward.

// RegularPolygon rotation=0 has a vertex at top (points up).

function anchorRotationDeg(side, isFromEnd) {

  const away = { top: 0, right: 90, bottom: 180, left: 270 };

  const deg = away[side] ?? 90;

  return isFromEnd ? deg : (deg + 180) % 360;

}

// Rotation for source half-circle (Wedge, angle=180). Wedge sweeps clockwise from 0° (right)

// so rotation=-90 makes the dome point right, etc.

function halfCircleRotationDeg(side) {

  return { top: 180, right: -90, bottom: 0, left: 90 }[side] ?? -90;

}



function makeMiniAnchor(route, isFromEnd) {

  const VMA = VISUAL_STYLES.miniAnchor;

  const nodeId = isFromEnd ? route.fromId : route.toId;

  const a = getRouteAnchor(route, nodeId) || { x: 0, y: 0, side: 'right' };

  const shape = isFromEnd

    ? new Konva.Wedge({

        x: a.x, y: a.y,

        radius: VMA.radius,

        angle: 180,

        rotation: halfCircleRotationDeg(a.side),

        stroke: VMA.strokeColor, strokeWidth: VMA.strokeWidth,

        fill: VMA.fill,

        name: 'mini-anchor mini-anchor-from',

        visible: false,

      })

    : new Konva.RegularPolygon({

        x: a.x, y: a.y,

        sides: 3,

        radius: VMA.radius,

        rotation: anchorRotationDeg(a.side, false),

        stroke: VMA.strokeColor, strokeWidth: VMA.strokeWidth,

        fill: VMA.fill,

        name: 'mini-anchor mini-anchor-to',

        visible: false,

      });

  shape.on('mouseenter', () => { containerEl.style.cursor = 'grab'; });

  shape.on('mouseleave', () => { if (!_anchorDragState) containerEl.style.cursor = MODES[currentMode].cursor; });

  shape.on('mousedown', e => {

    if (currentMode !== 'gameInteract') return;

    if (e.evt.button !== 0) return;

    e.cancelBubble = true;

    startMiniAnchorDrag(route, isFromEnd, shape);

  });

  return shape;

}



function flashAnchorReject(circle) {

  const VMA = VISUAL_STYLES.miniAnchor;

  const orig = circle.stroke();

  circle.stroke(VMA.rejectFlashColor);

  edgeLayer.batchDraw();

  setTimeout(() => { circle.stroke(orig); edgeLayer.batchDraw(); }, VMA.rejectFlashDurationMs);

}



function startMiniAnchorDrag(route, isFromEnd, anchorShape) {

  const origNodeId = isFromEnd ? route.fromId : route.toId;

  const origNode = nodes.find(n => n.id === origNodeId);

  if (!origNode) return;

  const original = getPileAnchors(origNodeId)[route.id];

  if (!original) return;

  const VMA = VISUAL_STYLES.miniAnchor;

  const SNAP_R = VISUAL_STYLES.pileSquare.size * 1.8;

  _anchorDragState = {

    route, isFromEnd, anchorShape,

    nodeId: origNodeId, node: origNode,

    targetNode: origNode,

    originalSide: isFromEnd ? route.fromSide : route.toSide,

    x: original.x, y: original.y, side: original.side,

    snapped: false, freeX: original.x, freeY: original.y,

  };

  containerEl.style.cursor = 'grabbing';

  anchorShape.scale({ x: 2, y: 2 });

  edgeLayer.batchDraw();



  const onMove = () => {

    if (!_anchorDragState) return;

    const p = getWorldPointer(); if (!p) return;

    _anchorDragState.freeX = p.x;

    _anchorDragState.freeY = p.y;



    // Find nearest rect-pile or zone within snap radius

    let bestNode = null, bestDist = Infinity;

    for (const nd of nodes) {

      if (nd.shape !== 'rect') continue;

      const dx = nd.x - p.x, dy = nd.y - p.y;

      const d = Math.hypot(dx, dy);

      if (d < SNAP_R && d < bestDist) { bestDist = d; bestNode = nd; }

    }

    for (const z of zones) {

      const zp = zonePos(z);

      const dx = zp.x - p.x, dy = zp.y - p.y;

      const d = Math.hypot(dx, dy);

      if (d < SNAP_R && d < bestDist) { bestDist = d; bestNode = z; }

    }



    const prevTargetId = _anchorDragState.targetNode?.id;

    if (bestNode) {

      _anchorDragState.targetNode = bestNode;

      _anchorDragState.snapped = true;

      let snapX, snapY, snapSide;

      if (isZone(bestNode)) {

        const zp = zonePos(bestNode);

        snapX = zp.x; snapY = zp.y;

        snapSide = closestSide(zp, { x: p.x, y: p.y });

      } else {

        const proj = pointOnPerimeter(bestNode, p.x, p.y);

        snapX = proj.x; snapY = proj.y; snapSide = proj.side;

      }

      _anchorDragState.x = snapX;

      _anchorDragState.y = snapY;

      _anchorDragState.side = snapSide;

      anchorShape.position({ x: snapX, y: snapY });

      anchorShape.rotation(isFromEnd ? halfCircleRotationDeg(snapSide) : anchorRotationDeg(snapSide, false));

      anchorShape.stroke(bestNode.id !== origNodeId ? '#4cf' : VMA.strokeColor);

    } else {

      _anchorDragState.targetNode = null;

      _anchorDragState.snapped = false;

      anchorShape.position({ x: p.x, y: p.y });

      anchorShape.stroke('#f44');

    }



    // Preview the route live using a temporary patch

    const savedFrom = route.fromId, savedTo = route.toId;

    const savedFromSide = route.fromSide, savedToSide = route.toSide;

    if (_anchorDragState.snapped && _anchorDragState.targetNode) {

      if (isFromEnd) { route.fromId = _anchorDragState.targetNode.id; route.fromSide = _anchorDragState.side; }

      else           { route.toId   = _anchorDragState.targetNode.id; route.toSide   = _anchorDragState.side; }

    }

    const grp = edgeLayer.findOne('#' + route.id);

    if (grp) {

      const pd = routePathData(route);

      grp.findOne('.routepath')?.data(pd);

      grp.findOne('.hover-hit-route')?.data(pd);

    }

    const wp = routeWaypoints(route);

    if (wp.length) {

      const mid = pointAtFraction(wp, 0.5);

      const slot = uiLayer.findOne('#slot_' + route.id);

      if (slot) slot.position({ x: mid.x, y: mid.y });

    }

    route.fromId = savedFrom; route.toId = savedTo;

    route.fromSide = savedFromSide; route.toSide = savedToSide;



    edgeLayer.batchDraw();

    uiLayer.batchDraw();

  };



  const cleanup = () => {

    stage.off('mousemove.anchordrag');

    stage.off('mouseup.anchordrag');

    window.removeEventListener('mouseup', onUp);

  };



  const onUp = () => {

    if (!_anchorDragState) { cleanup(); return; }

    const ds = _anchorDragState;

    const shape = ds.anchorShape;

    const prevFromId = route.fromId, prevToId = route.toId;



    if (!ds.snapped || !ds.targetNode) {

      // Dropped in free space — delete the route

      _anchorDragState = null;

      containerEl.style.cursor = MODES[currentMode].cursor;

      cleanup();

      deleteRoute(route);

      return;

    }



    const newNode = ds.targetNode;

    const newSide = ds.side;



    if (newNode.id !== origNodeId) {

      // Moving to a different pile or zone

      if (isFromEnd) { route.fromId = newNode.id; route.fromSide = newSide; route.fromSideManual = !isZone(newNode); }

      else           { route.toId   = newNode.id; route.toSide   = newSide; route.toSideManual   = !isZone(newNode); }

      ensureRouteSides(route);

    } else if (!isZone(newNode)) {

      // Same pile — side change only (zones have no managed sides)

      const originalSide = ds.originalSide;

      if (newSide !== originalSide) {

        const sideCount = countSideRoutes(origNodeId, newSide, route.id);

        if (sideCount >= 4) {

          _anchorDragState = null;

          containerEl.style.cursor = MODES[currentMode].cursor;

          shape.stroke(VMA.strokeColor);

          shape.scale({ x: 1, y: 1 });

          flashAnchorReject(shape);

          redrawRoutesTouching(route.fromId);

          if (route.fromId !== route.toId) redrawRoutesTouching(route.toId);

          cleanup();

          return;

        }

        if (isFromEnd) { route.fromSide = newSide; route.fromSideManual = true; }

        else           { route.toSide   = newSide; route.toSideManual   = true; }

      }

    }



    _anchorDragState = null;

    containerEl.style.cursor = MODES[currentMode].cursor;

    shape.stroke(VMA.strokeColor);

    shape.scale({ x: 1, y: 1 });

    const allIds = new Set([prevFromId, prevToId, route.fromId, route.toId]);

    for (const id of allIds) redrawRoutesTouching(id);

    cleanup();

  };



  stage.on('mousemove.anchordrag', onMove);

  stage.on('mouseup.anchordrag', onUp);

  window.addEventListener('mouseup', onUp);

}



function drawRoute(route) {

  const ep = routeEndpoints(route);

  if (!ep) return;

  ensureRouteSides(route);

  const grp = new Konva.Group({ id: route.id, name: 'route' });

  const VR = VISUAL_STYLES.route;

  const path = new Konva.Path({

    data: routePathData(route),

    stroke: VR.strokeColor, strokeWidth: VR.strokeWidth, lineCap: 'butt', lineJoin: 'round',

    dash: [VR.dashOn, VR.dashOff], dashOffset: 0, name: 'routepath'

  });

  // Wide, nearly-invisible path so route is hoverable even when routepath is hidden.

  const hoverHit = new Konva.Path({

    data: routePathData(route),

    stroke: VISUAL_STYLES.route.strokeColor, strokeWidth: VISUAL_STYLES.hitboxRouteHover.strokeWidth, lineCap: 'round',

    opacity: 0.001, name: 'hover-hit-route',

  });

  const fromAnchor = makeMiniAnchor(route, true);

  const toAnchor   = makeMiniAnchor(route, false);

  grp.add(path, hoverHit, fromAnchor, toAnchor);

  grp.on('mousedown', e => onRouteMouseDown(e, route));

  grp.on('mouseenter', () => { clearTimeout(route._hoverTimer); enterRouteHover(route); });

  grp.on('mouseleave', () => { route._hoverTimer = setTimeout(() => exitRouteHover(route), 0); });

  edgeLayer.add(grp);

  edgeLayer.batchDraw();

  drawSlotForRoute(route);

  refreshSlotPortrait(route);

}

function openBottomRectPath(cx, topY, w, h, r) {

  const x = cx - w / 2;

  // Single continuous path: bottom-left ? up left ? top (with rounded corners) ? down right ? bottom-right.

  // No closing line, so the bottom is open for stroke; fill auto-closes along the bottom edge.

  return [

    `M ${x} ${topY + h}`,

    `L ${x} ${topY + r}`,

    `Q ${x} ${topY} ${x + r} ${topY}`,

    `L ${x + w - r} ${topY}`,

    `Q ${x + w} ${topY} ${x + w} ${topY + r}`,

    `L ${x + w} ${topY + h}`,

  ].join(' ');

}

function createWorkerIconGroup() {

  const WI = VISUAL_STYLES.slotWorkerIcon;

  const grp = new Konva.Group({ name: 'slot-worker-icon', listening: false, visible: false });

  const head = new Konva.Circle({

    x: 0, y: WI.headOffsetY,

    radius: WI.headRadius,

    stroke: WI.color, strokeWidth: WI.strokeWidth,

    fill: 'transparent',

    name: 'slot-wi-head',

  });

  const body = new Konva.Path({

    data: openBottomRectPath(0, WI.bodyOffsetY, WI.bodyWidth, WI.bodyHeight, WI.bodyCornerRadius),

    stroke: WI.color, strokeWidth: WI.strokeWidth,

    fill: 'transparent',

    name: 'slot-wi-body',

  });

  grp.add(head, body);

  return grp;

}

function _makeChip(scale, color, num) {

  const VC = VISUAL_STYLES.chip;

  const w = (VC.badgeWidth ?? 20) * scale;

  const fill = color ? (color.startsWith('#') ? colorAlpha(color, VC.fillAlpha) : color) : VISUAL_STYLES.chipSlot.fill;

  const grp = new Konva.Group({ name: 'chip' });

  const rect = new Konva.Rect({

    x: -w / 2, y: -w / 2, width: w, height: w,

    cornerRadius: VC.cornerRadius,

    fill, stroke: VC.strokeColor, strokeWidth: VC.strokeWidth,

    name: 'chip-rect',

  });

  const fontSize = (VC.numFontSize ?? 20) * scale;

  const lbl = new Konva.Text({

    x: VC.numOffsetX ?? 0, y: VC.numOffsetY ?? 0,

    fontSize, fontFamily: 'monospace',

    fill: VC.numColor ?? 'rgba(255,255,255,0.54)',

    listening: false, text: num != null ? String(num) : '',

    visible: num != null, name: 'chip-lbl',

  });

  lbl.offsetX(lbl.width() / 2); lbl.offsetY(lbl.height() / 2);

  grp.add(rect, lbl);

  return grp;

}

function _makeEmptySlot(scale) {

  const VC = VISUAL_STYLES.chip;

  const CS = VISUAL_STYLES.chipSlot;

  const w = (VC.badgeWidth ?? 20) * scale;

  return new Konva.Rect({

    x: -w / 2, y: -w / 2, width: w, height: w,

    cornerRadius: CS.cornerRadius ?? 3,

    fill: CS.fill, stroke: CS.strokeColor,

    strokeWidth: CS.strokeWidth, dash: [3, 2],

    opacity: CS.opacity ?? 1, name: 'chip-empty',

  });

}

function _slotPositions(n, sx, sy) {

  if (n === 1) return [[0, 0]];

  if (n === 2) return [[-sx, 0], [sx, 0]];

  if (n === 3) return [[-sx, -sy * 0.5], [sx, -sy * 0.5], [0, sy * 0.5]];

  return [[-sx, -sy], [sx, -sy], [-sx, sy], [sx, sy]];

}

function _slotIsLargeMode(entity) {

  const occupied = (entity.workerSlots || []).filter(Boolean).length;

  if (occupied >= 2) return false;

  if (occupied === 1 && currentMode === 'liftWorker' && (entity.maxWorkers ?? 1) > 1) return false;

  return true;

}

function _visibleSlotCount(entity) {

  const occupied = (entity.workerSlots || []).filter(Boolean).length;

  if (_slotIsLargeMode(entity)) return 1;

  return Math.min(occupied + 1, entity.maxWorkers ?? 1);

}

function createSlotChipGrid(maxChips) {

  const VC = VISUAL_STYLES.chip;

  const VSR = VISUAL_STYLES.slotRect;

  const CS = VISUAL_STYLES.chipSlot;

  const scale = CS.scale ?? 0.85;

  const CW = (VC.badgeWidth ?? 20) * scale;

  const fontSize = (VC.numFontSize ?? 16) * scale;

  const sx = VSR.slotChipSpreadX, sy = VSR.slotChipSpreadY;

  const grp = new Konva.Group({ name: 'slot-chip-grid', listening: true, visible: false });

  const positions = _slotPositions(maxChips, sx, sy);

  positions.forEach((pos, i) => {

    const chip = _makeEmptySlot(scale);

    chip.x(pos[0] - CW / 2); chip.y(pos[1] - CW / 2);

    chip.name('slot-chip-' + i);

    grp.add(chip);

    const lbl = new Konva.Text({

      x: pos[0] + (VC.numOffsetX ?? 0), y: pos[1] + (VC.numOffsetY ?? 0),

      fontSize, fontFamily: 'monospace', fill: VC.numColor ?? 'rgba(255,255,255,0.54)',

      listening: false, visible: false, name: 'slot-chip-num-' + i,

    });

    lbl.offsetX(lbl.width() / 2); lbl.offsetY(lbl.height() / 2);

    grp.add(lbl);

  });

  return grp;

}



function applyChipGrid(chipGrid, workerColors, workerNums) {

  const VC = VISUAL_STYLES.chip;

  const CS = VISUAL_STYLES.chipSlot;

  const chips = chipGrid.children.filter(n => /^slot-chip-\d+$/.test(n.name()));

  chips.forEach((chip, i) => {

    const color = workerColors?.[i];

    if (color) {

      const fill = color.startsWith('#') ? colorAlpha(color, VC.fillAlpha) : color;

      chip.fill(fill); chip.stroke(VC.strokeColor); chip.dash([]); chip.strokeWidth(VC.strokeWidth); chip.opacity(1);

    } else {

      chip.fill(CS.fill); chip.stroke(CS.strokeColor); chip.dash([3, 2]); chip.strokeWidth(CS.strokeWidth); chip.opacity(CS.opacity ?? 1);

    }

    const lbl = chipGrid.findOne('.slot-chip-num-' + i);

    if (lbl) {

      const num = workerNums?.[i];

      if (color && num != null) {

        lbl.text(String(num)); lbl.offsetX(lbl.width() / 2); lbl.offsetY(lbl.height() / 2); lbl.visible(true);

      } else { lbl.visible(false); }

    }

  });

}

function refreshSlotPortrait(route) {

  const slotGrp = uiLayer.findOne('#slot_' + route.id); if (!slotGrp) return;

  const VSR = VISUAL_STYLES.slotRect;

  const slotRect = slotGrp.findOne('.slot-rect');

  const slots = route.workerSlots || [null, null, null, null];

  const occupied = slots.some(Boolean);

  const chipGrid = slotGrp.findOne('.slot-chip-grid');

  if (!_routeSlotsVisible && !_hoverRevealActive) {

    if (chipGrid && !chipGrid._fadeTween) chipGrid.visible(false);

    uiLayer.batchDraw();

    return;

  }

  if (chipGrid) {

    chipGrid.visible(true);

    const colors = Array(4).fill(null);

    const nums = Array(4).fill(null);

    slots.forEach((id, i) => {

      const wk = workers.find(x => x.id === id);

      if (wk) {

        colors[i] = wk.color;

        const ji = wk.jobs.findIndex(j => j.type === 'route' && j.id === route.id);

        nums[i] = ji >= 0 ? (wk.jobs[ji]?.chipNum ?? null) : null;

      }

    });

    if (route._liftHover) {

      const hi = route._liftHoverSlot ?? colors.findIndex(c => !c);

      if (hi !== -1) colors[hi] = colors[hi] || 'rgba(255,255,255,0.45)';

    } else if (currentMode === 'liftWorker') { const ni = colors.findIndex(c => !c); if (ni !== -1) colors[ni] = 'rgba(255,255,255,0.15)'; }

    const visible = _visibleSlotCount(route);

    applyChipGrid(chipGrid, colors.slice(0, visible), nums.slice(0, visible));

    // Progressive display

    chipGrid.children.forEach(child => {

      if (/^slot-chip-\d+$/.test(child.name())) {

        const idx = parseInt(child.name().replace('slot-chip-', ''));

        child.visible(idx < visible);

      }

    });

    // Large-mode chip resize

    const _lmVSR = VISUAL_STYLES.slotRect;

    const _lmVCC = VISUAL_STYLES.chip;

    const _lmVCS = VISUAL_STYLES.chipSlot;

    const _lmLarge = _slotIsLargeMode(route);

    const _lmLargeW = (_lmVSR.size ?? 40) - 4;

    const _lmNormW = (_lmVCC.badgeWidth ?? 20) * (_lmVCS.scale ?? 0.85);

    const _lmChipW = _lmLarge ? _lmLargeW : _lmNormW;

    const _lmSX = _lmVSR.slotChipSpreadX ?? 9, _lmSY = _lmVSR.slotChipSpreadY ?? 9;

    const _lmPositions = _lmLarge ? [[0, 0]] :

      [[-_lmSX, -_lmSY], [_lmSX, -_lmSY], [-_lmSX, _lmSY], [_lmSX, _lmSY]].slice(0, visible);

    chipGrid.children.forEach(child => {

      if (!/^slot-chip-\d+$/.test(child.name())) return;

      const _lmIdx = parseInt(child.name().replace('slot-chip-', ''));

      if (_lmIdx >= _lmPositions.length) return;

      const [_lmPx, _lmPy] = _lmPositions[_lmIdx];

      child.x(_lmPx - _lmChipW / 2); child.y(_lmPy - _lmChipW / 2);

      child.width(_lmChipW); child.height(_lmChipW);

      const _lmLbl = chipGrid.findOne('.slot-chip-num-' + _lmIdx);

      if (_lmLbl) {

        const _lmBase = _lmVCC.numFontSize ?? 8;

        _lmLbl.fontSize(_lmLarge ? Math.round(_lmBase * _lmLargeW / _lmNormW) : _lmBase);

        _lmLbl.x(_lmLarge ? 0 : (_lmPx + (_lmVCC.numOffsetX ?? 0)));

        _lmLbl.y(_lmLarge ? (_lmVCC.numOffsetYLarge ?? 0) : (_lmPy + (_lmVCC.numOffsetY ?? 0)));

        _lmLbl.offsetX(_lmLbl.width() / 2); _lmLbl.offsetY(_lmLbl.height() / 2);

      }

    });

    // Sync mini-slot snap targets

    (route._miniSlots || []).forEach((ms, i) => {

      const show = i < visible && !!_routeSlotsVisible;

      if (!ms) return;

      ms.visible(show); ms.listening(show);

      const _msRect = ms.findOne('Rect');

      if (_msRect) {

        const _msHW = _lmLarge ? (_lmLargeW / 2 + 1) : _lmNormW / 2;

        _msRect.x(-_msHW); _msRect.y(-_msHW); _msRect.width(_msHW * 2); _msRect.height(_msHW * 2);

      }

    });

  }

  uiLayer.batchDraw();

}

function refreshAllSlotPortraits() {

  routes.forEach(r => refreshSlotPortrait(r));

  smelters.forEach(sm => refreshSmelterSlot(sm));

}

function drawSlotForRoute(route) {

  const ep = routeEndpoints(route);

  if (!ep) return;

  if (!route.slotAnchor) {

    const wp = buildRouteSegments(route, false);

    if (wp && wp.length >= 2) route.slotAnchor = pointAtFraction(wp, 0.5);

  }

  const sa = route.slotAnchor || { x: 0, y: 0 };

  const grp = new Konva.Group({

    id: 'slot_' + route.id, name: 'route-slot',

    x: sa.x, y: sa.y,

  });

  const VSR = VISUAL_STYLES.slotRect, VSM = VISUAL_STYLES.slotMenu;

  const slotHalf = VSR.size / 2;

  const slot = new Konva.Rect({

    x: -slotHalf, y: -slotHalf, width: VSR.size, height: VSR.size, cornerRadius: VSR.cornerRadius,

    stroke: VSR.strokeColor, strokeWidth: VSR.strokeWidth,

    fill: VSR.fill, visible: false, name: 'slot-rect',

  });

  const chipGrid = createSlotChipGrid(route.maxWorkers ?? 4);



  const hitbox = new Konva.Circle({

    radius: VISUAL_STYLES.hitboxSlot.radius, fillPatternImage: STRIPE_PATTERN, listening: false,

    name: 'hitbox-slot', visible: false,

  });

  // Hover hit rect covers the full bounding box of slot + menu so there are no gaps.

  const _hhPad = VISUAL_STYLES.hitboxSlotHover.pad;

  const _mLay  = _getSlotMenuLayout();

  const _hhLeft  = Math.min(-slotHalf, _mLay.offsetX) - _hhPad;

  const _hhRight = Math.max(slotHalf, _mLay.offsetX + _mLay.menuW) + _hhPad;

  const _hhTop   = Math.min(-slotHalf, _mLay.offsetY) - _hhPad;

  const hoverHit = new Konva.Rect({

    x: _hhLeft, y: _hhTop, width: _hhRight - _hhLeft, height: slotHalf + _hhPad - _hhTop,

    fill: VSR.strokeColor, opacity: 0.001, name: 'hover-hit-slot',

  });

  // Slot menu — rounded rect background with icons punched out as transparent cutouts.

  // The group is positioned at (offsetX, offsetY); icons are laid out within it.

  const _dPad  = VISUAL_STYLES.hitboxSlotIcons.pad;

  const menuBg = new Konva.Rect({ x: 0, y: 0, width: _mLay.menuW, height: _mLay.menuH, fill: VSM.fill, cornerRadius: VSM.cornerRadius, listening: false, name: 'slot-menu-bg' });

  const slotMenu = new Konva.Group({ x: _mLay.offsetX, y: _mLay.offsetY, opacity: VSM.restOpacity, listening: false, name: 'slot-menu' });

  slotMenu.add(menuBg);

  _mLay.icons.forEach(ic => {

    slotMenu.add(new Konva.Image({ image: ic.img, width: ic.w, height: ic.h, x: ic.ix, y: ic.iy, listening: false, name: ic.name }));

  });

  _applySlotMenuIconFilters(slotMenu);

  slotMenu.cache();   // must cache while visible — Konva skips invisible groups

  slotMenu.visible(false);

  // Hit areas — kept outside the cached group so Konva event handling works normally.

  const _delLay  = _mLay.icons.find(i => i.name === 'slot-del');

  const _gearLay = _mLay.icons.find(i => i.name === 'slot-gear');

  const _revLay  = _mLay.icons.find(i => i.name === 'slot-rev');

  const deleteHit = new Konva.Rect({

    x: _mLay.offsetX + _delLay.ix - _dPad - 2, y: _mLay.offsetY + _delLay.iy - _dPad - 2,

    width: _delLay.w + (_dPad + 2) * 2, height: _delLay.h + (_dPad + 2) * 2,

    fill: 'transparent', name: 'slot-delhit', visible: false,

  });

  deleteHit.on('mouseenter', e => { _showSlotIconTip('Delete Route', e.evt.clientX, e.evt.clientY); });

  deleteHit.on('mouseleave', () => { _hideSlotIconTip(); });

  deleteHit.on('mousedown', e => {

    if (currentMode !== 'gameInteract') return;

    e.cancelBubble = true;

    _hideSlotIconTip();

    deleteRoute(route);

  });

  const gearHit = new Konva.Rect({

    x: _mLay.offsetX + _gearLay.ix - _dPad, y: _mLay.offsetY + _gearLay.iy - _dPad,

    width: _gearLay.w + _dPad * 2, height: _gearLay.h + _dPad * 2,

    fill: 'transparent', name: 'slot-gearhit', visible: false,

  });

  gearHit.on('mouseenter', e => { _showSlotIconTip('Filter Scrap', e.evt.clientX, e.evt.clientY); });

  gearHit.on('mouseleave', () => { _hideSlotIconTip(); });

  gearHit.on('mousedown', e => {

    if (currentMode !== 'gameInteract') return;

    if (e.evt.button !== 0) return;

    e.cancelBubble = true;

    _hideSlotIconTip();

    openRouteFilter(route);

  });

  const reverseHit = new Konva.Rect({

    x: _mLay.offsetX + _revLay.ix - _dPad, y: _mLay.offsetY + _revLay.iy - _dPad,

    width: _revLay.w + _dPad * 2, height: _revLay.h + _dPad * 2,

    fill: 'transparent', name: 'slot-revhit', visible: false,

  });

  reverseHit.on('mouseenter', e => { _showSlotIconTip('Reverse Route', e.evt.clientX, e.evt.clientY); });

  reverseHit.on('mouseleave', () => { _hideSlotIconTip(); });

  reverseHit.on('mousedown', e => {

    if (currentMode !== 'gameInteract') return;

    e.cancelBubble = true;

    _hideSlotIconTip();

    reverseRoute(route);

  });

  grp.add(slot, hitbox, hoverHit, slotMenu, deleteHit, gearHit, reverseHit, chipGrid);

  grp.routeRef = route;

  grp.on('mouseenter', () => {

    clearTimeout(route._hoverTimer);

    enterRouteHover(route);

    containerEl.style.cursor = 'pointer';

  });

  grp.on('mouseleave', () => {

    route._hoverTimer = setTimeout(() => exitRouteHover(route), 50);

    containerEl.style.cursor = MODES[currentMode].cursor;

  });

  uiLayer.add(grp);

  // Mini-slots: 4 individual snap targets, one per chip position

  const VC2 = VISUAL_STYLES.chip;

  const VSR2 = VISUAL_STYLES.slotRect;

  const _mScale = VISUAL_STYLES.chipSlot.scale ?? 0.85;

  const _mHW = ((VC2.badgeWidth ?? 20) * _mScale) / 2;

  const _mHH = ((VC2.height ?? 20) * _mScale) / 2;

  const _cpOff = _slotPositions(route.maxWorkers ?? 4, VSR2.slotChipSpreadX, VSR2.slotChipSpreadY);

  route._miniSlots = _cpOff.map((pos, i) => {

    const ms = new Konva.Group({ name: 'slot', x: sa.x + pos[0], y: sa.y + pos[1], visible: !!_routeSlotsVisible, listening: !!_routeSlotsVisible });

    ms.add(new Konva.Rect({ x: -_mHW, y: -_mHH, width: _mHW * 2, height: _mHH * 2, fill: 'transparent' }));

    ms.routeRef = route;

    ms.slotIndex = i;

    ms.on('mouseenter', () => { clearTimeout(route._hoverTimer); enterRouteHover(route); });

    ms.on('mouseleave', () => { route._hoverTimer = setTimeout(() => exitRouteHover(route), 50); });

    ms.on('mousedown', e => {

      if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

      const wId = (route.workerSlots || [])[i]; if (!wId) return;

      e.cancelBubble = true;

      const w = workers.find(x => x.id === wId); if (!w) return;

      const _savedNum = w.jobs.find(j => j.type === 'route' && j.id === route.id)?.chipNum;

      route.workerSlots[i] = null;

      route.workerIds = route.workerSlots.filter(Boolean);

      w.jobs = w.jobs.filter(j => !(j.type === 'route' && j.id === route.id));

      w.state = 'idle'; w.path = null;

      refreshSlotPortrait(route);

      refreshWorkerJobPanel(w);

      if (w._refreshChipRow) w._refreshChipRow();

      startSlotChipDragGeneric(w, grp, _savedNum, i);

    });

    ms.on('contextmenu', e => {

      if (currentMode !== 'gameInteract') return;

      e.cancelBubble = true;

      const wId = (route.workerSlots || [])[i]; if (!wId) return;

      const w = workers.find(x => x.id === wId); if (!w) return;

      route.workerSlots[i] = null;

      route.workerIds = route.workerSlots.filter(Boolean);

      w.jobs = w.jobs.filter(j => !(j.type === 'route' && j.id === route.id));

      w.state = 'idle'; w.path = null; w.inventory = {};

      refreshSlotPortrait(route);

      refreshWorkerJobPanel(w);

      if (w._refreshChipRow) w._refreshChipRow();

      returnChip(grp.x(), grp.y(), w.x, w.y, w.color);

    });

    uiLayer.add(ms);

    return ms;

  });

  uiLayer.batchDraw();

}

function setRouteMaxWorkers(route, newMax) {

  newMax = Math.max(1, Math.min(4, Math.round(newMax)));

  for (let i = newMax; i < (route.workerSlots || []).length; i++) {

    const wId = route.workerSlots[i];

    if (wId) { const w = workers.find(x => x.id === wId); if (w) { w.jobs = w.jobs.filter(j => !(j.type === 'route' && j.id === route.id)); w.state = 'idle'; w.path = null; refreshWorkerJobPanel(w); } }

  }

  route.maxWorkers = newMax;

  route.workerSlots = (route.workerSlots || []).slice(0, newMax);

  while (route.workerSlots.length < newMax) route.workerSlots.push(null);

  route.workerIds = route.workerSlots.filter(Boolean);

  const old = uiLayer.findOne('#slot_' + route.id);

  if (old) old.destroy();

  (route._miniSlots || []).forEach(ms => { if (ms) ms.destroy(); });

  route._miniSlots = null;

  drawSlotForRoute(route);

  refreshSlotPortrait(route);

}

function setSmelterMaxWorkers(sm, newMax) {

  newMax = Math.max(1, Math.min(4, Math.round(newMax)));

  for (let i = newMax; i < (sm.workerSlots || []).length; i++) {

    const wId = sm.workerSlots[i];

    if (wId) { const w = workers.find(x => x.id === wId); if (w) { w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === sm.id)); w.state = 'idle'; w.path = null; refreshWorkerJobPanel(w); } }

  }

  sm.maxWorkers = newMax;

  sm.workerSlots = (sm.workerSlots || []).slice(0, newMax);

  while (sm.workerSlots.length < newMax) sm.workerSlots.push(null);

  const old = uiLayer.findOne('#slot_sm_' + sm.id);

  if (old) old.destroy();

  (sm._miniSlots || []).forEach(ms => { if (ms) ms.destroy(); });

  sm._miniSlots = null;

  drawSmelterSlot(sm);

  refreshSmelterSlot(sm);

}

function redrawRoutesTouching(nodeId) {

  routes.forEach(j => {

    if (j.fromId !== nodeId && j.toId !== nodeId) return;

    const grp = edgeLayer.findOne('#' + j.id); if (!grp) return;

    const ep = routeEndpoints(j); if (!ep) return;

    const fromA = getRouteAnchor(j, j.fromId);

    const toA   = getRouteAnchor(j, j.toId);

    const fromCircle = grp.findOne('.mini-anchor-from');

    const toCircle   = grp.findOne('.mini-anchor-to');

    if (fromA && fromCircle) { fromCircle.position({ x: fromA.x, y: fromA.y }); fromCircle.rotation(halfCircleRotationDeg(fromA.side)); }

    if (toA && toCircle)     { toCircle.position({ x: toA.x, y: toA.y });       toCircle.rotation(anchorRotationDeg(toA.side, false)); }

    if (_filterGhost) { const s = uiLayer.findOne('#slot_' + j.id); if (s && _filterGhost.route.id === j.id) hideFilterGhost(); }

  });

  refreshSlotLayout();

  edgeLayer.batchDraw();

  uiLayer.batchDraw();

  if (getEffectiveView() === 'ViewHoverReveal') buildRevealGhosts();

}

function onRouteMouseDown(e, route) {

  if (currentMode === 'inspectMode') {

    e.cancelBubble = true;

    openInspectPanel('route', route, e.evt.clientX, e.evt.clientY);

    return;

  }

  if (currentMode === 'deleteMode') {

    e.cancelBubble = true;

    showConfirm(e.evt.clientX, e.evt.clientY, 'Delete Route?', () => deleteRoute(route));

    return;

  }

}



