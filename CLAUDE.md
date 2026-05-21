# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

This is the SIMS project. Confirm you are working in the SIMS codebase (not MBG Kitchen) before editing any files.

## Deployment

ALWAYS commit and push changes to GitHub after completing edits, since the app deploys via GitHub Pages — code is not visible until pushed.

## Verification

After implementing any UI feature, verify the change is actually visible/rendered (not just present in code) before claiming it works — confirm trigger buttons, modal fields, and labels appear.

## Security

NEVER ask the user to paste secrets, tokens, or credentials into the chat. Use git credential helpers, SSH keys, or environment variables instead.

## Project

SIMS (Sistem Internal Manajemen Suplai) — supply chain management system for MBG kitchen operations. Single `index.html` file (~6000 lines), hosted on GitHub Pages, backend is Firebase Firestore.

No build system. To run: open `index.html` in a browser, or push to GitHub and access via GitHub Pages. There is no install, compile, or test step.

## Architecture

HTML markup lives in `index.html` (~1002 lines). CSS and JavaScript are split into separate files:

```
sims/
├── index.html          — HTML markup + <script> tags (~1002 lines)
├── css/
│   └── style.css       — all CSS (~195 lines)
└── js/
    ├── firebase.js     — Firebase init & auth
    ├── data.js         — _cache, loadAllData, saveData, batch write, accessors
    ├── utils.js        — constants, utils, render cache (_rc), navigation
    ├── master.js       — master data (dapur, vendor, kategori) + rekening
    ├── po-form.js      — form PO baru, import Excel/paste, savePO
    ├── po.js           — daftar PO, detail PO, edit item, status kirim, status popup, view nota
    ├── invoice-vendor.js — invoice vendor, edit qty, auto-suggest, revisi, bayar, retur, konversi PT
    ├── invoice-dapur.js  — invoice dapur, terima dari dapur, render invoice dapur
    ├── cashflow.js     — cashflow + rekening page
    ├── dashboard.js    — dashboard + agenda/metrics
    ├── misc.js         — filter detail PO, global search, drag-drop, activity log, bulk update
    ├── laporan.js      — laporan PO, konsumsi bahan baku, laporan keuangan
    └── vendor.js       — PO ke vendor, vendor milik saya
```

Sections within each file are still delimited by `// ===== SECTION NAME =====` comments.

**Data layer** — all data lives in a single Firestore document `sims/data`. An in-memory `_cache` object mirrors it:

```
_cache = { po, invv, invd, pov, rek, vendor_saya, master, log, user, ctr_invv, ctr_invd, ctr_pov }
```

Reads always go through `_cache` (never direct Firestore reads). Writes use `saveData(['key1','key2'])`, which marks keys dirty and debounces a 300ms batch write via `_flushSave()`. Realtime sync comes from a single `onSnapshot` listener on `sims/data`.

Accessors follow the pattern `getPOs()`, `getInvV()`, `getInvD()`, `getReks()`, `getMaster()` — these return `_cache.*` directly. Mutations write back to `_cache` then call `saveData([key])`.

**Navigation** — `nav(name)` activates a page by toggling `.active` class. Pages are `<div class="page" id="page-*">`. The active page name is tracked in `_currentPage`.

**Linking model** — the core entity graph is `PO → invV (Invoice Vendor) → invD (Invoice Dapur)`. Items are linked by:
- `invV.po_id` → PO
- `invV.items[n].idx` → PO item index (may become stale if PO items are reordered)
- `invD.po_id` → PO; `invD.items[n].invv_id` → invV item

`buildLookup(poId)` resolves the PO↔invV↔invD mapping using a 3-pass algorithm (exact idx+nama → composite key → nama-only fallback) to handle stale indices. Results are cached in `_lookupCache` (invalidated by `invalidatePO(poId)`).

**Where to find things:**
- Firebase init & auth → `js/firebase.js`
- Data layer (`_cache`, `loadAllData`, `saveData`) → `js/data.js`
- Utils, render cache, navigation → `js/utils.js`
- Master data, rekening → `js/master.js`
- PO form & import → `js/po-form.js`
- Daftar PO, detail PO, `buildLookup` (3-pass item linking) → `js/po.js`
- Invoice Vendor (edit, revisi, bayar, retur, konversi PT) → `js/invoice-vendor.js`
- Invoice Dapur → `js/invoice-dapur.js`
- Cashflow & Rekening → `js/cashflow.js`
- Dashboard & Agenda → `js/dashboard.js`
- Filter, global search, drag-drop, activity log, bulk update → `js/misc.js`
- Laporan PO, Konsumsi Bahan Baku, Laporan Keuangan → `js/laporan.js`
- PO ke Vendor, Vendor Milik Saya → `js/vendor.js`

## Critical Constraints

**Template literals** — string interpolation inside `${}` must use single quotes, not backticks or double quotes. Nested template literals break silently in some browsers. Example: `\`${items.map(i => \`<td>${i.nama}</td>\`).join('')}\`` — inner template literals are fine, but don't mix with single-quoted outer strings.

**Firestore document size** — all data is one document with a 1MB hard limit. The save bar shows current size. Warn at >700KB, error at >900KB. Avoid storing large blobs in `_cache` keys (files are stored separately under `file_*` keys).

**Single file** — all changes are inline in `index.html`. No imports, no modules, no bundler. CDN scripts (Firebase 10.12.0, SheetJS 0.18.5, Chart.js 4.4.0) are loaded via `<script src>` tags.

**Concurrent edits** — if a snapshot arrives while local dirty keys exist, a banner warns the user. Don't add `await` calls inside the snapshot handler body; it must stay synchronous past the dirty-check.

## Financial Logic / Domain Rules

- Cashback lives in the `v.cashbacks` array (not `v.cashback`).
- Tax is deducted from gross revenue, not from the post-fee remainder.

## Data Integrity Rules

- Deleting a PO is blocked if linked invV or invD exist.
- Deleting a vendor or dapur is blocked if referenced in any PO or invoice.
- `delInvV` resets PO item status — skip items already marked `terkirim`.
- Cashback percentage is clamped to 100% max.
- Always add an entry to `log` via `addLog(action, label, refType, refId, refNo, detail)` for financial mutations.
