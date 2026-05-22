// ===== MODULE: palette-tools.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== PALETTE UI =====

function isInUse(tplId) {

  return workers.some(w => w.templateId === tplId) || nodes.some(n => n.templateId === tplId);

}

function makePaletteItem(tpl) {

  const el = document.createElement('div');

  el.className = 'palette-item';

  if (isInUse(tpl.id)) el.classList.add('in-use');

  el.dataset.tplId = tpl.id;

  if (tpl.kind === 'worker' && tpl.name) {

    const img = document.createElement('div');

    img.style.cssText = 'width:36px;height:36px;border-radius:6px;background-size:cover;background-position:center;background-image:url(\'icons/icon_worker_' + tpl.name + '.png\')';

    el.appendChild(img);

    const cap = document.createElement('div');

    cap.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:9px;color:#aaa';

    cap.textContent = 'c' + tpl.capacity;

    el.appendChild(cap);

  } else if (tpl.kind === 'scrap') {

    const tmp = document.createElement('div');

    const shape = tpl.scrapType === 'ingot'

      ? `<polygon points="9,32 39,32 36,12 12,12" fill="${tpl.color}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linejoin="round"/>`

      : `<polygon points="24,8 38,32 10,32" fill="${tpl.color}" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" stroke-linejoin="round"/>`;

    tmp.innerHTML = `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" style="display:block">${shape}</svg>`;

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'object') {

    const tmp = document.createElement('div');

    tmp.innerHTML = tpl.subtype === 'exportPallet' ? makeExportPalletSvg(tpl) : makePileSvg(tpl);

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'sign') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeSignSvg(tpl);

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'obstacle') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeObstacleSvg();

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'decoration') {

    const tmp = document.createElement('div');

    tmp.innerHTML = tpl.shape === 'tree' ? makeTreeSvg() : makeBuildingSvg();

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'smelter') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeSmelterSvg();

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'fridge') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeFridgeSvg(tpl);

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'outhouse') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeOuthouseSvg(tpl);

    el.appendChild(tmp.firstChild);

  } else if (tpl.kind === 'idleZone') {

    const tmp = document.createElement('div');

    tmp.innerHTML = makeIdleZoneSvg();

    el.appendChild(tmp.firstChild);

  } else {

    const sw = document.createElement('div');

    if (tpl.kind === 'worker') sw.className = 'swatch-circle';

    else sw.className = 'swatch-square';

    sw.style.backgroundColor = tpl.color;

    el.appendChild(sw);

    if (tpl.kind === 'worker') {

      const cap = document.createElement('div');

      cap.style.cssText = 'position:absolute;bottom:2px;right:4px;font-size:9px;color:#aaa';

      cap.textContent = 'c' + tpl.capacity;

      el.appendChild(cap);

    }

  }

  if (tpl.label) {

    const lbl = document.createElement('div');

    lbl.style.cssText = 'position:absolute;bottom:2px;left:0;right:0;font-size:8px;color:#aaa;text-align:center;pointer-events:none;line-height:1';

    lbl.textContent = tpl.label;

    el.appendChild(lbl);

  }

  el.addEventListener('mousedown', e => startPaletteDrag(e, tpl, el));

  el.addEventListener('click', () => { if (!suppressNextClick) openTemplateProps(tpl); });

  if (tpl.kind === 'object') {

    el.addEventListener('mouseenter', () => enterPileFocus());

    el.addEventListener('mouseleave', () => leavePileFocus());

  }

  return el;

}

