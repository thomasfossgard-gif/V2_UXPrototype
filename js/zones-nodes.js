// ===== MODULE: zones-nodes.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== ZONE BLOB TOOL =====

function isPointInZone(zone, x, y) {

  const r = VISUAL_STYLES.zone.brushRadius;

  return zone.circles.some(c => (c.x - x) ** 2 + (c.y - y) ** 2 <= r * r);

}



function redrawZone(zone) {

  zoneLayer.findOne('#' + zone.id)?.destroy();

  if (!zone.circles.length) {

    const anchor = _zoneAnchors.get(zone.id);

    if (anchor) { anchor.destroy(); _zoneAnchors.delete(zone.id); }

    zoneLayer.batchDraw(); return;

  }

  const VZ = VISUAL_STYLES.zone;

  const r  = VZ.brushRadius;

  const sw = VZ.strokeWidth;

  const shape = new Konva.Shape({

    id: zone.id,

    name: 'zone-shape',

    listening: false,

    sceneFunc(ctx) {

      const VZ2 = VISUAL_STYLES.zone;

      const r2  = VZ2.brushRadius;

      const sw2 = VZ2.strokeWidth;

      const rO  = r2 + sw2 / 2;

      const rI  = Math.max(0, r2 - sw2 / 2);



      // Bounding box of the blob in world coords

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

      zone.circles.forEach(c => {

        if (c.x - rO < x0) x0 = c.x - rO;

        if (c.y - rO < y0) y0 = c.y - rO;

        if (c.x + rO > x1) x1 = c.x + rO;

        if (c.y + rO > y1) y1 = c.y + rO;

      });

      const bw = Math.ceil(x1 - x0);

      const bh = Math.ceil(y1 - y0);



      // Offscreen canvas: build the ring in isolation so destination-out

      // doesn't touch the main layer. One pixel = one world unit; Konva's

      // stage transform scales drawImage automatically.

      const off = document.createElement('canvas');

      off.width = bw; off.height = bh;

      const oc = off.getContext('2d');



      // Step 1 — fill enlarged circles with strokeColor

      oc.beginPath();

      zone.circles.forEach(c => {

        oc.moveTo(c.x - x0 + rO, c.y - y0);

        oc.arc(c.x - x0, c.y - y0, rO, 0, Math.PI * 2);

      });

      oc.fillStyle = VZ2.strokeColor;

      oc.fill();



      // Step 2 — punch out interior, leaving only the ring

      oc.globalCompositeOperation = 'destination-out';

      oc.beginPath();

      zone.circles.forEach(c => {

        oc.moveTo(c.x - x0 + rI, c.y - y0);

        oc.arc(c.x - x0, c.y - y0, rI, 0, Math.PI * 2);

      });

      oc.fillStyle = 'rgba(0,0,0,1)';

      oc.fill();



      // Draw transparent fill on the main canvas (completely independent of ring)

      ctx.beginPath();

      zone.circles.forEach(c => {

        ctx.moveTo(c.x + r2, c.y);

        ctx.arc(c.x, c.y, r2, 0, Math.PI * 2);

      });

      ctx.setAttr('fillStyle', VZ2.fillColor);

      ctx.fill();



      // Composite the ring over the fill

      ctx._context.drawImage(off, x0, y0, bw, bh);

    },

  });

  zoneLayer.add(shape);

  zoneLayer.batchDraw();

}



function spawnZoneAnchor(zone) {

  if (!zone.circles.length) return;

  const old = _zoneAnchors.get(zone.id);

  if (old) old.destroy();

  const cx = zone.circles.reduce((s, c) => s + c.x, 0) / zone.circles.length;

  const cy = zone.circles.reduce((s, c) => s + c.y, 0) / zone.circles.length;

  const VPC = VISUAL_STYLES.pileCenterAnchor;

  const anchor = new Konva.Circle({

    x: cx, y: cy,

    radius: VPC.radius,

    fill: VPC.fill,

    stroke: VPC.strokeColor,

    strokeWidth: VPC.strokeWidth,

    scaleX: 0, scaleY: 0,

    listening: true,

    name: 'zone-anchor',

  });

  setupAnchorEvents(anchor, () => { const pos = zonePos(zone); return { id: zone.id, x: pos.x, y: pos.y }; });

  zoneLayer.add(anchor);

  _zoneAnchors.set(zone.id, anchor);

}



function anchorBounceIn(node) {

  node.getParent()?.moveToTop();

  if (node._anchorTween) { node._anchorTween.destroy(); node._anchorTween = null; }

  const V = VISUAL_STYLES.pileCenterAnchor;

  const t1 = new Konva.Tween({

    node, duration: V.bounceRiseDuration, scaleX: V.bouncePeak, scaleY: V.bouncePeak,

    easing: Konva.Easings.EaseOut,

    onFinish() {

      node._anchorTween = null;

      if (node.scaleX() < 0.01) return;

      const t2 = new Konva.Tween({

        node, duration: V.bounceFallDuration, scaleX: 1, scaleY: 1,

        easing: Konva.Easings.EaseIn,

        onFinish() { node._anchorTween = null; node.getLayer()?.batchDraw(); },

      });

      node._anchorTween = t2;

      t2.play();

      node.getLayer()?.batchDraw();

    },

  });

  node._anchorTween = t1;

  t1.play();

}

function anchorShrinkOut(node) {

  if (!node || node.scaleX() < 0.01) return;

  if (node._anchorTween) { node._anchorTween.destroy(); node._anchorTween = null; }

  const V = VISUAL_STYLES.pileCenterAnchor;

  const t = new Konva.Tween({

    node, duration: V.shrinkDuration, scaleX: 0, scaleY: 0,

    easing: Konva.Easings.EaseIn,

    onFinish() { node._anchorTween = null; node.getLayer()?.batchDraw(); },

  });

  node._anchorTween = t;

  t.play();

}



function setupAnchorEvents(circle, getEntity) {

  circle.on('mouseenter', () => { containerEl.style.cursor = 'crosshair'; _anchorHovered = true; enterPileFocus(); });

  circle.on('mouseleave', () => { containerEl.style.cursor = MODES[currentMode].cursor; _anchorHovered = false; leavePileFocus(); });

  circle.on('mousedown', e => {

    if (currentMode !== 'gameInteract') return;

    if (e.evt.button !== 0) return;

    e.cancelBubble = true;

    startLineDraft(getEntity());

  });

}



