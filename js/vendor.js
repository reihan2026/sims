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
  if(!po.items.length){el.innerHTML='<div class="empty">PO ini tidak punya item</div>';return;}
  el.innerHTML=po.items.map((item,idx)=>{
    const precheck=vendorNama&&item.vendor===vendorNama;
    const deadline=item.deadline?` · deadline ${item.deadline}`:'';
    const spek=item.spek?`<span style="color:var(--t3);font-size:10px"> — ${item.spek}</span>`:'';
    const kat=item.kat?`<span class="tag tgr" style="font-size:9px">${item.kat}</span> `:'';
    return`<label style="display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:1px solid var(--bd);cursor:pointer">
      <input type="checkbox" id="bpov-item-${idx}" ${precheck?'checked':''} style="margin-top:2px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${kat}${item.nama}</div>
        <div style="font-size:11px;color:var(--t2);font-family:var(--mn)">${item.qty} ${item.satuan}${deadline}</div>
        ${item.spek?`<div style="font-size:10px;color:var(--t3)">${item.spek}</div>`:''}
      </div>
    </label>`;
  }).join('');
}

function bpovCheckAll(checked){
  const po=getPOs().find(p=>p.id===_buatPOVSourceId);if(!po)return;
  po.items.forEach((_,idx)=>{const cb=document.getElementById('bpov-item-'+idx);if(cb)cb.checked=checked;});
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
  openModal('modal-vendor-saya');
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
  };
  r.readAsDataURL(f);
}
function delVsKop(){
  document.getElementById('vs-kop-img').src='';
  document.getElementById('vs-kop-preview').style.display='none';
  document.getElementById('vs-kop-del').style.display='none';
  document.getElementById('vs-kop-file').value='';
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
    const obj={id:vsId,nama,telp,alamat,rekening:reks,kop_layout,kop_warna};
    const doSave=()=>{
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

async function printInvDFormal(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const vs=getVendorSaya().find(v=>v.id===inv.vendor_saya_id);
  if(!vs){showToast('Vendor tidak ditemukan!',true);return;}
  const po=getPOs().find(p=>p.id===inv.po_id);
  const recv=(inv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
  const sisa=inv.total-recv;
  // Load kop image
  let kopSrc=getFile('kop_'+vs.id);
  if(!kopSrc)kopSrc=await loadFile('kop_'+vs.id);
  if(kopSrc)kopSrc=await _resizeImageForPrint(kopSrc,800,160);
  const items=inv.type==='passthrough'?[{nama:'Pass-through — lihat invoice vendor terlampir',qty:1,satuan:'',harga_dapur:inv.total}]:inv.items;
  // Setelan tampilan per vendor mitra (backward-compat: tanpa setelan = kiri + netral)
  const ACCENTS={default:'#1A1814',biru:'#1E5AA8',hijau:'#1F7A4D',marun:'#8B2020',ungu:'#5B3A8B'};
  const ac=ACCENTS[vs.kop_warna]||ACCENTS.default;
  const layout=vs.kop_layout||'kiri';
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
  let topHtml;
  if(layout==='banner'){
    topHtml=`<div class="vs-banner">
      <div style="display:flex;align-items:center;gap:12px">${kopSrc?`<img src="${kopSrc}" class="kop-img">`:''}<div class="vs-banner-name">${vs.nama}</div></div>
      <div class="vs-banner-inv">INVOICE</div>
    </div>
    ${(vs.alamat||vs.telp)?`<div class="vs-hdr-sub" style="margin-bottom:14px">${[vs.alamat,vs.telp].filter(Boolean).map(esc).join(' · ')}</div>`:'<div style="margin-bottom:10px"></div>'}
    <div class="inv-meta">${dapurHtml}<div style="text-align:right"><div style="font-size:11px;color:#6B6560;font-family:'Courier New',monospace">${inv.no} · ${inv.tgl}</div>${inv.jatuh?`<div style="font-size:11px;color:#9E9890;margin-top:2px">Jatuh tempo: ${inv.jatuh}</div>`:''}${po?`<div style="font-size:11px;color:#9E9890">Ref. PO: ${po.no}</div>`:''}</div></div>`;
  } else if(layout==='tengah'){
    const hdr=`<div class="vs-hdr center">${kopSrc?`<img src="${kopSrc}" class="kop-img">`:''}${kopSrc?'':nameHtml}${kopSrc?`<div class="vs-hdr-sub" style="font-weight:600;color:#1A1814;font-size:13px">${vs.nama}</div>`:''}${addrHtml}</div>`;
    topHtml=`${hdr}<div class="inv-meta">${dapurHtml}${metaHtml}</div>`;
  } else { // kiri (default, seperti sebelumnya)
    const vsAddrLines=[vs.nama,vs.alamat||'',vs.telp||''].filter(Boolean);
    const hdr=kopSrc
      ?`<div class="vs-hdr"><img src="${kopSrc}" class="kop-img">${vsAddrLines.map((l,i)=>`<div class="vs-hdr-sub" style="${i===0?'font-weight:600;color:#1A1814;font-size:13px':''}">${esc(l)}</div>`).join('')}</div>`
      :`<div class="vs-hdr">${nameHtml}${addrHtml}</div>`;
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
  const stampHtml=`<div class="stamp" style="justify-content:flex-end"><div class="stamp-box" style="max-width:200px">Hormat kami</div></div>`;
  const body=`<div class="w">${topHtml}${tableHtml}${totHtml}${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:#6B6560">Catatan: ${inv.catatan}</div>`:''}${rekFooter}${stampHtml}</div>`;
  const w=window.open('','_blank','width=820,height=800');
  w.document.write(`<!DOCTYPE html><html><head><title>${inv.no} — ${vs.nama}</title><style>${css}</style></head><body>${body}<script>window.print();<\/script></body></html>`);
  w.document.close();
}

// Init handled by Firebase auth.onAuthStateChanged
