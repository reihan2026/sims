// ===== INVOICE VENDOR =====
function openNewInvV(poId){openNewInvVForVendor(poId,'');}
function openNewInvVForVendor(poId,vendor){
  document.getElementById('invv-no').value=nextInvNo('v');
  document.getElementById('invv-tgl').value=today();document.getElementById('invv-vendor').value=vendor||'';
  document.getElementById('invv-jatuh').value='';document.getElementById('invv-cat').value='';document.getElementById('invv-file').value='';document.getElementById('invv-total').value='';
  const ongkirEl=document.getElementById('invv-ongkir');if(ongkirEl)ongkirEl.value='';
  // Always reset save button state when modal opens
  const saveBtn=document.getElementById('invv-save-btn');
  if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Simpan invoice';}
  document.getElementById('invv-item-boxes').innerHTML='';document.getElementById('invv-items-info').textContent='Pilih PO dan vendor dulu';
  const sb=document.getElementById('srch-invv-item');if(sb){sb.style.display='none';sb.value='';}
  const katF=document.getElementById('kat-invv-filter');if(katF){katF.style.display='none';katF.value='';}
  const pos=getPOs();document.getElementById('invv-po').innerHTML='<option value="">— Pilih PO —</option>'+pos.map(p=>`<option value="${p.id}" ${p.id===poId?'selected':''}>${p.no} — ${p.dapur}</option>`).join('');
  updateDL();if(poId)loadInvVItems();openModal('modal-invv');
}

// ===== EDIT QTY/SATUAN INVOICE VENDOR =====
function toggleInvVEdit(idx, satPO){
  const panel=document.getElementById('invv-ep-'+idx);
  if(!panel)return;
  const isOpen=panel.classList.contains('open');
  panel.classList.toggle('open');
  if(isOpen){
    // Closing: if satuan unchanged, clear konv to avoid accidental conversion
    const cb=document.querySelector('.invv-cb[data-idx="'+idx+'"]');
    if(cb&&(cb.dataset.sat||'').toLowerCase()===(cb.dataset.satOrig||'').toLowerCase()){cb.dataset.konv='';}
  }
  // If opening: refresh the satuan label in konv field
  if(!isOpen){
    const esLbl=document.getElementById('invv-es-lbl-'+idx);
    const esEl=document.getElementById('invv-es-'+idx);
    if(esLbl&&esEl)esLbl.textContent=esEl.value||satPO;
    onInvVEditChange(idx,satPO);
  }
}

function onInvVEditChange(idx, satPO){
  const eqEl=document.getElementById('invv-eq-'+idx);
  const esEl=document.getElementById('invv-es-'+idx);
  const ekEl=document.getElementById('invv-ek-'+idx);
  const kiEl=document.getElementById('invv-ki-'+idx);
  const swEl=document.getElementById('invv-sw-'+idx);
  const displayEl=document.getElementById('invv-qty-display-'+idx);
  const esLblEl=document.getElementById('invv-es-lbl-'+idx);
  const cb=document.querySelector('.invv-cb[data-idx="'+idx+'"]');
  if(!eqEl||!esEl||!cb)return;

  const qtyInv=parseFloat(eqEl.value)||0;
  const satInv=esEl.value.trim()||satPO;
  const konv=parseFloat(ekEl?.value)||0;
  const qtyOrig=parseFloat(cb.dataset.qtyOrig)||qtyInv;

  // Update satuan label in konv field
  if(esLblEl)esLblEl.textContent=satInv;

  const satChanged=satInv.toLowerCase()!==satPO.toLowerCase();

  // Update cb data-qty and data-sat (used for subtotal calc)
  cb.dataset.qty=qtyInv;
  cb.dataset.sat=satInv;

  // Konversi info
  if(konv>0&&satChanged){
    const hv=parseFloat(document.querySelector('.invv-hv[data-idx="'+idx+'"]')?.value)||0;
    const hvPerPO=hv/konv;
    if(kiEl)kiEl.innerHTML='✓ Konversi: 1 '+satInv+' = '+konv+' '+satPO+' → harga per '+satPO+' PO = <strong>'+fmtF(hvPerPO)+'</strong>';
    cb.dataset.konv=konv;
    if(swEl)swEl.textContent='';
  } else if(satChanged){
    if(kiEl)kiEl.innerHTML='';
    cb.dataset.konv='';
    if(swEl)swEl.textContent='⚠ Satuan berbeda dari PO ('+satPO+'). Isi konversi agar margin akurat.';
  } else {
    if(kiEl)kiEl.innerHTML='';
    cb.dataset.konv='';
    if(swEl)swEl.textContent='';
  }

  // Update qty display label above the panel
  if(displayEl){
    if(satChanged||qtyInv!==qtyOrig){
      displayEl.innerHTML='PO: '+qtyOrig+' '+satPO+' → Invoice: <strong>'+qtyInv+' '+satInv+'</strong>'+(satChanged&&!konv?' <span style="color:var(--wt)">⚠</span>':satChanged&&konv?' <span style="color:var(--ac)">✓</span>':'');
    } else {
      displayEl.textContent=qtyOrig+' '+satPO;
    }
  }

  // Update subtotal
  const hv=parseFloat(document.querySelector('.invv-hv[data-idx="'+idx+'"]')?.value)||0;
  const sub=qtyInv*hv;
  const subEl=document.getElementById('invv-sub-'+idx);
  if(subEl)subEl.textContent=hv>0&&qtyInv>0?fmtF(sub):'—';
  calcInvVTotal();
}

// ===== AUTO-SUGGEST HARGA VENDOR DARI HISTORI =====
function getHistoriHargaVendor(nama,vendor){
  // Returns most recent invoice price for this item+vendor combo
  const invs=getInvV();
  let best=null;
  invs.forEach(iv=>{
    if(vendor&&iv.vendor&&iv.vendor.toLowerCase()!==vendor.toLowerCase())return;
    (iv.items||[]).forEach(it=>{
      if((it.nama||'').toLowerCase()===nama.toLowerCase()&&it.harga_vendor>0){
        if(!best||iv.tgl>best.tgl){best={harga:it.harga_vendor,tgl:iv.tgl,no:iv.no,vendor:iv.vendor};}
      }
    });
  });
  return best;
}

