// ===== MODULE: visuals-tab.js (Stage 2 split) =====
// Classic <script>, shared global scope. Load order matters (see index.html).
// ===== VISUALS TAB =====

let gpActiveTab = 'gameplay';

const VS_TYPE_LABELS = {

  uiTheme: 'UI Theme',

  worker: 'Worker',

  pileSquare: 'Pile (square)',

  exportPallet: 'Export Pallet',

  sign: 'Sign',

  fridge: 'Fridge',

  outhouse: 'Outhouse',

  pileStackPiece: 'Pile Stack Piece',

  route: 'Route Path',

  slotRect: 'Slot Body',

  chipSlot: 'Chip Slot',

  slotMenu: 'Slot Menu',

  slotGear: 'Slot Menu — Gear Icon',

  slotDelete: 'Slot Menu — Delete Icon',

  slotReverse: 'Slot Menu — Reverse Icon',

  slotWorkerIcon: 'Slot Worker Icon',

  carryIndicator: 'Carry Indicator',

  speechBubble: 'Speech Bubble',

  tickIndicator: 'Tick Indicator',

  miniAnchor: 'Mini Anchor',

  pileCenterAnchor: 'Pile Center Anchor',

  obstacle: 'Obstacle',

  ghostFade: 'Ghost Fade',

  trafficLightMan: 'Traffic-Light Man',

  hintText: 'Hint Text',

  chip: 'Chip',

  workerSelection: 'Worker Select',

  physicsGhost: 'Physics Ghost',

  liftDim: 'Lift Dim',

  guiPanel: 'GUI Panel',

  routeFilter: 'Route Filter',

  scrapStack: 'Scrap Stack',

  jobPanel: 'Job Panel',

  building: 'Building',

  buildingDoor: 'Building Door',

  buildingSupport: 'Building Support',

  buildingChimney: 'Building Chimney',

  buildingSign: 'Building Sign',

  tree: 'Tree',

  hitboxPile: 'hitbox-pile',

  hitboxAnchor: 'anchor-hit',

  hitboxRouteHover: 'hover-hit-route',

  hitboxWorker: 'hitbox-worker',

  hitboxTri: 'hitbox-chip',

  hitboxSlot: 'hitbox-slot',

  hitboxSlotHover: 'hover-hit-slot',

  hitboxSlotIcons: 'slot-delhit / slot-gearhit',

  hitboxMiniAnchor: 'mini-anchor',

  zone: 'Zone (blob)',

  ingot: 'Ingot Scrap',

  smelterBody: 'Smelter Body',

  smelterInputPile: 'Smelter Input Pile',

  smelterOutputPile: 'Smelter Output Pile',

  smelterLamp: 'Smelter Lamp',

  smelterSpinner: 'Smelter Spinner',

  smelterStation: 'Smelter Work Station',

  idleZone: 'Idle Zone',

};

const VS_OPEN_TYPES = new Set();

const VS_GROUPS = [

  { id: 'uiTheme',      label: 'UI Theme',      keys: ['uiTheme'] },

  { id: 'worker',       label: 'Worker',        keys: ['worker', 'trafficLightMan', 'carryIndicator', 'speechBubble'] },

  { id: 'workerSelect', label: 'Worker Select', keys: ['workerSelection'] },

  { id: 'chip',         label: 'Chip',          keys: ['chip'] },

  { id: 'workerLift',   label: 'Worker Lift',   keys: ['physicsGhost', 'liftDim'] },

  { id: 'route',        label: 'Route',         keys: ['route', 'miniAnchor'] },

  { id: 'slot',         label: 'Slot',          keys: ['slotRect', 'chipSlot', 'slotMenu', 'slotGear', 'slotDelete', 'slotReverse', 'slotWorkerIcon'] },

  { id: 'routeFilter',  label: 'Route Filter',  keys: ['guiPanel', 'routeFilter'] },

  { id: 'pile',         label: 'Pile',          keys: ['pileSquare', 'exportPallet', 'pileStackPiece', 'pileCenterAnchor', 'scrapStack'] },

  { id: 'zone',         label: 'Zone',          keys: ['zone', 'idleZone'] },

  { id: 'smelter',        label: 'Smelter',        keys: ['smelterBody', 'smelterInputPile', 'smelterOutputPile', 'smelterLamp', 'smelterSpinner', 'smelterStation'] },

  { id: 'jobPanel',       label: 'Job Panel',       keys: ['jobPanel'] },

  { id: 'sign',           label: 'Sign',            keys: ['sign'] },

  { id: 'fridge',         label: 'Fridge',          keys: ['fridge'] },

  { id: 'outhouse',       label: 'Outhouse',        keys: ['outhouse'] },

  { id: 'uncategorized',  label: 'Uncategorized',  keys: ['obstacle', 'ingot', 'ghostFade', 'hintText', 'tickIndicator'] },

];

const VS_OPEN_GROUPS = new Set();

function vsGroupForKey(k) { return VS_GROUPS.find(g => g.keys.includes(k)) || null; }

function vsRenderGroupHeader(group) {

  const open = VS_OPEN_GROUPS.has(group.id);

  const anyDirty = group.keys.some(k => vsTypeIsDirty(k));

  return `<div class="vs-group-header${anyDirty ? ' dirty' : ''}" data-group="${group.id}"><span class="vs-group-label">${group.label}</span><span class="vs-type-arrow${open ? ' open' : ''}">?</span></div>`;

}

const DECORATION_TYPES = new Set(['building', 'buildingDoor', 'buildingSupport', 'buildingChimney', 'buildingSign', 'tree']);

const HITBOX_TYPES = new Set(['hitboxPile', 'hitboxAnchor', 'hitboxRouteHover', 'hitboxTri', 'hitboxWorker', 'hitboxSlot', 'hitboxSlotHover', 'hitboxSlotIcons', 'hitboxMiniAnchor']);



