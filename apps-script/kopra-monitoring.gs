/**
 * SIMS ↔ sheet Monitoring VA — Google Apps Script Web App.
 *
 * Dipasang di spreadsheet Monitoring (Extensions → Apps Script), berjalan
 * sebagai pemilik spreadsheet. Hanya dua aksi:
 *   - read : kembalikan semua nilai tampil (display values) tab Monitoring VA
 *   - mark : tulis "Telah Di Input" ke kolom Status Maker untuk baris tertentu,
 *            SETELAH semua baris dicek isinya masih sama seperti saat export.
 *            Satu baris berbeda → tidak ada yang ditulis sama sekali.
 *
 * Token rahasia TIDAK ditulis di sini (repo SIMS publik). Simpan di
 * Project Settings → Script properties → KOPRA_TOKEN.
 *
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me · Who has access: Anyone
 * ("Anyone" perlu supaya SIMS di GitHub Pages bisa memanggil tanpa login
 *  Google; permintaan tanpa token yang benar ditolak.)
 */

var DEFAULT_TAB = 'Monitoring VA';
var STATUS_DONE = 'Telah Di Input';   // satu-satunya nilai yang boleh ditulis

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!_auth(body.token)) return _out({ ok: false, error: 'Token salah atau belum diset di Script properties (KOPRA_TOKEN).' });
    if (body.action === 'ping') return _out({ ok: true, pong: true });
    if (body.action === 'read') return _out(_read(body));
    if (body.action === 'mark') return _out(_mark(body));
    return _out({ ok: false, error: 'Aksi tidak dikenal: ' + body.action });
  } catch (err) {
    return _out({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return _out({ ok: false, error: 'Gunakan POST dari SIMS.' });
}

function _auth(t) {
  var k = PropertiesService.getScriptProperties().getProperty('KOPRA_TOKEN');
  return !!k && typeof t === 'string' && t === k;
}

function _out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function _sheet(tab) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab || DEFAULT_TAB);
  if (!sh) throw new Error('Tab "' + (tab || DEFAULT_TAB) + '" tidak ditemukan.');
  return sh;
}

function _norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function _read(body) {
  var sh = _sheet(body.tab);
  var lastRow = sh.getLastRow();
  var lastCol = Math.min(sh.getLastColumn(), 40);
  var values = lastRow > 0 ? sh.getRange(1, 1, lastRow, lastCol).getDisplayValues() : [];
  return { ok: true, tab: sh.getName(), lastRow: lastRow, values: values };
}

// body.status_header: nama kolom Status Maker (mis. "Status Maker/ Yayasan")
// body.checks: [{ row: 812, expect: { "Nama Penerima": "...", "Nominal": "Rp6.240.000", ... } }]
function _mark(body) {
  var checks = body.checks || [];
  if (!checks.length) return { ok: false, error: 'Tidak ada baris.' };
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Sheet sedang dipakai proses lain, coba lagi.' };
  try {
    var sh = _sheet(body.tab);
    var lastCol = Math.min(sh.getLastColumn(), 40);
    // Cari baris header: baris pertama (dari 30 teratas) yang memuat kolom status
    var top = sh.getRange(1, 1, Math.min(30, sh.getLastRow()), lastCol).getDisplayValues();
    var hdrRow = -1, hdr = null;
    for (var i = 0; i < top.length; i++) {
      if (top[i].map(_norm).indexOf(_norm(body.status_header)) >= 0) { hdrRow = i + 1; hdr = top[i].map(_norm); break; }
    }
    if (hdrRow < 0) return { ok: false, error: 'Kolom "' + body.status_header + '" tidak ditemukan di header.' };
    var statusCol = hdr.indexOf(_norm(body.status_header)) + 1;

    // 1. Cek SEMUA baris dulu
    var mismatches = [];
    checks.forEach(function (c) {
      var r = parseInt(c.row, 10);
      if (!(r > hdrRow) || r > sh.getLastRow()) { mismatches.push({ row: c.row, field: '(baris)', expect: '', actual: 'di luar data' }); return; }
      var vals = sh.getRange(r, 1, 1, lastCol).getDisplayValues()[0];
      Object.keys(c.expect || {}).forEach(function (h) {
        var ci = hdr.indexOf(_norm(h));
        if (ci < 0) { mismatches.push({ row: r, field: h, expect: c.expect[h], actual: '(kolom tidak ada)' }); return; }
        if (_norm(vals[ci]) !== _norm(c.expect[h])) mismatches.push({ row: r, field: h, expect: c.expect[h], actual: vals[ci] });
      });
      var cur = _norm(vals[statusCol - 1]);
      if (cur !== _norm(STATUS_DONE) && body.status_from && cur !== _norm(body.status_from)) {
        mismatches.push({ row: r, field: body.status_header, expect: body.status_from, actual: vals[statusCol - 1] });
      }
    });
    if (mismatches.length) return { ok: false, error: 'Isi sheet berubah sejak export — tidak ada yang ditulis.', mismatches: mismatches };

    // 2. Baru tulis
    var written = [];
    checks.forEach(function (c) {
      var r = parseInt(c.row, 10);
      sh.getRange(r, statusCol).setValue(STATUS_DONE);
      written.push(r);
    });
    SpreadsheetApp.flush();
    return { ok: true, written: written, value: STATUS_DONE };
  } finally {
    lock.releaseLock();
  }
}