function loadInvVItems(){
  const poId=document.getElementById('invv-po').value;const vendor=document.getElementById('invv-vendor').value.trim();
  const po=getPOs().find(p=>p.id===poId);
  const wrap=document.getElementById('invv-item-boxes');const info=document.getElementById('invv-items-info');
  if(!po){wrap.innerHTML='';info.style.display='block';info.textContent='Pilih PO dulu';return;}
  info.style.display='none';

  // Build set of already-covered items — use idx (primary) + composite key (nama||hari||deadline)
  const existingInvV=getInvV().filter(iv=>iv.po_id===poId);
  const coveredIdx=new Set();
  const coveredKey=new Set();
  existingInvV.forEach(iv=>(iv.items||[]).forEach(i=>{
    const directIdx=typeof i.idx==='number'?i.idx:-1;
    const idxFresh=directIdx>=0&&po.items[directIdx]&&po.items[directIdx].nama===i.nama;
    if(idxFresh)coveredIdx.add(directIdx);
    if(!idxFresh&&(i.hari||i.deadline))coveredKey.add(itemKey(i));
  }));
  const available=po.items.map((item,idx)=>({...item,_idx:idx})).filter(item=>{
    if(coveredIdx.has(item._idx))return false;
    if((item.hari||item.deadline)&&coveredKey.has(itemKey(item)))return false;
    // Nama-only fallback for items with stale/missing idx and no hari/deadline key
    if(!item.hari&&!item.deadline&&existingInvV.some(iv=>(iv.items||[]).some(i=>{const dIdx=typeof i.idx==='number'?i.idx:-1;const iFresh=dIdx>=0&&po.items[dIdx]&&po.items[dIdx].nama===i.nama;return!i.hari&&!i.deadline&&!iFresh&&i.nama===item.nama;})))return false;
    return true;
  });

  if(!available.length){
    wrap.innerHTML=`<div style="padding:10px 0;font-size:12px;color:var(--t3)">Semua item PO sudah masuk ke invoice vendor. Gunakan <strong>Edit qty/harga</strong> pada invoice yang sudah ada jika perlu mengubah qty atau harga.</div>`;
    calcInvVTotal();return;
  }

  const byHari={};available.forEach(i=>{const k=i.hari||'—';if(!byHari[k])byHari[k]=[];byHari[k].push(i);});
  let html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html+='<thead><tr style="background:var(--s2)"><th style="padding:6px 8px;width:30px;border-bottom:1px solid var(--bd)"><input type="checkbox" id="invv-all" onchange="document.querySelectorAll(\'.invv-cb\').forEach(c=>c.checked=this.checked);calcInvVTotal()"></th><th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Nama item</th><th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Qty (PO)</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Harga vendor (Rp/sat)</th><th style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Subtotal</th><th style="padding:6px 8px;width:28px;border-bottom:1px solid var(--bd)"></th></tr></thead><tbody>';

  Object.entries(byHari).forEach(([hari,items])=>{
    if(Object.keys(byHari).length>1)html+=`<tr><td colspan="5" style="padding:3px 8px;background:var(--bg);font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase">${hari}</td></tr>`;
    items.forEach(item=>{
      const hv=item.harga_vendor||0;
      const shouldCheck=false; // default unchecked — user harus pilih manual
      const useHarga=hv||item.harga_po||0;
      // History shown as reference only — does not affect default value
      const _histH=getHistoriHargaVendor(item.nama,vendor);
      const suggestBadge=_histH?`<div title="Pakai harga histori" style="font-size:9px;color:var(--t3);cursor:pointer;margin-top:2px" onclick="this.closest('tr').querySelector('.invv-hv').value=${_histH.harga};updateInvVHarga(this.closest('tr').querySelector('.invv-hv'),${item._idx})">Histori: ${fmtF(_histH.harga)} — ${_histH.vendor}</div>`:'';
      html+=`<tr id="invv-tr-${item._idx}" data-kat="${item.kat||''}">
        <td style="padding:7px 8px;text-align:center"><input type="checkbox" class="invv-cb" data-idx="${item._idx}" data-nama="${item.nama}" data-hari="${item.hari||''}" data-deadline="${item.deadline||''}" data-qty="${item.qty}" data-sat="${item.satuan}" data-hv="${useHarga}" data-hpo="${item.harga_po||0}" data-qty-orig="${item.qty}" data-sat-orig="${item.satuan}" data-konv="" ${shouldCheck?'checked':''} onchange="calcInvVTotal()"></td>
        <td style="padding:7px 8px" colspan="2">
          <div style="font-weight:500">${item.nama}</div>
          ${item.spek?`<div style="font-size:10px;color:var(--t3)">${item.spek}</div>`:''}
          <div id="invv-qty-display-${item._idx}" style="font-size:11px;font-family:var(--mn);color:var(--t2);margin-top:2px">${item.qty} ${item.satuan}</div>
          <div class="invv-edit-panel" id="invv-ep-${item._idx}">
            <div class="invv-edit-row">
              <div class="fg"><label>Qty invoice</label><input type="number" id="invv-eq-${item._idx}" value="${item.qty}" min="0" step="any" style="font-size:12px;padding:4px 6px;width:100%;font-family:var(--mn)" oninput="onInvVEditChange(${item._idx},'${item.satuan}')"></div>
              <div class="fg"><label>Satuan invoice</label><input type="text" id="invv-es-${item._idx}" value="${item.satuan}" style="font-size:12px;padding:4px 6px;width:100%" oninput="onInvVEditChange(${item._idx},'${item.satuan}')"></div>
              <div class="fg" style="min-width:140px"><label>1 <span id="invv-es-lbl-${item._idx}">${item.satuan}</span> invoice = <span style="color:var(--ac);font-weight:600">? ${item.satuan}</span> PO</label><input type="number" id="invv-ek-${item._idx}" placeholder="cth: 21.67" min="0" step="any" style="font-size:12px;padding:4px 6px;width:100%;font-family:var(--mn)" oninput="onInvVEditChange(${item._idx},'${item.satuan}')"></div>
            </div>
            <div id="invv-ki-${item._idx}" class="invv-konv-info"></div>
            <div id="invv-sw-${item._idx}" class="invv-sat-warn"></div>
          </div>
        </td>
        <td style="padding:7px 8px;text-align:right"><input type="number" class="invv-hv" data-idx="${item._idx}" value="${useHarga||''}" placeholder="0" min="0" style="width:110px;text-align:right;font-family:var(--mn);font-size:12px;padding:3px 6px" oninput="updateInvVHarga(this,${item._idx})">${suggestBadge}</td>
        <td style="padding:7px 8px;text-align:right;font-family:var(--mn);white-space:nowrap" id="invv-sub-${item._idx}">${useHarga>0?fmtF((item.qty||0)*useHarga):'—'}</td>
        <td style="padding:7px 8px;text-align:center"><button title="Edit qty/satuan invoice" style="background:none;border:1px solid var(--bd);border-radius:4px;cursor:pointer;padding:3px 6px;font-size:12px;color:var(--t3);line-height:1;transition:all .15s" onmouseenter="this.style.background='var(--s2)'" onmouseleave="this.style.background='none'" onclick="toggleInvVEdit(${item._idx},'${item.satuan}')">✏</button></td>
      </tr>`;
    });
  });
  html+='</tbody></table></div>';wrap.innerHTML=html;
  const srchBar=document.getElementById('srch-invv-item');
  if(srchBar){srchBar.style.display='';srchBar.value='';}
  const katFilter=document.getElementById('kat-invv-filter');
  if(katFilter){
    const kats=[...new Set(available.map(i=>i.kat).filter(Boolean))].sort();
    katFilter.innerHTML='<option value="">Semua kategori</option>'+kats.map(k=>`<option value="${k}">${k}</option>`).join('');
    katFilter.style.display=kats.length>1?'':'none';
    katFilter.value='';
  }
  calcInvVTotal();
}

