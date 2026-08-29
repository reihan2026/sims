// ===== CONSTANTS =====
const DEFAULT_CATS=['Daging','Sayur','Buah','Bumbu','Telur','Beras','UMKM','Others'];
function getCats(){const m=getMaster();return(m.kategori&&m.kategori.length)?m.kategori:DEFAULT_CATS;}
function getCatOpts(selected=''){return['<option value="">—</option>',...getCats().map(c=>`<option value="${c}"${c===selected?' selected':''}>${c}</option>`)].join('');}
// ===== UTILS =====
const today=()=>new Date().toISOString().split('T')[0];
const uid=()=>'ID'+Date.now()+Math.floor(Math.random()*9999);
// Kode permanen untuk item PO (lihat js/data.js — backfill saat data dimuat).
// Pakai counter, bukan cuma random seperti uid() — backfill bisa menandai
// ratusan item dalam satu tick sinkron (Date.now() sama persis), dan ruang
// random uid() (0-9998) cukup kecil untuk bentrok di volume segitu.
let _itemIdCtr=0;
const _newItemId=()=>{_itemIdCtr++;return'IT'+Date.now().toString(36)+_itemIdCtr.toString(36);};
// Nama item invoice bisa berisi baris tambahan / badge ⚠✕ — ambil nama dasarnya saja
const baseNama=n=>(n||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
const fmt=n=>{n=Math.round(n||0);if(Math.abs(n)>=1e9)return'Rp '+(n/1e9).toFixed(2)+'M';if(Math.abs(n)>=1e6)return'Rp '+(n/1e6).toFixed(1)+'jt';return'Rp '+n.toLocaleString('id-ID')};
const fmtF=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
const _BULAN={'Januari':1,'Februari':2,'Maret':3,'April':4,'Mei':5,'Juni':6,'Juli':7,'Agustus':8,'September':9,'Oktober':10,'November':11,'Desember':12};
function parseDeadline(tgl){
  if(!tgl)return null;
  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(tgl))return tgl;
  // Format: "Senin, 3 Mei 2026" or "3 Mei 2026"
  const m=tgl.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if(m){const bln=_BULAN[m[2]];if(bln)return m[3]+'-'+String(bln).padStart(2,'0')+'-'+m[1].padStart(2,'0');}
  return null;
}
const diffDays=tgl=>{const p=parseDeadline(tgl);return p?Math.ceil((new Date(p)-new Date(today()))/(864e5)):null;};

function poTotals(po){
  let tp=0,tv=0,tpAll=0,wv=0;
  po.items.forEach(i=>{
    tpAll+=(i.qty||0)*(i.harga_po||0);
    if(i.harga_vendor>0){
      tp+=(i.qty||0)*(i.harga_po||0);
      tv+=(i.qty||0)*(i.harga_vendor||0);
      wv++;
    }
  });
  // Use cached ongkir map instead of re-scanning all invV
  _rc._build();
  const totalOngkir=_rc._ongkirMap.get(po.id)||0;
  return{tp:tpAll,tv,margin:tp-tv-totalOngkir,tpFilled:tp,wv,total:po.items.length,ongkir:totalOngkir};
}

