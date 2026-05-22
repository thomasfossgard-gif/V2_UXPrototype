// ===== MODULE: worker-jobs.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== WORKER LIFTING & ASSIGNMENT =====

function onWorkerMouseDown(e, w, grp) {

  if (e.evt.button === 1) {

    e.evt.preventDefault();

    showWorkerInGpPanel(w);

    return;

  }

  if (currentMode === 'inspectMode') {

    e.cancelBubble = true;

    openInspectPanel('worker', w, e.evt.clientX, e.evt.clientY);

    return;

  }

  if (currentMode === 'deleteMode') {

    e.cancelBubble = true;

    showConfirm(e.evt.clientX, e.evt.clientY, 'Delete worker?', () => deleteWorker(w));

    return;

  }

  // Workers are always interactable — switch out of any other mode (e.g. drawRoutes) on click

  if (currentMode !== 'gameInteract') setMode('gameInteract');

  e.cancelBubble = true;



  const startP = stage.getPointerPosition();

  let entered = false;



  const beginLift = () => {

    for (const job of (w.jobs || [])) {

      if (job.type === 'route') {

        const r = routes.find(j => j.id === job.id);

        if (r) { r.workerIds = r.workerIds.filter(id => id !== w.id); refreshSlotPortrait(r); }

      } else if (job.type === 'smelter') {

        const sm = smelters.find(s => s.id === job.id);

        if (sm) { const oi = (sm.workerSlots || []).indexOf(w.id); if (oi !== -1) sm.workerSlots[oi] = null; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

      } else if (job.type === 'move') {

        destroyGroundChipToken(job.id);

      }

    }

    w.jobs = []; w.state = 'idle'; w.path = null;

    w.targetX = null; w.targetY = null;

    refreshWorkerJobPanel(w);

    if (!w.states) w.states = {};

    w.states.lifting = true;

    showLiftDim();

    pushTransientMode('liftWorker');

  };



  const onMove = () => {

    // Threshold check uses screen-space (matches startP, which is also screen).

    const screenP = stage.getPointerPosition(); if (!screenP) return;

    if (!entered) {

      const dx = screenP.x - startP.x, dy = screenP.y - startP.y;

      if (dx*dx + dy*dy > 25) { entered = true; beginLift(); }

    }

    if (entered) {}

  };

  const onUp = () => {

    stage.off('mousemove.wdrag'); stage.off('mouseup.wdrag');

    if (!entered) return;

    const p = getWorldPointer();

    let chosen = null;

    if (p) {

      const visibleSlots = uiLayer.find('.slot').filter(s => s.findOne('Rect')?.isVisible());

      for (const s of visibleSlots) {

        const dx = s.x() - p.x, dy = s.y() - p.y;

        if (dx*dx + dy*dy <= 26*26) { chosen = s.routeRef; break; }

      }

    }

    if (w.states) w.states.lifting = false;

    hideLiftDim();

    popTransientMode();

    if (chosen) {

      const workerIds = chosen.workerIds || (chosen.workerIds = []);

      if (workerIds.length < (route.maxWorkers ?? 4) && !workerIds.includes(w.id)) {

        workerIds.push(w.id);

        w.jobs.push({ type: 'route', id: chosen.id });

        wakeAnimation();

        w.inventory = {}; w.state = 'idle'; w.path = null;

        w.targetX = null; w.targetY = null;

        refreshSlotPortrait(chosen);

        refreshWorkerJobPanel(w);

        workerSay(w, 'Back to work!');

      }

    } else if (p) {

      w.targetX = snap(p.x); w.targetY = snap(p.y);

      workerSay(w, 'Alright');

    }

    updateWorkerVisual(w);

  };

  stage.on('mousemove.wdrag', onMove);

  stage.on('mouseup.wdrag', onUp);

}



// ===== JOB PANEL HUD =====

// Job bar slot count is driven by WORKER_TIMINGS.jobBarSlots

const _jobKey = j => j.type + ':' + j.id;



function jobLabel(job) {

  if (!job) return '—';

  if (job.type === 'route') {

    const r = routes.find(j => j.id === job.id);

    return r ? (r.name || 'Route') : 'Route';

  }

  if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    return sm ? (sm.name || 'Smelter') : 'Smelter';

  }

  if (job.type === 'move') return 'walk';

  return job.type + ':' + job.id;

}



function _jobPanelH() {

  const JP = VISUAL_STYLES.jobPanel;

  return JP.panelPaddingY * 2 + JP.headerHeight

       + (JP.headerDividerGap ?? 4) + (JP.freeChipsH ?? 14)

       + (JP.slotRowH ?? 18) + (JP.slotRowGap ?? 4)

       + WORKER_TIMINGS.jobBarSlots * JP.barHeight + (WORKER_TIMINGS.jobBarSlots - 1) * JP.barGap;

}



let _masterPanelGrp = null;
let _autoPanelGrp       = null;
let _autoPanelPos       = { x: 220, y: 10 };
let _autoPanelCollapsed = false;

let _jobPanelCollapsed  = false;

let _helpPanelGrp       = null;
let _helpPanelPos       = { x: 10, y: 50 };
let _helpPanelCollapsed = true;

let _autoWorkVisible    = false;
let _jobPanelVisible    = false;

let _chipDragInProgress = false;

let _slotHoverCount = 0;

let _barReorderInProgress = false;



function _masterPanelBgSize() {

  const T = VISUAL_STYLES.uiTheme;

  const JP = VISUAL_STYLES.jobPanel;

  const panelH = _jobPanelH();

  const n = workers.length;

  return {

    w: T.masterPaddingX * 2 + JP.panelWidth,

    h: _jobPanelCollapsed

      ? T.masterPaddingY * 2 + JP.titleHeight

      : T.masterPaddingY * 2 + JP.titleHeight + n * panelH + Math.max(0, n - 1) * T.masterGapY,

  };

}



function buildAutoPanel() {
  if (_autoPanelGrp) { _autoPanelGrp.destroy(); _autoPanelGrp = null; }
  if (!workers.length) return;

  const T  = VISUAL_STYLES.uiTheme;
  const rowH = 28, padX = 10, padY = 8, btnW = 36, panelW = 160;
  const panelH = _autoPanelCollapsed
    ? padY * 2 + rowH
    : padY * 2 + rowH + workers.length * rowH;

  _autoPanelPos.x = Math.max(0, Math.min(_autoPanelPos.x, stage.width()  - panelW));
  _autoPanelPos.y = Math.max(0, Math.min(_autoPanelPos.y, stage.height() - panelH));

  const grp = new Konva.Group({ x: _autoPanelPos.x, y: _autoPanelPos.y, draggable: true, listening: true, name: 'auto-panel' });

  grp.on('dragend', () => { _autoPanelPos.x = Math.round(grp.x()); _autoPanelPos.y = Math.round(grp.y()); });

  grp.add(new Konva.Rect({
    x: 0, y: 0, width: panelW, height: panelH,
    fill: T.panelBg, cornerRadius: T.masterCornerRadius,
    stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,
    shadowColor: T.shadowColor, shadowBlur: T.shadowBlur,
    shadowOffset: { x: T.shadowOffsetX, y: T.shadowOffsetY }, shadowOpacity: 1,
  }));

  // Header — clickable toggle button
  const titleGrp = new Konva.Group({ x: padX, y: padY, listening: true });
  titleGrp.add(new Konva.Rect({
    x: 0, y: 0, width: panelW - padX * 2, height: rowH,
    fill: _autoPanelCollapsed ? T.btnActiveBg : T.btnBg,
    stroke: T.btnBorder, strokeWidth: T.btnBorderWidth,
    cornerRadius: T.btnCornerRadius,
  }));
  titleGrp.add(new Konva.Text({
    x: 0, y: 0, width: panelW - padX * 2, height: rowH,
    text: 'AUTO WORK (Test!)',
    fontSize: T.labelFontSize ?? 11, fontFamily: T.fontFamily || 'system-ui',
    fontStyle: T.fontBold ? 'bold' : 'normal',
    fill: _autoPanelCollapsed ? T.btnActiveTextColor : T.btnTextColor,
    verticalAlign: 'middle', align: 'center', listening: false,
  }));
  titleGrp.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
  titleGrp.on('mouseleave', () => { document.body.style.cursor = ''; });
  titleGrp.on('click', () => {
    _autoPanelCollapsed = !_autoPanelCollapsed;
    const savedX = grp.x(), savedY = grp.y();
    buildAutoPanel();
    if (_autoPanelGrp) { _autoPanelGrp.x(savedX); _autoPanelGrp.y(savedY); }
    hudLayer.batchDraw();
  });
  grp.add(titleGrp);

  // Worker rows (hidden when collapsed)
  if (!_autoPanelCollapsed) {
    workers.forEach((w, i) => {
      const rowY = padY + rowH + i * rowH;
      const tpl = palette.workers.find(t => t.id === w.templateId);
      const name = tpl?.name ?? w.id;

      grp.add(new Konva.Text({
        x: padX, y: rowY, width: panelW - padX * 2 - btnW - 6, height: rowH,
        text: name, fontSize: T.labelFontSize ?? 11,
        fontFamily: T.fontFamily || 'system-ui',
        fill: w.color || T.textColor, verticalAlign: 'middle',
      }));

      const btnX = panelW - padX - btnW;
      const btnGrp = new Konva.Group({ x: btnX, y: rowY + 4, listening: true });

      const btnRect = new Konva.Rect({
        x: 0, y: 0, width: btnW, height: rowH - 8,
        fill: w.autoMode ? (T.btnActiveBg ?? '#2ecc71') : (T.btnBg ?? '#333'),
        cornerRadius: T.btnCornerRadius ?? 3,
        stroke: w.autoMode ? (T.btnActiveBg ?? '#2ecc71') : T.panelBorder,
        strokeWidth: 1,
      });

      const btnTxt = new Konva.Text({
        x: 0, y: 0, width: btnW, height: rowH - 8,
        text: w.autoMode ? 'ON' : 'OFF', fontSize: 10,
        fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
        fill: w.autoMode ? '#fff' : (T.textColor ?? '#aaa'),
        align: 'center', verticalAlign: 'middle',
      });

      btnGrp.add(btnRect, btnTxt);
      btnGrp.on('click', () => { setWorkerAutoMode(w, !w.autoMode); });
      btnGrp.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
      btnGrp.on('mouseleave', () => { document.body.style.cursor = ''; });
      grp.add(btnGrp);
    });
  }

  grp.visible(_autoWorkVisible);
  hudLayer.add(grp);
  _autoPanelGrp = grp;
  hudLayer.batchDraw();
}

function rebuildAutoPanel() {
  if (!_autoPanelGrp) return;
  buildAutoPanel();
}

let _yardShopPos = { x: 10, y: 10 };
let _yardShopGrp = null;

