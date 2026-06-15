// ===== ARSIP NOTA =====
async function renderArsipNota(){
  const el=document.getElementById('arsip-list');
  if(!el)return;
  el.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">Memuat...</div>';

  const srch=(document.getElementById('srch-arsip')?.value||'').toLowerCase();
  const pos=getPOs();
  const invvs=getInvV();

  // Group invoices with file_key by po_id
  const byPO={};
  invvs.filter(iv=>iv.file_key).forEach(iv=>{
    if(!byPO[iv.po_id])byPO[iv.po_id]=[];
    byPO[iv.po_id].push(iv);
  });

  // Filter and sort POs
  let sortedPOs=pos.filter(p=>byPO[p.id]).sort((a,b)=>b.date.localeCompare(a.date));

  if(srch){
    sortedPOs=sortedPOs.filter(p=>{
      if(p.no.toLowerCase().includes(srch)||p.dapur.toLowerCase().includes(srch))return true;
      return(byPO[p.id]||[]).some(iv=>iv.vendor.toLowerCase().includes(srch)||iv.no.toLowerCase().includes(srch));
    });
  }

  // Update count
  const totalFiles=Object.values(byPO).reduce((s,ivs)=>s+ivs.length,0);
  const countEl=document.getElementById('arsip-count');
  if(countEl)countEl.textContent=`${totalFiles} nota dari ${Object.keys(byPO).length} PO`;

  if(!sortedPOs.length){
    el.innerHTML='<div class="empty">Belum ada nota yang diupload</div>';
    return;
  }

  el.innerHTML=sortedPOs.map(po=>{
    const invVsForPO=(byPO[po.id]||[]).sort((a,b)=>(a.tgl||'').localeCompare(b.tgl||''));
    const rows=invVsForPO.map(iv=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--bd);gap:10px">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:13px">${iv.no}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:1px">${iv.vendor} · ${iv.tgl} · <span class="num">${fmtF(iv.total)}</span></div>
        </div>
        <button class="btn bsm bp" onclick="viewNota('${iv.file_key}','${iv.no} — ${iv.vendor}')">📎 Lihat nota</button>
      </div>`).join('');
    return`<div style="border:1px solid var(--bd);border-radius:var(--rl);overflow:hidden;margin-bottom:12px">
      <div style="padding:8px 12px;background:var(--s2);display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="showDetail('${po.id}')">
        <div>
          <span style="font-weight:700;font-size:13px">${po.no}</span>
          <span style="font-size:11px;color:var(--t3);margin-left:8px">${po.dapur} · ${po.date}</span>
        </div>
        <span style="font-size:11px;color:var(--t3)">${invVsForPO.length} nota →</span>
      </div>
      ${rows}
    </div>`;
  }).join('');
}
