// ===== PO KE VENDOR =====
let _buatPOVSourceId=null;

function openBuatPOV(poId){
  const po=getPOs().find(p=>p.id===poId);if(!po)return;
  _buatPOVSourceId=poId;
  document.getElementById('bpov-po-info').innerHTML=`<strong>${po.no}</strong> — ${po.dapur} &nbsp;·&nbsp; ${po.date} &nbsp;·&nbsp; ${po.items.length} item`;
  document.getElementById('bpov-tgl').value=today();
  document.getElementById('bpov-cat').value='';
  // Populate vendor dropdown
  const vendors=getMaster().vendor||[];
  document.getElementById('bpov-vendor').innerHTML='<option value="">— Pilih vendor —</option>'+vendors.map(v=>`<option value="${v.nama}">${v.nama}${v.hp?' ('+v.hp+')':''}</option>`).join('');
  document.getElementById('bpov-vendor-hp').textContent='';
  bpovRenderItems(po,'');
  openModal('modal-buat-pov');
}

function bpovVendorChange(){
  const vendorNama=document.getElementById('bpov-vendor').value;
  const v=getMaster().vendor.find(x=>x.nama===vendorNama);
  document.getElementById('bpov-vendor-hp').textContent=v?.hp?'HP: '+v.hp:'';
  const po=getPOs().find(p=>p.id===_buatPOVSourceId);if(!po)return;
  bpovRenderItems(po,vendorNama);
}

