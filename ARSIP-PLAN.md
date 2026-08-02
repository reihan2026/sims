# Rencana: Arsip PO lama ke dokumen terpisah

## Konteks

Dokumen `sims/data` tumbuh ~6,4 KB/hari dan sudah di ~812 KB (metrik JSON aplikasi) dari batas keras Firestore 1 MB. 96% isinya (659 KB) adalah PO yang sudah tutup penuh — semua item diterima, semua invV lunas, semua invD lunas.

Keputusan yang sudah diambil:
- **Kedalaman:** ringkasan per bulan (laporan agregat tetap utuh; detail per-PO dibuka dari halaman Arsip)
- **Ambang:** PO berumur lebih dari 3 bulan
- **Pemicu:** manual lewat tombol, dengan pratinjau sebelum eksekusi

## Model data

**Dokumen arsip** — `sims_arsip/{YYYY-MM}` berisi `{po:[...], invv:[...], invd:[...]}` lengkap tanpa perubahan bentuk. Koleksi terpisah, jadi tidak membebani `sims/data`. Pola ini sudah terbukti di `sims_files` (`js/data.js:287`).

**Dokumen utama** bertambah dua key kecil:

- `arsip_idx: [{periode, po_cnt, invv_cnt, invd_cnt, kb, arsip_at}]` — daftar periode terarsip
- `arsip_ringkas: {periode: {...}}` — agregat yang dibutuhkan laporan:

```js
{
  revenue, modal, ongkir, cashback, profit, po_cnt,   // Laporan Keuangan: total + monthly
  byVendor: {vendor:{modal,ongkir,cashback}},
  byDapur:  {dapur:{revenue,cnt}},
  po: [{id,no,date,dapur,revenue,modal,ongkir,cashback,profit,n_item}],
  konsumsi: [{nama,kat,satuan,vendor,dapur,bulan,qty,nilai}],  // sudah teragregasi
  bayar: {'YYYY-MM':{keluar,masuk}},                  // Cashflow per periode pembayaran
  rek:   {rek_id:{keluar,masuk}},                     // halaman Rekening
  dapurs: [...], vendors: [...]                       // isi dropdown
}
```

Perkiraan ~10 KB per bulan terarsip, dari ~94–208 KB data mentah.

## Yang harus disentuh

Enam titik agregasi membaca seluruh riwayat dan akan salah diam-diam kalau tidak diperbarui:

| Lokasi | Kebutuhan |
|---|---|
| `js/laporan.js:752` `_lkBuildData` | total, monthly, byVendor, byDapur, byPO |
| `js/laporan.js:460` `_getKonsumsiRows` | baris konsumsi |
| `js/laporan.js:788` | daftar tahun di dropdown |
| `js/cashflow.js:116` `renderRekening` | keluar/masuk per rekening |
| `js/cashflow.js:11` `renderCashflow` | sudah bayar/terima per periode, daftar bulan |
| `js/dashboard.js:7,13` | daftar dapur, rekap bulanan |

Piutang, utang vendor, dan agenda **tidak** perlu diubah — semuanya hanya menyangkut invoice/item yang belum selesai, sedangkan yang diarsip pasti sudah tutup.

## Urutan kerja

Sengaja dibalik: semua bisa diverifikasi sebelum satu byte pun berpindah.

**A. Pembangun ringkasan** (`js/arsip-data.js` baru) — fungsi murni `buildRingkasan(pos,invvs,invds)` dan `periodeLayakArsip(bulan)`. Tanpa mutasi, tanpa I/O.

**B. Pratinjau** — tombol di Pengaturan menampilkan periode yang layak, jumlah PO/invoice, KB yang dihemat, dan ringkasan hasil hitungan. Belum menulis apa pun. Di sini ringkasan diuji terhadap data asli: total dari ringkasan harus sama persis dengan total dari data mentah.

**C. Sisi baca** — keenam titik agregasi menggabungkan data hidup dengan `arsip_ringkas`. Dilakukan **sebelum** ada arsip, jadi `arsip_ringkas` kosong dan hasilnya wajib identik dengan sekarang — regresi apa pun langsung ketahuan.

**D. Eksekusi** — tulis `sims_arsip/{periode}`, verifikasi tulisan berhasil dengan membaca ulang, baru hapus dari `_cache` dan simpan. Wajib backup dulu. Urutan ini memastikan tidak ada data hilang kalau gagal di tengah.

**E. Halaman Arsip** — daftar periode terarsip, buka detail PO lama (memuat dokumen arsip sesuai permintaan).

## Verifikasi

- **Sebelum eksekusi:** total revenue/modal/profit dari `arsip_ringkas` harus sama persis dengan hitungan langsung atas data mentah periode itu. Diuji di browser terhadap data produksi, read-only.
- **Setelah tahap C:** seluruh angka di Laporan Keuangan, Konsumsi, Cashflow, Rekening, dan Rekap Bulanan harus tidak berubah sedikit pun (arsip masih kosong).
- **Setelah eksekusi:** angka-angka yang sama dibandingkan dengan tangkapan sebelum arsip — harus cocok.
- Backup JSON wajib diunduh sebelum eksekusi pertama.

## Catatan

Ambang 3 bulan hari ini hanya memindahkan April (94 KB). Dokumen akan berayun di 630–820 KB seiring bulan baru masuk dan bulan lama diarsip. Kalau terasa mepet, `ARSIP_BULAN` tinggal diubah ke 2.

`backupData()` (`js/data.js:299`) tidak mengekspor `log` — bug terpisah, perlu diperbaiki agar backup pra-arsip benar-benar lengkap.
