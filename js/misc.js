// ===== FILTER DETAIL PO ITEMS =====
function filterDetItems(){
  const q=(document.getElementById('det-srch')?.value||'').toLowerCase().trim();
  const fStat=document.getElementById('det-f-stat')?.value||'';
  const fKat=document.getElementById('det-f-kat')?.value||'';
  const fVendor=document.getElementById('det-f-vendor')?.value||'';
  const rows=document.querySelectorAll('#det-body .tbl tbody tr');
  let visible=0,total=rows.length;
  rows.forEach(tr=>{
    const nama=tr.dataset.nama||'';
    const kat=(tr.dataset.kat||'').toLowerCase();
    const vendor=tr.dataset.vendor||'';
    const stat=tr.dataset.status||'';
    const show=(
      (!q||nama.includes(q)||kat.includes(q)||vendor.includes(q))&&
      (!fStat||stat===fStat)&&
      (!fKat||(tr.dataset.kat||'')===fKat)&&
      (!fVendor||vendor===fVendor.toLowerCase())
    );
    tr.style.display=show?'':'none';
    if(show)visible++;
  });
  // Hide/show hari sections based on visible rows
  document.querySelectorAll('#det-body .tbl').forEach(tbl=>{
    const anyVisible=[...tbl.querySelectorAll('tbody tr')].some(r=>r.style.display!=='none');
    const tableWrap=tbl.closest('div[style*="overflow-x"]');
    if(tableWrap)tableWrap.style.display=anyVisible?'':'none';
    const section=tableWrap?.parentElement;
    if(section&&section.id&&section.id.startsWith('hari-sec-')){
      const hdr=section.previousElementSibling;
      if(hdr)hdr.style.display=anyVisible?'':'none';
      section.style.display=anyVisible?'':'none';
    }
  });
  const cnt=document.getElementById('det-srch-cnt');
  const filtered=q||fStat||fKat||fVendor;
  if(cnt)cnt.textContent=filtered?`${visible}/${total} item`:'';
}

// ===== GLOBAL SEARCH =====
function doGlobalSearch(q){
  const res=document.getElementById('gsearch-results');
  if(!q||q.length<2){res.classList.remove('open');return;}
  const srch=q.toLowerCase();
  const pos=getPOs();const invV=getInvV();const invD=getInvD();
  const hits=[];
  // PO
  pos.filter(p=>p.no.toLowerCase().includes(srch)||p.dapur.toLowerCase().includes(srch)||p.items.some(i=>i.nama.toLowerCase().includes(srch))).slice(0,4).forEach(p=>{
    const matchItem=p.items.find(i=>i.nama.toLowerCase().includes(srch));
    hits.push({type:'PO',label:`${p.no} — ${p.dapur}`,sub:matchItem?`Item: ${matchItem.nama}`:`${p.date}`,action:`showDetail('${p.id}')`});
  });
  // Invoice vendor
  invV.filter(iv=>iv.no.toLowerCase().includes(srch)||iv.vendor.toLowerCase().includes(srch)||(iv.items||[]).some(i=>i.nama.toLowerCase().includes(srch))).slice(0,3).forEach(iv=>{
    hits.push({type:'Inv Vendor',label:`${iv.no} — ${iv.vendor}`,sub:`${fmtF(iv.total)} · ${iv.bayar_status==='lunas'?'Lunas':'Blm bayar'}`,action:`showInvVDetail('${iv.id}')`});
  });
  // Invoice dapur
  invD.filter(id=>id.no.toLowerCase().includes(srch)||id.dapur.toLowerCase().includes(srch)).slice(0,3).forEach(id=>{
    hits.push({type:'Inv Dapur',label:`${id.no} — ${id.dapur}`,sub:`${fmtF(id.total)} · ${id.terima_status==='lunas'?'Lunas':'Blm terima'}`,action:`showInvDDetail('${id.id}')`});
  });
  if(!hits.length){res.innerHTML='<div class="gsr-item" style="color:var(--t3)">Tidak ada hasil</div>';res.classList.add('open');return;}
  let lastType='';
  res.innerHTML=hits.map(h=>{
    const secHeader=h.type!==lastType?`<div class="gsr-sec">${h.type}</div>`:'';;lastType=h.type;
    return`${secHeader}<div class="gsr-item" onclick="${h.action};document.getElementById('gsearch-results').classList.remove('open');document.getElementById('gsearch-input').value=''">
      <div style="font-weight:500">${h.label}</div>
      <div style="font-size:10px;color:var(--t3);font-family:var(--mn)">${h.sub}</div>
    </div>`;
  }).join('');
  res.classList.add('open');
}
// Close global search on outside click
document.addEventListener('click',e=>{
  if(!e.target.closest('.gsearch-wrap'))document.getElementById('gsearch-results').classList.remove('open');
});


