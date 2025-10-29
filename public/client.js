async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || res.statusText);
  }
  return await res.json();
}

function el(id) { return document.getElementById(id); }

function renderStatus(data) {
  const s = el('status');
  const { reader, card } = data;
  const html = [];
  html.push(`<div><strong>Reader:</strong> ${reader || 'Not connected'}</div>`);
  if (card?.present) {
    html.push(`<div><strong>Card Present:</strong> Yes</div>`);
    if (card.uid) html.push(`<div><strong>UID:</strong> ${card.uid}</div>`);
    if (card.cardUidHex) html.push(`<div><strong>UID (DESFire):</strong> ${card.cardUidHex}</div>`);
    if (card.atr) html.push(`<div><strong>ATR:</strong> ${card.atr}</div>`);
    if (card.type) html.push(`<div><strong>Type:</strong> ${card.type}</div>`);
    if (card.hardware) html.push(`<div><strong>HW:</strong> ${card.hardware}</div>`);
    if (card.software) html.push(`<div><strong>SW:</strong> ${card.software}</div>`);
    if (typeof card.freeMemory === 'number') html.push(`<div><strong>Free Memory:</strong> ${card.freeMemory} bytes</div>`);
    if (card.applications && card.applications.length) {
      html.push(`<div><strong>Applications:</strong> ${card.applications.join(', ')}</div>`);
    } else {
      html.push(`<div><strong>Applications:</strong> ${card.applications ? 'none' : '(unavailable)'}</div>`);
    }
  } else {
    html.push(`<div><strong>Card Present:</strong> No</div>`);
  }
  if (card?.lastError) html.push(`<div class="error"><strong>Last Error:</strong> ${card.lastError}</div>`);
  s.innerHTML = html.join('');
}

async function loadStatus() {
  const data = await fetchJSON('/api/status');
  renderStatus(data);
}

async function loadScripts() {
  const res = await fetchJSON('/api/scripts');
  const scripts = res.scripts || {};
  const wrap = el('scripts');
  wrap.innerHTML = '';
  Object.keys(scripts).forEach((name) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.onclick = async () => {
      log(`Running: npm run ${name}`);
      try {
        await fetchJSON('/api/run-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: name }),
        });
        log(`Started: ${name}`);
      } catch (e) {
        log(`Error starting script: ${e.message}`);
      }
    };
    wrap.appendChild(btn);
  });
}

function log(msg) {
  const area = el('log');
  const ts = new Date().toLocaleTimeString();
  area.textContent += `[${ts}] ${msg}\n`;
  area.scrollTop = area.scrollHeight;
}

// Key management helpers
function parseAppIdHex(inputId) {
  const v = el(inputId).value.trim();
  if (!v) throw new Error('App ID is required');
  const n = parseInt(v, 16);
  if (Number.isNaN(n)) throw new Error('Invalid App ID');
  return n;
}

async function kmGenerate() {
  try {
    const appId = parseAppIdHex('kmAppId');
    const numKeys = parseInt(el('kmNumKeys').value || '5', 10);
    const keyType = el('kmKeyType').value;
    const r = await fetchJSON('/api/keys/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, numKeys, keyType, save: false })
    });
    el('kmOut').textContent = JSON.stringify(r, null, 2);
    log(`Generated keyset for ${el('kmAppId').value}`);
  } catch (e) {
    log('kmGenerate failed: ' + e.message);
  }
}

async function kmSave() {
  try {
    const appId = parseAppIdHex('kmAppId');
    const r = await fetchJSON('/api/keys/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId })
    });
    el('kmOut').textContent = JSON.stringify(r, null, 2);
    log(`Saved keyset for ${el('kmAppId').value}`);
  } catch (e) { log('kmSave failed: ' + e.message); }
}

async function kmLoad() {
  try {
    const appId = parseAppIdHex('kmAppId');
    const r = await fetchJSON('/api/keys/load', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId })
    });
    el('kmOut').textContent = JSON.stringify(r, null, 2);
    log(`Loaded keyset for ${el('kmAppId').value}`);
  } catch (e) { log('kmLoad failed: ' + e.message); }
}

async function kmList() {
  try {
    const r = await fetchJSON('/api/keys/list');
    el('kmOut').textContent = JSON.stringify(r, null, 2);
  } catch (e) { log('kmList failed: ' + e.message); }
}

async function kmShow(reveal) {
  try {
    const appId = parseAppIdHex('kmAppId');
    const r = await fetchJSON(`/api/keys/show?appId=${appId}&reveal=${reveal ? '1' : '0'}`);
    el('kmOut').textContent = JSON.stringify(r, null, 2);
  } catch (e) { log('kmShow failed: ' + e.message); }
}