function renderDefaultGameplayContent() {

  const content = document.getElementById('gp-content');

  if (!content) return;

  const row = (label, key, step) => `

    <tr>

      <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:60%">${label}</td>

      <td style="padding:3px 4px;border-bottom:1px solid #1c1c1c">

        <input type="number" step="${step}" value="${PATHFIND_PARAMS[key]}"

          style="width:64px;background:#1a1d23;border:1px solid #444;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px"

          data-pfp="${key}">

      </td>

    </tr>`;

  const smpRow = (label, key, step) => `

    <tr>

      <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:60%">${label}</td>

      <td style="padding:3px 4px;border-bottom:1px solid #1c1c1c">

        <input type="number" step="${step}" value="${SMELTER_PARAMS[key]}"

          style="width:64px;background:#1a1d23;border:1px solid #444;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px"

          data-smp="${key}">

      </td>

    </tr>`;

  const wtRow = (label, key, step) => `

    <tr>

      <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:60%">${label}</td>

      <td style="padding:3px 4px;border-bottom:1px solid #1c1c1c">

        <input type="number" step="${step}" value="${WORKER_TIMINGS[key]}"

          style="width:64px;background:#1a1d23;border:1px solid #444;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px"

          data-wt="${key}">

      </td>

    </tr>`;

  const moneyRow = (label, key, step) => `

    <tr>

      <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:60%">${label}</td>

      <td style="padding:3px 4px;border-bottom:1px solid #1c1c1c">

        <input type="number" step="${step}" value="${MONEY_PARAMS[key]}"

          style="width:64px;background:#1a1d23;border:1px solid #444;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px"

          data-money="${key}">

      </td>

    </tr>`;

  content.innerHTML = gpSectionTitle('Workers') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      ${row('Think time (s)', 'thinkTime', 0.5)}

    </table>` +

    gpSectionTitle('Chip Throw') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      ${row('Throw power', 'throwPower', 0.1)}

      ${row('Return power', 'returnPower', 0.1)}

      ${row('Spin (rotations)', 'throwSpin', 0.1)}

      ${row('Squash duration (ms)', 'throwSquashMs', 10)}

      ${row('Squash scale', 'throwSquashScale', 0.05)}

    </table>` +

    gpSectionTitle('Pathfinding') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      ${row('Worker speed (px/s)', 'workerSpeed', 5)}

      ${row('Grid cell size (px)', 'cellSize', 5)}

      ${row('Cost on route', 'costOnRoute', 0.1)}

      ${row('Cost off route', 'costOffRoute', 0.1)}

      ${row('Max A* iterations', 'maxIterations', 100)}

      ${row('Stuck timeout (s)', 'stuckTimeout', 0.5)}

    </table>` +

    gpSectionTitle('Smelter') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      ${smpRow('Conversion time (s)', 'conversionTimeSec', 0.5)}

      ${smpRow('Scraps per ingot', 'ingotCost', 1)}

    </table>` +

    gpSectionTitle('Job Panel') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      ${wtRow('Job bars per worker', 'jobBarSlots', 1)}

    </table>` +

    gpSectionTitle('Money') +

    `<table style="width:100%;border-collapse:collapse;font-size:12px">

      <tr>

        <td style="color:#888;padding:5px 4px;border-bottom:1px solid #1c1c1c;width:60%">Balance</td>

        <td style="padding:3px 4px;border-bottom:1px solid #1c1c1c">

          <span id="gp-money-balance" style="color:#fff;font-size:12px">$${playerMoney.toLocaleString()}</span>

        </td>

      </tr>

      ${moneyRow('Ingot price', 'ingotPrice', 1)}

      ${moneyRow('Sell threshold', 'sellThreshold', 1)}

      ${moneyRow('Starting funds', 'startingFunds', 1)}

      ${moneyRow('Win condition', 'winCondition', 1)}

    </table>`;

  content.querySelectorAll('[data-pfp]').forEach(input => {

    input.addEventListener('input', () => {

      const v = parseFloat(input.value);

      if (Number.isFinite(v)) PATHFIND_PARAMS[input.dataset.pfp] = v;

    });

  });

  content.querySelectorAll('[data-smp]').forEach(input => {

    input.addEventListener('input', () => {

      const v = parseFloat(input.value);

      if (Number.isFinite(v)) SMELTER_PARAMS[input.dataset.smp] = v;

    });

  });

  content.querySelectorAll('[data-wt]').forEach(input => {

    input.addEventListener('input', () => {

      const v = parseFloat(input.value);

      if (Number.isFinite(v)) {

        WORKER_TIMINGS[input.dataset.wt] = v;

        if (input.dataset.wt === 'jobBarSlots') buildAllJobPanels();

      }

    });

  });

  content.querySelectorAll('[data-money]').forEach(input => {

    input.addEventListener('input', () => {

      const v = parseFloat(input.value);

      if (Number.isFinite(v)) {
        MONEY_PARAMS[input.dataset.money] = v;
        if (input.dataset.money === 'startingFunds') { playerMoney = v; updateMoneyDisplay(); }
      }

    });

  });

}

function gpSwitchTab(tab) {

  gpActiveTab = tab;

  document.querySelectorAll('.gp-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.gpTab === tab));

  const activeBtn = document.querySelector('.gp-tab[data-gp-tab="' + tab + '"]');

  const titleEl = document.getElementById('gp-panel-title');

  if (activeBtn && titleEl) titleEl.textContent = activeBtn.textContent;

  document.getElementById('gp-toolbar').hidden = (tab !== 'gameplay');

  document.getElementById('gp-content').hidden = (tab !== 'gameplay');

  document.getElementById('gp-visuals-pane').hidden = tab !== 'visuals';

  document.getElementById('gp-decorations-pane').hidden = tab !== 'decorations';

  if (tab === 'visuals') renderVisualsTab();

  else if (tab === 'decorations') renderDecVisualsPanel();

}



function vsIsColor(value) {

  if (typeof value !== 'string') return false;

  return /^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value);

}

function vsParseRgba(s) {

  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);

  if (!m) return null;

  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };

}

function vsToHex(value) {

  if (typeof value !== 'string') return '#000000';

  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();

  if (/^#[0-9a-f]{3}$/i.test(value)) {

    return '#' + value.slice(1).split('').map(c => c + c).join('').toLowerCase();

  }

  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7).toLowerCase();

  const rgba = vsParseRgba(value);

  if (rgba) {

    const h = n => n.toString(16).padStart(2, '0');

    return '#' + h(rgba.r) + h(rgba.g) + h(rgba.b);

  }

  return '#000000';

}

function vsApplyHexPreservingAlpha(originalValue, hex) {

  const rgba = typeof originalValue === 'string' ? vsParseRgba(originalValue) : null;

  if (rgba && rgba.a < 1) {

    const r = parseInt(hex.slice(1, 3), 16);

    const g = parseInt(hex.slice(3, 5), 16);

    const b = parseInt(hex.slice(5, 7), 16);

    return `rgba(${r},${g},${b},${rgba.a})`;

  }

  return hex;

}

function vsGetAlpha(value) {

  if (typeof value !== 'string') return 1;

  const rgba = vsParseRgba(value);

  return rgba ? rgba.a : 1;

}

function vsApplyAlpha(originalValue, alpha) {

  const hex = vsToHex(originalValue);

  const r = parseInt(hex.slice(1, 3), 16);

  const g = parseInt(hex.slice(3, 5), 16);

  const b = parseInt(hex.slice(5, 7), 16);

  return alpha >= 1 ? hex : `rgba(${r},${g},${b},${alpha})`;

}



function vsTypeIsDirty(typeKey) {

  const live = VISUAL_STYLES[typeKey];

  const def = VISUAL_STYLES_DEFAULT[typeKey];

  return Object.keys(def).some(k => live[k] !== def[k]);

}

function vsChangedKeys(typeKey) {

  const live = VISUAL_STYLES[typeKey];

  const def = VISUAL_STYLES_DEFAULT[typeKey];

  return Object.keys(def).filter(k => live[k] !== def[k]);

}



function vsBindListEvents(list, rerenderFn, skipTypeHeaders = false) {

  if (!skipTypeHeaders) {

    list.querySelectorAll('.vs-type-header').forEach(hdr => {

      hdr.addEventListener('click', () => {

        const key = hdr.dataset.type;

        if (VS_OPEN_TYPES.has(key)) VS_OPEN_TYPES.delete(key); else VS_OPEN_TYPES.add(key);

        rerenderFn();

      });

    });

  }

  list.querySelectorAll('[data-vs-action]').forEach(btn => {

    btn.addEventListener('click', e => {

      e.stopPropagation();

      const action = btn.dataset.vsAction;

      const typeKey = btn.dataset.type;

      if (action === 'reset-type') { vsResetType(typeKey); rerenderFn(); }

      else if (action === 'copy-type') vsCopyTypePrompt(typeKey);

    });

  });

  list.querySelectorAll('.vs-prop-input').forEach(input => {

    input.addEventListener('input', () => vsHandleInput(input));

    input.addEventListener('change', () => vsHandleInput(input));

  });

  list.querySelectorAll('.vs-prop-select').forEach(sel => {

    sel.addEventListener('change', () => vsHandleInput(sel));

  });

  list.querySelectorAll('.vs-prop-checkbox').forEach(cb => {

    cb.addEventListener('change', () => vsHandleInput(cb));

  });

  list.querySelectorAll('.vs-prop-color-swatch').forEach(input => {

    input.addEventListener('input', () => vsHandleColorSwatch(input));

  });

  list.querySelectorAll('.vs-prop-opacity').forEach(slider => {

    slider.addEventListener('input', () => vsHandleOpacity(slider));

  });

  list.querySelectorAll('.vs-prop-reset').forEach(btn => {

    btn.addEventListener('click', e => {

      e.stopPropagation();

      vsResetProp(btn.dataset.type, btn.dataset.prop);

    });

  });

}



function renderVisualsTab() {

  const list = document.getElementById('vs-list');

  if (!list) return;

  const filter = (document.getElementById('vs-search')?.value || '').trim().toLowerCase();

  const matches = k => !filter || k.toLowerCase().includes(filter) ||

    (VS_TYPE_LABELS[k] || '').toLowerCase().includes(filter) ||

    Object.keys(VISUAL_STYLES_DEFAULT[k] || {}).some(pk => pk.toLowerCase().includes(filter));

  const seenGroups = new Set();

  const html = [];

  Object.keys(VS_TYPE_LABELS).forEach(k => {

    if (DECORATION_TYPES.has(k) || HITBOX_TYPES.has(k)) return;

    const group = vsGroupForKey(k);

    if (group) {

      if (seenGroups.has(group.id)) return;

      seenGroups.add(group.id);

      const visibleKeys = group.keys.filter(gk => VS_TYPE_LABELS[gk] && matches(gk));

      if (!visibleKeys.length && filter) return;

      html.push(vsRenderGroupHeader(group));

      const groupOpen = VS_OPEN_GROUPS.has(group.id) || !!filter;

      if (groupOpen) visibleKeys.forEach(gk => html.push(vsRenderTypeRow(gk, !!filter)));

    } else {

      if (matches(k)) html.push(vsRenderTypeRow(k, !!filter));

    }

  });

  list.innerHTML = html.join('');

  list.querySelectorAll('.vs-group-header').forEach(hdr => {

    hdr.addEventListener('click', () => {

      const id = hdr.dataset.group;

      if (VS_OPEN_GROUPS.has(id)) VS_OPEN_GROUPS.delete(id); else VS_OPEN_GROUPS.add(id);

      renderVisualsTab();

    });

  });

  vsBindListEvents(list, renderVisualsTab);

}



function renderDecVisualsPanel() {

  const list = document.getElementById('dec-list');

  if (!list) return;

  const filter = (document.getElementById('dec-search')?.value || '').trim().toLowerCase();

  const types = Object.keys(VS_TYPE_LABELS).filter(k => {

    if (!DECORATION_TYPES.has(k)) return false;

    if (!filter) return true;

    const label = VS_TYPE_LABELS[k].toLowerCase();

    return k.toLowerCase().includes(filter) || label.includes(filter) ||

      Object.keys(VISUAL_STYLES_DEFAULT[k] || {}).some(pk => pk.toLowerCase().includes(filter));

  });

  list.innerHTML = types.map(typeKey => vsRenderTypeRow(typeKey, !!filter)).join('');

  vsBindListEvents(list, renderDecVisualsPanel);

}



function renderHitboxesTab() {

  const list = document.getElementById('hb-list');

  if (!list) return;

  const types = Array.from(HITBOX_TYPES);

  list.innerHTML = types.map(typeKey => vsRenderTypeRow(typeKey)).join('');

  list.querySelectorAll('.vs-type-header').forEach(hdr => {

    hdr.addEventListener('click', () => {

      const key = hdr.dataset.type;

      if (VS_OPEN_TYPES.has(key)) {

        VS_OPEN_TYPES.delete(key);

        _hitboxPinnedTypes.delete(key);

      } else {

        VS_OPEN_TYPES.add(key);

        _hitboxPinnedTypes.add(key);

      }

      renderHitboxesTab();

      refreshHitboxOverlay();

    });

  });

  vsBindListEvents(list, renderHitboxesTab, true);

}



async function hbSaveToCode() {

  const btn = document.getElementById('hb-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-visual-styles', {

      method: 'POST', headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(VISUAL_STYLES),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    Object.keys(VISUAL_STYLES).forEach(k => Object.assign(VISUAL_STYLES_DEFAULT[k], VISUAL_STYLES[k]));

    renderHitboxesTab();

    hbFlashToolbar('Saved to index.html');

  } catch (err) {

    const msg = String(err.message || err);

    hbFlashToolbar(/Failed to fetch|NetworkError/i.test(msg) ? 'Save needs dev server (run serve.bat)' : 'Save failed: ' + msg);

  } finally {

    if (btn) btn.disabled = false;

  }

}

function hbFlashToolbar(msg) {

  const tb = document.getElementById('hb-toolbar');

  if (!tb) return;

  let flash = tb.querySelector('.vs-flash');

  if (!flash) {

    flash = document.createElement('div');

    flash.className = 'vs-flash';

    flash.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:-22px;background:#1e3a5f;color:#7ab4f5;padding:3px 10px;border-radius:4px;font-size:10px;pointer-events:none;';

    tb.style.position = 'relative';

    tb.appendChild(flash);

  }

  flash.textContent = msg;

  flash.style.opacity = '1'; flash.style.transition = '';

  clearTimeout(flash._t);

  flash._t = setTimeout(() => { flash.style.opacity = '0'; flash.style.transition = 'opacity 0.4s'; }, 1100);

}



function vsRenderTypeRow(typeKey, forceOpen = false) {

  const open = VS_OPEN_TYPES.has(typeKey) || forceOpen;

  const dirty = vsTypeIsDirty(typeKey);

  const changedCount = vsChangedKeys(typeKey).length;

  const meta = dirty ? `${changedCount} changed` : '';

  return `

    <div class="vs-type-row">

      <div class="vs-type-header ${dirty ? 'dirty' : ''}" data-type="${typeKey}">

        <span class="vs-type-name">${VS_TYPE_LABELS[typeKey]} <span class="vs-type-key">${typeKey}</span></span>

        <span style="display:flex;align-items:center;gap:6px">

          <span class="vs-type-meta ${dirty ? 'dirty' : ''}">${meta}</span>

          <span class="vs-type-arrow ${open ? 'open' : ''}">?</span>

        </span>

      </div>

      <div class="vs-type-body ${open ? 'open' : ''}">

        ${open ? vsRenderProps(typeKey) : ''}

      </div>

    </div>`;

}



function vsRenderProps(typeKey) {

  const live = VISUAL_STYLES[typeKey];

  const def = VISUAL_STYLES_DEFAULT[typeKey];

  const rows = Object.keys(def).map(k => {

    const v = live[k];

    const changed = v !== def[k];

    let inputHtml;

    if (vsIsColor(v)) {

      const hex = vsToHex(v);

      const alpha = vsGetAlpha(v);

      inputHtml = `

        <input type="color" class="vs-prop-color-swatch" value="${hex}" data-type="${typeKey}" data-prop="${k}">

        <input type="range" class="vs-prop-opacity" min="0" max="100" value="${Math.round(alpha * 100)}" data-type="${typeKey}" data-prop="${k}" title="Opacity">

        <input type="text" class="vs-prop-input color-text" value="${escapeAttr(v)}" data-type="${typeKey}" data-prop="${k}" data-kind="text">`;

    } else if (typeof v === 'boolean') {

      inputHtml = `<input type="checkbox" class="vs-prop-checkbox" ${v ? 'checked' : ''} data-type="${typeKey}" data-prop="${k}" data-kind="boolean">`;

    } else if (k === 'fontFamily') {

      const fonts = [

        { value: 'system-ui', label: 'System' },

        { value: 'Georgia, serif', label: 'Georgia' },

        { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet' },

      ];

      const opts = fonts.map(f => `<option value="${f.value}" ${v === f.value ? 'selected' : ''}>${f.label}</option>`).join('');

      inputHtml = `<select class="vs-prop-select" data-type="${typeKey}" data-prop="${k}" data-kind="select">${opts}</select>`;

    } else if (typeof v === 'number') {

      inputHtml = `<input type="number" step="any" class="vs-prop-input" value="${v}" data-type="${typeKey}" data-prop="${k}" data-kind="number">`;

    } else {

      inputHtml = `<input type="text" class="vs-prop-input" value="${escapeAttr(String(v))}" data-type="${typeKey}" data-prop="${k}" data-kind="text">`;

    }

    return `

      <div class="vs-prop-row">

        <label class="${changed ? 'changed' : ''}" title="${k} (default: ${escapeAttr(String(def[k]))})">${k}</label>

        ${inputHtml}

        <button class="vs-prop-reset" title="Reset to default" data-type="${typeKey}" data-prop="${k}">?</button>

      </div>`;

  }).join('');

  return rows + `

    <div class="vs-type-actions">

      <button data-vs-action="copy-type" data-type="${typeKey}">Copy Prompt</button>

      <button data-vs-action="reset-type" data-type="${typeKey}">Reset Type</button>

    </div>`;

}



function escapeAttr(s) {

  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

}



function vsHandleInput(input) {

  const typeKey = input.dataset.type;

  const prop = input.dataset.prop;

  const kind = input.dataset.kind;

  let v = input.value;

  if (kind === 'number') {

    const n = parseFloat(v);

    if (!Number.isFinite(n)) return;

    v = n;

  } else if (kind === 'boolean') {

    v = input.checked;

  }

  VISUAL_STYLES[typeKey][prop] = v;

  applyVisualStyles(typeKey);

  vsRefreshHeader(typeKey);

}

function vsHandleColorSwatch(swatch) {

  const typeKey = swatch.dataset.type;

  const prop = swatch.dataset.prop;

  const original = VISUAL_STYLES[typeKey][prop];

  const newVal = vsApplyHexPreservingAlpha(original, swatch.value);

  VISUAL_STYLES[typeKey][prop] = newVal;

  const text = swatch.parentElement.querySelector('.color-text');

  if (text) text.value = newVal;

  applyVisualStyles(typeKey);

  vsRefreshHeader(typeKey);

}

function vsHandleOpacity(slider) {

  const typeKey = slider.dataset.type;

  const prop = slider.dataset.prop;

  const alpha = parseFloat(slider.value) / 100;

  const original = VISUAL_STYLES[typeKey][prop];

  const newVal = vsApplyAlpha(original, alpha);

  VISUAL_STYLES[typeKey][prop] = newVal;

  const text = slider.parentElement.querySelector('.color-text');

  if (text) text.value = newVal;

  applyVisualStyles(typeKey);

  vsRefreshHeader(typeKey);

}

function vsRefreshHeader(typeKey) {

  const list = document.getElementById('vs-list');

  if (!list) return;

  const hdr = list.querySelector(`.vs-type-header[data-type="${typeKey}"]`);

  if (!hdr) return;

  const dirty = vsTypeIsDirty(typeKey);

  hdr.classList.toggle('dirty', dirty);

  const meta = hdr.querySelector('.vs-type-meta');

  if (meta) {

    const n = vsChangedKeys(typeKey).length;

    meta.textContent = dirty ? `${n} changed` : '';

    meta.classList.toggle('dirty', dirty);

  }

  // Update changed-label highlighting in body without rebuilding inputs (would steal focus).

  const body = hdr.nextElementSibling;

  if (body) {

    const def = VISUAL_STYLES_DEFAULT[typeKey];

    const live = VISUAL_STYLES[typeKey];

    body.querySelectorAll('.vs-prop-row').forEach(row => {

      const lbl = row.querySelector('label');

      const propInput = row.querySelector('[data-prop]');

      if (!lbl || !propInput) return;

      const k = propInput.dataset.prop;

      lbl.classList.toggle('changed', live[k] !== def[k]);

    });

  }

}

function vsResetProp(typeKey, prop) {

  VISUAL_STYLES[typeKey][prop] = VISUAL_STYLES_DEFAULT[typeKey][prop];

  applyVisualStyles(typeKey);

  renderVisualsTab();

}

function vsResetType(typeKey) {

  Object.assign(VISUAL_STYLES[typeKey], VISUAL_STYLES_DEFAULT[typeKey]);

  applyVisualStyles(typeKey);

  renderVisualsTab();

}

function vsResetAll() {

  Object.keys(VISUAL_STYLES).forEach(k => {

    Object.assign(VISUAL_STYLES[k], VISUAL_STYLES_DEFAULT[k]);

    applyVisualStyles(k);

  });

  renderVisualsTab();

}

function vsResetDecorationsAll() {

  DECORATION_TYPES.forEach(k => {

    Object.assign(VISUAL_STYLES[k], VISUAL_STYLES_DEFAULT[k]);

    applyVisualStyles(k);

  });

  renderDecVisualsPanel();

}



function vsBuildPrompt(typeKeys) {

  const dirty = typeKeys.filter(k => vsTypeIsDirty(k));

  if (dirty.length === 0) {

    return 'No visual properties have been changed from defaults.';

  }

  const lines = [];

  lines.push('Update visual properties in index.html (the VISUAL_STYLES_DEFAULT object near APP_VERSION).');

  lines.push('');

  lines.push('The following changes were dialed in via the Visuals tab and should become the new defaults:');

  lines.push('');

  dirty.forEach(typeKey => {

    lines.push(`# ${VS_TYPE_LABELS[typeKey]} (VISUAL_STYLES.${typeKey})`);

    vsChangedKeys(typeKey).forEach(k => {

      const oldV = VISUAL_STYLES_DEFAULT[typeKey][k];

      const newV = VISUAL_STYLES[typeKey][k];

      lines.push(`  ${k}: ${JSON.stringify(oldV)} ? ${JSON.stringify(newV)}`);

    });

    lines.push('');

  });

  lines.push('Apply these by editing the corresponding entries inside VISUAL_STYLES_DEFAULT. The draw functions already read from VISUAL_STYLES, so no other code changes are required.');

  return lines.join('\n');

}