function makeTrafficLightSvg(color) {

  const VTL = VISUAL_STYLES.trafficLightMan;

  const W = 48, H = 48;

  const cx = W / 2;

  const headCY = VTL.headOffsetY + VTL.headRadius;

  const torsoTop = headCY + VTL.headRadius + VTL.neckGap;

  const torsoLeft = cx - VTL.torsoWidth / 2;

  const armY = torsoTop + VTL.armOffsetY;

  const leftArmX  = torsoLeft - VTL.armWidth - VTL.armGap;

  const rightArmX = torsoLeft + VTL.torsoWidth + VTL.armGap;

  const legsTop = torsoTop + VTL.torsoHeight + VTL.legGap;

  const leftLegX  = cx - VTL.legSeparation / 2 - VTL.legWidth;

  const rightLegX = cx + VTL.legSeparation / 2;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <circle cx="${cx}" cy="${headCY}" r="${VTL.headRadius}" fill="${VTL.headColor}"/>

    <rect x="${leftArmX}"  y="${armY}" width="${VTL.armWidth}" height="${VTL.armHeight}" rx="${VTL.armCornerRadius}" fill="${VTL.armColor}"/>

    <rect x="${rightArmX}" y="${armY}" width="${VTL.armWidth}" height="${VTL.armHeight}" rx="${VTL.armCornerRadius}" fill="${VTL.armColor}"/>

    <rect x="${torsoLeft}" y="${torsoTop}" width="${VTL.torsoWidth}" height="${VTL.torsoHeight}" rx="${VTL.torsoCornerRadius}" fill="${color}"/>

    <rect x="${leftLegX}"  y="${legsTop}" width="${VTL.legWidth}" height="${VTL.legHeight}" rx="${VTL.legCornerRadius}" fill="${VTL.legColor}"/>

    <rect x="${rightLegX}" y="${legsTop}" width="${VTL.legWidth}" height="${VTL.legHeight}" rx="${VTL.legCornerRadius}" fill="${VTL.legColor}"/>

  </svg>`;

}



function makeFridgeSvg(tpl) {

  const W = 48, bw = 14, bh = 40, bx = (W - bw) / 2, by = 4;

  const lw = 2, lh = 3, ly = by + bh;

  const hx = bx + bw - 1, hy = by + bh * 0.6;

  const dly = by + Math.round(bh * 0.28);

  const col = tpl.color;

  return '<svg width="' + W + '" height="' + W + '" viewBox="0 0 ' + W + ' ' + W + '" xmlns="http://www.w3.org/2000/svg" style="display:block">'

    + '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" fill="' + col + '" rx="2"/>'

    + '<line x1="' + (bx+1) + '" y1="' + dly + '" x2="' + (bx+bw-1) + '" y2="' + dly + '" stroke="rgba(0,0,0,0.2)" stroke-width="0.8"/>'

    + '<circle cx="' + hx + '" cy="' + hy + '" r="1.5" fill="rgba(0,0,0,0.4)"/>'

    + '<rect x="' + (bx+2) + '" y="' + ly + '" width="' + lw + '" height="' + lh + '" fill="rgba(30,30,30,0.8)"/>'

    + '<rect x="' + (bx+bw-lw-2) + '" y="' + ly + '" width="' + lw + '" height="' + lh + '" fill="rgba(30,30,30,0.8)"/>'

    + '</svg>';

}



function makeOuthouseSvg(tpl) {

  const W = 48, bw = 20, bh = 29, bx = (W - bw) / 2, by = 15;

  const ov = 4, rh = 11;

  const col = tpl.color, dark = 'rgba(0,0,0,0.22)';

  const dw = Math.round(bw * 0.65), dh = Math.round(bh * 0.82);

  const dx = (bx + (bw - dw) / 2).toFixed(1), dy = (by + bh - dh).toFixed(1);

  const rpts = [(bx-ov).toFixed(1)+','+by, (bx+bw+ov).toFixed(1)+','+by, (bx+bw/2).toFixed(1)+','+(by-rh)].join(' ');

  return '<svg width="'+W+'" height="'+W+'" viewBox="0 0 '+W+' '+W+'" xmlns="http://www.w3.org/2000/svg" style="display:block">'

    +'<rect x="'+bx+'" y="'+by+'" width="'+bw+'" height="'+bh+'" fill="'+col+'"/>'

    +'<polygon points="'+rpts+'" fill="'+col+'" stroke="'+dark+'" stroke-width="0.8"/>'

    +'<rect x="'+dx+'" y="'+dy+'" width="'+dw+'" height="'+dh+'" fill="'+dark+'" rx="1"/>'

    +'<rect x="'+(bx+2)+'" y="'+(by+bh)+'" width="3" height="3" fill="'+col+'"/>'

    +'<rect x="'+(bx+bw-5)+'" y="'+(by+bh)+'" width="3" height="3" fill="'+col+'"/>'

    +'</svg>';

}

function makeIdleZoneSvg() {

  const VCA = VISUAL_STYLES.idleZone;

  const W = 48, pad = 4;

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <rect x="${pad}" y="${pad}" width="${W - pad*2}" height="${W - pad*2}" rx="${VCA.cornerRadius}" fill="${VCA.fill}" stroke="${VCA.strokeColor}" stroke-width="1"/>

  </svg>`;

}

