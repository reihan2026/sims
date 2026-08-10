// ===== PERIODE LAPORAN =====
// Tutup buku di SIMS mengikuti siklus PO (biasanya tiap 4 PO), bukan bulan
// kalender. Periode = kumpulan PO yang dilaporkan bersama.

let _periodeEditId=null;

function _poSudahDipakai(kecualiId){
  // Map po_id -> nama periode lain yang memakainya. Satu PO masuk dua periode
  // berarti nilainya terhitung dua kali saat tutup buku.
  const m={};
  getPeriode().forEach(p=>{
    if(p.id===kecualiId)return;
    (p.po_ids||[]).forEach(id=>{if(!m[id])m[id]=p.nama;});
  });
  return m;
}

function _poRingkas(po){
  const ivs=getInvV().filter(v=>v.po_id===po.id);
  const ids=getInvD().filter(d=>d.po_id===po.id);
  const items=po.items||[];
  const blmTerima=items.filter(i=>i.status_kirim!=='diterima').length;
  // PO yang masih berjalan sudah punya biaya vendor tapi pendapatannya belum
  // ditagihkan ke dapur — memasukkannya ke tutup buku bikin periode tampak rugi.
  const alasan=[];
  if(blmTerima)alasan.push(blmTerima+' item belum diterima');
  if(!ids.length)alasan.push('belum ada invoice dapur');
  return{revenue:ids.reduce((s,d)=>s+(d.total||0),0),modal:ivs.reduce((s,v)=>s+(v.total||0),0),
    belumSelesai:alasan.length>0,alasan:alasan.join(' · ')};
}

function openPeriodeBaru(id){
  _periodeEditId=id||null;
  const p=id?getPeriode().find(x=>x.id===id):null;
  document.getElementById('periode-modal-judul').textContent=p?'Ubah Periode':'Buat Periode Laporan';
  document.getElementById('periode-nama').value=p?.nama||'';
  document.getElementById('periode-catatan').value=p?.catatan||'';
  const terpilih=new Set(p?.po_ids||[]);
  const dipakai=_poSudahDipakai(id);
  const pos=getPOs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  document.getElementById('periode-po-list').innerHTML=pos.length?pos.map(po=>{
    const r=_poRingkas(po);
    const lain=dipakai[po.id];
    return`<label class="periode-row" data-selesai="${r.belumSelesai?'0':'1'}" data-cari="${((po.no||'')+' '+(po.dapur||'')).toLowerCase().replace(/"/g,'&quot;')}" style="display:flex;align-items:flex-start;gap:9px;padding:8px 2px;border-bottom:1px solid var(--bd);cursor:pointer">
      <input type="checkbox" class="periode-cb" value="${po.id}" ${terpilih.has(po.id)?'checked':''} onchange="hitungPeriode()" style="margin-top:3px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${po.no} <span style="font-weight:400;color:var(--t3);font-size:11px">${po.dapur||''} · ${po.date||''} · ${(po.items||[]).length} item</span>${r.belumSelesai?' <span class="tag twn" style="font-size:9px">Masih berjalan</span>':''}</div>
        <div style="font-size:11px;color:var(--t2);font-family:var(--mn);margin-top:1px">Revenue ${fmtF(r.revenue)} · Modal ${fmtF(r.modal)}</div>
        ${r.belumSelesai?`<div style="font-size:10px;color:var(--wt);margin-top:2px">⚠ ${r.alasan} — biayanya sudah tercatat tapi pendapatannya belum, periode akan tampak rugi</div>`:''}
        ${lain?`<div style="font-size:10px;color:var(--wt);margin-top:2px">⚠ Sudah masuk periode "${lain}" — kalau dicentang juga, nilainya terhitung dua kali</div>`:''}
      </div>
    </label>`;}).join(''):'<div class="empty">Belum ada PO</div>';
  document.getElementById('periode-srch').value='';
  hitungPeriode();
  openModal('modal-periode');
}

function filterPeriodePO(){
  const q=(document.getElementById('periode-srch')?.value||'').toLowerCase().trim();
  document.querySelectorAll('#periode-po-list .periode-row').forEach(row=>{
    row.style.display=(!q||(row.dataset.cari||'').includes(q))?'flex':'none';
  });
}