function buildYardShopPanel() {
  if (_yardShopGrp) { _yardShopGrp.destroy(); _yardShopGrp = null; }
  if (!workers.length) return;

  const T = VISUAL_STYLES.uiTheme;
  const rowH = 28, secH = 20, padX = 10, padY = 8, panelW = 180, btnW = 44;

  const fridge = nodes.find(n => n.kind === 'fridge');
  const pallets = nodes.filter(n => n.subtype === 'exportPallet');
  const ingotCount = pallets.reduce((s, p) => s + (p.scrap || []).filter(x => x.type === 'ingot').length, 0);

  const panelH = padY * 2 + rowH
    + secH + workers.length * rowH
    + 1 + secH + rowH
    + 1 + secH + rowH;

  _yardShopPos.x = Math.max(0, Math.min(_yardShopPos.x, stage.width()  - panelW));
  _yardShopPos.y = Math.max(0, Math.min(_yardShopPos.y, stage.height() - panelH));

  const grp = new Konva.Group({ x: _yardShopPos.x, y: _yardShopPos.y, draggable: true, listening: true, name: 'yard-shop-panel' });
  grp.on('dragend', () => { _yardShopPos.x = Math.round(grp.x()); _yardShopPos.y = Math.round(grp.y()); });

  grp.add(new Konva.Rect({
    x: 0, y: 0, width: panelW, height: panelH,
    fill: T.panelBg, cornerRadius: T.masterCornerRadius,
    stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,
    shadowColor: T.shadowColor, shadowBlur: T.shadowBlur,
    shadowOffset: { x: T.shadowOffsetX, y: T.shadowOffsetY }, shadowOpacity: 1,
  }));

  // Panel header
  grp.add(new Konva.Text({
    x: padX, y: padY, width: panelW - padX * 2, height: rowH,
    text: 'YARD SHOP', fontSize: T.labelFontSize ?? 11,
    fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
    fill: T.textColor, verticalAlign: 'middle', align: 'center',
  }));

  // Section helper: divider line + label
  const addSection = (label, y) => {
    grp.add(new Konva.Line({ points: [padX, y, panelW - padX, y], stroke: T.panelBorder, strokeWidth: 1, listening: false }));
    grp.add(new Konva.Text({ x: padX, y: y + 4, width: panelW - padX * 2, height: secH - 4,
      text: label, fontSize: 8, fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
      fill: T.textSecondaryColor, verticalAlign: 'middle', listening: false }));
  };

  // Row button helper
  const addBtn = (rowY, label, active, onClick) => {
    const bx = panelW - padX - btnW;
    const bg = new Konva.Group({ x: bx, y: rowY + 4, listening: !!onClick });
    bg.add(new Konva.Rect({ x: 0, y: 0, width: btnW, height: rowH - 8,
      fill: active ? T.btnActiveBg : T.btnBg,
      stroke: T.btnBorder, strokeWidth: T.btnBorderWidth, cornerRadius: T.btnCornerRadius }));
    bg.add(new Konva.Text({ x: 0, y: 0, width: btnW, height: rowH - 8,
      text: label, fontSize: 9, fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
      fill: active ? T.btnActiveTextColor : T.btnTextColor,
      align: 'center', verticalAlign: 'middle' }));
    if (onClick) {
      bg.on('mouseenter', () => { if (active) document.body.style.cursor = 'pointer'; });
      bg.on('mouseleave', () => { document.body.style.cursor = ''; });
      bg.on('click', onClick);
    }
    grp.add(bg);
  };

  // --- Work Chips section ---
  let cursor = padY + rowH;
  addSection('Work Chips', cursor); cursor += secH;

  workers.forEach((w, i) => {
    const rowY = cursor + i * rowH;
    const tpl = palette.workers.find(t => t.id === w.templateId);
    const atMax = w.chipCount >= CHIP_SHOP_PARAMS.maxChips;
    const price = CHIP_SHOP_PARAMS.prices[w.chipCount - 1] ?? 0;
    const canAfford = !atMax && playerMoney >= price;

    grp.add(new Konva.Text({ x: padX, y: rowY, width: 55, height: rowH,
      text: tpl?.name ?? w.id, fontSize: T.labelFontSize ?? 11,
      fontFamily: T.fontFamily || 'system-ui', fill: w.color || T.textColor, verticalAlign: 'middle' }));

    for (let d = 0; d < CHIP_SHOP_PARAMS.maxChips; d++) {
      grp.add(new Konva.Circle({ x: padX + 58 + d * 11, y: rowY + rowH / 2, radius: 4,
        fill: d < w.chipCount ? w.color : 'transparent',
        stroke: d < w.chipCount ? w.color : T.panelBorder, strokeWidth: 1.5 }));
    }

    addBtn(rowY, atMax ? 'MAX' : `$${price}`, canAfford, canAfford ? () => {
      if (playerMoney < price || w.chipCount >= CHIP_SHOP_PARAMS.maxChips) return;
      playerMoney -= price; w.chipCount++;
      updateMoneyDisplay();
      const sx = grp.x(), sy = grp.y(); buildYardShopPanel();
      if (_yardShopGrp) { _yardShopGrp.x(sx); _yardShopGrp.y(sy); }
      hudLayer.batchDraw();
    } : null);
  });
  cursor += workers.length * rowH;

  // --- Fridge section ---
  addSection('Fridge', cursor); cursor += secH;
  {
    const drinks = fridge?.drinks ?? 0;
    const cap = THIRST_PARAMS.fridgeCapacity;
    const cost = THIRST_PARAMS.drinkCost;
    const fridgeFull = drinks >= cap;
    const canBuy = !!fridge && !fridgeFull && playerMoney >= cost;

    const fridgeEmpty = !!fridge && drinks === 0;
    const fridgeTxt = new Konva.Text({ x: padX, y: cursor, width: panelW - padX * 2 - btnW - 6, height: rowH,
      text: fridge ? `${drinks} / ${cap} drinks` : 'No fridge',
      fontSize: T.labelFontSize ?? 11, fontFamily: T.fontFamily || 'system-ui',
      fontStyle: fridgeEmpty ? 'bold' : 'normal',
      fill: fridgeEmpty ? 'rgba(200,40,40,1)' : T.textColor, verticalAlign: 'middle' });
    grp.add(fridgeTxt);
    if (fridgeEmpty) {
      const flashAnim = new Konva.Animation(frame => {
        fridgeTxt.opacity(0.4 + 0.6 * Math.abs(Math.sin(frame.time * Math.PI / 700)));
      }, hudLayer);
      flashAnim.start();
      grp.on('destroy', () => flashAnim.stop());
    }

    addBtn(cursor, `$${cost}`, canBuy, canBuy ? () => {
      if (playerMoney < cost || (fridge.drinks ?? 0) >= cap) return;
      playerMoney -= cost; fridge.drinks = (fridge.drinks ?? 0) + 1;
      updateFridgeDrinksLabel(fridge); updateMoneyDisplay();
      workers.forEach(w => {
        if ((w.thirst || 0) >= 100 && ['chilling', 'chill_walk', 'chill_rest'].includes(w.state)) workerGoToFridge(w);
      });
      const sx = grp.x(), sy = grp.y(); buildYardShopPanel();
      if (_yardShopGrp) { _yardShopGrp.x(sx); _yardShopGrp.y(sy); }
      hudLayer.batchDraw();
    } : null);
    cursor += rowH;
  }

  // --- Export section ---
  addSection('Export', cursor); cursor += secH;
  {
    const canSell = ingotCount >= MONEY_PARAMS.sellThreshold;
    const total = ingotCount * MONEY_PARAMS.ingotPrice;

    grp.add(new Konva.Text({ x: padX, y: cursor, width: panelW - padX * 2 - btnW - 6, height: rowH,
      text: `${ingotCount} ingots x $${MONEY_PARAMS.ingotPrice}`,
      fontSize: T.labelFontSize ?? 11, fontFamily: T.fontFamily || 'system-ui',
      fill: T.textColor, verticalAlign: 'middle' }));

    addBtn(cursor, 'Sell', canSell, canSell ? () => {
      pallets.forEach(p => {
        p.scrap = (p.scrap || []).filter(s => s.type !== 'ingot');
        p.items = p.scrap.length;
        updateNodeStack(p); updateExportPalletSell(p);
      });
      playerMoney += total; updateMoneyDisplay();
      const sx = grp.x(), sy = grp.y(); buildYardShopPanel();
      if (_yardShopGrp) { _yardShopGrp.x(sx); _yardShopGrp.y(sy); }
      hudLayer.batchDraw();
    } : null);
  }

  hudLayer.add(grp);
  _yardShopGrp = grp;
  hudLayer.batchDraw();
}

function rebuildYardShopPanel() {
  if (!_yardShopGrp) return;
  const sx = _yardShopGrp.x(), sy = _yardShopGrp.y();
  buildYardShopPanel();
  if (_yardShopGrp) { _yardShopGrp.x(sx); _yardShopGrp.y(sy); }
}

