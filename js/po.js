// ===== DAFTAR PO =====
function renderDaftar(){
  const pos=getPOs();
  const srch=(document.getElementById('srch')?.value||'').toLowerCase();
  const fS=document.getElementById('f-stat')?.value||'';const fB=document.getElementById('f-bln')?.value||'';const fD=document.getElementById('f-dapur')?.value||'';
  const bSet=new Set(pos.map(p=>p.date.substring(0,7)));
  const fBE=document.getElementById('f-bln');const cbv=fBE.value;
  populateMonthFilter(fBE,bSet,cbv);
  const dSet=new Set(pos.map(p=>fmtDapurKode(p.dapur)));const fDE=document.getElementById('f-dapur');const cdv=fDE.value;
  fDE.innerHTML='<option value="">Semua dapur</option>'+[...dSet].sort().map(d=>`<option value="${d}" ${d===cdv?'selected':''}>${d}</option>`).join('');
  const invV=getInvV();const invD=getInvD();
  let filtered=pos.filter(po=>{
    if(srch&&!po.no.toLowerCase().includes(srch)&&!po.dapur.toLowerCase().includes(srch)&&!po.items.some(i=>(i.vendor||'').toLowerCase().includes(srch)))return false;
    if(fB&&!po.date.startsWith(fB))return false;if(fD&&fmtDapurKode(po.dapur)!==fD)return false;
    const myV=invV.filter(v=>v.po_id===po.id);const myD=invD.filter(d=>d.po_id===po.id);
    const allKirim=po.items.every(i=>i.status_kirim==='diterima');
    const done=allKirim&&myV.every(v=>v.bayar_status==='lunas')&&myD.every(d=>d.terima_status==='lunas');
    if(fS==='aktif'&&done)return false;if(fS==='selesai'&&!done)return false;
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date));
  document.getElementById('daftar-hdr').textContent=filtered.length+' PO';
  const el=document.getElementById('daftar-list');
  if(!filtered.length){el.innerHTML='<div class="empty">Tidak ada PO</div>';return;}
  const _dHash=[srch,fS,fB,fD].join('|');if(_dHash!==_pgHash.daftar){_pg.daftar=0;_pgHash.daftar=_dHash;}
  const _dPg=_pg.daftar;const _dPgTotal=Math.ceil(filtered.length/PG_SIZE);
  const pagedDaftar=filtered.slice(_dPg*PG_SIZE,(_dPg+1)*PG_SIZE);
  el.innerHTML=pagedDaftar.map(po=>{
    const t=poTotals(po);
    const myV=invV.filter(v=>v.po_id===po.id);const myD=invD.filter(d=>d.po_id===po.id);
    const tInvD=myD.reduce((s,d)=>s+d.total,0);
    const tInvV=myV.reduce((s,iv)=>s+iv.total,0);
    const tOngkir=myV.reduce((s,iv)=>s+(iv.ongkir||0),0);
    const tCB=myV.reduce((s,iv)=>s+(iv.cashbacks||[]).reduce((a,c)=>a+c.jumlah,0),0);
    const m=tInvD>0?tInvD-tInvV-tOngkir+tCB:t.margin;
    const mc=m>0?'mpos':m<0?'mneg':'mzero';
    const kirimOk=po.items.filter(i=>i.status_kirim==='diterima').length;
    const pct=t.total>0?Math.round(t.wv/t.total*100):0;
    const vendorNames=[...new Set(po.items.map(i=>i.vendor).filter(Boolean))];
    const allVendorHaveInv=vendorNames.length>0&&vendorNames.every(v=>myV.some(iv=>iv.vendor===v));
    const blmV=myV.filter(v=>v.bayar_status!=='lunas').length;
    const blmD=myD.filter(d=>d.terima_status!=='lunas').length;
    const vendorStatus=!myV.length?'<span class="tag tno">Belum ada inv vendor</span>':!allVendorHaveInv?`<span class="tag twn">Baru ${myV.length} vendor diinvoice</span>`:blmV?`<span class="tag tno">${blmV} inv vendor blm bayar</span>`:'<span class="tag tok">Semua vendor lunas</span>';
    return`<div style="background:var(--sf);border:1px solid var(--bd);border-radius:var(--rl);padding:11px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <span style="font-weight:600;font-size:13px">${po.no}</span>
          ${jenisBadge(po.jenis)}
          ${po.revisions?.length?`<span class="tag tpu" style="margin-left:5px">Rev ${po.revisions.length}</span>`:''}
          <span style="margin-left:7px;color:var(--t2);font-size:12px">${fmtDapurKode(po.dapur)}</span>
          <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin:2px 0 5px">${po.date} · ${t.total} item · harga vendor ${pct}% terisi · kirim ${kirimOk}/${t.total}</div>
        </div>
        <div class="bg"><button class="btn bsm" onclick="showDetail('${po.id}')">Detail</button><button class="btn bsm" onclick="openLaporanPO('${po.id}')">Laporan</button><button class="btn bsm bt" onclick="clonePO('${po.id}')">Clone</button><button class="btn bsm bd-" onclick="delPO('${po.id}')">Hapus</button></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;font-family:var(--mn);padding-top:5px;border-top:1px solid var(--bd)">
        <span>PO: <strong>${fmtF(t.tp)}</strong></span>
        ${t.wv>0?`<span>Modal: <strong>${fmtF(t.tv)}</strong></span><span>Margin: <span class="${mc}">${fmtF(m)}</span></span>`:''}
      </div>
      <div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">
        ${vendorStatus}
        ${!myD.length?'<span class="tag tno">Belum ada inv dapur</span>':blmD?`<span class="tag twn">${blmD} inv dapur blm terima</span>`:'<span class="tag tok">Dapur lunas</span>'}
      </div>
    </div>`;
  }).join('')+_pgBar('daftar','pgDaftar',_dPg,_dPgTotal,filtered.length);
}
function clonePO(poId){
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  const newDate=prompt('Tanggal PO baru (YYYY-MM-DD):',today());
  if(!newDate)return;
  // Generate new PO no — append copy suffix
  const newNo=po.no+'-COPY';
  // Clone items — reset all vendor/kirim info, keep structure
  const newItems=po.items.map(item=>({
    ...item,
    harga_vendor:0,vendor:'',nota_key:null,
    status_kirim:'belum',tgl_kirim:'',tgl_diterima:'',retur:null
  }));
  const newPO={
    ...po,
    id:uid(),
    no:newNo,
    date:newDate,
    items:newItems,
    revisions:[{tgl:today(),changes:[{nama:'Clone dari '+po.no,qty_lama:0,qty_baru:newItems.length,harga_lama:0,harga_baru:0,alasan:'Duplikat dari PO '+po.no}]}],
    created:new Date().toISOString()
  };
  pos.push(newPO);setPOs(pos);
  addLog('clone_po','Clone PO','po',newPO.id,newPO.no,'Dari '+po.no+' · '+newItems.length+' item');
  showToast(`PO di-clone! Membuka ${newNo}...`);
  setTimeout(()=>showDetail(newPO.id),300);
}
function delPO(id){
  const linkedInvV=getInvV().filter(iv=>iv.po_id===id);
  const linkedInvD=getInvD().filter(d=>d.po_id===id);
  if(linkedInvV.length||linkedInvD.length){
    const parts=[];
    if(linkedInvV.length)parts.push('Invoice Vendor: '+linkedInvV.map(iv=>iv.no).join(', '));
    if(linkedInvD.length)parts.push('Invoice Dapur: '+linkedInvD.map(d=>d.no).join(', '));
    showToast('Tidak bisa hapus — PO masih punya:\n'+parts.join('\n'),true);return;
  }
  const _delPO=getPOs().find(p=>p.id===id);if(!confirm('Yakin hapus PO ini?'))return;addLog('hapus_po','Hapus PO','po',id,_delPO?.no,'');setPOs(getPOs().filter(p=>p.id!==id));renderDaftar();showToast('PO dihapus');
}

// Helper: unique key for a PO item — handles duplicate names across different days
function itemKey(item){
  return `${(item.nama||'').trim()}||${item.hari||''}||${item.deadline||''}`;
}
function findPoItem(po,i){
  if(typeof i.idx==='number'&&po.items[i.idx]&&po.items[i.idx].nama===i.nama)return po.items[i.idx];
  if(i.hari||i.deadline){const k=itemKey(i);const m=po.items.find(pi=>itemKey(pi)===k);if(m)return m;}
  return po.items.find(pi=>pi.nama===i.nama)||null;
}

// ===== DETAIL PO =====
// Build item→invoice lookup for a PO
// buildLookup cache — keyed by poId, invalidated with render cache
const _lookupCache=new Map();
const _origInvalidate=_rc.invalidate.bind(_rc);
_rc.invalidate=function(){_origInvalidate();_lookupCache.clear();};

// Invalidate lookup for a specific PO only (faster than full invalidate)
function invalidatePO(poId){_lookupCache.delete(poId);_rc.invalidate();}

