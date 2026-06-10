// ===== AI INVOICE SCANNER =====
let _anthropicKey = null;

async function _getAnthropicKey() {
  if (_anthropicKey) return _anthropicKey;
  try {
    const snap = await db.collection('sims').doc('config').get();
    if (snap.exists && snap.data().anthropic_key) {
      _anthropicKey = snap.data().anthropic_key;
      return _anthropicKey;
    }
  } catch(e) { console.error('getAnthropicKey:', e); }
  return null;
}

async function _saveAnthropicKey(key) {
  await db.collection('sims').doc('config').set({ anthropic_key: key.trim() }, { merge: true });
  _anthropicKey = key.trim();
}

let _scanKeyCb = null;
function openScanKeyModal(onSaved) {
  _scanKeyCb = onSaved || null;
  document.getElementById('scan-key-input').value = '';
  const btn = document.getElementById('scan-key-save-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
  openModal('modal-scan-key');
}

async function saveScanKey() {
  const key = document.getElementById('scan-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) { showToast('API key tidak valid — harus mulai dengan sk-ant-', true); return; }
  const btn = document.getElementById('scan-key-save-btn');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    await _saveAnthropicKey(key);
    showToast('API key disimpan!');
    closeModal('modal-scan-key');
    if (_scanKeyCb) { const cb = _scanKeyCb; _scanKeyCb = null; cb(); }
  } catch(e) {
    showToast('Gagal simpan: ' + e.message, true);
    btn.disabled = false; btn.textContent = 'Simpan';
  }
}

async function triggerScanInvoice() {
  const key = await _getAnthropicKey();
  if (!key) { openScanKeyModal(() => triggerScanInvoice()); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.pdf';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    await _doScan(file);
  };
  input.click();
}

async function _doScan(file) {
  const btn = document.getElementById('scan-ai-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Scanning...'; }
  try {
    const result = await _callClaudeAPI(file);
    if (!result.items || !result.items.length) { showToast('Tidak ada item terdeteksi — coba foto yang lebih jelas', true); return; }
    _showScanPreview(result);
  } catch(e) {
    showToast('Gagal scan: ' + e.message, true);
    if (e.message.includes('API key')) { _anthropicKey = null; openScanKeyModal(() => triggerScanInvoice()); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Scan AI'; }
  }
}

async function _callClaudeAPI(file) {
  const key = await _getAnthropicKey();
  const base64 = await _fileToBase64(file);
  const isPDF = file.type === 'application/pdf';
  const mediaType = isPDF ? 'application/pdf' : (file.type || 'image/jpeg');

  const contentItem = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          contentItem,
          { type: 'text', text: 'Ekstrak data dari invoice/nota pembelian ini. Kembalikan JSON object saja tanpa markdown dan tanpa penjelasan, format:\n{"vendor":"nama toko/vendor","tgl":"YYYY-MM-DD","total":angka,"items":[{"nama":"nama item","qty":angka,"satuan":"kg","harga_vendor":angka}]}\nAturan: qty, harga_vendor, dan total adalah angka murni tanpa titik/koma ribuan. tgl harus format YYYY-MM-DD, jika tidak ada gunakan null. vendor adalah nama toko/supplier, jika tidak ada gunakan null. total adalah grand total/jumlah akhir yang tertera di invoice (sebelum ongkir jika terpisah), jika tidak ada gunakan null. Jika satuan tidak ada gunakan "pcs". Jika harga item tidak terbaca gunakan 0. Abaikan baris subtotal per kategori, ongkir, diskon, pajak, dan header tabel — hanya ekstrak baris item.' }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('API key tidak valid');
    throw new Error(err.error?.message || 'Error ' + res.status);
  }

  const data = await res.json();
  const text = (data.content[0].text || '').trim().replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(text);
    // Support both old array format and new object format
    if (Array.isArray(parsed)) return { vendor: null, tgl: null, items: parsed };
    return parsed;
  } catch(e) {
    throw new Error('Format respons tidak terbaca — coba foto lebih jelas');
  }
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result.split(',')[1]);
    r.onerror = () => reject(new Error('Gagal baca file'));
    r.readAsDataURL(file);
  });
}

let _scanItems = [];
let _scanMeta = { vendor: null, tgl: null, total: null };

function _showScanPreview(result) {
  _scanItems = result.items || [];
  _scanMeta = { vendor: result.vendor || null, tgl: result.tgl || null, total: result.total || null };

  // Fill vendor/tgl header fields in preview
  const vendorEl = document.getElementById('scan-vendor');
  const tglEl = document.getElementById('scan-tgl');
  if (vendorEl) vendorEl.value = _matchVendor(_scanMeta.vendor);
  if (tglEl) tglEl.value = _scanMeta.tgl || '';

  const tbody = document.getElementById('scan-preview-body');
  if (!tbody) return;
  tbody.innerHTML = _scanItems.map((item, i) => `<tr>
    <td style="padding:5px 8px;text-align:center"><input type="checkbox" id="scan-chk-${i}" checked onchange="_recalcScanTotal()"></td>
    <td style="padding:5px 8px"><input type="text" id="scan-nama-${i}" value="${(item.nama||'').replace(/"/g,'&quot;')}" style="width:100%;font-size:12px;padding:3px 5px;border:1px solid var(--bd);border-radius:3px"></td>
    <td style="padding:5px 8px"><input type="number" id="scan-qty-${i}" value="${item.qty||''}" min="0" step="any" style="width:65px;font-size:12px;font-family:var(--mn);text-align:right;padding:3px 5px;border:1px solid var(--bd);border-radius:3px" oninput="_recalcScanTotal()"></td>
    <td style="padding:5px 8px"><input type="text" id="scan-sat-${i}" value="${item.satuan||'pcs'}" style="width:55px;font-size:12px;padding:3px 5px;border:1px solid var(--bd);border-radius:3px"></td>
    <td style="padding:5px 8px"><input type="number" id="scan-hv-${i}" value="${item.harga_vendor||''}" min="0" style="width:120px;font-size:12px;font-family:var(--mn);text-align:right;padding:3px 5px;border:1px solid var(--bd);border-radius:3px" oninput="_recalcScanTotal()"></td>
  </tr>`).join('');
  _recalcScanTotal();
  openModal('modal-scan-preview');
}