function buildHelpPanel() {
  if (_helpPanelGrp) { _helpPanelGrp.destroy(); _helpPanelGrp = null; }

  const T = VISUAL_STYLES.uiTheme;
  const padX = 10, padY = 8, rowH = 28, secH = 18, panelW = 252, tipH = 50, descH = 280;

  const panelH = _helpPanelCollapsed
    ? padY * 2 + rowH
    : padY * 2 + rowH + tipH + secH + descH + 3 * rowH;

  const grp = new Konva.Group({ x: _helpPanelPos.x, y: _helpPanelPos.y, draggable: true, listening: true, name: 'help-panel' });
  grp.on('dragend', () => { _helpPanelPos.x = Math.round(grp.x()); _helpPanelPos.y = Math.round(grp.y()); });

  grp.add(new Konva.Rect({
    x: 0, y: 0, width: panelW, height: panelH,
    fill: T.panelBg, cornerRadius: T.masterCornerRadius,
    stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,
    shadowColor: T.shadowColor, shadowBlur: T.shadowBlur,
    shadowOffset: { x: T.shadowOffsetX, y: T.shadowOffsetY }, shadowOpacity: 1,
  }));

  // Header
  const titleGrp = new Konva.Group({ x: padX, y: padY, listening: true });
  titleGrp.add(new Konva.Rect({
    x: 0, y: 0, width: panelW - padX * 2, height: rowH,
    fill: _helpPanelCollapsed ? T.btnActiveBg : T.btnBg,
    stroke: T.btnBorder, strokeWidth: T.btnBorderWidth, cornerRadius: T.btnCornerRadius,
  }));
  titleGrp.add(new Konva.Text({
    x: 0, y: 0, width: panelW - padX * 2, height: rowH,
    text: 'HELP / CHEATS', fontSize: T.labelFontSize ?? 11,
    fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
    fill: _helpPanelCollapsed ? T.btnActiveTextColor : T.btnTextColor,
    verticalAlign: 'middle', align: 'center',
  }));
  titleGrp.on('click', () => {
    _helpPanelCollapsed = !_helpPanelCollapsed;
    const sx = grp.x(), sy = grp.y(); buildHelpPanel();
    if (_helpPanelGrp) { _helpPanelGrp.x(sx); _helpPanelGrp.y(sy); }
    hudLayer.batchDraw();
  });
  titleGrp.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
  titleGrp.on('mouseleave', () => { document.body.style.cursor = ''; });
  grp.add(titleGrp);

  if (!_helpPanelCollapsed) {
    let cy = padY + rowH;

    // Speed tip
    grp.add(new Konva.Text({
      x: padX, y: cy, width: panelW - padX * 2, height: tipH,
      text: 'Press 1, 2, 3 to control speed. (1x, 2x, 4x)',
      fontSize: 12, fontFamily: T.fontFamily || 'system-ui',
      fill: T.textColor, verticalAlign: 'middle', wrap: 'word', listening: false,
    }));
    cy += tipH;

    // Experimental section divider
    grp.add(new Konva.Line({ points: [padX, cy, panelW - padX, cy], stroke: T.panelBorder, strokeWidth: 1, listening: false }));
    grp.add(new Konva.Text({
      x: padX, y: cy + 4, width: panelW - padX * 2, height: secH - 4,
      text: 'Experimental Features', fontSize: 8, fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
      fill: T.textSecondaryColor, verticalAlign: 'middle', listening: false,
    }));
    cy += secH;

    // Description
    grp.add(new Konva.Text({
      x: padX, y: cy, width: panelW - padX * 2, height: descH,
      text: "These are experiments, but you can set your workers to Auto, to see them work by themselves. The Job Panel is overwhelming now, a feature I'll redesign, but is intended to become a fully interactive way to see what your workers are doing, including changing priorities. Likely buggy, don't press anything.",
      fontSize: 11, fontFamily: T.fontFamily || 'system-ui',
      fill: T.textSecondaryColor, wrap: 'word', listening: false,
    }));
    cy += descH;

    // Toggle button helper
    const addToggle = (label, active, onClick) => {
      const bg = new Konva.Group({ x: padX, y: cy, listening: true });
      bg.add(new Konva.Rect({ x: 0, y: 0, width: panelW - padX * 2, height: rowH - 4,
        fill: active ? T.btnActiveBg : T.btnBg,
        stroke: T.btnBorder, strokeWidth: T.btnBorderWidth, cornerRadius: T.btnCornerRadius }));
      bg.add(new Konva.Text({ x: 0, y: 0, width: panelW - padX * 2, height: rowH - 4,
        text: label, fontSize: 9, fontFamily: T.fontFamily || 'system-ui', fontStyle: 'bold',
        fill: active ? T.btnActiveTextColor : T.btnTextColor,
        align: 'center', verticalAlign: 'middle' }));
      bg.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
      bg.on('mouseleave', () => { document.body.style.cursor = ''; });
      bg.on('click', onClick);
      grp.add(bg);
      cy += rowH;
    };

    addToggle(_autoWorkVisible ? 'Hide Auto Work Panel' : 'Show Auto Work Panel', _autoWorkVisible, () => {
      _autoWorkVisible = !_autoWorkVisible;
      if (_autoPanelGrp) { _autoPanelGrp.visible(_autoWorkVisible); hudLayer.batchDraw(); }
      else if (_autoWorkVisible) buildAutoPanel();
      const b = document.getElementById('eng-auto-panel-btn');
      if (b) b.classList.toggle('active', _autoWorkVisible);
      rebuildHelpPanel();
    });

    addToggle(_jobPanelVisible ? 'Hide Job Panel' : 'Show Job Panel', _jobPanelVisible, () => {
      _jobPanelVisible = !_jobPanelVisible;
      buildAllJobPanels();
    });

    addToggle('Cheat $10 more', false, () => {
      playerMoney += 10;
      updateMoneyDisplay();
      rebuildYardShopPanel();   // re-arm chip / drink buy buttons with fresh affordability state
    });
  }

  hudLayer.add(grp);
  _helpPanelGrp = grp;
  hudLayer.batchDraw();
}

function rebuildHelpPanel() {
  if (!_helpPanelGrp) return;
  buildHelpPanel();
}

function buildAllJobPanels() {

  hudLayer.destroyChildren();

  _masterPanelGrp = null;

  workers.forEach(w => { w._panelGrp = null; w._jobBars = {}; });

  if (!workers.length) { updateHudTransform(); return; }



  const T  = VISUAL_STYLES.uiTheme;

  const JP = VISUAL_STYLES.jobPanel;

  const { w: masterW, h: masterH } = _masterPanelBgSize();

  JP.x = Math.max(0, Math.min(JP.x, stage.width()  - masterW));
  JP.y = Math.max(0, Math.min(JP.y, stage.height() - masterH));

  _masterPanelGrp = new Konva.Group({

    x: JP.x, y: JP.y, draggable: true, listening: true, name: 'master-panel',

  });

  hudLayer.listening(true);



  const masterBg = new Konva.Rect({

    x: 0, y: 0, width: masterW, height: masterH,

    fill: T.panelBg,

    cornerRadius: T.masterCornerRadius,

    stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,

    shadowColor: T.shadowColor, shadowBlur: T.shadowBlur,

    shadowOffset: { x: T.shadowOffsetX, y: T.shadowOffsetY }, shadowOpacity: 1,

    name: 'master-bg', cursor: 'grab',

  });

  masterBg.on('mouseenter', () => { if (engineVisible) document.body.style.cursor = 'grab'; });

  masterBg.on('mouseleave', () => { document.body.style.cursor = ''; });

  _masterPanelGrp.on('dragstart', () => {

    if (_chipDragInProgress || _barReorderInProgress || !engineVisible) { _masterPanelGrp.stopDrag(); return; }

    document.body.style.cursor = 'grabbing';

  });

  _masterPanelGrp.on('dragend', () => {

    document.body.style.cursor = '';

    VISUAL_STYLES.jobPanel.x = Math.round(_masterPanelGrp.x());

    VISUAL_STYLES.jobPanel.y = Math.round(_masterPanelGrp.y());

  });



  _masterPanelGrp.add(masterBg);



  // Toggle button — styled like tool-btn, spans full panel width

  const toggleBtnW = masterW - T.masterPaddingX * 2;

  const toggleBtnGrp = new Konva.Group({ x: T.masterPaddingX, y: T.masterPaddingY, listening: true, name: 'toggle-btn' });

  toggleBtnGrp.add(new Konva.Rect({

    x: 0, y: 0, width: toggleBtnW, height: JP.titleHeight,

    fill: _jobPanelCollapsed ? T.btnActiveBg : T.btnBg,

    stroke: T.btnBorder, strokeWidth: T.btnBorderWidth,

    cornerRadius: T.btnCornerRadius,

    name: 'toggle-btn-bg',

  }));

  toggleBtnGrp.add(new Konva.Text({

    x: 0, y: 0, width: toggleBtnW, height: JP.titleHeight,

    text: 'JOB PANEL (TEST ONLY)',

    fontSize: JP.titleFontSize, fontFamily: T.fontFamily || 'system-ui',

    fill: _jobPanelCollapsed ? T.btnActiveTextColor : T.btnTextColor,

    verticalAlign: 'middle', align: 'center',

    listening: false, name: 'toggle-btn-label',

  }));

  toggleBtnGrp.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });

  toggleBtnGrp.on('mouseleave', () => { document.body.style.cursor = ''; });

  toggleBtnGrp.on('click', () => {

    _jobPanelCollapsed = !_jobPanelCollapsed;

    const savedX = _masterPanelGrp.x(), savedY = _masterPanelGrp.y();

    buildAllJobPanels();

    if (_masterPanelGrp) { _masterPanelGrp.x(savedX); _masterPanelGrp.y(savedY); }

    hudLayer.batchDraw();

  });

  _masterPanelGrp.add(toggleBtnGrp);



  if (!_jobPanelCollapsed) workers.forEach(buildWorkerJobPanel);

  hudLayer.add(_masterPanelGrp);
  _masterPanelGrp.visible(_jobPanelVisible);

  updateHudTransform();

  rebuildAutoPanel();
  buildYardShopPanel();
  buildHelpPanel();

}



function buildWorkerJobPanel(w) {

  if (w._panelGrp) { w._panelGrp.destroy(); w._panelGrp = null; }

  const JP = VISUAL_STYLES.jobPanel;

  const T  = VISUAL_STYLES.uiTheme;

  const panelH = _jobPanelH();

  const wIdx = workers.indexOf(w);

  const panelX = T.masterPaddingX;

  const panelY = T.masterPaddingY + JP.titleHeight + Math.max(0, wIdx) * (panelH + T.masterGapY);



  const grp = new Konva.Group({ x: panelX, y: panelY, name: 'job-panel-' + w.id });



  const bg = new Konva.Rect({

    x: 0, y: 0, width: JP.panelWidth, height: panelH,

    fill: T.panelBg, cornerRadius: T.panelCornerRadius,

    stroke: T.panelBorder, strokeWidth: T.panelBorderWidth,

    name: 'panel-bg',

  });

  const tpl = palette.workers.find(t => t.id === w.templateId);

  const displayName = tpl?.name ? tpl.name[0].toUpperCase() + tpl.name.slice(1) : w.id;

  const header = new Konva.Text({

    x: JP.panelPaddingX, y: JP.panelPaddingY,

    width: JP.panelWidth - JP.panelPaddingX * 2,

    height: JP.headerHeight,

    text: displayName + "'s Jobs",

    fontSize: JP.headerFontSize, fontFamily: T.fontFamily || 'system-ui', fontStyle: T.fontBold ? 'bold' : 'normal',

    fill: T.textColor, verticalAlign: 'middle', name: 'panel-header',

  });

  const _sectionY = JP.panelPaddingY + JP.headerHeight + (JP.headerDividerGap ?? 4);

  const divider = new Konva.Line({

    x: JP.panelPaddingX, y: _sectionY,

    points: [0, 0, JP.panelWidth - JP.panelPaddingX * 2, 0],

    stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1,

    listening: false, name: 'panel-divider',

  });

  const freeChipsLbl = new Konva.Text({

    x: JP.panelPaddingX, y: _sectionY + 3,

    width: JP.panelWidth - JP.panelPaddingX * 2,

    text: 'Free Chips',

    fontSize: JP.noJobsFontSize ?? 9, fontFamily: T.fontFamily || 'system-ui',

    fill: JP.noJobsColor, listening: false, name: 'panel-free-chips-label',

  });

  const chipSlotsGrp = new Konva.Group({

    x: JP.panelPaddingX,

    y: _sectionY + (JP.freeChipsH ?? 14),

    name: 'chip-slots-grp',

  });

  const barsGrp = new Konva.Group({

    x: JP.panelPaddingX,

    y: _sectionY + (JP.freeChipsH ?? 14) + (JP.slotRowH ?? 18) + (JP.slotRowGap ?? 4),

    name: 'bars-grp',

  });

  grp.add(bg, header, divider, freeChipsLbl, chipSlotsGrp, barsGrp);

  _masterPanelGrp.add(grp);

  w._panelGrp = grp;

  w._chipSlotsGrp = chipSlotsGrp;

  w._jobBars = {};

  refreshWorkerJobPanel(w, false);

}