function bpovRenderItems(po,vendorNama){
  const el=document.getElementById('bpov-items');
  if(!aktifItems(po).length){el.innerHTML='<div class="empty">PO ini tidak punya item</div>';return;}
  // idx tetap idx asli di po.items — checkbox id 'bpov-item-<idx>' dibaca ulang
  // lewat idx yang sama di saveBPOV, jadi item batal cukup tidak dirender.
  el.innerHTML=po.items.map((item,idx)=>{
    if(item.batal)return'';
    const precheck=vendorNama&&item.vendor===vendorNama;
    const deadline=item.deadline?` · deadline ${item.deadline}`:'';
    const kat=item.kat?`<span class="tag tgr" style="font-size:9px">${item.kat}</span> `:'';
    const cari=((item.nama||'')+' '+(item.spek||'')).toLowerCase().replace(/"/g,'&quot;');
    return`<label class="bpov-row" data-kat="${(item.kat||'').replace(/"/g,'&quot;')}" data-cari="${cari}" style="display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:1px solid var(--bd);cursor:pointer">
      <input type="checkbox" id="bpov-item-${idx}" ${precheck?'checked':''} onchange="updateBPOVCount()" style="margin-top:2px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${kat}${item.nama}</div>
        <div style="font-size:11px;color:var(--t2);font-family:var(--mn)">${item.qty} ${item.satuan}${deadline}</div>
        ${item.spek?`<div style="font-size:10px;color:var(--t3)">${item.spek}</div>`:''}
      </div>
    </label>`;
  }).join('');
  // Filter kategori — hanya berguna kalau PO punya lebih dari satu kategori
  const katF=document.getElementById('bpov-kat-filter');
  if(katF){
    const kats=[...new Set(aktifItems(po).map(i=>i.kat).filter(Boolean))].sort();
    katF.innerHTML='<option value="">Semua kategori</option>'+kats.map(k=>`<option value="${k}">${k}</option>`).join('');
    katF.style.display=kats.length>1?'':'none';
    katF.value='';
  }
  const srch=document.getElementById('bpov-srch');if(srch)srch.value='';
  filterBPOVItems();
}

// Sembunyikan baris lewat style.display — JANGAN render ulang. savePOV membaca
// checkbox `bpov-item-${idx}` untuk semua item PO, jadi baris yang dibuang dari
// DOM akan menghilangkan centangnya tanpa disadari.
function filterBPOVItems(){
  const q=(document.getElementById('bpov-srch')?.value||'').toLowerCase().trim();
  const kat=document.getElementById('bpov-kat-filter')?.value||'';
  document.querySelectorAll('#bpov-items .bpov-row').forEach(row=>{
    const cocok=(!kat||row.dataset.kat===kat)&&(!q||(row.dataset.cari||'').includes(q));
    row.style.display=cocok?'flex':'none';
  });
  updateBPOVCount();
}

function updateBPOVCount(){
  const el=document.getElementById('bpov-count');if(!el)return;
  const rows=[...document.querySelectorAll('#bpov-items .bpov-row')];
  const terlihat=rows.filter(r=>r.style.display!=='none');
  const dipilih=rows.filter(r=>r.querySelector('input[type=checkbox]')?.checked);
  const tersembunyi=dipilih.filter(r=>r.style.display==='none').length;
  let t='· '+dipilih.length+' dipilih';
  if(terlihat.length!==rows.length)t+=' · tampil '+terlihat.length+'/'+rows.length;
  // Pilihan di luar filter tetap ikut tersimpan — beri tahu supaya tidak mengagetkan
  if(tersembunyi)t+=' · '+tersembunyi+' pilihan di luar filter';
  el.textContent=t;
}

// Hanya baris yang sedang tampil — "Pilih semua" saat filter aktif berarti
// semua item pada filter itu, bukan seluruh PO.
function bpovCheckAll(checked){
  document.querySelectorAll('#bpov-items .bpov-row').forEach(row=>{
    if(row.style.display==='none')return;
    const cb=row.querySelector('input[type=checkbox]');if(cb)cb.checked=checked;
  });
  updateBPOVCount();
}

function savePOV(mode){
  const vendorNama=document.getElementById('bpov-vendor').value;
  if(!vendorNama){showToast('Pilih vendor dulu!',true);return;}
  const po=getPOs().find(p=>p.id===_buatPOVSourceId);if(!po)return;
  const selectedItems=po.items.map((item,idx)=>({item,idx,checked:document.getElementById('bpov-item-'+idx)?.checked})).filter(x=>x.checked).map(x=>({nama:x.item.nama,qty:x.item.qty,satuan:x.item.satuan,spek:x.item.spek||'',deadline:x.item.deadline||'',kat:x.item.kat||'',hari:x.item.hari||''}));
  if(!selectedItems.length){showToast('Pilih minimal 1 item!',true);return;}
  const v=getMaster().vendor.find(x=>x.nama===vendorNama);
  const no='POV-'+today().substring(0,4)+'-'+nextCtrPOV();
  const pov={id:uid(),no,tgl:document.getElementById('bpov-tgl').value||today(),po_id:po.id,po_no:po.no,dapur:po.dapur,vendor:vendorNama,vendor_hp:v?.hp||'',catatan:document.getElementById('bpov-cat').value.trim(),items:selectedItems,created:new Date().toISOString()};
  const povs=getPOVs();povs.push(pov);setPOVs(povs);
  addLog('buat_pov','Buat PO ke Vendor','pov',pov.id,pov.no,vendorNama+' · '+selectedItems.length+' item');
  closeModal('modal-buat-pov');
  showToast('PO ke vendor disimpan: '+no);
  if(mode==='pdf')printPOV(pov);
  if(mode==='wa')openWAPOV(pov);
}

function renderPOV(){
  const fVendor=document.getElementById('pov-f-vendor')?.value||'';
  const fBulan=document.getElementById('pov-f-bulan')?.value||'';
  const all=getPOVs();
  // Populate filters
  const vendors=[...new Set(all.map(p=>p.vendor).filter(Boolean))].sort();
  const bulans=[...new Set(all.map(p=>(p.tgl||'').substring(0,7)).filter(Boolean))].sort().reverse();
  const curV=document.getElementById('pov-f-vendor')?.value||'';
  const curB=document.getElementById('pov-f-bulan')?.value||'';
  document.getElementById('pov-f-vendor').innerHTML='<option value="">Semua vendor</option>'+vendors.map(v=>`<option value="${v}" ${v===curV?'selected':''}>${v}</option>`).join('');
  document.getElementById('pov-f-bulan').innerHTML='<option value="">Semua bulan</option>'+bulans.map(b=>`<option value="${b}" ${b===curB?'selected':''}>${_fmtBulan(b)}</option>`).join('');
  const list=all.filter(p=>{
    if(fVendor&&p.vendor!==fVendor)return false;
    if(fBulan&&!(p.tgl||'').startsWith(fBulan))return false;
    return true;
  }).sort((a,b)=>b.created>a.created?1:-1);
  const el=document.getElementById('pov-list');
  if(!list.length){el.innerHTML='<div class="empty" style="padding:30px">Belum ada PO ke vendor</div>';return;}
  el.innerHTML=list.map(p=>`
    <div class="card" style="margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:600;font-size:13px;font-family:var(--mn)">${p.no}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">${p.vendor}${p.vendor_hp?' · <span style="font-family:var(--mn)">' +p.vendor_hp+'</span>':''}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${p.tgl} · dari PO ${p.po_no} (${p.dapur}) · ${p.items.length} item</div>
          ${p.catatan?`<div style="font-size:11px;color:var(--wt);margin-top:3px">📝 ${p.catatan}</div>`:''}
        </div>
        <div class="bg">
          <button class="btn bsm bi" onclick="viewPOV('${p.id}')">Lihat</button>
          <button class="btn bsm bi" onclick="printPOV(getPOVs().find(x=>x.id==='${p.id}'))">PDF</button>
          ${p.vendor_hp?`<button class="btn bsm" style="background:#25D366;color:#fff;border-color:#25D366" onclick="openWAPOV(getPOVs().find(x=>x.id==='${p.id}'))">WA</button>`:''}
        </div>
      </div>
      <div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:5px">
        ${p.items.map(i=>`<span class="tag tgr">${i.nama} <span style="font-family:var(--mn);font-weight:400">${i.qty} ${i.satuan}</span></span>`).join('')}
      </div>
    </div>`).join('');
}

function viewPOV(id){
  const pov=getPOVs().find(p=>p.id===id);if(!pov)return;
  document.getElementById('vpov-title').textContent=pov.no+' — '+pov.vendor;
  document.getElementById('vpov-body').innerHTML=`
    <div class="mg" style="margin-bottom:12px">
      <div class="met"><div class="ml">No. PO</div><div class="mv num" style="font-size:14px">${pov.no}</div></div>
      <div class="met"><div class="ml">Vendor</div><div class="mv" style="font-size:13px">${pov.vendor}</div>${pov.vendor_hp?`<div class="ms">${pov.vendor_hp}</div>`:''}</div>
      <div class="met"><div class="ml">Tanggal</div><div class="mv" style="font-size:13px">${pov.tgl}</div></div>
      <div class="met"><div class="ml">Dari PO</div><div class="mv" style="font-size:13px">${pov.po_no}</div><div class="ms">${pov.dapur}</div></div>
    </div>
    ${getMaster().catatan_vendor?`<div style="background:var(--wbg);border:1px solid var(--wb);border-radius:var(--r);padding:8px 12px;font-size:12px;margin-bottom:8px;color:var(--wt)"><strong>Catatan baku:</strong> ${getMaster().catatan_vendor}</div>`:''}
    ${pov.catatan?`<div style="background:var(--wbg);border:1px solid var(--wb);border-radius:var(--r);padding:8px 12px;font-size:12px;margin-bottom:12px">📝 ${pov.catatan}</div>`:''}
    <table class="tbl">
      <thead><tr><th>#</th><th>Nama item</th><th>Kategori</th><th>Spesifikasi</th><th>Qty</th><th>Satuan</th><th>Deadline</th></tr></thead>
      <tbody>${pov.items.map((it,i)=>`<tr><td style="color:var(--t3)">${i+1}</td><td style="font-weight:500">${it.nama}</td><td>${it.kat?`<span class="tag tgr">${it.kat}</span>`:'—'}</td><td style="font-size:11px;color:var(--t2)">${it.spek||'—'}</td><td class="num-cell">${it.qty}</td><td style="font-family:var(--mn);font-size:11px">${it.satuan}</td><td style="font-family:var(--mn);font-size:11px">${it.deadline||'—'}</td></tr>`).join('')}</tbody>
    </table>`;
  document.getElementById('vpov-pdf-btn').onclick=()=>printPOV(pov);
  document.getElementById('vpov-wa-btn').style.display=pov.vendor_hp?'':'none';
  document.getElementById('vpov-wa-btn').onclick=()=>openWAPOV(pov);
  document.getElementById('vpov-del-btn').onclick=()=>deletePOV(id);
  openModal('modal-view-pov');
}

function deletePOV(id){
  if(!confirm('Hapus PO ke vendor ini?'))return;
  setPOVs(getPOVs().filter(p=>p.id!==id));
  closeModal('modal-view-pov');
  renderPOV();
  showToast('PO ke vendor dihapus');
}

function _povItemRows(items){
  return items.map((it,i)=>`<tr><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;color:#888;font-size:11px">${i+1}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;font-weight:600">${it.nama}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;font-size:11px;color:#666">${it.kat||'—'}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;font-size:11px;color:#666;max-width:160px">${it.spek||'—'}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;text-align:right;font-family:monospace;font-weight:600">${it.qty}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;font-size:11px">${it.satuan}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;font-size:11px;font-family:monospace">${it.deadline||'—'}</td><td style="padding:6px 8px;border-bottom:1px solid #e0ddd6;text-align:center;color:#aaa;font-size:11px">__________</td></tr>`).join('');
}

function printPOV(pov){
  if(!pov)return;
  const _catBaku=getMaster().catatan_vendor||'';
  const _dapurInfo=getDapurInfo(pov.dapur);
  const _dapurNama=_dapurInfo.nama||pov.dapur;
  const body=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div><div style="font-size:22px;font-weight:700;color:#1E4029">PURCHASE ORDER</div><div style="font-size:12px;color:#666;margin-top:2px">SIMS — Sistem Internal Manajemen Suplai</div></div>
      <div style="text-align:right;font-size:12px"><div style="font-size:16px;font-weight:700;font-family:monospace">${pov.no}</div><div style="color:#666">Tanggal: ${pov.tgl}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;padding:14px;background:#f8f7f4;border-radius:6px;border:1px solid #e0ddd6">
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:4px">Kepada (Vendor)</div><div style="font-weight:700;font-size:14px">${pov.vendor}</div>${pov.vendor_hp?`<div style="font-size:12px;color:#666;font-family:monospace">${pov.vendor_hp}</div>`:''}</div>
      <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:4px">Untuk Dapur</div><div style="font-weight:600;font-size:13px">${_dapurNama}</div><div style="font-size:11px;color:#666">Dari PO: ${pov.po_no}</div></div>
    </div>
    ${_catBaku?`<div style="background:#FFF8E7;border:1px solid #D4B870;border-radius:4px;padding:9px 12px;font-size:12px;margin-bottom:8px;color:#5C4508"><strong>Catatan:</strong> ${_catBaku}</div>`:''}
    ${pov.catatan?`<div style="background:#FFF8E7;border:1px solid #D4B870;border-radius:4px;padding:9px 12px;font-size:12px;margin-bottom:16px;color:#5C4508"><strong>Catatan tambahan:</strong> ${pov.catatan}</div>`:''}
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#2D5A3D;color:#fff"><th style="padding:8px;text-align:left">No</th><th style="padding:8px;text-align:left">Nama Item</th><th style="padding:8px;text-align:left">Kategori</th><th style="padding:8px;text-align:left">Spesifikasi</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:left">Satuan</th><th style="padding:8px;text-align:left">Deadline</th><th style="padding:8px;text-align:center">Harga/unit</th></tr></thead>
      <tbody>${_povItemRows(pov.items)}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px">
      <div style="text-align:center"><div style="font-size:11px;color:#888;margin-bottom:40px">Dibuat oleh</div><div style="border-top:1px solid #333;padding-top:6px;font-size:11px">Tanggal: ___________</div></div>
      <div style="text-align:center"><div style="font-size:11px;color:#888;margin-bottom:40px">Disetujui vendor</div><div style="border-top:1px solid #333;padding-top:6px;font-size:11px">Tanggal: ___________</div></div>
    </div>`;
  const css=`body{font-family:'Helvetica Neue',Arial,sans-serif;margin:30px;color:#1a1814}@media print{@page{margin:20mm}}`;
  const w=window.open('','_blank','width=820,height=720');
  w.document.write(`<!DOCTYPE html><html><head><title>${pov.no}</title><style>${css}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function waTextPOV(pov){
  const lines=pov.items.map((it,i)=>`${i+1}. ${it.nama} — ${it.qty} ${it.satuan}${it.deadline?' (deadline '+it.deadline+')':''}${it.spek?' | Spek: '+it.spek:''}`).join('\n');
  const catBaku=getMaster().catatan_vendor||'';
  const catatan=(catBaku?'\n\n⚠️ '+catBaku:'')+(pov.catatan?'\n\n📝 '+pov.catatan:'');
  const dapurNama=getDapurInfo(pov.dapur).nama||pov.dapur;
  return`Halo ${pov.vendor},\n\nBerikut Purchase Order dari dapur *${dapurNama}*:\n\n${lines}${catatan}\n\nNo. PO: *${pov.no}*\nTanggal: ${pov.tgl}\n\nMohon konfirmasi ketersediaan dan harga.\nTerima kasih 🙏`;
}

function openWAPOV(pov){
  if(!pov)return;
  const hp=(pov.vendor_hp||'').replace(/[^0-9]/g,'').replace(/^0/,'62');
  const text=encodeURIComponent(waTextPOV(pov));
  window.open(`https://wa.me/${hp}?text=${text}`,'_blank');
}

// ===== VENDOR MILIK SAYA =====
function renderVendorSaya(){renderMaster();}
function openModalVendorSaya(id){
  const vs=id?getVendorSaya().find(v=>v.id===id):null;
  document.getElementById('vs-modal-title').textContent=vs?'Edit Vendor Mitra':'Tambah Vendor Mitra';
  document.getElementById('vs-edit-id').value=id||'';
  document.getElementById('vs-nama').value=vs?.nama||'';
  document.getElementById('vs-telp').value=vs?.telp||'';
  document.getElementById('vs-alamat').value=vs?.alamat||'';
  document.getElementById('vs-kop-layout').value=vs?.kop_layout||'kiri';
  document.getElementById('vs-kop-warna').value=vs?.kop_warna||'default';
  document.getElementById('vs-kop-logo-pos').value=vs?.kop_logo_pos||'kiri';
  const _sz=vs?.kop_logo_size||80;
  document.getElementById('vs-kop-logo-size').value=_sz;
  document.getElementById('vs-kop-size-val').textContent=_sz+'px';
  document.getElementById('vs-kop-teks').value=vs?.kop_teks||'full';
  // Rekening rows
  const wrap=document.getElementById('vs-rekening-wrap');
  wrap.innerHTML='';
  (vs?.rekening||[{bank:'',no:'',atas:''}]).forEach(r=>wrap.insertAdjacentHTML('beforeend',vsRekRow(r.bank,r.no,r.atas)));
  // Kop image
  const prev=document.getElementById('vs-kop-preview');
  const img=document.getElementById('vs-kop-img');
  const delBtn=document.getElementById('vs-kop-del');
  const fileInput=document.getElementById('vs-kop-file');
  fileInput.value='';
  if(vs?.id){
    const existing=getFile('kop_'+vs.id);
    if(existing){img.src=existing;prev.style.display='block';delBtn.style.display='';}
    else{prev.style.display='none';delBtn.style.display='none';}
  } else {prev.style.display='none';delBtn.style.display='none';}
  // Paraf: file di sims_files/paraf_<id>; vs.paraf_ada menandai ada/tidaknya
  _vsParafNew=null;_vsParafDel=false;
  document.getElementById('vs-paraf-file').value='';
  _vsParafShow(null);
  if(vs?.id&&vs.paraf_ada){
    const cached=getFile('paraf_'+vs.id);
    if(cached)_vsParafShow(cached);
    else{
      const ld=document.getElementById('vs-paraf-loading');ld.style.display='';ld.textContent='Memuat paraf…';
      loadFile('paraf_'+vs.id).then(d=>{
        // Modal bisa sudah ditutup / ganti vendor / user sudah pilih paraf baru
        if(document.getElementById('vs-edit-id').value!==vs.id||_vsParafNew||_vsParafDel)return;
        ld.style.display='none';
        if(d){_vsParafShow(d);renderVsPreview();}
        else{ld.style.display='';ld.textContent='⚠ Paraf tersimpan gagal dimuat (cek koneksi). Biarkan saja agar tetap tersimpan, atau unggah ulang.';}
      });
    }
  }
  renderVsPreview();
  openModal('modal-vendor-saya');
}
let _vsParafNew=null,_vsParafDel=false;
function _vsParafShow(src){
  const prev=document.getElementById('vs-paraf-preview'),img=document.getElementById('vs-paraf-img');
  document.getElementById('vs-paraf-loading').style.display='none';
  const bg=document.getElementById('vs-paraf-bg');
  if(src){img.src=src;prev.style.display='block';document.getElementById('vs-paraf-del').style.display='';if(bg)bg.style.display='';}
  else{img.removeAttribute('src');prev.style.display='none';document.getElementById('vs-paraf-del').style.display='none';if(bg)bg.style.display='none';}
}
function previewVsParaf(input){
  const f=input.files[0];if(!f)return;
  if(!/^image\//.test(f.type)){showToast('Paraf harus berupa gambar (PNG/JPG)',true);input.value='';return;}
  const r=new FileReader();
  r.onload=e=>{
    // Perkecil & tetap PNG (transparansi terjaga) supaya file kecil di sims_files
    const probe=new Image();
    probe.onload=async()=>{
      const small=await _resizeImageForPrint(e.target.result,600,240);
      const out=await _parafTransparan(small);
      _vsParafNew=out;_vsParafDel=false;_vsParafShow(out);renderVsPreview();
    };
    probe.onerror=()=>{showToast('Gambar paraf tidak bisa dibaca — coba file lain',true);input.value='';};
    probe.src=e.target.result;
  };
  r.onerror=()=>{showToast('Gagal membaca file paraf',true);input.value='';};
  r.readAsDataURL(f);
}
// Buang latar paraf: warna latar ditaksir dari tepi gambar (putih/kertas/abu foto),
// piksel yang mirip latar → transparan (tepi dihaluskan), lalu potong margin kosong.
// Gambar yang tepinya sudah transparan dibiarkan apa adanya.
function _parafTransparan(dataUrl){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const W=img.width,H=img.height;if(!W||!H){resolve(dataUrl);return;}
        const c=document.createElement('canvas');c.width=W;c.height=H;
        const g=c.getContext('2d');g.drawImage(img,0,0);
        const id=g.getImageData(0,0,W,H),d=id.data;
        // Sampel tepi (bingkai 3px)
        const rs=[],gs=[],bs=[];let transp=0,n=0;
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          if(x>2&&x<W-3&&y>2&&y<H-3)continue;
          const i=(y*W+x)*4;n++;
          if(d[i+3]<128){transp++;continue;}
          rs.push(d[i]);gs.push(d[i+1]);bs.push(d[i+2]);
        }
        if(transp>n*0.5||!rs.length){resolve(dataUrl);return;} // sudah transparan
        const med=a=>{a.sort((p,q)=>p-q);return a[a.length>>1];};
        const br=med(rs),bgc=med(gs),bb=med(bs);
        const LO=28,HI=80; // jarak warna: <LO = latar, >HI = tinta, di antaranya halus
        let minX=W,minY=H,maxX=-1,maxY=-1;
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          const i=(y*W+x)*4;
          const dist=Math.max(Math.abs(d[i]-br),Math.abs(d[i+1]-bgc),Math.abs(d[i+2]-bb));
          let a=dist<=LO?0:dist>=HI?1:(dist-LO)/(HI-LO);
          d[i+3]=Math.round(d[i+3]*a);
          if(d[i+3]>40){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
        }
        if(maxX<0){resolve(dataUrl);return;} // tidak ada coretan terdeteksi → jangan hapus semua
        g.putImageData(id,0,0);
        const pad=6;minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(W-1,maxX+pad);maxY=Math.min(H-1,maxY+pad);
        const o=document.createElement('canvas');o.width=maxX-minX+1;o.height=maxY-minY+1;
        o.getContext('2d').drawImage(c,minX,minY,o.width,o.height,0,0,o.width,o.height);
        resolve(o.toDataURL('image/png'));
      }catch(e){console.error('_parafTransparan:',e);resolve(dataUrl);}
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}
async function bersihkanLatarVsParaf(){
  const img=document.getElementById('vs-paraf-img');
  const src=_vsParafNew||img.getAttribute('src');if(!src)return;
  const out=await _parafTransparan(src);
  if(out===src){showToast('Latar sudah transparan / tidak ada yang bisa dibuang');return;}
  _vsParafNew=out;_vsParafDel=false;_vsParafShow(out);renderVsPreview();
  showToast('Latar dibuang — tekan Simpan untuk menyimpan');
}
function delVsParaf(){
  _vsParafNew=null;_vsParafDel=true;
  document.getElementById('vs-paraf-file').value='';
  _vsParafShow(null);renderVsPreview();
}
const VS_ACCENTS={default:'#1A1814',biru:'#1E5AA8',hijau:'#1F7A4D',marun:'#8B2020',ungu:'#5B3A8B'};
// Pratinjau invoice mini di form mitra — cerminkan layout + warna + isi form secara live
function renderVsPreview(){
  const box=document.getElementById('vs-inv-preview');if(!box)return;
  const nama=(document.getElementById('vs-nama').value||'').trim()||'Nama Perusahaan';
  const alamat=(document.getElementById('vs-alamat').value||'').trim();
  const telp=(document.getElementById('vs-telp').value||'').trim();
  const layout=document.getElementById('vs-kop-layout').value||'kiri';
  const ac=VS_ACCENTS[document.getElementById('vs-kop-warna').value]||VS_ACCENTS.default;
  const logoPos=document.getElementById('vs-kop-logo-pos').value||'kiri';
  const logoSize=parseInt(document.getElementById('vs-kop-logo-size').value)||80;
  const pv=Math.max(14,Math.round(logoSize*0.55)); // skala ke ukuran preview mini
  const prev=document.getElementById('vs-kop-preview');
  const kop=(prev&&prev.style.display!=='none')?document.getElementById('vs-kop-img').src:'';
  const kt=kop?(document.getElementById('vs-kop-teks').value||'full'):'full';
  const showName=kt!=='none', showAddr=kt==='full';
  const addr=[alamat,telp].filter(Boolean).join(' · ')||'Alamat · Telepon';
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const N=esc(nama),A=esc(addr);
  const nameSpan=showName?`<span style="font-weight:700;font-size:12px">${N}</span>`:'';
  const nameDiv=showName?`<div style="font-weight:700;font-size:11px">${N}</div>`:'';
  const addrDiv=showAddr?`<div style="font-size:9px;color:#6B6560">${A}</div>`:'';
  let hdr;
  if(layout==='banner'){
    const rev=logoPos==='kanan'?'flex-direction:row-reverse':'';
    hdr=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:${ac};color:#fff;padding:8px 10px;border-radius:4px;${rev}">
      <div style="display:flex;align-items:center;gap:7px;${rev}">${kop?`<img src="${kop}" style="max-height:${pv}px;max-width:110px;object-fit:contain">`:''}${nameSpan}</div>
      <span style="font-weight:700;font-size:13px;letter-spacing:.08em">INVOICE</span></div>
      ${showAddr?`<div style="font-size:9px;color:#6B6560;margin:5px 1px 8px">${A}</div>`:'<div style="margin-bottom:6px"></div>'}`;
  } else if(layout==='tengah'){
    hdr=`<div style="text-align:center;padding-bottom:8px;border-bottom:2px solid ${ac};margin-bottom:8px">
      ${kop?`<img src="${kop}" style="max-height:${pv}px;max-width:60%;object-fit:contain;display:block;margin:0 auto 3px">`:''}
      ${showName?`<div style="font-weight:700;font-size:12px">${N}</div>`:''}${addrDiv}</div>`;
  } else {
    const alignR=logoPos==='kanan';
    hdr=`<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:2px solid ${ac};margin-bottom:8px${alignR?';flex-direction:row-reverse':''}">
      <div style="${alignR?'text-align:right':''}">${kop?`<img src="${kop}" style="max-height:${pv}px;max-width:130px;object-fit:contain;display:block;margin-bottom:3px${alignR?';margin-left:auto':''}">`:''}${nameDiv}${addrDiv}</div>
      <div style="font-weight:700;font-size:13px;color:${ac}">INVOICE</div></div>`;
  }
  const body=`<div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:6px">
      <div><div style="color:#9E9890;text-transform:uppercase;font-size:8px">Invoice kepada</div><div style="font-weight:600">Dapur Contoh</div></div>
      <div style="text-align:right;color:#6B6560;font-family:monospace">INV-D-000 · 2026-07-26</div></div>
    <table style="width:100%;border-collapse:collapse;font-size:9px">
      <thead><tr style="background:#f5f5f5"><th style="text-align:left;padding:3px 5px">Item</th><th style="text-align:right;padding:3px 5px">Qty</th><th style="text-align:right;padding:3px 5px">Subtotal</th></tr></thead>
      <tbody>
        <tr><td style="padding:3px 5px;border-bottom:1px solid #eee">Ayam Fillet</td><td style="text-align:right;padding:3px 5px;border-bottom:1px solid #eee">10 kg</td><td style="text-align:right;padding:3px 5px;border-bottom:1px solid #eee">Rp 500.000</td></tr>
        <tr><td style="padding:3px 5px">Wortel</td><td style="text-align:right;padding:3px 5px">15 kg</td><td style="text-align:right;padding:3px 5px">Rp 180.000</td></tr>
      </tbody></table>
    <div style="text-align:right;font-weight:700;font-size:12px;color:${ac};margin-top:6px">Total: Rp 680.000</div>`;
  const pp=document.getElementById('vs-paraf-preview');
  const paraf=(pp&&pp.style.display!=='none')?document.getElementById('vs-paraf-img').src:'';
  const sign=`<div style="display:flex;justify-content:flex-end;margin-top:8px"><div style="width:110px;text-align:center;font-size:8px;color:#1A1814">
      <div style="height:40px;display:flex;align-items:flex-end;justify-content:center">${paraf?`<img src="${paraf}" style="max-height:38px;max-width:105px;object-fit:contain;margin-bottom:-11px;position:relative;z-index:1">`:''}</div>
      <div style="border-top:1px solid #D8D3C8;padding-top:3px">Hormat kami</div>
      ${paraf?'<div style="color:#9E9890;font-size:7px;margin-top:2px">(paraf tampil bila dicentang saat cetak)</div>':''}</div></div>`;
  box.innerHTML=`<div style="background:#fff;border:1px solid var(--bd);border-radius:6px;padding:12px;color:#1A1814">${hdr}${body}${sign}</div>`;
}
function vsRekRow(bank='',no='',atas=''){
  return`<div class="r2" style="margin-bottom:6px;align-items:center">
    <input type="text" placeholder="Nama bank (BCA, Mandiri…)" value="${bank}" data-vs="bank" style="flex:1">
    <input type="text" placeholder="Nomor rekening" value="${no}" data-vs="no" style="flex:1">
    <input type="text" placeholder="Atas nama" value="${atas}" data-vs="atas" style="flex:1">
    <button class="btn bxs bd-" onclick="this.closest('.r2').remove()">✕</button>
  </div>`;
}
function addVsRek(){
  document.getElementById('vs-rekening-wrap').insertAdjacentHTML('beforeend',vsRekRow());
}
function previewVsKop(input){
  const f=input.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{
    const img=document.getElementById('vs-kop-img');
    img.src=e.target.result;
    document.getElementById('vs-kop-preview').style.display='block';
    document.getElementById('vs-kop-del').style.display='';
    renderVsPreview();
  };
  r.readAsDataURL(f);
}
function delVsKop(){
  document.getElementById('vs-kop-img').src='';
  document.getElementById('vs-kop-preview').style.display='none';
  document.getElementById('vs-kop-del').style.display='none';
  document.getElementById('vs-kop-file').value='';
  renderVsPreview();
}
function saveVendorSaya(){
  try{
    const nama=document.getElementById('vs-nama').value.trim();
    if(!nama){showToast('Isi nama perusahaan!',true);return;}
    const telp=document.getElementById('vs-telp').value.trim();
    const alamat=document.getElementById('vs-alamat').value.trim();
    const reks=[...document.getElementById('vs-rekening-wrap').querySelectorAll('.r2')].map(row=>({
      bank:(row.querySelector('input[data-vs="bank"]')||{}).value||'',
      no:(row.querySelector('input[data-vs="no"]')||{}).value||'',
      atas:(row.querySelector('input[data-vs="atas"]')||{}).value||''
    })).filter(r=>r.bank.trim()||r.no.trim());
    const editId=document.getElementById('vs-edit-id').value||'';
    const vsId=editId||uid();
    const kop_layout=document.getElementById('vs-kop-layout').value||'kiri';
    const kop_warna=document.getElementById('vs-kop-warna').value||'default';
    const kop_logo_pos=document.getElementById('vs-kop-logo-pos').value||'kiri';
    const kop_logo_size=parseInt(document.getElementById('vs-kop-logo-size').value)||80;
    const kop_teks=document.getElementById('vs-kop-teks').value||'full';
    const prevVs=getVendorSaya().find(v=>v.id===vsId);
    const obj={id:vsId,nama,telp,alamat,rekening:reks,kop_layout,kop_warna,kop_logo_pos,kop_logo_size,kop_teks,paraf_ada:!!prevVs?.paraf_ada};
    // Paraf disimpan/dihapus di sims_files DULU; paraf_ada baru diubah kalau berhasil
    const parafNew=_vsParafNew,parafDel=_vsParafDel;
    const saveParaf=async()=>{
      if(parafNew){
        try{await saveFile('paraf_'+vsId,parafNew);obj.paraf_ada=true;addLog('paraf_vendor','Paraf vendor mitra diubah','vendor_saya',vsId,nama,'');}
        catch(err){console.error('paraf save:',err);showToast('Vendor tersimpan, tapi paraf gagal disimpan: '+(err.message||err),true);}
      } else if(parafDel&&obj.paraf_ada){
        obj.paraf_ada=false;delete _cache['file_paraf_'+vsId];
        addLog('paraf_vendor','Paraf vendor mitra dihapus','vendor_saya',vsId,nama,'');
        try{if(_currentUser)await db.collection('sims_files').doc('paraf_'+vsId).delete();}catch(err){console.error('paraf delete:',err);}
      }
    };
    const doSave=async()=>{
      await saveParaf();
      const list=getVendorSaya();
      const idx=list.findIndex(v=>v.id===vsId);
      if(idx>=0)list[idx]=obj;else list.push(obj);
      setVendorSaya(list);
      closeModal('modal-vendor-saya');
      renderVendorSaya();
      showToast('Vendor disimpan');
    };
    const fileInput=document.getElementById('vs-kop-file');
    if(fileInput&&fileInput.files[0]){
      const reader=new FileReader();
      reader.onload=function(e){
        saveFile('kop_'+vsId,e.target.result).then(doSave).catch(err=>{console.error(err);doSave();});
      };
      reader.onerror=function(){doSave();};
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      doSave();
    }
  }catch(e){console.error('saveVendorSaya error:',e);showToast('Error: '+e.message,true);}
}
function delVendorSaya(id){
  if(!confirm('Hapus vendor ini?'))return;
  const _v=getVendorSaya().find(v=>v.id===id);
  if(_v?.paraf_ada){delete _cache['file_paraf_'+id];if(_currentUser)db.collection('sims_files').doc('paraf_'+id).delete().catch(e=>console.error('paraf delete:',e));}
  setVendorSaya(getVendorSaya().filter(v=>v.id!==id));
  renderVendorSaya();
  showToast('Vendor dihapus');
}
function _resizeImageForPrint(dataUrl,maxW,maxH){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxW/img.width,maxH/img.height);
      const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

// Bar tombol di jendela cetak (tidak ikut tercetak). Di HP / aplikasi layar
// utama jendela ini menutupi SIMS tanpa tombol kembali → "Kembali ke SIMS"
// menutup jendela; kalau browser menolak close(), buka ulang SIMS di jendela ini.
const _CETAK_BAR_CSS=`.pbar{position:sticky;top:0;z-index:9;display:flex;gap:8px;justify-content:space-between;align-items:center;margin:-20px -20px 16px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));background:#1A1814}
.pbar button{font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:44px;padding:0 16px;border-radius:8px;border:none;cursor:pointer}
.pb-back{background:#fff;color:#1A1814}.pb-print{background:#2D5A3D;color:#fff}
@media print{.pbar{display:none!important}}`;
function _cetakBarHtml(){return '<div class="pbar"><button type="button" class="pb-back" onclick="kembaliKeSims()">← Kembali ke SIMS</button><button type="button" class="pb-print" onclick="window.print()">🖨 Cetak / PDF</button></div>';}
function _cetakBarJs(){
  const url=JSON.stringify(location.href.split('#')[0]);
  return `function kembaliKeSims(){try{window.close();}catch(e){}setTimeout(function(){if(!window.closed)location.href=${url};},400);}`;
}

// iPhone/iPad dari ikon layar utama: jendela cetak tampil di penampil Safari mini
// yang mengabaikan window.print() → buat PDF sendiri lalu buka lembar Bagikan iOS
// (ada Cetak, Simpan ke File, WhatsApp). localStorage sims_force_pdf=1 untuk uji di desktop.
function _cetakPakaiPDF(){
  if(localStorage.getItem('sims_force_pdf')==='1')return true;
  return window.navigator.standalone===true;
}
const _PDF_LIBS=['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
function _pdfLoadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector('script[data-pdf-src="'+src+'"][data-ok]')){res();return;}
    const s=document.createElement('script');s.src=src;s.dataset.pdfSrc=src;
    s.onload=()=>{s.dataset.ok='1';res();};
    s.onerror=()=>{s.remove();rej(new Error('Gagal memuat pustaka PDF — cek koneksi internet'));};
    document.head.appendChild(s);
  });
}
let _cpPdf=null; // {file,url,name} PDF terakhir yang siap dibagikan
async function _buatPdfInvD(invId,withParaf){
  const doc=await printInvDFormal(invId,withParaf,true);
  if(!doc)throw new Error('Invoice tidak ditemukan');
  for(const src of _PDF_LIBS)await _pdfLoadScript(src);
  // Render di iframe tersembunyi selebar A4 supaya CSS invoice tidak bocor ke SIMS
  const fr=document.createElement('iframe');
  fr.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden';
  document.body.appendChild(fr);
  try{
    const d=fr.contentDocument;
    d.open();d.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${doc.css}body{background:#fff}</style></head><body>${doc.body}</body></html>`);d.close();
    await Promise.all([...d.images].map(im=>im.complete?0:new Promise(r=>{im.onload=im.onerror=r;})));
    await new Promise(r=>setTimeout(r,50));
    // Tinggi = isi invoice saja (bukan tinggi iframe) agar tidak ada halaman kosong di akhir
    const wEl=d.querySelector('.w');
    const contentH=Math.ceil((wEl?wEl.getBoundingClientRect().bottom:d.body.scrollHeight)+20);
    const canvas=await window.html2canvas(d.body,{scale:2,backgroundColor:'#ffffff',useCORS:true,windowWidth:794,width:794,height:contentH,windowHeight:contentH,logging:false});
    const {jsPDF}=window.jspdf;
    const pdf=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
    const pw=210,ph=297;
    const pageHpx=Math.floor(canvas.width*ph/pw);
    // Titik potong aman (piksel canvas): batas bawah baris tabel & awal blok total/rekening/tanda tangan
    const k=canvas.width/794,bodyTop=d.body.getBoundingClientRect().top;
    const cuts=[...d.querySelectorAll('tr,.tot,.rek-footer,.stamp')].map(el=>{const r=el.getBoundingClientRect();return Math.round(((el.tagName==='TR'?r.bottom:r.top)-bodyTop)*k);}).sort((p,q)=>p-q);
    for(let y=0,pg=0;y<canvas.height;pg++){
      const cap=pg>0?Math.floor(canvas.width*(ph-8)/pw):pageHpx; // halaman lanjutan diberi margin atas 8mm
      let h=Math.min(cap,canvas.height-y);
      if(y+h<canvas.height){const ok=cuts.filter(c=>c>y+cap*0.5&&c<=y+cap);if(ok.length)h=ok[ok.length-1]-y;}
      if(pg>0&&h<40)break; // sisa beberapa piksel saja → jangan buat halaman baru
      const c=document.createElement('canvas');c.width=canvas.width;c.height=h;
      const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,h);g.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);
      if(pg>0)pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg',0.9),'JPEG',0,pg>0?8:0,pw,h*pw/canvas.width);
      y+=h;
    }
    const blob=pdf.output('blob');
    const name=doc.title.replace(/[\\/:*?"<>|]/g,'-')+'.pdf';
    return {file:new File([blob],name,{type:'application/pdf'}),url:URL.createObjectURL(blob),name};
  }finally{fr.remove();}
}
// Tahap 1 (iOS): siapkan PDF di dalam dialog; tombol Bagikan baru aktif setelah siap.
// navigator.share WAJIB dipanggil langsung dari ketukan → tidak bisa disambung setelah proses async.
async function _cetakInvDPdf(invId,withParaf){
  const st=document.getElementById('cp-status'),go=document.getElementById('cp-go'),sh=document.getElementById('cp-share');
  if(_cpPdf){URL.revokeObjectURL(_cpPdf.url);_cpPdf=null;}
  document.getElementById('cp-pilih').style.display='none';
  go.style.display='none';sh.style.display='';sh.disabled=true;
  st.style.display='';st.textContent='Menyiapkan PDF…';
  try{
    const r=await _buatPdfInvD(invId,withParaf);
    if(document.getElementById('cp-inv-id').value!==invId||!document.getElementById('modal-cetak-paraf').classList.contains('open')){URL.revokeObjectURL(r.url);return;}
    _cpPdf=r;sh.disabled=false;
    st.textContent='PDF siap. Ketuk "Bagikan / Cetak", lalu pilih Cetak (Print), Simpan ke File, atau WhatsApp.';
  }catch(e){
    console.error('PDF invoice:',e);
    st.textContent='Gagal membuat PDF: '+(e.message||e)+'. Coba lagi, atau pakai jendela cetak biasa.';
    sh.style.display='none';go.style.display='';go.textContent='🖨 Jendela cetak biasa';
    go.onclick=()=>{closeModal('modal-cetak-paraf');printInvDFormal(invId,withParaf);};
  }
}
async function cetakInvDBagikan(){
  if(!_cpPdf)return;
  const {file,url,name}=_cpPdf;
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:name});
      closeModal('modal-cetak-paraf');return;
    }
  }catch(e){if(e&&e.name==='AbortError')return;console.error('share:',e);}
  // Cadangan: buka PDF-nya langsung (bisa dibagikan/dicetak dari penampil)
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.download=name;document.body.appendChild(a);a.click();a.remove();
}
// Tombol "Cetak Invoice": vendor yang punya paraf → dialog kecil "Dengan paraf" dulu.
// Pilihan HARUS dibuat sebelum jendela cetak dibuka: di iPhone window.print() dari
// tombol di dalam jendela cetak tidak memunculkan dialog print, hanya print otomatis
// saat jendela dimuat yang berhasil.
function cetakInvDFormal(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const vs=getVendorSaya().find(v=>v.id===inv.vendor_saya_id);
  const pdf=_cetakPakaiPDF();
  if(!pdf&&(!vs||!vs.paraf_ada)){printInvDFormal(invId,false);return;}
  document.getElementById('cp-inv-id').value=invId;
  document.getElementById('cp-inv-no').textContent=inv.no+' — '+(vs?vs.nama:'');
  document.getElementById('cp-paraf').checked=false;
  document.getElementById('cp-pilih').style.display=(vs&&vs.paraf_ada)?'':'none';
  document.getElementById('cp-status').style.display='none';
  document.getElementById('cp-share').style.display='none';
  const go=document.getElementById('cp-go');go.style.display='';go.onclick=cetakInvDFormalGo;
  go.textContent=pdf?'📄 Buat PDF':'🖨 Cetak';
  openModal('modal-cetak-paraf');
}
function cetakInvDFormalGo(){
  const id=document.getElementById('cp-inv-id').value;
  const wp=document.getElementById('cp-paraf').checked;
  if(_cetakPakaiPDF()){_cetakInvDPdf(id,wp);return;}
  closeModal('modal-cetak-paraf');
  printInvDFormal(id,wp); // sinkron dalam klik → jendela cetak tidak diblokir
}
// pdfMode=true: tidak buka jendela, kembalikan {title,css,body} untuk dijadikan PDF (iOS).
async function printInvDFormal(invId,withParaf,pdfMode){
  withParaf=!!withParaf;
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const vs=getVendorSaya().find(v=>v.id===inv.vendor_saya_id);
  if(!vs){showToast('Vendor tidak ditemukan!',true);return;}
  let w=null;
  if(!pdfMode){
  // Jendela cetak WAJIB dibuka sinkron saat tombol diklik. Dulu dibuka setelah
  // await (muat logo kop dari Firestore + resize) → Safari/HP/Chrome (kalau
  // lambat) menganggapnya pop-up tak diminta dan memblokirnya, tombol terasa mati.
  w=window.open('','_blank','width=820,height=800');
  if(!w){showToast('Jendela cetak diblokir browser — izinkan pop-up untuk SIMS lalu coba lagi',true);return;}
  w.document.write('<!DOCTYPE html><html><head><title>Menyiapkan invoice…</title></head><body style="font-family:sans-serif;padding:24px;color:#6B6560">Menyiapkan invoice…</body></html>');
  }
  try{
  const po=getPOs().find(p=>p.id===inv.po_id);
  const recv=(inv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
  const sisa=inv.total-recv;
  // Load kop image
  let kopSrc=getFile('kop_'+vs.id);
  if(!kopSrc)kopSrc=await loadFile('kop_'+vs.id);
  if(kopSrc)kopSrc=await _resizeImageForPrint(kopSrc,800,160);
  // Paraf hanya dimuat & tampil kalau "Dengan paraf" dicentang. Gagal muat → cetak tanpa paraf.
  let parafSrc=null;
  if(withParaf&&vs.paraf_ada){parafSrc=getFile('paraf_'+vs.id)||await loadFile('paraf_'+vs.id);if(!parafSrc)showToast('Paraf gagal dimuat — invoice dicetak tanpa paraf',true);}
  const items=inv.type==='passthrough'?[{nama:'Pass-through — lihat invoice vendor terlampir',qty:1,satuan:'',harga_dapur:inv.total}]:inv.items;
  // Setelan tampilan per vendor mitra (backward-compat: tanpa setelan = kiri + netral)
  const ACCENTS={default:'#1A1814',biru:'#1E5AA8',hijau:'#1F7A4D',marun:'#8B2020',ungu:'#5B3A8B'};
  const ac=ACCENTS[vs.kop_warna]||ACCENTS.default;
  const layout=vs.kop_layout||'kiri';
  const logoPos=vs.kop_logo_pos||'kiri';
  const logoSize=(typeof vs.kop_logo_size==='number'&&vs.kop_logo_size>0)?vs.kop_logo_size:80;
  const sizeStyle=`max-height:${logoSize}px`;
  const css=PRINT_CSS+`
    .kop-img{max-width:55%;max-height:130px;object-fit:contain;object-position:left top;display:block;margin-bottom:8px}
    .vs-hdr{margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid ${ac}}
    .vs-hdr.center{text-align:center}
    .vs-hdr.center .kop-img{margin-left:auto;margin-right:auto;object-position:center top;max-width:70%}
    .vs-hdr-main{font-size:18px;font-weight:700;margin-bottom:2px}
    .vs-hdr-sub{font-size:12px;color:#6B6560;line-height:1.6}
    .vs-banner{display:flex;justify-content:space-between;align-items:center;gap:14px;background:${ac};color:#fff;padding:14px 18px;border-radius:6px;margin-bottom:6px}
    .vs-banner .kop-img{max-height:60px;max-width:210px;margin:0;object-position:left center}
    .vs-banner-name{font-size:18px;font-weight:700}
    .vs-banner-inv{font-size:22px;font-weight:700;letter-spacing:.1em}
    .inv-meta{display:flex;justify-content:space-between;margin-bottom:14px;font-size:13px}
    .rek-footer{margin-top:20px;padding:10px 12px;background:#F5F3EE;border-radius:4px;font-size:12px}
    .rek-footer-title{font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;color:${ac}}
    .rek-row{display:flex;gap:12px;margin-bottom:3px}
    .rek-bank{font-weight:600;min-width:80px}
  `;
  const dapurInfo=getDapurInfo(inv.dapur);
  const esc=l=>l.replace(/\n/g,'<br>');
  // Blok penerima (dapur) & blok meta invoice (no/tgl/jatuh/ref) — dipakai bersama antar layout
  const dapurHtml=`<div><div style="font-size:10px;text-transform:uppercase;color:#9E9890;margin-bottom:2px">Invoice kepada</div><div style="font-weight:600;font-size:15px">${dapurInfo.nama||inv.dapur}</div>${dapurInfo.alamat?`<div style="font-size:12px;color:#6B6560;margin-top:1px">${esc(dapurInfo.alamat)}</div>`:''}${dapurInfo.tlp?`<div style="font-size:12px;color:#6B6560">${dapurInfo.tlp}</div>`:''}</div>`;
  const metaHtml=`<div style="text-align:right">
    <div style="font-size:20px;font-weight:700;color:${ac}">INVOICE</div>
    <div style="font-size:11px;color:#6B6560;font-family:'Courier New',monospace">${inv.no} · ${inv.tgl}</div>
    ${inv.jatuh?`<div style="font-size:11px;color:#9E9890;margin-top:2px">Jatuh tempo: ${inv.jatuh}</div>`:''}
    ${po?`<div style="font-size:11px;color:#9E9890">Ref. PO: ${po.no}</div>`:''}
  </div>`;
  const nameHtml=`<div class="vs-hdr-main">${vs.nama}</div>`;
  const addrHtml=[vs.alamat,vs.telp].filter(Boolean).map(l=>`<div class="vs-hdr-sub">${esc(l)}</div>`).join('');
  // Isi teks kop (hanya berlaku saat ada logo; tanpa logo selalu tampilkan penuh agar kop tidak kosong)
  const kt=kopSrc?(vs.kop_teks||'full'):'full';
  const showName=kt!=='none';
  const showAddr=kt==='full';
  let topHtml;
  if(layout==='banner'){
    const rev=logoPos==='kanan'?'flex-direction:row-reverse':'';
    const band=`<div style="display:flex;align-items:center;gap:12px;${rev}">${kopSrc?`<img src="${kopSrc}" class="kop-img" style="${sizeStyle}">`:''}${showName?`<div class="vs-banner-name">${vs.nama}</div>`:''}</div>`;
    const addrLine=(showAddr&&(vs.alamat||vs.telp))?`<div class="vs-hdr-sub" style="margin-bottom:14px">${[vs.alamat,vs.telp].filter(Boolean).map(esc).join(' · ')}</div>`:'<div style="margin-bottom:10px"></div>';
    topHtml=`<div class="vs-banner" style="${rev}">${band}<div class="vs-banner-inv">INVOICE</div></div>
    ${addrLine}
    <div class="inv-meta">${dapurHtml}<div style="text-align:right"><div style="font-size:11px;color:#6B6560;font-family:'Courier New',monospace">${inv.no} · ${inv.tgl}</div>${inv.jatuh?`<div style="font-size:11px;color:#9E9890;margin-top:2px">Jatuh tempo: ${inv.jatuh}</div>`:''}${po?`<div style="font-size:11px;color:#9E9890">Ref. PO: ${po.no}</div>`:''}</div></div>`;
  } else if(layout==='tengah'){
    const nameLine=showName?(kopSrc?`<div class="vs-hdr-sub" style="font-weight:600;color:#1A1814;font-size:13px">${vs.nama}</div>`:nameHtml):'';
    const hdr=`<div class="vs-hdr center">${kopSrc?`<img src="${kopSrc}" class="kop-img" style="${sizeStyle}">`:''}${nameLine}${showAddr?addrHtml:''}</div>`;
    topHtml=`${hdr}<div class="inv-meta">${dapurHtml}${metaHtml}</div>`;
  } else { // kiri (default)
    const alignR=logoPos==='kanan';
    const hdrStyle=alignR?'text-align:right':'';
    const imgStyle=`${sizeStyle};display:block;margin-bottom:8px${alignR?';margin-left:auto':''}`;
    const lines=[];
    if(showName)lines.push({t:vs.nama,bold:true});
    if(showAddr){if(vs.alamat)lines.push({t:vs.alamat,bold:false});if(vs.telp)lines.push({t:vs.telp,bold:false});}
    const linesHtml=lines.map(l=>`<div class="vs-hdr-sub" style="${l.bold?'font-weight:600;color:#1A1814;font-size:13px':''}">${esc(l.t)}</div>`).join('');
    const hdr=kopSrc
      ?`<div class="vs-hdr" style="${hdrStyle}"><img src="${kopSrc}" class="kop-img" style="${imgStyle}">${linesHtml}</div>`
      :`<div class="vs-hdr" style="${hdrStyle}">${nameHtml}${addrHtml}</div>`;
    topHtml=`${hdr}<div class="inv-meta">${dapurHtml}${metaHtml}</div>`;
  }
  // Table
  const tableHtml=`<table class="tbl"><thead><tr>
    <th>Nama item</th>
    <th>Qty</th><th>Satuan</th>
    <th style="text-align:right">Harga (Rp)</th><th style="text-align:right">Subtotal</th>
  </tr></thead><tbody>
    ${items.map(i=>`<tr><td>${i.nama}${i.catatan_item?`<div style="font-size:11px;color:#6B6560;font-style:italic">${i.catatan_item}</div>`:''}</td>
    <td>${i.qty}</td><td>${i.satuan||''}</td>
    <td style="text-align:right">Rp ${Math.round(i.harga_dapur||0).toLocaleString('id-ID')}</td>
    <td style="text-align:right">Rp ${Math.round((i.qty||0)*(i.harga_dapur||0)).toLocaleString('id-ID')}</td></tr>`).join('')}
  </tbody></table>`;
  // Totals
  const totHtml=`<div class="tot">
    ${recv>0?`<div style="font-size:12px;color:#6B6560;margin-bottom:3px">Sudah dibayar: Rp ${Math.round(recv).toLocaleString('id-ID')}</div>`:''}
    <div class="tot-main" style="color:${ac}">Total: Rp ${Math.round(inv.total).toLocaleString('id-ID')}</div>
    ${sisa>0?`<div style="font-size:13px;color:#8B2020;margin-top:2px">Sisa tagihan: Rp ${Math.round(sisa).toLocaleString('id-ID')}</div>`:'<div style="font-size:12px;color:#2D5A3D;margin-top:2px">✓ Lunas</div>'}
  </div>`;
  // Rekening footer
  const rekFooter=(vs.rekening||[]).length?`<div class="rek-footer">
    <div class="rek-footer-title">Informasi pembayaran</div>
    ${vs.rekening.map(r=>`<div class="rek-row"><span class="rek-bank">${r.bank}</span><span>${r.no}</span>${r.atas?`<span style="color:#6B6560">a.n. ${r.atas}</span>`:''}</div>`).join('')}
  </div>`:'';
  const stampHtml=parafSrc
    ?`<div class="stamp" style="justify-content:flex-end"><div style="flex:1;max-width:200px;text-align:center"><div class="paraf-wrap"><img src="${parafSrc}" class="paraf-img" alt="Paraf"></div><div class="stamp-box" style="margin-top:0">Hormat kami</div></div></div>`
    :`<div class="stamp" style="justify-content:flex-end"><div class="stamp-box" style="max-width:200px">Hormat kami</div></div>`;
  const parafCss=parafSrc?`.paraf-wrap{height:56px;display:flex;align-items:flex-end;justify-content:center}.paraf-img{max-height:70px;max-width:190px;object-fit:contain;margin-bottom:-20px;position:relative;z-index:1}`:'';
  const body=`<div class="w">${topHtml}${tableHtml}${totHtml}${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:#6B6560">Catatan: ${inv.catatan}</div>`:''}${rekFooter}${stampHtml}</div>`;
  if(pdfMode)return {title:`${inv.no} — ${vs.nama}`,css:css+parafCss,body};
  if(w.closed)return;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head><title>${inv.no} — ${vs.nama}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${_CETAK_BAR_CSS}${parafCss}</style></head><body>${_cetakBarHtml()}${body}<script>${_cetakBarJs()}window.onload=function(){setTimeout(function(){window.print();},100);};<\/script></body></html>`);
  w.document.close();
  }catch(e){console.error('printInvDFormal:',e);if(pdfMode)throw e;try{w.close();}catch(_){}showToast('Gagal menyiapkan invoice: '+(e.message||e),true);}
}

// Init handled by Firebase auth.onAuthStateChanged