async function vsCopy(text) {

  try {

    await navigator.clipboard.writeText(text);

    return true;

  } catch (err) {

    const ta = document.createElement('textarea');

    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';

    document.body.appendChild(ta); ta.select();

    try { document.execCommand('copy'); document.body.removeChild(ta); return true; }

    catch { document.body.removeChild(ta); return false; }

  }

}

async function vsCopyTypePrompt(typeKey) {

  const text = vsBuildPrompt([typeKey]);

  await vsCopy(text);

  vsFlashToolbar('Copied prompt');

}

async function vsCopyAllPrompt(typeKeys) {

  if (!typeKeys) typeKeys = Object.keys(VS_TYPE_LABELS);

  const text = vsBuildPrompt(typeKeys);

  await vsCopy(text);

  vsFlashToolbar('Copied prompt');

}

async function vsSaveToCode() {

  const btn = document.getElementById('vs-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-visual-styles', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(VISUAL_STYLES),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {

      throw new Error(data.error || `HTTP ${res.status}`);

    }

    // Saved values are the new defaults — sync the in-memory copy so dirty flags clear.

    Object.keys(VISUAL_STYLES).forEach(typeKey => {

      Object.assign(VISUAL_STYLES_DEFAULT[typeKey], VISUAL_STYLES[typeKey]);

    });

    renderVisualsTab();

    vsFlashToolbar('Saved to index.html');

  } catch (err) {

    const msg = String(err.message || err);

    if (/Failed to fetch|NetworkError/i.test(msg)) {

      vsFlashToolbar('Save needs dev server (run serve.bat)');

    } else {

      vsFlashToolbar('Save failed: ' + msg);

    }

  } finally {

    if (btn) btn.disabled = false;

  }

}