function refreshWorkerJobPanel(w, animate) {

  if (!w._panelGrp) return;

  animate = animate !== false;

  const JP = VISUAL_STYLES.jobPanel;

  const barsGrp = w._panelGrp.findOne('.bars-grp');

  if (!barsGrp) return;



  const jobs = (w.jobs || []).slice(0, WORKER_TIMINGS.jobBarSlots);

  const newKeys = jobs.map(_jobKey);



  // Remove bars no longer in jobs

  for (const key of Object.keys(w._jobBars || {})) {

    if (!newKeys.includes(key)) {

      w._jobBars[key]?.grp.destroy();

      delete w._jobBars[key];

    }

  }



  const barW = JP.panelWidth - JP.panelPaddingX * 2;

  const T = VISUAL_STYLES.uiTheme;



  jobs.forEach((job, idx) => {

    const key = _jobKey(job);

    const targetY = idx * (JP.barHeight + JP.barGap);

    const isActive = idx === 0;

    const fill      = isActive ? T.btnActiveBg : T.btnBg;

    const textColor = isActive ? T.btnActiveTextColor : T.btnTextColor;

    const label = jobLabel(job);



    if (w._jobBars[key]) {

      const bar = w._jobBars[key];

      bar.labelText.text(label);

      bar.bgRect.fill(fill);

      bar.labelText.fill(textColor);

      bar.job = job;

      bar.chipRect?.parent?.findOne('.chip-lbl')?.text(job.chipNum != null ? String(job.chipNum) : '');

      if (animate && Math.abs(bar.grp.y() - targetY) > 0.5) {

        if (bar._tween) bar._tween.destroy();

        bar._tween = new Konva.Tween({

          node: bar.grp, duration: JP.animDuration, y: targetY,

          easing: Konva.Easings.EaseInOut, onFinish() { bar._tween = null; },

        });

        bar._tween.play();

      } else {

        bar.grp.y(targetY);

      }

    } else {

      const barGrp = new Konva.Group({ x: 0, y: targetY, name: 'bar-' + key });

      const bgRect = new Konva.Rect({

        x: 0, y: 0, width: barW, height: JP.barHeight,

        fill, cornerRadius: T.btnCornerRadius,

        stroke: T.btnBorder, strokeWidth: T.btnBorderWidth,

      });

      const VCH = VISUAL_STYLES.chip;

      const chipSlotW = (VCH.badgeWidth ?? 22) * (VCH.panelScale ?? 0.85);

      const chipSlotMargin = JP.chipSlotMargin ?? 4;

      const chipH = Math.min((VCH.height ?? 25) * (VCH.panelScale ?? 0.85), JP.barHeight - 2);

      const chipX = barW - chipSlotMargin - chipSlotW;

      const chipY = (JP.barHeight - chipH) / 2;

      const labelText = new Konva.Text({

        x: JP.barTextPaddingX ?? 6, y: 0, width: barW - (JP.barTextPaddingX ?? 6) * 2 - chipSlotW - chipSlotMargin, height: JP.barHeight,

        text: label, fontSize: JP.barTextSize, fontFamily: T.fontFamily || 'system-ui', fontStyle: T.fontBold ? 'bold' : 'normal',

        fill: textColor, verticalAlign: 'middle', ellipsis: true,

      });

      const slotFrame = _makeEmptySlot(VCH.panelScale ?? 1);

      slotFrame.x(chipX); slotFrame.y(chipY);

      barGrp.add(bgRect, labelText, slotFrame);

      const chipGrp = _makeChip(VCH.panelScale ?? 1, w.color, job.chipNum);

      chipGrp.x(chipX + chipSlotW / 2); chipGrp.y(chipY + chipSlotW / 2);

      const chipRect = chipGrp.findOne('.chip-rect');

      chipRect.name('bar-chip'); chipRect.listening(true);

      chipRect.on('mouseenter', () => { _panelChipHoverJob(job, true); hudLayer.batchDraw(); });

      chipRect.on('mouseleave', () => { _panelChipHoverJob(job, false); hudLayer.batchDraw(); });

      chipRect.on('contextmenu', e => {

        if (currentMode !== 'gameInteract') return;

        e.cancelBubble = true;

        _panelChipHoverJob(job, false);

        _returnJobChip(w, job);

      });

      chipRect.on('mousedown', e => {

        if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

        e.cancelBubble = true;

        _panelChipHoverJob(job, false);

        startPanelChipDrag(w, job);

      });

      // Lock badge — shown when worker is in auto mode
      if (w.autoMode) {
        const VCpanel = VISUAL_STYLES.chip;
        const chipHalf = ((VCpanel.badgeWidth ?? 20) * (VCpanel.panelScale ?? 0.85)) / 2;
        const lockBadge = new Konva.Text({
          x: chipHalf - 9, y: chipHalf - 9,
          text: job.locked ? '🔒' : '🔓',
          fontSize: 8, fill: 'white', listening: true, name: 'lock-badge',
        });
        lockBadge.on('click', e => {
          e.cancelBubble = true;
          job.locked = !job.locked;
          lockBadge.text(job.locked ? '🔒' : '🔓');
          hudLayer.batchDraw();
        });
        lockBadge.on('mouseenter', () => { document.body.style.cursor = 'pointer'; });
        lockBadge.on('mouseleave', () => { document.body.style.cursor = 'grab'; });
        chipGrp.add(lockBadge);
      }

      barGrp.on('mouseenter', () => { document.body.style.cursor = 'grab'; });

      barGrp.on('mouseleave', () => { document.body.style.cursor = ''; });

      barGrp.on('mousedown', e => {

        if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

        e.cancelBubble = true;

        startBarReorderDrag(w, job);

      });

      barGrp.add(chipGrp);

      barsGrp.add(barGrp);

      w._jobBars[key] = { grp: barGrp, bgRect, labelText, chipRect, job };

      if (animate) {

        barGrp.opacity(0);

        new Konva.Tween({ node: barGrp, duration: JP.animDuration, opacity: 1, easing: Konva.Easings.EaseInOut }).play();

      }

    }

  });



  refreshPanelChipSlots(w);

  _refreshShadowBars(w);

  hudLayer.batchDraw();

}



function refreshPanelChipSlots(w) {

  const grp = w._chipSlotsGrp; if (!grp) return;

  grp.destroyChildren();

  const JP   = VISUAL_STYLES.jobPanel;

  const VCH  = VISUAL_STYLES.chip;

  const total    = w.chipCount || 4;

  const assigned = Math.min((w.jobs || []).length, total);

  const free     = total - assigned;

  const scale    = VCH.panelScale ?? 0.85;

  const slotW    = (VCH.badgeWidth ?? 22) * scale;

  const slotH    = Math.min((VCH.height ?? 25) * scale, JP.slotRowH ?? 18);

  const gap      = VCH.gap ?? 4;



  // Available chip numbers (those not claimed by any current job)

  const inUse = new Set((w.jobs || []).map(j => j.chipNum).filter(n => n != null));

  const avNums = [];

  for (let n = 1; n <= total; n++) { if (!inUse.has(n)) avNums.push(n); }



  for (let i = 0; i < total; i++) {

    const isFree = i < free;

    const x = i * (slotW + gap);

    const emptySlot = _makeEmptySlot(scale);

    emptySlot.x(x); emptySlot.y(0);

    grp.add(emptySlot);

    if (isFree) {

      const chipNum = avNums[i] ?? i + 1;

      const chip = _makeChip(scale, w.color, chipNum);

      chip.x(x + slotW / 2); chip.y(slotH / 2);

      const innerRect = chip.findOne('.chip-rect');

      innerRect.name('panel-chip-free');

      innerRect._chipNum = chipNum;

      innerRect.on('mousedown', e => {

        if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

        e.cancelBubble = true;

        startFreeChipDrag(w, chipNum, innerRect);

      });

      grp.add(chip);

    }

  }

}



function _refreshShadowBars(w) {

  const barsGrp = w._panelGrp?.findOne('.bars-grp');

  if (!barsGrp) return;

  barsGrp.find('.shadow-bar').forEach(n => n.destroy());



  const activeCount = Math.min((w.jobs || []).length, WORKER_TIMINGS.jobBarSlots);

  const emptySlots = WORKER_TIMINGS.jobBarSlots - activeCount;

  if (emptySlots <= 0) return;



  const JP = VISUAL_STYLES.jobPanel;

  const T  = VISUAL_STYLES.uiTheme;

  const barW = JP.panelWidth - JP.panelPaddingX * 2;



  for (let i = 0; i < emptySlots; i++) {

    barsGrp.add(new Konva.Rect({

      x: 0, y: (activeCount + i) * (JP.barHeight + JP.barGap),

      width: barW, height: JP.barHeight,

      fill: T.btnBg, cornerRadius: T.btnCornerRadius,

      stroke: T.btnBorder, strokeWidth: T.btnBorderWidth,

      opacity: JP.shadowBarOpacity ?? 0.4,

      listening: false, name: 'shadow-bar',

    }));

  }

}



// ===== CHIP THROW SYSTEM =====

const _groundChipTokens = {};   // jobId ? { grp, numText, w, job }



function nextChipNum(w) {

  const total = w.chipCount || 4;

  const inUse = new Set([

    ...(w.jobs || []).map(j => j.chipNum).filter(n => n != null),

    ...(w._inFlightNums || []),

  ]);

  for (let n = 1; n <= total; n++) { if (!inUse.has(n)) return n; }

  return total + 1;

}

function reorderJob(w, fromJob, toJob) {

  const fi = w.jobs.indexOf(fromJob);

  const ti = w.jobs.indexOf(toJob);

  if (fi === -1 || ti === -1) return;

  w.jobs.splice(fi, 1);

  w.jobs.splice(ti, 0, fromJob);

}

function startBarReorderDrag(w, job) {

  _barReorderInProgress = true;

  _masterPanelGrp.stopDrag();

  document.body.style.cursor = 'grabbing';

  const T = VISUAL_STYLES.uiTheme;

  let _snapTarget = null;

  const onMove = () => {

    const sp = stage.getPointerPosition(); if (!sp) return;

    let nearest = null, nearestD = Infinity;

    for (const b of Object.values(w._jobBars || {})) {

      if (b.job === job) continue;

      const bp = b.grp.getAbsolutePosition();

      const JP2 = VISUAL_STYLES.jobPanel;

      const d = Math.abs(sp.y - (bp.y + JP2.barHeight / 2));

      if (d < nearestD) { nearestD = d; nearest = b; }

    }

    if (_snapTarget !== nearest) {

      if (_snapTarget) _snapTarget.bgRect.stroke(T.btnBorder);

      _snapTarget = nearest;

      if (_snapTarget) _snapTarget.bgRect.stroke('rgba(255,255,255,0.75)');

      hudLayer.batchDraw();

    }

  };

  const onUp = () => {

    _barReorderInProgress = false;

    document.body.style.cursor = '';

    stage.off('mousemove.barreorder'); stage.off('mouseup.barreorder');

    if (_snapTarget) _snapTarget.bgRect.stroke(T.btnBorder);

    if (_snapTarget && _snapTarget.job !== job) {

      reorderJob(w, job, _snapTarget.job);

      refreshWorkerJobPanel(w);

    }

    hudLayer.batchDraw();

  };

  stage.on('mousemove.barreorder', onMove);

  stage.on('mouseup.barreorder', onUp);

}



function _removeJobWorldRef(w, job) {

  if (job.type === 'route') {

    const r = routes.find(r => r.id === job.id);

    if (r) {

      const si = (r.workerSlots || []).indexOf(w.id);

      if (si !== -1) r.workerSlots[si] = null;

      r.workerIds = (r.workerSlots || []).filter(Boolean);

      refreshAllSlotPortraits();

    }

  } else if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    if (sm) { const oi = (sm.workerSlots || []).indexOf(w.id); if (oi !== -1) sm.workerSlots[oi] = null; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

  } else if (job.type === 'move') {

    destroyGroundChipToken(job.id); updateGroundChipNumbers(w);

  }

}