function filterInvVItems(){
  const q=(document.getElementById('srch-invv-item')?.value||'').toLowerCase().trim();
  const kat=document.getElementById('kat-invv-filter')?.value||'';
  document.querySelectorAll('#invv-item-boxes tbody tr').forEach(tr=>{
    if(tr.children[0]?.colSpan>1){return;}
    const nama=tr.querySelector('td:nth-child(2)')?.textContent.toLowerCase()||'';
    const trKat=tr.dataset.kat||'';
    tr.style.display=(!q||nama.includes(q))&&(!kat||trKat===kat)?'':'none';
  });
  document.querySelectorAll('#invv-item-boxes tbody tr').forEach(tr=>{
    if(!(tr.children[0]?.colSpan>1))return;
    let next=tr.nextElementSibling;let anyVisible=false;
    while(next&&!(next.children[0]?.colSpan>1)){
      if(next.style.display!=='none')anyVisible=true;
      next=next.nextElementSibling;
    }
    tr.style.display=anyVisible||(!q&&!kat)?'':'none';
  });
}
function updateInvVHarga(input,idx){
  const hv=parseFloat(input.value)||0;const cb=document.querySelector(`.invv-cb[data-idx="${idx}"]`);
  if(cb){cb.dataset.hv=hv;const sub=(parseFloat(cb.dataset.qty)||0)*hv;const el=document.getElementById('invv-sub-'+idx);if(el)el.textContent=hv>0?fmtF(sub):'—';}
  calcInvVTotal();
}
function calcInvVTotal(){
  let total=0;document.querySelectorAll('.invv-cb:checked').forEach(cb=>{const hvEl=document.querySelector(`.invv-hv[data-idx="${cb.dataset.idx}"]`);const hv=hvEl?parseFloat(hvEl.value)||0:parseFloat(cb.dataset.hv)||0;total+=(parseFloat(cb.dataset.qty)||0)*hv;});
  const ongkir=parseFloat(document.getElementById('invv-ongkir')?.value)||0;
  document.getElementById('invv-total').value=Math.round(total+ongkir);
}
function saveInvV(){
  const saveBtn=document.getElementById('invv-save-btn');
  if(saveBtn&&saveBtn.disabled)return;
  const resetBtn=()=>{if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Simpan invoice';}};
  try{
  // Validate first BEFORE disabling button
  const no=document.getElementById('invv-no').value.trim();const tgl=document.getElementById('invv-tgl').value;const vendor=document.getElementById('invv-vendor').value.trim();const poId=document.getElementById('invv-po').value;
  if(!no||!vendor||!poId){showToast('Isi no. invoice, vendor, dan PO!',true);return;}
  if(!tgl){showToast('Isi tanggal invoice!',true);return;}
  const items=[];document.querySelectorAll('.invv-cb:checked').forEach(cb=>{
    const idx=parseInt(cb.dataset.idx);const hvEl=document.querySelector(`.invv-hv[data-idx="${idx}"]`);const hv=hvEl?parseFloat(hvEl.value)||0:parseFloat(cb.dataset.hv)||0;
    const qtyInv=parseFloat(cb.dataset.qty)||parseFloat(cb.dataset.qtyOrig)||0;
    const satOrig=cb.dataset.satOrig||'';
    const satInv=cb.dataset.sat||satOrig;
    const konv=parseFloat(cb.dataset.konv)||0;
    // satChanged only if BOTH values known and truly different
    const satChanged=satOrig&&satInv&&satOrig.toLowerCase()!==satInv.toLowerCase();
    // harga_vendor saved to PO: only apply konv when satuan genuinely changed AND konv>0
    const hvForPO=satChanged&&konv>0?hv/konv:hv;
    items.push({idx,nama:cb.dataset.nama,hari:cb.dataset.hari||'',deadline:cb.dataset.deadline||'',qty:qtyInv,satuan:satInv,satuan_po:satOrig||satInv,harga_vendor:hv,harga_vendor_po:hvForPO,konv:satChanged&&konv>0?konv:null,sat_changed:satChanged||false});
  });
  if(!items.length){showToast('Pilih minimal 1 item!',true);return;}
  // All valid — now disable button
  if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Menyimpan...';}
  // 10 second failsafe
  const failsafe=setTimeout(()=>{resetBtn();},10000);
  try{
  const total=parseFloat(document.getElementById('invv-total').value)||0;
  const pos=getPOs();const po=pos.find(p=>p.id===poId);
  if(po){items.forEach(i=>{
    // Find correct PO item by idx+nama (or fallback to nama-only if idx stale)
    let poItem=null;
    if(typeof i.idx==='number'&&po.items[i.idx]&&po.items[i.idx].nama===i.nama)poItem=po.items[i.idx];
    else poItem=po.items.find(pi=>pi.nama===i.nama)||null;
    if(poItem&&i.harga_vendor>0){poItem.harga_vendor=(i.harga_vendor_po!=null?i.harga_vendor_po:i.harga_vendor);if(vendor)poItem.vendor=vendor;if(i.konv)poItem.satuan_konv={inv:i.satuan,po:i.satuan_po,konv:i.konv};}
  });}
  const ongkir=parseFloat(document.getElementById('invv-ongkir')?.value)||0;
  const inv={id:uid(),no,tgl,vendor,po_id:poId,items,total,ongkir:ongkir||0,jatuh:document.getElementById('invv-jatuh').value,catatan:document.getElementById('invv-cat').value,bayar_status:'belum',payments:[],returs:[],cashbacks:[],edits:[],created_by:getUserProfile().nama||(_currentUser?.email||''),created:new Date().toISOString()};
  autoMaster('',vendor?[vendor]:[]);
  const done=()=>{
    clearTimeout(failsafe);
    const invs=getInvV();
    // Re-check number at save time — auto-fix if another concurrent save already used this number
    if(invs.some(iv=>iv.no===inv.no)){
      const maxN=invs.reduce((mx,iv)=>{const m=(iv.no||'').match(/INV-V-(\d+)/);return m?Math.max(mx,parseInt(m[1])):mx;},_cache.ctr_invv||0);
      _cache.ctr_invv=maxN+1;
      inv.no='INV-V-'+String(_cache.ctr_invv).padStart(3,'0');
    }
    invs.push(inv);
    // Single batch write: PO + invV + counter in one Firebase round trip
    setBatch({po:getPOs(),invv:invs,ctr_invv:_cache.ctr_invv});
    if(poId)invalidatePO(poId);
    closeModal('modal-invv');
    resetBtn();
    showToast('Invoice vendor disimpan!');
    addLog('buat_invv','Buat invoice vendor','invv',inv.id,inv.no,inv.vendor+' · '+fmtF(inv.total));
    try{
      if(_currentPoId)showDetail(_currentPoId);else if(poId)showDetail(poId);else renderInvV();
    }catch(e){console.error('render after saveInvV:',e);}
  };
  const file=document.getElementById('invv-file').files[0];
  if(file){
    const nk='invv_'+inv.id;const r=new FileReader();
    r.onload=async e=>{try{const data=await compressImageForStore(e.target.result);await saveFile(nk,data);inv.file_key=nk;}catch(e2){console.error('file save error:',e2);showToast('Invoice tersimpan, tapi lampiran gagal: '+e2.message,true);}done();};
    r.onerror=()=>{console.error('FileReader error');done();};
    r.readAsDataURL(file);
  }else done();
  }catch(e){
    console.error('saveInvV error:',e);
    clearTimeout(failsafe);
    resetBtn();
    showToast('Gagal: '+e.message,true);
  }
  }catch(e){
    console.error('saveInvV outer error:',e);
    resetBtn();
  }
}

function gantiFileInvV(invId){
  if(!confirm('Ganti file lampiran? File lama akan ditimpa.'))return;
  const input=document.createElement('input');
  input.type='file';input.accept='image/*,.pdf';
  input.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    showToast('Mengunggah file baru...');
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const nk='invv_'+invId;
        const data=await compressImageForStore(ev.target.result);
        await saveFile(nk,data);
        const invs=getInvV();const iv=invs.find(v=>v.id===invId);
        if(iv){iv.file_key=nk;setInvV(invs);}
        addLog('ganti_file','Ganti file invoice','invv',invId,'','');
        showToast('File berhasil diganti!');
        if(_currentPoId)showDetail(_currentPoId);else renderInvV();
      }catch(err){showToast('Gagal upload: '+err.message,true);}
    };
    r.onerror=()=>showToast('Gagal baca file',true);
    r.readAsDataURL(file);
  };
  input.click();
}

// ===== EDIT INVOICE DAPUR =====
function openEditInvD(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  document.getElementById('edit-invd-no').textContent=inv.no;
  document.getElementById('einvd-id').value=invId;
  document.getElementById('einvd-no').value=inv.no||'';
  document.getElementById('einvd-tgl').value=inv.tgl||'';
  document.getElementById('einvd-jatuh').value=inv.jatuh||'';
  document.getElementById('einvd-cat').value=inv.catatan||'';
  const vsEl=document.getElementById('einvd-vs');
  vsEl.innerHTML='<option value="">— Tidak ada —</option>'+getVendorSaya().map(v=>`<option value="${v.id}" ${v.id===inv.vendor_saya_id?'selected':''}>${v.nama}</option>`).join('');
  openModal('modal-edit-invd');
}
function saveEditInvD(){
  const invId=document.getElementById('einvd-id').value;
  const no=document.getElementById('einvd-no').value.trim();
  if(!no){showToast('No. invoice tidak boleh kosong!',true);return;}
  const invs=getInvD();const inv=invs.find(d=>d.id===invId);if(!inv)return;
  inv.no=no;
  inv.tgl=document.getElementById('einvd-tgl').value||inv.tgl;
  inv.jatuh=document.getElementById('einvd-jatuh').value||'';
  inv.catatan=document.getElementById('einvd-cat').value||'';
  inv.vendor_saya_id=document.getElementById('einvd-vs').value||'';
  setInvD(invs);
  addLog('edit_invd','Edit invoice dapur','invd',invId,no,'');
  closeModal('modal-edit-invd');showToast('Invoice dapur diperbarui!');
  if(_currentPoId)showDetail(_currentPoId);else renderInvD();
}