// Jalur cepat tutup buku rutin: N PO SELESAI terbaru yang belum masuk periode
// mana pun. PO yang masih berjalan sengaja dilewati — saat tutup buku, PO
// terbaru biasanya belum ditagihkan ke dapur, jadi kalau ikut terpilih periode
// akan tampak rugi. Masih bisa dicentang manual kalau memang diinginkan.
function periodePilihTerakhir(n){
  const dipakai=_poSudahDipakai(_periodeEditId);
  const kandidat=getPOs().slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    .filter(po=>!dipakai[po.id]&&!_poRingkas(po).belumSelesai).slice(0,n).map(po=>po.id);
  const set=new Set(kandidat);
  document.querySelectorAll('.periode-cb').forEach(cb=>{cb.checked=set.has(cb.value);});
  hitungPeriode();
  if(!kandidat.length)showToast('Tidak ada PO selesai yang belum masuk periode lain',true);
  else if(kandidat.length<n)showToast('Hanya '+kandidat.length+' PO selesai yang tersedia',true);
}

function periodeCheckAll(v){
  document.querySelectorAll('#periode-po-list .periode-row').forEach(row=>{
    if(row.style.display==='none')return;
    const cb=row.querySelector('.periode-cb');if(cb)cb.checked=v;
  });
  hitungPeriode();
}

function hitungPeriode(){
  const ids=[...document.querySelectorAll('.periode-cb:checked')].map(cb=>cb.value);
  const el=document.getElementById('periode-hitung');if(!el)return;
  if(!ids.length){el.innerHTML='<span style="color:var(--t3)">Belum ada PO dipilih</span>';return;}
  const d=_lkBuildData(null,null,ids);
  const dipakai=_poSudahDipakai(_periodeEditId);
  const bentrok=ids.filter(id=>dipakai[id]).length;
  const berjalan=ids.map(id=>getPOs().find(p=>p.id===id)).filter(p=>p&&_poRingkas(p).belumSelesai);
  el.innerHTML=`<strong>${ids.length} PO</strong> · Revenue <strong class="num">${fmtF(d.totalRevenue)}</strong>
    · Modal <span class="num">${fmtF(d.totalModal)}</span>
    · Profit <strong class="num" style="color:${d.totalProfit>=0?'var(--ac)':'var(--dn)'}">${fmtF(d.totalProfit)}</strong>
    ${d.totalRevenue>0?`<span style="color:var(--t3)">(${d.totalMarginPct.toFixed(1)}%)</span>`:''}
    ${berjalan.length?`<div style="color:var(--wt);font-size:11px;margin-top:3px">⚠ ${berjalan.length} PO masih berjalan (${berjalan.map(p=>p.no).join(', ')}) — biaya vendor sudah masuk tapi pendapatan belum, jadi profit di atas terlalu rendah</div>`:''}
    ${bentrok?`<div style="color:var(--wt);font-size:11px;margin-top:3px">⚠ ${bentrok} PO juga ada di periode lain — nilainya akan terhitung dua kali</div>`:''}`;
}

function simpanPeriode(){
  const nama=document.getElementById('periode-nama').value.trim();
  if(!nama){showToast('Isi nama periode dulu',true);return;}
  const po_ids=[...document.querySelectorAll('.periode-cb:checked')].map(cb=>cb.value);
  if(!po_ids.length){showToast('Pilih minimal 1 PO',true);return;}
  const list=getPeriode();
  const catatan=document.getElementById('periode-catatan').value.trim();
  if(_periodeEditId){
    const p=list.find(x=>x.id===_periodeEditId);
    if(!p){showToast('Periode tidak ditemukan',true);return;}
    p.nama=nama;p.catatan=catatan;p.po_ids=po_ids;
    addLog('edit_periode','Ubah periode laporan','periode',p.id,nama,po_ids.length+' PO');
  }else{
    const baru={id:uid(),nama,catatan,po_ids,created:new Date().toISOString(),created_by:getUserProfile().nama||''};
    list.push(baru);
    _periodeEditId=baru.id;
    addLog('buat_periode','Buat periode laporan','periode',baru.id,nama,po_ids.length+' PO');
  }
  setPeriode(list);
  localStorage.setItem('lk-mode','periode');
  localStorage.setItem('lk-periode',_periodeEditId);
  closeModal('modal-periode');
  showToast('Periode "'+nama+'" disimpan');
  renderLaporanKeu();
}