const PRINT_CSS=`body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:20px;font-size:13px;color:#1A1814}.w{max-width:720px;margin:0 auto}.h{display:flex;justify-content:space-between;margin-bottom:22px;padding-bottom:14px;border-bottom:2px solid #1A1814}.t{font-size:22px;font-weight:700}.m{font-size:11px;color:#6B6560;font-family:'Courier New',monospace;margin-top:3px}.tbl{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}.tbl th{background:#F5F3EE;padding:7px 9px;text-align:left;border:1px solid #D8D3C8;font-size:10px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}.tbl td{padding:7px 9px;border:1px solid #D8D3C8}.tot{text-align:right;margin-top:10px}.tot-main{font-size:16px;font-weight:600}.stamp{margin-top:40px;display:flex;gap:60px}.stamp-box{flex:1;text-align:center;font-size:11px;border-top:1px solid #D8D3C8;padding-top:7px;margin-top:56px}.ft{margin-top:28px;font-size:11px;color:#9E9890;border-top:1px solid #D8D3C8;padding-top:9px}`;
function printInvV(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const po=getPOs().find(p=>p.id===inv.po_id);const n=invVNet(inv);
  const css=PRINT_CSS;
  const body=`<div class="w"><div class="h"><div><div class="t">INVOICE VENDOR</div><div class="m">${inv.no} · ${inv.tgl}${(inv.edits||[]).length?' · Rev '+inv.edits.length:''}</div></div><div style="text-align:right"><div style="font-weight:600;font-size:14px">SIMS</div><div style="font-size:12px;color:#6B6560">Sistem Internal Manajemen Suplai</div></div></div>
  <div style="display:flex;justify-content:space-between;margin-bottom:18px;font-size:13px"><div><div style="font-size:10px;text-transform:uppercase;color:#9E9890;margin-bottom:2px">Dari Vendor</div><div style="font-weight:600">${inv.vendor}</div></div><div style="text-align:right"><div style="font-size:10px;text-transform:uppercase;color:#9E9890;margin-bottom:2px">PO</div><div style="font-weight:600">${po?po.no+' — '+po.dapur:'—'}</div>${inv.jatuh?`<div style="font-size:11px;color:#9E9890">Jatuh tempo: ${inv.jatuh}</div>`:''}</div></div>
  <table class="tbl"><thead><tr><th>Nama item</th><th>Qty</th><th>Sat</th><th style="text-align:right">Hrg Vendor</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${(inv.items||[]).map(i=>`<tr><td>${i.nama}</td><td>${i.qty}</td><td>${i.satuan||''}</td><td style="text-align:right">Rp ${Math.round(i.harga_vendor||0).toLocaleString('id-ID')}</td><td style="text-align:right">Rp ${Math.round((i.qty||0)*(i.harga_vendor||0)).toLocaleString('id-ID')}</td></tr>`).join('')}</tbody></table>
  <div class="tot">${n.retur>0?`<div style="font-size:12px;color:#8B2020;margin-bottom:3px">Retur: -Rp ${Math.round(n.retur).toLocaleString('id-ID')}</div><div style="font-size:12px;margin-bottom:3px">Net tagihan: Rp ${Math.round(n.netTotal).toLocaleString('id-ID')}</div>`:''}<div class="tot-main">Total: Rp ${Math.round(inv.total).toLocaleString('id-ID')}</div>${n.sisa>0?`<div style="font-size:13px;color:#8B2020;margin-top:2px">Sisa: Rp ${Math.round(n.sisa).toLocaleString('id-ID')}</div>`:'<div style="font-size:12px;color:#2D5A3D;margin-top:2px">✓ Lunas</div>'}</div>
  ${(inv.edits||[]).length?`<div style="margin-top:12px;font-size:11px;color:#6B6560">Histori revisi: ${inv.edits.map(e=>`${e.tgl} — ${e.catatan}`).join('; ')}</div>`:''}
  ${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:#6B6560">Catatan: ${inv.catatan}</div>`:''}
  <div class="ft">Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>`;
  const w=window.open('','_blank','width=820,height=720');w.document.write(`<!DOCTYPE html><html><head><title>${inv.no}</title><style>${css}</style></head><body>${body}<script>window.print();<\/script></body></html>`);w.document.close();
}
function printInvD(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const po=getPOs().find(p=>p.id===inv.po_id);const recv=(inv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
  const items=inv.type==='passthrough'?[{nama:'Pass-through — lihat invoice vendor terlampir',qty:1,satuan:'',harga_dapur:inv.total}]:inv.items;
  const css=PRINT_CSS;
  const body=`<div class="w"><div class="h"><div><div class="t">INVOICE</div><div class="m">${inv.no} · ${inv.tgl}${inv.type==='passthrough'?' · Pass-through':''}</div></div><div style="text-align:right"><div style="font-weight:600;font-size:14px">SIMS</div></div></div>
  <div style="display:flex;justify-content:space-between;margin-bottom:18px;font-size:13px"><div><div style="font-size:10px;text-transform:uppercase;color:#9E9890;margin-bottom:2px">Kepada</div><div style="font-weight:600;font-size:15px">${inv.dapur}</div></div><div style="text-align:right">${po?`<div style="font-size:10px;text-transform:uppercase;color:#9E9890;margin-bottom:2px">Ref. PO</div><div style="font-weight:600">${po.no}</div>`:''} ${inv.jatuh?`<div style="font-size:11px;color:#9E9890;margin-top:3px">Jatuh tempo: ${inv.jatuh}</div>`:''}</div></div>
  <table class="tbl"><thead><tr><th>Nama item</th><th>Qty</th><th>Sat</th><th style="text-align:right">Harga (Rp)</th><th style="text-align:right">Subtotal</th></tr></thead>
  <tbody>${items.map(i=>`<tr><td>${i.nama}${i.catatan_item?`<div style="font-size:11px;color:#6B6560;font-style:italic">${i.catatan_item}</div>`:''}</td><td>${i.qty}</td><td>${i.satuan||''}</td><td style="text-align:right">Rp ${Math.round(i.harga_dapur||0).toLocaleString('id-ID')}</td><td style="text-align:right">Rp ${Math.round((i.qty||0)*(i.harga_dapur||0)).toLocaleString('id-ID')}</td></tr>`).join('')}</tbody></table>
  <div class="tot">${recv>0?`<div style="font-size:12px;color:#6B6560;margin-bottom:3px">Sudah dibayar: Rp ${Math.round(recv).toLocaleString('id-ID')}</div>`:''}<div class="tot-main">Total: Rp ${Math.round(inv.total).toLocaleString('id-ID')}</div>${inv.total-recv>0?`<div style="font-size:13px;color:#8B2020;margin-top:2px">Sisa tagihan: Rp ${Math.round(inv.total-recv).toLocaleString('id-ID')}</div>`:'<div style="font-size:12px;color:#2D5A3D;margin-top:2px">✓ Lunas</div>'}</div>
  ${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:#6B6560">Catatan: ${inv.catatan}</div>`:''}
  <div class="stamp"><div class="stamp-box">Dibuat oleh</div><div class="stamp-box">Disetujui</div><div class="stamp-box">Penerima</div></div>
  <div class="ft">Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>`;
  const w=window.open('','_blank','width=820,height=720');w.document.write(`<!DOCTYPE html><html><head><title>${inv.no}</title><style>${css}</style></head><body>${body}<script>window.print();<\/script></body></html>`);w.document.close();
}

// ===== DRAG DROP =====
const dzEl=document.getElementById('drop-z');
if(dzEl){dzEl.addEventListener('dragover',e=>{e.preventDefault();dzEl.classList.add('drag');});dzEl.addEventListener('dragleave',()=>dzEl.classList.remove('drag'));dzEl.addEventListener('drop',e=>{e.preventDefault();dzEl.classList.remove('drag');const f=e.dataTransfer.files[0];if(f)handleFile(f);});}

function toggleAgendaSec(id){
  const body=document.getElementById(id);const arrow=document.getElementById(id+'-arrow');
  if(!body)return;
  const isCollapsed=body.classList.contains('collapsed');
  if(isCollapsed){
    body.classList.remove('collapsed');
    body.style.maxHeight=body.scrollHeight+40+'px';
    if(arrow)arrow.textContent='▲';
  } else {
    body.style.maxHeight='0';
    body.classList.add('collapsed');
    if(arrow)arrow.textContent='▼';
  }
}
function openKbb(id,event){
  event.stopPropagation();
  document.querySelectorAll('.kbb-menu.open').forEach(m=>m.classList.remove('open'));
  const menu=document.getElementById(id);if(!menu)return;
  const btn=event.currentTarget;
  const r=btn.getBoundingClientRect();
  const menuW=Math.max(menu.offsetWidth||160,160);
  let left=r.right-menuW;
  if(left<8)left=8;
  if(left+menuW>window.innerWidth-8)left=window.innerWidth-8-menuW;
  menu.style.left=left+'px';
  menu.style.right='auto';
  // Show first to measure real height, then clamp vertically
  menu.style.top='0px';
  menu.classList.add('open');
  const menuH=menu.offsetHeight;
  let top=r.bottom+4;
  if(top+menuH>window.innerHeight-8)top=r.top-menuH-4;
  if(top<8)top=8;
  menu.style.top=top+'px';
}
document.addEventListener('click',()=>document.querySelectorAll('.kbb-menu.open').forEach(m=>m.classList.remove('open')));

function toggleHariSec(id){
  const body=document.getElementById(id);const arrow=document.getElementById(id+'-arrow');
  if(!body)return;
  const isCollapsed=body.style.maxHeight==='0px';
  body.style.maxHeight=isCollapsed?body.scrollHeight+200+'px':'0px';
  if(arrow)arrow.textContent=isCollapsed?'▲':'▼';
}

// Auto-sync: mark invV as lunas if linked invD pass-through is already lunas
// Runs on init to fix legacy data, and can be called manually
function syncPassthroughInvV(){
  const invDs=getInvD().filter(d=>d.type==='passthrough'&&d.terima_status==='lunas'&&d.pt_inv_id);
  if(!invDs.length)return 0;
  const invVs=getInvV();let fixed=0;
  invDs.forEach(d=>{
    const ivObj=invVs.find(v=>v.id===d.pt_inv_id);
    if(ivObj&&ivObj.bayar_status!=='lunas'){
      if(!ivObj.payments)ivObj.payments=[];
      const tgl=(d.payments||[]).slice(-1)[0]?.tgl||today();
      ivObj.payments.push({id:uid(),jumlah:ivObj.total,tgl,rek_id:'',catatan:'Otomatis — dibayar dapur (pass-through)'});
      ivObj.bayar_status='lunas';
      fixed++;
    }
  });
  if(fixed>0)setInvV(invVs);
  return fixed;
}

// Sync: create missing passthrough invD for invV that were converted to pass-through
// but don't have a linked invD yet (for data converted before this feature was added)
function syncMissingPTInvD(){
  const invVs=getInvV();
  const invDs=getInvD();
  const pos=getPOs();
  let created=0;

  invVs.forEach(iv=>{
    // Check if this invV is pass-through paid (payment catatan contains 'Pass-through' or 'pass-through')
    if(iv.bayar_status!=='lunas')return;
    const isPTPayment=(iv.payments||[]).some(p=>(p.catatan||'').toLowerCase().includes('pass-through'));
    if(!isPTPayment)return;

    // Check if already has a linked passthrough invD
    const alreadyHasInvD=invDs.some(d=>d.type==='passthrough'&&d.pt_inv_id===iv.id);
    if(alreadyHasInvD)return;

    // Create missing invD pass-through
    const po=pos.find(p=>p.id===iv.po_id);
    const dapur=po?.dapur||'';
    const tgl=(iv.payments||[]).slice(-1)[0]?.tgl||iv.tgl||today();
    const noInvD=nextInvNo('d');
    const newInvD={
      id:uid(),no:noInvD,tgl,dapur,po_id:iv.po_id,
      type:'passthrough',pt_inv_id:iv.id,
      items:[],total:iv.total,
      jatuh:'',catatan:`Pass-through — ${iv.no} (${iv.vendor})`,
      terima_status:'lunas',
      payments:[{id:uid(),jumlah:iv.total,tgl,rek_id:'',catatan:'Pass-through otomatis'}],
      created:new Date().toISOString()
    };
    invDs.push(newInvD);
    created++;
  });

  if(created>0){setInvD(invDs);console.log(`[MBG] Created ${created} missing pass-through invoice dapur`);}
  return created;
}

// Sync pass-through invD totals to match their linked invV — runs on startup to catch any drift
function syncPTInvDTotals(){
  const invDs=getInvD();const invVs=getInvV();let fixed=0;
  invDs.forEach(d=>{
    if(d.type!=='passthrough'||!d.pt_inv_id)return;
    const iv=invVs.find(v=>v.id===d.pt_inv_id);
    if(!iv||d.total===iv.total)return;
    const oldTotal=d.total;
    d.total=iv.total;
    // Fix auto-created payments whose amount exactly matches the wrong total
    (d.payments||[]).forEach(p=>{if(p.jumlah===oldTotal)p.jumlah=iv.total;});
    fixed++;
  });
  if(fixed>0){setInvD(invDs);console.warn('[SIMS] Auto-fixed '+fixed+' pass-through invD total(s) — drift from linked invV detected');}
  return fixed;
}

// ===== ACTIVITY LOG =====
// 500 entri = ~125 KB dari batas 1 MB dokumen Firestore. 150 masih menyisakan
// sekitar sebulan jejak audit dengan biaya ~38 KB.
const MAX_LOG=150;
function getLog(){return ST.g('log',[]);}
function setLog(d){ST.s('log',d);}
function getUserProfile(){
  // If logged in via Firebase, use email name as fallback
  const stored=_cache.user||{};
  if(!stored.nama&&_currentUser){
    stored.nama=_currentUser.email.split('@')[0];
    stored.initial=stored.nama.substring(0,2).toUpperCase();
  }
  return stored;
}


// ===== BULK UPDATE STATUS KIRIM =====
function openBulkKirim(prePoId){
  const pos=getPOs();
  const sel=document.getElementById('bulk-po-sel');
  sel.innerHTML='<option value="">— Pilih PO —</option>'+pos.map(p=>`<option value="${p.id}">${p.no} (${p.dapur})</option>`).join('');
  if(prePoId){sel.value=prePoId;}
  document.getElementById('bulk-tgl').value=new Date().toISOString().slice(0,10);
  document.getElementById('bulk-stat-sel').value='diterima';
  loadBulkItems();
  openModal('modal-bulk-kirim');
}
function loadBulkItems(){
  const poId=document.getElementById('bulk-po-sel').value;
  const wrap=document.getElementById('bulk-items-wrap');
  if(!poId){wrap.innerHTML='<div style="padding:10px;color:var(--t3)">Pilih PO dulu</div>';return;}
  const po=getPOs().find(p=>p.id===poId);
  if(!po||!po.items.length){wrap.innerHTML='<div style="padding:10px;color:var(--t3)">Tidak ada item</div>';return;}
  let html='<table style="width:100%;border-collapse:collapse">';
  html+='<thead><tr style="background:var(--s2)"><th style="padding:5px 8px;width:30px"></th><th style="padding:5px 8px;text-align:left;font-size:10px;color:var(--t3)">Item</th><th style="padding:5px 8px;font-size:10px;color:var(--t3)">Status saat ini</th><th style="padding:5px 8px;font-size:10px;color:var(--t3)">Hari kirim</th></tr></thead><tbody>';
  po.items.forEach((item,idx)=>{
    const sc=item.status_kirim==='diterima'?'tok':item.status_kirim==='dikirim'?'ttl':'tgr';
    html+=`<tr style="border-bottom:1px solid var(--bd)">
      <td style="padding:5px 8px;text-align:center"><input type="checkbox" class="bulk-item-cb" data-idx="${idx}" checked></td>
      <td style="padding:5px 8px">${item.nama} <span style="color:var(--t3);font-size:10px">${item.qty} ${item.satuan}</span></td>
      <td style="padding:5px 8px;text-align:center"><span class="tag ${sc}">${item.status_kirim||'belum'}</span></td>
      <td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--t3)">${item.hari||'—'}</td>
    </tr>`;
  });
  html+='</tbody></table>';
  wrap.innerHTML=html;
  document.getElementById('bulk-all-cb').checked=true;
  document.getElementById('bulk-count-info').textContent=po.items.length+' item';
}
function saveBulkKirim(){
  const poId=document.getElementById('bulk-po-sel').value;
  if(!poId){showToast('Pilih PO dulu!',true);return;}
  const stat=document.getElementById('bulk-stat-sel').value;
  const tgl=document.getElementById('bulk-tgl').value;
  const checked=[...document.querySelectorAll('.bulk-item-cb:checked')].map(c=>parseInt(c.dataset.idx));
  if(!checked.length){showToast('Pilih minimal 1 item!',true);return;}
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  checked.forEach(idx=>{
    if(!po.items[idx])return;
    po.items[idx].status_kirim=stat;
    if(stat==='dikirim'&&tgl)po.items[idx].tgl_kirim=tgl;
    if(stat==='diterima'&&tgl){po.items[idx].tgl_kirim=po.items[idx].tgl_kirim||tgl;po.items[idx].tgl_diterima=tgl;}
    if(stat==='belum'){po.items[idx].tgl_kirim='';po.items[idx].tgl_diterima='';}
  });
  setPOs(pos);
  addLog('update_kirim','Bulk update kirim','po',poId,po.no,stat+' · '+checked.length+' item');
  closeModal('modal-bulk-kirim');
  showToast(checked.length+' item diperbarui ke: '+stat+'!');
  if(_currentPoId===poId)showDetail(poId);else renderDaftar();
}

function addLog(action,label,refType,refId,refNo,detail){
  const u=getUserProfile();
  const now=new Date();
  const entry={
    id:uid(),
    tgl:now.toISOString().split('T')[0],
    time:now.toTimeString().split(' ')[0],
    user:u.nama||'—',
    initial:u.initial||'?',
    action,label,
    ref_type:refType,ref_id:refId||'',ref_no:refNo||'',
    detail:detail||''
  };
  const logs=getLog();
  logs.unshift(entry);// newest first
  if(logs.length>MAX_LOG)logs.splice(MAX_LOG);
  setLog(logs);
}

function saveUserProfile(){
  const nama=document.getElementById('user-nama')?.value.trim()||'';
  const initial=document.getElementById('user-initial')?.value.trim().toUpperCase()||'';
  ST.s('user',{nama,initial});
  const el=document.getElementById('user-status');
  if(el)el.textContent=nama?`✓ Tercatat sebagai "${nama}" (${initial||'?'})` :'⚠ Nama belum diisi — aktivitas akan dicatat tanpa nama';
}

function renderLog(){
  const logs=getLog();
  const fUser=document.getElementById('log-f-user')?.value||'';
  const fAction=document.getElementById('log-f-action')?.value||'';
  const fTgl=document.getElementById('log-f-tgl')?.value||'';

  // Populate user filter
  const users=[...new Set(logs.map(l=>l.user).filter(Boolean))];
  const userSel=document.getElementById('log-f-user');
  if(userSel){
    const cur=userSel.value;
    userSel.innerHTML='<option value="">Semua user</option>'+users.map(u=>`<option value="${u}" ${u===cur?'selected':''}>${u}</option>`).join('');
  }

  const filtered=logs.filter(l=>{
    if(fUser&&l.user!==fUser)return false;
    if(fTgl&&l.tgl!==fTgl)return false;
    if(fAction){
      const map={po:['buat_po','hapus_po','clone_po'],invv:['buat_invv','bayar_invv','edit_invv','konversi_pt','catat_cashback','catat_retur','catat_ongkir'],invd:['buat_invd','terima_invd'],item:['edit_item','ganti_item','hapus_item','tambah_item'],kirim:['update_kirim']};
      if(!map[fAction]?.includes(l.action))return false;
    }
    return true;
  });

  const el=document.getElementById('log-list');
  if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty">Belum ada aktivitas tercatat</div>';return;}

  const LOG_PREVIEW=10;
  const hasFilter=fUser||fAction||fTgl;
  const visible=(_logShowAll||hasFilter)?filtered:filtered.slice(0,LOG_PREVIEW);
  const hidden=filtered.length-visible.length;

  // Group by date
  const byDate={};
  visible.forEach(l=>{if(!byDate[l.tgl])byDate[l.tgl]=[];byDate[l.tgl].push(l);});

  const rows=Object.entries(byDate).map(([tgl,entries])=>`
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid var(--bd)">${new Date(tgl+'T00:00:00').toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
      ${entries.map(l=>`
        <div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--bd);align-items:flex-start">
          <div style="flex-shrink:0;font-size:10px;font-family:var(--mn);color:var(--t3);padding-top:1px;min-width:42px">${l.time.substring(0,5)}</div>
          <div style="flex-shrink:0;width:26px;height:26px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:var(--t2)">${l.initial||'?'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px"><span style="font-weight:500;color:${ACTION_COLOR[l.action]||'var(--tx)'}">${l.label}</span>${l.user?' <span style="color:var(--t3);font-size:10px">oleh '+l.user+'</span>':''}</div>
            ${l.ref_no?`<div style="font-size:11px;color:var(--t2);margin-top:1px">${l.ref_no}${l.detail?' · '+l.detail:''}</div>`:''}
            ${!l.ref_no&&l.detail?`<div style="font-size:11px;color:var(--t3);margin-top:1px">${l.detail}</div>`:''}
          </div>
        </div>`).join('')}
    </div>`).join('');

  const footer=hidden>0
    ?`<div style="text-align:center;padding:10px 0"><button class="btn bsm" onclick="_logShowAll=true;renderLog()">Lihat semua (${filtered.length} log)</button></div>`
    :_logShowAll?`<div style="text-align:center;padding:10px 0"><button class="btn bsm" onclick="_logShowAll=false;renderLog()">Sembunyikan</button></div>`:'';

  el.innerHTML=rows+footer;
}

// Init user profile UI
function initUserProfile(){
  const u=getUserProfile();
  const nEl=document.getElementById('user-nama');const iEl=document.getElementById('user-initial');
  if(nEl)nEl.value=u.nama||'';
  if(iEl)iEl.value=u.initial||'';
  saveUserProfile();
}


let _rekapPoId=null,_rekapVendor=null;

// Cleanup duplicate invoices
// Strategy 1: exact same no+vendor+po_id+tgl
// Strategy 2: same vendor+po_id+tgl+total+items (catches counter-restart duplicates)
function openRekapVendor(poId,vendorEnc){
  const vname=decodeURIComponent(vendorEnc);
  _rekapPoId=poId;_rekapVendor=vname;
  document.getElementById('rekap-vendor-title').textContent='Rekap Vendor — '+vname;
  document.getElementById('rekap-vendor-body').innerHTML=renderRekapVendorHTML(poId,vname);
  openModal('modal-rekap-vendor');
}

function renderRekapVendorHTML(poId,vname){
  const po=getPOs().find(p=>p.id===poId);if(!po)return'';
  const vInvV=getInvV().filter(iv=>iv.po_id===poId&&iv.vendor===vname);
  if(!vInvV.length)return'<p style="color:#888">Tidak ada invoice vendor ditemukan.</p>';

  // Aggregate totals
  let totalModal=0,totalMargin=0,totalOngkir=0,totalCashback=0,totalSisa=0;
  vInvV.forEach(iv=>{
    const n=invVNet(iv);
    totalModal+=iv.total;totalOngkir+=n.ongkir||0;totalSisa+=n.sisa;
    totalCashback+=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
    // margin for this invoice
    (iv.items||[]).forEach(i=>{
      const poItem=findPoItem(po,i);
      const hvPO4=i.harga_vendor_po??i.harga_vendor;if(poItem&&hvPO4>0)totalMargin+=(poItem.harga_po-hvPO4)*(poItem.qty||i.qty||0);
    });
  });
  const marginBersih=totalMargin-totalOngkir+totalCashback;
  const fmtC=v=>`<span style="font-family:monospace">${fmtF(v)}</span>`;

  const metCard=(label,val,col='')=>`<div style="background:var(--s2);border-radius:var(--r);padding:9px 12px">
    <div style="font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${label}</div>
    <div style="font-size:13px;font-weight:600;font-family:var(--mn)${col?';color:'+col:''}">${fmtF(val)}</div>
  </div>`;

  let html=`
    <div style="margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid var(--bd)">
      <div style="font-size:16px;font-weight:600;margin-bottom:2px">${vname}</div>
      <div style="font-size:11px;color:var(--t3)">${po.no} · ${po.dapur} · ${vInvV.length} invoice</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px">
        ${metCard('Total modal',totalModal)}
        ${metCard('Total margin',totalMargin,totalMargin>=0?'var(--ac)':'var(--dn)')}
        ${metCard('Ongkir',-totalOngkir||0,'var(--dn)')}
        ${metCard('Sisa bayar',totalSisa,totalSisa>0?'var(--dn)':'var(--ac)')}
      </div>
    </div>`;

  // Per invoice section
  vInvV.forEach((iv,idx)=>{
    const n=invVNet(iv);
    const ivMargin=(iv.items||[]).reduce((s,i)=>{
      const poItem=findPoItem(po,i);
      return poItem&&i.harga_vendor>0?s+(poItem.harga_po-i.harga_vendor)*(i.qty||0):s;
    },0);
    const ivMarginBersih=ivMargin-(n.ongkir||0)+(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);

    html+=`<div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--t3);margin-bottom:6px">Invoice ${idx+1} dari ${vInvV.length}</div>
      <div style="border:1px solid var(--bd);border-radius:var(--r);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--s2);border-bottom:1px solid var(--bd)">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:600;font-size:13px">${iv.no}</span>
            <span class="tag ${iv.bayar_status==='lunas'?'tok':'tno'}">${iv.bayar_status==='lunas'?'Lunas':'Belum dibayar'}</span>
            ${isPassthrough(iv.id)?'<span class="tag ttl">Pass-through</span>':''}
          </div>
          <span style="font-family:var(--mn);font-size:12px;font-weight:600">${fmtF(iv.total)}</span>
        </div>
        <table class="tbl" style="margin:0">
          <thead><tr>
            <th style="text-align:left">Item</th>
            <th>Qty</th>
            <th>Hrg PO</th>
            <th>Hrg vendor</th>
            <th style="color:var(--ac)">Margin</th>
          </tr></thead>
          <tbody>${(iv.items||[]).map(i=>{
            const poItem=findPoItem(po,i);
            const hpo=poItem?.harga_po||0;
            const qtyPO=poItem?.qty||i.qty||0;
            const mg=hpo&&i.harga_vendor>0?(hpo-i.harga_vendor)*(qtyPO):null;
            return`<tr>
              <td style="font-weight:500">${i.nama}</td>
              <td class="num">${i.qty} ${i.satuan||''}</td>
              <td class="num">${hpo?fmtF(hpo):'—'}</td>
              <td class="num">${fmtF(i.harga_vendor||0)}</td>
              <td class="num" style="font-weight:600;color:${mg===null?'var(--t3)':mg>=0?'var(--ac)':'var(--dn)'}">${mg===null?'—':fmtF(mg)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;padding:8px 12px;background:var(--s2);border-top:1px solid var(--bd)">
          <table style="font-size:11px;width:220px;border-collapse:collapse">
            <tr><td style="padding:2px 0;color:var(--t3)">Total modal</td><td style="text-align:right;font-family:var(--mn)">${fmtF(iv.total)}</td></tr>
            <tr><td style="padding:2px 0;color:var(--t3)">Total margin</td><td style="text-align:right;font-family:var(--mn);color:${ivMargin>=0?'var(--ac)':'var(--dn)'}">${fmtF(ivMargin)}</td></tr>
            ${n.ongkir?`<tr><td style="padding:2px 0;color:var(--t3)">Ongkir</td><td style="text-align:right;font-family:var(--mn);color:var(--dn)">-${fmtF(n.ongkir)}</td></tr>`:''}
            ${(iv.cashbacks||[]).length?`<tr><td style="padding:2px 0;color:var(--t3)">Cashback</td><td style="text-align:right;font-family:var(--mn);color:var(--pu)">+${fmtF((iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0))}</td></tr>`:''}
            ${n.ongkir||(iv.cashbacks||[]).length?`<tr style="border-top:1px solid var(--bd)"><td style="padding:4px 0 0;font-weight:600">Margin bersih</td><td style="text-align:right;font-family:var(--mn);font-weight:600;padding-top:4px;color:${ivMarginBersih>=0?'var(--ac)':'var(--dn)'}">${fmtF(ivMarginBersih)}</td></tr>`:''}
          </table>
        </div>
      </div>
    </div>`;
  });

  // Grand total summary
  html+=`<div style="margin-top:4px;padding:14px;background:var(--s2);border-radius:var(--r)">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--t3);margin-bottom:10px">Ringkasan total — ${vname}</div>
    ${[
      ['Total modal',fmtF(totalModal),''],
      ['Total margin',fmtF(totalMargin),totalMargin>=0?'var(--ac)':'var(--dn)'],
      ...(totalOngkir?[['Ongkos kirim','-'+fmtF(totalOngkir),'var(--dn)']]:[][Symbol.iterator]?[]:[]),
      ...(totalCashback?[['Cashback diterima','+'+fmtF(totalCashback),'var(--pu)']]:[][Symbol.iterator]?[]:[]),
    ].map(([l,v,c])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--bd);font-size:12px">
      <span style="color:var(--t2)">${l}</span><span style="font-family:var(--mn);font-weight:500${c?';color:'+c:''}">${v}</span>
    </div>`).join('')}
    <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:14px;font-weight:600">
      <span>Margin bersih</span>
      <span style="font-family:var(--mn);color:${marginBersih>=0?'var(--ac)':'var(--dn)'}">${fmtF(marginBersih)}</span>
    </div>
  </div>`;

  return html;
}

function printRekapVendor(){
  const body=document.getElementById('rekap-vendor-body').innerHTML;
  const title=document.getElementById('rekap-vendor-title').textContent;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;padding:28px 36px}
      h2{font-size:20px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}
      th{background:#f5f5f5;font-weight:600}
      th:first-child,td:first-child{text-align:left;white-space:normal;min-width:120px}
      th:not(:first-child),td:not(:first-child){text-align:right}
      button{display:none!important}
      @media print{body{padding:16px}}
    </style>
  </head><body><h2>${title}</h2>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function downloadRekapVendorExcel(){
  const po=getPOs().find(p=>p.id===_rekapPoId);if(!po)return;
  const vname=_rekapVendor;
  const vInvV=getInvV().filter(iv=>iv.po_id===_rekapPoId&&iv.vendor===vname);
  const rows=[];
  const pushH=(...cols)=>rows.push(cols);
  const br=()=>rows.push([]);

  pushH('REKAP VENDOR — '+vname);
  rows.push(['PO:',po.no,'Dapur:',po.dapur,'Tanggal:',po.date]);
  br();

  let totalModal=0,totalMargin=0,totalOngkir=0,totalCashback=0;
  vInvV.forEach((iv,idx)=>{
    const n=invVNet(iv);
    pushH(`Invoice ${idx+1}: ${iv.no}`,iv.bayar_status==='lunas'?'Lunas':'Belum dibayar');
    pushH('Item','Qty','Satuan','Hrg PO','Hrg vendor','Margin');
    let ivMargin=0;
    (iv.items||[]).forEach(i=>{
      const poItem=findPoItem(po,i);
      const hpo=poItem?.harga_po||0;
      const qtyPO=poItem?.qty||i.qty||0;
      const mg=hpo&&i.harga_vendor>0?(hpo-i.harga_vendor)*(qtyPO):0;
      ivMargin+=mg;
      rows.push([i.nama,i.qty,i.satuan,hpo,i.harga_vendor||0,mg]);
    });
    rows.push(['','','','Total modal',iv.total,0]);
    rows.push(['','','','Total margin',0,ivMargin]);
    if(n.ongkir)rows.push(['','','','Ongkir',0,-n.ongkir]);
    totalModal+=iv.total;totalMargin+=ivMargin;totalOngkir+=n.ongkir||0;
    totalCashback+=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
    br();
  });

  pushH('RINGKASAN TOTAL');
  rows.push(['Total modal',totalModal]);
  rows.push(['Total margin',totalMargin]);
  if(totalOngkir)rows.push(['Ongkos kirim',-totalOngkir]);
  if(totalCashback)rows.push(['Cashback',totalCashback]);
  rows.push(['Margin bersih',totalMargin-totalOngkir+totalCashback]);

  const safe2=v=>{if(v===null||v===undefined)return '';if(typeof v==='number')return v;return String(v).replace(/^[=+\-@\t\r]/,'');};
  const ws=XLSX.utils.aoa_to_sheet(rows.map(r=>r.map(safe2)));
  ws['!cols']=[{wch:28},{wch:8},{wch:8},{wch:14},{wch:14},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Rekap Vendor');
  XLSX.writeFile(wb,`Rekap-${vname.replace(/[^a-z0-9]/gi,'_')}-${po.no.replace(/[^a-z0-9]/gi,'_')}.xlsx`);
  showToast('Excel berhasil didownload!');
}