function _addJobWorldRef(w, job) {

  if (job.type === 'route') {

    const r = routes.find(r => r.id === job.id);

    if (r) {

      const si = (r.workerSlots || []).findIndex(s => !s);

      if (si !== -1) r.workerSlots[si] = w.id;

      r.workerIds = r.workerSlots.filter(Boolean);

      refreshAllSlotPortraits();

    }

  } else if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    if (sm) { const fi = (sm.workerSlots || []).findIndex(s => !s); if (fi !== -1) sm.workerSlots[fi] = w.id; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

  } else if (job.type === 'move') {

    createGroundChipToken(w, job);

    updateGroundChipNumbers(w);

  }

}

function _doJobSwap(wA, jobA, wB, jobB) {

  _removeJobWorldRef(wA, jobA); wA.jobs = wA.jobs.filter(j => j !== jobA);

  _removeJobWorldRef(wB, jobB); wB.jobs = wB.jobs.filter(j => j !== jobB);

  const _numA = jobA.chipNum, _numB = jobB.chipNum;

  jobA.chipNum = _numB; wB.jobs.push(jobA); _addJobWorldRef(wB, jobA);

  jobB.chipNum = _numA; wA.jobs.push(jobB); _addJobWorldRef(wA, jobB);

  wA.state = 'idle'; wA.path = null; wB.state = 'idle'; wB.path = null;

  refreshWorkerJobPanel(wA); if (wB !== wA) refreshWorkerJobPanel(wB);

  hudLayer.batchDraw();

}

function _findSnapBarAtPointer(excludeJob) {

  const sp = stage.getPointerPosition(); if (!sp) return null;

  let best = null, bd2 = 40 * 40;

  for (const wk of workers) {

    for (const bar of Object.values(wk._jobBars || {})) {

      if (!bar.chipRect || !bar.job || bar.job === excludeJob) continue;

      const bap = bar.chipRect.getAbsolutePosition();

      const d2 = (bap.x - sp.x) ** 2 + (bap.y - sp.y) ** 2;

      if (d2 < bd2) { bd2 = d2; best = { w: wk, bar }; }

    }

  }

  return best;

}

function _findGhostSlotAtPointer() {

  const mp = stage.getPointerPosition(); if (!mp) return null;

  for (const rect of hudLayer.find('.shadow-bar')) {

    const ap = rect.getAbsolutePosition();

    if (mp.x >= ap.x && mp.x <= ap.x + rect.width() &&

        mp.y >= ap.y && mp.y <= ap.y + rect.height()) {

      const pg = rect.findAncestor(n => n.name().startsWith('job-panel-'));

      const wk = workers.find(w => w.id === pg?.name().replace('job-panel-',''));

      if (wk) return { w: wk, rect };

    }

  }

  return null;

}



function _pointerOverMasterPanel() {

  if (!_masterPanelGrp) return false;

  const mp = stage.getPointerPosition(); if (!mp) return false;

  const r = _masterPanelGrp.getClientRect();

  return mp.x >= r.x && mp.x <= r.x + r.width && mp.y >= r.y && mp.y <= r.y + r.height;

}



function throwChip(sx, sy, ex, ey, color, onLand) {

  const PP  = PATHFIND_PARAMS;

  const chip = _makeChip(1, color, null);

  chip.x(sx); chip.y(sy); chip.name('flying-chip');

  uiLayer.add(chip);

  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy);

  const power      = PP.throwPower      ?? 1.0;

  const spin       = PP.throwSpin       ?? 1.0;

  const squashMs   = PP.throwSquashMs   ?? 180;

  const squashSc   = PP.throwSquashScale ?? 1.4;

  const curve = Math.min(len * 0.25, 48) * power;

  const mx = (sx + ex) / 2, my = (sy + ey) / 2;

  const cpx = mx - (dy / (len || 1)) * curve;

  const cpy = my - (Math.abs(dx) / (len || 1)) * curve;

  const duration = Math.max(0.1, len / (400 * power));

  let elapsed = 0;

  const anim = new Konva.Animation(frame => {

    elapsed += frame.timeDiff / 1000;

    const t = Math.min(elapsed / duration, 1);

    const mt = 1 - t;

    chip.x(mt * mt * sx + 2 * mt * t * cpx + t * t * ex);

    chip.y(mt * mt * sy + 2 * mt * t * cpy + t * t * ey);

    chip.rotation(t * 360 * spin);

    if (t >= 1) {

      anim.stop();

      chip.rotation(0);

      const _landed = onLand?.();

      wakeAnimation();

      if (_landed) { chip.destroy(); uiLayer.batchDraw(); return; }

      chip.scaleX(squashSc); chip.scaleY(1 / squashSc);

      new Konva.Tween({

        node: chip, duration: squashMs / 1000,

        scaleX: 1, scaleY: 1,

        easing: Konva.Easings.ElasticEaseOut,

        onFinish: () => { chip.destroy(); uiLayer.batchDraw(); },

      }).play();

    }

  }, uiLayer);

  anim.start();

}



function returnChip(sx, sy, ex, ey, color) {

  const PP  = PATHFIND_PARAMS;

  const chip = _makeChip(1, color, null);

  chip.x(sx); chip.y(sy); chip.name('flying-chip');

  uiLayer.add(chip);

  const dx = ex - sx, dy = ey - sy, dist = Math.hypot(dx, dy);

  const power = (PP.returnPower ?? 2.0) * (PP.throwPower ?? 1.0);

  const spin  = PP.throwSpin ?? 1.0;

  const duration = Math.max(0.06, dist / (400 * power));

  let elapsed = 0;

  const anim = new Konva.Animation(frame => {

    elapsed += frame.timeDiff / 1000;

    const t = Math.min(elapsed / duration, 1);

    chip.x(sx + dx * t);

    chip.y(sy + dy * t);

    chip.rotation(t * 360 * spin);

    if (t >= 1) { anim.stop(); chip.destroy(); uiLayer.batchDraw(); }

  }, uiLayer);

  anim.start();

}

function createGroundChipToken(w, job) {

  const grp = _makeChip(1, w.color, job.chipNum);

  grp.x(job.x); grp.y(job.y); grp.name('ground-chip-token');

  const bg = grp.findOne('.chip-rect');

  bg.listening(true);

  const numText = grp.findOne('.chip-lbl');

  uiLayer.add(grp);

  _groundChipTokens[job.id] = { grp, numText, w, job };

  bg.on('mousedown', e => {

    if (currentMode !== 'gameInteract' || e.evt.button !== 0) return;

    e.cancelBubble = true;

    grp.visible(false);

    if (w.targetX === job.x && w.targetY === job.y) { w.targetX = null; w.targetY = null; }

    startGroundChipDrag(w, job, { x: job.x, y: job.y });

  });

  bg.on('contextmenu', e => {

    if (currentMode !== 'gameInteract') return;

    e.cancelBubble = true;

    if (w.targetX === job.x && w.targetY === job.y) { w.targetX = null; w.targetY = null; }

    w.jobs = w.jobs.filter(j => j.id !== job.id);

    destroyGroundChipToken(job.id);

    updateGroundChipNumbers(w);

    refreshWorkerJobPanel(w);

    if (w._refreshChipRow) w._refreshChipRow();

    returnChip(job.x, job.y, w.x, w.y, w.color);

    updateWorkerVisual(w);

    uiLayer.batchDraw(); workerLayer.batchDraw();

  });

  uiLayer.batchDraw();

}



function destroyGroundChipToken(jobId) {

  const entry = _groundChipTokens[jobId];

  if (entry) { entry.grp.destroy(); delete _groundChipTokens[jobId]; }

}



function updateGroundChipNumbers(w) {

  const moveJobs = (w.jobs || []).filter(j => j.type === 'move');

  moveJobs.forEach((job, idx) => {

    const entry = _groundChipTokens[job.id];

    if (entry) entry.numText.text(String(job.chipNum ?? idx + 1));

  });

  uiLayer.batchDraw();

}



function _panelChipHoverJob(job, active) {

  if (job.type === 'route') {

    const ch = routes.find(r => r.id === job.id);

    if (ch) { ch._liftHover = active; refreshSlotPortrait(ch); uiLayer.batchDraw(); }

  } else if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    if (sm) { sm._liftHover = active; refreshSmelterSlot(sm); uiLayer.batchDraw(); }

  } else if (job.type === 'move') {

    const entry = _groundChipTokens[job.id];

    if (entry) { entry.grp.opacity(active ? 1.5 : 1); uiLayer.batchDraw(); }

  }

}



function _returnJobChip(w, job) {

  let sx = w.x, sy = w.y;

  if (job.type === 'route') {

    const ch = routes.find(r => r.id === job.id);

    if (ch) {

      const grp = uiLayer.findOne('#slot_' + job.id);

      if (grp) { sx = grp.x(); sy = grp.y(); }

      const _si = (ch.workerSlots || []).indexOf(w.id);

      if (_si !== -1) ch.workerSlots[_si] = null;

      ch.workerIds = (ch.workerIds || []).filter(id => id !== w.id);

      w.jobs = w.jobs.filter(j => !(j.type === 'route' && j.id === job.id));

      w.state = 'idle'; w.path = null; w.inventory = {};

      refreshSlotPortrait(ch);

    }

  } else if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    if (sm) {

      const grp = uiLayer.findOne('#slot_sm_' + job.id);

      if (grp) { sx = grp.x(); sy = grp.y(); }

      const _oi = (sm.workerSlots || []).indexOf(w.id); if (_oi !== -1) sm.workerSlots[_oi] = null;

      w.jobs = w.jobs.filter(j => !(j.type === 'smelter' && j.id === job.id));

      w.state = 'idle'; w.path = null; w.inventory = {};

      refreshSmelterSlot(sm); updateSmelterLamps(sm);

    }

  } else if (job.type === 'move') {

    sx = job.x; sy = job.y;

    if (w.targetX === job.x && w.targetY === job.y) { w.targetX = null; w.targetY = null; }

    w.jobs = w.jobs.filter(j => j.id !== job.id);

    w.state = 'idle'; w.path = null; w.inventory = {};

    destroyGroundChipToken(job.id);

    updateGroundChipNumbers(w);

  }

  refreshWorkerJobPanel(w);

  if (w._refreshChipRow) w._refreshChipRow();

  returnChip(sx, sy, w.x, w.y, w.color);

  updateWorkerVisual(w);

  uiLayer.batchDraw(); workerLayer.batchDraw();

}