function openPeriodeKelola(){
  const list=getPeriode().slice().sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  document.getElementById('periode-kelola-body').innerHTML=list.length?
    `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nama</th><th style="text-align:right">PO</th><th style="text-align:right">Revenue</th><th style="text-align:right">Profit</th><th>Dibuat</th><th></th></tr></thead><tbody>${
    list.map(p=>{
      const d=_lkBuildData(null,null,p.po_ids||[]);
      return`<tr>
        <td><div style="font-weight:500">${p.nama}</div>${p.catatan?`<div style="font-size:10px;color:var(--t3)">${p.catatan}</div>`:''}</td>
        <td class="num" style="text-align:right">${(p.po_ids||[]).length}</td>
        <td class="num" style="text-align:right">${fmtF(d.totalRevenue)}</td>
        <td class="num" style="text-align:right;color:${d.totalProfit>=0?'var(--ac)':'var(--dn)'}">${fmtF(d.totalProfit)}</td>
        <td style="font-size:11px;color:var(--t3)">${(p.created||'').substring(0,10)}</td>
        <td><div class="bg"><button class="btn bxs" onclick="bukaPeriode('${p.id}')">Buka</button><button class="btn bxs" onclick="closeModal('modal-periode-kelola');openPeriodeBaru('${p.id}')">Ubah</button><button class="btn bxs bd-" onclick="hapusPeriode('${p.id}')">Hapus</button></div></td>
      </tr>`;}).join('')}</tbody></table></div>`
    :'<div class="empty">Belum ada periode tersimpan</div>';
  openModal('modal-periode-kelola');
}

function bukaPeriode(id){
  localStorage.setItem('lk-mode','periode');
  localStorage.setItem('lk-periode',id);
  closeModal('modal-periode-kelola');
  renderLaporanKeu();
}

function hapusPeriode(id){
  const p=getPeriode().find(x=>x.id===id);if(!p)return;
  if(!confirm('Hapus periode "'+p.nama+'"?\n\nPO dan invoice di dalamnya tidak ikut terhapus — hanya pengelompokannya.'))return;
  setPeriode(getPeriode().filter(x=>x.id!==id));
  addLog('hapus_periode','Hapus periode laporan','periode',id,p.nama,'');
  if(localStorage.getItem('lk-periode')===id)localStorage.removeItem('lk-periode');
  openPeriodeKelola();renderLaporanKeu();
  showToast('Periode dihapus');
}

// ===== EKSPOR LAPORAN KEUANGAN =====

// Judul periode yang sedang tampil — dipakai di kop cetak & nama berkas.
function _lkJudulPeriode(){
  // Utamakan periode yang menempel di data yang sedang tampil, bukan mode di
  // localStorage — judul dokumen cetak harus selalu cocok dengan isinya.
  const p=_lkLastData?.periode;
  if(p)return{judul:p.nama,sub:(p.po_ids||[]).length+' PO'+(p.catatan?' · '+p.catatan:''),berkas:p.nama};
  const mode=localStorage.getItem('lk-mode')||'tahun';
  if(mode==='periode')return null;
  const{from,to}=_lkGetRange();
  if(mode==='custom')return{judul:from+' s/d '+to,sub:'Rentang tanggal',berkas:from+'_'+to};
  const th=localStorage.getItem('lk-tahun')||new Date().getFullYear().toString();
  return{judul:'Tahun '+th,sub:'Januari — Desember '+th,berkas:th};
}

function _lkDataSiap(){
  if(!_lkLastData){showToast('Belum ada data — pilih periode dulu',true);return null;}
  const j=_lkJudulPeriode();
  if(!j){showToast('Periode tidak ditemukan',true);return null;}
  return{d:_lkLastData,j};
}

