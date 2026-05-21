// ===== INVOICE DAPUR =====
let invDRows=0;
function openNewInvD(poId){
  document.getElementById('invd-no').value=nextInvNo('d');
  document.getElementById('invd-tgl').value=today();document.getElementById('invd-dapur').value='';document.getElementById('invd-jatuh').value='';document.getElementById('invd-cat').value='';document.getElementById('invd-total').value='';
  document.querySelector('input[name="invd-type"][value="markup"]').checked=true;document.getElementById('invd-pt-wrap').style.display='none';document.getElementById('invd-items-wrap').style.display='block';
  invDRows=0;
  const invdBoxes=document.getElementById('invd-item-boxes');
  if(invdBoxes)invdBoxes.innerHTML='';
  const invdInfo=document.getElementById('invd-items-info');
  if(invdInfo)invdInfo.textContent='';
  const pos=getPOs();document.getElementById('invd-po').innerHTML='<option value="">— Pilih PO —</option>'+pos.map(p=>`<option value="${p.id}" ${p.id===poId?'selected':''}>${p.no} — ${p.dapur}</option>`).join('');
  // PT dropdown: only unpaid invV that don't already have a linked pass-through invD
  const ptUsedIds=new Set(getInvD().filter(d=>d.type==='passthrough'&&d.pt_inv_id).map(d=>d.pt_inv_id));
  const availablePTInvV=getInvV().filter(iv=>iv.bayar_status!=='lunas'&&!ptUsedIds.has(iv.id));
  document.getElementById('invd-pt-inv').innerHTML='<option value="">— Pilih invoice vendor —</option>'+availablePTInvV.map(iv=>`<option value="${iv.id}">${iv.no} — ${iv.vendor} (${fmtF(iv.total)})</option>`).join('')+(availablePTInvV.length===0?'<option disabled>Tidak ada invoice vendor yang tersedia</option>':'');
  // Populate vendor saya dropdown
  const vsEl=document.getElementById('invd-vendor-saya');
  if(vsEl){const vs=getVendorSaya();vsEl.innerHTML='<option value="">— Tanpa kop (internal) —</option>'+vs.map(v=>`<option value="${v.id}">${v.nama}</option>`).join('');}
  updateDL();if(poId)loadInvDItems();openModal('modal-invd');
}
function toggleInvDType(){
  const pt=document.querySelector('input[name="invd-type"]:checked').value==='passthrough';
  document.getElementById('invd-pt-wrap').style.display=pt?'block':'none';
  document.getElementById('invd-items-wrap').style.display=pt?'none':'block';
  if(pt){document.getElementById('invd-total').value='';}
  else{calcInvDTotal();}
}
function loadPTInv(){const invId=document.getElementById('invd-pt-inv').value;const inv=getInvV().find(v=>v.id===invId);if(inv)document.getElementById('invd-total').value=inv.total;}
function loadInvDItems(){
  const poId=document.getElementById('invd-po').value;const po=getPOs().find(p=>p.id===poId);if(!po)return;
  document.getElementById('invd-dapur').value=document.getElementById('invd-dapur').value||po.dapur;
  const isPT=document.querySelector('input[name="invd-type"]:checked')?.value==='passthrough';
  if(isPT){document.getElementById('invd-total').value='';document.getElementById('invd-pt-inv').value='';return;}

  const boxes=document.getElementById('invd-item-boxes');
  const info=document.getElementById('invd-items-info');
  if(boxes)boxes.innerHTML='';if(info)info.textContent='';

  // Build set of already-covered items from ALL existing invD for this PO
  const existingInvD=getInvD().filter(d=>d.po_id===poId);

  // Count how many times each key is covered by existing invD
  // Count-based (not Set) to correctly handle multiple PO items sharing the same nama+hari+deadline
  const coveredCount=new Map();

  existingInvD.forEach(d=>{
    let invItems=[];
    if(d.type==='passthrough'&&d.pt_inv_id){
      // Pass-through: derive items from the linked invV
      const linkedInvV=getInvV().find(iv=>iv.id===d.pt_inv_id);
      if(linkedInvV)invItems=(linkedInvV.items||[]).map(i=>{
        // Enrich with PO item data to get hari/deadline
        const poItem=findPoItem(po,i);
        return{nama:i.nama,hari:poItem?.hari||'',deadline:poItem?.deadline||''};
      });
    } else {
      invItems=(d.items||[]).map(i=>{
        const nama=(i.nama||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
        return{nama,hari:i.hari||'',deadline:i.deadline||''};
      });
    }
    invItems.forEach(i=>{const k=itemKey(i);coveredCount.set(k,(coveredCount.get(k)||0)+1);});
  });

  // Build source items from po.items by index — preserves ALL items including those with duplicate nama+hari+deadline
  const{itemInvV:_dItemInvV}=buildLookup(poId);
  const sourceItems=po.items.map((item,pidx)=>{
    const linkedInvV=_dItemInvV[pidx];
    let invVItem=null;
    if(linkedInvV){
      // Match by stored idx first (exact), fallback to nama-only
      invVItem=(linkedInvV.items||[]).find(i=>typeof i.idx==='number'&&i.idx===pidx&&i.nama===item.nama);
      if(!invVItem)invVItem=(linkedInvV.items||[]).find(i=>i.nama===item.nama);
    }
    return{
      _idx:pidx,nama:item.nama,
      qty:invVItem?.qty||item.qty,satuan:invVItem?.satuan||item.satuan,
      harga_ref:invVItem?.harga_vendor||item.harga_vendor||0,harga:item.harga_po||0,
      hari:item.hari||'',deadline:item.deadline||'',
      invv_id:linkedInvV?.id||null,_noInvV:!linkedInvV
    };
  });

  // Filter: count-based — each existing invD item "consumes" one slot per key; remaining slots are shown
  const remaining=new Map(coveredCount);
  const available=sourceItems.filter(i=>{
    const k=itemKey(i);
    const r=remaining.get(k)||0;
    if(r>0){remaining.set(k,r-1);return false;}
    return true;
  });

  if(!available.length){
    if(boxes)boxes.innerHTML=`<div class="empty" style="padding:10px">Semua item PO sudah diinvoice ke dapur</div>`;
    calcInvDTotal();return;
  }

  // Group by hari
  const byHari={};available.forEach(i=>{const k=i.hari||'—';if(!byHari[k])byHari[k]=[];byHari[k].push(i);});

  const noInvVCount=available.filter(i=>i._noInvV).length;
  let html=noInvVCount?`<div style="margin-bottom:8px;padding:8px 10px;background:var(--wbg);border:1px solid var(--wb);border-radius:var(--r);font-size:12px;color:var(--wt)">⚠ ${noInvVCount} item belum memiliki invoice vendor — pastikan sudah diinput sebelum menagih ke dapur.</div>`:'';
  html+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  html+=`<thead><tr style="background:var(--s2)">
    <th style="padding:6px 8px;width:30px;border-bottom:1px solid var(--bd)"><input type="checkbox" id="invd-all" checked onchange="document.querySelectorAll(\'.invd-cb\').forEach(c=>c.checked=this.checked);calcInvDTotal()"></th>
    <th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Nama item</th>
    <th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Qty</th>
    <th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Hrg vendor (ref)</th>
    <th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">Harga ke dapur (Rp)</th>
    <th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3)">+%</th>
    <th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-size:10px;font-weight:600;color:var(--t3);text-align:right">Subtotal</th>
  </tr></thead><tbody>`;

  Object.entries(byHari).forEach(([hari,items])=>{
    if(Object.keys(byHari).length>1)html+=`<tr><td colspan="7" style="padding:3px 8px;background:var(--bg);font-size:10px;font-weight:600;color:var(--t3);text-transform:uppercase">${hari}</td></tr>`;
    items.forEach((item,ri)=>{
      const rid='invd-'+Date.now()+'-'+ri+'-'+hari.replace(/[^a-z0-9]/gi,'_');
      const pct=item.harga_ref>0&&item.harga>item.harga_ref?(((item.harga-item.harga_ref)/item.harga_ref)*100).toFixed(1):null;
      const sub=(item.qty||0)*(item.harga||0);
      html+=`<tr style="border-bottom:1px solid var(--bd)">
        <td style="padding:7px 8px;text-align:center"><input type="checkbox" class="invd-cb" id="cb-${rid}"
          data-nama="${(item.nama||'').replace(/"/g,'&quot;')}"
          data-qty="${item.qty||0}" data-sat="${item.satuan||''}"
          data-hv="${item.harga_ref||0}" data-hari="${item.hari||''}" data-deadline="${item.deadline||''}" data-invv-id="${item.invv_id||''}"
          checked onchange="calcInvDTotal()"></td>
        <td style="padding:7px 8px;font-weight:500">${item.nama}${item.deadline?'<div style="font-size:10px;color:var(--t3)">Deadline: '+item.deadline+'</div>':''}${item._noInvV?'<div style="font-size:10px;color:var(--wt);margin-top:2px">⚠ Belum ada invoice vendor</div>':''}<input type="text" id="icat-${rid}" placeholder="Catatan item (opsional)…" style="display:block;margin-top:4px;width:100%;font-size:11px;font-weight:normal;padding:2px 5px;border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);color:var(--t1)"></td>
        <td style="padding:7px 8px;text-align:center;font-family:var(--mn);white-space:nowrap">${item.qty} ${item.satuan}</td>
        <td style="padding:7px 8px;font-family:var(--mn);font-size:11px;color:var(--t3)">${item.harga_ref?fmtF(item.harga_ref):'—'}</td>
        <td style="padding:7px 8px"><input type="number" class="invd-h" id="h-${rid}" value="${item.harga||''}" min="0"
          style="width:110px;text-align:right;font-family:var(--mn);font-size:12px;padding:3px 6px"
          data-rid="${rid}" oninput="updateInvDHarga(this)"></td>
        <td style="padding:7px 8px;font-size:11px;font-family:var(--mn);color:var(--t3)" id="pct-${rid}">${pct!==null?'+'+pct+'%':'—'}</td>
        <td style="padding:7px 8px;text-align:right;font-family:var(--mn)" id="sub-${rid}">${sub>0?fmtF(sub):'—'}</td>
      </tr>`;
    });
  });
  html+='</tbody></table>';
  if(boxes)boxes.innerHTML=html;
  calcInvDTotal();
}

function updateInvDHarga(input){
  const rid=input.dataset.rid;
  const cb=document.getElementById('cb-'+rid);
  if(!cb)return;
  const qty=parseFloat(cb.dataset.qty)||0;
  const hv=parseFloat(cb.dataset.hv)||0;
  const h=parseFloat(input.value)||0;
  const sub=qty*h;
  const pct=hv>0&&h>hv?(((h-hv)/hv)*100).toFixed(1):null;
  const subEl=document.getElementById('sub-'+rid);
  const pctEl=document.getElementById('pct-'+rid);
  if(subEl)subEl.textContent=sub>0?fmtF(sub):'—';
  if(pctEl)pctEl.textContent=pct!==null?'+'+pct+'%':'—';
  calcInvDTotal();
}

function calcInvDTotal(){
  let total=0;
  document.querySelectorAll('.invd-cb:checked').forEach(cb=>{
    const rid=cb.id.replace('cb-','');
    const h=parseFloat(document.getElementById('h-'+rid)?.value)||0;
    total+=(parseFloat(cb.dataset.qty)||0)*h;
  });
  const el=document.getElementById('invd-total');
  if(el)el.value=total>0?Math.round(total):'';
}
function saveInvD(){
  const saveInvDBtn=document.querySelector('#modal-invd .btn.bp');
  if(saveInvDBtn&&saveInvDBtn.disabled)return;
  // Validate BEFORE disabling
  const no=document.getElementById('invd-no').value.trim();const tgl=document.getElementById('invd-tgl').value;const dapur=document.getElementById('invd-dapur').value.trim();const poId=document.getElementById('invd-po').value;
  if(!no||!dapur){showToast('Isi no. invoice dan dapur!',true);return;}
  const isPT=document.querySelector('input[name="invd-type"]:checked').value==='passthrough';
  let items=[];let total=0;let ptId='';
  if(isPT){
    ptId=document.getElementById('invd-pt-inv').value;
    const ptInv=getInvV().find(v=>v.id===ptId);
    if(!ptInv){showToast('Pilih invoice vendor untuk pass-through!',true);return;}
    const existingPT=getInvD().find(d=>d.type==='passthrough'&&d.pt_inv_id===ptId);
    if(existingPT){showToast('Invoice vendor ini sudah diklaim pass-through oleh invoice lain!',true);return;}
    total=ptInv.total;
  }else{
    document.querySelectorAll('.invd-cb:checked').forEach(cb=>{
      const rid=cb.id.replace('cb-','');
      const nama=(cb.dataset.nama||'').trim();
      if(!nama)return;
      const qty=parseFloat(cb.dataset.qty)||0;
      const satuan=cb.dataset.sat||'';
      const harga_dapur=parseFloat(document.getElementById('h-'+rid)?.value)||0;
      const hari=cb.dataset.hari||'';
      const deadline=cb.dataset.deadline||'';
      const invv_id=cb.dataset.invvId||'';
      const catatan_item=document.getElementById('icat-'+rid)?.value.trim()||'';
      items.push({nama,qty,satuan,harga_dapur,hari,deadline,invv_id,catatan_item});
    });
    if(!items.length){showToast('Pilih minimal 1 item!',true);return;}
    total=items.reduce((s,i)=>s+(i.qty||0)*(i.harga_dapur||0),0);
  }
  const vendor_saya_id=document.getElementById('invd-vendor-saya')?.value||'';
  const inv={id:uid(),no,tgl,dapur,po_id:poId,type:isPT?'passthrough':'markup',pt_inv_id:ptId,items,total,jatuh:document.getElementById('invd-jatuh').value,catatan:document.getElementById('invd-cat').value,vendor_saya_id,terima_status:'belum',payments:[],created_by:getUserProfile().nama||(_currentUser?.email||''),created:new Date().toISOString()};
  const invs=getInvD();
  // Re-check number at save time — auto-fix if another concurrent save already used this number
  if(invs.some(id=>id.no===inv.no)){
    const maxN=invs.reduce((mx,id)=>{const m=(id.no||'').match(/INV-D-(\d+)/);return m?Math.max(mx,parseInt(m[1])):mx;},_cache.ctr_invd||0);
    _cache.ctr_invd=maxN+1;
    inv.no='INV-D-'+String(_cache.ctr_invd).padStart(3,'0');
  }
  invs.push(inv);
  // Batch write invD + counter in one round trip
  setBatch({invd:invs,ctr_invd:_cache.ctr_invd});
  if(poId)invalidatePO(poId);
  autoMaster(dapur,[]);
  addLog('buat_invd','Buat invoice dapur','invd',inv.id,inv.no,dapur+' · '+fmtF(inv.total));closeModal('modal-invd');showToast('Invoice ke dapur disimpan!');if(_currentPoId)showDetail(_currentPoId);else if(poId)showDetail(poId);else renderInvD();
}

// ===== TERIMA DARI DAPUR =====
function openTerima(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const recv=(inv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
  const isPT=inv.type==='passthrough';
  document.getElementById('terima-id').value=invId;
  document.getElementById('terima-jml').value=Math.max(0,inv.total-recv);
  document.getElementById('terima-tgl').value=today();
  document.getElementById('terima-cat').value='';
  document.getElementById('terima-cb-jml').value='';
  document.getElementById('terima-info').innerHTML=`<strong>${inv.no}</strong>${isPT?` <span class="tag tpu">Pass-through</span>`:''} — ${inv.dapur}<br>Total: <span class="num">${fmtF(inv.total)}</span> · Sisa: <span class="num a">${fmtF(inv.total-recv)}</span>${isPT?`<br><span style="font-size:11px;color:var(--pu)">Invoice pass-through — pembayaran langsung ke vendor, tidak masuk rekening kamu.</span>`:''}`;
  // For passthrough, hide rekening selector
  const rekWrap=document.getElementById('terima-rek-wrap');
  if(rekWrap)rekWrap.style.display=isPT?'none':'block';
  if(!isPT)populateRek('terima-rek','terima-rek-empty');
  // Cashback section: show if any invoice vendor for this PO has cashback vendor
  const poInvV=getInvV().filter(v=>v.po_id===inv.po_id);
  const cbInvV=poInvV.filter(iv=>{const vObj=getVendorObj(iv.vendor);return vObj?.cashback&&iv.bayar_status==='lunas'&&!(iv.cashbacks||[]).length;});
  const cbWrap=document.getElementById('terima-cb-wrap');
  if(cbWrap){
    cbWrap.style.display=cbInvV.length?'block':'none';
    if(cbInvV.length){
      document.getElementById('terima-cb-invv').innerHTML='<option value="">— Pilih invoice vendor —</option>'+cbInvV.map(iv=>`<option value="${iv.id}">${iv.no} — ${iv.vendor}</option>`).join('');
      populateRek('terima-cb-rek');
    }
  }
  openModal('modal-terima');
}
function saveTerima(){
  const invId=document.getElementById('terima-id').value;const jml=parseFloat(document.getElementById('terima-jml').value)||0;
  if(jml<=0){showToast('Jumlah terima harus lebih dari 0!',true);return;}
  const invs=getInvD();const inv=invs.find(d=>d.id===invId);if(!inv)return;
  if(!inv.payments)inv.payments=[];
  const isPT=inv.type==='passthrough';
  const rekId=isPT?'':(document.getElementById('terima-rek').value||'');
  const tgl=document.getElementById('terima-tgl').value;
  inv.payments.push({id:uid(),jumlah:jml,tgl,rek_id:rekId,catatan:document.getElementById('terima-cat').value});
  const recv=inv.payments.reduce((s,p)=>s+p.jumlah,0);
  if(recv>=inv.total)inv.terima_status='lunas';
  setInvD(invs);

  // For passthrough: when invD is fully paid, auto-mark the linked invV as lunas
  if(isPT&&inv.terima_status==='lunas'&&inv.pt_inv_id){
    const invVs=getInvV();const ivObj=invVs.find(v=>v.id===inv.pt_inv_id);
    if(ivObj&&ivObj.bayar_status!=='lunas'){
      if(!ivObj.payments)ivObj.payments=[];
      ivObj.payments.push({id:uid(),jumlah:ivObj.total,tgl,rek_id:'',catatan:'Otomatis — dibayar dapur (pass-through)'});
      ivObj.bayar_status='lunas';
      setInvV(invVs);
      showToast('Penerimaan direkam & invoice vendor otomatis lunas!');
    } else showToast('Penerimaan direkam!');
  } else {
    // Record cashback from vendor if filled
    const cbJml=parseFloat(document.getElementById('terima-cb-jml')?.value)||0;
    const cbInvVId=document.getElementById('terima-cb-invv')?.value;
    const cbRekId=document.getElementById('terima-cb-rek')?.value;
    if(cbJml>0&&cbInvVId){
      const invVs=getInvV();const ivObj=invVs.find(v=>v.id===cbInvVId);
      if(ivObj){if(!ivObj.cashbacks)ivObj.cashbacks=[];ivObj.cashbacks.push({id:uid(),jumlah:cbJml,tgl,rek_id:cbRekId,catatan:'Cashback setelah dapur bayar'});setInvV(invVs);showToast('Penerimaan & cashback direkam!');}
    } else showToast('Penerimaan direkam!');
  }
  addLog('terima_invd','Terima dari dapur','invd',inv.id,inv.no,fmtF(jml)+' dari '+inv.dapur);
  closeModal('modal-terima');if(_currentPage==='inv-dapur')renderInvD();else if(_currentPoId)showDetail(_currentPoId);else if(inv.po_id)showDetail(inv.po_id);else renderInvD();
}

function delPaymentInvD(invId,payRef){
  if(!confirm('Hapus catatan pembayaran ini?'))return;
  const invs=getInvD();const inv=invs.find(d=>d.id===invId);if(!inv)return;
  const before=inv.payments.length;
  inv.payments=inv.payments.filter((p,i)=>p.id?p.id!==payRef:String(i)!==String(payRef));
  if(inv.payments.length===before){showToast('Pembayaran tidak ditemukan',true);return;}
  const recv=inv.payments.reduce((s,p)=>s+p.jumlah,0);
  if(recv<inv.total)inv.terima_status='belum';
  setInvD(invs);
  addLog('hapus_payment_invd','Hapus pembayaran','invd',invId,inv.no,fmtF(inv.total-recv)+' sisa');
  if(_currentPage==='inv-dapur')renderInvD();else if(_currentPoId)showDetail(_currentPoId);
}

// ===== RENDER INVOICE DAPUR =====
function renderInvD(){
  const invs=getInvD();/* summary computed after filter */
  const srch=(document.getElementById('srch-invd')?.value||'').toLowerCase();const fS=document.getElementById('f-invd-stat')?.value||'';const fB=document.getElementById('f-invd-bln')?.value||'';const fP=document.getElementById('f-invd-po')?.value||'';const fVS=document.getElementById('f-invd-vs')?.value||'';
  const pos=getPOs();
  const bSet=new Set(invs.filter(v=>v.tgl&&v.tgl.length>=7).map(v=>v.tgl.substring(0,7)));
  const fBE=document.getElementById('f-invd-bln');const cbv=fBE?.value||'';
  if(fBE)populateMonthFilter(fBE,bSet,cbv);
  // PO filter by month
  const poSel=document.getElementById('f-invd-po');const curPo=poSel?.value||'';
  const posInMonth=pos.filter(p=>!fB||invs.some(iv=>iv.po_id===p.id&&iv.tgl.startsWith(fB)));
  if(poSel)poSel.innerHTML='<option value="">Semua PO</option>'+posInMonth.map(p=>`<option value="${p.id}" ${p.id===curPo?'selected':''}>${p.no} — ${p.dapur}</option>`).join('');
  // Vendor mitra filter
  const vsSel=document.getElementById('f-invd-vs');const curVS=vsSel?.value||'';
  const vsAll=getVendorSaya();
  const vsInList=new Set(invs.map(iv=>iv.vendor_saya_id).filter(Boolean));
  if(vsSel)vsSel.innerHTML='<option value="">Semua vendor mitra</option>'+vsAll.filter(v=>vsInList.has(v.id)).map(v=>`<option value="${v.id}" ${v.id===curVS?'selected':''}>${v.nama}</option>`).join('');
  let filtered=invs.filter(iv=>{if(srch&&!iv.no.toLowerCase().includes(srch)&&!iv.dapur.toLowerCase().includes(srch)&&!(iv.items||[]).some(i=>(i.nama||'').toLowerCase().includes(srch)))return false;if(fS&&iv.terima_status!==fS)return false;if(fB&&!(iv.tgl||'').startsWith(fB))return false;if(fP&&iv.po_id!==fP)return false;if(fVS&&iv.vendor_saya_id!==fVS)return false;return true;}).sort((a,b)=>(b.tgl||'').localeCompare(a.tgl||''));
  // Hitung summary dari hasil filter
  {let _bT=0,_ln=0,_tt=0;
  filtered.forEach(iv=>{_tt+=iv.total;const r=(iv.payments||[]).reduce((s,p)=>s+p.jumlah,0);if(iv.terima_status==='lunas')_ln+=iv.total;else _bT+=iv.total-r;});
  const _me=document.getElementById('invd-met');if(_me)_me.innerHTML=`<div class="met"><div class="ml">Total invoice dapur</div><div class="mv num">${fmt(_tt)}</div></div><div class="met"><div class="ml">Belum diterima</div><div class="mv num a">${fmt(_bT)}</div></div><div class="met"><div class="ml">Sudah diterima</div><div class="mv num g">${fmt(_ln)}</div></div><div class="met"><div class="ml">Jumlah invoice</div><div class="mv">${filtered.length}</div></div>`;}
  const el=document.getElementById('invd-list');if(!filtered.length){el.innerHTML='<div class="empty">Tidak ada invoice ke dapur</div>';return;}
  const _dIHash=[srch,fS,fB,fP,fVS].join('|');if(_dIHash!==_pgHash.invd){_pg.invd=0;_pgHash.invd=_dIHash;}
  const _dIPg=_pg.invd;const _dIPgTotal=Math.ceil(filtered.length/PG_SIZE);
  const pagedInvD=filtered.slice(_dIPg*PG_SIZE,(_dIPg+1)*PG_SIZE);
  el.innerHTML=pagedInvD.map(iv=>{
    const recv=(iv.payments||[]).reduce((s,p)=>s+p.jumlah,0);const sisa=iv.total-recv;const po=pos.find(p=>p.id===iv.po_id);
    return`<div class="inv-card"><div class="inv-hdr">
      <div>
        <span style="font-weight:600;font-size:13px">${iv.no}</span>
        ${iv.type==='passthrough'?'<span class="tag tpu" style="margin-left:3px">Pass-through</span>':''}
        <span class="tag ${iv.terima_status==='lunas'?'tok':'tno'}" style="margin-left:3px">${iv.terima_status==='lunas'?'Lunas':'Blm diterima'}</span>
        <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin:2px 0">${iv.dapur} · ${iv.tgl}${iv.jatuh?' · Jt: '+iv.jatuh:''}</div>
        ${po?`<div style="font-size:11px;color:var(--t2)">PO: ${po.no}</div>`:''}
        ${iv.vendor_saya_id?(()=>{const vs=getVendorSaya().find(v=>v.id===iv.vendor_saya_id);return vs?`<div style="font-size:11px;color:var(--ac);margin-top:2px">🏢 ${vs.nama}</div>`:''})():''}
        <div style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
          <span>Total: <strong>${fmtF(iv.total)}</strong></span><span class="${sisa>0?'a':'g'}">Sisa: ${fmtF(sisa)}</span>
        </div>
      </div>
      <div class="bg">
        ${iv.terima_status!=='lunas'?`<button class="btn bsm bp" onclick="openTerima('${iv.id}')">Rekam terima</button>`:''}
        ${iv.type==='passthrough'&&iv.terima_status==='lunas'&&iv.pt_inv_id&&(()=>{const ptV=getInvV().find(v=>v.id===iv.pt_inv_id);return ptV&&ptV.bayar_status!=='lunas';})()
          ?`<button class="btn bsm bt" onclick="syncPassthroughInvV();renderInvD();showToast('Invoice vendor diupdate!')">Sync vendor</button>`:''}
        ${iv.vendor_saya_id?`<button class="btn bsm bp" onclick="printInvDFormal('${iv.id}')">🖨 Cetak Invoice</button>`:''}
        <button class="btn bsm bi" onclick="showInvDDetail('${iv.id}')">Detail</button>
        <div class="kbb">
          <button class="kbb-btn" onclick="openKbb('kbb-invd-${iv.id}',event)">⋯</button>
          <div class="kbb-menu" id="kbb-invd-${iv.id}">
            ${iv.type==='passthrough'&&iv.pt_inv_id?`<button onclick="showInvVDetail('${iv.pt_inv_id}')">Lihat inv vendor</button>`:''}
            ${po?`<button onclick="showDetail('${po.id}')">Lihat PO</button>`:''}
            <button onclick="openEditInvD('${iv.id}')">Edit header</button>
            ${iv.vendor_saya_id?`<button onclick="printInvDFormal('${iv.id}')">🖨 Cetak invoice formal</button>`:''}
            <button onclick="printInvD('${iv.id}')">🖨 Cetak internal</button>
            <div class="kbb-div"></div>
            <button class="kd" onclick="delInvD('${iv.id}')">Hapus</button>
          </div>
        </div>
      </div>
    </div>
    ${(iv.payments||[]).length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">${iv.payments.map((p,pi)=>`<div class="pay-row"><span>${p.tgl} · <strong>${getRekNama(p.rek_id)}</strong>${p.catatan?' · '+p.catatan:''}</span><span style="display:flex;align-items:center;gap:8px"><span class="num g">+${fmtF(p.jumlah)}</span>${iv.terima_status!=='lunas'?`<button class="btn bxs bd-" style="padding:1px 6px;font-size:10px" onclick="delPaymentInvD('${iv.id}','${p.id||pi}')">✕</button>`:''}</span></div>`).join('')}</div>`:''}
    </div>`;
  }).join('')+_pgBar('invd','pgInvD',_dIPg,_dIPgTotal,filtered.length);
}
function delInvD(id){
  const _delInvD=getInvD().find(d=>d.id===id);
  if(_delInvD?.terima_status==='lunas'&&!confirm(`Invoice ${_delInvD.no} sudah LUNAS.\nMenghapus invoice lunas dapat menyebabkan inkonsistensi laporan.\n\nYakin tetap hapus?`))return;
  if(!confirm('Hapus invoice dapur?'))return;
  addLog('hapus_invd','Hapus invoice dapur','invd',id,_delInvD?.no||id,(_delInvD?.dapur||'')+(_delInvD?.total?' · '+fmtF(_delInvD.total):''));
  setInvD(getInvD().filter(d=>d.id!==id));renderInvD();showToast('Invoice dihapus');
}