async function appAuth() {
  try {
    const aid = parseAppIdHex('appAid');
    const keyNo = parseInt(el('appKeyNo').value || '0', 10);
    const source = el('appSource').value;
    const keyType = el('appKeyType').value;
    const keyHex = el('appKeyHex').value.trim();
    const body = { aid, source, keyNo };
    if (source === 'manual') Object.assign(body, { keyType, keyHex });
    const r = await fetchJSON('/api/app/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    el('kmOut').textContent = JSON.stringify(r, null, 2);
    log(`App ${el('appAid').value} authenticated`);
  } catch (e) { log('appAuth failed: ' + e.message); }
}
async function eraseCard() {
  if (!confirm('This will ERASE the card (format PICC). Continue?')) return;
  try {
    const keyType = el('keyType').value;
    const keyHex = el('keyHex').value.trim();
    const keyNo = parseInt(el('keyNo').value || '0', 10);
    const body = (keyHex ? { keyType, keyHex, keyNo } : {});
    await fetchJSON('/api/erase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    log('Card erased successfully');
    await loadStatus();
  } catch (e) {
    log('Erase failed: ' + e.message);
  }
}

async function authPicc() {
  try {
    const keyType = el('keyType').value;
    const keyHex = el('keyHex').value.trim();
    const keyNo = parseInt(el('keyNo').value || '0', 10);
    if (!keyHex) { alert('Enter key hex'); return; }
    await fetchJSON('/api/auth-picc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyType, keyHex, keyNo })
    });
    log('PICC authenticated successfully');
  } catch (e) {
    log('PICC auth failed: ' + e.message);
  }
}

el('refresh').onclick = loadStatus;
el('erase').onclick = eraseCard;
el('clear-log').onclick = () => { el('log').textContent = ''; };
el('authPicc').onclick = authPicc;

el('kmGenerate').onclick = kmGenerate;
el('kmSave').onclick = kmSave;
el('kmLoad').onclick = kmLoad;
el('kmList').onclick = kmList;
el('kmShow').onclick = () => kmShow(false);
el('kmReveal').onclick = () => kmShow(true);
el('appAuth').onclick = appAuth;

function collectPayAuth() {
  const source = el('paySource').value;
  const keyNo = parseInt(el('payKeyNo').value || '0', 10);
  const keyType = el('payKeyType').value;
  const keyHex = el('payKeyHex').value.trim();
  const auth = { source, keyNo };
  if (source === 'manual') Object.assign(auth, { keyType, keyHex });
  return auth;
}

async function payStatus() {
  try {
    const r = await fetchJSON('/api/payment/status');
    el('payOut').textContent = JSON.stringify(r, null, 2);
  } catch (e) { log('payStatus failed: ' + e.message); }
}

async function payCredit() {
  try {
    const amount = parseInt(el('payAmount').value || '0', 10);
    const body = { amount, ...collectPayAuth() };
    const r = await fetchJSON('/api/payment/credit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    el('payOut').textContent = JSON.stringify(r, null, 2);
  } catch (e) { log('payCredit failed: ' + e.message); }
}

async function payDebit() {
  try {
    const amount = parseInt(el('payAmount').value || '0', 10);
    const body = { amount, ...collectPayAuth() };
    const r = await fetchJSON('/api/payment/debit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    el('payOut').textContent = JSON.stringify(r, null, 2);
  } catch (e) { log('payDebit failed: ' + e.message); }
}

el('payStatus').onclick = payStatus;
el('payCredit').onclick = payCredit;
el('payDebit').onclick = payDebit;

// Initial load and periodic refresh
loadStatus().catch(err => log('Status error: ' + err.message));
loadScripts().catch(err => log('Scripts error: ' + err.message));
setInterval(() => loadStatus().catch(() => {}), 1500);

// Subscribe to server logs via SSE
try {
  const events = new EventSource('/api/logs');
  events.onmessage = (e) => {
    try {
      const line = JSON.parse(e.data);
      log(line);
    } catch {
      log(e.data);
    }
  };
  events.onerror = () => {
    // will auto-reconnect by default
  };
} catch (e) {
  log('SSE init failed: ' + e.message);
}

// Collapsible sections
function initCollapsibles() {
  const secs = document.querySelectorAll('.collapsible');
  secs.forEach((sec) => {
    const header = sec.querySelector('.collapsible-header');
    if (!header) return;
    const id = sec.id || '';
    const saved = id ? localStorage.getItem('collapse:' + id) : null;
    if (saved === '1') sec.classList.add('collapsed');
    header.addEventListener('click', () => {
      sec.classList.toggle('collapsed');
      if (id) localStorage.setItem('collapse:' + id, sec.classList.contains('collapsed') ? '1' : '0');
    });
  });
}

initCollapsibles();