function buildLookup(poId){
  if(_lookupCache.has(poId))return _lookupCache.get(poId);
  const invV=getInvV().filter(v=>v.po_id===poId);
  const invD=getInvD().filter(d=>d.po_id===poId);
  const po=getPOs().find(p=>p.id===poId);

  const itemInvV={};
  if(po){
    // Pass 1: exact idx+nama match (skip if item at idx has different name — stale idx)
    invV.forEach(iv=>(iv.items||[]).forEach(i=>{
      const directIdx=typeof i.idx==='number'?i.idx:-1;
      if(directIdx>=0&&po.items[directIdx]&&po.items[directIdx].nama===i.nama&&!(directIdx in itemInvV))
        itemInvV[directIdx]=iv;
    }));
    // Pass 2: composite key match — for items whose stored idx wasn't successfully assigned in Pass 1
    invV.forEach(iv=>(iv.items||[]).forEach(i=>{
      const directIdx=typeof i.idx==='number'?i.idx:-1;
      const idxFresh=directIdx>=0&&po.items[directIdx]&&po.items[directIdx].nama===i.nama;
      if(idxFresh&&itemInvV[directIdx]===iv)return;// Pass 1 assigned THIS iv to THIS position — skip
      const iKey=itemKey(i);
      po.items.forEach((pi,pidx)=>{
        if(!(pidx in itemInvV)&&itemKey(pi)===iKey)itemInvV[pidx]=iv;
      });
    }));
    // Pass 3: nama-only fallback — only when unambiguous (exactly one unlinked candidate)
    invV.forEach(iv=>(iv.items||[]).forEach(i=>{
      const directIdx=typeof i.idx==='number'?i.idx:-1;
      const idxFresh=directIdx>=0&&po.items[directIdx]&&po.items[directIdx].nama===i.nama;
      if(!i.hari&&!i.deadline&&!(idxFresh&&itemInvV[directIdx]===iv)){
        const cands=po.items.reduce((a,pi,pidx)=>{if(!(pidx in itemInvV)&&pi.nama===i.nama)a.push(pidx);return a;},[]);
        if(cands.length===1)itemInvV[cands[0]]=iv;
        // if cands.length > 1: ambiguous, leave unlinked — safer than wrong link
      }
    }));
  }

  // itemInvD[pidx] = invoice dapur covering that PO item
  const itemInvD={};
  if(po){
    invD.forEach(id2=>{
      if(id2.type==='passthrough'&&id2.pt_inv_id){
        // Pass-through: all PO items already linked to this invV (via itemInvV) are covered by this invD
        po.items.forEach((pi,pidx)=>{
          if(!(pidx in itemInvD)&&itemInvV[pidx]?.id===id2.pt_inv_id)itemInvD[pidx]=id2;
        });
      } else {
        // Normal markup invoice: match by item nama/hari/deadline
        (id2.items||[]).forEach(i=>{
          const storedNama=(i.nama||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
          // Merged item: match each _src_item to its own PO slot
          if(i._src_items&&i._src_items.length){
            i._src_items.forEach(si=>{
              const siKey=`${storedNama.toLowerCase().trim()}||${si.hari||''}||${si.deadline||''}`;
              let matched=false;
              po.items.forEach((pi,pidx)=>{
                if(matched)return;
                const piKey=`${pi.nama.toLowerCase().trim()}||${pi.hari||''}||${pi.deadline||''}`;
                if(!(pidx in itemInvD)&&piKey===siKey){itemInvD[pidx]=id2;matched=true;}
              });
              if(!matched){
                po.items.forEach((pi,pidx)=>{
                  if(matched)return;
                  if(!(pidx in itemInvD)&&pi.nama.toLowerCase()===storedNama.toLowerCase()){itemInvD[pidx]=id2;matched=true;}
                });
              }
            });
            return;
          }
          const iKey=`${storedNama.toLowerCase().trim()}||${i.hari||''}||${i.deadline||''}`;
          let matched=false;
          // Pass 1: composite key match (nama+hari+deadline)
          po.items.forEach((pi,pidx)=>{
            const piKey=`${pi.nama.toLowerCase().trim()}||${pi.hari||''}||${pi.deadline||''}`;
            if(!(pidx in itemInvD)&&piKey===iKey){itemInvD[pidx]=id2;matched=true;}
          });
          // Pass 2: nama-only if invoice item has no hari/deadline
          if(!i.hari&&!i.deadline){
            po.items.forEach((pi,pidx)=>{
              if(!(pidx in itemInvD)&&pi.nama.toLowerCase()===storedNama.toLowerCase()){itemInvD[pidx]=id2;matched=true;}
            });
          }
          // Pass 3: nama-only fallback jika Pass 1+2 gagal (hari/deadline berubah di PO setelah invoice dibuat)
          if(!matched){
            po.items.forEach((pi,pidx)=>{
              if(!(pidx in itemInvD)&&pi.nama.toLowerCase()===storedNama.toLowerCase())itemInvD[pidx]=id2;
            });
          }
        });
      }
    });
  }

  // itemPassthrough: set of PO item idx where invV is paid via pass-through (no invD needed)
  // Detected by: invV is lunas AND payment catatan contains 'Pass-through' AND no invD covers this item
  const itemPassthrough=new Set();
  if(po){
    invV.forEach(iv=>{
      if(iv.bayar_status!=='lunas')return;
      const isPTPayment=(iv.payments||[]).some(p=>(p.catatan||'').toLowerCase().includes('pass-through'));
      if(!isPTPayment)return;
      // Mark all PO items linked to this invV as pass-through covered
      po.items.forEach((pi,pidx)=>{
        if(itemInvV[pidx]?.id===iv.id&&!(pidx in itemInvD))itemPassthrough.add(pidx);
      });
    });
  }

  const result={invV,invD,itemInvV,itemInvD,itemPassthrough};
  _lookupCache.set(poId,result);
  return result;
}

let _currentPoId=null;
window._spekVisible=false; // default: spek tersembunyi
// ===== DETAIL PO — split into sub-functions for partial re-render =====

function detMetrics(po,t,invVs,invDs){
  const _tInvD=(invDs||[]).reduce((s,d)=>s+d.total,0);
  const _tInvV=(invVs||[]).reduce((s,iv)=>s+iv.total,0);
  const _tOngkir=(invVs||[]).reduce((s,iv)=>s+(iv.ongkir||0),0);
  const _tCB=(invVs||[]).reduce((s,iv)=>s+(iv.cashbacks||[]).reduce((a,c)=>a+c.jumlah,0),0);
  const mBersih=_tInvD>0?_tInvD-_tInvV-_tOngkir+_tCB:(t.wv>0?t.margin+_tCB:null);
  const modalVal=_tInvV>0?_tInvV:(t.wv>0?t.tv:null);
  const marginSub=_tInvD>0?'dari invoice dapur':t.wv>0?'estimasi':'—';
  return`<div class="mg">
    <div class="met"><div class="ml">Nilai PO</div><div class="mv num">${fmt(t.tp)}</div></div>
    <div class="met"><div class="ml">Modal vendor</div><div class="mv num ${!_tInvV&&t.wv<t.total?'a':''}">${modalVal!==null?fmt(modalVal):'—'}</div><div class="ms">${_tInvV>0?(invVs||[]).length+' inv':t.wv+'/'+t.total+' terisi'}</div></div>
    <div class="met"><div class="ml">Margin bersih</div><div class="mv num ${mBersih===null?'':mBersih>=0?'g':'r'}">${mBersih!==null?fmt(mBersih):'—'}</div><div class="ms">${marginSub}</div></div>
    <div class="met"><div class="ml">Progres kirim</div><div class="mv">${po.items.filter(i=>i.status_kirim==='diterima').length}/${t.total}</div><div class="ms">item diterima</div></div>
  </div>`;
}

function detNextSteps(id,po,invV,invD){
  const vendors=[...new Set(po.items.map(i=>i.vendor).filter(Boolean))];
  const {itemInvV}=buildLookup(id);
  const noVendorItems=po.items.filter((i,idx)=>(!i.vendor||!i.harga_vendor)&&!itemInvV[idx]);
  const anyInvVUnpaid=invV.filter(iv=>iv.bayar_status!=='lunas'&&!isPassthrough(iv.id));
  const notKirim=po.items.filter(i=>i.status_kirim!=='diterima');
  const hasInvD=invD.length>0;
  const anyInvDUnpaid=invD.filter(d=>d.terima_status!=='lunas');

  let rows=[];
  if(noVendorItems.length)rows.push({label:`${noVendorItems.length} item belum ada vendor/harga: ${noVendorItems.slice(0,3).map(i=>i.nama).join(', ')}${noVendorItems.length>3?' +lainnya':''}`,action:`<button class="btn bxs bt" onclick="openNewInvV('${id}')">+ Buat invoice vendor</button>`});
  vendors.filter(v=>!invV.some(iv=>iv.vendor===v)).forEach(v=>rows.push({label:`Vendor "${v}" belum ada invoice`,action:`<button class="btn bxs bt" onclick="openNewInvVForVendor('${id}','${v}')">+ Invoice untuk ${v}</button>`}));
  anyInvVUnpaid.forEach(iv=>rows.push({label:`${iv.no} (${iv.vendor}) belum dibayar — sisa ${fmtF(invVNet(iv).sisa)}`,action:!isPassthrough(iv.id)?`<button class="btn bxs bp" onclick="openBayarInvV('${iv.id}')">Bayar ${iv.no}</button>`:null}));
  if(notKirim.length){
    const urgent=notKirim.filter(i=>i.deadline&&diffDays(i.deadline)<=0);
    rows.push(urgent.length
      ?{urgent:true,label:`${urgent.length} item terlambat/deadline hari ini: ${urgent.map(i=>i.nama).join(', ')}`,action:`<button class="btn bxs bt" onclick="document.querySelector('#det-body .tbl')?.scrollIntoView({behavior:'smooth'})">Lihat tabel ↓</button>`}
      :{label:`${notKirim.length} item belum diterima dapur`,action:`<button class="btn bxs bt" onclick="document.querySelector('#det-body .tbl')?.scrollIntoView({behavior:'smooth'})">Lihat tabel ↓</button>`});
  }
  if(!hasInvD)rows.push({label:'Belum ada invoice ke dapur',action:`<button class="btn bxs bpu" onclick="openNewInvD('${id}')">+ Invoice dapur</button>`});
  anyInvDUnpaid.forEach(d=>rows.push({label:`${d.no} ke ${d.dapur} belum diterima — sisa ${fmtF(d.total-(d.payments||[]).reduce((a,p)=>a+p.jumlah,0))}`,action:`<button class="btn bxs bp" onclick="openTerima('${d.id}')">Rekam terima</button>`}));

  const html=rows.length
    ?rows.map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${s.urgent?'var(--dbg)':'var(--wbg)'};border:1px solid ${s.urgent?'var(--dbd)':'var(--wb)'};border-radius:var(--r);margin-bottom:5px;flex-wrap:wrap;gap:8px">
      <div style="width:14px;height:14px;border-radius:50%;background:${s.urgent?'var(--dn)':'var(--wn)'};flex-shrink:0;display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:8px;font-weight:700">!</span></div>
      <span style="flex:1;font-size:12px;min-width:120px">${s.label}</span>
      <div>${s.action||''}</div>
    </div>`).join('')
    :'<div style="padding:8px 10px;background:var(--abg);border:1px solid var(--ab);border-radius:var(--r);font-size:12px;color:var(--at)">✓ Semua tahap selesai untuk PO ini</div>';
  return`<div class="card"><div class="ct">Langkah selanjutnya</div>${html}</div>`;
}

function detItems(id,po,itemInvV,itemInvD,itemPassthrough){
  const spekVisible=window._spekVisible===true;
  const byHari={};po.items.forEach((item,idx)=>{const k=item.hari||'—';if(!byHari[k])byHari[k]=[];byHari[k].push({...item,_idx:idx});});
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;flex-wrap:wrap;gap:6px">
    <div style="font-size:11px;color:var(--t3);display:flex;align-items:center;gap:7px">
      ${statusIcon(true,false)} Selesai &nbsp; ${statusIcon(false,true)} Perlu aksi &nbsp; ${statusIcon(false,false)} Belum
    </div>
    <button class="btn bxs" onclick="window._spekVisible=!window._spekVisible;showDetail('${id}')">${spekVisible?'Hide spek':'Show spek'}</button>
  </div>`;
  Object.entries(byHari).forEach(([hari,items])=>{
    const hariId='hari-sec-'+hari.replace(/[^a-z0-9]/gi,'_');
    const dls=items.filter(i=>i.deadline).map(i=>i.deadline).sort();
    const dl=dls[0]||'';const diff=dl?diffDays(dl):null;
    const dlCls=diff===null?'':diff<0?'r':diff===0?'r':diff<=1?'a':'g';
    const _isItemDone=i=>{const idx=i._idx;const ivObj=itemInvV[idx];const idObj=itemInvD[idx];const isPT=itemPassthrough.has(idx);const s3=i.status_kirim==='diterima';return isPT?(!!ivObj&&ivObj.bayar_status==='lunas'&&s3):(!!ivObj&&ivObj.bayar_status==='lunas'&&s3&&!!idObj&&idObj.terima_status==='lunas');};
    const hariDone=items.every(_isItemDone);
    const hariBelum=hariDone?0:items.filter(i=>!_isItemDone(i)).length;
    html+=`<div style="background:${hariDone?'var(--gbg, #f0fdf4)':'var(--s2)'};padding:5px 10px;border-radius:var(--r);margin:9px 0 4px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none" onclick="toggleHariSec('${hariId}')">
      <span style="font-size:12px;font-weight:600;color:${hariDone?'var(--ac)':'var(--t2)'}">
        ${hariDone?'✓ ':''}${hari}
      </span>
      <div style="display:flex;align-items:center;gap:10px">
        ${dl?`<span style="font-size:11px;font-family:var(--mn)" class="${dlCls}">Deadline: ${dl}${diff!==null?' ('+(diff===0?'Hari ini':diff<0?Math.abs(diff)+'h lalu':diff+'h lagi')+')':''}</span>`:''}
        ${hariDone?'<span class="tag tok" style="font-size:10px">Selesai</span>':`<span style="font-size:11px;color:var(--t3)">${hariBelum} item belum selesai</span>`}
        <span id="${hariId}-arrow" style="font-size:11px;color:var(--t3)">▲</span>
      </div>
    </div>
    <div id="${hariId}" style="overflow:hidden;transition:max-height .35s ease;max-height:99999px">`;
    html+=`<div class="det-tbl-wrap" style="margin-bottom:4px"><table class="tbl" style="width:100%"><thead><tr>
      <th>Nama</th><th>Kat</th><th style="white-space:nowrap">Tipe</th><th style="white-space:nowrap">Sat</th><th style="white-space:nowrap">Qty</th><th style="white-space:nowrap">Hrg PO</th>
      ${spekVisible?'<th>Spesifikasi</th>':''}
      <th class="col-vendor">Vendor</th><th style="white-space:nowrap">Hrg Vendor</th><th class="col-margin" style="white-space:nowrap">Margin</th>
      <th style="white-space:nowrap" title="Klik untuk detail status">Status</th><th>Aksi</th>
    </tr></thead><tbody>`;
    items.forEach(item=>{
      const idx=item._idx;
      const ip=(item.qty||0)*(item.harga_po||0);
      const nk=item.nota_key?getFile(item.nota_key):null;
      const ivObj=itemInvV[idx];const idObj=itemInvD[idx];
      const ivItemMatch=ivObj?.items?.find(i=>i.nama===item.nama);
      const displayVendor=item.vendor||ivObj?.vendor||'';
      const displayHargaV=item.harga_vendor||(ivItemMatch?(ivItemMatch.harga_vendor_po!=null?ivItemMatch.harga_vendor_po:ivItemMatch.harga_vendor):0);
      const iv2=displayHargaV?(item.qty||0)*displayHargaV:null;
      const im=iv2!==null?ip-iv2:null;
      const mc=im===null?'mzero':im>0?'mpos':'mneg';
      const isPT=itemPassthrough.has(idx);
      const s2w=ivObj&&ivObj.bayar_status!=='lunas';
      const s3=item.status_kirim==='diterima';const s3w=item.status_kirim==='dikirim';
      const s5w=idObj&&idObj.terima_status!=='lunas';
      const allDone=isPT?(!!ivObj&&ivObj.bayar_status==='lunas'&&s3):(!!ivObj&&ivObj.bayar_status==='lunas'&&s3&&!!idObj&&idObj.terima_status==='lunas');
      const hasWarn=!isPT&&(s2w||s5w||(!ivObj)||(!s3&&!s3w&&item.deadline&&diffDays(item.deadline)<=0))||isPT&&(s2w||(!ivObj)||(!s3&&!s3w&&item.deadline&&diffDays(item.deadline)<=0));
      const rowStatus=allDone?'done':hasWarn?'todo':'running';
      html+=`<tr data-status="${rowStatus}" data-kat="${item.kat||''}" data-vendor="${displayVendor.toLowerCase()}" data-nama="${item.nama.toLowerCase()}">
        <td style="font-weight:500;min-width:110px">${item.nama}${item.retur?`<br><span style="font-size:9px;color:var(--dn)">Retur: ${fmtF(item.retur.val)}</span>`:''}</td>
        <td><select onchange="setItemKat('${id}',${idx},this.value)" style="font-size:10px;padding:2px 4px;width:74px;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--tx)"><option value="">—</option>${getCats().map(c=>`<option value="${c}" ${item.kat===c?'selected':''}>${c}</option>`).join('')}</select></td>
        <td>${tipeTag(item.tipe_kirim)}</td>
        <td style="white-space:nowrap">${item.satuan}</td>
        <td class="num" style="white-space:nowrap">${item.qty}</td>
        <td class="num" style="white-space:nowrap">${fmtF(item.harga_po)}</td>
        ${spekVisible?`<td style="font-size:11px;color:var(--t2);max-width:150px;word-break:break-word">${item.spek||'—'}</td>`:''}
        <td class="col-vendor" style="font-size:12px">${displayVendor||`<button class="btn bxs bt" onclick="openNewInvVForVendor('${id}','')">+ Isi via invoice</button>`}</td>
        <td style="white-space:nowrap">${displayHargaV?`<span class="num">${fmtF(displayHargaV)}</span>`:`<button class="btn bxs bt" onclick="openNewInvVForVendor('${id}','${displayVendor||''}')">+ Isi via invoice</button>`}</td>
        <td class="col-margin ${mc}" style="white-space:nowrap">${im!==null?fmtF(im):'—'}</td>
        <td style="text-align:center">
          <button class="stat-btn" data-stat-trigger onclick="showStatPopup(event,'${id}',${idx})" title="Lihat detail status & aksi">${statusIcon(allDone,hasWarn)}</button>
          <div style="margin-top:2px"><button class="stat-btn" data-stat-trigger onclick="showStatPopup(event,'${id}',${idx})" style="width:auto;height:auto;border-radius:3px;padding:1px 5px;font-size:9px;font-family:var(--mn);color:${allDone?'var(--ac)':hasWarn?'var(--wn)':'var(--t3)'};text-decoration:underline;text-underline-offset:2px">${allDone?'✓ Selesai':hasWarn?'! Perlu aksi':'· Berjalan'}</button></div>
          ${nk?`<div style="margin-top:2px"><span class="tag tin" style="cursor:pointer;font-size:9px" onclick="viewNota('${item.nota_key}','${item.nama}')">📎</span></div>`:''}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:4px">
            <button class="btn bxs bt" onclick="openKirim('${id}',${idx})">Kirim</button>
            <div class="kbb">
              <button class="kbb-btn" onclick="openKbb('kbb-item-${id}-${idx}',event)">⋯</button>
              <div class="kbb-menu" id="kbb-item-${id}-${idx}">
                <button onclick="openItemEdit('${id}',${idx});document.getElementById('kbb-item-${id}-${idx}').classList.remove('open')">Edit</button>
                <button onclick="openGantiItem('${id}',${idx});document.getElementById('kbb-item-${id}-${idx}').classList.remove('open')">Ganti item</button>
                <div class="kbb-div"></div>
                <button class="kd" onclick="hapusItem('${id}',${idx});document.getElementById('kbb-item-${id}-${idx}').classList.remove('open')">Hapus</button>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
    });
    html+='</tbody></table></div>';
    // Mobile cards
    html+=`<div class="det-item-cards" style="display:none">`;
    items.forEach(item=>{
      const idx=item._idx;
      const ip=(item.qty||0)*(item.harga_po||0);
      const iv2=item.harga_vendor?(item.qty||0)*(item.harga_vendor||0):null;
      const im=iv2!==null?ip-iv2:null;
      const ivObj2=itemInvV[idx];const isPT2=itemPassthrough.has(idx);
      const allDone2=isPT2?(!!ivObj2&&ivObj2.bayar_status==='lunas'&&item.status_kirim==='diterima'):(!!ivObj2&&ivObj2.bayar_status==='lunas'&&item.status_kirim==='diterima'&&!!itemInvD[idx]&&itemInvD[idx].terima_status==='lunas');
      const hasWarn2=!allDone2&&((!ivObj2)||(ivObj2&&ivObj2.bayar_status!=='lunas')||(item.deadline&&diffDays(item.deadline)<=0));
      const statusLabel=allDone2?'✓ Selesai':hasWarn2?'! Perlu aksi':'· Berjalan';
      const statusColor=allDone2?'var(--ac)':hasWarn2?'var(--wn)':'var(--t3)';
      const statusBg=allDone2?'var(--abg)':hasWarn2?'var(--wbg)':'var(--s2)';
      html+=`<div style="padding:10px 0;border-bottom:1px solid var(--bd)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <div style="font-weight:500;font-size:13px;flex:1">${item.nama}</div>
          <button class="stat-btn" data-stat-trigger onclick="showStatPopup(event,'${id}',${idx})" style="flex-shrink:0;padding:2px 7px;font-size:10px;border-radius:9px;background:${statusBg};color:${statusColor};border:none;cursor:pointer">${statusLabel}</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px">
          <span style="font-size:11px;color:var(--t3);font-family:var(--mn)">${item.qty} ${item.satuan}</span>
          <span style="font-size:11px;color:var(--in)">${item.tipe_kirim==='fresh'?'Fresh':'Bulk'}</span>
          ${item.vendor?`<span style="font-size:11px;color:var(--t2)">${item.vendor}</span>`:'<span style="font-size:11px;color:var(--t3)">Belum ada vendor</span>'}
          ${item.deadline?`<span style="font-size:11px;color:var(--t3);font-family:var(--mn)">Jt: ${item.deadline}</span>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:11px;color:var(--t2)">PO: ${fmtF(item.harga_po)}${item.harga_vendor?' · Vendor: '+fmtF(item.harga_vendor):''}</span>
          <span style="font-size:11px;font-family:var(--mn);font-weight:500;color:${im===null?'var(--t3)':im>=0?'var(--ac)':'var(--dn)'}">${im===null?'—':fmtF(im)}</span>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn bxs bt" onclick="openKirim('${id}',${idx})" style="font-size:11px;padding:4px 8px">Kirim</button>
          <div class="kbb"><button class="kbb-btn" onclick="openKbb('kbb-mob-${id}-${idx}',event)" style="font-size:11px;padding:4px 8px">⋯</button>
            <div class="kbb-menu" id="kbb-mob-${id}-${idx}">
              <button onclick="openItemEdit('${id}',${idx})">Edit</button>
              <button onclick="openGantiItem('${id}',${idx})">Ganti item</button>
              <button onclick="showStatPopup(event,'${id}',${idx})">Lihat status</button>
              <div class="kbb-div"></div>
              <button class="kd" onclick="hapusItem('${id}',${idx})">Hapus</button>
            </div>
          </div>
        </div>
      </div>`;
    });
    html+=`</div></div>`;
  });
  return html;
}

function detVendorSummary(id,po,invV,invD){
  // Build invDItemMap to resolve harga_dapur per item (same logic as buildLaporanData)
  const invDItemMap={};
  const passThroughInvVIds=new Set();
  const _cleanNama=n=>(n||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
  (invD||[]).forEach(d=>{
    if(d.type==='passthrough'){if(d.pt_inv_id)passThroughInvVIds.add(d.pt_inv_id);return;}
    (d.items||[]).forEach(i=>{
      const iNama=_cleanNama(i.nama);
      const key=`${iNama}||${i.hari||''}`;
      if(!(key in invDItemMap))invDItemMap[key]=i.harga_dapur;
      const fallback=`${iNama}||__any__`;
      if(!(fallback in invDItemMap))invDItemMap[fallback]=i.harga_dapur;
    });
  });

  const byVendor={};po.items.forEach((item,idx)=>{const v=item.vendor||'(Belum)';if(!byVendor[v])byVendor[v]=[];byVendor[v].push({...item,_idx:idx});});
  let html='';
  Object.entries(byVendor).forEach(([vname,vitems])=>{
    const vInvV=invV.filter(iv=>iv.vendor===vname);
    const totalV=vitems.reduce((s,i)=>s+(i.qty||0)*(i.harga_vendor||0),0);
    // Compute margin: use harga_dapur (actual) where available, harga_po (estimasi) otherwise
    let totalRevenue=0;let hasEstimate=false;
    vitems.forEach(i=>{
      const nm=(i.nama||'').trim();
      const diKey=`${nm}||${i.hari||''}`;
      const bestIv=vInvV.find(iv=>(iv.items||[]).some(ii=>(ii.nama||'').trim()===nm&&(ii.hari||'')===(i.hari||'')));
      let hd=null;
      if(invDItemMap[diKey]!=null)hd=invDItemMap[diKey];
      else if(invDItemMap[`${nm}||__any__`]!=null)hd=invDItemMap[`${nm}||__any__`];
      else if(passThroughInvVIds.has(bestIv?.id))hd=i.harga_vendor;
      if(hd!=null){totalRevenue+=(i.qty||0)*hd;}
      else{totalRevenue+=(i.qty||0)*(i.harga_po||0);if(i.harga_vendor>0)hasEstimate=true;}
    });
    const margin=totalRevenue-totalV;const vObj=getVendorObj(vname);
    const allBayar=vInvV.length>0&&vInvV.every(iv=>iv.bayar_status==='lunas');
    html+=`<div class="vblock"><div class="vblock-hdr">
      <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
        <span style="font-weight:600;font-size:13px">${vname}</span>
        ${vObj?.cashback?'<span class="tag tpu">Cashback</span>':''}
        ${vObj?.hp?`<span style="font-size:11px;font-family:var(--mn);color:var(--t3)">${vObj.hp}</span>`:''}
        ${totalV>0?`<span class="num" style="font-size:12px;color:var(--t2)">Modal: ${fmtF(totalV)}</span><span class="num" style="font-size:12px;${margin>=0?'color:var(--ac)':'color:var(--dn)'}">Margin: ${fmtF(margin)}${hasEstimate?'<span style="font-size:10px;color:var(--t3);font-weight:400"> estimasi</span>':''}</span>`:'<span style="font-size:11px;color:var(--t3)">Harga belum diisi</span>'}
      </div>
      <div class="bg">
        ${vInvV.map(iv=>`<span class="tag ${iv.bayar_status==='lunas'?'tok':'tno'}">${iv.no} ${iv.bayar_status==='lunas'?'✓':'Blm bayar'}</span>`).join('')}
        ${!allBayar&&vname!=='(Belum)'?`<button class="btn bsm bt" onclick="openNewInvVForVendor('${id}','${vname}')">+ Invoice</button>`:''}
        ${vname!=='(Belum)'&&vInvV.length?`<button class="btn bsm bi" onclick="openRekapVendor('${id}','${encodeURIComponent(vname)}')">Rekap →</button>`:''}
      </div>
    </div></div>`;
  });
  return`<div class="card"><div class="ct">Ringkasan per vendor</div>${html}</div>`;
}

function detInvV(id,invV){
  if(!invV.length)return'';
  return'<div class="card"><div class="ct">Invoice Vendor</div>'+invV.map(iv=>{
    const n=invVNet(iv);const vObj=getVendorObj(iv.vendor);const cbTotal=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
    return`<div class="inv-card"><div class="inv-hdr">
      <div>
        <span style="font-weight:600;font-size:13px">${iv.no}</span>
        <span class="tag ${iv.bayar_status==='lunas'?'tok':'tno'}" style="margin-left:4px">${iv.bayar_status==='lunas'?'Lunas':'Blm dibayar'}</span>
        ${(vObj?.cashback||hasCashback(iv.vendor))?'<span class="tag tpu" style="margin-left:3px">Cashback</span>':''}
        <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin:2px 0">${iv.vendor} · ${iv.tgl}${iv.jatuh?' · Jt: '+iv.jatuh:''}</div>
        <div style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
          <span>Total: <strong class="num">${fmtF(iv.total)}</strong></span>
          ${n.retur>0?`<span style="color:var(--dn)">Retur: -${fmtF(n.retur)}</span><span>Net: <strong class="num">${fmtF(n.netTotal)}</strong></span>`:''}
          <span class="${n.sisa>0?'r':'g'}">Sisa: ${fmtF(n.sisa)}</span>
          ${cbTotal>0?`<span style="color:var(--pu)">CB: +${fmtF(cbTotal)}</span>`:''}
        </div>
        <div style="font-size:10px;color:var(--t3);margin-top:3px">Item: ${(iv.items||[]).map(i=>`${i.nama} (${i.qty} ${i.satuan})`).join(', ')}</div>
      </div>
      <div class="bg">
        ${iv.bayar_status!=='lunas'&&!isPassthrough(iv.id)?`<button class="btn bsm bp" onclick="openBayarInvV('${iv.id}')">Rekam bayar</button>`:iv.bayar_status!=='lunas'?'<span class="tag ttl" style="font-size:10px">Pass-through</span>':''}
        <button class="btn bsm bw" onclick="openEditInvV('${iv.id}')">Edit qty/harga</button>
        ${!isPassthrough(iv.id)?`<button class="btn bsm bw" onclick="openKonversiPT('${iv.id}')">Konversi PT</button>`:''}
        ${(vObj?.cashback||hasCashback(iv.vendor))&&!cbTotal?`<button class="btn bsm bpu" onclick="openCashback('${iv.id}')">+ Cashback</button>`:''}
        <button class="btn bsm bw" onclick="openRetur('${iv.id}')">+ Retur</button>
        <button class="btn bsm" onclick="printInvV('${iv.id}')">🖨</button>
      </div>
    </div>
    ${(iv.edits||[]).length?`<div style="margin-top:5px;padding:5px 8px;background:var(--wbg);border-radius:var(--r);font-size:10px;color:var(--wt)">Histori revisi: ${iv.edits.map(e=>`${e.tgl} — ${e.catatan||'Revisi harga'}`).join(' · ')}</div>`:''}
    ${(iv.returs||[]).length?`<div style="margin-top:4px;padding:5px 8px;background:var(--dbg);border-radius:var(--r)">${iv.returs.map(r=>`<div style="font-size:10px;color:var(--dt)">${r.tgl}: Retur ${fmtF(r.val)} — ${r.ket}</div>`).join('')}</div>`:''}
    ${(iv.payments||[]).length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">${iv.payments.map(p=>`<div class="pay-row"><span>${p.tgl} · <strong>${getRekNama(p.rek_id)}</strong></span><span class="num r">-${fmtF(p.jumlah)}</span>${p.catatan?`<span style="color:var(--t3);font-size:10px">${p.catatan}</span>`:''}</div>`).join('')}</div>`:''}
    ${(iv.cashbacks||[]).length?`<div style="margin-top:4px;padding:4px 8px;background:var(--pbg);border-radius:var(--r)">${iv.cashbacks.map(c=>`<div style="font-size:10px;color:var(--pt)">${c.tgl}: CB ${fmtF(c.jumlah)} — ${getRekNama(c.rek_id)}</div>`).join('')}</div>`:''}
    </div>`;
  }).join('')+'</div>';
}

function detInvD(id,invD){
  if(!invD.length)return'';
  return'<div class="card"><div class="ct">Invoice ke Dapur</div>'+invD.map(id2=>{
    const recv=(id2.payments||[]).reduce((s,p)=>s+p.jumlah,0);const sisa=id2.total-recv;
    return`<div class="inv-card"><div class="inv-hdr">
      <div>
        <span style="font-weight:600;font-size:13px">${id2.no}</span>
        ${id2.type==='passthrough'?'<span class="tag tpu" style="margin-left:3px">Pass-through</span>':''}
        <span class="tag ${id2.terima_status==='lunas'?'tok':'tno'}" style="margin-left:3px">${id2.terima_status==='lunas'?'Lunas':'Blm diterima'}</span>
        <div style="font-size:11px;color:var(--t3);font-family:var(--mn);margin:2px 0">${id2.dapur} · ${id2.tgl}${id2.jatuh?' · Jt: '+id2.jatuh:''}</div>
        <div style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
          <span>Total: <strong class="num">${fmtF(id2.total)}</strong></span>
          <span class="${sisa>0?'a':'g'}">Sisa: ${fmtF(sisa)}</span>
        </div>
      </div>
      <div class="bg">
        ${id2.terima_status!=='lunas'?`<button class="btn bsm bp" onclick="openTerima('${id2.id}')">Rekam terima</button>`:''}
        ${id2.type==='passthrough'&&id2.pt_inv_id?`<button class="btn bsm bt" onclick="showInvVDetail('${id2.pt_inv_id}')">Lihat inv vendor</button>`:''}
        ${id2.type==='passthrough'&&id2.terima_status==='lunas'&&id2.pt_inv_id&&(()=>{const ptV=getInvV().find(v=>v.id===id2.pt_inv_id);return ptV&&ptV.bayar_status!=='lunas';})()
          ?`<button class="btn bsm bt" onclick="syncPassthroughInvV();showDetail('${id}');showToast('Invoice vendor diupdate!')">Sync vendor lunas</button>`:''}
        <button class="btn bsm" onclick="printInvD('${id2.id}')">🖨</button>
      </div>
    </div>
    ${(id2.payments||[]).length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)">${id2.payments.map(p=>`<div class="pay-row"><span>${p.tgl} · <strong>${getRekNama(p.rek_id)}</strong></span><span class="num g">+${fmtF(p.jumlah)}</span></div>`).join('')}</div>`:''}
    </div>`;
  }).join('')+'</div>';
}

function detRevisions(po){
  if(!po.revisions?.length)return'';
  return'<div class="card"><div class="ct">Histori revisi PO</div>'+po.revisions.map((rev,ri)=>`<div style="padding:6px 0;border-bottom:1px solid var(--bd)"><div style="font-size:10px;font-family:var(--mn);color:var(--t3);margin-bottom:2px">Revisi #${ri+1} — ${rev.tgl}</div>${rev.changes.map(c=>`<div style="font-size:12px;margin:1px 0"><strong>${c.nama}</strong>: ${c.qty_lama!==c.qty_baru?`Qty ${c.qty_lama}→${c.qty_baru} `:''}${c.harga_lama!==c.harga_baru?`Hrg ${fmtF(c.harga_lama)}→${fmtF(c.harga_baru)} `:''}${c.alasan?`<span style="color:var(--t3)">(${c.alasan})</span>`:''}</div>`).join('')}</div>`).join('')+'</div>';
}

function showDetail(id){
  _currentPoId=id;
  const po=getPOs().find(p=>p.id===id);if(!po)return;
  const t=poTotals(po);
  const {invV,invD,itemInvV,itemInvD,itemPassthrough}=buildLookup(id);

  // Header
  document.getElementById('det-t').textContent=po.no+' — '+fmtDapurKode(po.dapur);
  document.getElementById('det-s').innerHTML=po.date+' · '+t.total+' item'+(po.catatan?' · '+po.catatan:'')+' '+jenisBadge(po.jenis);
  document.getElementById('det-act').innerHTML=`
    <button class="btn bsm bp" onclick="openBuatPOV('${id}')">📤 PO ke Vendor</button>
    <button class="btn bsm bt" onclick="openNewInvV('${id}')">+ Invoice Vendor</button>
    <button class="btn bsm bpu" onclick="openNewInvD('${id}')">+ Invoice Dapur</button>
    <button class="btn bsm bi" onclick="openTambahItem('${id}')">+ Tambah Item</button>
    <button class="btn bsm" onclick="clonePO('${id}')">Clone PO</button>
    <button class="btn bsm" onclick="openLaporanPO('${id}')">📄 Laporan</button>`;

  // Filter bar + items section with sub-function calls
  const filterBar=`<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;flex-wrap:wrap;gap:8px">
    <div class="ct" style="margin:0">Detail item per hari</div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <select id="det-f-stat" onchange="filterDetItems()" style="font-size:11px;padding:3px 6px;width:auto"><option value="">Semua status</option><option value="todo">Perlu aksi</option><option value="done">Selesai</option><option value="running">Berjalan</option></select>
      <select id="det-f-kat" onchange="filterDetItems()" style="font-size:11px;padding:3px 6px;width:auto"><option value="">Semua kategori</option>${getCats().map(c=>`<option value="${c}">${c}</option>`).join('')}</select>
      <select id="det-f-vendor" onchange="filterDetItems()" style="font-size:11px;padding:3px 6px;width:auto"><option value="">Semua vendor</option>${[...new Set(po.items.map(i=>i.vendor).filter(Boolean))].map(v=>`<option value="${v}">${v}</option>`).join('')}</select>
      <div style="display:flex;align-items:center;gap:5px">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:.4;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="det-srch" placeholder="Cari item..." style="font-size:11px;padding:4px 7px;width:130px" oninput="filterDetItems()">
      </div>
      <span id="det-srch-cnt" style="font-size:10px;color:var(--t3);font-family:var(--mn);white-space:nowrap"></span>
    </div>
  </div>${detItems(id,po,itemInvV,itemInvD,itemPassthrough)}</div>`;

  // Preserve hari section collapse state before re-render
  const _collapsedHari=new Set();
  document.querySelectorAll('[id^="hari-sec-"]').forEach(el=>{
    if(el.style.maxHeight==='0px')_collapsedHari.add(el.id);
  });

  document.getElementById('det-body').innerHTML=
    detMetrics(po,t,invV,invD)+
    detNextSteps(id,po,invV,invD)+
    filterBar+
    detVendorSummary(id,po,invV,invD)+
    detInvV(id,invV)+
    detInvD(id,invD)+
    detRevisions(po);

  // Restore collapsed state after render
  if(_collapsedHari.size>0){
    _collapsedHari.forEach(hariId=>{
      const el=document.getElementById(hariId);
      const arrow=document.getElementById(hariId+'-arrow');
      if(el){el.style.maxHeight='0px';}
      if(arrow)arrow.textContent='▼';
    });
  }

  nav('detail-po');
}


function setItemKat(poId,idx,kat){const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po||!po.items[idx])return;po.items[idx].kat=kat;setPOs(pos);showToast('Kategori disimpan');}

// ===== EDIT ITEM PO =====
function openItemEdit(poId,idx){
  const po=getPOs().find(p=>p.id===poId);if(!po)return;const item=po.items[idx];if(!item)return;
  document.getElementById('ie-po-id').value=poId;document.getElementById('ie-idx').value=idx;
  document.getElementById('item-edit-info').textContent=item.nama+(item.hari?' · '+item.hari:'');
  document.getElementById('ie-qty').value=item.qty||'';
  document.getElementById('ie-satuan').value=item.satuan||'';
  document.getElementById('ie-harga-po').value=item.harga_po||'';
  document.getElementById('ie-kat').value=item.kat||'';
  document.getElementById('ie-tipe').value=item.tipe_kirim||'fresh';
  document.getElementById('ie-deadline').value=item.deadline||'';
  document.getElementById('ie-harga-vendor').value=item.harga_vendor||'';
  document.getElementById('ie-alasan').value='';
  // Warning jika item sudah punya invV atau invD
  const warnEl=document.getElementById('item-edit-warn');
  const {itemInvV,itemInvD}=buildLookup(poId);
  const hasInvV=!!itemInvV[idx];const hasInvD=!!itemInvD[idx];
  if(hasInvV||hasInvD){
    const parts=[];
    if(hasInvV)parts.push('invoice vendor ('+itemInvV[idx].no+')');
    if(hasInvD)parts.push('invoice dapur ('+itemInvD[idx].no+')');
    warnEl.innerHTML='⚠ Item ini sudah punya '+parts.join(' dan ')+'. Mengubah <strong>qty di sini tidak mengubah qty di invoice</strong> — perbarui invoice secara terpisah jika qty berubah.';
    warnEl.dataset.invvNo=hasInvV?itemInvV[idx].no:'';
    warnEl.style.display='block';
  } else {
    warnEl.dataset.invvNo='';
    warnEl.style.display='none';
  }
  openModal('modal-item');
}
function saveItemEdit(){
  const poId=document.getElementById('ie-po-id').value;const idx=parseInt(document.getElementById('ie-idx').value);
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;const item=po.items[idx];if(!item)return;
  const oldQty=item.qty;const oldHP=item.harga_po;
  item.qty=parseFloat(document.getElementById('ie-qty').value)||item.qty;
  item.satuan=document.getElementById('ie-satuan').value.trim()||item.satuan;
  item.harga_po=parseFloat(document.getElementById('ie-harga-po').value)||item.harga_po;
  const newHV=parseFloat(document.getElementById('ie-harga-vendor').value);
  if(newHV>0){item.harga_vendor=newHV;if(item.satuan_konv)delete item.satuan_konv;}
  item.kat=document.getElementById('ie-kat').value;
  item.tipe_kirim=document.getElementById('ie-tipe').value;
  item.deadline=document.getElementById('ie-deadline').value;
  const alasan=document.getElementById('ie-alasan').value.trim();
  if(item.qty!==oldQty||item.harga_po!==oldHP){
    if(!po.revisions)po.revisions=[];
    po.revisions.push({tgl:today(),changes:[{nama:item.nama,qty_lama:oldQty,qty_baru:item.qty,harga_lama:oldHP,harga_baru:item.harga_po,alasan:alasan||'Edit item'}]});
  }
  addLog('edit_item','Edit item','item',poId,po?.no,item?.nama||'');setPOs(pos);closeModal('modal-item');
  const _invvNo=document.getElementById('item-edit-warn').dataset.invvNo||'';
  if(item.qty!==oldQty&&_invvNo)showToast('Qty PO diperbarui. Jangan lupa update qty di invoice vendor '+_invvNo+' juga.',true);
  else showToast('Item diperbarui!');
  showDetail(poId);
}
function openGantiItem(poId,idx){
  const po=getPOs().find(p=>p.id===poId);if(!po)return;
  const item=po.items[idx];if(!item)return;
  document.getElementById('gi-po-id').value=poId;
  document.getElementById('gi-idx').value=idx;
  // Info item lama
  document.getElementById('gi-info').innerHTML=
    `Mengganti: <strong>${item.nama}</strong> ${item.qty} ${item.satuan}${item.hari?' · '+item.hari:''}<br>`+
    `<span style="font-size:11px;color:var(--t3)">Harga PO: ${fmtF(item.harga_po)} · Kat: ${item.kat||'—'}</span>`;
  // Warning kalau item sudah punya invoice vendor
  const invVForItem=getInvV().filter(iv=>iv.po_id===poId&&(iv.items||[]).some(i=>
    (typeof i.idx==='number'?i.idx===idx:i.nama===item.nama)
  ));
  const warnEl=document.getElementById('gi-warn');
  if(invVForItem.length){
    warnEl.style.display='block';
    warnEl.innerHTML=`⚠ Item ini sudah ada di invoice vendor: <strong>${invVForItem.map(iv=>iv.no).join(', ')}</strong>. `+
      `Setelah diganti, invoice vendor tersebut perlu direvisi atau dihapus secara manual.`;
  } else {
    warnEl.style.display='none';
  }
  // Pre-fill pengganti dengan data lama (kecuali nama)
  document.getElementById('gi-nama').value='';
  document.getElementById('gi-kat').value=item.kat||'';
  document.getElementById('gi-qty').value=item.qty||'';
  document.getElementById('gi-satuan').value=item.satuan||'';
  document.getElementById('gi-harga-po').value=item.harga_po||'';
  document.getElementById('gi-tipe').value=item.tipe_kirim||'fresh';
  document.getElementById('gi-deadline').value=item.deadline||'';
  document.getElementById('gi-alasan').value='';
  openModal('modal-ganti-item');
}
function saveGantiItem(){
  const poId=document.getElementById('gi-po-id').value;
  const idx=parseInt(document.getElementById('gi-idx').value);
  const namaInput=document.getElementById('gi-nama').value.trim();
  const alasan=document.getElementById('gi-alasan').value.trim()||'Edit item';
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  const itemLama={...po.items[idx]};if(!itemLama)return;
  const namaGanti=namaInput||itemLama.nama;// kosong = pertahankan nama lama
  const namaDiganti=namaGanti!==itemLama.nama;
  const qtyBaru=parseFloat(document.getElementById('gi-qty').value)||itemLama.qty;
  const hargaBaru=parseFloat(document.getElementById('gi-harga-po').value)||itemLama.harga_po;
  po.items[idx]={
    ...itemLama,
    nama:namaGanti,
    kat:document.getElementById('gi-kat').value||itemLama.kat,
    qty:qtyBaru,
    satuan:document.getElementById('gi-satuan').value.trim()||itemLama.satuan,
    harga_po:hargaBaru,
    tipe_kirim:document.getElementById('gi-tipe').value||itemLama.tipe_kirim,
    deadline:document.getElementById('gi-deadline').value||itemLama.deadline,
    // Reset vendor info hanya jika nama item diganti
    ...(namaDiganti?{harga_vendor:0,vendor:'',nota_key:null,status_kirim:'belum',tgl_kirim:'',tgl_diterima:'',retur:null}:{}),
  };
  // Catat di revisions
  if(!po.revisions)po.revisions=[];
  const label=namaDiganti?`${itemLama.nama} → ${namaGanti}`:itemLama.nama;
  po.revisions.push({tgl:today(),changes:[{
    nama:label,
    qty_lama:itemLama.qty,qty_baru:qtyBaru,
    harga_lama:itemLama.harga_po,harga_baru:hargaBaru,
    alasan
  }]});
  setPOs(pos);
  addLog(namaDiganti?'ganti_item':'edit_item',namaDiganti?'Ganti item':'Edit item','item',poId,po?.no,(namaDiganti?itemLama.nama+' → '+namaGanti:namaGanti)+' · '+alasan);
  closeModal('modal-ganti-item');
  showToast(namaDiganti?`Item diganti: ${itemLama.nama} → ${namaGanti}`:'Item diperbarui!');
  showDetail(poId);
}

function hapusItem(poId,idx){
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  const item=po.items[idx];if(!item)return;
  // Check if item has invoice vendor or invoice dapur
  const invVForItem=getInvV().filter(iv=>iv.po_id===poId&&(iv.items||[]).some(i=>
    typeof i.idx==='number'?i.idx===idx:i.nama===item.nama
  ));
  const invDForItem=getInvD().filter(d=>d.po_id===poId&&(d.items||[]).some(i=>i.nama===item.nama));
  const warnParts=[];
  if(invVForItem.length)warnParts.push('Invoice Vendor: '+invVForItem.map(iv=>iv.no).join(', '));
  if(invDForItem.length)warnParts.push('Invoice Dapur: '+invDForItem.map(d=>d.no).join(', '));
  const warn=warnParts.length?'\n\n⚠ Item ini sudah ada di:\n'+warnParts.join('\n')+'\nInvoice tersebut tidak otomatis terhapus.':'';
  if(!confirm(`Hapus item "${item.nama}" (${item.qty} ${item.satuan})?${warn}`))return;
  // Record in revisions
  if(!po.revisions)po.revisions=[];
  po.revisions.push({tgl:today(),changes:[{nama:item.nama,qty_lama:item.qty,qty_baru:0,harga_lama:item.harga_po,harga_baru:0,alasan:'Item dihapus'}]});
  addLog('hapus_item','Hapus item','item',poId,po?.no,item.nama+' '+item.qty+' '+item.satuan);
  po.items.splice(idx,1);
  setPOs(pos);
  showToast(`Item "${item.nama}" dihapus`);
  showDetail(poId);
}
let taiId=0;
function openTambahItem(poId){
  const po=getPOs().find(p=>p.id===poId);if(!po)return;
  document.getElementById('tai-po-id').value=poId;
  document.getElementById('tai-info').innerHTML=`<strong>${po.no}</strong> — ${po.dapur} · ${po.items.length} item saat ini`;
  taiId=0;document.getElementById('tai-tbody').innerHTML='';
  addTaiRow();
  openModal('modal-tambah-item');
}
function addTaiRow(d){taiId++;createItemRow('tai-'+taiId,'tai-tbody',d);}
function saveTambahItem(){
  const poId=document.getElementById('tai-po-id').value;
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  const newItems=readItemRows('tai-tbody');
  if(!newItems.length){showToast('Isi minimal 1 item!',true);return;}
  po.items.push(...newItems);
  // Catat di revisions
  if(!po.revisions)po.revisions=[];
  po.revisions.push({tgl:today(),changes:newItems.map(i=>({nama:i.nama,qty_lama:0,qty_baru:i.qty,harga_lama:0,harga_baru:i.harga_po,alasan:'Item baru ditambahkan'}))});
  setPOs(pos);
  closeModal('modal-tambah-item');
  addLog('tambah_item','Tambah item ke PO','po',poId,po?.no,newItems.length+' item: '+newItems.map(i=>i.nama).join(', '));
  showToast(`${newItems.length} item ditambahkan ke PO!`);
  showDetail(poId);
}

// ===== STATUS KIRIM PER ITEM =====
function openKirim(poId,idx){
  const po=getPOs().find(p=>p.id===poId);if(!po)return;const item=po.items[idx];if(!item)return;
  document.getElementById('ki-po-id').value=poId;document.getElementById('ki-idx').value=idx;
  document.getElementById('ki-info').innerHTML=`<strong>${item.nama}</strong> — ${item.qty} ${item.satuan} ${catBadge(item.kat)}<br><span style="font-size:11px;color:var(--t3)">${item.tipe_kirim==='fresh'?'Fresh — kirim sesuai deadline':'Bulk — boleh digabung'}${item.deadline?' · Deadline: '+item.deadline:''}</span>`;
  document.getElementById('ki-stat').value=item.status_kirim||'belum';
  document.getElementById('ki-tgl').value=item.tgl_kirim||'';
  document.getElementById('ki-cat').value='';
  document.getElementById('ki-retur-wrap').style.display=item.status_kirim==='diterima'?'block':'none';
  document.getElementById('ki-rqty').value='';document.getElementById('ki-rval').value='';document.getElementById('ki-rket').value='';
  openModal('modal-kirim');
}
function saveKirim(){
  const poId=document.getElementById('ki-po-id').value;const idx=parseInt(document.getElementById('ki-idx').value);
  const pos=getPOs();const po=pos.find(p=>p.id===poId);if(!po)return;
  const stat=document.getElementById('ki-stat').value;
  const tgl=document.getElementById('ki-tgl').value;
  const rv=parseFloat(document.getElementById('ki-rval').value)||0;
  // Check if bulk update (from invoice vendor)
  const allIdxsEl=document.getElementById('ki-all-idxs');
  const idxs=allIdxsEl?.value?allIdxsEl.value.split(',').map(Number):[idx];
  idxs.forEach(i=>{
    const item=po.items[i];if(!item)return;
    item.status_kirim=stat;
    item.tgl_kirim=tgl;
    if(stat==='diterima'&&!item.tgl_diterima)item.tgl_diterima=tgl;
    if(rv>0)item.retur={qty:parseFloat(document.getElementById('ki-rqty').value)||0,val:rv,ket:document.getElementById('ki-rket').value,tgl};
  });
  setPOs(pos);closeModal('modal-kirim');
  addLog('update_kirim','Update kirim','po',poId,'',stat+' · '+idxs.length+' item');showToast(idxs.length>1?`${idxs.length} item diperbarui!`:'Status kirim diperbarui!');
  if(_currentPage==='inv-vendor')renderInvV();else showDetail(poId);
}

// Bulk kirim update from invoice vendor list
function openKirimInvV(invId){
  const inv=getInvV().find(v=>v.id===invId);if(!inv)return;
  const po=getPOs().find(p=>p.id===inv.po_id);if(!po)return;
  const itemIdxs=[];
  (inv.items||[]).forEach(i=>{
    let pidx=-1;
    // Pass 1: exact idx
    if(typeof i.idx==='number'&&po.items[i.idx]&&po.items[i.idx].nama===i.nama)pidx=i.idx;
    // Pass 2: composite key (nama+hari+deadline)
    if(pidx<0&&(i.hari||i.deadline)){
      const k=itemKey(i);
      pidx=po.items.findIndex(pi=>itemKey(pi)===k);
    }
    // Pass 3: nama only (legacy)
    if(pidx<0)pidx=po.items.findIndex(pi=>pi.nama===i.nama&&!itemIdxs.includes(po.items.indexOf(pi)));
    if(pidx>=0&&!itemIdxs.includes(pidx))itemIdxs.push(pidx);
  });
  if(!itemIdxs.length){showToast('Tidak ada item ditemukan',true);return;}
  const firstPending=itemIdxs.find(idx=>po.items[idx].status_kirim!=='diterima')??itemIdxs[0];
  const firstItem=po.items[firstPending];
  document.getElementById('ki-po-id').value=inv.po_id;
  document.getElementById('ki-idx').value=firstPending;
  document.getElementById('ki-info').innerHTML=`
    <strong>${inv.no}</strong> — ${inv.vendor}<br>
    <span style="font-size:11px;color:var(--t2)">Update status kirim untuk semua item dalam invoice ini:</span>
    <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px">
      ${itemIdxs.map(idx=>{const it=po.items[idx];return`<span class="tag ${it.status_kirim==='diterima'?'tok':it.status_kirim==='dikirim'?'ttl':'tgr'}">${it.nama}${it.hari?' ('+it.hari+')':''}</span>`;}).join('')}
    </div>
    <input type="hidden" id="ki-all-idxs" value="${itemIdxs.join(',')}">`;
  document.getElementById('ki-stat').value=firstItem.status_kirim||'belum';
  document.getElementById('ki-tgl').value=firstItem.tgl_kirim||today();
  document.getElementById('ki-cat').value='';
  document.getElementById('ki-retur-wrap').style.display='none';
  document.getElementById('ki-rqty').value='';document.getElementById('ki-rval').value='';document.getElementById('ki-rket').value='';
  openModal('modal-kirim');
}

// ===== STATUS POPUP =====
function showStatPopup(event,poId,idx){
  event.stopPropagation();
  const po=getPOs().find(p=>p.id===poId);if(!po)return;const item=po.items[idx];if(!item)return;
  const {invV,invD,itemInvV,itemInvD,itemPassthrough}=buildLookup(poId);
  const ivObj=itemInvV[idx];const idObj=itemInvD[idx];
  const isPT=itemPassthrough.has(idx);// vendor paid directly by dapur, no invD needed
  const s1=!!ivObj;
  const s2=ivObj&&ivObj.bayar_status==='lunas';const s2w=ivObj&&!s2;
  const s3=item.status_kirim==='diterima';const s3w=item.status_kirim==='dikirim';
  // For pass-through: s4 and s5 are auto-true (no invoice dapur needed)
  const s4=isPT?true:!!idObj;
  const s5=isPT?true:(idObj&&idObj.terima_status==='lunas');const s5w=!isPT&&idObj&&!s5;

  // Determine which steps are blocking
  const prevDone={s1,s2,s3,s4}; // each step may depend on prior

  function sRow(ok,warn,label,detail,actionHtml,blocker,navHtml){
    const dcls=ok?'sdot-ok':warn?'sdot-warn':'sdot-gray';
    const badge=ok
      ?`<span style="font-size:10px;font-weight:600;color:var(--ac)">✓ Selesai</span>`
      :warn
        ?`<span style="font-size:10px;font-weight:600;color:var(--wn)">! Perlu aksi</span>`
        :`<span style="font-size:10px;color:var(--t3)">Belum</span>`;
    const blockerNote=blocker&&!ok?`<div style="font-size:10px;color:var(--t3);font-style:italic;padding:1px 0 0 16px">${blocker}</div>`:'';
    // Show action buttons if step not done, show nav button always if provided
    const actionRow=(!ok&&actionHtml)||(navHtml)?`<div style="padding:5px 0 2px 16px;display:flex;gap:5px;flex-wrap:wrap">${!ok&&actionHtml?actionHtml:''}${navHtml||''}</div>`:'';
    return`<div class="stat-srow">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <span class="sdot ${dcls}" style="flex-shrink:0"></span>
        <span style="flex:1;font-size:12px;font-weight:600;min-width:80px">${label}</span>
        ${badge}
      </div>
      ${detail?`<div style="font-size:11px;color:${ok?'var(--t2)':warn?'var(--wt)':'var(--t3)'};padding:3px 0 0 16px;line-height:1.5">${detail}</div>`:''}
      ${blockerNote}
      ${actionRow}
    </div>`;
  }

  // Build detail text that explains what's missing
  const d1=s1
    ?`${ivObj.no} · ${ivObj.vendor}${ivObj.jatuh?' · Jt: '+ivObj.jatuh:''}`
    :item.vendor
      ?`Vendor "${item.vendor}" belum dibuatkan invoice`
      :'Belum ada vendor & harga untuk item ini';

  const d2=!s1?'Tunggu invoice vendor dibuat dulu'
    :s2?`Lunas · ${ivObj.vendor}`
    :`Sisa tagihan: ${fmtF(invVNet(ivObj).sisa)} ke ${ivObj.vendor}${ivObj.jatuh?' · Jt: '+ivObj.jatuh:''}`;

  const d3=s3?`Diterima dapur${item.tgl_diterima?' · '+item.tgl_diterima:''}`
    :s3w?`Sedang dalam pengiriman${item.tgl_kirim?' sejak '+item.tgl_kirim:''}`
    :`Belum dikirim${item.deadline?' · Deadline: '+item.deadline:''}`;

  const d4=isPT
    ?'Pass-through — dapur bayar langsung ke vendor, tidak perlu invoice dapur'
    :s4?`${idObj.no} · ${idObj.dapur}`
    :'Belum ada invoice ke dapur untuk item ini';

  const d5=isPT
    ?'Pass-through — selesai otomatis'
    :!s4?'Tunggu invoice dapur dibuat dulu'
    :s5?'Lunas'
    :`Sisa piutang: ${fmtF(idObj.total-(idObj.payments||[]).reduce((a,p)=>a+p.jumlah,0))} dari ${idObj.dapur}${idObj.jatuh?' · Jt: '+idObj.jatuh:''}`;

  document.getElementById('stat-popup-title').innerHTML=`<span style="font-weight:700">${item.nama}</span> <span style="font-size:10px;font-weight:400;color:var(--t3)">${item.qty} ${item.satuan}</span>`;
  const navInvV=s1?`<button class="btn bxs bi" onclick="closeStatPopup();showInvVDetail('${ivObj.id}')">Lihat invoice →</button>`:'';
  const navInvD=!isPT&&s4?`<button class="btn bxs bi" onclick="closeStatPopup();showInvDDetail('${idObj.id}')">Lihat invoice →</button>`:'';
  document.getElementById('stat-popup-body').innerHTML=
    sRow(s1,false,'1. Invoice vendor',d1,
      `<button class="btn bxs bt" onclick="closeStatPopup();openNewInvVForVendor('${poId}','${item.vendor||''}')">+ Buat invoice vendor</button>`,
      '',navInvV)
   +sRow(s2,s2w,'2. Bayar vendor',d2,
      s1&&!isPT&&!isPassthrough(ivObj.id)
        ?`<button class="btn bxs bp" onclick="closeStatPopup();openBayarInvV('${ivObj.id}')">Rekam bayar</button>`
        :s1?`<span style="font-size:11px;color:var(--tl)">Pass-through — dibayar via dapur</span>`:'',
      !s1?'Selesaikan langkah 1 dulu':'',navInvV)
   +sRow(s3,s3w,'3. Kirim ke dapur',d3,
      `<button class="btn bxs bt" onclick="closeStatPopup();openKirim('${poId}',${idx})">Update status kirim</button>`)
   +sRow(s4,false,'4. Invoice dapur',d4,
      isPT?''
        :s4?''
        :s1?`<button class="btn bxs bpu" onclick="closeStatPopup();openNewInvD('${poId}')">+ Buat invoice dapur</button>`:'',
      '',navInvD)
   +sRow(s5,s5w,'5. Terima dari dapur',d5,
      isPT?''
        :s4?`<button class="btn bxs bp" onclick="closeStatPopup();openTerima('${idObj.id}')">Rekam pembayaran</button>`:'',
      !isPT&&!s4?'Selesaikan langkah 4 dulu':'',navInvD)
   +(item.retur?`<div style="margin-top:6px;padding:5px 8px;background:var(--dbg);border-radius:var(--r);font-size:11px;color:var(--dt)">⚠ Retur: ${fmtF(item.retur.val)} — ${item.retur.ket}</div>`:'');

  // Activity log timeline
  const logs=[];
  // PO created
  const poObj=getPOs().find(p=>p.id===poId);
  if(poObj)logs.push({tgl:poObj.date||poObj.created?.split('T')[0]||'—',ev:'Item masuk PO',detail:poObj.no+' · '+poObj.dapur});
  // Invoice vendor
  if(ivObj){
    logs.push({tgl:ivObj.tgl,ev:'Invoice vendor dibuat',detail:ivObj.no+' · '+ivObj.vendor+' · '+fmtF(ivObj.total)});
    (ivObj.edits||[]).forEach(e=>logs.push({tgl:e.tgl,ev:'Invoice vendor direvisi',detail:e.catatan+' · '+fmtF(e.total_lama)+'→'+fmtF(e.total_baru)}));
    (ivObj.payments||[]).forEach(p=>logs.push({tgl:p.tgl,ev:'Bayar ke vendor',detail:fmtF(p.jumlah)+' · '+getRekNama(p.rek_id)}));
    (ivObj.returs||[]).forEach(r=>logs.push({tgl:r.tgl,ev:'Retur vendor',detail:fmtF(r.val)+' · '+r.ket}));
    (ivObj.cashbacks||[]).forEach(c=>logs.push({tgl:c.tgl,ev:'Cashback diterima',detail:fmtF(c.jumlah)+' · '+getRekNama(c.rek_id)}));
  }
  // Kirim
  if(item.tgl_kirim)logs.push({tgl:item.tgl_kirim,ev:item.status_kirim==='diterima'?'Diterima dapur':'Sedang dikirim',detail:item.status_kirim==='diterima'&&item.tgl_diterima?'Tgl terima: '+item.tgl_diterima:''});
  if(item.retur)logs.push({tgl:item.retur.tgl||'—',ev:'Retur barang',detail:fmtF(item.retur.val)+' · '+item.retur.ket});
  // Invoice dapur
  if(idObj){
    logs.push({tgl:idObj.tgl,ev:'Invoice dapur dibuat',detail:idObj.no+' · '+idObj.dapur+' · '+fmtF(idObj.total)});
    (idObj.payments||[]).forEach(p=>logs.push({tgl:p.tgl,ev:'Terima dari dapur',detail:fmtF(p.jumlah)+' · '+getRekNama(p.rek_id)}));
  }
  // PO revisions affecting this item
  (poObj?.revisions||[]).forEach(rev=>{
    rev.changes.filter(c=>c.nama===item.nama).forEach(c=>logs.push({tgl:rev.tgl,ev:'Revisi PO',detail:`Qty: ${c.qty_lama}→${c.qty_baru} · Hrg: ${fmtF(c.harga_lama)}→${fmtF(c.harga_baru)}${c.alasan?' ('+c.alasan+')':''}`}));
  });
  logs.sort((a,b)=>a.tgl.localeCompare(b.tgl));

  const logHtml=logs.length?`<div style="margin-top:10px;padding-top:8px;border-top:2px solid var(--bd)">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:6px">Riwayat aktivitas</div>
    ${logs.map((l,i)=>`<div style="display:flex;gap:8px;padding:4px 0;${i<logs.length-1?'border-bottom:1px solid var(--bd)':''}">
      <div style="flex-shrink:0;text-align:right;min-width:58px;font-size:10px;font-family:var(--mn);color:var(--t3);padding-top:1px">${l.tgl}</div>
      <div style="width:1px;background:var(--bd);flex-shrink:0;margin:2px 0"></div>
      <div>
        <div style="font-size:11px;font-weight:500;color:var(--tx)">${l.ev}</div>
        ${l.detail?`<div style="font-size:10px;color:var(--t3);font-family:var(--mn)">${l.detail}</div>`:''}
      </div>
    </div>`).join('')}
  </div>`:'';

  document.getElementById('stat-popup-body').innerHTML+=logHtml;

  // Position and show popup — synchronous, no rAF needed
  const popup=document.getElementById('stat-popup');
  // Show off-screen first to measure
  popup.style.visibility='hidden';
  popup.style.top='0px';
  popup.style.left='0px';
  popup.classList.add('open');

  const btnRect=event.currentTarget.getBoundingClientRect();
  const pw=popup.offsetWidth||300;
  const ph=popup.offsetHeight||400;
  const mg=10;const vw=window.innerWidth;const vh=window.innerHeight;
  let top=btnRect.bottom+6;
  if(top+ph>vh-mg)top=Math.max(mg,btnRect.top-ph-6);
  let left=btnRect.left;
  if(left+pw>vw-mg)left=vw-pw-mg;
  if(left<mg)left=mg;
  popup.style.top=top+'px';
  popup.style.left=left+'px';
  popup.style.visibility='visible';
}
function closeStatPopup(){document.getElementById('stat-popup').classList.remove('open');}
document.addEventListener('click',e=>{
  const p=document.getElementById('stat-popup');
  if(!p||!p.classList.contains('open'))return;
  // Don't close if click was on a trigger button or inside the popup
  if(e.target.closest('[data-stat-trigger]')||p.contains(e.target))return;
  p.classList.remove('open');
});

// ===== VIEW NOTA =====
async function viewNota(key,nama){
  document.getElementById('nota-title').textContent='Nota: '+nama;
  const b=document.getElementById('nota-body');
  b.innerHTML=`<div style="padding:20px;text-align:center;color:var(--t3)">Memuat file...</div>`;
  openModal('modal-nota');
  let data=getFile(key);
  if(!data)data=await loadFile(key);
  if(!data){b.innerHTML=`<p style="color:var(--dn);padding:10px">File tidak ditemukan.</p>`;return;}
  if(data.startsWith('data:image'))b.innerHTML=`<img src="${data}" style="max-width:100%;max-height:340px;border-radius:var(--r);display:block;margin:0 auto">`;
  else b.innerHTML=`<p style="font-size:13px;color:var(--t2);margin-bottom:9px">File PDF.</p><a href="${data}" target="_blank" class="btn bp bsm">Buka PDF</a>`;
}

