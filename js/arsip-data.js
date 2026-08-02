// ===== ARSIP DATA — pembangun ringkasan =====
// Fungsi murni: tidak menyentuh _cache, tidak menulis Firestore.
// Semua agregat yang dibutuhkan laporan setelah PO dipindah ke sims_arsip/{periode}.

// PO diarsipkan setelah lebih tua dari ini. Turunkan ke 2 kalau dokumen terasa mepet.
const ARSIP_BULAN=3;

// Batas periode: PO dengan date < batas ini layak diarsip.
// Mengembalikan 'YYYY-MM' — periode paling awal yang MASIH ditahan di dokumen utama.
function arsipBatasPeriode(hariIni){
  const d=new Date((hariIni||today())+'T00:00:00');
  d.setMonth(d.getMonth()-ARSIP_BULAN);
  return d.toISOString().substring(0,7);
}

// PO tutup penuh = semua item diterima, semua invV lunas, semua invD lunas.
// Hanya PO tutup yang boleh diarsip — yang masih berjalan tetap butuh diedit.
function poTutupPenuh(po,invvs,invds){
  const items=po.items||[];
  if(!items.length)return false;
  if(!items.every(i=>i.status_kirim==='diterima'))return false;
  const vs=invvs.filter(v=>v.po_id===po.id);
  const ds=invds.filter(d=>d.po_id===po.id);
  if(!vs.every(v=>v.bayar_status==='lunas'))return false;
  if(!ds.every(d=>d.terima_status==='lunas'))return false;
  return true;
}

// Kelompokkan PO yang layak arsip per periode 'YYYY-MM' (berdasarkan po.date).
function periodeLayakArsip(pos,invvs,invds,hariIni){
  const batas=arsipBatasPeriode(hariIni);
  const per={};
  (pos||[]).forEach(po=>{
    const periode=(po.date||'').substring(0,7);
    if(!periode||periode>=batas)return;
    if(!poTutupPenuh(po,invvs,invds))return;
    if(!per[periode])per[periode]={periode,pos:[],invvs:[],invds:[]};
    per[periode].pos.push(po);
  });
  Object.values(per).forEach(g=>{
    const ids=new Set(g.pos.map(p=>p.id));
    g.invvs=(invvs||[]).filter(v=>ids.has(v.po_id));
    g.invds=(invds||[]).filter(d=>ids.has(d.po_id));
  });
  return Object.values(per).sort((a,b)=>a.periode.localeCompare(b.periode));
}