function showZoneAnchor(zone) { anchorBounceIn(_zoneAnchors.get(zone.id)); }

function hideZoneAnchor(zone) { anchorShrinkOut(_zoneAnchors.get(zone.id)); }



function addZoneCircle(zone, x, y) {

  zone.circles.push({ x, y });

  redrawZone(zone);

}



function eraseZoneAt(x, y) {

  const r = VISUAL_STYLES.zone.eraseRadius;

  const r2 = r * r;

  let changed = false;

  zones.forEach(zone => {

    const before = zone.circles.length;

    zone.circles = zone.circles.filter(c => (c.x - x) ** 2 + (c.y - y) ** 2 > r2);

    if (zone.circles.length !== before) { redrawZone(zone); changed = true; }

  });

  zones = zones.filter(z => z.circles.length > 0);

  if (changed) zoneLayer.batchDraw();

}



function setupZoneTools() {

  _zoneBrushCursor = new Konva.Circle({

    radius: VISUAL_STYLES.zone.brushRadius,

    fill: VISUAL_STYLES.zone.cursorFill,

    stroke: 'rgba(255,255,255,0.45)',

    strokeWidth: VISUAL_STYLES.zone.cursorStrokeWidth,

    listening: false,

    name: 'zone-brush-cursor',

    visible: false,

  });

  _zoneCursorForbidden = new Konva.Line({

    points: [0, 0, 0, 0],

    stroke: 'rgba(255,255,255,0.9)',

    strokeWidth: VISUAL_STYLES.zone.forbiddenStrokeWidth,

    lineCap: 'round',

    listening: false,

    name: 'zone-cursor-forbidden',

    visible: false,

  });

  uiLayer.add(_zoneBrushCursor, _zoneCursorForbidden);



  let _lastPaintPos = null;



  stage.on('mousemove.zoneHover', () => {

    if (currentMode === 'paintZone' || currentMode === 'eraseZone') return;

    if (lineDraft) return; // lineDraft shows all anchors separately

    const p = getWorldPointer(); if (!p) return;

    const hit = zones.find(z => isPointInZone(z, p.x, p.y));

    const newId = hit?.id || null;

    if (newId === _hoveredZoneId) return;

    if (_hoveredZoneId) {

      const prev = zones.find(z => z.id === _hoveredZoneId);

      if (prev) hideZoneAnchor(prev);

    }

    _hoveredZoneId = newId;

    if (hit) showZoneAnchor(hit);

  });



  stage.on('mouseleave.zoneHover', () => {

    if (_hoveredZoneId) {

      const prev = zones.find(z => z.id === _hoveredZoneId);

      if (prev) hideZoneAnchor(prev);

      _hoveredZoneId = null;

    }

  });



  stage.on('mousemove.zone', () => {

    if (currentMode !== 'paintZone' && currentMode !== 'eraseZone') return;

    const p = getWorldPointer(); if (!p) return;

    const VZ = VISUAL_STYLES.zone;

    const r = currentMode === 'eraseZone' ? VZ.eraseRadius : VZ.brushRadius;

    _zoneBrushCursor.radius(r);

    _zoneBrushCursor.position({ x: p.x, y: p.y });

    // paintZone: show forbidden diagonal when outside the active blob and not mid-stroke

    let forbidden = false;

    if (currentMode === 'paintZone' && !_zonePainting && _activeZoneId) {

      const zone = zones.find(z => z.id === _activeZoneId);

      forbidden = !!zone && !isPointInZone(zone, p.x, p.y);

    }

    _zoneBrushCursor.visible(true);

    const d = r * 0.707;

    _zoneCursorForbidden.points([d, -d, -d, d]);

    _zoneCursorForbidden.position({ x: p.x, y: p.y });

    _zoneCursorForbidden.visible(forbidden);

    uiLayer.batchDraw();

    if (!_zonePainting) return;

    if (currentMode === 'eraseZone') { eraseZoneAt(p.x, p.y); return; }

    if (!_activeZoneId) return;

    const zone = zones.find(z => z.id === _activeZoneId); if (!zone) return;

    if (_lastPaintPos) {

      const dx = p.x - _lastPaintPos.x, dy = p.y - _lastPaintPos.y;

      if (dx * dx + dy * dy < VZ.paintSpacing ** 2) return;

    }

    addZoneCircle(zone, p.x, p.y);

    _lastPaintPos = { x: p.x, y: p.y };

  });



  stage.on('mousedown.zone', e => {

    if (e.evt.button !== 0) return;

    if (currentMode !== 'paintZone' && currentMode !== 'eraseZone') return;

    const p = getWorldPointer(); if (!p) return;

    if (currentMode === 'eraseZone') { _zonePainting = true; eraseZoneAt(p.x, p.y); return; }

    const hitZone = zones.find(z => isPointInZone(z, p.x, p.y));

    if (hitZone) {

      _activeZoneId = hitZone.id;

      _zonePainting = true;

      addZoneCircle(hitZone, p.x, p.y);

      _lastPaintPos = { x: p.x, y: p.y };

    } else {

      _zonePainting = true;

      const newZone = { id: uid(), circles: [], scrap: [] };

      zones.push(newZone);

      _activeZoneId = newZone.id;

      addZoneCircle(newZone, p.x, p.y);

      _lastPaintPos = { x: p.x, y: p.y };

    }

  });



  stage.on('mouseup.zone', () => {

    if (_zonePainting && currentMode === 'paintZone' && _activeZoneId) {

      const zone = zones.find(z => z.id === _activeZoneId);

      if (zone) { spawnZoneAnchor(zone); redrawRoutesTouching(zone.id); }

    }

    _zonePainting = false;

  });

}



// ===== PLACE / DRAW NODES =====

function placeNode(tpl, x, y) {

  const isDecoration = tpl.kind === 'decoration';

  const node = {

    id: uid(), templateId: tpl.id, kind: tpl.kind, x: isDecoration ? x : snap(x), y: isDecoration ? y : snap(y), color: tpl.color, items: 0,

    shape: tpl.shape || 'rect', label: tpl.label || '',

    ...(tpl.subtype && { subtype: tpl.subtype }),

    ...(tpl.kind !== 'idleZone' && tpl.kind !== 'sign' && tpl.kind !== 'fridge' && tpl.kind !== 'outhouse' && { scrap: [] }),

    ...(tpl.kind === 'fridge' && { drinks: THIRST_PARAMS.fridgeCapacity }),

    states: { hovered: false },

  };

  nodes.push(node);

  drawNode(node);

  hideHint();

}

