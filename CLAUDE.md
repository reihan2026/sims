# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SIMS (Sistem Internal Manajemen Suplai) — supply chain management system for MBG kitchen operations. Single `index.html` file (~6000 lines), hosted on GitHub Pages, backend is Firebase Firestore.

No build system. To run: open `index.html` in a browser, or push to GitHub and access via GitHub Pages. There is no install, compile, or test step.

## Architecture

Everything lives inline in `index.html`: CSS (lines ~8–1139), HTML markup (lines ~100–1139), and JavaScript (lines ~1146–6043). Sections are delimited by `// ===== SECTION NAME =====` comments.

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

**Key sections by line:**
- Firebase init & auth: ~1147
- Data layer (`_cache`, `loadAllData`, `saveData`): ~1189
- Utils & render cache: ~1473
- PO form & import: ~1775
- Daftar PO & detail: ~1904
- `buildLookup` (3-pass item linking): ~2026
- Invoice Vendor: ~2866
- Invoice Dapur: ~3607
- Cashflow & Rekening: ~3974
- Dashboard: ~4095
- Laporan PO: ~5026
- Konsumsi Bahan Baku: ~5406
- PO ke Vendor: ~5688
- Vendor Milik Saya: ~5873

## Critical Constraints

**Template literals** — string interpolation inside `${}` must use single quotes, not backticks or double quotes. Nested template literals break silently in some browsers. Example: `\`${items.map(i => \`<td>${i.nama}</td>\`).join('')}\`` — inner template literals are fine, but don't mix with single-quoted outer strings.

**Firestore document size** — all data is one document with a 1MB hard limit. The save bar shows current size. Warn at >700KB, error at >900KB. Avoid storing large blobs in `_cache` keys (files are stored separately under `file_*` keys).

**Single file** — all changes are inline in `index.html`. No imports, no modules, no bundler. CDN scripts (Firebase 10.12.0, SheetJS 0.18.5, Chart.js 4.4.0) are loaded via `<script src>` tags.

**Concurrent edits** — if a snapshot arrives while local dirty keys exist, a banner warns the user. Don't add `await` calls inside the snapshot handler body; it must stay synchronous past the dirty-check.

## Data Integrity Rules

- Deleting a PO is blocked if linked invV or invD exist.
- Deleting a vendor or dapur is blocked if referenced in any PO or invoice.
- `delInvV` resets PO item status — skip items already marked `terkirim`.
- Cashback percentage is clamped to 100% max.
- Always add an entry to `log` via `addLog(action, label, refType, refId, refNo, detail)` for financial mutations.
