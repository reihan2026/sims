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

// Rincian tambahan untuk PDF: margin per vendor/kategori, pemisahan pass-through,
// pendapatan per vendor mitra, dan posisi utang-piutang akhir periode.
// Dihitung dari buildLaporanData per PO karena margin hanya ada di tingkat item.
// PO terarsip dilewati — detail per itemnya tidak lagi ada di dokumen utama.
function _lkRincian(d){
  const hidup=(d.byPO||[]).filter(x=>!x.arsip);
  const arsipCnt=(d.byPO||[]).length-hidup.length;
  const vendor={},kategori={},mitra={};
  const jenis={pt:{rev:0,modal:0,inv:0},markup:{rev:0,modal:0,inv:0}};
  const utangList=[],piutangList=[];
  hidup.forEach(x=>{
    let b;try{b=buildLaporanData(x.po.id);}catch(e){return;}
    if(!b)return;
    Object.values(b.byHari).flat().forEach(i=>{
      if(i.harga_dapur==null||!(i.harga_vendor>0))return;
      const qty=i.qty||0,rev=i.harga_dapur*qty,mod=i.harga_vendor*qty;
      const v=i.vendor||'(tanpa vendor)';
      if(!vendor[v])vendor[v]={modal:0,rev:0,margin:0};
      vendor[v].rev+=rev;vendor[v].modal+=mod;vendor[v].margin+=rev-mod;
      const k=i.kat||'Lainnya';
      if(!kategori[k])kategori[k]={modal:0,rev:0,margin:0};
      kategori[k].rev+=rev;kategori[k].modal+=mod;kategori[k].margin+=rev-mod;
    });
    b.invDs.forEach(x2=>{
      const t=x2.type==='passthrough'?'pt':'markup';
      jenis[t].rev+=x2.total||0;jenis[t].inv++;
      const mk=x2.vendor_saya_id||'';
      if(!mitra[mk])mitra[mk]={rev:0,n:0};
      mitra[mk].rev+=x2.total||0;mitra[mk].n++;
      if(x2.terima_status!=='lunas'){
        const recv=(x2.payments||[]).reduce((s,p)=>s+p.jumlah,0);
        const sisa=Math.max(0,(x2.total||0)-recv);
        if(sisa>0)piutangList.push({no:x2.no,pihak:x2.dapur||'',sisa});
      }
    });
    b.invVs.forEach(v=>{
      const isPT=b.passThroughInvVIds.has(v.id);
      jenis[isPT?'pt':'markup'].modal+=v.total||0;
      if(v.bayar_status!=='lunas'&&!isPT){
        const n=invVNet_compute(v);
        if(n.sisa>0)utangList.push({no:v.no,pihak:v.vendor||'',sisa:n.sisa});
      }
    });
  });
  utangList.sort((a,b)=>b.sisa-a.sisa);piutangList.sort((a,b)=>b.sisa-a.sisa);
  return{vendor,kategori,mitra,jenis,arsipCnt,utangList,piutangList,
    utang:utangList.reduce((s,x)=>s+x.sisa,0),
    piutang:piutangList.reduce((s,x)=>s+x.sisa,0)};
}