const WORKER_PORTRAITS = {};

const ICON_REVERSE_ROUTE = new Image();

ICON_REVERSE_ROUTE.src = 'icons/icon_reverseRoute.png';

const ICON_SWITCH_DIRECTION = new Image();

ICON_SWITCH_DIRECTION.src = 'icons/icon_switchdirection.png';

const ICON_COGWHEEL = new Image();

ICON_COGWHEEL.src = 'icons/icon_cogwheel.png';

const ICON_DELETE_ROUTE = new Image();

ICON_DELETE_ROUTE.src = 'icons/icon_deleteroute.png';

// Re-cache all slot menus after icon images load so destination-out punch-outs are captured.

function _applySlotMenuIconFilters(g) {

  const hex = VISUAL_STYLES.slotMenu.iconColor;

  const r = parseInt(hex.slice(1,3),16), gr = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);

  g.find('Image').forEach(imgNode => {

    imgNode.filters([Konva.Filters.RGB]);

    imgNode.red(r); imgNode.green(gr); imgNode.blue(b);

    imgNode.cache();

  });

}

function _recacheSlotMenus() {

  uiLayer?.find('.slot-menu').forEach(g => {

    const wasVisible = g.visible();

    if (!wasVisible) g.visible(true);

    _applySlotMenuIconFilters(g);

    g.cache();

    if (!wasVisible) g.visible(false);

  });

  uiLayer?.batchDraw();

}

ICON_SWITCH_DIRECTION.onload = _recacheSlotMenus;

ICON_COGWHEEL.onload = _recacheSlotMenus;

ICON_DELETE_ROUTE.onload = _recacheSlotMenus;

// Returns the computed layout for a slot menu: menu dimensions and per-icon positions within the group.

function _getSlotMenuLayout() {

  const VSM = VISUAL_STYLES.slotMenu;

  const VSG = VISUAL_STYLES.slotGear;

  const VSD = VISUAL_STYLES.slotDelete;

  const VSRev = VISUAL_STYLES.slotReverse;

  const pad = VSM.padding, sp = VSM.iconSpacing;

  // Icons stacked top-to-bottom: delete, reverse, gear

  const defs = [

    { name: 'slot-del',  img: ICON_DELETE_ROUTE,      w: VSD.width,   h: VSD.height },

    { name: 'slot-rev',  img: ICON_SWITCH_DIRECTION,  w: VSRev.width, h: VSRev.height },

    { name: 'slot-gear', img: ICON_COGWHEEL,           w: VSG.width,   h: VSG.height },

  ];

  const maxW = Math.max(...defs.map(i => i.w));

  const menuW = maxW + 2 * pad;

  let cy = pad;

  const icons = defs.map(ic => {

    const ix = (maxW - ic.w) / 2 + pad;

    const iy = cy;

    cy += ic.h + sp;

    return { name: ic.name, img: ic.img, w: ic.w, h: ic.h, ix, iy };

  });

  const menuH = cy - sp + pad;

  return { menuW, menuH, icons, offsetX: VSM.offsetX, offsetY: VSM.offsetY };

}

const ICON_PICK = new Image();

let _pickBase64 = '';

let _pickCursorUrl = `url('icons/icon_pick.png') 16 16, pointer`;

let _pickCursorActive = false;

