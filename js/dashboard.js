// ===== DASHBOARD =====
function renderDashboard(){
  const el=document.getElementById('hdr-date');if(el)el.textContent=new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  // Dapur filter
  const _ddEl=document.getElementById('dash-dapur-filter');
  if(_ddEl){
    const dapurs=[...new Set([...getPOs().map(p=>p.dapur),
      ...Object.values(getArsipRingkas()).flatMap(r=>r.dapurs||[])].filter(Boolean))].sort();
    const prev=_ddEl.value;
    _ddEl.innerHTML='<option value="">Semua dapur</option>'+dapurs.map(d=>`<option value="${d}">${d}</option>`).join('');
    if(dapurs.includes(prev))_ddEl.value=prev;
  }
  const _fDapur=_ddEl?.value||'';
  const pos=_fDapur?getPOs().filter(p=>p.dapur===_fDapur):getPOs();
  const _poIds=_fDapur?new Set(pos.map(p=>p.id)):null;
  const invV=_fDapur?getInvV().filter(iv=>_poIds.has(iv.po_id)):getInvV();
  const invD=_fDapur?getInvD().filter(id=>id.dapur===_fDapur):getInvD();

  // Cashflow today bar
  const today2=today();
  const keluarHariIni=invV.filter(iv=>iv.jatuh===today2&&iv.bayar_status!=='lunas'&&!isPassthrough(iv.id)).reduce((s,iv)=>s+invVNet(iv).sisa,0);
  const masukHariIni=invD.filter(id=>id.jatuh===today2&&id.terima_status!=='lunas').reduce((s,id)=>{const r=(id.payments||[]).reduce((a,p)=>a+p.jumlah,0);return s+id.total-r;},0);
  const cfEl=document.getElementById('cf-today-bar');
  if(keluarHariIni>0||masukHariIni>0){
    cfEl.innerHTML=`<div class="cf-today"><span style="font-weight:600;color:var(--it)">Cashflow hari ini:</span>
      ${keluarHariIni>0?`<span>Harus bayar ke vendor: <strong class="num r">${fmtF(keluarHariIni)}</strong></span>`:''}
      ${masukHariIni>0?`<span>Tagihan jatuh tempo ke dapur: <strong class="num g">${fmtF(masukHariIni)}</strong></span>`:''}
      <span style="margin-left:auto;font-size:11px;color:var(--it)">Berdasarkan jatuh tempo invoice hari ini</span>
    </div>`;
  } else cfEl.innerHTML='';

  // ===== AGENDA / DASHBOARD METRICS BARU =====
  const agendaSections=[];
  const kirimTerlambat=[];const kirimHariIni=[];
  pos.forEach(po=>{po.items.forEach((item,idx)=>{
    if(item.status_kirim==='diterima')return;if(!item.deadline)return;
    const diff=diffDays(item.deadline);
    if(diff<0)kirimTerlambat.push({po,item,idx,diff});
    else if(diff===0)kirimHariIni.push({po,item,idx});
  });});
  if(kirimTerlambat.length)agendaSections.push({id:'ag-late',icon:'⚠',label:'Pengiriman terlambat',count:kirimTerlambat.length,urgent:true,items:kirimTerlambat.map(x=>`<div class="agenda-item ai-urgent"><div><strong>${x.item.nama}</strong> <span style="font-size:11px;color:var(--t2)">${x.po.no} — ${x.po.dapur}</span><br><span style="font-size:11px;font-family:var(--mn);color:var(--dn)">Deadline: ${x.item.deadline} (${Math.abs(x.diff)}h lalu)</span></div><button class="btn bxs bt" onclick="openKirim('${x.po.id}',${x.idx})">Update</button></div>`)});
  if(kirimHariIni.length)agendaSections.push({id:'ag-today',icon:'📦',label:'Kirim hari ini',count:kirimHariIni.length,urgent:false,items:kirimHariIni.map(x=>`<div class="agenda-item ai-warn"><div><strong>${x.item.nama}</strong> <span style="font-size:11px;color:var(--t2)">${x.po.no} — ${x.po.dapur}</span><br><span style="font-size:11px;font-family:var(--mn)">${x.item.qty} ${x.item.satuan} ${catBadge(x.item.kat)}</span></div><button class="btn bxs bt" onclick="openKirim('${x.po.id}',${x.idx})">Update</button></div>`)});
  const invVJT=invV.filter(iv=>{if(iv.bayar_status==='lunas')return false;if(isPassthrough(iv.id))return false;if(!iv.jatuh)return false;return diffDays(iv.jatuh)<=0;});
  if(invVJT.length)agendaSections.push({id:'ag-invv',icon:'💳',label:'Invoice vendor jatuh tempo',count:invVJT.length,urgent:true,items:invVJT.map(iv=>{const n=invVNet(iv);return`<div class="agenda-item ai-urgent"><div><strong>${iv.no}</strong> — ${iv.vendor}<br><span style="font-size:11px;font-family:var(--mn);color:var(--dn)">Sisa: ${fmtF(n.sisa)} · Jt: ${iv.jatuh}</span></div>${!isPassthrough(iv.id)?`<button class="btn bxs bp" onclick="openBayarInvV('${iv.id}')">Bayar</button>`:`<span class="tag ttl" style="font-size:9px">Pass-through</span>`}</div>`})});
  const blmVendorUrgent=[];pos.forEach(po=>{po.items.forEach((item,idx)=>{if(item.vendor&&item.harga_vendor)return;if(item.status_kirim==='diterima')return;const diff=item.deadline?diffDays(item.deadline):null;if(diff!==null&&diff<=2)blmVendorUrgent.push({po,item,idx,diff});});});
  if(blmVendorUrgent.length)agendaSections.push({id:'ag-harga',icon:'🔍',label:'Harga vendor belum ada (≤2hr)',count:blmVendorUrgent.length,urgent:false,items:blmVendorUrgent.map(x=>`<div class="agenda-item ai-warn"><div><strong>${x.item.nama}</strong> <span style="font-size:11px;color:var(--t2)">${x.po.no}</span><br><span style="font-size:11px;font-family:var(--mn);color:var(--wt)">Deadline: ${x.item.deadline}</span></div><button class="btn bxs bt" onclick="openNewInvVForVendor('${x.po.id}','${x.item.vendor||''}')">Buat inv.</button></div>`)});
  const invDJT=invD.filter(id=>{if(id.terima_status==='lunas')return false;if(!id.jatuh)return false;return diffDays(id.jatuh)<=0;});
  if(invDJT.length)agendaSections.push({id:'ag-invd',icon:'🏦',label:'Invoice dapur jatuh tempo',count:invDJT.length,urgent:false,items:invDJT.map(id=>{const r=(id.payments||[]).reduce((s,p)=>s+p.jumlah,0);return`<div class="agenda-item"><div><strong>${id.no}</strong> — ${id.dapur}<br><span style="font-size:11px;font-family:var(--mn)">Sisa: ${fmtF(id.total-r)} · Jt: ${id.jatuh}</span></div><button class="btn bxs bp" onclick="openTerima('${id.id}')">Rekam</button></div>`})});
  const totalBlmV=pos.reduce((s,po)=>s+po.items.filter(i=>(!i.vendor||!i.harga_vendor)&&i.status_kirim!=='diterima').length,0);
  const totalUrgent=agendaSections.filter(s=>s.urgent).reduce((s,x)=>s+x.count,0);
  const totalWarn=agendaSections.filter(s=>!s.urgent).reduce((s,x)=>s+x.count,0)+totalBlmV;
  const poAktif=pos.filter(po=>{const myV=invV.filter(v=>v.po_id===po.id);const myD=invD.filter(d=>d.po_id===po.id);return !po.items.every(i=>i.status_kirim==='diterima')||myV.some(v=>v.bayar_status!=='lunas')||myD.some(d=>d.terima_status!=='lunas');}).length;

  const agendaBox=document.getElementById('agenda-box');
  let agHtml=`<div style="padding:10px 13px 6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
    <span style="font-size:12px;font-weight:600;color:var(--t2)">Ringkasan hari ini</span>
    <span style="font-size:11px;color:var(--t3)">${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'short'})}</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;padding:0 13px 10px">
    <div style="background:var(--s2);border-radius:var(--r);padding:10px 12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--tx)">${poAktif}</div>
      <div style="font-size:10px;color:var(--t3);margin-top:2px">PO aktif</div>
    </div>
    ${totalUrgent>0?`<div style="background:#fff0f0;border-radius:var(--r);padding:10px 12px;text-align:center;border:1px solid #fdd">
      <div style="font-size:22px;font-weight:700;color:var(--dn)">${totalUrgent}</div>
      <div style="font-size:10px;color:var(--dn);margin-top:2px">Perlu segera</div>
    </div>`:`<div style="background:#f0faf0;border-radius:var(--r);padding:10px 12px;text-align:center;border:1px solid #cec">
      <div style="font-size:22px;font-weight:700;color:var(--ac)">✓</div>
      <div style="font-size:10px;color:var(--ac);margin-top:2px">Tidak ada urgent</div>
    </div>`}
    ${totalWarn>0?`<div style="background:#fffbe6;border-radius:var(--r);padding:10px 12px;text-align:center;border:1px solid #ffe">
      <div style="font-size:22px;font-weight:700;color:var(--wt)">${totalWarn}</div>
      <div style="font-size:10px;color:var(--wt);margin-top:2px">Perlu perhatian</div>
    </div>`:''}
    ${totalBlmV>0?`<div style="background:var(--s2);border-radius:var(--r);padding:10px 12px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--t2)">${totalBlmV}</div>
      <div style="font-size:10px;color:var(--t3);margin-top:2px">Item blm ada vendor</div>
    </div>`:''}
  </div>`;

  if(agendaSections.length||totalBlmV>0){
    agHtml+=`<div style="border-top:1px solid var(--bd)">`;
    agendaSections.forEach(sec=>{
      agHtml+=`<div>
        <div class="agenda-sec-hdr" onclick="toggleAgendaSec('${sec.id}')" style="display:flex;justify-content:space-between;align-items:center">
          <span>${sec.icon} ${sec.label} <span style="font-size:11px;font-weight:700;color:${sec.urgent?'var(--dn)':'var(--wt)'}">(${sec.count})</span></span>
          <span id="${sec.id}-arrow" style="font-size:10px;color:var(--t3)">▼</span>
        </div>
        <div class="agenda-sec-body collapsed" id="${sec.id}" style="max-height:0">
          ${sec.items.join('')}
        </div>
      </div>`;
    });
    if(totalBlmV>0){
      const sid='ag-blmv';
      agHtml+=`<div>
        <div class="agenda-sec-hdr" onclick="toggleAgendaSec('${sid}')" style="display:flex;justify-content:space-between;align-items:center">
          <span>📋 Item belum ada vendor / harga <span style="font-size:11px;font-weight:700;color:var(--t3)">(${totalBlmV})</span></span>
          <span id="${sid}-arrow" style="font-size:10px;color:var(--t3)">▼</span>
        </div>
        <div class="agenda-sec-body collapsed" id="${sid}" style="max-height:0">
          <div class="agenda-item"><span style="font-size:12px;color:var(--t2)">${totalBlmV} item di berbagai PO menunggu</span><button class="btn bsm" onclick="nav('daftar-po')">Lihat PO →</button></div>
        </div>
      </div>`;
    }
    agHtml+=`</div>`;
  }
  agendaBox.innerHTML=agHtml;

  // Backup reminder
  const lastBackup=localStorage.getItem('sims_last_backup');
  const daysSince=lastBackup?Math.floor((Date.now()-new Date(lastBackup))/86400000):999;
  const backupEl=document.getElementById('backup-reminder');
  if(backupEl){
    if(daysSince>=7){
      const tglBackup=lastBackup?new Date(lastBackup).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):'belum pernah';
      backupEl.innerHTML=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span>${daysSince>=999?'Belum pernah backup':'Backup terakhir '+tglBackup+' ('+daysSince+' hari lalu)'} — data bisa hilang permanen jika Firestore bermasalah.</span><button class="btn bxs bw" onclick="backupData()">Backup sekarang</button></div>`;
      backupEl.style.display='block';
    }else{backupEl.style.display='none';}
  }

  // Metrics
  let ttlM=0,blmBV=0,blmTD=0,blmVnd=0;
  pos.forEach(po=>{const t=poTotals(po);ttlM+=t.margin;blmVnd+=po.items.filter(i=>!(i.harga_vendor>0)&&i.status_kirim!=='diterima').length;});
  invV.forEach(iv=>{const n=invVNet(iv);if(iv.bayar_status!=='lunas'&&!isPassthrough(iv.id))blmBV+=n.sisa;});
  invD.forEach(id=>{const r=(id.payments||[]).reduce((s,p)=>s+p.jumlah,0);blmTD+=id.total-r;});

  // Overdue counts
  const tgl=today();
  const overdueInvV=invV.filter(iv=>iv.bayar_status!=='lunas'&&!isPassthrough(iv.id)&&iv.jatuh&&iv.jatuh<tgl).length;
  const overdueInvD=invD.filter(id=>id.terima_status!=='lunas'&&id.jatuh&&id.jatuh<tgl).length;

  document.getElementById('dash-met').innerHTML=`
    <div class="met"><div class="ml">Estimasi margin</div><div class="mv num ${ttlM>=0?'g':'r'}">${fmt(ttlM)}</div><div class="ms">${pos.length} PO aktif</div></div>
    <div class="met"><div class="ml">Tagihan vendor</div><div class="mv num r">${fmt(blmBV)}</div><div class="ms">belum dibayar${overdueInvV?` · <span style="color:var(--dn);font-weight:600">${overdueInvV} LEWAT JT</span>`:''}</div></div>
    <div class="met"><div class="ml">Piutang dapur</div><div class="mv num a">${fmt(blmTD)}</div><div class="ms">belum diterima${overdueInvD?` · <span style="color:var(--dn);font-weight:600">${overdueInvD} LEWAT JT</span>`:''}</div></div>
    <div class="met"><div class="ml">Harga belum diisi</div><div class="mv num ${blmVnd>0?'a':''}">${blmVnd}</div><div class="ms">item dari vendor</div></div>`;

  // Attention
  const att=pos.filter(po=>{const myV=invV.filter(v=>v.po_id===po.id);const myD=invD.filter(d=>d.po_id===po.id);return !myV.length||!myD.length||myV.some(v=>v.bayar_status!=='lunas')||myD.some(d=>d.terima_status!=='lunas');}).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  document.getElementById('dash-att').innerHTML=att.length?att.map(po=>{
    const myV=invV.filter(v=>v.po_id===po.id);const myD=invD.filter(d=>d.po_id===po.id);
    const bV=myV.filter(v=>v.bayar_status!=='lunas').length;const bD=myD.filter(d=>d.terima_status!=='lunas').length;
    return`<div style="padding:6px 0;border-bottom:1px solid var(--bd)"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:5px">
      <div><span style="font-weight:600;font-size:12px">${po.no}</span><span style="font-size:11px;color:var(--t2);margin-left:5px">${po.dapur}</span>
        <div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap">
          ${!myV.length?'<span class="tag tno">Belum ada inv vendor</span>':bV?`<span class="tag tno">${bV} inv vendor blm bayar</span>`:'<span class="tag tok">Vendor lunas</span>'}
          ${!myD.length?'<span class="tag tno">Belum ada inv dapur</span>':bD?`<span class="tag twn">${bD} inv dapur blm terima</span>`:'<span class="tag tok">Dapur lunas</span>'}
        </div>
      </div>
      <button class="btn bsm" onclick="showDetail('${po.id}')">Detail</button>
    </div></div>`;
  }).join(''):'<div class="empty">Semua PO sudah selesai ✓</div>';

  // Invoice vendor pending
  const blmBayar=invV.filter(v=>v.bayar_status!=='lunas').sort((a,b)=>a.tgl.localeCompare(b.tgl)).slice(0,5);
  document.getElementById('dash-invv').innerHTML=blmBayar.length?blmBayar.map(iv=>{
    const n=invVNet(iv);const po=pos.find(p=>p.id===iv.po_id);const vObj=getVendorObj(iv.vendor);
    return`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--bd);flex-wrap:wrap;gap:5px">
      <div><span style="font-weight:500;font-size:12px">${iv.no}</span><span style="font-size:11px;color:var(--t2);margin-left:4px">${iv.vendor}</span>${vObj?.cashback?'<span class="tag tpu" style="margin-left:3px;font-size:9px">CB</span>':''}
        <div style="font-size:10px;font-family:var(--mn);color:var(--t3)">${iv.tgl}${iv.jatuh?' · Jt: '+iv.jatuh:''} ${po?'· '+po.no:''}</div>
      </div>
      <div class="bg"><span class="num r" style="font-size:12px">${fmtF(n.sisa)}</span>${!isPassthrough(iv.id)?`<button class="btn bxs bp" onclick="openBayarInvV('${iv.id}')">Bayar</button>`:`<span class="tag ttl" style="font-size:9px">Pass-through</span>`}</div>
    </div>`;
  }).join(''):'<div class="empty">Tidak ada invoice pending</div>';

  // Monthly - highlight current month, show margin %
  const thisMonth=today().substring(0,7);
  const monthly={};
  pos.forEach(po=>{
    const k=po.date.substring(0,7);
    if(!monthly[k])monthly[k]={tp:0,tv:0,margin:0,ongkir:0,cashback:0,cnt:0};
    const t=poTotals(po);
    const poInvV=invV.filter(iv=>iv.po_id===po.id);
    const poOngkir=poInvV.reduce((s,iv)=>s+(iv.ongkir||0),0);
    const poCB=poInvV.reduce((s,iv)=>s+(iv.cashbacks||[]).reduce((a,c)=>a+c.jumlah,0),0);
    monthly[k].tp+=t.tp;monthly[k].tv+=t.tv;
    monthly[k].margin+=t.margin;monthly[k].ongkir+=poOngkir;monthly[k].cashback+=poCB;monthly[k].cnt++;
  });
  // Periode terarsip. Filter dapur dilewati: ringkasan tidak dipecah per dapur,
  // jadi menambahkannya saat difilter akan menampilkan angka keliru.
  if(!_fDapur)Object.entries(getArsipRingkas()).forEach(([k,r])=>{
    if(!monthly[k])monthly[k]={tp:0,tv:0,margin:0,ongkir:0,cashback:0,cnt:0};
    monthly[k].tp+=r.tp||0;monthly[k].tv+=r.tv||0;monthly[k].margin+=r.margin||0;
    monthly[k].ongkir+=r.ongkir||0;monthly[k].cashback+=r.cashback||0;monthly[k].cnt+=r.po_cnt||0;
  });
  const monthKeys=Object.keys(monthly).sort().reverse();
  document.getElementById('dash-monthly').innerHTML=monthKeys.slice(0,5).map((k,i)=>{
    const mo=monthly[k];
    const bln=new Date(k+'-01').toLocaleDateString('id-ID',{year:'numeric',month:'short'});
    const isCurrent=k===thisMonth;
    const marginBersih=mo.margin-mo.ongkir+mo.cashback;
    const pct=mo.tp>0?(marginBersih/mo.tp*100).toFixed(1):null;
    const prev=monthKeys[i+1]?monthly[monthKeys[i+1]]:null;
    const trend=prev?(marginBersih>prev.margin?'↑':'↓'):null;
    return`<div style="padding:7px 0;border-bottom:1px solid var(--bd)${isCurrent?';background:var(--s2);padding:7px 8px;border-radius:var(--r);margin-bottom:2px':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
        <span style="font-weight:${isCurrent?'600':'400'}">${bln}${isCurrent?' <span style="font-size:9px;color:var(--in);font-weight:400">Bulan ini</span>':''} <span style="font-size:10px;color:var(--t3)">${mo.cnt} PO</span></span>
        <span class="num ${marginBersih>=0?'g':'r'}" style="font-weight:600">${fmt(marginBersih)}${trend?` <span style="color:${trend==='↑'?'var(--ac)':'var(--dn)'}">${trend}</span>`:''}</span>
      </div>
      <div style="font-size:10px;color:var(--t3);font-family:var(--mn);margin-top:2px">
        Nilai PO: ${fmt(mo.tp)} · Modal: ${fmt(mo.tv)}${pct?' · <span class="num '+( parseFloat(pct)>=0?'g':'r')+'">'+pct+'%</span>':''}${mo.ongkir?' · Ongkir: -'+fmt(mo.ongkir):''}${mo.cashback?' · CB: +'+fmt(mo.cashback):''}
      </div>
    </div>`;
  }).join('')||'<div class="empty">Belum ada data</div>';
  // Recent activity
  const recentLogs=getLog().slice(0,8);
  document.getElementById('dash-log').innerHTML=recentLogs.length?recentLogs.map(l=>`
    <div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--bd);align-items:center">
      <div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:var(--s2);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:var(--t2)">${l.initial||'?'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px"><span style="font-weight:500;color:${ACTION_COLOR[l.action]||'var(--tx)'}">${l.label}</span>${l.ref_no?` <span style="color:var(--t3)">${l.ref_no}</span>`:''}</div>
        <div style="font-size:10px;color:var(--t3)">${l.user||'—'} · ${l.tgl} ${l.time.substring(0,5)}</div>
      </div>
    </div>`).join(''):'<div class="empty">Belum ada aktivitas</div>';
}

function showInvVDetail(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const n=invVNet(inv);const po=getPOs().find(p=>p.id===inv.po_id);const vObj=getVendorObj(inv.vendor);
  const cbTotal=(inv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
  document.getElementById('det-invv-title').textContent='Invoice Vendor: '+inv.no;
  document.getElementById('det-invv-body').innerHTML=`
    <div class="inv-det-header" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:10px 12px;background:var(--s2);border-radius:var(--r)">
      <div>
        <div style="font-weight:600;font-size:14px">${inv.no} <span class="tag ${inv.bayar_status==='lunas'?'tok':'tno'}" style="margin-left:4px">${inv.bayar_status==='lunas'?'Lunas':'Blm dibayar'}</span>${(inv.edits||[]).length?`<span class="tag twn" style="margin-left:3px">Rev ${inv.edits.length}</span>`:''}</div>
        <div style="font-size:12px;color:var(--t2)">${inv.vendor}${vObj?.cashback?' · Cashback vendor':''}</div>
        <div style="font-size:11px;font-family:var(--mn);color:var(--t3)">${inv.tgl}${inv.jatuh?' · Jt: '+inv.jatuh:''}${inv.created_by?' · <span style="color:var(--t2)">oleh <strong>'+inv.created_by+'</strong></span>':''}</div>
        ${po?`<div style="font-size:11px;color:var(--t2)">PO: ${po.no} — ${po.dapur}</div>`:''}
      </div>
      <div class="inv-det-total" style="text-align:right">
        <div style="font-size:18px;font-weight:600;font-family:var(--mn)">${fmtF(inv.total)}</div>
        ${n.ongkir>0?`<div style="font-size:11px;color:var(--dn)">Ongkir: ${fmtF(n.ongkir)}</div>`:''}
        ${n.retur>0?`<div style="font-size:11px;color:var(--dn)">Retur: -${fmtF(n.retur)}</div><div style="font-size:12px">Net: ${fmtF(n.netTotal)}</div>`:''}
        <div style="font-size:13px" class="${n.sisa>0?'r':'g'}">Sisa: ${fmtF(n.sisa)}</div>
        ${cbTotal?`<div style="font-size:11px;color:var(--pu)">Cashback: +${fmtF(cbTotal)}</div>`:''}
      </div>
    </div>
    <div class="ct">Item dalam invoice</div>
    <div class="inv-det-tbl" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nama item</th><th>Qty</th><th>Sat</th><th style="text-align:right">Hrg vendor</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${(inv.items||[]).map(i=>`<tr><td style="font-weight:500">${i.nama}</td><td class="num">${i.qty}</td><td>${i.satuan||''}</td><td class="num" style="text-align:right">${fmtF(i.harga_vendor||0)}</td><td class="num" style="text-align:right">${fmtF((i.qty||0)*(i.harga_vendor||0))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600;padding:8px">Total</td><td class="num" style="text-align:right;font-weight:600;padding:8px">${fmtF(inv.total)}</td></tr></tfoot>
    </table></div>
    <div class="inv-det-rows" style="display:none">
      ${(inv.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--bd)">
        <div><div style="font-weight:500;font-size:13px">${i.nama}</div><div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin-top:1px">${i.qty} ${i.satuan||''} × ${fmtF(i.harga_vendor||0)}</div></div>
        <div style="font-family:var(--mn);font-size:13px;flex-shrink:0;padding-left:8px">${fmtF((i.qty||0)*(i.harga_vendor||0))}</div>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:600;font-size:13px">
        <span>Total</span><span style="font-family:var(--mn)">${fmtF(inv.total)}</span>
      </div>
    </div>
    ${(inv.edits||[]).length?`<div class="ct" style="margin-top:12px">Histori revisi harga</div>${inv.edits.map(e=>`<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--bd)"><span style="font-family:var(--mn);color:var(--t3)">${e.tgl}</span> — ${e.catatan} <span style="color:var(--wt)">total lama: ${fmtF(e.total_lama)} → ${fmtF(e.total_baru)}</span></div>`).join('')}`:''}
    ${(inv.returs||[]).length?`<div class="ct" style="margin-top:12px">Retur</div>${inv.returs.map(r=>`<div class="pay-row"><span>${r.tgl}: ${r.ket}</span><span class="num r">-${fmtF(r.val)}</span></div>`).join('')}`:''}
    ${(inv.payments||[]).length?`<div class="ct" style="margin-top:12px">Histori pembayaran</div>${inv.payments.map(p=>`<div class="pay-row"><span>${p.tgl} · ${getRekNama(p.rek_id)}</span><span class="num r">-${fmtF(p.jumlah)}</span>${p.catatan?`<span style="font-size:10px;color:var(--t3)">${p.catatan}</span>`:''}</div>`).join('')}`:''}
    ${(inv.cashbacks||[]).length?`<div class="ct" style="margin-top:12px">Cashback diterima</div>${inv.cashbacks.map(c=>`<div class="pay-row"><span>${c.tgl} · ${getRekNama(c.rek_id)}</span><span class="num p">+${fmtF(c.jumlah)}</span><span style="display:flex;gap:4px;margin-left:auto"><button class="btn bsm" onclick="closeModal('modal-det-invv');editCashback('${inv.id}','${c.id}')">Edit</button><button class="btn bsm bd-" onclick="delCashback('${inv.id}','${c.id}')">Hapus</button></span></div>`).join('')}`:''}
    ${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:var(--t2)">Catatan: ${inv.catatan}</div>`:''}
    <div class="inv-det-actions bg" style="margin-top:14px">
      ${inv.bayar_status!=='lunas'&&!isPassthrough(inv.id)?`<button class="btn bsm bp btn-full" onclick="closeModal('modal-det-invv');openBayarInvV('${inv.id}')">Rekam bayar</button>`:inv.bayar_status!=='lunas'?'<span class="tag ttl btn-full">Pass-through</span>':''}
      <button class="btn bsm bw" onclick="closeModal('modal-det-invv');openEditInvV('${inv.id}')">Edit qty/harga</button>
      ${!isPassthrough(inv.id)?`<button class="btn bsm bw" onclick="closeModal('modal-det-invv');openKonversiPT('${inv.id}')">Konversi PT</button>`:''}
      <button class="btn bsm bw" onclick="closeModal('modal-det-invv');openRetur('${inv.id}')">+ Retur</button>
      ${!n.ongkir?`<button class="btn bsm" onclick="closeModal('modal-det-invv');openOngkir('${inv.id}')">+ Ongkir</button>`:''}
      ${inv.file_key?`<button class="btn bsm bi" onclick="viewNota(\'${inv.file_key}\',\'${inv.no}\')">📎 Lihat file</button> <button class="btn bsm" onclick="gantiFileInvV(\'${inv.id}\')">🔄 Ganti file</button>`:`<button class="btn bsm" onclick="closeModal(\'modal-det-invv\');uploadInvVFile(\'${inv.id}\')">📎 Upload file</button>`}
      <button class="btn bsm" onclick="printInvV('${inv.id}')">🖨 Cetak</button>
      ${po?`<button class="btn bsm bi btn-full" onclick="closeModal('modal-det-invv');showDetail('${po.id}')">Lihat PO →</button>`:''}
    </div>`;
  openModal('modal-det-invv');
}

function showInvDDetail(invId){
  const inv=getInvD().find(d=>d.id===invId);if(!inv)return;
  const recv=(inv.payments||[]).reduce((s,p)=>s+p.jumlah,0);const sisa=inv.total-recv;
  const po=getPOs().find(p=>p.id===inv.po_id);
  const items=inv.type==='passthrough'?[{nama:'Pass-through — lihat invoice vendor terlampir',qty:1,satuan:'',harga_dapur:inv.total}]:inv.items;

  // Build vendor breakdown — use stored invv_id (new records) or buildLookup fallback
  let vendorBreakdownHtml='';
  if(inv.type!=='passthrough'&&po&&inv.items?.length){
    const invVAll=getInvV();
    const {itemInvV}=buildLookup(inv.po_id);
    const vendorMap={};
    const _resolveInvV=(diNama,hari,deadline,invv_id)=>{
      let ivMatch=invv_id?invVAll.find(iv=>iv.id===invv_id):null;
      if(!ivMatch){
        const diKey=`${diNama.toLowerCase()}||${hari||''}||${deadline||''}`;
        let pidx=po.items.findIndex(pi=>`${pi.nama.toLowerCase().trim()}||${pi.hari||''}||${pi.deadline||''}`===diKey);
        if(pidx<0)pidx=po.items.findIndex(pi=>pi.nama.toLowerCase().trim()===diNama.toLowerCase());
        if(pidx>=0)ivMatch=itemInvV[pidx];
      }
      return ivMatch;
    };
    inv.items.forEach(di=>{
      const diNama=(di.nama||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
      // Merged item: find all linked invV, deduplicated
      if(di._src_items&&di._src_items.length){
        const hasInvvId=di._src_items.some(si=>si.invv_id);
        let linkedInvVs;
        if(hasInvvId){
          // New format: resolve per-source via stored invv_id, deduplicate
          const seen=new Set();
          linkedInvVs=di._src_items.map(si=>si.invv_id?invVAll.find(iv=>iv.id===si.invv_id):_resolveInvV(diNama,si.hari,si.deadline,'')).filter(iv=>iv&&!seen.has(iv.id)&&seen.add(iv.id));
        } else {
          // Old format (no invv_id stored): find all invV for this PO containing this item name
          linkedInvVs=invVAll.filter(iv=>iv.po_id===inv.po_id&&(iv.items||[]).some(i=>(i.nama||'').trim()===diNama));
        }
        linkedInvVs.forEach(ivMatch=>{
          if(!vendorMap[ivMatch.id])vendorMap[ivMatch.id]={iv:ivMatch,items:[]};
          const ivItem=(ivMatch.items||[]).find(i=>(i.nama||'').trim()===diNama||(typeof i.idx==='number'&&(po.items[i.idx]?.nama||'').trim()===diNama));
          const hv=ivItem?(ivItem.harga_vendor_po!=null?ivItem.harga_vendor_po:ivItem.harga_vendor):0;
          vendorMap[ivMatch.id].items.push({...di,qty_vendor:ivItem?.qty||di.qty,harga_vendor:hv});
        });
        return;
      }
      // Normal (non-merged) item
      const ivMatch=_resolveInvV(diNama,di.hari||'',di.deadline||'',di.invv_id||'');
      if(!ivMatch)return;
      if(!vendorMap[ivMatch.id])vendorMap[ivMatch.id]={iv:ivMatch,items:[]};
      const ivItemByHari=(ivMatch.items||[]).find(i=>{
        const nm=(i.nama||'').trim()===diNama||(typeof i.idx==='number'&&(po.items[i.idx]?.nama||'').trim()===diNama);
        return nm&&di.hari&&(i.hari||'')===(di.hari||'');
      });
      const ivItem=ivItemByHari||(ivMatch.items||[]).find(i=>
        (i.nama||'').trim()===diNama||(typeof i.idx==='number'&&(po.items[i.idx]?.nama||'').trim()===diNama)
      );
      const hv=ivItem?(ivItem.harga_vendor_po!=null?ivItem.harga_vendor_po:ivItem.harga_vendor):0;
      vendorMap[ivMatch.id].items.push({...di,qty_vendor:ivItem?.qty||di.qty,harga_vendor:hv});
    });

    const entries=Object.values(vendorMap);
    if(entries.length){
      vendorBreakdownHtml=`<div class="ct" style="margin-top:14px">Breakdown per vendor</div>`;
      entries.forEach(({iv,items:vitems})=>{
        const vTotal=vitems.reduce((s,i)=>s+(i.qty_vendor||0)*(i.harga_vendor||0),0);
        vendorBreakdownHtml+=`<div style="margin-bottom:10px;border:1px solid var(--bd);border-radius:var(--r);overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--s2);border-bottom:1px solid var(--bd)">
            <div>
              <span style="font-weight:600;font-size:12px">${iv.vendor}</span>
              <span class="tag ${iv.bayar_status==='lunas'?'tok':'tno'}" style="margin-left:5px;font-size:9px">${iv.no}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-family:var(--mn);font-size:12px">${fmtF(vTotal)}</span>
              <button class="btn bxs bi" onclick="closeModal('modal-det-invd');showInvVDetail('${iv.id}')">Lihat →</button>
            </div>
          </div>
          <table class="tbl" style="margin:0">
            <tbody>${vitems.map(i=>`<tr>
              <td style="font-weight:500;font-size:11px">${i.nama}</td>
              <td class="num" style="font-size:11px">${i.qty_vendor} ${i.satuan||''}</td>
              <td class="num" style="font-size:11px;color:var(--t3)">${i.harga_vendor?fmtF(i.harga_vendor):'—'}</td>
              <td class="num" style="font-size:11px">${i.harga_vendor?fmtF((i.qty_vendor||0)*i.harga_vendor):'—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      });
      if(Object.keys(vendorMap).length===0)vendorBreakdownHtml='';
    }
  }

  document.getElementById('det-invd-title').textContent='Invoice Dapur: '+inv.no;
  document.getElementById('det-invd-body').innerHTML=`
    <div class="inv-det-header" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;padding:10px 12px;background:var(--s2);border-radius:var(--r)">
      <div>
        <div style="font-weight:600;font-size:14px">${inv.no} ${inv.type==='passthrough'?'<span class="tag tpu" style="margin-left:3px">Pass-through</span>':''} <span class="tag ${inv.terima_status==='lunas'?'tok':'tno'}" style="margin-left:3px">${inv.terima_status==='lunas'?'Lunas':'Blm diterima'}</span></div>
        <div style="font-size:12px;color:var(--t2)">Kepada: ${inv.dapur}</div>
        <div style="font-size:11px;font-family:var(--mn);color:var(--t3)">${inv.tgl}${inv.jatuh?' · Jt: '+inv.jatuh:''}${inv.created_by?' · <span style="color:var(--t2)">oleh <strong>'+inv.created_by+'</strong></span>':''}</div>
        ${po?`<div style="font-size:11px;color:var(--t2)">PO: ${po.no} — ${po.dapur}</div>`:''}
      </div>
      <div class="inv-det-total" style="text-align:right">
        <div style="font-size:18px;font-weight:600;font-family:var(--mn)">${fmtF(inv.total)}</div>
        ${recv>0?`<div style="font-size:11px;color:var(--ac)">Dibayar: +${fmtF(recv)}</div>`:''}
        <div style="font-size:13px" class="${sisa>0?'a':'g'}">Sisa: ${fmtF(sisa)}</div>
      </div>
    </div>
    ${inv.type==='passthrough'&&inv.pt_inv_id?`<div style="margin-bottom:10px;padding:8px 10px;background:var(--tbg);border:1px solid var(--tbd);border-radius:var(--r);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><span style="font-size:12px;color:var(--tt)">Invoice ini meneruskan pembayaran dari dapur ke vendor.</span><button class="btn bsm bt" onclick="closeModal('modal-det-invd');showInvVDetail('${inv.pt_inv_id}')">Lihat invoice vendor →</button></div>`:''}
    <div class="ct">Item dalam invoice</div>
    <div class="inv-det-tbl" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Nama item</th><th>Qty</th><th>Sat</th><th style="text-align:right">Harga ke dapur</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${items.map(i=>`<tr><td style="font-weight:500">${i.nama}</td><td class="num">${i.qty}</td><td>${i.satuan||''}</td><td class="num" style="text-align:right">${fmtF(i.harga_dapur||0)}</td><td class="num" style="text-align:right">${fmtF((i.qty||0)*(i.harga_dapur||0))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;font-weight:600;padding:8px">Total</td><td class="num" style="text-align:right;font-weight:600;padding:8px">${fmtF(inv.total)}</td></tr></tfoot>
    </table></div>
    <div class="inv-det-rows" style="display:none">
      ${items.map(i=>`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--bd)">
        <div><div style="font-weight:500;font-size:13px">${i.nama}</div><div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin-top:1px">${i.qty} ${i.satuan||''} × ${fmtF(i.harga_dapur||0)}</div></div>
        <div style="font-family:var(--mn);font-size:13px;flex-shrink:0;padding-left:8px">${fmtF((i.qty||0)*(i.harga_dapur||0))}</div>
      </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:600;font-size:13px">
        <span>Total</span><span style="font-family:var(--mn)">${fmtF(inv.total)}</span>
      </div>
    </div>
    ${vendorBreakdownHtml}
    ${(inv.payments||[]).length?`<div class="ct" style="margin-top:12px">Histori penerimaan</div>${inv.payments.map(p=>`<div class="pay-row"><span>${p.tgl} · ${getRekNama(p.rek_id)}</span><span class="num g">+${fmtF(p.jumlah)}</span>${p.catatan?`<span style="font-size:10px;color:var(--t3)">${p.catatan}</span>`:''}</div>`).join('')}`:''}
    ${inv.catatan?`<div style="margin-top:10px;font-size:12px;color:var(--t2)">Catatan: ${inv.catatan}</div>`:''}
    <div class="inv-det-actions bg" style="margin-top:14px">
      ${inv.terima_status!=='lunas'?`<button class="btn bsm bp btn-full" onclick="closeModal('modal-det-invd');openTerima('${inv.id}')">Rekam terima</button>`:''}
      ${inv.type==='passthrough'&&inv.pt_inv_id?`<button class="btn bsm bt btn-full" onclick="closeModal('modal-det-invd');showInvVDetail('${inv.pt_inv_id}')">Lihat invoice vendor</button>`:''}
      <button class="btn bsm" onclick="printInvD('${inv.id}')">🖨 Cetak</button>
      ${po?`<button class="btn bsm bi btn-full" onclick="closeModal('modal-det-invd');showDetail('${po.id}')">Lihat PO →</button>`:''}
    </div>`;
  openModal('modal-det-invd');
}