function cetakLaporanKeu(){
  const siap=_lkDataSiap();if(!siap)return;
  const{d,j}=siap;
  const r=_lkRincian(d);
  const uang=v=>`<td style="text-align:right;font-family:'Courier New',monospace">${fmtF(v)}</td>`;
  const pct=(a,b)=>b>0?(a/b*100).toFixed(1)+'%':'—';
  const sec=(judul,isi,pisah)=>`<div class="sec${pisah?' brk':''}"><div class="sh">${judul}</div>${isi}</div>`;
  const vsList=getVendorSaya();

  // Margin markup murni — pass-through ditagih persis nota vendor sehingga
  // marginnya nol dan menekan angka gabungan.
  const mMarkup=r.jenis.markup.rev-r.jenis.markup.modal;

  const barisRing=(l,v,tebal)=>`<tr><td${tebal?' style="font-weight:700"':''}>${l}</td><td style="text-align:right;font-family:'Courier New',monospace${tebal?';font-weight:700':''}">${fmtF(v)}</td></tr>`;
  const ringkasan=`<table class="tbl"><tbody>
    ${barisRing('Pendapatan (invoice ke dapur)',d.totalRevenue)}
    ${barisRing('Modal vendor (HPP)',d.totalModal)}
    ${barisRing('Ongkos kirim',d.totalOngkir)}
    ${barisRing('Cashback',d.totalCashback)}
    ${barisRing('Profit bersih',d.totalProfit,true)}
    <tr><td style="font-weight:700">Margin gabungan</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${d.totalRevenue>0?d.totalMarginPct.toFixed(1)+'%':'—'}</td></tr>
    <tr><td>Jumlah PO</td><td style="text-align:right;font-family:'Courier New',monospace">${d.posCount}</td></tr>
  </tbody></table>`;

  const jenisTbl=(r.jenis.pt.inv||r.jenis.markup.inv)?`
    <table class="tbl"><thead><tr><th>Jenis invoice</th><th style="text-align:right">Invoice</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Modal</th><th style="text-align:right">Margin</th><th style="text-align:right">%</th></tr></thead><tbody>
      <tr><td>Markup</td><td style="text-align:right">${r.jenis.markup.inv}</td>${uang(r.jenis.markup.rev)}${uang(r.jenis.markup.modal)}${uang(mMarkup)}<td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${pct(mMarkup,r.jenis.markup.rev)}</td></tr>
      <tr><td>Pass-through</td><td style="text-align:right">${r.jenis.pt.inv}</td>${uang(r.jenis.pt.rev)}${uang(r.jenis.pt.modal)}${uang(r.jenis.pt.rev-r.jenis.pt.modal)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(r.jenis.pt.rev-r.jenis.pt.modal,r.jenis.pt.rev)}</td></tr>
    </tbody></table>
    <div class="note">Pass-through ditagihkan ke dapur persis sebesar nota vendor, jadi marginnya nol secara desain. Margin gabungan di atas karena itu lebih rendah dari kinerja markup yang sebenarnya (<strong>${pct(mMarkup,r.jenis.markup.rev)}</strong>).</div>`:'';

  const vendorRows=Object.entries(r.vendor).sort((a,b)=>b[1].margin-a[1].margin);
  const vendorTbl=vendorRows.length?`<table class="tbl"><thead><tr><th>Vendor</th><th style="text-align:right">Modal</th><th style="text-align:right">Ditagih ke dapur</th><th style="text-align:right">Margin</th><th style="text-align:right">%</th></tr></thead><tbody>
    ${vendorRows.map(([n,v])=>`<tr><td>${n}</td>${uang(v.modal)}${uang(v.rev)}${uang(v.margin)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(v.margin,v.rev)}</td></tr>`).join('')}
    </tbody></table><div class="note">Vendor bermargin nol adalah pemasok pass-through — bukan kerugian.</div>`:'';

  const mitraRows=Object.entries(r.mitra).sort((a,b)=>b[1].rev-a[1].rev);
  const mitraTbl=mitraRows.length?`<table class="tbl"><thead><tr><th>Vendor mitra penerbit</th><th style="text-align:right">Invoice</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Porsi</th></tr></thead><tbody>
    ${mitraRows.map(([id,v])=>`<tr><td>${vsList.find(x=>x.id===id)?.nama||'Tanpa mitra (pass-through)'}</td><td style="text-align:right">${v.n}</td>${uang(v.rev)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(v.rev,d.totalRevenue)}</td></tr>`).join('')}
    </tbody></table>`:'';

  const katRows=Object.entries(r.kategori).sort((a,b)=>b[1].margin-a[1].margin);
  const katTbl=katRows.length?`<table class="tbl"><thead><tr><th>Kategori</th><th style="text-align:right">Modal</th><th style="text-align:right">Ditagih ke dapur</th><th style="text-align:right">Margin</th><th style="text-align:right">%</th></tr></thead><tbody>
    ${katRows.map(([n,v])=>`<tr><td>${n}</td>${uang(v.modal)}${uang(v.rev)}${uang(v.margin)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(v.margin,v.rev)}</td></tr>`).join('')}
    </tbody></table>`:'';

  const posisi=`<table class="tbl"><tbody>
      <tr><td style="font-weight:700">Utang ke vendor (belum dibayar)</td>${uang(r.utang)}</tr>
      <tr><td style="font-weight:700">Piutang dari dapur (belum diterima)</td>${uang(r.piutang)}</tr>
      <tr><td style="font-weight:700">Posisi bersih</td><td style="text-align:right;font-family:'Courier New',monospace;font-weight:700">${fmtF(r.piutang-r.utang)}</td></tr>
    </tbody></table>
    ${r.utangList.length?`<div class="sub">Rincian utang vendor</div><table class="tbl"><thead><tr><th>Invoice</th><th>Vendor</th><th style="text-align:right">Sisa</th></tr></thead><tbody>${r.utangList.map(x=>`<tr><td>${x.no}</td><td>${x.pihak}</td>${uang(x.sisa)}</tr>`).join('')}</tbody></table>`:''}
    ${r.piutangList.length?`<div class="sub">Rincian piutang dapur</div><table class="tbl"><thead><tr><th>Invoice</th><th>Dapur</th><th style="text-align:right">Sisa</th></tr></thead><tbody>${r.piutangList.map(x=>`<tr><td>${x.no}</td><td>${x.pihak}</td>${uang(x.sisa)}</tr>`).join('')}</tbody></table>`:''}
    ${!r.utangList.length&&!r.piutangList.length?'<div class="note">Tidak ada tagihan yang menggantung pada periode ini.</div>':''}`;

  const poRows=d.byPO.slice().sort((a,b)=>(a.po.date||'').localeCompare(b.po.date||''));
  const poTbl=`<table class="tbl"><thead><tr><th>PO</th><th>Dapur</th><th>Tanggal</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Modal</th><th style="text-align:right">Profit</th><th style="text-align:right">%</th></tr></thead><tbody>
    ${poRows.map(x=>`<tr><td>${x.po.no}${x.arsip?' <span style="font-size:9px;color:#999">arsip</span>':''}</td><td>${x.po.dapur||''}</td><td>${x.po.date||''}</td>${uang(x.revenue)}${uang(x.modal)}${uang(x.profit)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(x.profit,x.revenue)}</td></tr>`).join('')}
    </tbody></table>`;

  const bulanKeys=Object.keys(d.monthly).sort();
  const bulanTbl=bulanKeys.length>1?`<table class="tbl"><thead><tr><th>Bulan</th><th style="text-align:right">Pendapatan</th><th style="text-align:right">Modal</th><th style="text-align:right">Profit</th><th style="text-align:right">%</th></tr></thead><tbody>
    ${bulanKeys.map(k=>{const m=d.monthly[k];return`<tr><td>${_fmtBulan(k)}</td>${uang(m.revenue)}${uang(m.modal)}${uang(m.profit)}<td style="text-align:right;font-family:'Courier New',monospace">${pct(m.profit,m.revenue)}</td></tr>`;}).join('')}
    </tbody></table>`:'';

  const catatanArsip=r.arsipCnt?`<div class="note">${r.arsipCnt} PO pada periode ini sudah diarsipkan — hanya masuk ringkasan dan tabel per PO. Rincian per vendor, kategori, dan posisi utang-piutang tidak mencakup PO tersebut.</div>`:'';

  const body=`<div class="w">
    <div class="h">
      <div><div class="t">Laporan Keuangan</div><div class="m">${j.judul} · ${j.sub}</div></div>
      <div style="text-align:right"><div style="font-size:11px;color:#6B6560">SIMS</div>
        <div class="m">Dicetak ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    </div>
    ${catatanArsip}
    ${sec('Ringkasan Finansial',ringkasan)}
    ${jenisTbl?sec('Pass-through vs Markup',jenisTbl):''}
    ${sec('Posisi Akhir Periode',posisi)}
    ${sec('Rincian per PO',poTbl,true)}
    ${bulanTbl?sec('Rincian per Bulan',bulanTbl):''}
    ${vendorTbl?sec('Margin per Vendor',vendorTbl,true):''}
    ${mitraTbl?sec('Pendapatan per Vendor Mitra',mitraTbl):''}
    ${katTbl?sec('Rekap per Kategori',katTbl,true):''}
    <div class="stamp"><div class="stamp-box">Disiapkan oleh</div><div class="stamp-box">Disetujui oleh</div></div>
    <div class="ft">Dibuat otomatis oleh SIMS — Sistem Internal Manajemen Suplai</div>
  </div>`;

  // Pemenggalan halaman: section & baris tabel tidak boleh terpotong, header
  // tabel diulang di tiap halaman. Nomor halaman tidak bisa dari CSS (Chrome
  // tidak mendukung margin box @page) — pakai opsi "Header dan footer" di
  // dialog cetak.
  const cssCetak=PRINT_CSS+`
    .sec{margin-bottom:18px;break-inside:avoid;page-break-inside:avoid}
    .sh{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6B6560;border-bottom:2px solid #1A1814;padding-bottom:4px;margin-bottom:8px}
    .sub{font-size:11px;font-weight:600;color:#6B6560;margin-top:10px}
    .note{font-size:11px;color:#6B6560;margin-top:6px;line-height:1.45}
    .tbl tr{break-inside:avoid;page-break-inside:avoid}
    .tbl thead{display:table-header-group}
    @page{margin:14mm}
    @media print{.brk{break-before:page;page-break-before:always}}`;

  const w=window.open('','_blank','width=900,height=780');
  w.document.write(`<!DOCTYPE html><html><head><title>Laporan Keuangan — ${j.judul}</title><style>${cssCetak}</style></head><body>${body}<script>window.print();<\/script></body></html>`);
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