async function decSaveToCode() {

  const btn = document.getElementById('dec-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-visual-styles', {

      method: 'POST', headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify(VISUAL_STYLES),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    Object.keys(VISUAL_STYLES).forEach(k => Object.assign(VISUAL_STYLES_DEFAULT[k], VISUAL_STYLES[k]));

    renderDecVisualsPanel();

    decFlashToolbar('Saved to index.html');

  } catch (err) {

    const msg = String(err.message || err);

    decFlashToolbar(/Failed to fetch|NetworkError/i.test(msg) ? 'Save needs dev server (run serve.bat)' : 'Save failed: ' + msg);

  } finally {

    if (btn) btn.disabled = false;

  }

}

async function gpSaveToCode() {

  const btn = document.getElementById('gp-save-code');

  if (btn) btn.disabled = true;

  try {

    const res = await fetch('/save-gameplay-params', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ pathfind: PATHFIND_PARAMS, smelter: SMELTER_PARAMS, worker: WORKER_TIMINGS, money: MONEY_PARAMS }),

    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {

      throw new Error(data.error || `HTTP ${res.status}`);

    }

    gpFlashToolbar('Saved to index.html');

  } catch (err) {

    const msg = String(err.message || err);

    if (/Failed to fetch|NetworkError/i.test(msg)) {

      gpFlashToolbar('Save needs dev server (run serve.bat)');

    } else {

      gpFlashToolbar('Save failed: ' + msg);

    }

  } finally {

    if (btn) btn.disabled = false;

  }

}

function gpFlashToolbar(msg) {

  const tb = document.getElementById('gp-toolbar');

  if (!tb) return;

  let flash = tb.querySelector('.gp-flash');

  if (!flash) {

    flash = document.createElement('div');

    flash.className = 'gp-flash';

    flash.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:-22px;background:#1e3a5f;color:#7ab4f5;padding:3px 10px;border-radius:4px;font-size:10px;pointer-events:none;white-space:nowrap;z-index:99;';

    tb.appendChild(flash);

  }

  flash.textContent = msg;

  flash.style.opacity = '1';

  clearTimeout(tb._flashTimer);

  tb._flashTimer = setTimeout(() => { flash.style.opacity = '0'; }, 2000);

}