function makePileSvg(tpl) {

  const VS = VISUAL_STYLES.pileSquare;

  const W = 48, pad = 6, s = W - pad * 2;

  const pid = 'pd-' + tpl.id;

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <defs>

      <pattern id="${pid}" x="${pad}" y="${pad}" width="6" height="6" patternUnits="userSpaceOnUse">

        <circle cx="1" cy="1" r="0.7" fill="${VS.dotPatternColor}"/>

      </pattern>

    </defs>

    <rect x="${pad}" y="${pad}" width="${s}" height="${s}" rx="${VS.cornerRadius}" fill="${tpl.color}"/>

    <rect x="${pad}" y="${pad}" width="${s}" height="${s}" rx="${VS.cornerRadius}" fill="url(#${pid})"/>

  </svg>`;

}

function makeExportPalletSvg(tpl) {

  const VP = VISUAL_STYLES.exportPallet;

  const W = 48, pad = 6, s = W - pad * 2;

  const plankW = (s - (VP.plankCount - 1) * VP.plankGap) / VP.plankCount;

  let rects = '';

  // Cross-planks first (drawn underneath)

  for (const cy of [pad, pad + s - plankW]) {

    rects += `<rect x="${pad}" y="${cy.toFixed(1)}" width="${s}" height="${plankW.toFixed(1)}" fill="${VP.plankColor}" stroke="${VP.plankBorderColor}" stroke-width="${VP.plankBorderWidth}" rx="1"/>`;

  }

  // Vertical planks on top

  for (let i = 0; i < VP.plankCount; i++) {

    const x = (pad + i * (plankW + VP.plankGap)).toFixed(1);

    rects += `<rect x="${x}" y="${pad}" width="${plankW.toFixed(1)}" height="${s}" fill="${VP.plankColor}" stroke="${VP.plankBorderColor}" stroke-width="${VP.plankBorderWidth}" rx="1"/>`;

  }

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">${rects}</svg>`;

}

function makeSignSvg(tpl) {

  const VS = VISUAL_STYLES.sign;

  const W = 48;

  const sc = (W - 8) / VS.boardWidth;

  const bw = VS.boardWidth * sc, bh = VS.boardHeight * sc;

  const ph = VS.poleHeight * sc, pw = VS.poleWidth * sc;

  const bx = (W - bw) / 2, by = (W - bh - ph) / 2;

  const px = (W - pw) / 2, py = by + bh;

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${VS.poleColor}" rx="1"/>

    <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${VS.boardColor}" stroke="${VS.boardBorderColor}" stroke-width="${VS.boardBorderWidth}" rx="${VS.boardCornerRadius}"/>

  </svg>`;

}

function makeObstacleSvg() {

  const VO = VISUAL_STYLES.obstacle;

  const W = 48, pad = 6, s = W - pad * 2, cx = W / 2, cy = W / 2, xOff = s * 0.25;

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <rect x="${pad}" y="${pad}" width="${s}" height="${s}" rx="${VO.cornerRadius}" fill="${VO.color}" stroke="${VO.strokeColor}" stroke-width="${VO.strokeWidth}"/>

    <line x1="${cx-xOff}" y1="${cy-xOff}" x2="${cx+xOff}" y2="${cy+xOff}" stroke="${VO.strokeColor}" stroke-width="${VO.strokeWidth+1}" stroke-linecap="round"/>

    <line x1="${cx+xOff}" y1="${cy-xOff}" x2="${cx-xOff}" y2="${cy+xOff}" stroke="${VO.strokeColor}" stroke-width="${VO.strokeWidth+1}" stroke-linecap="round"/>

  </svg>`;

}