// ===== REVISI INVOICE VENDOR =====
function openEditInvV(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  if(inv.bayar_status==='lunas'&&!confirm(`Invoice ${inv.no} sudah LUNAS.\nRevisi qty/harga dapat menyebabkan inkonsistensi laporan.\n\nYakin tetap revisi?`))return;
  document.getElementById('edit-invv-no').textContent=inv.no;
  document.getElementById('einvv-id').value=invId;
  document.getElementById('einvv-jatuh').value=inv.jatuh||'';
  document.getElementById('einvv-cat-rev').value='';
  const _ePO=getPOs().find(p=>p.id===inv.po_id);
  document.getElementById('einvv-items-body').innerHTML=(inv.items||[]).map((item,i)=>{
    let poQty=null;
    if(_ePO){const pi=(typeof item.idx==='number'&&_ePO.items[item.idx]?.nama===item.nama)?_ePO.items[item.idx]:_ePO.items.find(p=>p.nama===item.nama);if(pi!=null)poQty=pi.qty;}
    const qtyMismatch=poQty!=null&&poQty!==item.qty;
    const poRef=poQty!=null?`<div style="font-size:10px;margin-top:2px;color:${qtyMismatch?'var(--wt)':'var(--t3)'}">PO: ${poQty} ${item.satuan_po||item.satuan||''}${qtyMismatch?' ⚠':''}</div>`:'';
    // Item konversi: satuan invoice memang sengaja beda dari PO — beri tahu sebelum ditimpa
    const konvHint=item.konv?`<div style="font-size:10px;margin-top:2px;color:var(--t3)">Konversi: 1 ${item.satuan} = ${item.konv} ${item.satuan_po||''} PO</div>`:'';
    return `<tr>
    <td style="font-weight:500">${item.nama}</td>
    <td><input type="text" id="einvv-sat-${i}" value="${item.satuan||''}" style="width:70px;font-size:12px;padding:4px 6px">${konvHint}</td>
    <td><input type="number" id="einvv-qty-${i}" value="${item.qty||0}" min="0" step="any" style="width:75px;font-size:12px;font-family:var(--mn);text-align:right" oninput="calcEditInvVTotal()">${poRef}</td>
    <td class="num">${fmtF(item.harga_vendor||0)}</td>
    <td><input type="number" id="einvv-hv-${i}" value="${item.harga_vendor||''}" min="0" style="width:110px;font-size:12px;font-family:var(--mn)" oninput="calcEditInvVTotal()"></td>
    <td class="num" id="einvv-sub-${i}">${fmtF((item.qty||0)*(item.harga_vendor||0))}</td>
  </tr>`;}).join('');
  calcEditInvVTotal();
  openModal('modal-edit-invv');
}
function calcEditInvVTotal(){
  const inv=getInvV().find(v=>v.id===document.getElementById('einvv-id').value);if(!inv)return;
  let total=0;(inv.items||[]).forEach((item,i)=>{const hv=parseFloat(document.getElementById('einvv-hv-'+i)?.value)||0;const qty=parseFloat(document.getElementById('einvv-qty-'+i)?.value)||0;const sub=qty*hv;total+=sub;const el=document.getElementById('einvv-sub-'+i);if(el)el.textContent=fmtF(sub);});
  document.getElementById('einvv-total-new').textContent=fmtF(total);
}
function saveEditInvV(){
  const invId=document.getElementById('einvv-id').value;const catRev=document.getElementById('einvv-cat-rev').value.trim();
  const invs=getInvV();const inv=invs.find(v=>v.id===invId);if(!inv)return;
  const oldTotal=inv.total;let newTotal=0;
  const pos=getPOs();const po=pos.find(p=>p.id===inv.po_id);
  (inv.items||[]).forEach((item,i)=>{
    const hv=parseFloat(document.getElementById('einvv-hv-'+i)?.value)||item.harga_vendor||0;
    const qtyInput=document.getElementById('einvv-qty-'+i);
    const qty=qtyInput?parseFloat(qtyInput.value)||0:item.qty||0;
    // Satuan — perlu diproses sebelum harga_vendor_po karena bisa membatalkan konversi
    const satInput=document.getElementById('einvv-sat-'+i);
    const satBaru=(satInput?satInput.value.trim():'')||item.satuan||'';
    const satLama=item.satuan||'';
    const satPO=item.satuan_po||satLama;
    const sejajarSebelumnya=satLama.toLowerCase()===satPO.toLowerCase();
    item.satuan=satBaru;
    if(satBaru.toLowerCase()===satPO.toLowerCase()){
      // Satuan invoice kembali sama dengan PO — konversi tidak berlaku lagi
      if(item.konv){delete item.konv;delete item.sat_changed;
        const pi=po&&po.items[item.idx];if(pi&&pi.satuan_konv)delete pi.satuan_konv;}
      item.satuan_po=satPO;
    } else if(sejajarSebelumnya){
      // Satuan invoice & PO tadinya sejajar → ini koreksi data, bukan konversi
      item.satuan_po=satBaru;
    }
    item.harga_vendor=hv;
    item.harga_vendor_po=item.konv?hv/item.konv:hv;
    item.qty=qty;
    newTotal+=qty*hv;
  });
  inv.total=newTotal;inv.jatuh=document.getElementById('einvv-jatuh').value;
  // Total berubah → status bayar lama bisa tidak valid lagi. Tanpa hitung ulang,
  // invoice yang tagihannya naik tetap berlabel "Lunas", tombol Rekam bayar
  // tidak muncul, dan kekurangannya hilang dari utang vendor.
  const _netBaru=invVNet_compute(inv);
  const _statusLama=inv.bayar_status;
  inv.bayar_status=(_netBaru.netTotal>0&&_netBaru.paid>=_netBaru.netTotal)?'lunas':'belum';
  if(!inv.edits)inv.edits=[];
  inv.edits.push({tgl:today(),total_lama:oldTotal,total_baru:newTotal,catatan:catRev||'Revisi harga vendor'});
  // Sync harga_vendor_po back ke PO items (consistent with saveInvV)
  if(po)(inv.items||[]).forEach(i=>{if(po.items[i.idx])po.items[i.idx].harga_vendor=(i.harga_vendor_po!=null?i.harga_vendor_po:i.harga_vendor);});
  const invds=getInvD();const ptInvD=invds.find(d=>d.type==='passthrough'&&d.pt_inv_id===invId);
  if(ptInvD)ptInvD.total=newTotal;
  addLog('edit_invv','Revisi invoice vendor','invv',inv.id,inv.no,
    oldTotal!==newTotal?fmtF(oldTotal)+' → '+fmtF(newTotal):'');
  setBatch({po:pos,invv:invs,...(ptInvD?{invd:invds}:{})});closeModal('modal-edit-invv');
  // Status turun dari lunas → beri tahu kekurangannya, jangan cuma "direvisi!"
  if(_statusLama==='lunas'&&inv.bayar_status!=='lunas')
    showToast('Invoice direvisi. Tagihan naik '+fmtF(_netBaru.sisa)+' dari yang sudah dibayar — statusnya kembali BELUM LUNAS, rekam sisa pembayarannya.',true);
  else showToast('Invoice vendor direvisi!');
  if(_currentPoId)showDetail(_currentPoId);else showDetail(inv.po_id);
}

// ===== BAYAR INVOICE VENDOR =====
function openBayarInvV(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const n=invVNet(inv);const vObj=getVendorObj(inv.vendor);
  document.getElementById('bayar-invv-id').value=invId;document.getElementById('bayar-invv-jml').value=Math.max(0,n.sisa);document.getElementById('bayar-invv-tgl').value=today();document.getElementById('bayar-invv-cat').value='';
  document.getElementById('bayar-invv-info').innerHTML=`<strong>${inv.no}</strong> — ${inv.vendor}<br>Total: <span class="num">${fmtF(inv.total)}</span>${n.retur>0?` · Net: ${fmtF(n.netTotal)}`:''} · Sisa: <span class="num r">${fmtF(n.sisa)}</span>`;
  populateRek('bayar-invv-rek','bayar-invv-rek-empty');
  // Show cashback section if: vendor marked as cashback in master, OR vendor has cashback history in any invoice
  const hasCBHistory=getInvV().some(iv=>iv.vendor===inv.vendor&&(iv.cashbacks||[]).length>0);
  const showCB=!!(vObj?.cashback||hasCBHistory);
  document.getElementById('cb-wrap').style.display=showCB?'block':'none';
  document.getElementById('bayar-cb-jml').value='';document.getElementById('bayar-cb-tgl').value=today();
  openModal('modal-bayar-invv');
}
function saveBayarInvV(){
  const invId=document.getElementById('bayar-invv-id').value;const jml=parseFloat(document.getElementById('bayar-invv-jml').value)||0;
  if(jml<=0){showToast('Jumlah bayar harus lebih dari 0!',true);return;}
  const rekId=document.getElementById('bayar-invv-rek').value;if(!rekId){showToast('Pilih rekening!',true);return;}
  const invs=getInvV();const inv=invs.find(v=>v.id===invId);if(!inv)return;
  if(!inv.payments)inv.payments=[];
  inv.payments.push({id:uid(),jumlah:jml,tgl:document.getElementById('bayar-invv-tgl').value,rek_id:rekId,catatan:document.getElementById('bayar-invv-cat').value});
  // Calculate from updated payments directly — not from cache which is stale
  const totalPaid=inv.payments.reduce((s,p)=>s+p.jumlah,0);
  const totalRetur=(inv.returs||[]).reduce((s,r)=>s+r.val,0);
  const netTotal=Math.max(0,inv.total-totalRetur);
  if(totalPaid>=netTotal)inv.bayar_status='lunas';
  const cbJml=parseFloat(document.getElementById('bayar-cb-jml').value)||0;
  if(cbJml>0){if(!inv.cashbacks)inv.cashbacks=[];inv.cashbacks.push({id:uid(),jumlah:cbJml,tgl:document.getElementById('bayar-cb-tgl').value,rek_id:rekId,catatan:'Cashback saat bayar'});}
  addLog('bayar_invv','Bayar vendor','invv',inv.id,inv.no,fmtF(jml)+' ke '+inv.vendor);setInvV(invs);closeModal('modal-bayar-invv');showToast('Pembayaran direkam!');if(_currentPage==='inv-vendor')renderInvV();else if(_currentPoId)showDetail(_currentPoId);else showDetail(inv.po_id);
}