function startPanelChipDrag(w, job) {

  _chipDragInProgress = true;

  // Use cursor world position — cursor is over the chip at mousedown, gives center without conversion errors

  const startP = getWorldPointer() || { x: 0, y: 0 };



  // Remove job on-board representation

  if (job.type === 'route') {

    const ch = routes.find(r => r.id === job.id);

    if (ch) { ch.workerIds = (ch.workerIds || []).filter(id => id !== w.id); refreshSlotPortrait(ch); }

  } else if (job.type === 'smelter') {

    const sm = smelters.find(s => s.id === job.id);

    if (sm) { const oi = (sm.workerSlots || []).indexOf(w.id); if (oi !== -1) sm.workerSlots[oi] = null; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

  } else if (job.type === 'move') {

    if (w.targetX === job.x && w.targetY === job.y) { w.targetX = null; w.targetY = null; }

    destroyGroundChipToken(job.id);

    updateGroundChipNumbers(w);

  }

  const _origJobIdx = w.jobs.indexOf(job);

  w.jobs = w.jobs.filter(j => j !== job);

  w.state = 'idle'; w.path = null;

  refreshWorkerJobPanel(w);

  if (w._refreshChipRow) w._refreshChipRow();



  showLiftDim(); pushTransientMode('liftWorker');

  const dl = _ensureDragLayer();

  const VC = VISUAL_STYLES.chip;

  const dragChip = _makeChip(1, w.color, job.chipNum ?? 1);

  dragChip.x(startP.x); dragChip.y(startP.y);

  dl.add(dragChip);

  const trail = new Konva.Path({

    stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, dash: [8, 6], dashOffset: routeDashOffset,

    lineCap: 'butt', lineJoin: 'round', opacity: 0.85, listening: false, name: 'drag-trail',

  });

  dl.add(trail);



  let _snapSlot = null, _prevSnapSlot = null, _snapPanelBar = null;

  let _lastWP = { ...startP };

  const hl = s => {

    if (s === _prevSnapSlot) return;

    if (_prevSnapSlot?.routeRef) { _prevSnapSlot.routeRef._liftHover = false; _prevSnapSlot.routeRef._liftHoverSlot = undefined; refreshSlotPortrait(_prevSnapSlot.routeRef); }

    if (_prevSnapSlot?.smelterRef) { _prevSnapSlot.smelterRef._liftHover = false; refreshSmelterSlot(_prevSnapSlot.smelterRef); }

    _prevSnapSlot = s;

    if (s?.routeRef) { s.routeRef._liftHover = true; s.routeRef._liftHoverSlot = s.slotIndex; refreshSlotPortrait(s.routeRef); }

    if (s?.smelterRef) { s.smelterRef._liftHover = true; refreshSmelterSlot(s.smelterRef); }

  };



  const onMove = () => {

    const wp = getWorldPointer(); if (!wp) return;

    _lastWP = wp;

    dragChip.x(wp.x); dragChip.y(wp.y);

    const sdx = wp.x - startP.x, sdy = wp.y - startP.y, slen = Math.hypot(sdx, sdy);

    trail.data(slen < 2 ? `M ${startP.x} ${startP.y}` : (() => {

      const smx = (startP.x + wp.x) / 2, smy = (startP.y + wp.y) / 2;

      const cc = Math.min(slen * 0.25, 48);

      return `M ${startP.x} ${startP.y} Q ${smx - sdy/slen*cc} ${smy - Math.abs(sdx)/slen*cc} ${wp.x} ${wp.y}`;

    })());

    const vs = uiLayer.find('.slot').filter(s2 => s2.findOne('Rect')?.isVisible());

    let best = null, bd2 = 50 * 50;

    for (const s2 of vs) { const dx2 = s2.x()-wp.x, dy2 = s2.y()-wp.y; if (dx2*dx2+dy2*dy2 < bd2) { bd2=dx2*dx2+dy2*dy2; best=s2; } }

    _snapSlot = best; hl(best);

    const snap2 = _findSnapBarAtPointer(job);

    if (snap2 !== _snapPanelBar) {

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');

      _snapPanelBar = snap2;

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke('rgba(255,255,255,1)');

      hudLayer.batchDraw();

    }

    uiLayer.batchDraw(); dl.batchDraw();

  };



  const _doRefresh = () => {

    updateGroundChipNumbers(w); refreshWorkerJobPanel(w);

    if (w._refreshChipRow) w._refreshChipRow();

    updateWorkerVisual(w); uiLayer.batchDraw(); workerLayer.batchDraw();

  };



  const onUp = () => {

    _chipDragInProgress = false;

    stage.off('mousemove.panelchipdrag'); stage.off('mouseup.panelchipdrag');

    trail.destroy(); dragChip.destroy();

    hideLiftDim(); hl(null); popTransientMode(); while (pileFocusDepth > 0) leavePileFocus(); routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });



    if (_snapSlot?.smelterRef) {

      const sm = _snapSlot.smelterRef;

      throwChip(startP.x, startP.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); workerSay(w, 'No work without fluids!'); _doRefresh(); return; }

        const _smSlotIdx3 = _snapSlot.slotIndex ?? 0;

        if (!sm.workerSlots[_smSlotIdx3]) {

          const old2 = w.jobs.find(j => j.type === 'smelter');

          if (old2) { const osm = smelters.find(s2 => s2.id === old2.id); if (osm) { const oi = (osm.workerSlots || []).indexOf(w.id); if (oi !== -1) osm.workerSlots[oi] = null; refreshSmelterSlot(osm); updateSmelterLamps(osm); } w.jobs = w.jobs.filter(j => j !== old2); }

          sm.workerSlots[_smSlotIdx3] = w.id; w.jobs.push({ type: 'smelter', id: sm.id, chipNum: job.chipNum });

          w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSmelterSlot(sm); updateSmelterLamps(sm); workerSay(w, 'On the job!'); _doRefresh();

        } else {

          returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); _doRefresh();

        }

      }); return;

    } else if (_snapSlot?.routeRef) {

      const ch = _snapSlot.routeRef, slotIdx = _snapSlot.slotIndex ?? 0;

      throwChip(startP.x, startP.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); workerSay(w, 'No work without fluids!'); _doRefresh(); return; }

        if (ch.workerSlots.includes(w.id) && ch.workerSlots[slotIdx] !== w.id) {

          returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); _doRefresh(); return;

        }

        const displaced = ch.workerSlots[slotIdx];

        if (displaced && displaced !== w.id) {

          const dw = workers.find(wk => wk.id === displaced);

          if (dw) { dw.jobs = dw.jobs.filter(j => !(j.type === 'route' && j.id === ch.id)); dw.state = 'idle'; dw.path = null; refreshWorkerJobPanel(dw); if (dw._refreshChipRow) dw._refreshChipRow(); }

        } else if (displaced === w.id && job.type === 'route' && job.id !== ch.id) {

          const destJob = w.jobs.find(j => j.type === 'route' && j.id === ch.id);

          if (destJob) { const tmp = destJob.chipNum; destJob.chipNum = job.chipNum; job.chipNum = tmp; const srcRoute = routes.find(r => r.id === job.id); if (srcRoute) { srcRoute.workerIds = srcRoute.workerSlots.filter(Boolean); refreshSlotPortrait(srcRoute); } refreshSlotPortrait(ch); holdRouteView(ch.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null; refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow(); workerSay(w, 'Swapped!'); _doRefresh(); return; }

        }

        ch.workerSlots[slotIdx] = w.id;

        ch.workerIds = ch.workerSlots.filter(Boolean);

        w.jobs.push({ type: 'route', id: ch.id, chipNum: job.chipNum });

        w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

        refreshSlotPortrait(ch); holdRouteView(ch.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); workerSay(w, 'Back to work!'); _doRefresh(); return true;

      }); return;

    } else {

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');

      // Reorder (same worker) or swap (cross-worker)

      if (_snapPanelBar && !_snapSlot) {

        if (_snapPanelBar.w === w) {

          const targetJob = _snapPanelBar.bar.job;

          const tmp = job.chipNum; job.chipNum = targetJob.chipNum; targetJob.chipNum = tmp;

          w.jobs.splice(_origJobIdx, 0, job);

          if (job.type === 'route') {

            const ch = routes.find(r => r.id === job.id);

            if (ch) { ch.workerIds = ch.workerSlots.filter(Boolean); refreshSlotPortrait(ch); }

          } else if (job.type === 'smelter') {

            const sm = smelters.find(s => s.id === job.id);

            if (sm) { const fi = (sm.workerSlots || []).findIndex(s => !s); if (fi !== -1) sm.workerSlots[fi] = w.id; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

          } else if (job.type === 'move') {

            createGroundChipToken(w, job);

          }

          if (targetJob.type === 'route') {

            const tch = routes.find(r => r.id === targetJob.id);

            if (tch) refreshSlotPortrait(tch);

          } else if (targetJob.type === 'smelter') {

            const tsm = smelters.find(s => s.id === targetJob.id);

            if (tsm) { refreshSmelterSlot(tsm); updateSmelterLamps(tsm); }

          }

          _doRefresh();

          workerSay(w, 'Reprioritized!');

          hudLayer.batchDraw();

          return;

        }

        const _sw = _snapPanelBar.w, _sj = _snapPanelBar.bar.job;

        const endP = _lastWP;

        // Chip 1: forward throw — triggers swap on land

        throwChip(startP.x, startP.y, endP.x, endP.y, w.color, () => {

          _doJobSwap(w, job, _sw, _sj);

          workerSay(w, 'Switching!');

          updateGroundChipNumbers(w); updateWorkerVisual(w);

          uiLayer.batchDraw(); workerLayer.batchDraw();

        });

        // Chip 2: purely visual reverse chip — independent animation, always visible

        {

          const sdx = endP.x - startP.x, sdy = endP.y - startP.y;

          const slen = Math.hypot(sdx, sdy) || 1;

          const smx = (startP.x + endP.x) / 2, smy = (startP.y + endP.y) / 2;

          const cc = Math.min(slen * 0.25, 48);

          const cpx = smx - sdy / slen * cc;

          const cpy = smy - Math.abs(sdx) / slen * cc;

          const chip2 = _makeChip(1, _sw.color, null);

          chip2.name('flying-chip-2');

          uiLayer.add(chip2);

          let el2 = 0;

          const dur2 = 2.0;

          const anim2 = new Konva.Animation(frame => {

            el2 += frame.timeDiff / 1000;

            const t = Math.min(el2 / dur2, 1);

            const mt = 1 - t;

            chip2.x(mt * mt * endP.x + 2 * mt * t * cpx + t * t * startP.x);

            chip2.y(mt * mt * endP.y + 2 * mt * t * cpy + t * t * startP.y);

            if (t >= 1) { anim2.stop(); chip2.destroy(); uiLayer.batchDraw(); }

          }, uiLayer);

          anim2.start();

        }

        return;

      }

      // Panel free slot: transfer job to that worker

      const mousePos = stage.getPointerPosition();

      if (mousePos) {

        const emptySlots = hudLayer.find('.panel-chip-free');

        const hitSlot = emptySlots.find(r => {

          const ap = r.getAbsolutePosition();

          return mousePos.x >= ap.x && mousePos.x <= ap.x + r.width() &&

                 mousePos.y >= ap.y && mousePos.y <= ap.y + r.height();

        });

        if (hitSlot) {

          const ownerGrp = hitSlot.findAncestor(n => n.name().startsWith('job-panel-'));

          const wId = ownerGrp?.name().replace('job-panel-', '');

          const targetW = workers.find(wk => wk.id === wId);

          const targetAvail = targetW ? (targetW.chipCount || 4) - (targetW.jobs || []).length : 0;

          if (targetW && targetW !== w && targetAvail > 0) {

            throwChip(startP.x, startP.y, targetW.x, targetW.y, w.color, () => {

              job.chipNum = hitSlot._chipNum ?? nextChipNum(targetW);

              targetW.jobs.push(job);

              _addJobWorldRef(targetW, job);

              targetW.state = 'idle'; targetW.path = null;

              workerSay(targetW, 'On the job!');

              refreshWorkerJobPanel(targetW);

              if (targetW._refreshChipRow) targetW._refreshChipRow();

              updateWorkerVisual(targetW); _doRefresh();

            }); return;

          }

        }

      }

      if (!_pointerOverMasterPanel()) {

        const wp2 = getWorldPointer();

        if (wp2) {

          const newX = snap(wp2.x), newY = snap(wp2.y);

          const newJob = { type: 'move', id: uid(), x: newX, y: newY, chipNum: job.chipNum };

          throwChip(startP.x, startP.y, newX, newY, w.color, () => {

            if ((w.thirst || 0) >= 100 || (w.bladder || 0) >= 100) { returnChip(newX, newY, startP.x, startP.y, w.color); workerSay(w, 'No work without fluids!'); _doRefresh(); return; }

            _removeJobWorldRef(w, job);

            w.jobs.push(newJob);

            createGroundChipToken(w, newJob);

            workerSay(w, 'On it!'); _doRefresh();

          }); return;

        }

      }

    }

    // Snap back: restore job and on-board state

    w.jobs.push(job);

    if (job.type === 'route') {

      const ch = routes.find(r => r.id === job.id);

      if (ch) {

        const freeSlot = ch.workerSlots.findIndex(s => !s);

        const si = freeSlot !== -1 ? freeSlot : 0;

        ch.workerSlots[si] = w.id;

        ch.workerIds = ch.workerSlots.filter(Boolean);

        refreshSlotPortrait(ch);

      }

    } else if (job.type === 'smelter') {

      const sm = smelters.find(s => s.id === job.id);

      if (sm) { const fi = (sm.workerSlots || []).findIndex(s => !s); if (fi !== -1) sm.workerSlots[fi] = w.id; refreshSmelterSlot(sm); updateSmelterLamps(sm); }

    } else if (job.type === 'move') {

      const qIdx = w.jobs.filter(j => j.type === 'move').indexOf(job);

      createGroundChipToken(w, job);

    }

    returnChip(startP.x, startP.y, w.x, w.y, w.color);

    _doRefresh();

  };



  stage.on('mousemove.panelchipdrag', onMove);

  stage.on('mouseup.panelchipdrag', onUp);

}