function rebuildPickCursor() {

  if (!_pickBase64) return;

  const s = VISUAL_STYLES.hitboxTri.cursorSize, h = Math.round(s / 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">` +

    `<image href="${_pickBase64}" width="${s}" height="${s}"/></svg>`;

  _pickCursorUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${h} ${h}, pointer`;

  if (_pickCursorActive) containerEl.style.cursor = _pickCursorUrl;

}

ICON_PICK.onload = () => {

  const c = document.createElement('canvas');

  c.width = ICON_PICK.naturalWidth; c.height = ICON_PICK.naturalHeight;

  c.getContext('2d').drawImage(ICON_PICK, 0, 0);

  _pickBase64 = c.toDataURL();

  rebuildPickCursor();

};

ICON_PICK.src = 'icons/icon_pick.png';

palette.workers.forEach(tpl => {

  if (!tpl.name) return;

  const img = new Image();

  img.onload = () => {

    // Correct crop for any workers drawn before this image finished loading.

    const VW = VISUAL_STYLES.worker;

    const zoom = VW.portraitZoom;

    const cw = img.naturalWidth / zoom, ch = img.naturalHeight / zoom;

    workerLayer.find('.workercircle').forEach(node => {

      const grp = node.getParent();

      const w = grp && workers.find(w => w.id === grp.id());

      const wTpl = w && palette.workers.find(t => t.id === w.templateId);

      if (!wTpl || wTpl.name !== tpl.name) return;

      node.cropX((img.naturalWidth - cw) / 2);

      node.cropY((img.naturalHeight - ch) / 2);

      node.cropWidth(cw);

      node.cropHeight(ch);

    });



    workerLayer.batchDraw();

  };

  img.src = `icons/icon_worker_${tpl.name}.png`;

  WORKER_PORTRAITS[tpl.name] = img;

});



const STRIPE_PATTERN = (() => {

  const c = document.createElement('canvas');

  c.width = 8; c.height = 8;

  const ctx = c.getContext('2d');

  ctx.fillStyle = 'rgba(120,120,120,0.32)';

  ctx.fillRect(0, 0, 8, 8);

  ctx.strokeStyle = 'rgba(220,220,220,0.55)';

  ctx.lineWidth = 1.5;

  ctx.beginPath();

  for (let i = -8; i <= 16; i += 4) {

    ctx.moveTo(i, 8);

    ctx.lineTo(i + 8, 0);

  }

  ctx.stroke();

  return c;

})();

// Pile connection anchors — small handles on each side that workers' routes attach to.

// Hidden by default; shown on pile hover and during a line draft (all piles' anchors light up).

const ANCHORS = ['top', 'right', 'bottom', 'left'];

const ANCHOR_OFFSETS = {

  top:    { x: 0,   y: -22 },

  right:  { x: 22,  y: 0   },

  bottom: { x: 0,   y: 22  },

  left:   { x: -22, y: 0   },

};

function anchorPos(node, key) {

  const off = ANCHOR_OFFSETS[key] || { x: 0, y: 0 };

  return { x: node.x + off.x, y: node.y + off.y };

}

function defaultAnchorsBetween(fromNode, toNode) {

  const dx = toNode.x - fromNode.x;

  const dy = toNode.y - fromNode.y;

  if (Math.abs(dx) >= Math.abs(dy)) {

    return { from: dx >= 0 ? 'right' : 'left', to: dx >= 0 ? 'left' : 'right' };

  }

  return { from: dy >= 0 ? 'bottom' : 'top', to: dy >= 0 ? 'top' : 'bottom' };

}

function zonePos(zone) {

  if (!zone.circles.length) return { x: 0, y: 0 };

  return {

    x: zone.circles.reduce((s, c) => s + c.x, 0) / zone.circles.length,

    y: zone.circles.reduce((s, c) => s + c.y, 0) / zone.circles.length,

  };

}

function findEntity(id) {

  return nodes.find(n => n.id === id) || zones.find(z => z.id === id) || null;

}

function entityXY(e) {

  if (!e) return null;

  return e.circles ? zonePos(e) : { x: e.x, y: e.y };

}

function isZone(e) { return e && Array.isArray(e.circles); }



function routeEndpoints(route) {

  const fn = findEntity(route.fromId);

  const tn = findEntity(route.toId);

  if (!fn || !tn) return null;

  const fp = entityXY(fn), tp = entityXY(tn);

  return { fn, tn, from: fp, to: tp };

}

// Snap target while drafting a route. Hits the closest anchor on any pile other than the source,

// either directly (small radius around the anchor) or via the pile body (snap to closest anchor).

function anchorAtPoint(x, y, srcNodeId) {

  let best = null, bestD = Infinity;

  for (const n of nodes) {

    if (n.id === srcNodeId) continue;

    if (n.kind === 'obstacle' || n.kind === 'decoration') continue;

    // Direct anchor proximity

    for (const key of ANCHORS) {

      const ap = anchorPos(n, key);

      const dx = ap.x - x, dy = ap.y - y;

      const d = dx*dx + dy*dy;

      if (d <= 12*12 && d < bestD) { bestD = d; best = { node: n, key }; }

    }

    // Body proximity ? snap to closest anchor of this pile

    const ddx = n.x - x, ddy = n.y - y;

    if (ddx*ddx + ddy*ddy <= 24*24) {

      let cKey = null, cDist = Infinity;

      for (const key of ANCHORS) {

        const ap = anchorPos(n, key);

        const ax = ap.x - x, ay = ap.y - y;

        const dd = ax*ax + ay*ay;

        if (dd < cDist) { cDist = dd; cKey = key; }

      }

      if (cKey && cDist < bestD) { bestD = cDist; best = { node: n, key: cKey }; }

    }

  }

  return best;

}

// ============================================================================

// INSTANCE STATES

// Each visual entity carries a `states` bag — boolean tags set by game logic.

// Visual rendering = (view-mode global rule) + (state-driven decoration).

// applyXState(entity) computes the on-screen presentation for one entity from

// its current states; refreshAllX() runs over all of that type.

// ============================================================================

function applyPileState(_node) {

  // no-op — side anchors removed; pile state drives nothing visual here

}

function refreshAllPiles() {

  nodes.forEach(applyPileState);

  nodeLayer.batchDraw();

}

function setPileState(node, key, value) {

  if (!node.states) node.states = {};

  node.states[key] = !!value;

  applyPileState(node);

  nodeLayer.batchDraw();

}

function refreshAllWorkers() {

  workerLayer.batchDraw();

}

function redrawAllWorkers() {

  workers.forEach(w => {

    workerLayer.findOne('#' + w.id)?.destroy();

    drawWorker(w);

  });

  refreshAllWorkers();

}

function setWorkerState(w, key, value) {

  if (!w.states) w.states = {};

  w.states[key] = !!value;

  applyWorkerState(w);

  workerLayer.batchDraw();

}



function buildPileDotPattern(color) {

  const c = document.createElement('canvas');

  c.width = 6; c.height = 6;

  const ctx = c.getContext('2d');

  ctx.fillStyle = color;

  ctx.fillRect(2, 2, 1, 1);

  return c;

}

let PILE_DOT_PATTERN = buildPileDotPattern(VISUAL_STYLES.pileSquare.dotPatternColor);

function drawDecoration(node) {

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'decoration', draggable: true });



  if (node.shape === 'building') {

    const VB = VISUAL_STYLES.building;

    const w = VB.width / 2, h = VB.height / 2;

    const topHalf = new Konva.Rect({ x: -w, y: -h, width: VB.width, height: h, cornerRadius: [VB.cornerRadius, VB.cornerRadius, 0, 0], fill: VB.topColor, stroke: VB.strokeColor, strokeWidth: VB.strokeWidth, name: 'building-top' });

    const botHalf = new Konva.Rect({ x: -w, y: 0, width: VB.width, height: h, cornerRadius: [0, 0, VB.cornerRadius, VB.cornerRadius], fill: VB.bottomColor, stroke: VB.strokeColor, strokeWidth: VB.strokeWidth, name: 'building-bottom' });

    const VD = VISUAL_STYLES.buildingDoor;

    const door = new Konva.Rect({ x: VD.offsetX - VD.width/2, y: VD.offsetY - VD.height/2, width: VD.width, height: VD.height, fill: VD.color, stroke: 'rgba(0,0,0,0.3)', strokeWidth: 0.5, name: 'building-door' });

    const VS = VISUAL_STYLES.buildingSupport;

    const sup1 = new Konva.Rect({ x: -w/2 - VS.width/2, y: h - VS.height/2, width: VS.width, height: VS.height, fill: VS.color, name: 'building-support' });

    const sup2 = new Konva.Rect({ x: w/2 - VS.width/2, y: h - VS.height/2, width: VS.width, height: VS.height, fill: VS.color, name: 'building-support' });

    const VC = VISUAL_STYLES.buildingChimney;

    const chimney = new Konva.Rect({ x: VC.offsetX - VC.width/2, y: VC.offsetY - VC.height/2, width: VC.width, height: VC.height, fill: VC.color, name: 'building-chimney' });

    const VSg = VISUAL_STYLES.buildingSign;

    const signBg = new Konva.Rect({ x: -VSg.width/2, y: VSg.offsetY - VSg.height/2, width: VSg.width, height: VSg.height, cornerRadius: 3, fill: VSg.color, stroke: 'rgba(0,0,0,0.3)', strokeWidth: 0.5, name: 'building-sign-bg' });

    const signText = new Konva.Text({ x: -VSg.width/2, y: VSg.offsetY - VSg.height/2 + 3, width: VSg.width, height: VSg.height, text: 'Office', fontSize: VSg.fontSize, fontFamily: 'system-ui, sans-serif', fill: VSg.textColor, align: 'center', verticalAlign: 'middle', name: 'building-sign-text' });

    grp.add(topHalf, botHalf, door, sup1, sup2, chimney, signBg, signText);

  } else if (node.shape === 'tree') {

    const VT = VISUAL_STYLES.tree;

    const trunk = new Konva.Rect({ x: -VT.trunkWidth/2, y: VT.canopyHeight - VT.trunkHeight, width: VT.trunkWidth, height: VT.trunkHeight, fill: VT.trunkColor, name: 'tree-trunk' });

    const canopy = new Konva.RegularPolygon({ x: 0, y: VT.canopyRadius * 0.3, sides: 3, radius: VT.canopyRadius, fill: VT.canopyColor, name: 'tree-canopy' });

    grp.add(trunk, canopy);

  }



  grp.on('dragend', () => {

    node.x = grp.x();

    node.y = grp.y();

  });



  grp.draggable(engineVisible);

  grp.listening(engineVisible);

  nodeLayer.add(grp);

  nodeLayer.batchDraw();

}

function drawIdleZone(node) {

  const VIZ = VISUAL_STYLES.idleZone;

  const half = VIZ.size / 2;

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'idlezone-node' });

  grp.add(new Konva.Rect({

    x: -half, y: -half, width: VIZ.size, height: VIZ.size,

    cornerRadius: VIZ.cornerRadius, fill: VIZ.fill,

    stroke: VIZ.strokeColor, strokeWidth: VIZ.strokeWidth,

    name: 'nodeshape',

  }));

  grp.on('mousedown', e => {

    if (e.evt.button === 1) { e.evt.preventDefault(); showNodeInGpPanel(node); return; }

    if (currentMode === 'inspectMode') { e.cancelBubble = true; openInspectPanel('pile', node, e.evt.clientX, e.evt.clientY); return; }

    if (currentMode === 'deleteMode') { e.cancelBubble = true; showConfirm(e.evt.clientX, e.evt.clientY, 'Delete idle zone?', () => deleteNode(node)); }

    // gameInteract: no capture — mouse falls through to stage

  });

  nodeLayer.add(grp);

  grp.moveToBottom();

  nodeLayer.batchDraw();

}

function drawObstacle(node) {

  const VO = VISUAL_STYLES.obstacle;

  const half = VISUAL_STYLES.pileSquare.size / 2;

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'obstacle-node' });

  grp.add(new Konva.Rect({

    x: -half, y: -half, width: half * 2, height: half * 2,

    fill: VO.color, stroke: VO.strokeColor, strokeWidth: VO.strokeWidth,

    cornerRadius: VO.cornerRadius, name: 'obstacle-shape',

  }));

  const xOff = half * 0.5;

  grp.add(new Konva.Line({ points: [-xOff, -xOff, xOff, xOff], stroke: VO.strokeColor, strokeWidth: VO.strokeWidth + 1, lineCap: 'round', listening: false, name: 'obstacle-x1' }));

  grp.add(new Konva.Line({ points: [ xOff, -xOff, -xOff, xOff], stroke: VO.strokeColor, strokeWidth: VO.strokeWidth + 1, lineCap: 'round', listening: false, name: 'obstacle-x2' }));

  grp.on('mousedown', e => {

    if (currentMode === 'deleteMode') {

      e.cancelBubble = true;

      showConfirm(e.evt.clientX, e.evt.clientY, 'Delete obstacle?', () => deleteNode(node));

    } else if (currentMode === 'gameInteract') {

      e.cancelBubble = true;

      startNodeMove(node, grp);

    }

  });

  nodeLayer.add(grp);

  nodeLayer.batchDraw();

}

function openSignEditor(node, grp) {

  const VS = VISUAL_STYLES.sign;

  const hw = VS.boardWidth / 2;

  const totalH = VS.boardHeight + VS.poleHeight;

  const boardY = -totalH / 2;

  const absPos = grp.getAbsolutePosition();

  const stageRect = stage.container().getBoundingClientRect();

  const sc = stage.scaleX();

  const inp = document.createElement('input');

  inp.type = 'text';

  inp.value = node.label || '';

  inp.style.cssText = `position:fixed;left:${(stageRect.left + absPos.x - hw * sc).toFixed(1)}px;top:${(stageRect.top + absPos.y + boardY * sc).toFixed(1)}px;width:${(VS.boardWidth * sc).toFixed(1)}px;height:${(VS.boardHeight * sc).toFixed(1)}px;font-size:${(VS.textSize * sc).toFixed(1)}px;font-family:system-ui,sans-serif;font-weight:bold;text-align:center;background:${VS.boardColor};color:${VS.textColor};border:${VS.boardBorderWidth}px solid ${VS.boardBorderColor};border-radius:${VS.boardCornerRadius}px;padding:0 4px;box-sizing:border-box;outline:none;z-index:9999;`;

  document.body.appendChild(inp);

  inp.focus();

  inp.select();

  let done = false;

  const finish = (save) => {

    if (done) return;

    done = true;

    if (save) {

      node.label = inp.value;

      const t = nodeLayer.findOne('#' + node.id)?.findOne('.sign-text');

      if (t) { t.text(node.label); nodeLayer.batchDraw(); }

    }

    inp.remove();

  };

  inp.addEventListener('keydown', e => {

    if (e.key === 'Enter')  { e.preventDefault(); finish(true); }

    if (e.key === 'Escape') { e.preventDefault(); finish(false); }

    e.stopPropagation();

  });

  inp.addEventListener('blur', () => finish(true));

}

function drawSign(node) {

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'sign-node' });

  const VS = VISUAL_STYLES.sign;

  const hw = VS.boardWidth / 2;

  const totalH = VS.boardHeight + VS.poleHeight;

  const boardY = -totalH / 2;

  const poleY  = boardY + VS.boardHeight;

  grp.add(new Konva.Rect({ x: -VS.poleWidth / 2, y: poleY, width: VS.poleWidth, height: VS.poleHeight, fill: VS.poleColor, cornerRadius: 1, listening: false, name: 'sign-pole' }));

  grp.add(new Konva.Rect({ x: -hw, y: boardY, width: VS.boardWidth, height: VS.boardHeight, fill: VS.boardColor, stroke: VS.boardBorderColor, strokeWidth: VS.boardBorderWidth, cornerRadius: VS.boardCornerRadius, listening: false, name: 'sign-board' }));

  grp.add(new Konva.Text({ x: -hw, y: boardY, width: VS.boardWidth, height: VS.boardHeight, text: node.label || 'Sign', fontSize: VS.textSize, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fill: VS.textColor, align: 'center', verticalAlign: 'middle', listening: false, name: 'sign-text' }));

  grp.add(new Konva.Rect({ x: -hw, y: boardY, width: VS.boardWidth, height: totalH, fill: 'transparent', name: 'sign-hit' }));

  grp.on('mousedown', e => onNodeMouseDown(e, node, grp));

  grp.on('dblclick', () => { if (engineVisible) openSignEditor(node, grp); });

  nodeLayer.add(grp);

  nodeLayer.batchDraw();

}



function drawFridge(node) {

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'fridge-node' });

  const VS = VISUAL_STYLES.fridge;

  const hw = VS.bodyWidth / 2;

  const hh = VS.bodyHeight / 2;

  grp.add(new Konva.Rect({

    x: -hw, y: -hh, width: VS.bodyWidth, height: VS.bodyHeight,

    fill: VS.bodyColor, cornerRadius: VS.cornerRadius,

    listening: false, name: 'fridge-body',

  }));

  grp.add(new Konva.Line({

    points: [-hw + 1, -hh + VS.doorLineY, hw - 1, -hh + VS.doorLineY],

    stroke: VS.doorLineColor, strokeWidth: 1, listening: false, name: 'fridge-door-line',

  }));

  grp.add(new Konva.Circle({

    x: hw - 5, y: VS.doorLineY / 2,

    radius: VS.handleRadius, fill: VS.handleColor, listening: false, name: 'fridge-handle',

  }));

  for (let i = 0; i < 2; i++) {

    grp.add(new Konva.Rect({

      x: -hw + (i === 0 ? VS.bodyWidth * 0.25 : VS.bodyWidth * 0.75) - VS.legWidth / 2,

      y: hh, width: VS.legWidth, height: VS.legHeight,

      fill: VS.legColor, listening: false, name: 'fridge-leg',

    }));

  }

  grp.add(new Konva.Rect({

    x: -hw, y: -hh, width: VS.bodyWidth, height: VS.bodyHeight + VS.legHeight,

    fill: 'transparent', name: 'fridge-hit',

  }));

  grp.add(new Konva.Text({

    x: -40, y: -hh - 18, width: 80, align: 'center',

    text: 'FRIDGE', fontSize: 6, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',

    fill: 'rgba(255,255,255,0.55)', listening: false, name: 'fridge-label',

  }));

  const drinks0 = node.drinks ?? THIRST_PARAMS.fridgeCapacity;

  const _drinksLbl = new Konva.Text({

    x: -40, y: -hh - 10, width: 80, align: 'center',

    text: `${drinks0} / ${THIRST_PARAMS.fridgeCapacity}`,

    fontSize: 6, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',

    fill: drinks0 === 0 ? 'rgba(200,40,40,1)' : 'rgba(255,255,255,0.55)',

    listening: false, name: 'fridge-drinks-label',

  });

  grp.add(_drinksLbl);

  node._drinksLabel = _drinksLbl;

  grp.on('mousedown', e => onNodeMouseDown(e, node, grp));

  nodeLayer.add(grp);

  nodeLayer.batchDraw();

}



function drawOuthouse(node) {

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'outhouse-node' });

  const VS = VISUAL_STYLES.outhouse;

  const hw = VS.bodyWidth / 2, hh = VS.bodyHeight / 2;

  grp.add(new Konva.Rect({

    x: -hw, y: -hh, width: VS.bodyWidth, height: VS.bodyHeight,

    fill: VS.bodyColor, cornerRadius: VS.cornerRadius,

    listening: false, name: 'outhouse-body',

  }));

  grp.add(new Konva.Line({

    points: [-(hw + VS.roofOverhang), -hh, hw + VS.roofOverhang, -hh, 0, -hh - VS.roofHeight],

    fill: VS.roofColor, stroke: VS.roofStroke, strokeWidth: 1, closed: true,

    listening: false, name: 'outhouse-roof',

  }));

  const dw = VS.bodyWidth * 0.65, dh = VS.bodyHeight * 0.82;

  const dx = -dw / 2, dy = hh - dh;

  grp.add(new Konva.Rect({

    x: dx, y: dy, width: dw, height: dh,

    fill: VS.doorColor, stroke: VS.doorBorderColor, strokeWidth: VS.doorBorderWidth,

    cornerRadius: VS.doorCornerRadius, listening: false, name: 'outhouse-door',

  }));

  const loveTxt = new Konva.Text({

    text: 'Love', fontSize: VS.loveSize, fontFamily: 'system-ui, sans-serif',

    fontStyle: 'bold italic', fill: VS.loveColor,

    rotation: VS.loveRotation, listening: false, name: 'outhouse-love',

  });

  loveTxt.offsetX(loveTxt.width() / 2);

  loveTxt.offsetY(loveTxt.height() / 2);

  loveTxt.position({ x: 0, y: dy + dh / 2 });

  grp.add(loveTxt);

  const legX = [-(hw / 2) - VS.legWidth / 2, hw / 2 - VS.legWidth / 2];

  legX.forEach(x => grp.add(new Konva.Rect({

    x, y: hh, width: VS.legWidth, height: VS.legHeight,

    fill: VS.legColor, listening: false, name: 'outhouse-leg',

  })));

  grp.add(new Konva.Rect({

    x: -hw, y: -hh, width: VS.bodyWidth, height: VS.bodyHeight + VS.legHeight,

    fill: 'transparent', name: 'outhouse-hit',

  }));

  grp.add(new Konva.Text({

    x: -40, y: -hh - VS.roofHeight - 10, width: 80, align: 'center',

    text: 'OUTHOUSE', fontSize: 6, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',

    fill: 'rgba(255,255,255,0.55)', listening: false, name: 'outhouse-label',

  }));

  grp.on('mousedown', e => onNodeMouseDown(e, node, grp));

  nodeLayer.add(grp);

  nodeLayer.batchDraw();

}

function drawExportPallet(node) {

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'node' });

  const VS = VISUAL_STYLES.pileSquare;

  const VP = VISUAL_STYLES.exportPallet;

  const half = VS.size / 2;

  const plankW = (VS.size - (VP.plankCount - 1) * VP.plankGap) / VP.plankCount;

  // Cross-planks first (underneath)

  for (const cy of [-half, half - plankW]) {

    grp.add(new Konva.Rect({

      x: -half, y: cy, width: VS.size, height: plankW,

      fill: VP.plankColor, stroke: VP.plankBorderColor, strokeWidth: VP.plankBorderWidth,

      listening: false, name: 'pallet-crossplank',

    }));

  }

  // Vertical planks on top

  for (let i = 0; i < VP.plankCount; i++) {

    grp.add(new Konva.Rect({

      x: -half + i * (plankW + VP.plankGap), y: -half,

      width: plankW, height: VS.size,

      fill: VP.plankColor, stroke: VP.plankBorderColor, strokeWidth: VP.plankBorderWidth,

      listening: false, name: 'pallet-plank',

    }));

  }

  grp.add(new Konva.Rect({ x: -half, y: -half, width: VS.size, height: VS.size, fill: 'transparent', name: 'pallet-hit' }));

  grp.add(new Konva.Text({

    x: -40, y: -half - 10,

    width: 80, align: 'center',

    text: 'EXPORT PALLET',

    fontSize: 6, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',

    fill: 'rgba(255,255,255,0.55)',

    listening: false, name: 'pallet-label',

  }));

  const hitbox    = new Konva.Circle({ radius: VISUAL_STYLES.hitboxPile.radius,   fillPatternImage: STRIPE_PATTERN, listening: false, name: 'hitbox-pile',   visible: false });

  const anchorHit = new Konva.Circle({ radius: VISUAL_STYLES.hitboxAnchor.radius, fill: 'transparent', name: 'anchor-hit' });

  const stack     = new Konva.Group({ name: 'stack' });

  const VPC = VISUAL_STYLES.pileCenterAnchor;

  const anchorDot = new Konva.Circle({ radius: VPC.radius, fill: VPC.fill, stroke: VPC.strokeColor, strokeWidth: VPC.strokeWidth, scaleX: 0, scaleY: 0, listening: false, name: 'center-anchor' });

  grp.add(hitbox, stack, anchorDot, anchorHit);

  _pileAnchors.set(node.id, anchorDot);

  let grpFocusPushed = false;

  grp.on('mousedown', e => onNodeMouseDown(e, node, grp));

  grp.on('mouseenter', () => { if (!lineDraft) { grpFocusPushed = true; _hoveredNodeId = node.id; enterPileFocus(); } anchorBounceIn(anchorDot); });

  grp.on('mouseleave', () => { if (grpFocusPushed) { grpFocusPushed = false; _hoveredNodeId = null; leavePileFocus(); } if (!lineDraft) anchorShrinkOut(anchorDot); });

  setupAnchorEvents(anchorHit, () => node);

  // -- Sell Ingots button --

  const btnW = 52, btnH = 18;

  const btnGrp = new Konva.Group({ y: half + 6, name: 'sell-btn' });

  const btnBg = new Konva.Rect({

    x: -btnW / 2, y: 0, width: btnW, height: btnH,

    fill: 'rgba(100,100,100,0.7)', cornerRadius: 3,

    listening: false, name: 'sell-btn-bg',

  });

  btnGrp.add(btnBg);

  btnGrp.add(new Konva.Text({

    x: -btnW / 2, y: 2, width: btnW, align: 'center',

    text: 'Sell Ingots', fontSize: 5, fontFamily: 'system-ui, sans-serif', fontStyle: 'bold',

    fill: 'rgba(255,255,255,0.9)', listening: false, name: 'sell-btn-label',

  }));

  btnGrp.add(new Konva.Text({

    x: -btnW / 2, y: 9, width: btnW, align: 'center',

    text: '0/' + MONEY_PARAMS.sellThreshold, fontSize: 5, fontFamily: 'system-ui, sans-serif',

    fill: 'rgba(255,255,255,0.7)', listening: false, name: 'sell-btn-count',

  }));

  const btnHit = new Konva.Rect({

    x: -btnW / 2, y: 0, width: btnW, height: btnH,

    fill: 'transparent', name: 'sell-btn-hit',

  });

  btnHit.on('mousedown', e => {

    e.cancelBubble = true;

    const count = (node.scrap || []).filter(s => isIngotType(s.type)).length;

    if (count < MONEY_PARAMS.sellThreshold) return;

    node.scrap = node.scrap.filter(s => !isIngotType(s.type));

    node.items = node.scrap.length;

    playerMoney += count * MONEY_PARAMS.ingotPrice;

    updateMoneyDisplay();

    updateNodeStack(node);

  });

  btnGrp.add(btnHit);

  grp.add(btnGrp);

  nodeLayer.add(grp);

  updateNodeStack(node);

  nodeLayer.batchDraw();

}

function drawNode(node) {

  if (node.kind === 'obstacle') { drawObstacle(node); return; }

  if (node.kind === 'idleZone') { drawIdleZone(node); return; }

  if (node.kind === 'decoration' || node.shape === 'building' || node.shape === 'tree') {

    drawDecoration(node);

    return;

  }

  if (node.kind === 'fridge') { drawFridge(node); return; }

  if (node.kind === 'outhouse') { drawOuthouse(node); return; }

  if (node.kind === 'sign') { drawSign(node); return; }

  if (node.subtype === 'exportPallet') { drawExportPallet(node); return; }

  const grp = new Konva.Group({ x: node.x, y: node.y, id: node.id, name: 'node' });

  const VS = VISUAL_STYLES.pileSquare;

  const half = VS.size / 2;

  const isSmelterPile = !!node.smelterRole;
  const shape = new Konva.Rect({ x: -half, y: -half, width: VS.size, height: VS.size, cornerRadius: VS.cornerRadius, fill: isSmelterPile ? VISUAL_STYLES.smelterInputPile.fill : node.color, stroke: node.color, strokeWidth: isSmelterPile ? VISUAL_STYLES.smelterInputPile.strokeWidth : VS.strokeWidth, name: 'nodeshape' });

  const hitbox = new Konva.Circle({ radius: VISUAL_STYLES.hitboxPile.radius, fillPatternImage: STRIPE_PATTERN, listening: false, name: 'hitbox-pile', visible: false });

  const anchorHit = new Konva.Circle({ radius: VISUAL_STYLES.hitboxAnchor.radius, fill: 'transparent', name: 'anchor-hit' });

  const stack = new Konva.Group({ name: 'stack' });

  const tex = new Konva.Rect({ x: -(half - 2), y: -(half - 2), width: VS.size - 4, height: VS.size - 4, fillPatternImage: PILE_DOT_PATTERN, listening: false, name: 'nodetex' });

  const VPC = VISUAL_STYLES.pileCenterAnchor;

  const anchorDot = new Konva.Circle({ radius: VPC.radius, fill: VPC.fill, stroke: VPC.strokeColor, strokeWidth: VPC.strokeWidth, scaleX: 0, scaleY: 0, listening: false, name: 'center-anchor' });

  grp.add(shape, tex, hitbox, stack, anchorDot, anchorHit);

  _pileAnchors.set(node.id, anchorDot);

  let grpFocusPushed = false;

  grp.on('mousedown', e => onNodeMouseDown(e, node, grp));

  grp.on('mouseenter', () => { if (!lineDraft) { grpFocusPushed = true; _hoveredNodeId = node.id; enterPileFocus(); } anchorBounceIn(anchorDot); });

  grp.on('mouseleave', () => { if (grpFocusPushed) { grpFocusPushed = false; _hoveredNodeId = null; leavePileFocus(); } if (!lineDraft) anchorShrinkOut(anchorDot); });

  setupAnchorEvents(anchorHit, () => node);

  nodeLayer.add(grp);

  updateNodeStack(node);

  nodeLayer.batchDraw();

}

function scrapPieceRand(pileId, pieceIdx) {

  // FNV-1a hash of pile ID for base seed

  let base = 0x811c9dc5;

  for (let i = 0; i < pileId.length; i++) {

    base ^= pileId.charCodeAt(i);

    base = Math.imul(base, 0x01000193) >>> 0;

  }

  // Mix base with pieceIdx via Knuth multiplicative hash, then finalize

  let h = (base ^ Math.imul(pieceIdx + 1, 0x9e3779b9)) >>> 0;

  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;

  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;

  h = (h ^ (h >>> 16)) >>> 0;

  const h2 = Math.imul(h ^ 0xdeadbeef, 0x9e3779b9) >>> 0;

  const h3 = Math.imul(h2 ^ 0xcafebabe, 0x9e3779b9) >>> 0;

  return { x: (h  / 0xFFFFFFFF - 0.5) * 28, y: (h2 / 0xFFFFFFFF - 0.5) * 28, rot: h3 / 0xFFFFFFFF * 360 };

}



function updateExportPalletSell(node) {

  const grp = nodeLayer.findOne('#' + node.id);

  if (!grp) return;

  const count = (node.scrap || []).filter(s => isIngotType(s.type)).length;

  const ready = count >= MONEY_PARAMS.sellThreshold;

  const bg = grp.findOne('.sell-btn-bg');

  const countTxt = grp.findOne('.sell-btn-count');

  if (bg) bg.fill(ready ? 'rgba(50,160,50,1)' : 'rgba(100,100,100,0.7)');

  if (countTxt) countTxt.text(count + '/' + MONEY_PARAMS.sellThreshold);

  nodeLayer.batchDraw();

  rebuildYardShopPanel();

}



function updateMoneyDisplay() {

  const el = document.getElementById('money-display');

  if (el) el.textContent = '$' + playerMoney.toLocaleString();

  const bal = document.getElementById('gp-money-balance');

  if (bal) bal.textContent = '$' + playerMoney.toLocaleString();

  checkWinCondition();

}

function checkWinCondition() {

  if (_winState > 0 || MONEY_PARAMS.winCondition <= 0) return;

  if (playerMoney >= MONEY_PARAMS.winCondition) showWinScreen();

}

function showWinScreen() {

  _winState = 1;

  const ol = document.getElementById('win-overlay');

  ol.style.display = 'flex';

  document.getElementById('win-page-1').classList.add('active');

  document.getElementById('win-page-2').classList.remove('active');

  setTimeout(() => {

    ol.addEventListener('click', _advanceWinScreen);

    document.addEventListener('keydown', _advanceWinScreen);

  }, 600);

}

function _advanceWinScreen() {

  if (_winState === 1) {

    _winState = 2;

    document.getElementById('win-page-1').classList.remove('active');

    document.getElementById('win-page-2').classList.add('active');

  } else if (_winState === 2) {

    _winState = 3;

    document.removeEventListener('keydown', _advanceWinScreen);

    location.reload();

  }

}



function updateNodeStack(node) {

  const grp = nodeLayer.findOne('#' + node.id);

  if (!grp) return;

  const stack = grp.findOne('.stack');

  stack.destroyChildren();

  const VP = VISUAL_STYLES.pileStackPiece;

  (node.scrap || []).forEach((piece, i) => {

    const tpl = SCRAP_TYPES.find(t => t.id === piece.type);

    const color = tpl?.color ?? '#f1c40f';

    const { x, y, rot } = scrapPieceRand(node.id, i);

    stack.add(makeScrapShape(piece.type, {

      x, y, radius: VP.radius, rotation: isIngotType(piece.type) ? 0 : rot,

      fill: color, stroke: isIngotType(piece.type) ? 'rgba(255,255,255,0.65)' : VP.strokeColor, strokeWidth: VP.strokeWidth, listening: false, name: 'stackpiece',

    }));

  });

  if (node.subtype === 'exportPallet') updateExportPalletSell(node);

  nodeLayer.batchDraw();

}