function uploadInvVFile(invId){
  const input=document.createElement('input');
  input.type='file';input.accept='image/*,.pdf';
  input.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    showToast('Mengunggah file...');
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const nk='invv_'+invId;
        const data=await compressImageForStore(ev.target.result);
        await saveFile(nk,data);
        const invs=getInvV();const iv=invs.find(v=>v.id===invId);
        if(iv){iv.file_key=nk;setInvV(invs);}
        showToast('File berhasil diupload!');
        if(_currentPoId)showDetail(_currentPoId);else renderInvV();
      }catch(err){showToast('Gagal upload: '+err.message,true);}
    };
    r.onerror=()=>showToast('Gagal baca file',true);
    r.readAsDataURL(file);
  };
  input.click();
}

function openOngkir(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const cur=inv.ongkir||0;
  const val=prompt(`Ongkos kirim untuk ${inv.no} — ${inv.vendor}\nSaat ini: ${cur?fmtF(cur):'belum ada'}\n\nMasukkan nominal ongkir (Rp):`,cur||'');
  if(val===null)return;
  const ongkir=parseFloat(val)||0;
  const invVs=getInvV();const iv=invVs.find(v=>v.id===invId);if(!iv)return;
  iv.ongkir=ongkir||0;
  setInvV(invVs);
  addLog('catat_ongkir','Catat ongkir','invv',invId,iv.no,ongkir?fmtF(ongkir):'dihapus');
  showToast(ongkir?`Ongkir ${fmtF(ongkir)} disimpan — mengurangi margin`:'Ongkir dihapus');
  if(_currentPoId)showDetail(_currentPoId);else renderInvV();
}

function openCashback(invId,fromDetail){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  document.getElementById('cb-invv-id').value=invId;
  document.getElementById('cb-edit-id').value='';
  document.getElementById('cb-from-detail').value=fromDetail?'1':'';
  document.getElementById('cb-modal-title').textContent='Catat Cashback dari Vendor';
  document.getElementById('cb-tgl').value=today();document.getElementById('cb-cat').value='';
  const vObj=getVendorObj(inv.vendor);
  const estInfo=inv.is_pt_cashback&&inv.pt_cashback_est
    ?` · Est. cashback: ${fmtF(inv.pt_cashback_est)}${inv.pt_cashback_pct?' (~'+inv.pt_cashback_pct+'%)':''}`:'';
  document.getElementById('cb-info').textContent=inv.no+' — '+inv.vendor+estInfo+(vObj?.cashback_pct&&!inv.is_pt_cashback?' (patokan ~'+vObj.cashback_pct+'%)':'');
  document.getElementById('cb-jml').value=inv.is_pt_cashback&&inv.pt_cashback_est?inv.pt_cashback_est:'';
  populateRek('cb-rek');openModal('modal-cashback');
}
function editCashback(invId,cbId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const cb=(inv.cashbacks||[]).find(c=>c.id===cbId);if(!cb)return;
  document.getElementById('cb-invv-id').value=invId;
  document.getElementById('cb-edit-id').value=cbId;
  document.getElementById('cb-from-detail').value='1';
  document.getElementById('cb-modal-title').textContent='Edit Cashback';
  document.getElementById('cb-info').textContent=inv.no+' — '+inv.vendor;
  document.getElementById('cb-jml').value=cb.jumlah;
  document.getElementById('cb-tgl').value=cb.tgl;
  document.getElementById('cb-cat').value=cb.catatan||'';
  populateRek('cb-rek');
  document.getElementById('cb-rek').value=cb.rek_id||'';
  openModal('modal-cashback');
}
function delCashback(invId,cbId){
  if(!confirm('Hapus cashback ini?'))return;
  const invs=getInvV();const inv=invs.find(v=>v.id===invId);if(!inv)return;
  inv.cashbacks=(inv.cashbacks||[]).filter(c=>c.id!==cbId);
  addLog('hapus_cashback','Hapus cashback','invv',inv.id,inv.no,'');
  setInvV(invs);showToast('Cashback dihapus');showInvVDetail(invId);
}
function saveCashback(){
  const invId=document.getElementById('cb-invv-id').value;
  const cbId=document.getElementById('cb-edit-id').value;
  const fromDetail=document.getElementById('cb-from-detail').value==='1';
  const jml=parseFloat(document.getElementById('cb-jml').value)||0;
  if(!jml){showToast('Isi jumlah!',true);return;}
  const invs=getInvV();const inv=invs.find(v=>v.id===invId);if(!inv)return;
  if(!inv.cashbacks)inv.cashbacks=[];
  if(cbId){
    const cb=inv.cashbacks.find(c=>c.id===cbId);
    if(cb){cb.jumlah=jml;cb.tgl=document.getElementById('cb-tgl').value;cb.rek_id=document.getElementById('cb-rek').value;cb.catatan=document.getElementById('cb-cat').value;}
    addLog('edit_cashback','Edit cashback','invv',inv.id,inv.no,fmtF(jml)+' dari '+inv.vendor);
  } else {
    inv.cashbacks.push({id:uid(),jumlah:jml,tgl:document.getElementById('cb-tgl').value,rek_id:document.getElementById('cb-rek').value,catatan:document.getElementById('cb-cat').value});
    addLog('catat_cashback','Catat cashback','invv',inv.id,inv.no,fmtF(jml)+' dari '+inv.vendor);
  }
  setInvV(invs);closeModal('modal-cashback');showToast(cbId?'Cashback diperbarui!':'Cashback dicatat!');
  if(fromDetail){showInvVDetail(invId);}else if(_currentPoId){showDetail(_currentPoId);}else{showDetail(inv.po_id);}
}

// ===== RETUR =====
function openRetur(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  document.getElementById('retur-invv-id').value=invId;document.getElementById('retur-val').value='';document.getElementById('retur-tgl').value=today();document.getElementById('retur-ket').value='';
  document.getElementById('retur-info').textContent=inv.no+' — '+inv.vendor+' | Total: '+fmtF(inv.total);
  openModal('modal-retur');
}
function saveRetur(){
  const invId=document.getElementById('retur-invv-id').value;const val=parseFloat(document.getElementById('retur-val').value)||0;
  if(!val){showToast('Isi nilai retur!',true);return;}
  const invs=getInvV();const inv=invs.find(v=>v.id===invId);if(!inv)return;
  if(!inv.returs)inv.returs=[];
  const ket=document.getElementById('retur-ket').value;
  inv.returs.push({id:uid(),val,tgl:document.getElementById('retur-tgl').value,ket});
  const n=invVNet(inv);if(n.paid>=n.netTotal&&n.netTotal>0)inv.bayar_status='lunas';
  addLog('catat_retur','Catat retur','invv',inv.id,inv.no,fmtF(val)+' · '+ket);setInvV(invs);closeModal('modal-retur');showToast('Retur dicatat — tagihan berkurang '+fmtF(val));if(_currentPoId)showDetail(_currentPoId);else showDetail(inv.po_id);
}

// ===== KONVERSI INVOICE VENDOR KE PASS-THROUGH =====
function openKonversiPT(invVId){
  const inv=getInvV().find(v=>v.id===invVId);if(!inv)return;
  if(isPassthrough(invVId)){showToast('Invoice vendor ini sudah punya invoice dapur pass-through.',true);return;}
  const payments=inv.payments||[];
  document.getElementById('konv-invv-id').value=invVId;
  document.getElementById('konv-alasan').value='Pembayaran langsung dari dapur ke vendor';
  document.getElementById('konv-ada-cashback').checked=!!inv.pt_cashback_pct;
  document.getElementById('konv-cb-wrap').style.display=inv.pt_cashback_pct?'block':'none';
  document.getElementById('konv-cb-pct').value=inv.pt_cashback_pct||'';
  document.getElementById('konv-cb-nominal').value=inv.pt_cashback_pct?Math.round(inv.total*(inv.pt_cashback_pct/100)):'';
  document.getElementById('konv-info').innerHTML=`
    <strong>${inv.no}</strong> — ${inv.vendor}<br>
    <span style="font-size:12px;color:var(--t2)">Total: ${fmtF(inv.total)}</span>
    ${payments.length
      ?`<br><span style="font-size:11px;color:var(--dn)">${payments.length} pembayaran manual akan dihapus: ${payments.map(p=>fmtF(p.jumlah)).join(', ')}</span>`
      :'<br><span style="font-size:11px;color:var(--t3)">Belum ada pembayaran manual yang perlu dihapus</span>'}`;
  openModal('modal-konversi-pt');
}

function hitungKonvCB(){
  const inv=getInvV().find(v=>v.id===document.getElementById('konv-invv-id').value);
  const total=inv?.total||0;
  const pctEl=document.getElementById('konv-cb-pct');
  const nomEl=document.getElementById('konv-cb-nominal');
  if(document.activeElement===pctEl){
    const pct=Math.min(100,Math.max(0,parseFloat(pctEl.value)||0));
    pctEl.value=pct||'';
    nomEl.value=pct>0&&total>0?Math.round(total*pct/100):'';
  } else {
    const nom=parseFloat(nomEl.value)||0;
    const clampedNom=total>0?Math.min(nom,total):nom;
    if(clampedNom!==nom)nomEl.value=clampedNom||'';
    pctEl.value=clampedNom>0&&total>0?(clampedNom/total*100).toFixed(2):'';
  }
}