// ===== RENDER CACHE =====
// Computed once per render cycle, invalidated on data change
// Avoids O(n²) re-computation inside loops
const _rc={
  _ptSet:null,     // Set of passthrough invV ids
  _netMap:null,    // Map of invV.id → invVNet result
  _valid:false,

  invalidate(){this._ptSet=null;this._netMap=null;this._ongkirMap=null;this._valid=false;},

  _build(){
    if(this._valid)return;
    const invDs=getInvD();const invVs=getInvV();
    // Build passthrough set — O(n) once
    this._ptSet=new Set(invDs.filter(d=>d.type==='passthrough'&&d.pt_inv_id).map(d=>d.pt_inv_id));
    // Build net map — O(n) once
    this._netMap=new Map();
    invVs.forEach(iv=>{
      const paid=(iv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
      const retur=(iv.returs||[]).reduce((s,r)=>s+r.val,0);
      const cb=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
      const ongkir=iv.ongkir||0;
      const netTotal=Math.max(0,iv.total-retur);
      this._netMap.set(iv.id,{paid,retur,cb,ongkir,netTotal,sisa:Math.max(0,netTotal-paid)});
    });
    // Build ongkir-per-PO map — O(n) once (used by poTotals)
    this._ongkirMap=new Map();
    invVs.forEach(iv=>{
      const cur=this._ongkirMap.get(iv.po_id)||0;
      this._ongkirMap.set(iv.po_id,cur+(iv.ongkir||0));
    });
    this._valid=true;
  },

  isPassthrough(invVId){this._build();return this._ptSet.has(invVId);},
  net(iv){this._build();return this._netMap.get(iv.id)||invVNet_compute(iv);}
};

// Raw compute (fallback, used by _rc internally on cache miss)
function invVNet_compute(iv){
  const paid=(iv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
  const retur=(iv.returs||[]).reduce((s,r)=>s+r.val,0);
  const cb=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
  const ongkir=iv.ongkir||0;
  const netTotal=Math.max(0,iv.total-retur);
  return{paid,retur,cb,ongkir,netTotal,sisa:Math.max(0,netTotal-paid)};
}

// Public API — these are what the rest of the code calls
function invVNet(iv){return _rc.net(iv);}
function isPassthrough(invVId){return _rc.isPassthrough(invVId);}
function catBadge(cat){return cat?`<span class="cat-badge cat-${cat}">${cat}</span>`:'';}
function tipeTag(t){return t==='bulk'?'<span class="tag ttl">Bulk</span>':'<span class="tag twn">Fresh</span>';}
function jenisBadge(j){return j==='operasional'?'<span class="tag tpu" style="font-size:9px">Operasional</span>':'<span class="tag tin" style="font-size:9px">Bahan Baku</span>';}
function statusIcon(allDone,hasWarn){
  if(allDone)return`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#2D5A3D"/><path d="M5 8l2 2 4-4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(hasWarn)return`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#7A5B0A"/><text x="8" y="12" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">!</text></svg>`;
  return`<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#D8D3C8"/><path d="M8 5v3M8 10v1" stroke="#6B6560" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
function getRekNama(id){return getReks().find(r=>r.id===id)?.nama||'—';}
function hasCashback(vendorNama){
  const vObj=getVendorObj(vendorNama);
  if(vObj?.cashback)return true;
  // Fallback: check if vendor has any cashback history in invoices
  return getInvV().some(iv=>iv.vendor===vendorNama&&(iv.cashbacks||[]).length>0);
}
function getVendorObj(nama){
  if(!nama)return null;
  const m=getMaster();
  // Exact match first
  const exact=m.vendor.find(v=>v.nama===nama);if(exact)return exact;
  // Case-insensitive fallback
  return m.vendor.find(v=>v.nama.toLowerCase()===nama.toLowerCase())||null;
}
function showToast(msg,err){const t=document.getElementById('toast');t.textContent=msg;t.style.background=err?'var(--dn)':'var(--tx)';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400);}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('overlay').classList.toggle('show');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('show');}

// Populate rekening select — show inline add if empty
function populateRek(selId,emptyId='',selectedId=''){
  const reks=getReks();const el=document.getElementById(selId);if(!el)return;
  el.innerHTML='<option value="">— Pilih rekening —</option>'+reks.map(r=>`<option value="${r.id}" ${r.id===selectedId?'selected':''}>${r.nama}${r.pj?' ('+r.pj+')':''}</option>`).join('');
  if(emptyId){const ew=document.getElementById(emptyId);if(ew)ew.style.display=reks.length===0?'block':'none';}
}
// Add rekening inline without leaving modal
function inlineAddRek(targetSelId){
  const nama=prompt('Nama rekening baru:');if(!nama||!nama.trim())return;
  const pj=prompt('Penanggung jawab (boleh kosong):');
  const reks=getReks();const r={id:uid(),nama:nama.trim(),pj:(pj||'').trim(),no:'',pengembalian:[]};
  reks.push(r);setReks(reks);
  populateRek(targetSelId,'',r.id);
  const emptyId=targetSelId==='bayar-invv-rek'?'bayar-invv-rek-empty':targetSelId==='terima-rek'?'terima-rek-empty':'';
  if(emptyId){const ew=document.getElementById(emptyId);if(ew)ew.style.display='none';}
  renderMaster();renderRekening();showToast('Rekening ditambahkan');
}

// ===== NAVIGATION =====
const PAGES=['dash','po-baru','daftar-po','detail-po','pov','inv-vendor','inv-dapur','arsip-nota','cashflow','rekening','konsumsi','laporan-keu','master'];
function nav(name){
  _currentPage=name; // track for real-time re-render
  PAGES.forEach(p=>{const el=document.getElementById('page-'+p);if(el)el.classList.toggle('active',p===name);});
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  const MAP={dash:0,'po-baru':1,'daftar-po':2,pov:3,'inv-vendor':4,'inv-dapur':5,'arsip-nota':6,cashflow:7,rekening:8,konsumsi:9,'laporan-keu':10,master:11};
  const i=MAP[name];if(i!==undefined)document.querySelectorAll('.ni')[i]?.classList.add('active');
  closeSidebar();closeStatPopup();
  renderPOShortcut();
  if(name==='dash')renderDashboard();
  if(name==='daftar-po')renderDaftar();
  if(name==='inv-vendor')renderInvV();
  if(name==='inv-dapur')renderInvD();
  if(name==='arsip-nota')renderArsipNota();
  if(name==='cashflow')renderCashflow();
  if(name==='rekening')renderRekening();
  if(name==='pov')renderPOV();
  if(name==='konsumsi')renderKonsumsi();
  if(name==='laporan-keu')renderLaporanKeu();
  if(name==='master'){renderMaster();initUserProfile();renderUsersAdmin();_logShowAll=false;renderLog();renderArsipPeriode();}
  if(name==='po-baru')initPOForm();
  _pushNavState();
  renderBackBtn();
}

// ===== RIWAYAT NAVIGASI — back seperti di browser =====
// Satu-satunya pintu masuk perpindahan halaman adalah nav(); showDetail() pun
// berakhir di nav('detail-po'). Jadi cukup rekam {page, poId} di History API —
// tombol back browser & swipe-back di HP otomatis ikut jalan.
let _navRestoring=false; // true saat popstate memulihkan view — jangan push ulang
let _navDepth=0;         // berapa langkah masih bisa mundur di dalam app

// Kedalaman disimpan DI DALAM state (i), bukan dihitung dari arah gerak: popstate
// menyala untuk back maupun forward, jadi menaik/menurunkan counter sendiri salah.
function _navState(i){return{page:_currentPage,poId:_currentPage==='detail-po'?_currentPoId:null,i:i};}

function _pushNavState(){
  if(_navRestoring)return; // popstate yang menyetir — history sudah bergerak sendiri
  const prev=history.state;
  const poId=_currentPage==='detail-po'?_currentPoId:null;
  // Navigasi ke view yang sama (mis. showDetail dipanggil ulang setelah simpan)
  // tidak boleh menambah langkah back
  if(prev&&prev.page===_currentPage&&prev.poId===poId){history.replaceState(_navState(prev.i??_navDepth),'',location.href);return;}
  _navDepth=(prev&&typeof prev.i==='number'?prev.i:_navDepth)+1;
  history.pushState(_navState(_navDepth),'',location.href);
}

function initNavHistory(){
  _navDepth=0;
  history.replaceState(_navState(0),'',location.href);
  window.addEventListener('popstate',e=>{
    // Modal terbuka → back menutupnya dulu, bukan pindah halaman
    const openModal=document.querySelector('.modal-bg.open');
    if(openModal){
      openModal.classList.remove('open');
      history.pushState(_navState(_navDepth),'',location.href); // ganti langkah yang barusan terpakai
      return;
    }
    const st=e.state;
    if(!st||!st.page)return;
    _navDepth=typeof st.i==='number'?st.i:0;
    _navRestoring=true;
    try{
      if(st.page==='detail-po'&&st.poId)showDetail(st.poId);
      else nav(st.page);
    }finally{_navRestoring=false;}
    renderBackBtn();
  });
  renderBackBtn();
}

function goBack(){history.back();}

// Tombol back dipindah-pindahkan ke header halaman yang sedang aktif
function renderBackBtn(){
  let btn=document.getElementById('nav-back');
  if(!btn){
    btn=document.createElement('button');
    btn.id='nav-back';btn.className='btn bgh bsm';btn.type='button';
    btn.title='Kembali ke halaman sebelumnya';
    btn.onclick=goBack;
    btn.innerHTML='<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
  }
  if(_navDepth<1){btn.remove();return;} // belum ada tujuan mundur — sembunyikan
  const ph=document.querySelector('#page-'+_currentPage+' .ph');
  if(!ph)return;
  if(ph.firstElementChild!==btn)ph.prepend(btn);
  // Dorong blok aksi tetap di kanan, judul merapat ke tombol back
  const title=btn.nextElementSibling;
  if(title)title.style.marginRight='auto';
}
