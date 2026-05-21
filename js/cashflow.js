// ===== CASHFLOW =====
function renderCashflow(){
  const invV=getInvV();const invD=getInvD();const reks=getReks();
  let sudahBayar=0,sudahTerima=0,piutang=0,utangV=0;
  const _cfMonths=new Set();
  invV.forEach(iv=>(iv.payments||[]).forEach(p=>{if(p.tgl)_cfMonths.add(p.tgl.slice(0,7));}));
  invD.forEach(id=>(id.payments||[]).forEach(p=>{if(p.tgl)_cfMonths.add(p.tgl.slice(0,7));}));
  const _cfSortedM=[..._cfMonths].sort().reverse();
  const _cfNowYM=new Date().toISOString().slice(0,7);
  const _cfPSel=document.getElementById('cf-period-filter');
  if(_cfPSel){
    const _cfPrev=_cfPSel.value;
    _cfPSel.innerHTML='<option value="all">Semua waktu</option>'+_cfSortedM.map(m=>{const[y,mo]=m.split('-');return`<option value="${m}">${new Date(+y,+mo-1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</option>`;}).join('');
    _cfPSel.value=['all',..._cfSortedM].includes(_cfPrev)?_cfPrev:(_cfSortedM.includes(_cfNowYM)?_cfNowYM:'all');
  }
  const _cfP=_cfPSel?.value||'all';
  const _inP=tgl=>_cfP==='all'||(tgl||'').slice(0,7)===_cfP;
  const _cfPLabel=_cfP==='all'?'':((()=>{const[y,mo]=_cfP.split('-');return new Date(+y,+mo-1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});})());
  invV.forEach(iv=>{const n=invVNet(iv);sudahBayar+=(iv.payments||[]).filter(p=>_inP(p.tgl)).reduce((s,p)=>s+p.jumlah,0);if(iv.bayar_status!=='lunas'&&!isPassthrough(iv.id))utangV+=n.sisa;});
  invD.forEach(id=>{const allRecv=(id.payments||[]).reduce((s,py)=>s+py.jumlah,0);sudahTerima+=(id.payments||[]).filter(p=>_inP(p.tgl)).reduce((s,py)=>s+py.jumlah,0);if(id.terima_status!=='lunas')piutang+=Math.max(0,id.total-allRecv);});
  const net=piutang-utangV;
  const _periodSub=_cfPLabel?`<div style="font-size:10px;color:var(--t3);margin-top:-1px;margin-bottom:2px">${_cfPLabel}</div>`:'';
  document.getElementById('cf-met').innerHTML=`
    <div class="met"><div class="ml">Piutang dapur</div><div class="mv num g">${fmt(piutang)}</div></div>
    <div class="met"><div class="ml">Utang vendor</div><div class="mv num r">${fmt(utangV)}</div></div>
    <div class="met"><div class="ml">Net posisi</div><div class="mv num ${net>=0?'g':'r'}">${fmt(net)}</div></div>
    <div class="met"><div class="ml">Sudah terima</div>${_periodSub}<div class="mv num g">${fmt(sudahTerima)}</div></div>
    <div class="met"><div class="ml">Sudah bayar</div>${_periodSub}<div class="mv num r">${fmt(sudahBayar)}</div></div>`;

  // Build all payments
  const allPay=[];
  invV.forEach(iv=>(iv.payments||[]).forEach(p=>allPay.push({...p,no:iv.no,pihak:iv.vendor,dir:'out',rek_id:p.rek_id||''})));
  invV.forEach(iv=>(iv.cashbacks||[]).forEach(c=>allPay.push({...c,no:iv.no,pihak:iv.vendor,dir:'cb',rek_id:c.rek_id||''})));
  invD.forEach(iv=>(iv.payments||[]).forEach(p=>allPay.push({...p,no:iv.no,pihak:iv.dapur,dir:'in',rek_id:p.rek_id||''})));
  allPay.sort((a,b)=>b.tgl.localeCompare(a.tgl));

  // Toggle rekon UI
  const rekonBar=document.getElementById('cf-rekon-bar');
  const btnRekon=document.getElementById('btn-rekon');
  const cfCt=document.getElementById('cf-ct');
  if(btnRekon)btnRekon.textContent=_rekonMode?'← Kembali':'Rekonsiliasi';
  if(cfCt)cfCt.textContent=_rekonMode?'Rekonsiliasi transaksi':'Riwayat transaksi';
  if(rekonBar)rekonBar.style.display=_rekonMode?'block':'none';

  const el=document.getElementById('cf-rows');
  if(!_rekonMode){
    el.innerHTML=allPay.length?allPay.map(p=>`<div style="padding:8px 0;border-bottom:1px solid var(--bd);display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px">
      <div>
        <span class="tag ${p.dir==='out'?'tno':p.dir==='cb'?'tpu':'tok'}" style="margin-right:4px">${p.dir==='out'?'Bayar vendor':p.dir==='cb'?'Cashback':'Terima dapur'}</span>
        <strong>${p.no}</strong> · ${p.pihak}
        <div style="font-size:10px;color:var(--t3);font-family:var(--mn);margin-top:1px">${p.tgl} · ${getRekNama(p.rek_id)}</div>
      </div>
      <span class="num ${p.dir==='out'?'r':p.dir==='cb'?'p':'g'}">${p.dir==='out'?'-':'+'}${fmtF(p.jumlah)}</span>
    </div>`).join(''):'<div class="empty">Belum ada transaksi</div>';
    return;
  }

  // === REKON MODE ===
  const rekonSet=_rekonKeys();
  const fRek=document.getElementById('cf-rek-filter')?.value||'';
  const fDir=document.getElementById('cf-dir-filter')?.value||'';

  // Populate rekening filter
  const rekSel=document.getElementById('cf-rek-filter');
  if(rekSel){
    const curR=rekSel.value;
    rekSel.innerHTML='<option value="">Semua rekening</option>'+reks.map(r=>`<option value="${r.id}" ${r.id===curR?'selected':''}>${r.nama}</option>`).join('')+`<option value="__none__" ${curR==='__none__'?'selected':''}>Tanpa rekening</option>`;
  }

  let filteredPay=allPay;
  if(fRek==='__none__')filteredPay=filteredPay.filter(p=>!p.rek_id);
  else if(fRek)filteredPay=filteredPay.filter(p=>p.rek_id===fRek);
  if(fDir)filteredPay=filteredPay.filter(p=>p.dir===fDir);

  // Running balance (ascending date order)
  const ascending=[...filteredPay].reverse();
  let running=0;const runMap={};
  ascending.forEach(p=>{const sign=p.dir==='out'?-1:1;running+=sign*p.jumlah;runMap[_rekonKey(p)]=running;});

  const totalRekon=filteredPay.filter(p=>rekonSet.has(_rekonKey(p))).reduce((s,p)=>s+(p.dir==='out'?-p.jumlah:p.jumlah),0);
  const countRekon=filteredPay.filter(p=>rekonSet.has(_rekonKey(p))).length;
  const countBlm=filteredPay.length-countRekon;
  const rekonMet=document.getElementById('cf-rekon-met');
  if(rekonMet)rekonMet.innerHTML=`<span style="margin-right:16px">✓ <strong>${countRekon}</strong> direkonsiliasi</span><span style="margin-right:16px;color:var(--wt)">○ <strong>${countBlm}</strong> belum</span><span>Saldo rekonsiliasi: <strong class="num ${totalRekon>=0?'g':'r'}">${fmtF(totalRekon)}</strong></span>`;

  el.innerHTML=filteredPay.length?filteredPay.map(p=>{
    const key=_rekonKey(p);const checked=rekonSet.has(key);const bal=runMap[key];
    return`<div style="padding:8px 0;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px;font-size:12px;${checked?'opacity:0.55':''}">
      <input type="checkbox" ${checked?'checked':''} onchange="toggleRekon('${key.replace(/'/g,"\\'")}')" style="flex-shrink:0;width:15px;height:15px;cursor:pointer">
      <div style="flex:1;min-width:0">
        <span class="tag ${p.dir==='out'?'tno':p.dir==='cb'?'tpu':'tok'}" style="margin-right:4px">${p.dir==='out'?'Bayar vendor':p.dir==='cb'?'Cashback':'Terima dapur'}</span>
        <strong>${p.no}</strong> · ${p.pihak}
        <div style="font-size:10px;color:var(--t3);font-family:var(--mn);margin-top:1px">${p.tgl} · ${getRekNama(p.rek_id)||'Tanpa rekening'}${p.catatan?' · '+p.catatan:''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="num ${p.dir==='out'?'r':p.dir==='cb'?'p':'g'}">${p.dir==='out'?'-':'+'}${fmtF(p.jumlah)}</div>
        <div style="font-size:10px;color:var(--t3);font-family:var(--mn)">Saldo ${fmtF(bal)}</div>
      </div>
    </div>`;
  }).join(''):'<div class="empty">Tidak ada transaksi sesuai filter</div>';
}