function saveKonversiPT(){
  const invVId=document.getElementById('konv-invv-id').value;
  const alasan=document.getElementById('konv-alasan').value.trim()||'Pembayaran langsung dari dapur ke vendor';
  const adaCB=document.getElementById('konv-ada-cashback').checked;
  const cbPct=adaCB?parseFloat(document.getElementById('konv-cb-pct').value)||0:0;
  const cbNominal=adaCB?parseFloat(document.getElementById('konv-cb-nominal').value)||0:0;
  const invVs=getInvV();const iv=invVs.find(v=>v.id===invVId);if(!iv)return;
  const hapusCount=(iv.payments||[]).length;
  const tgl=today();

  iv.payments=[{id:uid(),jumlah:iv.total,tgl,rek_id:'',catatan:`Pass-through: ${alasan}`}];
  iv.bayar_status='lunas';
  // Save cashback flag
  iv.is_pt_cashback=adaCB;
  iv.pt_cashback_pct=cbPct||null;
  iv.pt_cashback_est=cbNominal||null;
  if(!iv.edits)iv.edits=[];
  iv.edits.push({tgl,total_lama:iv.total,total_baru:iv.total,catatan:`Pass-through — ${alasan}${adaCB?' · Ada cashback est '+cbPct+'%':''}${hapusCount?' ('+hapusCount+' pembayaran manual dihapus)':''}`});
  setInvV(invVs);

  // 2. Cek apakah sudah ada invD pass-through untuk invV ini — jangan double
  const existingInvD=getInvD().find(d=>d.type==='passthrough'&&d.pt_inv_id===invVId);
  if(!existingInvD){
    // Buat invoice dapur pass-through otomatis
    const po=getPOs().find(p=>p.id===iv.po_id);
    const dapur=po?.dapur||'';
    const noInvD=nextInvNo('d');
    const invD={
      id:uid(),no:noInvD,tgl,dapur,po_id:iv.po_id,
      type:'passthrough',pt_inv_id:invVId,
      items:[],total:iv.total,
      jatuh:'',catatan:`Pass-through otomatis dari konversi ${iv.no}`,
      terima_status:'lunas',// langsung lunas karena dapur sudah bayar ke vendor
      payments:[{id:uid(),jumlah:iv.total,tgl,rek_id:'',catatan:`Pass-through: ${alasan}`}],
      created:new Date().toISOString()
    };
    const invDs=getInvD();
    if(invDs.some(d=>d.no===invD.no)){
      const maxN=invDs.reduce((mx,d)=>{const m=(d.no||'').match(/INV-D-(\d+)/);return m?Math.max(mx,parseInt(m[1])):mx;},_cache.ctr_invd||0);
      _cache.ctr_invd=maxN+1;
      invD.no='INV-D-'+String(_cache.ctr_invd).padStart(3,'0');
    }
    invDs.push(invD);setInvD(invDs);
    if(dapur)autoMaster(dapur,[]);
  }

  addLog('konversi_pt','Konversi pass-through','invv',invVId,iv.no,alasan+(hapusCount?' · '+hapusCount+' bayar dihapus':''));
  closeModal('modal-konversi-pt');
  showToast(`Invoice dikonversi ke pass-through${hapusCount?' — '+hapusCount+' pembayaran lama dihapus':''}.`);
  if(_currentPoId)showDetail(_currentPoId);else renderInvV();
}


// When month changes, reset PO filter then re-render
function filterInvVBln(){
  const poSel=document.getElementById('f-invv-po');
  if(poSel)poSel.value='';
  renderInvV();
}
function filterInvDBln(){
  const poSel=document.getElementById('f-invd-po');
  if(poSel)poSel.value='';
  renderInvD();
}