function makeBuildingSvg() {

  const VB = VISUAL_STYLES.building;

  const VC = VISUAL_STYLES.buildingChimney;

  const VD = VISUAL_STYLES.buildingDoor;

  const VSg = VISUAL_STYLES.buildingSign;

  const W = 48, pad = 3, aw = W - pad * 2;

  const sc = aw / VB.width;

  const cx = W / 2, cy = W / 2;

  const bLeft = cx - VB.width / 2 * sc;

  const bTop  = cy - VB.height / 2 * sc;

  const bHH   = VB.height / 2 * sc;

  const bW    = VB.width * sc;

  const cr    = VB.cornerRadius * sc;

  const chL = cx + (VC.offsetX - VC.width / 2) * sc;

  const chT = cy + (VC.offsetY - VC.height / 2) * sc;

  const chW = Math.max(VC.width * sc, 1);

  const chH = Math.max(VC.height * sc, 2);

  const dL  = cx + (VD.offsetX - VD.width / 2) * sc;

  const dT  = cy + (VD.offsetY - VD.height / 2) * sc;

  const dW  = Math.max(VD.width * sc, 1);

  const dH  = Math.max(VD.height * sc, 1);

  const sL  = cx - VSg.width / 2 * sc;

  const sT  = cy + (VSg.offsetY - VSg.height / 2) * sc;

  const sW  = Math.max(VSg.width * sc, 1);

  const sH  = Math.max(VSg.height * sc, 1);

  const f = v => v.toFixed(1);

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <rect x="${f(chL)}" y="${f(chT)}" width="${f(chW)}" height="${f(chH)}" fill="${VC.color}"/>

    <rect x="${f(sL)}" y="${f(sT)}" width="${f(sW)}" height="${f(sH)}" fill="${VSg.color}" rx="1"/>

    <rect x="${f(bLeft)}" y="${f(bTop)}" width="${f(bW)}" height="${f(bHH)}" rx="${f(cr)}" fill="${VB.topColor}" stroke="${VB.strokeColor}" stroke-width="0.5"/>

    <rect x="${f(bLeft)}" y="${f(bTop + bHH)}" width="${f(bW)}" height="${f(bHH)}" rx="${f(cr)}" fill="${VB.bottomColor}" stroke="${VB.strokeColor}" stroke-width="0.5"/>

    <rect x="${f(dL)}" y="${f(dT)}" width="${f(dW)}" height="${f(dH)}" fill="${VD.color}"/>

  </svg>`;

}

function makeTreeSvg() {

  const VT = VISUAL_STYLES.tree;

  const W = 48, pad = 4, aw = W - pad * 2;

  const r = VT.canopyRadius;

  const cgy = r * 0.3;

  const treeTop = cgy - r, treeBot = VT.canopyHeight;

  const treeW = r * Math.sqrt(3), treeH = treeBot - treeTop;

  const sc = Math.min(aw / treeW, aw / treeH);

  const svgCX = W / 2, svgCY = W / 2;

  const gameCY = (treeTop + treeBot) / 2;

  const tx = gx => svgCX + gx * sc;

  const ty = gy => svgCY + (gy - gameCY) * sc;

  const f = v => v.toFixed(1);

  const v0x = f(tx(0)),           v0y = f(ty(cgy - r));

  const v1x = f(tx(r * 0.866)),   v1y = f(ty(cgy + r / 2));

  const v2x = f(tx(-r * 0.866)),  v2y = f(ty(cgy + r / 2));

  const trkL = f(tx(-VT.trunkWidth / 2));

  const trkT = f(ty(VT.canopyHeight - VT.trunkHeight));

  const trkW = f(VT.trunkWidth * sc);

  const trkH = f(VT.trunkHeight * sc);

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <polygon points="${v0x},${v0y} ${v1x},${v1y} ${v2x},${v2y}" fill="${VT.canopyColor}"/>

    <rect x="${trkL}" y="${trkT}" width="${trkW}" height="${trkH}" fill="${VT.trunkColor}"/>

  </svg>`;

}