let _tpFlashTimer = null;
function tpFlash(msg) {
  const el = document.getElementById('tp-flash');
  if (!el) return;
  el.textContent = msg;
  clearTimeout(_tpFlashTimer);
  _tpFlashTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

async function tpSaveToCode() {
  const btn = document.getElementById('tp-save-code');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/save-thirst-params', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thirst: THIRST_PARAMS }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    tpFlash('Saved to index.html ✓');
  } catch (err) {
    const msg = String(err.message || err);
    tpFlash(/Failed to fetch|NetworkError/i.test(msg) ? 'Needs dev server (serve.bat)' : 'Save failed: ' + msg);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function _flashToolbar(tbId, msg) {

  const tb = document.getElementById(tbId);

  if (!tb) return;

  let flash = tb.querySelector('.vs-flash');

  if (!flash) {

    flash = document.createElement('div');

    flash.className = 'vs-flash';

    flash.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:-22px;background:#1e3a5f;color:#7ab4f5;padding:3px 10px;border-radius:4px;font-size:10px;pointer-events:none;';

    tb.style.position = 'relative';

    tb.appendChild(flash);

  }

  flash.textContent = msg;

  flash.style.opacity = '1'; flash.style.transition = '';

  clearTimeout(flash._t);

  flash._t = setTimeout(() => { flash.style.opacity = '0'; flash.style.transition = 'opacity 0.4s'; }, 1100);

}

function vsFlashToolbar(msg) { _flashToolbar('vs-toolbar', msg); }

function decFlashToolbar(msg) { _flashToolbar('dec-toolbar', msg); }



// Apply current VISUAL_STYLES values to all live Konva shapes of the given type.

function applyVisualStyles(typeKey) {

  const V = VISUAL_STYLES[typeKey];

  if (!V) return;

  switch (typeKey) {

    case 'worker': {

      const S = V.size / 2;

      stage.find('.worker').forEach(grp => {

        const img = grp.findOne('.workercircle');

        if (img) {

          img.x(-S); img.y(-S); img.width(S*2); img.height(S*2);

          img.cornerRadius(V.cornerRadius);

          img.stroke(V.strokeColor); img.strokeWidth(V.strokeWidth);

          // Reflow portrait crop with new zoom.

          const native = img.image();

          if (native) {

            const iw = native.naturalWidth || 128, ih = native.naturalHeight || 128;

            const cw = iw / V.portraitZoom, ch = ih / V.portraitZoom;

            img.cropX((iw - cw) / 2); img.cropY((ih - ch) / 2);

            img.cropWidth(cw); img.cropHeight(ch);

          }

        }

        const lbl = grp.findOne('.workerlabel');

        if (lbl) {

          lbl.fontSize(V.labelFontSize); lbl.fill(V.labelColor); lbl.y(S + V.labelOffsetY);

          lbl.x(-lbl.width() / 2);

        }

      });

      workerLayer.batchDraw();

      break;

    }

    case 'pileSquare': {

      PILE_DOT_PATTERN = buildPileDotPattern(V.dotPatternColor);

      const half = V.size / 2;

      stage.find('.node').forEach(grp => {

        const shape = grp.findOne('.nodeshape');

        if (!shape) return;

        if (shape.className !== 'Rect') return;

        shape.x(-half); shape.y(-half);

        shape.width(V.size); shape.height(V.size);

        shape.cornerRadius(V.cornerRadius);

        shape.strokeWidth(V.strokeWidth);

        const tex = grp.findOne('.nodetex');

        if (tex) {

          tex.x(-(half - 2)); tex.y(-(half - 2));

          tex.width(V.size - 4); tex.height(V.size - 4);

          tex.fillPatternImage(PILE_DOT_PATTERN);

        }

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'fridge': {

      nodes.filter(n => n.kind === 'fridge').forEach(n => {

        nodeLayer.findOne('#' + n.id)?.destroy();

        drawFridge(n);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'outhouse': {

      nodes.filter(n => n.kind === 'outhouse').forEach(n => {

        nodeLayer.findOne('#' + n.id)?.destroy();

        drawOuthouse(n);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'sign': {

      nodes.filter(n => n.kind === 'sign').forEach(n => {

        nodeLayer.findOne('#' + n.id)?.destroy();

        drawSign(n);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'exportPallet': {

      nodes.filter(n => n.subtype === 'exportPallet').forEach(n => {

        nodeLayer.findOne('#' + n.id)?.destroy();

        drawNode(n);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'idleZone': {

      const half = V.size / 2;

      stage.find('.idlezone-node').forEach(grp => {

        const shape = grp.findOne('.nodeshape');

        if (!shape) return;

        shape.x(-half); shape.y(-half);

        shape.width(V.size); shape.height(V.size);

        shape.cornerRadius(V.cornerRadius);

        shape.fill(V.fill);

        shape.stroke(V.strokeColor);

        shape.strokeWidth(V.strokeWidth);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'pileStackPiece': {

      stage.find('.stackpiece').forEach(p => {

        p.radius(V.radius); p.stroke(V.strokeColor); p.strokeWidth(V.strokeWidth);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'route': {

      const isGhost = (getEffectiveView() === 'ViewGhost' || getEffectiveView() === 'ViewHoverReveal');

      routes.forEach(j => {

        const grp = edgeLayer.findOne('#' + j.id); if (!grp) return;

        const pd = routePathData(j);

        const rp = grp.findOne('.routepath');

        const stroke = VISUAL_STYLES.route.strokeColor;

        if (rp) { rp.data(pd); rp.strokeWidth(V.strokeWidth); rp.dash([V.dashOn, V.dashOff]); rp.stroke(stroke); }

        grp.findOne('.hover-hit-route')?.data(pd);

        const slot = uiLayer.findOne('#slot_' + j.id);

        if (slot) { const r = slot.findOne('.slot-rect'); if (r) { r.stroke(stroke); } }

      });

      edgeLayer.batchDraw();

      uiLayer.batchDraw();

      break;

    }

    case 'slotRect': {

      const half = V.size / 2;

      stage.find('.slot-rect').forEach(r => {

        r.x(-half); r.y(-half);

        r.width(V.size); r.height(V.size);

        r.cornerRadius(V.cornerRadius);

        r.strokeWidth(V.strokeWidth);

        r.stroke(V.strokeColor);

        r.fill(V.fill);

      });

      uiLayer.batchDraw();

      const slotChipChanged = ['slotChipSpreadX', 'slotChipSpreadY'].some(k => VISUAL_STYLES_DEFAULT.slotRect[k] !== V[k]);

      if (slotChipChanged) {

        const VCH = VISUAL_STYLES.chip;

        const slotScale = VISUAL_STYLES.chipSlot.scale ?? 0.85;

        const CW = (VCH.badgeWidth ?? 20) * slotScale, CH = (VCH.height ?? 20) * slotScale;

        const sx = V.slotChipSpreadX, sy = V.slotChipSpreadY;

        stage.find('.slot-chip-grid').forEach(grid => {

          const chipRects = grid.children.filter(n => /^slot-chip-\d+$/.test(n.name()));

          const pos = chipRects.length === 1 ? [[0,0]] : [[-sx,-sy],[sx,-sy],[-sx,sy],[sx,sy]];

          chipRects.forEach((chip, i) => {

            if (!pos[i]) return;

            chip.x(pos[i][0] - CW / 2); chip.y(pos[i][1] - CH / 2);

            chip.width(CW); chip.height(CH);

          });

        });

        uiLayer.batchDraw();

      }

      break;

    }

    case 'slotMenu': {

      const layout = _getSlotMenuLayout();

      stage.find('.slot-menu').forEach(grp => {

        grp.x(V.offsetX); grp.y(V.offsetY); grp.opacity(V.restOpacity);

        const bg = grp.findOne('.slot-menu-bg');

        if (bg) { bg.fill(V.fill); bg.cornerRadius(V.cornerRadius); bg.width(layout.menuW); bg.height(layout.menuH); }

        layout.icons.forEach(ic => { const img = grp.findOne('.' + ic.name); if (img) { img.x(ic.ix); img.y(ic.iy); } });

        const wasVisible = grp.visible();

        if (!wasVisible) grp.visible(true);

        _applySlotMenuIconFilters(grp);

        grp.cache();

        if (!wasVisible) grp.visible(false);

      });

      uiLayer.batchDraw();

      break;

    }

    case 'slotGear':

    case 'slotDelete':

    case 'slotReverse': {

      const layout = _getSlotMenuLayout();

      stage.find('.slot-menu').forEach(grp => {

        const bg = grp.findOne('.slot-menu-bg');

        if (bg) { bg.width(layout.menuW); bg.height(layout.menuH); }

        layout.icons.forEach(ic => {

          const img = grp.findOne('.' + ic.name);

          if (img) { img.x(ic.ix); img.y(ic.iy); img.width(ic.w); img.height(ic.h); }

        });

        const wasVisible = grp.visible();

        if (!wasVisible) grp.visible(true);

        _applySlotMenuIconFilters(grp);

        grp.cache();

        if (!wasVisible) grp.visible(false);

      });

      uiLayer.batchDraw();

      break;

    }

    case 'slotWorkerIcon': {

      stage.find('.slot-worker-icon').forEach(grp => {

        const head = grp.findOne('.slot-wi-head');

        const body = grp.findOne('.slot-wi-body');

        const route = grp.getParent()?.routeRef;

        const filled = route && (route.workerIds?.length ?? 0) > 0;

        const contextual = !filled && currentMode === 'liftWorker';

        const shapeFill = filled ? V.filledColor : contextual ? V.contextualColor : 'transparent';

        if (head) {

          head.radius(V.headRadius); head.y(V.headOffsetY);

          head.strokeWidth(V.strokeWidth); head.stroke(V.color);

          head.fill(shapeFill);

        }

        if (body) {

          body.data(openBottomRectPath(0, V.bodyOffsetY, V.bodyWidth, V.bodyHeight, V.bodyCornerRadius));

          body.strokeWidth(V.strokeWidth); body.stroke(V.color);

          body.fill(shapeFill);

        }

      });

      uiLayer.batchDraw();

      break;

    }

    case 'carryIndicator': {

      // offsetY shifts the whole stack; other props apply on next updateWorkerVisual rebuild

      stage.find('.carry').forEach(grp => grp.y(V.offsetY));

      workers.forEach(w => updateWorkerVisual(w));

      workerLayer.batchDraw();

      break;

    }

    case 'obstacle': {

      nodeLayer.find('.obstacle-node').forEach(grp => {

        const shape = grp.findOne('.obstacle-shape');

        if (shape) { shape.fill(V.color); shape.stroke(V.strokeColor); shape.strokeWidth(V.strokeWidth); shape.cornerRadius(V.cornerRadius); }

        grp.find('Line').forEach(l => { l.stroke(V.strokeColor); l.strokeWidth(V.strokeWidth + 1); });

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'liftDim':

      liftDimRect.fill(V.color);

      liftDimLayer.batchDraw();

      break;

    case 'speechBubble':

      // Only affects new speech bubbles (they live ~1.5s) — no live shapes to retrofit.

      break;

    case 'workerSelection':

      workerLayer.find('.selection-blob').forEach(b => {

        b.fill(V.color); b.opacity(V.opacity);

        b.radiusX(V.radiusX); b.radiusY(V.radiusY); b.y(V.offsetY);

        b.stroke(V.strokeColor); b.strokeWidth(V.strokeWidth);

      });

      workerLayer.batchDraw();

      break;

    case 'trafficLightMan':

      renderPalette();

      redrawAllWorkers();

      break;

    case 'chip': {

      const posChanged = ['offsetY', 'height', 'gap', 'badgeWidth', 'numFontSize', 'numOffsetX', 'numOffsetY', 'numOffsetYLarge', 'panelScale'].some(k => VISUAL_STYLES_DEFAULT.chip[k] !== V[k]);

      if (posChanged) {

        redrawAllWorkers();

        buildAllJobPanels();

        const slotScale = VISUAL_STYLES.chipSlot.scale ?? 0.85;

        const CW = (V.badgeWidth ?? 20) * slotScale, CH = (V.height ?? 20) * slotScale;

        const slotNumFontSize = (V.numFontSize ?? 16) * slotScale;

        const VSR = VISUAL_STYLES.slotRect;

        const sx = VSR.slotChipSpreadX, sy = VSR.slotChipSpreadY;

        stage.find('.slot-chip-grid').forEach(grid => {

          const chipRects = grid.children.filter(n => /^slot-chip-\d+$/.test(n.name()));

          const numLabels = grid.children.filter(n => /^slot-chip-num-\d+$/.test(n.name()));

          const pos = chipRects.length === 1 ? [[0,0]] : [[-sx,-sy],[sx,-sy],[-sx,sy],[sx,sy]];

          chipRects.forEach((chip, i) => {

            if (!pos[i]) return;

            chip.x(pos[i][0] - CW / 2); chip.y(pos[i][1] - CH / 2);

            chip.width(CW); chip.height(CH); chip.cornerRadius(VISUAL_STYLES.chipSlot.cornerRadius ?? 3);

          });

          numLabels.forEach((lbl, i) => {

            if (!pos[i]) return;

            const _isLarge = chipRects.length === 1;

            lbl.x(_isLarge ? 0 : (pos[i][0] + (V.numOffsetX ?? 0)));

            lbl.y(_isLarge ? (V.numOffsetYLarge ?? 0) : (pos[i][1] + (V.numOffsetY ?? 0)));

            lbl.fontSize(slotNumFontSize); lbl.fill(V.numColor);

            lbl.offsetX(lbl.width() / 2); lbl.offsetY(lbl.height() / 2);

          });

        });

        uiLayer.batchDraw();

      } else {

        workerLayer.find('.chip-blank').forEach(c => {

          if (c._isEmpty) { c.fill(V.emptyFill); c.stroke(V.emptyStrokeColor); }

          else { c.fill(c._workerColor ? colorAlpha(c._workerColor, V.fillAlpha) : VISUAL_STYLES.chipSlot.fill); c.stroke(V.strokeColor); }

          c.strokeWidth(V.strokeWidth);

        });

        stage.find('.slot-chip-grid').forEach(grid => {

          grid.children.forEach(chip => {

            chip.cornerRadius(V.cornerRadius); chip.strokeWidth(V.strokeWidth);

            if (chip.dash().length === 0) {

              const rawFill = chip.fill();

              if (rawFill.startsWith('#')) chip.fill(colorAlpha(rawFill, V.fillAlpha));

            }

            chip.stroke(V.strokeColor);

          });

        });

        workerLayer.find('.chip-num').forEach(t => t.fill(V.numColor));

        uiLayer.find('.chip-num').forEach(t => t.fill(V.numColor));

        hudLayer.find('.panel-chip-num').forEach(t => t.fill(V.numColor));

        stage.find('.slot-chip-grid').forEach(grid => {

          grid.children.filter(n => n.name().startsWith('slot-chip-num')).forEach(t => t.fill(V.numColor));

        });

        workerLayer.batchDraw(); uiLayer.batchDraw(); hudLayer.batchDraw();

      }

      break;

    }

    case 'chipSlot': {

      const CS = V;

      const slotOp = CS.opacity ?? 1;

      stage.find('.chip-empty').forEach(r => {

        r.fill(CS.fill); r.stroke(CS.strokeColor); r.strokeWidth(CS.strokeWidth);

        r.cornerRadius(CS.cornerRadius ?? 3); r.opacity(slotOp);

      });

      stage.find('.slot-chip-grid').forEach(grid => {

        grid.children.filter(n => /^slot-chip-\d+$/.test(n.name())).forEach(r => {

          r.cornerRadius(CS.cornerRadius ?? 3); r.strokeWidth(CS.strokeWidth);

          if (r.dash().length > 0) { r.fill(CS.fill); r.stroke(CS.strokeColor); r.opacity(slotOp); }

        });

      });

      const scaleChanged = VISUAL_STYLES_DEFAULT.chipSlot.scale !== CS.scale;

      if (scaleChanged) {

        const VCH = VISUAL_STYLES.chip;

        const CW = (VCH.badgeWidth ?? 20) * CS.scale, CH = (VCH.height ?? 20) * CS.scale;

        const VSR = VISUAL_STYLES.slotRect;

        const sx = VSR.slotChipSpreadX, sy = VSR.slotChipSpreadY;

        stage.find('.slot-chip-grid').forEach(grid => {

          const chipRects = grid.children.filter(n => /^slot-chip-\d+$/.test(n.name()));

          const pos = chipRects.length === 1 ? [[0,0]] : [[-sx,-sy],[sx,-sy],[-sx,sy],[sx,sy]];

          chipRects.forEach((chip, i) => {

            if (!pos[i]) return;

            chip.x(pos[i][0] - CW / 2); chip.y(pos[i][1] - CW / 2);

            chip.width(CW); chip.height(CH);

          });

        });

        buildAllJobPanels();

      }

      workerLayer.batchDraw(); uiLayer.batchDraw(); hudLayer.batchDraw();

      break;

    }

    case 'hintText': { applyHintPosition(); break; }

    case 'zone': {

      zones.forEach(z => redrawZone(z));

      if (_zoneBrushCursor) {

        const VZ = VISUAL_STYLES.zone;

        const r = currentMode === 'eraseZone' ? VZ.eraseRadius : VZ.brushRadius;

        _zoneBrushCursor.radius(r);

        _zoneBrushCursor.stroke(VZ.strokeColor);

        _zoneBrushCursor.fill(VZ.cursorFill);

        _zoneBrushCursor.strokeWidth(VZ.cursorStrokeWidth);

        if (_zoneCursorForbidden) _zoneCursorForbidden.strokeWidth(VZ.forbiddenStrokeWidth);

        uiLayer.batchDraw();

      }

      break;

    }

    case 'physicsGhost': {

      const g = uiLayer.findOne('.physics-ghost-grp');

      if (g) { g.opacity(V.opacity); uiLayer.batchDraw(); }

      break;

    }



    case 'hitboxMiniAnchor': {

      stage.find('.mini-anchor').forEach(a => a.radius(V.radius));

      edgeLayer.batchDraw();

      break;

    }

    case 'miniAnchor': {

      stage.find('.mini-anchor').forEach(a => {

        a.stroke(V.strokeColor);

        a.strokeWidth(V.strokeWidth);

        a.fill(V.fill);

        a.radius(V.radius);

      });

      // offset and stubLength affect path geometry — reposition anchors and re-path all routes

      routes.forEach(j => {

        const grp = edgeLayer.findOne('#' + j.id); if (!grp) return;

        const fromA = getRouteAnchor(j, j.fromId);

        const toA   = getRouteAnchor(j, j.toId);

        const fromCircle = grp.findOne('.mini-anchor-from');

        const toCircle   = grp.findOne('.mini-anchor-to');

        if (fromA && fromCircle) { fromCircle.position({ x: fromA.x, y: fromA.y }); fromCircle.rotation(halfCircleRotationDeg(fromA.side)); }

        if (toA   && toCircle)   { toCircle.position({ x: toA.x, y: toA.y });       toCircle.rotation(anchorRotationDeg(toA.side, false)); }

        const pd = routePathData(j);

        grp.findOne('.routepath')?.data(pd);

        grp.findOne('.hover-hit-route')?.data(pd);

      });

      edgeLayer.batchDraw();

      break;

    }

    case 'pileCenterAnchor': {

      const VPC = VISUAL_STYLES.pileCenterAnchor;

      const applyToAnchor = a => { a.radius(VPC.radius); a.fill(VPC.fill); a.stroke(VPC.strokeColor); a.strokeWidth(VPC.strokeWidth); };

      _zoneAnchors.forEach(applyToAnchor);

      _pileAnchors.forEach(applyToAnchor);

      zoneLayer.batchDraw();

      nodeLayer.batchDraw();

      break;

    }

    case 'scrapStack':

      buildRevealGhosts();

      break;

    case 'uiTheme':

      applyUiTheme();

      break;

    case 'jobPanel':

      buildAllJobPanels();

      break;

    case 'guiPanel':

    case 'routeFilter':

      if (_filterPanel) { closeRouteFilter(false); }

      break;

    case 'tickIndicator': {

      const el = document.getElementById('tick-indicator');

      if (el) {

        el.style.width = V.size + 'px';

        el.style.height = V.size + 'px';

        el.style.border = `${V.borderWidth}px solid ${V.borderColor}`;

        el.style.borderRadius = V.cornerRadius + 'px';

        el.style.marginTop = -(V.size / 2) + 'px';

        el.style.left = V.offsetX + 'px';

      }

      break;

    }

    case 'building': {

      const w = V.width / 2, h = V.height / 2;

      stage.find('[data-shape=building]').forEach(grp => {

        const top = grp.findOne('.building-top');

        const bot = grp.findOne('.building-bottom');

        if (top) { top.x(-w); top.y(-h); top.width(V.width); top.height(h); top.cornerRadius([V.cornerRadius, V.cornerRadius, 0, 0]); top.fill(V.topColor); top.stroke(V.strokeColor); top.strokeWidth(V.strokeWidth); }

        if (bot) { bot.x(-w); bot.y(0); bot.width(V.width); bot.height(h); bot.cornerRadius([0, 0, V.cornerRadius, V.cornerRadius]); bot.fill(V.bottomColor); bot.stroke(V.strokeColor); bot.strokeWidth(V.strokeWidth); }

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'buildingDoor': {

      stage.find('.building-door').forEach(d => {

        d.x(V.offsetX - V.width/2); d.y(V.offsetY - V.height/2);

        d.width(V.width); d.height(V.height);

        d.fill(V.color);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'buildingSupport': {

      stage.find('.building-support').forEach(s => {

        s.width(V.width); s.height(V.height);

        s.fill(V.color);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'buildingChimney': {

      stage.find('.building-chimney').forEach(c => {

        c.x(V.offsetX - V.width/2); c.y(V.offsetY - V.height/2);

        c.width(V.width); c.height(V.height);

        c.fill(V.color);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'buildingSign': {

      stage.find('.building-sign-bg').forEach(bg => {

        bg.x(-V.width/2); bg.y(V.offsetY - V.height/2);

        bg.width(V.width); bg.height(V.height);

        bg.fill(V.color);

      });

      stage.find('.building-sign-text').forEach(txt => {

        txt.x(-V.width/2); txt.y(V.offsetY - V.height/2 + 3);

        txt.width(V.width); txt.height(V.height);

        txt.fontSize(V.fontSize);

        txt.fill(V.textColor);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'tree': {

      stage.find('.tree-trunk').forEach(t => {

        t.x(-V.trunkWidth/2); t.y(V.canopyHeight - V.trunkHeight);

        t.width(V.trunkWidth); t.height(V.trunkHeight);

        t.fill(V.trunkColor);

      });

      stage.find('.tree-canopy').forEach(c => {

        c.y(V.canopyRadius * 0.3);

        c.radius(V.canopyRadius);

        c.fill(V.canopyColor);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'hitboxPile': {

      stage.find('.hitbox-pile').forEach(c => c.radius(V.radius));

      nodeLayer.batchDraw();

      break;

    }

    case 'hitboxAnchor': {

      stage.find('.anchor-hit').forEach(c => c.radius(V.radius));

      edgeLayer.batchDraw(); uiLayer.batchDraw();

      break;

    }

    case 'hitboxRouteHover': {

      stage.find('.hover-hit-route').forEach(p => p.strokeWidth(V.strokeWidth));

      edgeLayer.batchDraw();

      break;

    }

    case 'hitboxWorker': {

      const VT = VISUAL_STYLES.trafficLightMan;

      const totalH = VT.headRadius * 2 + VT.neckGap + VT.torsoHeight + VT.legGap + VT.legHeight;

      const figHalfW = VT.torsoWidth / 2 + VT.armGap + VT.armWidth;

      const px = V.padX ?? 2, py = V.padY ?? 2, oy = V.offsetY ?? 0;

      stage.find('.hitbox-worker').forEach(s => {

        s.x(-(figHalfW + px)); s.y(-(totalH / 2 + py) + oy);

        s.width((figHalfW + px) * 2); s.height(totalH + py * 2);

      });

      workerLayer.batchDraw();

      break;

    }

    case 'hitboxTri': {

      rebuildPickCursor();

      redrawAllWorkers();

      break;

    }

    case 'hitboxSlot': {

      stage.find('.hitbox-slot').forEach(c => c.radius(V.radius));

      uiLayer.batchDraw();

      break;

    }

    case 'hitboxSlotHover': {

      const VSR = VISUAL_STYLES.slotRect;

      const layout = _getSlotMenuLayout();

      const pad = V.pad;

      const slotHalf = VSR.size / 2;

      const left  = Math.min(-slotHalf, layout.offsetX) - pad;

      const right = Math.max(slotHalf, layout.offsetX + layout.menuW) + pad;

      const top   = Math.min(-slotHalf, layout.offsetY) - pad;

      stage.find('.hover-hit-slot').forEach(s => {

        s.x(left); s.y(top);

        s.width(right - left); s.height(slotHalf + pad - top);

      });

      uiLayer.batchDraw();

      break;

    }

    case 'hitboxSlotIcons': {

      const layout = _getSlotMenuLayout();

      const pad = V.pad;

      const delLay  = layout.icons.find(i => i.name === 'slot-del');

      const gearLay = layout.icons.find(i => i.name === 'slot-gear');

      const revLay  = layout.icons.find(i => i.name === 'slot-rev');

      stage.find('.slot-gearhit').forEach(s => {

        s.x(layout.offsetX + gearLay.ix - pad); s.y(layout.offsetY + gearLay.iy - pad);

        s.width(gearLay.w + pad * 2); s.height(gearLay.h + pad * 2);

      });

      stage.find('.slot-delhit').forEach(s => {

        const ep = pad + 2;

        s.x(layout.offsetX + delLay.ix - ep); s.y(layout.offsetY + delLay.iy - ep);

        s.width(delLay.w + ep * 2); s.height(delLay.h + ep * 2);

      });

      stage.find('.slot-revhit').forEach(s => {

        s.x(layout.offsetX + revLay.ix - pad); s.y(layout.offsetY + revLay.iy - pad);

        s.width(revLay.w + pad * 2); s.height(revLay.h + pad * 2);

      });

      uiLayer.batchDraw();

      break;

    }

    case 'ingot': {

      const t = SCRAP_TYPES.find(s => s.id === 'ingot');

      if (t) t.color = V.color;

      // Refresh any carried ingots and stacks on output piles

      workers.forEach(w => updateWorkerVisual(w));

      nodes.filter(n => n.smelterRole === 'output').forEach(n => updateNodeStack(n));

      workerLayer.batchDraw();

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterBody': {

      smelters.forEach(sm => {

        const grp = nodeLayer.findOne('#' + sm.id);

        if (!grp) return;

        const body = grp.findOne('.smelter-body');

        const prog = grp.findOne('.smelter-progress');

        const half = { w: V.width / 2, h: V.height / 2 };

        if (body) { body.x(-half.w); body.y(-half.h); body.width(V.width); body.height(V.height); body.fill(V.color); body.stroke(V.strokeColor); body.strokeWidth(V.strokeWidth); body.cornerRadius(V.cornerRadius); }

        if (prog) { prog.x(-half.w); prog.y(half.h - V.progressHeight - 3); prog.height(V.progressHeight); prog.fill(V.progressColor); }

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterInputPile': {

      nodes.filter(n => n.smelterRole === 'input').forEach(n => {

        const sm = smelters.find(s => s.inputNodeId === n.id);

        if (!sm?.smelterType) n.color = V.color;

        const shape = nodeLayer.findOne('#' + n.id)?.findOne('.nodeshape'); if (!shape) return;

        shape.fill(V.fill); shape.stroke(n.color); shape.strokeWidth(V.strokeWidth);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterOutputPile': {

      nodes.filter(n => n.smelterRole === 'output').forEach(n => {

        const sm = smelters.find(s => s.outputNodeId === n.id);

        if (!sm?.smelterType) n.color = V.color;

        const shape = nodeLayer.findOne('#' + n.id)?.findOne('.nodeshape'); if (!shape) return;

        shape.fill(V.fill); shape.stroke(n.color); shape.strokeWidth(V.strokeWidth);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterLamp': {

      smelters.forEach(sm => {

        const grp = nodeLayer.findOne('#' + sm.id); if (!grp) return;

        ['.smelter-lamp-input', '.smelter-lamp-op'].forEach(n => {

          const lamp = grp.findOne(n);

          if (lamp) { lamp.radius(V.radius); lamp.stroke(V.strokeColor); lamp.strokeWidth(V.strokeWidth); }

        });

        updateSmelterLamps(sm);

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterSpinner': {

      smelters.forEach(sm => {

        const grp = nodeLayer.findOne('#' + sm.id); if (!grp) return;

        const sp = grp.findOne('.smelter-spinner');

        if (sp) { sp.width(V.length); sp.height(V.width); sp.offsetX(V.length/2); sp.offsetY(V.width/2); sp.fill(V.color); sp.cornerRadius(V.cornerRadius); }

      });

      nodeLayer.batchDraw();

      break;

    }

    case 'smelterStation': {

      const VB = VISUAL_STYLES.smelterBody;

      smelters.forEach(sm => {

        const grp = nodeLayer.findOne('#' + sm.id); if (!grp) return;

        const stY = VB.height / 2 + V.offsetY;

        const outer = grp.findOne('.smelter-station');

        if (outer) { outer.x(-V.width/2); outer.y(stY); outer.width(V.width); outer.height(V.height); outer.fill(V.fill); outer.cornerRadius(V.cornerRadius); }

        const inner = grp.findOne('.smelter-station-inner');

        if (inner) { inner.x(-V.width/2 + V.innerPad); inner.y(stY + V.innerPad); inner.width(V.width - V.innerPad*2); inner.height(V.height - V.innerPad*2); inner.fill(V.innerFill); inner.stroke(V.innerStroke); inner.strokeWidth(V.innerStrokeWidth); inner.cornerRadius(V.innerCornerRadius); }

      });

      nodeLayer.batchDraw();

      break;

    }

  }

}



document.querySelectorAll('.gp-tab').forEach(btn => {

  btn.addEventListener('click', () => gpSwitchTab(btn.dataset.gpTab));

});

document.getElementById('vs-search').addEventListener('input', renderVisualsTab);

document.getElementById('vs-copy-all').addEventListener('click', vsCopyAllPrompt);

document.getElementById('vs-reset-all').addEventListener('click', vsResetAll);

document.getElementById('vs-save-code').addEventListener('click', vsSaveToCode);

document.getElementById('dec-search').addEventListener('input', renderDecVisualsPanel);

document.getElementById('dec-copy-all').addEventListener('click', () => vsCopyAllPrompt(Array.from(DECORATION_TYPES)));

document.getElementById('dec-reset-all').addEventListener('click', () => vsResetDecorationsAll());

document.getElementById('dec-save-code').addEventListener('click', decSaveToCode);

document.getElementById('hb-save-code').addEventListener('click', hbSaveToCode);

document.getElementById('gp-save-code').addEventListener('click', gpSaveToCode);
document.getElementById('tp-save-code').addEventListener('click', tpSaveToCode);

document.getElementById('wp-save-code').addEventListener('click', wpSaveToCode);

document.getElementById('talk-save-code').addEventListener('click', talkSaveToCode);

// Tick indicator's initial visual comes from inline CSS — push current defaults so

// changes to VISUAL_STYLES_DEFAULT.tickIndicator take effect without editing CSS.

applyVisualStyles('tickIndicator');

renderDefaultGameplayContent();



function toggleDebugPanel() {

  debugOpen = !debugOpen;

  const panel = document.getElementById('debug-panel');

  const toggle = document.getElementById('debug-toggle');

  panel.classList.toggle('open', debugOpen);

  toggle.style.right = debugOpen ? '280px' : '0';

  if (debugOpen) {

    if (debugActiveTab === 'options') renderOptionsPane();

    else renderDebugPanel();

  }

}



setInterval(() => {

  if (debugOpen && debugActiveTab === 'viewmodes') renderDebugPanel();

  const wp = document.getElementById('eng-panel-workers');

  if (wp && wp.style.display !== 'none') renderWorkersPane();

}, 100);