// Ringkasan padat satu periode. Bentuknya mengikuti apa yang dibaca laporan:
// _lkBuildData (js/laporan.js), _getKonsumsiRows, renderCashflow, renderRekening.
function buildRingkasan(pos,invvs,invds){
  // tp/tv/margin memakai basis poTotals (nilai PO vs harga vendor) — beda dari
  // revenue/modal yang berbasis total invoice. Rekap Bulanan dashboard pakai yang ini.
  const r={revenue:0,modal:0,ongkir:0,cashback:0,profit:0,po_cnt:0,
    tp:0,tv:0,margin:0,
    byVendor:{},byDapur:{},po:[],konsumsi:[],bayar:{},rek:{},dapurs:[],vendors:[]};
  const konsMap=new Map();
  const dapurSet=new Set(),vendorSet=new Set();

  (pos||[]).forEach(po=>{
    const ivs=(invvs||[]).filter(v=>v.po_id===po.id);
    const ids=(invds||[]).filter(d=>d.po_id===po.id);
    const revenue=ids.reduce((s,d)=>s+(d.total||0),0);
    const modal=ivs.reduce((s,v)=>s+(v.total||0),0);
    const ongkir=ivs.reduce((s,v)=>s+(v.ongkir||0),0);
    const cashback=ivs.reduce((s,v)=>s+(v.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0),0);
    const profit=revenue-modal-ongkir+cashback;
    r.revenue+=revenue;r.modal+=modal;r.ongkir+=ongkir;r.cashback+=cashback;r.profit+=profit;r.po_cnt++;
    // Basis Rekap Bulanan — dihitung ulang di sini agar tidak bergantung pada
    // cache render (_rc) yang isinya hanya data hidup.
    let tp=0,tvFilled=0,tpFilled=0;
    (po.items||[]).forEach(i=>{
      tp+=(i.qty||0)*(i.harga_po||0);
      if(i.harga_vendor>0){tpFilled+=(i.qty||0)*(i.harga_po||0);tvFilled+=(i.qty||0)*(i.harga_vendor||0);}
    });
    r.tp+=tp;r.tv+=tvFilled;r.margin+=tpFilled-tvFilled-ongkir;
    if(po.dapur)dapurSet.add(po.dapur);
    r.po.push({id:po.id,no:po.no,date:po.date,dapur:po.dapur||'',
      revenue,modal,ongkir,cashback,profit,n_item:(po.items||[]).length});

    ivs.forEach(iv=>{
      const v=iv.vendor||'(tanpa vendor)';
      vendorSet.add(v);
      if(!r.byVendor[v])r.byVendor[v]={modal:0,ongkir:0,cashback:0};
      r.byVendor[v].modal+=iv.total||0;
      r.byVendor[v].ongkir+=iv.ongkir||0;
      r.byVendor[v].cashback+=(iv.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0);
    });
    ids.forEach(d=>{
      const dp=d.dapur||po.dapur||'(tanpa dapur)';
      if(!r.byDapur[dp])r.byDapur[dp]={revenue:0,cnt:0};
      r.byDapur[dp].revenue+=d.total||0;r.byDapur[dp].cnt++;
    });

    // Konsumsi bahan baku — tiru _getKonsumsiRows (js/laporan.js:458) lalu gabung
    // baris dengan kunci yang sama supaya ringkas.
    (po.items||[]).forEach(item=>{
      if(item.status_kirim!=='diterima')return;
      const tgl=item.tgl_diterima||po.date||'';
      const bulan=tgl.substring(0,7);
      const satuan=item.satuan||'pcs';
      const qty=Math.max(0,(item.qty||0)-(item.retur?.qty||0));
      const harga=(item.harga_vendor>0?item.harga_vendor:(item.harga_po||0));
      const nama=(item.nama||'').trim();
      const kat=item.kat||'Lainnya';
      const vendor=item.vendor||'—';
      const k=[nama,kat,satuan,vendor,po.dapur||'',bulan].join('||');
      if(!konsMap.has(k))konsMap.set(k,{nama,kat,satuan,vendor,dapur:po.dapur||'',bulan,qty:0,nilai:0});
      const row=konsMap.get(k);
      row.qty+=qty;row.nilai+=harga*qty;
    });
  });

  // Pembayaran dikelompokkan per bulan TRANSAKSI (bisa beda dari periode PO)
  // dan per rekening — dipakai Cashflow & halaman Rekening.
  const catat=(payments,arah)=>{
    (payments||[]).forEach(p=>{
      const bl=(p.tgl||'').substring(0,7);
      if(bl){
        if(!r.bayar[bl])r.bayar[bl]={keluar:0,masuk:0};
        r.bayar[bl][arah]+=p.jumlah||0;
      }
      if(p.rek_id){
        if(!r.rek[p.rek_id])r.rek[p.rek_id]={keluar:0,masuk:0};
        r.rek[p.rek_id][arah]+=p.jumlah||0;
      }
    });
  };
  (invvs||[]).forEach(iv=>catat(iv.payments,'keluar'));
  (invds||[]).forEach(d=>catat(d.payments,'masuk'));

  r.konsumsi=[...konsMap.values()];
  r.dapurs=[...dapurSet].sort();
  r.vendors=[...vendorSet].sort();
  return r;
}

// ===== Akses ringkasan yang sudah tersimpan =====
function getArsipRingkas(){return _cache.arsip_ringkas||{};}
function getArsipIdx(){return _cache.arsip_idx||[];}

// Semua baris konsumsi dari seluruh periode terarsip.
function arsipKonsumsiRows(){
  const out=[];
  Object.values(getArsipRingkas()).forEach(r=>{(r.konsumsi||[]).forEach(x=>out.push(x));});
  return out;
}

// ===== PRATINJAU & EKSEKUSI ARSIP =====

function _arsipKB(o){return Math.round(JSON.stringify(o).length/1024);}