function renderInvV(){
  const invs=getInvV();/* summary computed after filter */
  const srch=(document.getElementById('srch-invv')?.value||'').toLowerCase();
  const fS=document.getElementById('f-invv-stat')?.value||'';
  const fK=document.getElementById('f-invv-kirim')?.value||'';
  const fB=document.getElementById('f-invv-bln')?.value||'';
  const fP=document.getElementById('f-invv-po')?.value||'';
  const pos=getPOs();
  // Populate month filter - guard against missing tgl
  const bSet=new Set(invs.filter(v=>v.tgl&&v.tgl.length>=7).map(v=>v.tgl.substring(0,7)));
  const fBE=document.getElementById('f-invv-bln');const cbv=fBE.value;
  populateMonthFilter(fBE,bSet,cbv);
  // Populate PO filter — filtered by selected month
  const poSel=document.getElementById('f-invv-po');const curPo=poSel?.value||'';
  const posInMonth=pos.filter(p=>!fB||invs.some(iv=>iv.po_id===p.id&&iv.tgl.startsWith(fB)));
  if(poSel)poSel.innerHTML='<option value="">Semua PO</option>'+posInMonth.map(p=>`<option value="${p.id}" ${p.id===curPo?'selected':''}>${p.no} — ${p.dapur}</option>`).join('');

  // Compute kirim status per invoice using composite key matching
  const getKirimStatus=(iv)=>{
    const po=pos.find(p=>p.id===iv.po_id);if(!po)return'unknown';
    const poItems=(iv.items||[]).map(i=>findPoItem(po,i)).filter(Boolean);
    if(!poItems.length)return'unknown';
    if(poItems.every(i=>i.status_kirim==='diterima'))return'semua';
    if(poItems.some(i=>i.status_kirim==='dikirim'||i.status_kirim==='diterima'))return'sebagian';
    return'belum';
  };

  let filtered=invs.filter(iv=>{
    if(srch&&!iv.no.toLowerCase().includes(srch)&&!iv.vendor.toLowerCase().includes(srch)&&!(iv.items||[]).some(i=>(i.nama||'').toLowerCase().includes(srch)))return false;
    if(fS&&iv.bayar_status!==fS)return false;
    if(fB&&!iv.tgl.startsWith(fB))return false;
    if(fP&&iv.po_id!==fP)return false;
    if(fK){const ks=getKirimStatus(iv);if(ks!==fK)return false;}
    return true;
  }).sort((a,b)=>(b.tgl||'').localeCompare(a.tgl||''));

  // Hitung summary dari hasil filter
  {let _bB=0,_ln=0,_tt=0;
  filtered.forEach(iv=>{const n=invVNet(iv);_tt+=n.netTotal;if(iv.bayar_status==='lunas')_ln+=n.netTotal;else if(!isPassthrough(iv.id))_bB+=n.sisa;});
  const _me=document.getElementById('invv-met');if(_me)_me.innerHTML=`<div class="met"><div class="ml">Total tagihan vendor</div><div class="mv num">${fmt(_tt)}</div></div><div class="met"><div class="ml">Belum dibayar</div><div class="mv num r">${fmt(_bB)}</div></div><div class="met"><div class="ml">Sudah lunas</div><div class="mv num g">${fmt(_ln)}</div></div><div class="met"><div class="ml">Jumlah invoice</div><div class="mv">${filtered.length}</div></div>`;}

  const el=document.getElementById('invv-list');
  if(!filtered.length){el.innerHTML='<div class="empty">Tidak ada invoice vendor</div>';_invvSelPageIds=[];updateInvVSelBar();return;}
  const _vHash=[srch,fS,fK,fB,fP].join('|');if(_vHash!==_pgHash.invv){_pg.invv=0;_pgHash.invv=_vHash;}
  const _vPg=_pg.invv;const _vPgTotal=Math.ceil(filtered.length/PG_SIZE);
  const pagedInvV=filtered.slice(_vPg*PG_SIZE,(_vPg+1)*PG_SIZE);

  el.innerHTML=pagedInvV.map(iv=>{
    try{
    const n=invVNet(iv);const po=pos.find(p=>p.id===iv.po_id);
    const vObj=getVendorObj(iv.vendor);const cbTotal=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);

    // Build per-item kirim status
    const ks=getKirimStatus(iv);
    const ksTag=ks==='semua'
      ?'<span class="tag tok" style="margin-left:3px">Semua diterima</span>'
      :ks==='sebagian'
        ?'<span class="tag twn" style="margin-left:3px">Sebagian dikirim</span>'
        :ks==='belum'
          ?'<span class="tag tgr" style="margin-left:3px">Belum dikirim</span>'
          :'';

    // Per-item kirim detail
    const invItems=iv.items||[];
    let kirimDetail='';
    if(po&&invItems.length){
      kirimDetail='<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px">';
      invItems.forEach(i=>{
        const poItem=findPoItem(po,i);
        const sk=poItem?.status_kirim||'belum';
        const skCls=sk==='diterima'?'tok':sk==='dikirim'?'ttl':'tgr';
        const skLabel=sk==='diterima'?'✓':sk==='dikirim'?'→':'○';
        const hari=poItem?.hari||i.hari||'';
        kirimDetail+=`<span class="tag ${skCls}" style="font-size:9px" title="${i.nama}${hari?' ('+hari+')':''}: ${sk}">${skLabel} ${i.nama}${hari?' ('+hari.split(/[\s,]+/)[0]+')':''}</span>`;
      });
      kirimDetail+='</div>';
    }

    // PT cashback status
    const isPTCB=iv.is_pt_cashback&&isPassthrough(iv.id);
    const ptCBDone=isPTCB&&cbTotal>0;
    const ptCBReady=isPTCB&&!ptCBDone&&iv.bayar_status==='lunas'&&ks==='semua';// selesai semua → bisa catat cashback

    const _sel=_invvSel.has(iv.id);
    return`<div class="inv-card${_invvSelMode?' selmode'+(_sel?' selon':''):''}">${_invvSelMode?`<input type="checkbox" class="invv-sel-cb" data-id="${iv.id}" ${_sel?'checked':''} onclick="toggleInvVSel('${iv.id}',this)">`:''}<div class="invv-cbody"><div class="inv-hdr">
      <div>
        <span style="font-weight:600;font-size:13px">${iv.no}</span>
        <span class="tag ${iv.bayar_status==='lunas'?'tok':'tno'}" style="margin-left:4px">${iv.bayar_status==='lunas'?'Lunas':'Belum dibayar'}</span>
        ${ksTag}
        ${isPTCB?`<span class="tag tpu" style="margin-left:3px">${ptCBDone?'✓ CB diterima':'CB pending'}</span>`:(vObj?.cashback||hasCashback(iv.vendor))?'<span class="tag tpu" style="margin-left:3px">Cashback</span>':''}
        ${(iv.edits||[]).length?`<span class="tag twn" style="margin-left:3px">Rev ${iv.edits.length}</span>`:''}
        <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin:2px 0">${iv.vendor} · ${iv.tgl}${iv.jatuh?' · Jt: '+iv.jatuh:''}</div>
        ${po?`<div style="font-size:11px;color:var(--t2)">PO: ${po.no} — ${po.dapur}</div>`:''}
        <div style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
          <span>Total: <strong>${fmtF(iv.total)}</strong></span>
          ${n.ongkir>0?`<span style="color:var(--dn)">Ongkir: ${fmtF(n.ongkir)}</span>`:''}
          ${n.retur>0?`<span style="color:var(--dn)">Retur: -${fmtF(n.retur)}</span>`:''}
          <span class="${n.sisa>0?'r':'g'}">Sisa: ${fmtF(n.sisa)}</span>
          ${cbTotal>0?`<span style="color:var(--pu)">CB: +${fmtF(cbTotal)}</span>`:''}
          ${isPTCB&&!ptCBDone&&iv.pt_cashback_est?`<span style="color:var(--pu);opacity:.7">Est. CB: ${fmtF(iv.pt_cashback_est)}${iv.pt_cashback_pct?' (~'+iv.pt_cashback_pct+'%)':''}</span>`:''}
        </div>
        ${kirimDetail}
        ${ptCBReady?`<div style="margin-top:5px;padding:5px 8px;background:var(--pbg);border-radius:var(--r);font-size:11px;color:var(--pt)">✦ Semua selesai — siap catat cashback dari vendor</div>`:''}
        ${isPTCB&&!ptCBReady&&!ptCBDone?`<div style="margin-top:4px;font-size:10px;color:var(--t3)">Cashback bisa dicatat setelah semua barang diterima dapur</div>`:''}
      </div>
      <div class="bg">
        ${iv.bayar_status!=='lunas'&&!isPassthrough(iv.id)?`<button class="btn bsm bp" onclick="openBayarInvV('${iv.id}')">Rekam bayar</button>`:iv.bayar_status!=='lunas'?'<span class="tag ttl" style="font-size:10px">Pass-through</span>':''}
        ${ptCBReady?`<button class="btn bsm bpu" onclick="openCashback('${iv.id}')">💰 Cashback</button>`:''}
        <button class="btn bsm bi" onclick="showInvVDetail('${iv.id}')">Detail</button>
        <div class="kbb">
          <button class="kbb-btn" onclick="openKbb('kbb-invv-${iv.id}',event)">⋯</button>
          <div class="kbb-menu" id="kbb-invv-${iv.id}">
            <button onclick="openKirimInvV('${iv.id}')">Update kirim</button>
            <button onclick="openEditInvV('${iv.id}')">Edit qty/harga</button>
            ${!n.ongkir?`<button onclick="openOngkir('${iv.id}')">+ Ongkos kirim</button>`:''}
            ${!isPTCB&&(vObj?.cashback||hasCashback(iv.vendor))&&!cbTotal?`<button onclick="openCashback('${iv.id}')">+ Cashback</button>`:''}
            <button onclick="openRetur('${iv.id}')">+ Retur</button>
            ${!isPassthrough(iv.id)?`<button onclick="openKonversiPT('${iv.id}')">Konversi PT</button>`:''}
            ${iv.file_key?`<button onclick="viewNota('${iv.file_key}','${iv.no}')">📎 Lihat file</button>`:`<button onclick="uploadInvVFile('${iv.id}')">📎 Upload file</button>`}
            ${po?`<button onclick="showDetail('${po.id}')">Lihat PO</button>`:''}
            <button onclick="printInvV('${iv.id}')">🖨 Cetak</button>
            <div class="kbb-div"></div>
            <button class="kd" onclick="delInvV('${iv.id}')">Hapus</button>
          </div>
        </div>
      </div>
    </div>
    ${(iv.edits||[]).length?`<div style="margin-top:4px;padding:4px 8px;background:var(--wbg);border-radius:var(--r);font-size:10px;color:var(--wt)">Revisi: ${iv.edits.map(e=>`${e.tgl} — ${e.catatan}`).join(' · ')}</div>`:''}
    ${(iv.payments||[]).length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">${iv.payments.map(p=>`<div class="pay-row"><span>${p.tgl} · <strong>${getRekNama(p.rek_id)}</strong></span><span class="num r">-${fmtF(p.jumlah)}</span></div>`).join('')}</div>`:''}
    </div></div>`;
    }catch(e){console.error('renderInvV card error:',iv?.id,e);return`<div class="inv-card" style="color:var(--dn);font-size:12px;padding:10px">⚠ Error render invoice ${iv?.no||iv?.id||'?'} — coba hapus dan buat ulang</div>`;}
  }).join('')+_pgBar('invv','pgInvV',_vPg,_vPgTotal,filtered.length);

  // Mode pilih: baris "pilih semua" (halaman ini) di atas daftar + segarkan bar aksi
  if(_invvSelMode){
    const pageIds=pagedInvV.map(iv=>iv.id);
    const allChecked=pageIds.length>0&&pageIds.every(id=>_invvSel.has(id));
    el.insertAdjacentHTML('afterbegin',`<label class="invv-selall"><input type="checkbox" class="invv-sel-cb" ${allChecked?'checked':''} onclick="invVSelAllPage(this)" style="width:16px;height:16px"> Pilih semua di halaman ini (${pageIds.length})</label>`);
    _invvSelPageIds=pageIds;
  }
  updateInvVSelBar();
}

// ===== MODE PILIH / BULK ACTIONS INVOICE VENDOR =====
let _invvSelMode=false;
const _invvSel=new Set();
let _invvSelPageIds=[];

function toggleInvVSelMode(){
  _invvSelMode=!_invvSelMode;
  if(!_invvSelMode)_invvSel.clear();
  const btn=document.getElementById('invv-pilih-btn');
  if(btn){btn.classList.toggle('bp',_invvSelMode);btn.textContent=_invvSelMode?'✕ Batal pilih':'☑ Pilih';}
  renderInvV();
}
function toggleInvVSel(id,cb){
  if(cb.checked)_invvSel.add(id);else _invvSel.delete(id);
  cb.closest('.inv-card')?.classList.toggle('selon',cb.checked);
  updateInvVSelBar();
}
function invVSelAllPage(cb){
  _invvSelPageIds.forEach(id=>{if(cb.checked)_invvSel.add(id);else _invvSel.delete(id);});
  renderInvV();
}
function updateInvVSelBar(){
  const bar=document.getElementById('invv-sel-bar');if(!bar)return;
  bar.style.display=_invvSelMode?'flex':'none';
  const c=document.getElementById('invv-sel-count');
  if(c)c.textContent=_invvSel.size+' dipilih';
}
function _selectedInvV(){return getInvV().filter(iv=>_invvSel.has(iv.id));}

// ----- Bulk rekam bayar -----
function openBulkBayarInvV(){
  const sel=_selectedInvV();
  if(!sel.length){showToast('Belum ada invoice dipilih',true);return;}
  // Hanya invoice yang belum lunas & bukan pass-through yang bisa dibayar
  const payable=sel.filter(iv=>iv.bayar_status!=='lunas'&&!isPassthrough(iv.id));
  const skipLunas=sel.filter(iv=>iv.bayar_status==='lunas').length;
  const skipPT=sel.filter(iv=>iv.bayar_status!=='lunas'&&isPassthrough(iv.id)).length;
  if(!payable.length){showToast('Tidak ada invoice yang bisa dibayar (semua sudah lunas / pass-through)',true);return;}
  populateRek('bulk-bayar-invv-rek','bulk-bayar-invv-rek-empty');
  document.getElementById('bulk-bayar-invv-tgl').value=today();
  let total=0;
  const rows=payable.map(iv=>{const n=invVNet(iv);total+=Math.max(0,n.sisa);return`<div class="pay-row"><span>${iv.no} · ${iv.vendor}</span><span class="num r">${fmtF(Math.max(0,n.sisa))}</span></div>`;}).join('');
  const skips=[];if(skipLunas)skips.push(skipLunas+' sudah lunas');if(skipPT)skips.push(skipPT+' pass-through');
  document.getElementById('bulk-bayar-invv-info').innerHTML=
    `<div style="margin-bottom:4px;color:var(--t2)">Akan dicatat lunas (${payable.length} invoice):</div>`+
    `<div style="max-height:180px;overflow-y:auto;padding:2px 0;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)">${rows}</div>`+
    `<div class="pay-row" style="font-weight:600;margin-top:5px"><span>Total</span><span class="num r">${fmtF(total)}</span></div>`+
    (skips.length?`<div style="margin-top:6px;font-size:11px;color:var(--t3)">${skips.join(' · ')} dilewati.</div>`:'');
  document.getElementById('bulk-bayar-invv-save').dataset.ids=payable.map(iv=>iv.id).join(',');
  openModal('modal-bulk-bayar-invv');
}
function saveBulkBayarInvV(){
  const rekId=document.getElementById('bulk-bayar-invv-rek').value;
  if(!rekId){showToast('Pilih rekening!',true);return;}
  const tgl=document.getElementById('bulk-bayar-invv-tgl').value||today();
  const ids=(document.getElementById('bulk-bayar-invv-save').dataset.ids||'').split(',').filter(Boolean);
  const invs=getInvV();let n=0,sum=0;
  ids.forEach(id=>{
    const inv=invs.find(v=>v.id===id);if(!inv)return;
    if(inv.bayar_status==='lunas'||isPassthrough(inv.id))return;
    const net=invVNet(inv);const sisa=Math.max(0,net.sisa);if(sisa<=0){inv.bayar_status='lunas';return;}
    if(!inv.payments)inv.payments=[];
    inv.payments.push({id:uid(),jumlah:sisa,tgl,rek_id:rekId,catatan:'Bulk rekam bayar'});
    const paid=inv.payments.reduce((s,p)=>s+p.jumlah,0);
    const retur=(inv.returs||[]).reduce((s,r)=>s+r.val,0);
    if(paid>=Math.max(0,inv.total-retur))inv.bayar_status='lunas';
    n++;sum+=sisa;
  });
  addLog('bayar_invv','Bulk bayar vendor','invv','','',n+' invoice · '+fmtF(sum));
  setInvV(invs);closeModal('modal-bulk-bayar-invv');
  showToast(n+' invoice dicatat lunas ('+fmtF(sum)+')');
  toggleInvVSelMode();
}

// ----- Bulk update status kirim -----
function openBulkKirimInvV(){
  const sel=_selectedInvV();
  if(!sel.length){showToast('Belum ada invoice dipilih',true);return;}
  document.getElementById('bulk-kirim-invv-stat').value='diterima';
  document.getElementById('bulk-kirim-invv-tgl').value=today();
  const pos=getPOs();
  let totalItem=0;
  const rows=sel.map(iv=>{
    const po=pos.find(p=>p.id===iv.po_id);
    const cnt=po?(iv.items||[]).map(i=>findPoItem(po,i)).filter(Boolean).length:0;
    totalItem+=cnt;
    return`<div class="pay-row"><span>${iv.no} · ${iv.vendor}</span><span style="color:var(--t3)">${cnt} item</span></div>`;
  }).join('');
  document.getElementById('bulk-kirim-invv-info').innerHTML=
    `<div style="margin-bottom:4px;color:var(--t2)">Status kirim akan diubah untuk ${totalItem} item PO di ${sel.length} invoice:</div>`+
    `<div style="max-height:180px;overflow-y:auto;padding:2px 0;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)">${rows}</div>`;
  document.getElementById('bulk-kirim-invv-save').dataset.ids=sel.map(iv=>iv.id).join(',');
  openModal('modal-bulk-kirim-invv');
}
function saveBulkKirimInvV(){
  const stat=document.getElementById('bulk-kirim-invv-stat').value;
  const tgl=document.getElementById('bulk-kirim-invv-tgl').value||today();
  const ids=(document.getElementById('bulk-kirim-invv-save').dataset.ids||'').split(',').filter(Boolean);
  const pos=getPOs();const invs=getInvV();
  const touched=new Set();let nItem=0;
  ids.forEach(id=>{
    const inv=invs.find(v=>v.id===id);if(!inv)return;
    const po=pos.find(p=>p.id===inv.po_id);if(!po)return;
    (inv.items||[]).forEach(i=>{
      const item=findPoItem(po,i);if(!item||touched.has(item))return;
      touched.add(item);
      item.status_kirim=stat;item.tgl_kirim=tgl;
      if(stat==='diterima'&&!item.tgl_diterima)item.tgl_diterima=tgl;
      nItem++;
    });
  });
  addLog('update_kirim','Bulk update kirim','invv','','',stat+' · '+nItem+' item · '+ids.length+' invoice');
  setPOs(pos);closeModal('modal-bulk-kirim-invv');
  showToast(nItem+' item diperbarui ke "'+stat+'"');
  toggleInvVSelMode();
}
function delInvV(id){
  const _chkInvV=getInvV().find(v=>v.id===id);
  if(_chkInvV?.bayar_status==='lunas'&&!confirm(`Invoice ${_chkInvV.no} sudah LUNAS.\nMenghapus invoice lunas dapat menyebabkan inkonsistensi cashflow.\n\nYakin tetap hapus?`))return;
  if(!confirm('Hapus invoice vendor? Harga vendor pada item PO terkait akan direset (kecuali jika masih dicakup invoice lain).'))return;
  const inv=getInvV().find(v=>v.id===id);
  if(inv){
    const pos=getPOs();const po=pos.find(p=>p.id===inv.po_id);
    if(po){
      // Only reset item if no other invV for this PO covers the same item
      const remainingInvV=getInvV().filter(v=>v.id!==id&&v.po_id===inv.po_id);
      (inv.items||[]).forEach(i=>{
        const poItem=(typeof i.idx==='number'&&po.items[i.idx]?.nama===i.nama)
          ?po.items[i.idx]
          :po.items.find(pi=>pi.nama===i.nama);
        if(!poItem||poItem.status_kirim==='diterima')return;
        const coveringIv=remainingInvV.find(ov=>(ov.items||[]).some(oi=>oi.nama===poItem.nama));
        if(coveringIv){
          // Update with the covering invV's data instead of resetting
          const oi=(coveringIv.items||[]).find(x=>x.nama===poItem.nama);
          if(oi&&oi.harga_vendor>0){
            poItem.harga_vendor=oi.harga_vendor_po!=null?oi.harga_vendor_po:oi.harga_vendor;
            poItem.vendor=coveringIv.vendor;
          }
        } else {
          poItem.harga_vendor=0;poItem.vendor='';
          if(poItem.satuan_konv)delete poItem.satuan_konv;
        }
      });
      setPOs(pos);
    }
  }
  const _delInvVNo=inv?.no||id;const _delInvVVendor=inv?.vendor||'';
  addLog('hapus_invv','Hapus invoice vendor','invv',id,_delInvVNo,_delInvVVendor+(inv?.total?' · '+fmtF(inv.total):''));
  setInvV(getInvV().filter(v=>v.id!==id));
  const _ptInvD=getInvD().find(d=>d.type==='passthrough'&&d.pt_inv_id===id);
  if(_ptInvD)setInvD(getInvD().filter(d=>d.id!==_ptInvD.id));
  if(_currentPoId)showDetail(_currentPoId);else renderInvV();
  showToast('Invoice dihapus — harga vendor direset');
}