function cetakLaporanKeu(){
  const siap=_lkDataSiap();if(!siap)return;
  const{d,j}=siap;
  const baris=(l,v,tebal)=>`<tr><td${tebal?' style="font-weight:700"':''}>${l}</td><td style="text-align:right;font-family:'Courier New',monospace${tebal?';font-weight:700':''}">${fmtF(v)}</td></tr>`;
  const bulanKeys=Object.keys(d.monthly).sort();
  const poRows=d.byPO.slice().sort((a,b)=>(a.po.date||'').localeCompare(b.po.date||''));
  const vendorRows=Object.entries(d.byVendor).sort((a,b)=>b[1].modal-a[1].modal);

  const body=`<div class="w">
    <div class="h"><div>
      <div class="t">Laporan Keuangan</div>
      <div class="m">${j.judul} · ${j.sub}</div>
    </div><div style="text-align:right">
      <div style="font-size:11px;color:#6B6560">SIMS</div>
      <div class="m">Dicetak ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div></div>

    <table class="tbl"><thead><tr><th colspan="2">Ringkasan</th></tr></thead><tbody>
      ${baris('Pendapatan (invoice ke dapur)',d.totalRevenue)}
      ${baris('Modal vendor (HPP)',d.totalModal)}
      ${baris('Ongkos kirim',d.totalOngkir)}
      ${baris('Cashback',d.totalCashback)}
      ${baris('Profit bersih',d.totalProfit,true)}
      <tr><td style="font-weight:700">Margin</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${d.totalRevenue>0?d.totalMarginPct.toFixed(1)+'%':'—'}</td></tr>
      <tr><td>Jumlah PO</td><td style="text-align:right;font-family:'Courier New',monospace">${d.posCount}</td></tr>
    </tbody></table>

    <table class="tbl"><thead><tr><th>PO</th><th>Dapur</th><th>Tanggal</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Modal</th><th style="text-align:right">Profit</th></tr></thead><tbody>
      ${poRows.map(x=>`<tr><td>${x.po.no}</td><td>${x.po.dapur||''}</td><td>${x.po.date||''}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(x.revenue)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(x.modal)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(x.profit)}</td></tr>`).join('')}
    </tbody></table>

    ${bulanKeys.length>1?`<table class="tbl"><thead><tr><th>Bulan</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Modal</th><th style="text-align:right">Profit</th></tr></thead><tbody>
      ${bulanKeys.map(k=>`<tr><td>${_fmtBulan(k)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(d.monthly[k].revenue)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(d.monthly[k].modal)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(d.monthly[k].profit)}</td></tr>`).join('')}
    </tbody></table>`:''}

    <table class="tbl"><thead><tr><th>Vendor</th><th style="text-align:right">Modal</th><th style="text-align:right">Ongkir</th><th style="text-align:right">Cashback</th></tr></thead><tbody>
      ${vendorRows.map(([n,v])=>`<tr><td>${n}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(v.modal)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(v.ongkir)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace">${fmtF(v.cashback)}</td></tr>`).join('')}
    </tbody></table>

    <div class="stamp"><div class="stamp-box">Disiapkan oleh</div><div class="stamp-box">Disetujui oleh</div></div>
    <div class="ft">Dibuat otomatis oleh SIMS — Sistem Internal Manajemen Suplai</div>
  </div>`;

  const w=window.open('','_blank','width=880,height=760');
  w.document.write(`<!DOCTYPE html><html><head><title>Laporan Keuangan — ${j.judul}</title><style>${PRINT_CSS}</style></head><body>${body}<script>window.print();<\/script></body></html>`);
  w.document.close();
}

function exportLaporanKeuExcel(){
  const siap=_lkDataSiap();if(!siap)return;
  const{d,j}=siap;
  const wb=XLSX.utils.book_new();

  const ring=[['Laporan Keuangan'],[j.judul],[j.sub],[],
    ['Pos','Nilai'],
    ['Pendapatan (invoice ke dapur)',d.totalRevenue],
    ['Modal vendor (HPP)',d.totalModal],
    ['Ongkos kirim',d.totalOngkir],
    ['Cashback',d.totalCashback],
    ['Profit bersih',d.totalProfit],
    ['Margin (%)',d.totalRevenue>0?+d.totalMarginPct.toFixed(2):0],
    ['Jumlah PO',d.posCount]];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ring),'Ringkasan');

  const poRows=[['No PO','Dapur','Tanggal','Pendapatan','Modal','Ongkir','Cashback','Profit','Margin %']];
  d.byPO.slice().sort((a,b)=>(a.po.date||'').localeCompare(b.po.date||'')).forEach(x=>poRows.push([
    x.po.no,x.po.dapur||'',x.po.date||'',x.revenue,x.modal,x.ongkir,x.cashback,x.profit,
    x.revenue>0?+(x.profit/x.revenue*100).toFixed(2):0]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(poRows),'Per PO');

  const blnRows=[['Bulan','Pendapatan','Modal','Ongkir','Cashback','Profit','Jml PO']];
  Object.keys(d.monthly).sort().forEach(k=>{const m=d.monthly[k];
    blnRows.push([k,m.revenue,m.modal,m.ongkir,m.cashback,m.profit,m.cnt]);});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(blnRows),'Per Bulan');

  const vRows=[['Vendor','Modal','Ongkir','Cashback']];
  Object.entries(d.byVendor).sort((a,b)=>b[1].modal-a[1].modal)
    .forEach(([n,v])=>vRows.push([n,v.modal,v.ongkir,v.cashback]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(vRows),'Per Vendor');

  const dRows=[['Dapur','Pendapatan','Jml Invoice']];
  Object.entries(d.byDapur).sort((a,b)=>b[1].revenue-a[1].revenue)
    .forEach(([n,v])=>dRows.push([n,v.revenue,v.cnt]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(dRows),'Per Dapur');

  XLSX.writeFile(wb,`Laporan-Keuangan-${(j.berkas||'').replace(/[^a-z0-9]/gi,'_')}.xlsx`);
  showToast('Excel diunduh');
}