function renderArsipPeriode(){
  const el=document.getElementById('arsip-periode-list');
  if(!el)return;
  const sudah=getArsipIdx();
  const grup=periodeLayakArsip(getPOs(),getInvV(),getInvD());
  let html='';

  if(sudah.length){
    html+='<div style="font-size:11px;color:var(--t3);margin-bottom:5px">Sudah diarsipkan</div>';
    html+=sudah.slice().sort((a,b)=>b.periode.localeCompare(a.periode)).map(a=>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid var(--bd);border-radius:var(--r);margin-bottom:5px;gap:8px;flex-wrap:wrap">
        <div><strong style="font-size:13px">${a.periode}</strong>
          <span style="font-size:11px;color:var(--t3);margin-left:7px">${a.po_cnt} PO · ${a.invv_cnt} invV · ${a.invd_cnt} invD · ${a.kb} KB dihemat</span></div>
        <button class="btn bxs" onclick="bukaArsipPeriode('${a.periode}')">Lihat isi</button>
      </div>`).join('');
  }

  if(!grup.length){
    html+=`<div class="empty" style="padding:12px">Tidak ada periode yang layak diarsip saat ini</div>`;
    el.innerHTML=html;return;
  }

  html+='<div style="font-size:11px;color:var(--t3);margin:10px 0 5px">Layak diarsipkan</div>';
  html+=grup.map(g=>{
    const kb=_arsipKB({po:g.pos,invv:g.invvs,invd:g.invds});
    const rk=_arsipKB(buildRingkasan(g.pos,g.invvs,g.invds));
    return`<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border:1px solid var(--wb);background:var(--wbg);border-radius:var(--r);margin-bottom:6px;gap:8px;flex-wrap:wrap">
      <div>
        <strong style="font-size:13px">${g.periode}</strong>
        <span style="font-size:11px;color:var(--t2);margin-left:7px">${g.pos.length} PO · ${g.invvs.length} invoice vendor · ${g.invds.length} invoice dapur</span>
        <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin-top:2px">${kb} KB → ringkasan ${rk} KB · hemat ${kb-rk} KB</div>
      </div>
      <button class="btn bsm bw" onclick="pratinjauArsip('${g.periode}')">Pratinjau & arsipkan</button>
    </div>`;
  }).join('');
  el.innerHTML=html;
}

function pratinjauArsip(periode){
  const g=periodeLayakArsip(getPOs(),getInvV(),getInvD()).find(x=>x.periode===periode);
  if(!g){showToast('Periode tidak lagi layak diarsip',true);renderArsipPeriode();return;}
  const r=buildRingkasan(g.pos,g.invvs,g.invds);
  const kb=_arsipKB({po:g.pos,invv:g.invvs,invd:g.invds}),rk=_arsipKB(r);
  const daftarPO=g.pos.map(p=>`<li>${p.no} — ${p.dapur} · ${(p.items||[]).length} item</li>`).join('');
  document.getElementById('arsip-pv-periode').textContent=periode;
  document.getElementById('arsip-pv-body').innerHTML=`
    <div style="padding:9px 11px;background:var(--wbg);border:1px solid var(--wb);border-radius:var(--r);font-size:12px;color:var(--wt);margin-bottom:11px">
      Data dipindah ke dokumen <strong>sims_arsip/${periode}</strong>. Dokumen ditulis dan diverifikasi lebih dulu, baru data dihapus dari dokumen utama — jadi tidak ada yang hilang kalau gagal di tengah.
    </div>
    <div class="r2" style="margin-bottom:10px">
      <div class="fg"><label class="lbl">Dipindah</label><div style="font-family:var(--mn);font-size:13px">${g.pos.length} PO · ${g.invvs.length} invV · ${g.invds.length} invD</div></div>
      <div class="fg"><label class="lbl">Penghematan</label><div style="font-family:var(--mn);font-size:13px">${kb} KB → ${rk} KB <strong style="color:var(--ac)">(−${kb-rk} KB)</strong></div></div>
    </div>
    <div class="ct" style="margin-top:4px">Ringkasan yang akan disimpan</div>
    <div style="overflow-x:auto"><table class="tbl"><tbody>
      <tr><td>Revenue</td><td class="num" style="text-align:right">${fmtF(r.revenue)}</td></tr>
      <tr><td>Modal vendor</td><td class="num" style="text-align:right">${fmtF(r.modal)}</td></tr>
      <tr><td>Ongkir</td><td class="num" style="text-align:right">${fmtF(r.ongkir)}</td></tr>
      <tr><td>Cashback</td><td class="num" style="text-align:right">${fmtF(r.cashback)}</td></tr>
      <tr><td><strong>Profit bersih</strong></td><td class="num" style="text-align:right"><strong>${fmtF(r.profit)}</strong></td></tr>
      <tr><td>Baris konsumsi bahan baku</td><td class="num" style="text-align:right">${r.konsumsi.length}</td></tr>
      <tr><td>Vendor / dapur tercatat</td><td class="num" style="text-align:right">${r.vendors.length} / ${r.dapurs.length}</td></tr>
    </tbody></table></div>
    <div class="ct" style="margin-top:11px">PO yang dipindah</div>
    <ul style="font-size:12px;margin:0;padding-left:18px;color:var(--t2)">${daftarPO}</ul>`;
  document.getElementById('arsip-pv-id').value=periode;
  openModal('modal-arsip-pv');
}

// Urutan wajib: tulis → baca ulang untuk verifikasi → baru hapus dari _cache.
async function jalankanArsip(){
  const periode=document.getElementById('arsip-pv-id').value;
  const g=periodeLayakArsip(getPOs(),getInvV(),getInvD()).find(x=>x.periode===periode);
  if(!g){showToast('Periode tidak lagi layak diarsip',true);return;}
  const last=localStorage.getItem('sims_last_backup');
  const umur=last?(Date.now()-new Date(last))/86400000:999;
  if(umur>1&&!confirm('Backup terakhir '+(last?Math.round(umur)+' hari lalu':'belum pernah')+'.\n\nSangat disarankan backup dulu sebelum memindahkan data finansial.\n\nTetap lanjut tanpa backup baru?'))return;

  const btn=document.getElementById('arsip-pv-btn');
  if(btn){btn.disabled=true;btn.textContent='Mengarsipkan...';}
  try{
    const ringkas=buildRingkasan(g.pos,g.invvs,g.invds);
    const payload={po:g.pos,invv:g.invvs,invd:g.invds,periode,arsip_at:new Date().toISOString()};
    const kb=_arsipKB(payload);

    await db.collection('sims_arsip').doc(periode).set(payload);
    // Verifikasi tulisan benar-benar mendarat sebelum menghapus apa pun
    const cek=await db.collection('sims_arsip').doc(periode).get();
    const d=cek.data();
    if(!cek.exists||(d.po||[]).length!==g.pos.length||(d.invv||[]).length!==g.invvs.length||(d.invd||[]).length!==g.invds.length)
      throw new Error('Verifikasi gagal — dokumen arsip tidak cocok. Tidak ada data yang dihapus.');

    const poIds=new Set(g.pos.map(p=>p.id));
    const vIds=new Set(g.invvs.map(v=>v.id));
    const dIds=new Set(g.invds.map(x=>x.id));
    _cache.po=getPOs().filter(p=>!poIds.has(p.id));
    _cache.invv=getInvV().filter(v=>!vIds.has(v.id));
    _cache.invd=getInvD().filter(x=>!dIds.has(x.id));
    _cache.arsip_ringkas={...getArsipRingkas(),[periode]:ringkas};
    _cache.arsip_idx=[...getArsipIdx().filter(a=>a.periode!==periode),
      {periode,po_cnt:g.pos.length,invv_cnt:g.invvs.length,invd_cnt:g.invds.length,kb,arsip_at:today()}];
    _rc.invalidate();_lookupCache.clear();
    addLog('arsip_periode','Arsipkan periode','sistem','','',periode+' · '+g.pos.length+' PO · '+kb+' KB');
    setBatch({po:_cache.po,invv:_cache.invv,invd:_cache.invd,arsip_ringkas:_cache.arsip_ringkas,arsip_idx:_cache.arsip_idx});
    closeModal('modal-arsip-pv');
    showToast('Periode '+periode+' diarsipkan · '+kb+' KB dipindah');
    renderArsipPeriode();renderDashboard();
  }catch(e){
    console.error('Arsip gagal:',e);
    showToast('Gagal mengarsipkan: '+e.message,true);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Arsipkan sekarang';}
  }
}

// ===== BACA ISI ARSIP =====
const _arsipDocCache={};
async function muatArsipDoc(periode){
  if(_arsipDocCache[periode])return _arsipDocCache[periode];
  const snap=await db.collection('sims_arsip').doc(periode).get();
  if(!snap.exists)return null;
  _arsipDocCache[periode]=snap.data();
  return _arsipDocCache[periode];
}

async function bukaArsipPeriode(periode){
  document.getElementById('arsip-view-periode').textContent=periode;
  document.getElementById('arsip-view-body').innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">Memuat arsip...</div>';
  openModal('modal-arsip-view');
  const d=await muatArsipDoc(periode);
  if(!d){document.getElementById('arsip-view-body').innerHTML='<div class="empty">Dokumen arsip tidak ditemukan</div>';return;}
  const rows=(d.po||[]).map(po=>{
    const ivs=(d.invv||[]).filter(v=>v.po_id===po.id);
    const ids=(d.invd||[]).filter(x=>x.po_id===po.id);
    const rev=ids.reduce((s,x)=>s+(x.total||0),0),mod=ivs.reduce((s,x)=>s+(x.total||0),0);
    return`<tr>
      <td style="font-weight:500">${po.no}</td><td style="font-size:12px">${po.dapur||''}</td>
      <td style="font-family:var(--mn);font-size:11px;color:var(--t3)">${po.date||''}</td>
      <td class="num" style="text-align:right">${(po.items||[]).length}</td>
      <td class="num" style="text-align:right">${fmtF(rev)}</td>
      <td class="num" style="text-align:right">${fmtF(mod)}</td>
      <td><button class="btn bxs" onclick="showDetailArsip('${periode}','${po.id}')">Detail</button></td>
    </tr>`;}).join('');
  document.getElementById('arsip-view-body').innerHTML=`
    <div style="font-size:12px;color:var(--t2);margin-bottom:9px">${(d.po||[]).length} PO · ${(d.invv||[]).length} invoice vendor · ${(d.invd||[]).length} invoice dapur · diarsipkan ${(d.arsip_at||'').substring(0,10)}</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>No PO</th><th>Dapur</th><th>Tanggal</th><th style="text-align:right">Item</th><th style="text-align:right">Revenue</th><th style="text-align:right">Modal</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Detail PO arsip — read-only. PO lama tidak boleh diedit; kalau perlu diubah,
// periode harus dikembalikan dulu ke dokumen utama.
async function showDetailArsip(periode,poId){
  const d=await muatArsipDoc(periode);
  const po=(d?.po||[]).find(p=>p.id===poId);
  if(!po){showToast('PO tidak ditemukan di arsip',true);return;}
  const ivs=(d.invv||[]).filter(v=>v.po_id===poId);
  const ids=(d.invd||[]).filter(x=>x.po_id===poId);
  document.getElementById('arsip-view-periode').textContent=periode+' — '+po.no;
  document.getElementById('arsip-view-body').innerHTML=`
    <button class="btn bxs" style="margin-bottom:10px" onclick="bukaArsipPeriode('${periode}')">← Kembali ke daftar</button>
    <div style="padding:8px 11px;background:var(--ibg);border:1px solid var(--ib);border-radius:var(--r);font-size:12px;color:var(--it);margin-bottom:11px">
      <strong>${po.no}</strong> — ${po.dapur||''} · ${po.date||''} · ${(po.items||[]).length} item · <em>arsip, tidak bisa diedit</em>
    </div>
    <div class="ct">Item</div>
    <div style="overflow-x:auto;max-height:320px;overflow-y:auto"><table class="tbl"><thead><tr><th>Nama</th><th>Kat</th><th style="text-align:right">Qty</th><th>Sat</th><th style="text-align:right">Harga PO</th><th style="text-align:right">Harga vendor</th><th>Vendor</th></tr></thead><tbody>
      ${(po.items||[]).map(i=>`<tr><td>${i.nama||''}</td><td style="font-size:11px">${i.kat||''}</td><td class="num" style="text-align:right">${i.qty||0}</td><td style="font-size:11px">${i.satuan||''}</td><td class="num" style="text-align:right">${fmtF(i.harga_po||0)}</td><td class="num" style="text-align:right">${fmtF(i.harga_vendor||0)}</td><td style="font-size:11px">${i.vendor||''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="ct" style="margin-top:11px">Invoice vendor (${ivs.length})</div>
    <div style="overflow-x:auto"><table class="tbl"><tbody>${ivs.map(v=>`<tr><td style="font-weight:500">${v.no}</td><td style="font-size:12px">${v.vendor||''}</td><td style="font-family:var(--mn);font-size:11px">${v.tgl||''}</td><td class="num" style="text-align:right">${fmtF(v.total||0)}</td></tr>`).join('')||'<tr><td>—</td></tr>'}</tbody></table></div>
    <div class="ct" style="margin-top:11px">Invoice dapur (${ids.length})</div>
    <div style="overflow-x:auto"><table class="tbl"><tbody>${ids.map(x=>`<tr><td style="font-weight:500">${x.no}</td><td style="font-size:12px">${x.dapur||''}</td><td style="font-family:var(--mn);font-size:11px">${x.tgl||''}</td><td class="num" style="text-align:right">${fmtF(x.total||0)}</td></tr>`).join('')||'<tr><td>—</td></tr>'}</tbody></table></div>`;
}