function makeSmelterSvg() {

  const VB = VISUAL_STYLES.smelterBody, VP = VISUAL_STYLES.pileSquare;

  const W = 48, gap = 2, sc = (W - 4) / (VP.size + gap + VB.width + gap + VP.size);

  const cy = W / 2, pW = VP.size * sc, mW = VB.width * sc, mH = Math.min(VB.height * sc, W - 8);

  const x0 = 2, x1 = x0 + pW + gap, x2 = x1 + mW + gap;

  const f = v => v.toFixed(1);

  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg" style="display:block">

    <rect x="${f(x0)}" y="${f(cy-pW/2)}" width="${f(pW)}" height="${f(pW)}" fill="${VISUAL_STYLES.smelterInputPile.color}" rx="2"/>

    <rect x="${f(x1)}" y="${f(cy-mH/2)}" width="${f(mW)}" height="${f(mH)}" fill="${VB.color}" stroke="${VB.strokeColor}" stroke-width="0.5" rx="1"/>

    <rect x="${f(x1+1)}" y="${f(cy+mH/2-3)}" width="${f(mW*0.4)}" height="2" fill="${VB.progressColor}" rx="1"/>

    <rect x="${f(x2)}" y="${f(cy-pW/2)}" width="${f(pW)}" height="${f(pW)}" fill="${VISUAL_STYLES.smelterOutputPile.color}" rx="2"/>

  </svg>`;

}

function makeTrafficLightPaletteItem(tpl) {

  const el = document.createElement('div');

  el.className = 'palette-item';

  el.innerHTML = makeTrafficLightSvg(tpl.color);

  const lbl = document.createElement('div');

  lbl.style.cssText = 'position:absolute;bottom:2px;left:0;right:0;font-size:8px;color:#aaa;text-align:center;pointer-events:none;line-height:1';

  lbl.textContent = (tpl.label || tpl.name || 'tl');

  el.appendChild(lbl);

  el.addEventListener('mousedown', e => startPaletteDrag(e, tpl, el));

  el.addEventListener('click', () => { if (!suppressNextClick) openTemplateProps(tpl); });

  return el;

}



function makeTrafficLightKonva(color) {

  const V = VISUAL_STYLES.trafficLightMan;

  const headCY = V.headOffsetY + V.headRadius;

  const torsoTop = headCY + V.headRadius + V.neckGap;

  const armY = torsoTop + V.armOffsetY;

  const legsTop = torsoTop + V.torsoHeight + V.legGap;

  const totalH = legsTop + V.legHeight;

  const cy = totalH / 2;

  const grp = new Konva.Group({ name: 'workerfigure' });

  grp.add(new Konva.Circle({ x: 0, y: headCY - cy, radius: V.headRadius, fill: V.headColor }));

  grp.add(new Konva.Rect({ x: -V.torsoWidth/2 - V.armGap - V.armWidth, y: armY - cy, width: V.armWidth, height: V.armHeight, cornerRadius: V.armCornerRadius, fill: V.armColor }));

  grp.add(new Konva.Rect({ x: V.torsoWidth/2 + V.armGap, y: armY - cy, width: V.armWidth, height: V.armHeight, cornerRadius: V.armCornerRadius, fill: V.armColor }));

  grp.add(new Konva.Rect({ x: -V.torsoWidth/2, y: torsoTop - cy, width: V.torsoWidth, height: V.torsoHeight, cornerRadius: V.torsoCornerRadius, fill: color, name: 'torso' }));

  grp.add(new Konva.Rect({ x: -V.legSeparation/2 - V.legWidth, y: legsTop - cy, width: V.legWidth, height: V.legHeight, cornerRadius: V.legCornerRadius, fill: V.legColor }));

  grp.add(new Konva.Rect({ x: V.legSeparation/2, y: legsTop - cy, width: V.legWidth, height: V.legHeight, cornerRadius: V.legCornerRadius, fill: V.legColor }));

  return grp;

}



function roundedTrianglePath(ctx, pts, r) {

  const n = pts.length;

  ctx.beginPath();

  for (let i = 0; i < n; i++) {

    const [x0, y0] = pts[(i + n - 1) % n];

    const [x1, y1] = pts[i];

    const [x2, y2] = pts[(i + 1) % n];

    const d1x = x0 - x1, d1y = y0 - y1, l1 = Math.hypot(d1x, d1y);

    const d2x = x2 - x1, d2y = y2 - y1, l2 = Math.hypot(d2x, d2y);

    const rr = Math.min(r, l1 / 2, l2 / 2);

    const tx1 = x1 + (d1x / l1) * rr, ty1 = y1 + (d1y / l1) * rr;

    const tx2 = x1 + (d2x / l2) * rr, ty2 = y1 + (d2y / l2) * rr;

    if (i === 0) ctx.moveTo(tx1, ty1); else ctx.lineTo(tx1, ty1);

    ctx.arcTo(x1, y1, tx2, ty2, rr);

  }

  ctx.closePath();

}





function renderPalette() {

  const cont = document.getElementById('palette-items');

  cont.innerHTML = '';

  (palette.objects || []).forEach(tpl => cont.appendChild(makePaletteItem(tpl)));

  (palette.scrap  || []).forEach(tpl => cont.appendChild(makePaletteItem(tpl)));

  (palette.workers || []).forEach(tpl => cont.appendChild(makeTrafficLightPaletteItem(tpl)));

}

function renderDecorationsTab() {

  const cont = document.getElementById('palette-decorations');

  cont.innerHTML = '';

  (palette.decorations || []).forEach(tpl => cont.appendChild(makePaletteItem(tpl)));

}

let activeEngTab = 'objects';

document.querySelectorAll('#engine-tabs .eng-tab').forEach(b => {

  b.addEventListener('click', () => {

    document.querySelectorAll('#engine-tabs .eng-tab').forEach(x => x.classList.remove('active'));

    b.classList.add('active');

    activeEngTab = b.dataset.engTab;

    document.getElementById('palette-items').hidden = (activeEngTab !== 'objects');

    document.getElementById('palette-decorations').hidden = (activeEngTab !== 'decorations');

    if (activeEngTab === 'objects') renderPalette();

    if (activeEngTab === 'decorations') renderDecorationsTab();

  });

});



// ===== TOOL SELECTION =====

document.querySelectorAll('.tool-btn').forEach(b => {

  b.addEventListener('click', () => {

    const mode = TOOL_TO_MODE[b.dataset.tool];

    if (mode) setMode(mode);

  });

});



// ===== PALETTE DRAG-AND-DROP =====

let ghostEl = null, dragTpl = null, dragMoved = false, suppressNextClick = false;

function startPaletteDrag(e, tpl, sourceEl) {

  if (e.button !== 0) return;

  e.preventDefault();

  dragTpl = tpl; dragMoved = false;

  ghostEl = document.createElement('div');

  ghostEl.id = 'ghost';

  const isWorker = tpl.kind === 'worker';

  let size = isWorker ? 26 : 44;

  let width = size, height = size;

  let radius = isWorker ? '5px' : '0';

  let bgColor = tpl.color;

  let style = '';



  if (tpl.kind === 'scrap') {

    size = 14; width = size; height = size;

    radius = '2px';

    style = ';transform:rotate(45deg)';

  } else if (tpl.shape === 'building') {

    width = 88;

    height = 33;

    radius = '6px';

    bgColor = '#ffffff';

    style = ';border-top: 16px solid ' + bgColor + '; border-bottom: 17px solid #e63946';

  } else if (tpl.kind === 'smelter') {

    const VB = VISUAL_STYLES.smelterBody, VP = VISUAL_STYLES.pileSquare;

    width = VP.size + VB.gap + VB.width + VB.gap + VP.size;

    height = VP.size;

    radius = '3px';

    bgColor = 'transparent';

    style = ';display:flex;align-items:center;gap:' + VB.gap + 'px;padding:0';

  } else {

    const dotsBg = isWorker

      ? ''

      : ';background-image:radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px);background-size:6px 6px';

    style = dotsBg;

  }



  ghostEl.style.cssText =

    'width:' + width + 'px;height:' + height + 'px;background-color:' + bgColor +

    ';border-radius:' + radius + style;

  document.body.appendChild(ghostEl);

  movePaletteGhost(e.clientX, e.clientY);

  // Lifting a pile temporarily switches to Draw Routes view so the player sees existing routes.

  if (tpl.kind === 'object') enterPileFocus();

  document.addEventListener('mousemove', onPaletteDragMove);

  document.addEventListener('mouseup', onPaletteDragEnd);

}

function movePaletteGhost(x, y) {

  if (!ghostEl) return;

  const halfW = (ghostEl.offsetWidth || 44) / 2;

  const halfH = (ghostEl.offsetHeight || 44) / 2;

  ghostEl.style.left = (x - halfW) + 'px';

  ghostEl.style.top = (y - halfH) + 'px';

}

function onPaletteDragMove(e) { dragMoved = true; movePaletteGhost(e.clientX, e.clientY); }

function onPaletteDragEnd(e) {

  document.removeEventListener('mousemove', onPaletteDragMove);

  document.removeEventListener('mouseup', onPaletteDragEnd);

  if (ghostEl) { ghostEl.remove(); ghostEl = null; }

  // Restore whatever mode we were in before the palette lift.

  if (dragTpl && dragTpl.kind === 'object') leavePileFocus();

  if (dragMoved) {

    wakeAnimation();

    const r = containerEl.getBoundingClientRect();

    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {

      const sx = e.clientX - r.left, sy = e.clientY - r.top;

      const scale = stage.scaleX() || 1;

      const wx = (sx - stage.x()) / scale;

      const wy = (sy - stage.y()) / scale;

      if (dragTpl.kind === 'worker') placeWorker(dragTpl, wx, wy);

      else if (dragTpl.kind === 'scrap') placeGroundScrap(dragTpl, wx, wy);

      else if (dragTpl.kind === 'smelter') placeSmelter(dragTpl, wx, wy);

      else placeNode(dragTpl, wx, wy);

    }

    suppressNextClick = true;

    setTimeout(() => suppressNextClick = false, 50);

  }

  dragTpl = null;

  if (activeEngTab === 'objects') renderPalette();

  if (activeEngTab === 'decorations') renderDecorationsTab();

}



function makeScrapShape(type, { x=0, y=0, radius, rotation=0, fill, stroke, strokeWidth, listening=true, name } = {}) {

  if (isIngotType(type)) {

    const bw = radius * 1.8, h = radius * 1.2, tw = bw * 0.8;

    return new Konva.Line({

      x, y, rotation,

      points: [-bw/2, h/2, bw/2, h/2, tw/2, -h/2, -tw/2, -h/2],

      closed: true, fill, stroke, strokeWidth, listening, name,

    });

  }

  return new Konva.RegularPolygon({ x, y, sides: 3, radius, rotation, fill, stroke, strokeWidth, listening, name });

}