function startFreeChipDrag(w, chipNum, srcRect) {

  _chipDragInProgress = true;

  const ap = srcRect.getAbsolutePosition();

  const stageScale = stage.scaleX();

  const startP = { x: (ap.x - stage.x()) / stageScale, y: (ap.y - stage.y()) / stageScale };



  showLiftDim(); pushTransientMode('liftWorker');

  const dl = _ensureDragLayer();

  const VC = VISUAL_STYLES.chip;

  const dragChip = _makeChip(1, w.color, chipNum ?? 1);

  dragChip.x(startP.x); dragChip.y(startP.y);

  dl.add(dragChip);

  const trail = new Konva.Path({

    stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, dash: [8, 6], dashOffset: routeDashOffset,

    lineCap: 'butt', lineJoin: 'round', opacity: 0.85, listening: false, name: 'drag-trail',

  });

  dl.add(trail);



  let _snapSlot = null, _prevSnapSlot = null, _snapPanelBar = null;

  const hl = s => {

    if (s === _prevSnapSlot) return;

    if (_prevSnapSlot?.routeRef) { _prevSnapSlot.routeRef._liftHover = false; _prevSnapSlot.routeRef._liftHoverSlot = undefined; refreshSlotPortrait(_prevSnapSlot.routeRef); }

    if (_prevSnapSlot?.smelterRef) { _prevSnapSlot.smelterRef._liftHover = false; refreshSmelterSlot(_prevSnapSlot.smelterRef); }

    _prevSnapSlot = s;

    if (s?.routeRef) { s.routeRef._liftHover = true; s.routeRef._liftHoverSlot = s.slotIndex; refreshSlotPortrait(s.routeRef); }

    if (s?.smelterRef) { s.smelterRef._liftHover = true; refreshSmelterSlot(s.smelterRef); }

  };

  const onMove = () => {

    const wp = getWorldPointer(); if (!wp) return;

    dragChip.x(wp.x); dragChip.y(wp.y);

    const sdx = wp.x - startP.x, sdy = wp.y - startP.y, slen = Math.hypot(sdx, sdy);

    trail.data(slen < 2 ? `M ${startP.x} ${startP.y}` : (() => {

      const smx = (startP.x + wp.x) / 2, smy = (startP.y + wp.y) / 2;

      const cc = Math.min(slen * 0.25, 48);

      return `M ${startP.x} ${startP.y} Q ${smx - sdy/slen*cc} ${smy - Math.abs(sdx)/slen*cc} ${wp.x} ${wp.y}`;

    })());

    const vs = uiLayer.find('.slot').filter(s2 => s2.findOne('Rect')?.isVisible());

    let best = null, bd2 = 50 * 50;

    for (const s2 of vs) { const dx2 = s2.x()-wp.x, dy2 = s2.y()-wp.y; if (dx2*dx2+dy2*dy2 < bd2) { bd2=dx2*dx2+dy2*dy2; best=s2; } }

    _snapSlot = best; hl(best);

    const snap2 = _findSnapBarAtPointer(null);

    if (snap2 !== _snapPanelBar) {

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');

      _snapPanelBar = snap2;

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke('rgba(255,255,255,1)');

      hudLayer.batchDraw();

    }

    uiLayer.batchDraw(); dl.batchDraw();

  };

  const onUp = () => {

    _chipDragInProgress = false;

    stage.off('mousemove.freechipdrag'); stage.off('mouseup.freechipdrag');

    trail.destroy(); dragChip.destroy();

    hideLiftDim(); hl(null); popTransientMode(); while (pileFocusDepth > 0) leavePileFocus(); routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });

    if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');



    // Own bar chip: reassign that job to this chip number

    if (_snapPanelBar?.w === w && !_snapSlot) {

      const targetJob = _snapPanelBar.bar.job;

      throwChip(startP.x, startP.y, w.x, w.y, w.color, () => {

        targetJob.chipNum = chipNum;

        refreshWorkerJobPanel(w);

        if (w._refreshChipRow) w._refreshChipRow();

        hudLayer.batchDraw(); workerSay(w, 'Reassigned!');

      }); return;

    }

    // Steal: take job from another worker's bar (not own bar)

    if (_snapPanelBar && !_snapSlot && _snapPanelBar.w !== w) {

      const { w: targetW, bar } = _snapPanelBar;

      const stolenJob = bar.job;

      throwChip(startP.x, startP.y, targetW.x, targetW.y, w.color, () => {

        _removeJobWorldRef(targetW, stolenJob);

        targetW.jobs = targetW.jobs.filter(j => j !== stolenJob);

        targetW.state = 'idle'; targetW.path = null;

        stolenJob.chipNum = chipNum;

        w.jobs.push(stolenJob);

        _addJobWorldRef(w, stolenJob);

        w.state = 'idle'; w.path = null;

        refreshWorkerJobPanel(targetW); refreshWorkerJobPanel(w);

        hudLayer.batchDraw(); workerLayer.batchDraw();

        workerSay(w, 'On the job!');

      }); return;

    }

    // Ghost slot hit with free chip: nothing to deposit, snap back silently

    if (_findGhostSlotAtPointer()) return;

    if (_snapSlot?.smelterRef) {

      const sm = _snapSlot.smelterRef;

      throwChip(startP.x, startP.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        const _smSlotIdx4 = _snapSlot.slotIndex ?? 0;

        if (!sm.workerSlots[_smSlotIdx4]) {

          sm.workerSlots[_smSlotIdx4] = w.id; w.jobs.push({ type: 'smelter', id: sm.id, chipNum });

          w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSmelterSlot(sm); updateSmelterLamps(sm);

          refreshWorkerJobPanel(w); hudLayer.batchDraw(); workerSay(w, 'On the job!');

        } else if (sm.workerSlots[_smSlotIdx4] === w.id) {

          const ej = w.jobs.find(j => j.type === 'smelter' && j.id === sm.id);

          if (ej) { ej.chipNum = chipNum; refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow(); hudLayer.batchDraw(); workerSay(w, 'Reassigned!'); }

          else { returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); }

        } else {

          returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color);

        }

      }); return;

    }

    if (_snapSlot?.routeRef) {

      const ch = _snapSlot.routeRef, slotIdx = _snapSlot.slotIndex ?? 0;

      if (ch.workerSlots[slotIdx] === w.id) {
        const _rx = w.x, _ry = w.y;
        setTimeout(() => returnChip(_snapSlot.x(), _snapSlot.y(), _rx, _ry, w.color), 150);
      } else { const _dispId = ch.workerSlots[slotIdx]; if (_dispId) { const _dw = workers.find(wk => wk.id === _dispId); if (_dw) { const _sx = _snapSlot.x(), _sy = _snapSlot.y(), _dx = _dw.x, _dy = _dw.y; setTimeout(() => returnChip(_sx, _sy, _dx, _dy, _dw.color), 150); } } }

      throwChip(startP.x, startP.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if (ch.workerSlots[slotIdx] === w.id) {
          const ej = w.jobs.find(j => j.type === 'route' && j.id === ch.id);
          if (ej) {
            ej.chipNum = chipNum;
            refreshSlotPortrait(ch);
            refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow();
            updateWorkerVisual(w); hudLayer.batchDraw(); workerLayer.batchDraw();
            workerSay(w, 'Reassigned!');
          }
          return true;
        }

        if (ch.workerSlots.includes(w.id) && ch.workerSlots[slotIdx] !== w.id) {

          const ej = w.jobs.find(j => j.type === 'route' && j.id === ch.id);

          if (ej) { ej.chipNum = chipNum; refreshWorkerJobPanel(w); if (w._refreshChipRow) w._refreshChipRow(); hudLayer.batchDraw(); workerSay(w, 'Reassigned!'); }

          else { returnChip(_snapSlot.x(), _snapSlot.y(), startP.x, startP.y, w.color); }

        } else {

          const displaced = ch.workerSlots[slotIdx];

          if (displaced && displaced !== w.id) {

            const dw = workers.find(wk => wk.id === displaced);

            if (dw) { dw.jobs = dw.jobs.filter(j => !(j.type === 'route' && j.id === ch.id)); dw.state = 'idle'; dw.path = null; refreshWorkerJobPanel(dw); if (dw._refreshChipRow) dw._refreshChipRow(); }

          }

          ch.workerSlots[slotIdx] = w.id;

          ch.workerIds = ch.workerSlots.filter(Boolean);

          w.jobs.push({ type: 'route', id: ch.id, chipNum });

          w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSlotPortrait(ch); holdRouteView(ch.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); refreshWorkerJobPanel(w); hudLayer.batchDraw();

          workerSay(w, 'Back to work!');

        }

      }); return;

    }

    // Ground ? move job

    const wp2 = getWorldPointer();

    if (wp2) {

      const newX = snap(wp2.x), newY = snap(wp2.y);

      const newJob = { type: 'move', id: uid(), x: newX, y: newY, chipNum };

      throwChip(startP.x, startP.y, newX, newY, w.color, () => {

        w.jobs.push(newJob);

        createGroundChipToken(w, newJob);

        w.state = 'idle'; w.path = null;

        refreshWorkerJobPanel(w); hudLayer.batchDraw();

        updateWorkerVisual(w); uiLayer.batchDraw(); workerLayer.batchDraw();

        workerSay(w, 'On it!');

      }); return;

    }

    // Snap back — chip stays free, arc back to worker

    returnChip(startP.x, startP.y, w.x, w.y, w.color);

  };

  stage.on('mousemove.freechipdrag', onMove);

  stage.on('mouseup.freechipdrag', onUp);

}