// ===== REKENING =====
function renderRekening(){
  const reks=getReks();const invV=getInvV();const invD=getInvD();
  const usage={};const masukRek={};reks.forEach(r=>{usage[r.id]=0;masukRek[r.id]=0;});
  invV.forEach(iv=>(iv.payments||[]).forEach(p=>{if(usage[p.rek_id]!==undefined)usage[p.rek_id]+=p.jumlah;}));
  invD.forEach(iv=>(iv.payments||[]).forEach(p=>{if(masukRek[p.rek_id]!==undefined)masukRek[p.rek_id]+=p.jumlah;}));
  let totU=0,totK=0;reks.forEach(r=>{totU+=usage[r.id]||0;totK+=(r.pengembalian||[]).reduce((s,p)=>s+p.jumlah,0);});
  document.getElementById('rek-met').innerHTML=`
    <div class="met"><div class="ml">Total dana digunakan</div><div class="mv num a">${fmt(totU)}</div></div>
    <div class="met"><div class="ml">Dana dikembalikan</div><div class="mv num g">${fmt(totK)}</div></div>
    <div class="met"><div class="ml">Saldo penggunaan</div><div class="mv num ${(totU-totK)>0?'r':'g'}">${fmt(totU-totK)}</div></div>
    <div class="met"><div class="ml">Rekening</div><div class="mv">${reks.length}</div></div>`;
  document.getElementById('rek-tbody').innerHTML=reks.length?reks.map(r=>{
    const u=usage[r.id]||0;const k=(r.pengembalian||[]).reduce((s,p)=>s+p.jumlah,0);const sisa=u-k;const pct=u>0?Math.min(100,(k/u*100)):0;
    return`<tr>
      <td><div style="font-weight:500;font-size:13px">${r.nama}</div><div style="font-size:10px;color:var(--t3);font-family:var(--mn)">${r.pj||''}${r.no?' · '+r.no:''}</div><div style="font-size:10px;color:var(--ac);margin-top:1px">Terima dari dapur: ${fmtF(masukRek[r.id]||0)}</div></td>
      <td class="num a">${fmtF(u)}</td><td class="num g">${fmtF(k)}</td>
      <td class="num ${sisa>0?'r':'g'}">${fmtF(sisa)}</td>
      <td style="min-width:80px"><div style="height:4px;background:var(--bd);border-radius:2px;margin-bottom:2px"><div style="height:4px;background:var(--ac);border-radius:2px;width:${pct.toFixed(0)}%"></div></div><div style="font-size:10px;color:var(--t3);font-family:var(--mn)">${pct.toFixed(0)}%</div></td>
      <td><div class="bg"><button class="btn bxs bi" onclick="openKembali('${r.id}')">+ Kembali</button><button class="btn bxs bd-" onclick="delRek('${r.id}')">Hapus</button></div></td>
    </tr>`;
  }).join(''):`<tr><td colspan="6"><div class="empty">Belum ada rekening. Tambah di Master Data.</div></td></tr>`;
  const allPay=[];
  invV.forEach(iv=>(iv.payments||[]).forEach(p=>allPay.push({...p,no:iv.no,pihak:iv.vendor,dir:'out'})));
  invD.forEach(iv=>(iv.payments||[]).forEach(p=>allPay.push({...p,no:iv.no,pihak:iv.dapur,dir:'in'})));
  allPay.sort((a,b)=>b.tgl.localeCompare(a.tgl));
  document.getElementById('rek-hist').innerHTML=allPay.length?allPay.map(p=>`<div class="pay-row">
    <div><span class="tag ${p.dir==='out'?'tno':'tok'}" style="margin-right:4px">${p.dir==='out'?'Bayar vendor':'Terima dapur'}</span><strong>${p.no}</strong> · ${p.pihak}
    <div style="font-size:10px;color:var(--t3);font-family:var(--mn);margin-top:1px">${p.tgl} · ${getRekNama(p.rek_id)}</div></div>
    <span class="num ${p.dir==='out'?'r':'g'}">${p.dir==='out'?'-':'+'}${fmtF(p.jumlah)}</span>
  </div>`).join(''):'<div class="empty">Belum ada riwayat pembayaran</div>';
}

const ACTION_COLOR={buat_po:'var(--ac)',buat_invv:'var(--in)',buat_invd:'var(--pu)',buat_pov:'var(--ac)',bayar_invv:'var(--ac)',terima_invd:'var(--ac)',hapus_po:'var(--dn)',hapus_item:'var(--dn)',ganti_item:'var(--wn)',edit_item:'var(--t3)',tambah_item:'var(--ac)',update_kirim:'var(--tl)',konversi_pt:'var(--pu)',catat_cashback:'var(--pu)',clone_po:'var(--in)',edit_invv:'var(--t3)',catat_retur:'var(--wn)',catat_ongkir:'var(--wn)',restore_backup:'var(--dn)',tambah_rekening:'var(--ac)',hapus_rekening:'var(--dn)',edit_invd:'var(--t3)',hapus_payment_invd:'var(--dn)'};