function _matchVendor(rawName) {
  if (!rawName) return '';
  const vendors = (getMaster()?.vendor || []).map(v => v.nama).filter(Boolean);
  if (!vendors.length) return '';

  const normalize = s => s.toLowerCase()
    .replace(/\b(cv|pt|ud|tb|toko)\.?\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const normRaw = normalize(rawName);
  const rawWords = normRaw.split(' ').filter(w => w.length > 1);
  let best = '', bestScore = 0;

  vendors.forEach(v => {
    const normV = normalize(v);
    const vWords = normV.split(' ').filter(w => w.length > 1);
    let matches = 0;
    rawWords.forEach(rw => {
      if (vWords.includes(rw)) { matches++; return; }
      // Partial: one word contains the other (handles "tmkaya" ↔ "tm"+"kaya")
      if (vWords.some(vw => vw.includes(rw) || rw.includes(vw))) matches += 0.6;
    });
    const union = new Set([...rawWords, ...vWords]).size;
    const score = union > 0 ? matches / union : 0;
    if (score > bestScore) { bestScore = score; best = v; }
  });

  return bestScore >= 0.35 ? best : '';
}

function _recalcScanTotal() {
  let calc = 0;
  for (let i = 0; i < _scanItems.length; i++) {
    if (!document.getElementById('scan-chk-' + i)?.checked) continue;
    const qty = parseFloat(document.getElementById('scan-qty-' + i)?.value) || 0;
    const hv = parseFloat(document.getElementById('scan-hv-' + i)?.value) || 0;
    calc += qty * hv;
  }
  const invoiceTotal = _scanMeta.total;
  const calcEl = document.getElementById('scan-total-calc');
  const invoiceEl = document.getElementById('scan-total-invoice');
  const diffEl = document.getElementById('scan-total-diff');
  if (calcEl) calcEl.textContent = fmtF(calc);
  if (invoiceEl) invoiceEl.textContent = invoiceTotal != null ? fmtF(invoiceTotal) : '—';
  if (diffEl) {
    if (invoiceTotal == null) { diffEl.textContent = ''; return; }
    const diff = calc - invoiceTotal;
    const ok = Math.abs(diff) < 1;
    diffEl.textContent = ok ? '✓ Cocok' : (diff > 0 ? '+' : '') + fmtF(diff);
    diffEl.style.color = ok ? 'var(--ac)' : 'var(--dn)';
  }
}

function applyScanToForm() {
  const hasPOItems = !!document.querySelector('.invv-cb');
  if (!hasPOItems) { showToast('Pilih PO dan vendor dulu agar item bisa diisi', true); return; }

  // Fill vendor name if field is empty
  const vendorPreview = document.getElementById('scan-vendor')?.value.trim();
  if (vendorPreview) {
    const vendorField = document.getElementById('invv-vendor');
    if (vendorField && !vendorField.value.trim()) {
      vendorField.value = vendorPreview;
      loadInvVItems();
    }
  }

  // Fill invoice date if field is empty
  const tglPreview = document.getElementById('scan-tgl')?.value.trim();
  if (tglPreview) {
    const tglField = document.getElementById('invv-tgl');
    if (tglField && !tglField.value) tglField.value = tglPreview;
  }

  let applied = 0, skipped = 0;
  for (let i = 0; i < _scanItems.length; i++) {
    if (!document.getElementById('scan-chk-' + i)?.checked) continue;
    const nama = (document.getElementById('scan-nama-' + i)?.value || '').trim().toLowerCase();
    const hv = parseFloat(document.getElementById('scan-hv-' + i)?.value) || 0;
    if (!nama) continue;

    let matched = false;
    document.querySelectorAll('.invv-cb').forEach(cb => {
      const cbNama = (cb.dataset.nama || '').trim().toLowerCase();
      if (cbNama === nama || cbNama.includes(nama) || nama.includes(cbNama)) {
        cb.checked = true;
        const idx = cb.dataset.idx;
        if (hv > 0) {
          const hvInput = document.querySelector(`.invv-hv[data-idx="${idx}"]`);
          if (hvInput) { hvInput.value = hv; updateInvVHarga(hvInput, parseInt(idx)); }
        }
        matched = true;
        applied++;
      }
    });
    if (!matched) skipped++;
  }

  calcInvVTotal();
  closeModal('modal-scan-preview');
  showToast(applied + ' item diisi' + (skipped ? ` · ${skipped} tidak cocok dengan PO` : ''), skipped > 0 && applied === 0);
}