function startGroundChipDrag(w, job, startPos) {

  _chipDragInProgress = true;

  showLiftDim(); pushTransientMode('liftWorker');

  const dl = _ensureDragLayer();

  const VC = VISUAL_STYLES.chip;

  const startP = getWorldPointer() || startPos;

  const dragChip = _makeChip(1, w.color, job.chipNum ?? 1);

  dragChip.x(startP.x); dragChip.y(startP.y);

  dl.add(dragChip);

  const trail = new Konva.Path({

    stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, dash: [8, 6], dashOffset: routeDashOffset,

    lineCap: 'butt', lineJoin: 'round', opacity: 0.85, listening: false, name: 'drag-trail',

  });

  dl.add(trail);

  let _snapSlot = null, _prevSnapSlot = null, _snapPanelBar = null;

  const hl = s => {

    if (s === _prevSnapSlot) return;

    if (_prevSnapSlot?.routeRef) { _prevSnapSlot.routeRef._liftHover = false; _prevSnapSlot.routeRef._liftHoverSlot = undefined; refreshSlotPortrait(_prevSnapSlot.routeRef); }

    if (_prevSnapSlot?.smelterRef) { _prevSnapSlot.smelterRef._liftHover = false; refreshSmelterSlot(_prevSnapSlot.smelterRef); }

    _prevSnapSlot = s;

    if (s?.routeRef) { s.routeRef._liftHover = true; s.routeRef._liftHoverSlot = s.slotIndex; refreshSlotPortrait(s.routeRef); }

    if (s?.smelterRef) { s.smelterRef._liftHover = true; refreshSmelterSlot(s.smelterRef); }

  };

  const onMove = () => {

    const wp = getWorldPointer(); if (!wp) return;

    dragChip.x(wp.x); dragChip.y(wp.y);

    const sdx2 = wp.x - startPos.x, sdy2 = wp.y - startPos.y, slen = Math.hypot(sdx2, sdy2);

    trail.data(slen < 2 ? `M ${startPos.x} ${startPos.y}` : (() => {

      const smx = (startPos.x + wp.x) / 2, smy = (startPos.y + wp.y) / 2, sc = Math.min(slen * 0.25, 48);

      return `M ${startPos.x} ${startPos.y} Q ${smx - sdy2/slen*sc} ${smy - Math.abs(sdx2)/slen*sc} ${wp.x} ${wp.y}`;

    })());

    const vs = uiLayer.find('.slot').filter(s2 => s2.findOne('Rect')?.isVisible());

    let best = null, bd2 = 50 * 50;

    for (const s2 of vs) { const dx2 = s2.x()-wp.x, dy2 = s2.y()-wp.y; if (dx2*dx2+dy2*dy2 < bd2) { bd2=dx2*dx2+dy2*dy2; best=s2; } }

    _snapSlot = best; hl(best);

    const snap2 = _findSnapBarAtPointer(job);

    if (snap2 !== _snapPanelBar) {

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');

      _snapPanelBar = snap2;

      if (_snapPanelBar) _snapPanelBar.bar.chipRect.stroke('rgba(255,255,255,1)');

      hudLayer.batchDraw();

    }

    uiLayer.batchDraw(); dl.batchDraw();

  };

  const _doRefresh = () => {

    updateGroundChipNumbers(w); refreshWorkerJobPanel(w);

    if (w._refreshChipRow) w._refreshChipRow();

    updateWorkerVisual(w); uiLayer.batchDraw(); workerLayer.batchDraw();

  };

  const onUp = () => {

    _chipDragInProgress = false;

    stage.off('mousemove.groundchipdrag'); stage.off('mouseup.groundchipdrag');

    trail.destroy(); dragChip.destroy();

    hideLiftDim(); hl(null); popTransientMode(); while (pileFocusDepth > 0) leavePileFocus(); routes.forEach(r => { if (r._hoverViewActive) { clearTimeout(r._hoverTimer); exitRouteHover(r); } });

    if (_snapPanelBar && !_snapSlot) {

      _snapPanelBar.bar.chipRect.stroke(VC.strokeColor ?? 'rgba(255,255,255,0.55)');

      if (_snapPanelBar.w === w) {

        // Same-worker reorder: move to target position

        const _reorderBar = _snapPanelBar; _snapPanelBar = null;

        throwChip(startPos.x, startPos.y, w.x, w.y, w.color, () => {

          reorderJob(w, job, _reorderBar.bar.job);

          const entry = _groundChipTokens[job.id]; if (entry) entry.grp.visible(true);

          if (w.jobs[0] === job) { w.targetX = null; w.targetY = null; }

          _doRefresh();

        });

      } else {

        // Cross-worker swap

        const { w: targetW, bar } = _snapPanelBar; _snapPanelBar = null;

        const _tAP2 = bar.chipRect.getAbsolutePosition();

        const _sc2 = stage.scaleX();

        const _tp2 = { x: (_tAP2.x - stage.x()) / _sc2, y: (_tAP2.y - stage.y()) / _sc2 };

        let _nl2 = 0;

        const _onLand2 = () => {

          if (++_nl2 < 2) return;

          w.jobs = w.jobs.filter(j => j !== job); destroyGroundChipToken(job.id);

          _doJobSwap(w, job, targetW, bar.job);

          workerSay(w, 'Switching!');

          updateGroundChipNumbers(w); updateWorkerVisual(w);

          uiLayer.batchDraw(); workerLayer.batchDraw();

        };

        throwChip(startPos.x, startPos.y, targetW.x, targetW.y, w.color, _onLand2);

        throwChip(_tp2.x, _tp2.y, w.x, w.y, targetW.color, _onLand2);

      }

      return;

    }

    if (_snapSlot?.smelterRef) {

      const sm = _snapSlot.smelterRef;

      throwChip(startPos.x, startPos.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        const _smSlotIdx5 = _snapSlot.slotIndex ?? 0;

        if (!sm.workerSlots[_smSlotIdx5]) {

          w.jobs = w.jobs.filter(j => j !== job); destroyGroundChipToken(job.id);

          const old2 = w.jobs.find(j => j.type === 'smelter');

          if (old2) { const osm = smelters.find(s2 => s2.id === old2.id); if (osm) { const oi = (osm.workerSlots || []).indexOf(w.id); if (oi !== -1) osm.workerSlots[oi] = null; refreshSmelterSlot(osm); updateSmelterLamps(osm); } w.jobs = w.jobs.filter(j => j !== old2); }

          sm.workerSlots[_smSlotIdx5] = w.id; w.jobs.push({ type: 'smelter', id: sm.id, chipNum: job.chipNum });

          w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

          refreshSmelterSlot(sm); updateSmelterLamps(sm); workerSay(w, 'On the job!'); _doRefresh();

        } else {

          returnChip(_snapSlot.x(), _snapSlot.y(), startPos.x, startPos.y, w.color);

          const entry = _groundChipTokens[job.id]; if (entry) entry.grp.visible(true);

          if (w.jobs[0] === job && w.targetX == null) { w.targetX = job.x; w.targetY = job.y; }

        }

      }); return;

    } else if (_snapSlot?.routeRef) {

      const ch = _snapSlot.routeRef, slotIdx = _snapSlot.slotIndex ?? 0;

      throwChip(startPos.x, startPos.y, _snapSlot.x(), _snapSlot.y(), w.color, () => {

        if (ch.workerSlots.includes(w.id) && ch.workerSlots[slotIdx] !== w.id) {

          returnChip(_snapSlot.x(), _snapSlot.y(), startPos.x, startPos.y, w.color);

          const entry = _groundChipTokens[job.id]; if (entry) entry.grp.visible(true);

          if (w.jobs[0] === job && w.targetX == null) { w.targetX = job.x; w.targetY = job.y; }

          return;

        }

        w.jobs = w.jobs.filter(j => j !== job); destroyGroundChipToken(job.id);

        const displaced = ch.workerSlots[slotIdx];

        if (displaced && displaced !== w.id) {

          const dw = workers.find(wk => wk.id === displaced);

          if (dw) { dw.jobs = dw.jobs.filter(j => !(j.type === 'route' && j.id === ch.id)); dw.state = 'idle'; dw.path = null; refreshWorkerJobPanel(dw); if (dw._refreshChipRow) dw._refreshChipRow(); }

        }

        ch.workerSlots[slotIdx] = w.id;

        ch.workerIds = ch.workerSlots.filter(Boolean);

        w.jobs.push({ type: 'route', id: ch.id, chipNum: job.chipNum });

        w.inventory = {}; w.state = 'idle'; w.path = null; w.targetX = null; w.targetY = null;

        refreshSlotPortrait(ch); holdRouteView(ch.id); if (!isPointerOverRouteUI()) releaseHeldRouteView(); workerSay(w, 'Back to work!'); _doRefresh(); return true;

      }); return;

    } else {

      if (!_pointerOverMasterPanel()) {

        const wp2 = getWorldPointer();

        if (wp2) {

          const newX = snap(wp2.x), newY = snap(wp2.y);

          throwChip(startPos.x, startPos.y, newX, newY, w.color, () => {

            job.x = newX; job.y = newY;

            const entry = _groundChipTokens[job.id];

            if (entry) { entry.grp.x(newX); entry.grp.y(newY); entry.grp.visible(true); }

            if (w.jobs[0] === job) { w.targetX = null; w.targetY = null; }

            _doRefresh();

          }); return;

        }

      }

    }

    // Fallback: arc back to original ground position, then restore token

    returnChip(startPos.x, startPos.y, job.x, job.y, w.color);

    const entry = _groundChipTokens[job.id]; if (entry) entry.grp.visible(true);

    if (w.jobs[0] === job && w.targetX == null) { w.targetX = job.x; w.targetY = job.y; }

    _doRefresh();

  };

  stage.on('mousemove.groundchipdrag', onMove);

  stage.on('mouseup.groundchipdrag', onUp);

}



function spawnInitialWorkers() {

  const positions = [{x:160,y:160},{x:160,y:240},{x:160,y:320}];

  palette.workers.forEach((tpl, i) => {

    const pos = positions[i] || {x:160 + i*60, y:160};

    const w = {

      id: uid(), templateId: tpl.id, color: tpl.color, capacity: tpl.capacity,

      chipCount: tpl.chipCount ?? 4,

      speedMult: tpl.speedMult ?? 1, intelligenceSpeed: tpl.intelligenceSpeed ?? 1,

      description: tpl.description ?? 'I am ' + (tpl.name ?? ''),

      x: pos.x, y: pos.y, jobs: [], inventory: {}, noScrap: false, segIdx: 0, segT: 0, dir: 1,

      targetX: null, targetY: null,

      states: { lifting: false },

    };

    workers.push(w);

    drawWorker(w);

  });

  buildAllJobPanels();

}



