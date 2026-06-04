// ===== LAPORAN PO =====
let _laporanPoId=null;

function buildLaporanData(poId){
  const po=getPOs().find(p=>p.id===poId);if(!po)return null;
  const invVs=getInvV().filter(iv=>iv.po_id===poId);
  const invDs=getInvD().filter(d=>d.po_id===poId);
  const t=poTotals(po);

  // Per-vendor summary
  const vendorMap={};
  invVs.forEach(iv=>{
    const n=invVNet(iv);
    if(!vendorMap[iv.vendor])vendorMap[iv.vendor]={invs:[],total:0,paid:0,sisa:0,ongkir:0,cashback:0};
    const v=vendorMap[iv.vendor];
    v.invs.push(iv);
    v.total+=iv.total;
    v.paid+=n.paid;
    v.sisa+=n.sisa;
    v.ongkir+=n.ongkir||0;
    v.cashback+=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
  });

  // Total ongkir & cashback
  const totalOngkir=Object.values(vendorMap).reduce((s,v)=>s+v.ongkir,0);
  const totalCashback=Object.values(vendorMap).reduce((s,v)=>s+v.cashback,0);
  const totalInvD=invDs.reduce((s,d)=>s+d.total,0);
  const totalTerima=invDs.reduce((s,d)=>s+(d.payments||[]).reduce((a,p)=>a+p.jumlah,0),0);

  // Build invD item map: (nama||hari) → harga_dapur
  const invDItemMap={};
  const passThroughInvVIds=new Set();
  const cleanInvDNama=n=>(n||'').split('\n')[0].replace(/[⚠✕].*/,'').trim();
  invDs.forEach(d=>{
    if(d.type==='passthrough'){if(d.pt_inv_id)passThroughInvVIds.add(d.pt_inv_id);return;}
    (d.items||[]).forEach(i=>{
      const iNama=cleanInvDNama(i.nama);
      const key=`${iNama}||${i.hari||''}`;
      if(!(key in invDItemMap))invDItemMap[key]=i.harga_dapur;
      // Fallback key for old items without hari
      const fallback=`${iNama}||__any__`;
      if(!(fallback in invDItemMap))invDItemMap[fallback]=i.harga_dapur;
    });
  });

  // Items by hari — search directly across all invVs by hari+nama to avoid stale-idx issues
  const {itemInvV}=buildLookup(poId);
  const byHari={};
  const claimedInvVItems=new Set(); // prevent two PO items with same nama from claiming the same invV item
  po.items.forEach((item,idx)=>{
    const h=item.hari||'—';
    if(!byHari[h])byHari[h]=[];
    const nm=item.nama.trim();
    // Pass A: search all invVs for item matching hari+nama (bypasses stale idx), skip already-claimed
    let bestIv=null,bestIvItem=null;
    if(item.hari){
      passA:for(const iv of invVs){
        const iItems=iv.items||[];
        for(let j=0;j<iItems.length;j++){
          const claimKey=`${iv.id}||${j}`;
          if(claimedInvVItems.has(claimKey))continue;
          if((iItems[j].nama||'').trim()===nm&&(iItems[j].hari||'')===(item.hari||'')){
            bestIv=iv;bestIvItem=iItems[j];claimedInvVItems.add(claimKey);break passA;
          }
        }
      }
    }
    // Pass B: fallback to buildLookup position match + name-only, skip already-claimed
    if(!bestIvItem){
      const ivObj=itemInvV[idx];
      const iItems=ivObj?.items||[];
      for(let j=0;j<iItems.length;j++){
        const claimKey=`${ivObj.id}||${j}`;
        if(claimedInvVItems.has(claimKey))continue;
        if((iItems[j].nama||'').trim()===nm){bestIv=ivObj;bestIvItem=iItems[j];claimedInvVItems.add(claimKey);break;}
      }
      if(!bestIv)bestIv=ivObj||null;
    }
    const hvRaw=bestIvItem?(bestIvItem.konv?(bestIvItem.harga_vendor_po!=null?bestIvItem.harga_vendor_po:bestIvItem.harga_vendor):bestIvItem.harga_vendor||bestIvItem.harga_vendor_po||0):0;
    const hv=hvRaw||item.harga_vendor||0;
    const displayVendor=item.vendor||bestIv?.vendor||'';
    // harga_dapur from invD item (actual revenue per unit)
    const diKey=`${nm}||${item.hari||''}`;
    let harga_dapur=null;
    if(invDItemMap[diKey]!=null)harga_dapur=invDItemMap[diKey];
    else if(invDItemMap[`${nm}||__any__`]!=null)harga_dapur=invDItemMap[`${nm}||__any__`];
    else if(passThroughInvVIds.has(bestIv?.id))harga_dapur=hv;
    byHari[h].push({...item,idx,harga_vendor:hv,vendor:displayVendor,harga_dapur});
  });

  const totalModalVendor=Object.values(vendorMap).reduce((s,v)=>s+v.total,0);
  return{po,invVs,invDs,t,vendorMap,totalOngkir,totalCashback,totalInvD,totalTerima,byHari,totalModalVendor,invDItemMap,passThroughInvVIds};
}

function openLaporanPO(poId){
  _laporanPoId=poId;
  const d=buildLaporanData(poId);if(!d)return;
  document.getElementById('laporan-body').innerHTML=renderLaporanHTML(d);
  openModal('modal-laporan');
}

function renderLaporanHTML(d){
  const{po,t,vendorMap,totalOngkir,totalCashback,totalInvD,totalTerima,byHari,invDs,totalModalVendor,invDItemMap,passThroughInvVIds}=d;

  // Pre-compute allItems and vMarginMap — margin = harga_dapur - harga_vendor (actual)
  const allItems=[];
  Object.entries(byHari).forEach(([hari,items])=>items.forEach(item=>{
    const margin=item.harga_dapur!=null&&item.harga_vendor>0?(item.harga_dapur-item.harga_vendor)*(item.qty||0):null;
    allItems.push({...item,hari,margin});
  }));
  const totalItemMargin=allItems.reduce((s,i)=>s+(i.margin||0),0);
  const vMarginMap={};
  allItems.forEach(item=>{
    if(item.margin===null)return;
    const v=item.vendor||'(Belum)';
    vMarginMap[v]=(vMarginMap[v]||0)+item.margin;
  });

  // Overall margin: actual invD revenue - vendor cost (accrual basis)
  const marginBersih=totalInvD>0?totalInvD-totalModalVendor-totalOngkir+totalCashback:null;
  const pct=marginBersih!=null&&totalInvD>0?(marginBersih/totalInvD*100).toFixed(1):null;

  const sec=(title,content)=>`
    <div style="margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;padding-bottom:5px;border-bottom:2px solid #e5e5e5;margin-bottom:10px">${title}</div>
      ${content}
    </div>`;

  const metRow=(label,val,sub='',cls='')=>`
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:4px 0;border-bottom:1px solid #f0f0f0">
      <span style="color:#555">${label}</span>
      <span style="font-family:monospace;font-weight:600${cls?';color:'+cls:''}">${val}${sub?`<span style="font-size:10px;font-weight:400;color:#999;margin-left:6px">${sub}</span>`:''}</span>
    </div>`;

  // Header
  let html=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid #222">
      <div>
        <div style="font-size:11px;color:#999;margin-bottom:2px">LAPORAN PO</div>
        <div style="font-size:22px;font-weight:700;letter-spacing:.02em">${po.no}</div>
        <div style="font-size:13px;color:#555;margin-top:3px">${po.dapur} · ${po.date}${po.catatan?' · '+po.catatan:''}</div>
        <div style="margin-top:4px"><span style="font-size:11px;background:${po.jenis==='operasional'?'#ede9fe':'#dcfce7'};color:${po.jenis==='operasional'?'#7c3aed':'#16a34a'};padding:2px 8px;border-radius:9px">${po.jenis==='operasional'?'Operasional':'Bahan Baku'}</span></div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#999">SIMS · v5.0</div>
        <div style="font-size:11px;color:#999;margin-top:2px">Dicetak: ${new Date().toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
      </div>
    </div>`;

  // Ringkasan finansial
  html+=sec('Ringkasan Finansial',`
    ${metRow('Total invoice ke dapur (pendapatan)',totalInvD>0?fmtF(totalInvD):'—')}
    ${metRow('Total modal vendor',totalModalVendor>0?fmtF(totalModalVendor):'—')}
    ${totalOngkir?metRow('Ongkos kirim','-'+fmtF(totalOngkir),'','#dc2626'):''}
    ${totalCashback?metRow('Cashback diterima','+'+fmtF(totalCashback),'','#7c3aed'):''}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 0 4px;border-top:2px solid #222;margin-top:4px">
      <span style="font-weight:700">Margin bersih</span>
      <span style="font-family:monospace;font-weight:700;font-size:16px;color:${marginBersih===null?'#999':marginBersih>=0?'#16a34a':'#dc2626'}">${marginBersih===null?'—':fmtF(marginBersih)}${pct?` <span style="font-size:11px;font-weight:400;color:#888">(${pct}%)</span>`:''}</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f0f0">
      <span style="color:#555">Sudah diterima dari dapur</span>
      <span style="font-family:monospace;color:${totalTerima>=totalInvD&&totalInvD>0?'#16a34a':'#888'}">${fmtF(totalTerima)}${totalInvD>0?' / '+fmtF(totalInvD):''}</span>
    </div>
    ${metRow('Nilai PO (referensi)',fmtF(t.tp),'','#aaa')}`);

  // Per vendor
  const vendorEntries=Object.entries(vendorMap);
  if(vendorEntries.length){
    let vendorHtml='';
    vendorEntries.forEach(([nama,v])=>{
      const allInvItems=v.invs.flatMap(iv=>(iv.items||[]).map(i=>({...i,iv})));
      const vendorMargin=vMarginMap[nama]||0;
      const marginBersihVendor=vendorMargin-v.ongkir+v.cashback;

      vendorHtml+=`
        <div style="margin-bottom:18px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
          <!-- Vendor header -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7f7f7;border-bottom:1px solid #e0e0e0">
            <div>
              <div style="font-weight:700;font-size:14px">${nama}</div>
              <div style="font-size:11px;color:#888;margin-top:2px">${v.invs.map(iv=>`${iv.no} · ${iv.bayar_status==='lunas'?'✓ Lunas':'Belum dibayar'}`).join(' | ')}</div>
            </div>
            <div style="display:flex;gap:20px;text-align:right;font-size:12px">
              <div><div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Modal</div><div style="font-family:monospace;font-weight:600">${fmtF(v.total)}</div></div>
              <div><div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Margin</div><div style="font-family:monospace;font-weight:700;color:${vendorMargin>=0?'#16a34a':'#dc2626'}">${fmtF(vendorMargin)}</div></div>
              <div><div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.05em">Sisa bayar</div><div style="font-family:monospace;font-weight:600;color:${v.sisa>0?'#dc2626':'#16a34a'}">${fmtF(v.sisa)}</div></div>
            </div>
          </div>
          <!-- Item table -->
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#fafafa">
              <th style="padding:5px 14px;text-align:left;color:#666;font-weight:600;border-bottom:1px solid #e8e8e8">Item</th>
              <th style="padding:5px 14px;text-align:right;color:#666;font-weight:600;border-bottom:1px solid #e8e8e8">Qty</th>
              <th style="padding:5px 14px;text-align:right;color:#666;font-weight:600;border-bottom:1px solid #e8e8e8">Hrg dapur</th>
              <th style="padding:5px 14px;text-align:right;color:#666;font-weight:600;border-bottom:1px solid #e8e8e8">Hrg vendor</th>
              <th style="padding:5px 14px;text-align:right;color:#666;font-weight:600;border-bottom:1px solid #e8e8e8">Margin</th>
            </tr></thead>
            <tbody>${allInvItems.map(i=>{
              const qtyPO=findPoItem(po,i)?.qty||i.qty||0;
              const diKey=`${(i.nama||'').trim()}||${i.hari||''}`;
              const hd=passThroughInvVIds.has(i.iv?.id)?i.harga_vendor:(invDItemMap[diKey]??invDItemMap[`${(i.nama||'').trim()}||__any__`]??null);
              const marginTotal=hd!=null&&i.harga_vendor>0?(hd-i.harga_vendor)*qtyPO:null;
              return`<tr style="border-bottom:1px solid #f0f0f0">
                <td style="padding:5px 14px;font-weight:500">${i.nama}</td>
                <td style="padding:5px 14px;text-align:right;font-family:monospace;color:#555">${i.qty} ${i.satuan||''}</td>
                <td style="padding:5px 14px;text-align:right;font-family:monospace;color:#555">${hd!=null?fmtF(hd):'—'}</td>
                <td style="padding:5px 14px;text-align:right;font-family:monospace;color:#555">${fmtF(i.harga_vendor||0)}</td>
                <td style="padding:5px 14px;text-align:right;font-family:monospace;font-weight:600;color:${marginTotal===null?'#ccc':marginTotal>=0?'#16a34a':'#dc2626'}">${marginTotal===null?'—':fmtF(marginTotal)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          <!-- Totals footer -->
          <div style="display:flex;justify-content:flex-end;padding:8px 14px;background:#fafafa;border-top:1px solid #e8e8e8;gap:0">
            <table style="font-size:11px;width:260px;border-collapse:collapse">
              <tr><td style="padding:2px 8px;color:#666">Total modal vendor</td><td style="padding:2px 8px;text-align:right;font-family:monospace">${fmtF(v.total)}</td></tr>
              <tr><td style="padding:2px 8px;color:#666">Total margin</td><td style="padding:2px 8px;text-align:right;font-family:monospace;color:${vendorMargin>=0?'#16a34a':'#dc2626'}">${fmtF(vendorMargin)}</td></tr>
              ${v.ongkir?`<tr><td style="padding:2px 8px;color:#666">Ongkos kirim</td><td style="padding:2px 8px;text-align:right;font-family:monospace;color:#dc2626">-${fmtF(v.ongkir)}</td></tr>`:''}
              ${v.cashback?`<tr><td style="padding:2px 8px;color:#666">Cashback</td><td style="padding:2px 8px;text-align:right;font-family:monospace;color:#7c3aed">+${fmtF(v.cashback)}</td></tr>`:''}
              ${v.ongkir||v.cashback?`<tr style="border-top:1px solid #e0e0e0"><td style="padding:4px 8px;font-weight:700">Margin bersih</td><td style="padding:4px 8px;text-align:right;font-family:monospace;font-weight:700;color:${marginBersihVendor>=0?'#16a34a':'#dc2626'}">${fmtF(marginBersihVendor)}</td></tr>`:''}
            </table>
          </div>
        </div>`;
    });
    html+=sec('Detail per Vendor',vendorHtml);
  }


  // Margin by item — grouped by nama+satuan
  const itemGroupMap=new Map();
  allItems.forEach(item=>{
    const key=(item.nama||'').trim()+'||'+(item.satuan||'');
    if(!itemGroupMap.has(key))itemGroupMap.set(key,{nama:item.nama,kat:item.kat,satuan:item.satuan||'',totalQty:0,totalMargin:0,allNull:true,hd_set:new Set(),hv_set:new Set()});
    const g=itemGroupMap.get(key);
    g.totalQty+=(item.qty||0);
    if(item.margin!==null){g.totalMargin+=item.margin;g.allNull=false;}
    if(item.harga_dapur!=null)g.hd_set.add(item.harga_dapur);
    if(item.harga_vendor)g.hv_set.add(item.harga_vendor);
  });
  let itemMarginHtml=`<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f5f5f5">
      <th style="padding:5px 8px;text-align:left">Item</th>
      <th style="padding:5px 8px;text-align:right">Total Qty</th>
      <th style="padding:5px 8px;text-align:right">Hrg dapur</th>
      <th style="padding:5px 8px;text-align:right">Hrg vendor</th>
      <th style="padding:5px 8px;text-align:right">Total Margin</th>
    </tr></thead><tbody>`;
  itemGroupMap.forEach(g=>{
    const hd=g.hd_set.size===1?[...g.hd_set][0]:null;
    const hv=g.hv_set.size===1?[...g.hv_set][0]:null;
    const marginDisplay=g.allNull?null:g.totalMargin;
    itemMarginHtml+=`<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:5px 8px;font-weight:500">${g.nama}${g.kat?` <span style="font-size:10px;color:#888">${g.kat}</span>`:''}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace">${g.totalQty} ${g.satuan}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace">${hd!=null?fmtF(hd):'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace">${hv!=null?fmtF(hv):'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:600;color:${marginDisplay===null?'#ccc':marginDisplay>=0?'#16a34a':'#dc2626'}">${marginDisplay===null?'—':fmtF(marginDisplay)}</td>
    </tr>`;
  });
  itemMarginHtml+=`<tr style="border-top:2px solid #222;font-weight:600">
    <td colspan="4" style="padding:6px 8px;text-align:right">Total margin</td>
    <td style="padding:6px 8px;text-align:right;font-family:monospace;color:${totalItemMargin>=0?'#16a34a':'#dc2626'}">${fmtF(totalItemMargin)}</td>
  </tr></tbody></table>`;
  html+=sec('Margin per Item',itemMarginHtml);

  // Margin by vendor
  let vendorMarginHtml=`<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:#f5f5f5">
      <th style="padding:5px 8px;text-align:left">Vendor</th>
      <th style="padding:5px 8px;text-align:right">Total modal</th>
      <th style="padding:5px 8px;text-align:right">Total margin</th>
      <th style="padding:5px 8px;text-align:right">Ongkir</th>
      <th style="padding:5px 8px;text-align:right">Cashback</th>
      <th style="padding:5px 8px;text-align:right">Margin bersih</th>
      <th style="padding:5px 8px;text-align:right">%</th>
    </tr></thead><tbody>`;
  Object.entries(vendorMap).forEach(([nama,v])=>{
    const vMargin=vMarginMap[nama]||0;
    const vMarginBersih=vMargin-(v.ongkir||0)+(v.cashback||0);
    const pctV=v.total>0?(vMarginBersih/v.total*100).toFixed(1):null;
    vendorMarginHtml+=`<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:5px 8px;font-weight:500">${nama}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace">${fmtF(v.total)}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:${vMargin>=0?'#16a34a':'#dc2626'}">${fmtF(vMargin)}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:#dc2626">${v.ongkir?'-'+fmtF(v.ongkir):'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;color:#7c3aed">${v.cashback?'+'+fmtF(v.cashback):'—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:monospace;font-weight:600;color:${vMarginBersih>=0?'#16a34a':'#dc2626'}">${fmtF(vMarginBersih)}</td>
      <td style="padding:5px 8px;text-align:right;color:#666">${pctV?pctV+'%':'—'}</td>
    </tr>`;
  });
  vendorMarginHtml+='</tbody></table>';
  // Add total row
  const grandModal=Object.values(vendorMap).reduce((s,v)=>s+v.total,0);
  const grandOngkir=Object.values(vendorMap).reduce((s,v)=>s+(v.ongkir||0),0);
  const grandCashback=Object.values(vendorMap).reduce((s,v)=>s+(v.cashback||0),0);
  const grandBersih=marginBersih!==null?marginBersih:totalItemMargin-grandOngkir+grandCashback;
  const grandPct=grandModal>0?(grandBersih/grandModal*100).toFixed(1):null;
  vendorMarginHtml+=`<div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 8px;border-top:2px solid #222;margin-top:2px;font-weight:600;font-size:13px">
    <span>Total keseluruhan</span>
    <div style="display:flex;gap:20px;font-family:monospace">
      <span style="color:#555">Modal: ${fmtF(grandModal)}</span>
      ${totalInvD>0?`<span style="color:#555">Dapur: ${fmtF(totalInvD)}</span>`:''}
      ${grandOngkir?`<span style="color:#dc2626">Ongkir: -${fmtF(grandOngkir)}</span>`:''}
      ${grandCashback?`<span style="color:#7c3aed">CB: +${fmtF(grandCashback)}</span>`:''}
      <span style="color:${grandBersih>=0?'#16a34a':'#dc2626'}">Bersih: ${fmtF(grandBersih)}${grandPct?' ('+grandPct+'%)':''}</span>
    </div>
  </div>`;
  html+=sec('Margin per Vendor',vendorMarginHtml);

  return html;
}

function printLaporan(){
  const body=document.getElementById('laporan-body').innerHTML;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Laporan PO</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#222;padding:28px 36px}
      table{width:100%;border-collapse:collapse}
      th,td{padding:4px 8px;border-bottom:1px solid #eee;vertical-align:middle;white-space:nowrap}
      th{background:#f5f5f5;font-weight:600}
      th:first-child,td:first-child{text-align:left;white-space:normal;min-width:120px}
      th:not(:first-child),td:not(:first-child){text-align:right}
      button{display:none!important}
      @media print{body{padding:16px}}
    </style>
  </head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function downloadLaporanExcel(){
  const d=buildLaporanData(_laporanPoId);if(!d)return;
  const{po,t,vendorMap,totalOngkir,totalCashback,totalInvD,totalTerima,byHari}=d;
  const marginBersih=t.margin+totalCashback;
  const safe=v=>{if(v===null||v===undefined)return '';if(typeof v==='number')return v;return String(v).replace(/^[=+\-@\t\r]/,'');};
  const wb=XLSX.utils.book_new();

  // Sheet 1: Ringkasan
  const rowsSum=[
    ['No. PO',po.no],['Dapur',po.dapur],['Tanggal',po.date],
    ['Jenis',po.jenis==='operasional'?'Operasional':'Bahan Baku'],['Catatan',po.catatan||''],['',''],
    ['RINGKASAN',''],['Nilai PO',t.tp],['Total modal vendor',t.tv||0],
    ['Total ongkos kirim',-totalOngkir],['Total cashback',totalCashback],
    ['Margin bersih',marginBersih],['',''],['Total invoice ke dapur',totalInvD],
    ['Sudah diterima',totalTerima],['Sisa piutang',Math.max(0,totalInvD-totalTerima)],
  ];
  const ws1=XLSX.utils.aoa_to_sheet(rowsSum.map(r=>r.map(safe)));
  ws1['!cols']=[{wch:28},{wch:20}];
  XLSX.utils.book_append_sheet(wb,ws1,'Ringkasan');

  // Sheet 2: Detail per Vendor
  const rowsVDet=[['Vendor','No. Invoice','Status','Total','Paid','Sisa','Ongkir','Cashback','Item','Qty','Satuan','Hrg PO','Hrg vendor','Margin']];
  Object.entries(vendorMap).forEach(([nama,v])=>{
    v.invs.forEach(iv=>{
      const n=invVNet(iv);const cbTotal=(iv.cashbacks||[]).reduce((s,c)=>s+c.jumlah,0);
      (iv.items||[]).forEach((i,idx)=>{
        const poItem=findPoItem(po,i);
        const hpo=poItem?.harga_po||0;const qtyPO=poItem?.qty||i.qty||0;const hvPO5=i.harga_vendor_po??i.harga_vendor;const mg=hpo&&hvPO5>0?(hpo-hvPO5)*(qtyPO):0;
        rowsVDet.push([idx===0?nama:'',idx===0?iv.no:'',idx===0?(iv.bayar_status==='lunas'?'Lunas':'Belum'):'',
          idx===0?iv.total:0,idx===0?n.paid:0,idx===0?n.sisa:0,idx===0?(n.ongkir||0):0,idx===0?cbTotal:0,
          i.nama,i.qty,i.satuan||'',hpo,i.harga_vendor||0,mg]);
      });
    });
  });
  const ws2=XLSX.utils.aoa_to_sheet(rowsVDet.map(r=>r.map(safe)));
  ws2['!cols']=[{wch:22},{wch:12},{wch:8},{wch:14},{wch:14},{wch:12},{wch:10},{wch:10},{wch:24},{wch:6},{wch:8},{wch:12},{wch:12},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws2,'Detail Vendor');

  // Sheet 3: Margin per Item
  const rowsItem=[['Item','Kategori','Hari','Qty','Satuan','Hrg PO','Hrg vendor','Margin']];
  Object.entries(byHari).forEach(([hari,items])=>items.forEach(item=>{
    const m=item.harga_vendor>0?(item.harga_po-item.harga_vendor)*(item.qty||0):0;
    rowsItem.push([item.nama,item.kat||'',hari,item.qty,item.satuan,item.harga_po,item.harga_vendor||0,m]);
  }));
  rowsItem.push(['TOTAL','','','','','','',rowsItem.slice(1).reduce((s,r)=>s+(r[7]||0),0)]);
  const ws3=XLSX.utils.aoa_to_sheet(rowsItem.map(r=>r.map(safe)));
  ws3['!cols']=[{wch:28},{wch:12},{wch:16},{wch:8},{wch:8},{wch:14},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws3,'Margin per Item');

  // Sheet 4: Margin per Vendor
  const rowsMV=[['Vendor','Total modal','Total margin','Ongkir','Cashback','Margin bersih','%']];
  let gM=0,gMar=0,gO=0,gCB=0;
  Object.entries(vendorMap).forEach(([nama,v])=>{
    // Hitung dari PO items langsung — konsisten dengan poTotals
    const vMar=po.items.reduce((s,pi)=>{
      if(!(pi.harga_vendor>0))return s;
      if((pi.vendor||'').toLowerCase()!==(nama||'').toLowerCase())return s;
      return s+(pi.harga_po-pi.harga_vendor)*(pi.qty||0);
    },0);
    const vMB=vMar-(v.ongkir||0)+(v.cashback||0);
    rowsMV.push([nama,v.total,vMar,-(v.ongkir||0),v.cashback||0,vMB,v.total>0?parseFloat((vMB/v.total*100).toFixed(1)):0]);
    gM+=v.total;gMar+=vMar;gO+=v.ongkir||0;gCB+=v.cashback||0;
  });
  const gB=gMar-gO+gCB;
  rowsMV.push(['TOTAL',gM,gMar,-gO,gCB,gB,gM>0?parseFloat((gB/gM*100).toFixed(1)):0]);
  const ws4=XLSX.utils.aoa_to_sheet(rowsMV.map(r=>r.map(safe)));
  ws4['!cols']=[{wch:28},{wch:16},{wch:16},{wch:12},{wch:12},{wch:16},{wch:8}];
  XLSX.utils.book_append_sheet(wb,ws4,'Margin per Vendor');

  XLSX.writeFile(wb,`Laporan-${po.no.replace(/[^a-z0-9]/gi,'_')}.xlsx`);
  showToast('File Excel berhasil didownload!');
}

// ===== KONSUMSI BAHAN BAKU =====
let _kChartBar=null,_kChartKat=null,_kChartLine=null,_kChartVendor=null,_kMetrik='nilai';

function _getKonsumsiRows(fBulan,fDapur,fVendor,fKat,fSatuan){
  const rows=[];
  getPOs().forEach(po=>{
    if(fDapur&&po.dapur!==fDapur)return;
    (po.items||[]).forEach(item=>{
      if(item.status_kirim!=='diterima')return;
      const tgl=item.tgl_diterima||po.date||'';
      const bulan=tgl.substring(0,7);
      if(fBulan&&bulan!==fBulan)return;
      if(fVendor&&item.vendor!==fVendor)return;
      if(fKat&&(item.kat||'')!==fKat)return;
      const satuan=item.satuan||'pcs';
      if(fSatuan&&satuan!==fSatuan)return;
      const qty=Math.max(0,(item.qty||0)-(item.retur?.qty||0));
      const harga=(item.harga_vendor>0?item.harga_vendor:(item.harga_po||0));
      const nilai=harga*qty;
      rows.push({nama:(item.nama||'').trim(),kat:item.kat||'Lainnya',qty,satuan,nilai,vendor:item.vendor||'—',dapur:po.dapur,bulan,tgl});
    });
  });
  return rows;
}

function _initKonsumsiFilters(){
  const allRows=_getKonsumsiRows('','','','','');
  const bulanSet=new Set(),dapurSet=new Set(),vendorSet=new Set(),katSet=new Set(),satuanSet=new Set();
  allRows.forEach(r=>{
    if(r.bulan)bulanSet.add(r.bulan);
    dapurSet.add(r.dapur);
    if(r.vendor&&r.vendor!=='—')vendorSet.add(r.vendor);
    if(r.kat&&r.kat!=='Lainnya')katSet.add(r.kat);
    satuanSet.add(r.satuan);
  });
  const save=id=>document.getElementById(id)?.value||'';
  const curB=save('k-bulan'),curD=save('k-dapur'),curV=save('k-vendor'),curK=save('k-kat'),curS=save('k-satuan');
  document.getElementById('k-bulan').innerHTML='<option value="">Semua bulan</option>'+[...bulanSet].sort().reverse().map(b=>`<option value="${b}" ${b===curB?'selected':''}>${_fmtBulan(b)}</option>`).join('');
  document.getElementById('k-dapur').innerHTML='<option value="">Semua dapur</option>'+ [...dapurSet].sort().map(d=>`<option value="${d}" ${d===curD?'selected':''}>${d}</option>`).join('');
  document.getElementById('k-vendor').innerHTML='<option value="">Semua vendor</option>'+ [...vendorSet].sort().map(v=>`<option value="${v}" ${v===curV?'selected':''}>${v}</option>`).join('');
  document.getElementById('k-kat').innerHTML='<option value="">Semua kategori</option>'+ [...katSet].sort().map(k=>`<option value="${k}" ${k===curK?'selected':''}>${k}</option>`).join('');
  document.getElementById('k-satuan').innerHTML='<option value="">Semua satuan</option>'+ [...satuanSet].sort().map(s=>`<option value="${s}" ${s===curS?'selected':''}>${s}</option>`).join('');
}

function _fmtBulan(ym){
  if(!ym)return'';
  const [y,m]=ym.split('-');
  const bln=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
  return(bln[parseInt(m)-1]||m)+' '+y;
}

function _fmtNilai(v){return'Rp '+Math.round(v).toLocaleString('id-ID');}

const _KAT_COLORS=['#2D5A3D','#1A3D6B','#4A1E8A','#8B2020','#7A5B0A','#0A5C6B','#5C3D0A','#1A5C4A'];

function setKMetrik(m){
  _kMetrik=m;
  renderKonsumsi();
}

function renderKonsumsi(){
  if(typeof Chart==='undefined'){
    document.getElementById('k-met').innerHTML='<div style="color:var(--dn);font-size:12px;padding:8px">Chart.js belum dimuat. Coba refresh halaman.</div>';
    return;
  }
  const m=_kMetrik;

  // Toggle button states
  ['nilai','frek','qty'].forEach(x=>{
    const btn=document.getElementById('k-tog-'+x);
    if(!btn)return;
    btn.classList.toggle('bp',x===m);
    btn.style.borderRightColor=x===m?'var(--ab)':x==='frek'&&m==='qty'?'var(--bd)':'var(--bd)';
  });

  // Show/hide satuan filter
  const satuanEl=document.getElementById('k-satuan');
  satuanEl.style.display=m==='qty'?'':'none';

  const fBulan=document.getElementById('k-bulan')?.value||'';
  const fDapur=document.getElementById('k-dapur')?.value||'';
  const fVendor=document.getElementById('k-vendor')?.value||'';
  const fKat=document.getElementById('k-kat')?.value||'';
  const fSatuan=m==='qty'?(satuanEl?.value||''):'';

  _initKonsumsiFilters();
  const rows=_getKonsumsiRows(fBulan,fDapur,fVendor,fKat,fSatuan);

  // Nilai warning: items tanpa harga vendor
  const warnEl=document.getElementById('k-nilai-warn');
  if(m==='nilai'){
    const noHarga=rows.filter(r=>r.nilai===0).length;
    if(noHarga>0){
      warnEl.style.display='';
      warnEl.textContent=`${noHarga} item tidak memiliki harga vendor maupun harga PO — nilai Rp 0 dan tidak terhitung dalam total.`;
    } else warnEl.style.display='none';
  } else warnEl.style.display='none';

  // Helpers
  const getVal=r=>m==='nilai'?r.nilai:m==='frek'?1:r.qty;
  const fmtVal=v=>m==='nilai'?_fmtNilai(v):Number(v).toLocaleString('id-ID');
  const valLabel=m==='nilai'?'Nilai (Rp)':m==='frek'?'Frekuensi':'Qty';
  const tooltipVal=(v,satuan)=>m==='nilai'?_fmtNilai(v):m==='frek'?v+' kali':Number(v).toLocaleString('id-ID')+' '+satuan;

  // Chart & table titles
  const titles={
    nilai:{bar:'Top bahan baku — nilai (Rp)',kat:'Nilai per kategori (Rp)',line:'Tren nilai bulanan per kategori'},
    frek:{bar:'Top bahan baku — frekuensi order',kat:'Frekuensi per kategori',line:'Tren frekuensi bulanan per kategori'},
    qty:{bar:'Top bahan baku — qty diterima'+(fSatuan?' ('+fSatuan+')':''),kat:'Qty per kategori'+(fSatuan?' ('+fSatuan+')':''),line:'Tren qty bulanan per kategori'},
  };
  document.getElementById('k-title-bar').textContent=titles[m].bar;
  document.getElementById('k-title-kat').textContent=titles[m].kat;
  document.getElementById('k-title-line').textContent=titles[m].line;

  // Table header
  const thVal=m==='nilai'?'Nilai (Rp)':m==='frek'?'Frekuensi':'Qty';
  const thSatuan=m==='qty'?'<th>Satuan</th>':'<th>Satuan</th>';
  document.getElementById('k-table-head').innerHTML=`<tr><th>Nama bahan baku</th><th>Kategori</th>${thSatuan}<th style="text-align:right">${thVal}</th><th style="text-align:right">Jumlah PO</th><th>Vendor (terbanyak)</th></tr>`;

  // Metrics
  const totalVal=rows.reduce((s,r)=>s+getVal(r),0);
  const uniqueNama=new Set(rows.map(r=>r.nama)).size;
  const uniqueVendor=new Set(rows.filter(r=>r.vendor&&r.vendor!=='—').map(r=>r.vendor)).size;
  const uniqueBulan=new Set(rows.map(r=>r.bulan).filter(Boolean)).size;
  const metLabel1=m==='nilai'?'Total nilai konsumsi':m==='frek'?'Total frekuensi':'Total qty diterima';
  const metSub1=m==='nilai'?'estimasi (harga vendor/PO)':m==='frek'?'kali diterima':fSatuan||'berbagai satuan';
  document.getElementById('k-met').innerHTML=`
    <div class="met"><div class="ml">${metLabel1}</div><div class="mv num">${fmtVal(totalVal)}</div><div class="ms">${metSub1}</div></div>
    <div class="met"><div class="ml">Jenis bahan baku</div><div class="mv num">${uniqueNama.toLocaleString('id-ID')}</div><div class="ms">nama unik</div></div>
    <div class="met"><div class="ml">Vendor terlibat</div><div class="mv num">${uniqueVendor.toLocaleString('id-ID')}</div><div class="ms">vendor</div></div>
    <div class="met"><div class="ml">Rentang bulan</div><div class="mv num">${uniqueBulan.toLocaleString('id-ID')}</div><div class="ms">bulan</div></div>`;

  // Group by nama
  const byNama=new Map();
  rows.forEach(r=>{
    const k=r.nama+'||'+r.satuan;
    if(!byNama.has(k))byNama.set(k,{nama:r.nama,satuan:r.satuan,kat:r.kat,nilai:0,qty:0,frek:0,po:0,vendors:new Map()});
    const e=byNama.get(k);e.nilai+=r.nilai;e.qty+=r.qty;e.frek++;e.po++;
    if(r.vendor&&r.vendor!=='—')e.vendors.set(r.vendor,(e.vendors.get(r.vendor)||0)+1);
  });
  const sortKey=m==='nilai'?'nilai':m==='frek'?'frek':'qty';
  const byNamaArr=[...byNama.values()].sort((a,b)=>b[sortKey]-a[sortKey]);

  // Group by kat
  const byKat=new Map();
  rows.forEach(r=>{const k=r.kat||'Lainnya';if(!byKat.has(k))byKat.set(k,0);byKat.set(k,byKat.get(k)+getVal(r));});
  const byKatArr=[...byKat.entries()].sort((a,b)=>b[1]-a[1]);
  const kats=byKatArr.map(e=>e[0]);

  // Trend data (last 12 bulan with data)
  const allBulan=[...new Set(_getKonsumsiRows('',fDapur,fVendor,fKat,fSatuan).map(r=>r.bulan).filter(Boolean))].sort();
  const last12=allBulan.slice(-12);
  const trendKats=kats.length?kats:[...new Set(_getKonsumsiRows('',fDapur,fVendor,fKat,fSatuan).map(r=>r.kat||'Lainnya'))];
  const trendData=last12.map(b=>{
    const bRows=_getKonsumsiRows(b,fDapur,fVendor,fKat,fSatuan);
    const byK={};bRows.forEach(r=>{const k=r.kat||'Lainnya';byK[k]=(byK[k]||0)+getVal(r);});
    return{bulan:b,byK};
  });

  // Bar chart - top 15
  const top15=byNamaArr.slice(0,15);
  _kChartBar=_renderChart('k-chart-bar',_kChartBar,'bar',{
    labels:top15.map(r=>r.nama.length>18?r.nama.substring(0,16)+'…':r.nama),
    datasets:[{
      label:valLabel,
      data:top15.map(r=>r[sortKey]),
      backgroundColor:top15.map(r=>{const ci=kats.indexOf(r.kat);return _KAT_COLORS[ci>=0?ci%_KAT_COLORS.length:0]+'CC';}),
      borderRadius:3
    }]
  },{
    plugins:{legend:{display:false},tooltip:{callbacks:{
      label:c=>tooltipVal(c.raw,top15[c.dataIndex]?.satuan||''),
      title:c=>[top15[c[0].dataIndex]?.nama||'',top15[c[0].dataIndex]?.kat||'']
    }}},
    scales:{
      y:{beginAtZero:true,ticks:{font:{size:10},callback:v=>m==='nilai'?'Rp '+Number(v/1000).toLocaleString('id-ID')+'rb':Number(v).toLocaleString('id-ID')}},
      x:{ticks:{font:{size:10},maxRotation:40}}
    }
  });

  // Kat chart - horizontal bar
  _kChartKat=_renderChart('k-chart-kat',_kChartKat,'bar',{
    labels:byKatArr.map(e=>e[0]),
    datasets:[{
      label:valLabel,
      data:byKatArr.map(e=>e[1]),
      backgroundColor:byKatArr.map((_,i)=>_KAT_COLORS[i%_KAT_COLORS.length]+'CC'),
      borderRadius:3
    }]
  },{
    indexAxis:'y',
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>tooltipVal(c.raw,'')}}},
    scales:{
      x:{beginAtZero:true,ticks:{font:{size:10},callback:v=>m==='nilai'?'Rp '+Number(v/1000).toLocaleString('id-ID')+'rb':Number(v).toLocaleString('id-ID')}},
      y:{ticks:{font:{size:10}}}
    }
  });

  // Line chart - trend per kategori
  const lineDatasets=trendKats.map((k,i)=>({
    label:k,
    data:trendData.map(d=>d.byK[k]||0),
    borderColor:_KAT_COLORS[i%_KAT_COLORS.length],
    backgroundColor:_KAT_COLORS[i%_KAT_COLORS.length]+'22',
    tension:0.3,fill:false,pointRadius:3
  }));
  _kChartLine=_renderChart('k-chart-line',_kChartLine,'line',{
    labels:trendData.map(d=>_fmtBulan(d.bulan)),
    datasets:lineDatasets
  },{
    plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,padding:10}},tooltip:{callbacks:{label:c=>c.dataset.label+': '+tooltipVal(c.raw,'')}}},
    scales:{
      y:{beginAtZero:true,ticks:{font:{size:10},callback:v=>m==='nilai'?'Rp '+Number(v/1000).toLocaleString('id-ID')+'rb':Number(v).toLocaleString('id-ID')}},
      x:{ticks:{font:{size:10}}}
    }
  });

  // Vendor chart - selalu pakai nilai (Rp), tidak terpengaruh toggle metrik
  const byVendor=new Map();
  _getKonsumsiRows(fBulan,fDapur,'',fKat,fSatuan).forEach(r=>{
    if(!r.vendor||r.vendor==='—')return;
    if(!byVendor.has(r.vendor))byVendor.set(r.vendor,0);
    byVendor.set(r.vendor,byVendor.get(r.vendor)+r.nilai);
  });
  const byVendorArr=[...byVendor.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
  _kChartVendor=_renderChart('k-chart-vendor',_kChartVendor,'bar',{
    labels:byVendorArr.map(e=>e[0].length>20?e[0].substring(0,18)+'…':e[0]),
    datasets:[{
      label:'Nilai (Rp)',
      data:byVendorArr.map(e=>e[1]),
      backgroundColor:byVendorArr.map((_,i)=>_KAT_COLORS[i%_KAT_COLORS.length]+'BB'),
      borderRadius:3
    }]
  },{
    indexAxis:'y',
    plugins:{legend:{display:false},tooltip:{callbacks:{
      label:c=>_fmtNilai(c.raw),
      title:c=>[byVendorArr[c[0].dataIndex]?.[0]||'']
    }}},
    scales:{
      x:{beginAtZero:true,ticks:{font:{size:10},callback:v=>'Rp '+Number(v/1000).toLocaleString('id-ID')+'rb'}},
      y:{ticks:{font:{size:10}}}
    }
  });

  // Table
  const tbody=document.getElementById('k-table-body');
  document.getElementById('k-table-count').textContent=byNamaArr.length+' jenis bahan baku';
  if(!byNamaArr.length){
    tbody.innerHTML=`<tr><td colspan="6"><div class="empty">Belum ada data — belum ada item dengan status "Diterima"${m==='qty'&&!fSatuan?' (pilih satuan untuk filter lebih spesifik)':''}</div></td></tr>`;
    return;
  }
  tbody.innerHTML=byNamaArr.map(r=>{
    const topVendor=r.vendors.size?[...r.vendors.entries()].sort((a,b)=>b[1]-a[1])[0][0]:'—';
    const valCell=m==='nilai'?_fmtNilai(r.nilai):m==='frek'?r.frek.toLocaleString('id-ID'):Number(r.qty).toLocaleString('id-ID');
    return`<tr>
      <td style="font-weight:500">${r.nama}</td>
      <td>${r.kat?`<span class="tag tgr">${r.kat}</span>`:'—'}</td>
      <td style="font-family:var(--mn);font-size:11px">${r.satuan}</td>
      <td class="num-cell" style="font-weight:600">${valCell}</td>
      <td class="num-cell">${r.po}</td>
      <td style="font-size:12px">${topVendor}</td>
    </tr>`;
  }).join('');
}

function _renderChart(canvasId,existing,type,data,options){
  if(existing)existing.destroy();
  const ctx=document.getElementById(canvasId);
  if(!ctx)return null;
  return new Chart(ctx,{type,data,options:{responsive:true,maintainAspectRatio:false,...options}});
}

function resetKonsumsiFilter(){
  document.getElementById('k-bulan').value='';
  document.getElementById('k-dapur').value='';
  document.getElementById('k-vendor').value='';
  document.getElementById('k-kat').value='';
  document.getElementById('k-satuan').value='';
  renderKonsumsi();
}

// ===== LAPORAN KEUANGAN =====
let _lkChart=null,_lkLastData=null;

function _lkGetRange(){
  const mode=localStorage.getItem('lk-mode')||'tahun';
  if(mode==='custom'){
    const dari=localStorage.getItem('lk-dari')||'';
    const sampai=localStorage.getItem('lk-sampai')||'';
    if(dari&&sampai)return{from:dari,to:sampai};
  }
  const tahun=localStorage.getItem('lk-tahun')||new Date().getFullYear().toString();
  return{from:tahun+'-01-01',to:tahun+'-12-31'};
}

function _lkBuildData(from,to){
  const pos=getPOs().filter(po=>po.date>=from&&po.date<=to);
  const allInvV=getInvV();const allInvD=getInvD();
  let totalRevenue=0,totalModal=0,totalOngkir=0,totalCashback=0;
  const monthly={},byVendor={},byDapur={},byPO=[];
  pos.forEach(po=>{
    const ivs=allInvV.filter(iv=>iv.po_id===po.id);
    const ids=allInvD.filter(d=>d.po_id===po.id);
    const revenue=ids.reduce((s,d)=>s+(d.total||0),0);
    const modal=ivs.reduce((s,iv)=>s+(iv.total||0),0);
    const ongkir=ivs.reduce((s,iv)=>s+(iv.ongkir||0),0);
    const cashback=ivs.reduce((s,iv)=>s+(iv.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0),0);
    const profit=revenue-modal-ongkir+cashback;
    totalRevenue+=revenue;totalModal+=modal;totalOngkir+=ongkir;totalCashback+=cashback;
    const mk=po.date.substring(0,7);
    if(!monthly[mk])monthly[mk]={revenue:0,modal:0,ongkir:0,cashback:0,profit:0,cnt:0};
    monthly[mk].revenue+=revenue;monthly[mk].modal+=modal;monthly[mk].ongkir+=ongkir;
    monthly[mk].cashback+=cashback;monthly[mk].profit+=profit;monthly[mk].cnt++;
    ivs.forEach(iv=>{
      const v=iv.vendor||'(tanpa vendor)';
      if(!byVendor[v])byVendor[v]={modal:0,ongkir:0,cashback:0};
      byVendor[v].modal+=iv.total||0;byVendor[v].ongkir+=iv.ongkir||0;
      byVendor[v].cashback+=(iv.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0);
    });
    ids.forEach(d=>{
      const dp=d.dapur||po.dapur||'(tanpa dapur)';
      if(!byDapur[dp])byDapur[dp]={revenue:0,cnt:0};
      byDapur[dp].revenue+=d.total||0;byDapur[dp].cnt++;
    });
    byPO.push({po,revenue,modal,ongkir,cashback,profit});
  });
  const totalProfit=totalRevenue-totalModal-totalOngkir+totalCashback;
  const totalMarginPct=totalRevenue>0?(totalProfit/totalRevenue*100):0;
  return{totalRevenue,totalModal,totalOngkir,totalCashback,totalProfit,totalMarginPct,monthly,byVendor,byDapur,byPO,posCount:pos.length};
}

function renderLaporanKeu(){
  const allYears=[...new Set(getPOs().map(po=>po.date.substring(0,4)))].sort().reverse();
  const curY=new Date().getFullYear().toString();
  const savedY=localStorage.getItem('lk-tahun')||curY;
  const savedMode=localStorage.getItem('lk-mode')||'tahun';
  const sel=document.getElementById('lk-tahun-sel');
  if(sel){
    sel.innerHTML=(allYears.length?allYears:[curY]).map(y=>`<option value="${y}" ${y===savedY?'selected':''}>${y}</option>`).join('');
    sel.value=savedY;
  }
  const mTahun=document.querySelector('input[name="lk-mode"][value="tahun"]');
  const mCustom=document.querySelector('input[name="lk-mode"][value="custom"]');
  if(mTahun)mTahun.checked=savedMode==='tahun';
  if(mCustom)mCustom.checked=savedMode==='custom';
  const dariEl=document.getElementById('lk-dari');
  const sampaiEl=document.getElementById('lk-sampai');
  if(dariEl)dariEl.value=localStorage.getItem('lk-dari')||'';
  if(sampaiEl)sampaiEl.value=localStorage.getItem('lk-sampai')||'';
  _lkToggleMode(savedMode);
  _lkRenderAll();
}

function _lkToggleMode(mode){
  const isCustom=mode==='custom';
  const tw=document.getElementById('lk-tahun-wrap');
  const cw=document.getElementById('lk-custom-wrap');
  if(tw)tw.style.display=isCustom?'none':'flex';
  if(cw)cw.style.display=isCustom?'flex':'none';
}

function _lkOnModeChange(mode){
  localStorage.setItem('lk-mode',mode);
  _lkToggleMode(mode);
}

function _lkTerapkan(){
  const mode=document.querySelector('input[name="lk-mode"]:checked')?.value||'tahun';
  localStorage.setItem('lk-mode',mode);
  if(mode==='tahun'){
    const y=document.getElementById('lk-tahun-sel')?.value||new Date().getFullYear().toString();
    localStorage.setItem('lk-tahun',y);
  }else{
    const dari=document.getElementById('lk-dari')?.value||'';
    const sampai=document.getElementById('lk-sampai')?.value||'';
    if(!dari||!sampai){showToast('Isi rentang tanggal terlebih dahulu',true);return;}
    localStorage.setItem('lk-dari',dari);
    localStorage.setItem('lk-sampai',sampai);
  }
  _lkRenderAll();
}

function _lkRenderAll(){
  const{from,to}=_lkGetRange();
  _lkLastData=_lkBuildData(from,to);
  _lkRenderCards(_lkLastData);
  _lkSetTab(localStorage.getItem('lk-tab')||'bulan');
}

function _lkCard(label,val,color){
  return`<div style="background:var(--sf);border:1px solid var(--bd);border-radius:var(--rl);padding:12px 14px">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:${color};margin-bottom:4px">${label}</div>
    <div style="font-size:14px;font-weight:700;font-family:var(--mn);color:var(--tx)">${fmt(val)}</div>
  </div>`;
}

function _lkCardPct(label,val,color){
  return`<div style="background:var(--sf);border:1px solid var(--bd);border-radius:var(--rl);padding:12px 14px">
    <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:${color};margin-bottom:4px">${label}</div>
    <div style="font-size:14px;font-weight:700;font-family:var(--mn);color:${color}">${val.toFixed(1)}%</div>
  </div>`;
}

function _lkRenderCards(data){
  const{totalRevenue,totalModal,totalOngkir,totalCashback,totalProfit,totalMarginPct}=data;
  const profitColor=totalProfit>=0?'#16a34a':'#dc2626';
  const marginColor=totalMarginPct>=0?'#16a34a':'#dc2626';
  const el=document.getElementById('lk-cards');
  if(!el)return;
  el.innerHTML=`<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px">
    ${_lkCard('Revenue',totalRevenue,'#3b82f6')}
    ${_lkCard('Modal (COGS)',totalModal,'#f59e0b')}
    ${_lkCard('Ongkir',totalOngkir,'#8b5cf6')}
    ${_lkCard('Cashback',totalCashback,'#06b6d4')}
    ${_lkCard('Profit Bersih',totalProfit,profitColor)}
    ${_lkCardPct('Margin',totalMarginPct,marginColor)}
  </div>`;
}

function _lkRenderChart(data,tab){
  tab=tab||localStorage.getItem('lk-tab')||'bulan';
  let labels,datasets,chartType='bar';
  if(tab==='bulan'){
    const{monthly}=data;
    const keys=Object.keys(monthly).sort();
    labels=keys.map(k=>_fmtBulan(k));
    datasets=[
      {label:'Revenue',type:'bar',data:keys.map(k=>monthly[k].revenue),backgroundColor:'rgba(59,130,246,0.7)',borderRadius:3,order:2},
      {label:'Profit Bersih',type:'line',data:keys.map(k=>monthly[k].profit),borderColor:'#16a34a',backgroundColor:'rgba(22,163,74,0.1)',tension:0.3,fill:false,pointBackgroundColor:'#16a34a',pointRadius:4,order:1}
    ];
  }else if(tab==='po'){
    const sorted=data.byPO.slice().sort((a,b)=>b.revenue-a.revenue).slice(0,15);
    labels=sorted.map(({po})=>po.no);
    datasets=[
      {label:'Revenue',data:sorted.map(d=>d.revenue),backgroundColor:'rgba(59,130,246,0.7)',borderRadius:3},
      {label:'Profit Bersih',data:sorted.map(d=>d.profit),backgroundColor:sorted.map(d=>d.profit>=0?'rgba(22,163,74,0.75)':'rgba(220,38,38,0.7)'),borderRadius:3}
    ];
  }else if(tab==='vendor'){
    const entries=Object.entries(data.byVendor).sort((a,b)=>b[1].modal-a[1].modal).slice(0,12);
    labels=entries.map(([nama])=>nama);
    datasets=[
      {label:'Modal (COGS)',data:entries.map(([,v])=>v.modal),backgroundColor:'rgba(245,158,11,0.75)',borderRadius:3},
      {label:'Cashback',data:entries.map(([,v])=>v.cashback),backgroundColor:'rgba(6,182,212,0.75)',borderRadius:3}
    ];
  }else if(tab==='dapur'){
    const entries=Object.entries(data.byDapur).sort((a,b)=>b[1].revenue-a[1].revenue);
    labels=entries.map(([nama])=>nama);
    datasets=[
      {label:'Revenue',data:entries.map(([,v])=>v.revenue),backgroundColor:'rgba(59,130,246,0.7)',borderRadius:3}
    ];
  }
  _lkChart=_renderChart('lk-chart',_lkChart,chartType,{labels,datasets},{
    plugins:{
      legend:{display:true,position:'top',labels:{font:{size:11}}},
      tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+fmt(ctx.raw)}}
    },
    scales:{
      y:{ticks:{callback:v=>fmt(v),font:{size:10}}},
      x:{ticks:{font:{size:10},maxRotation:45,minRotation:0}}
    }
  });
}

function _lkSetTab(tab){
  localStorage.setItem('lk-tab',tab);
  ['bulan','po','vendor','dapur'].forEach(t=>{
    const btn=document.getElementById('lk-tab-'+t);
    if(btn)btn.classList.toggle('bp',t===tab);
  });
  if(_lkLastData){
    _lkRenderChart(_lkLastData,tab);
    _lkRenderTable(tab,_lkLastData);
  }
}

function _lkRenderTable(tab,data){
  const el=document.getElementById('lk-body');
  if(!el)return;
  if(tab==='bulan'){
    const{monthly}=data;
    const keys=Object.keys(monthly).sort().reverse();
    if(!keys.length){el.innerHTML='<div class="empty">Tidak ada data pada periode ini</div>';return;}
    el.innerHTML=`<div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>Bulan</th><th style="text-align:right">Revenue</th><th style="text-align:right">Modal</th>
      <th style="text-align:right">Ongkir</th><th style="text-align:right">Cashback</th>
      <th style="text-align:right">Profit Bersih</th><th style="text-align:right">Margin</th><th style="text-align:right">PO</th>
    </tr></thead><tbody>${keys.map(k=>{
      const m=monthly[k];const pct=m.revenue>0?(m.profit/m.revenue*100):0;
      const pc=m.profit>=0?'#16a34a':'#dc2626';
      return`<tr>
        <td style="font-weight:500">${_fmtBulan(k)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(m.revenue)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(m.modal)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(m.ongkir)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(m.cashback)}</td>
        <td style="text-align:right;font-family:var(--mn);font-weight:600;color:${pc}">${fmt(m.profit)}</td>
        <td style="text-align:right;font-family:var(--mn);color:${pc}">${pct.toFixed(1)}%</td>
        <td style="text-align:right;color:var(--t3)">${m.cnt}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }else if(tab==='po'){
    const{byPO}=data;
    if(!byPO.length){el.innerHTML='<div class="empty">Tidak ada data pada periode ini</div>';return;}
    el.innerHTML=`<div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>No PO</th><th>Dapur</th><th>Tanggal</th>
      <th style="text-align:right">Revenue</th><th style="text-align:right">Modal</th>
      <th style="text-align:right">Ongkir</th><th style="text-align:right">Cashback</th>
      <th style="text-align:right">Profit Bersih</th><th style="text-align:right">Margin</th>
    </tr></thead><tbody>${byPO.sort((a,b)=>b.po.date.localeCompare(a.po.date)).map(({po,revenue,modal,ongkir,cashback,profit})=>{
      const pct=revenue>0?(profit/revenue*100):0;const pc=profit>=0?'#16a34a':'#dc2626';
      return`<tr>
        <td><a href="#" onclick="showDetail('${po.id}');return false;" style="color:var(--ac);font-weight:500">${po.no}</a></td>
        <td style="font-size:12px">${po.dapur}</td>
        <td style="font-family:var(--mn);font-size:11px;color:var(--t3)">${po.date}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(revenue)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(modal)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(ongkir)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(cashback)}</td>
        <td style="text-align:right;font-family:var(--mn);font-weight:600;color:${pc}">${fmt(profit)}</td>
        <td style="text-align:right;font-family:var(--mn);color:${pc}">${pct.toFixed(1)}%</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }else if(tab==='vendor'){
    const{byVendor,totalModal}=data;
    const vendors=Object.entries(byVendor).sort((a,b)=>b[1].modal-a[1].modal);
    if(!vendors.length){el.innerHTML='<div class="empty">Tidak ada data pada periode ini</div>';return;}
    el.innerHTML=`<div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>Vendor</th><th style="text-align:right">Total Modal</th><th style="text-align:right">Ongkir</th>
      <th style="text-align:right">Cashback</th><th style="text-align:right">Net Pengeluaran</th><th style="text-align:right">% dari Modal</th>
    </tr></thead><tbody>${vendors.map(([nama,v])=>{
      const net=v.modal+v.ongkir-v.cashback;
      const pct=totalModal>0?(v.modal/totalModal*100):0;
      return`<tr>
        <td style="font-weight:500">${nama}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(v.modal)}</td>
        <td style="text-align:right;font-family:var(--mn)">${fmt(v.ongkir)}</td>
        <td style="text-align:right;font-family:var(--mn);color:#06b6d4">${fmt(v.cashback)}</td>
        <td style="text-align:right;font-family:var(--mn);font-weight:600">${fmt(net)}</td>
        <td style="text-align:right;font-family:var(--mn);color:var(--t3)">${pct.toFixed(1)}%</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }else if(tab==='dapur'){
    const{byDapur,totalRevenue}=data;
    const dapurs=Object.entries(byDapur).sort((a,b)=>b[1].revenue-a[1].revenue);
    if(!dapurs.length){el.innerHTML='<div class="empty">Tidak ada data pada periode ini</div>';return;}
    el.innerHTML=`<div style="overflow-x:auto"><table class="tbl"><thead><tr>
      <th>Dapur</th><th style="text-align:right">Revenue</th><th style="text-align:right">% dari Total</th><th style="text-align:right">Invoice</th>
    </tr></thead><tbody>${dapurs.map(([nama,v])=>{
      const pct=totalRevenue>0?(v.revenue/totalRevenue*100):0;
      return`<tr>
        <td style="font-weight:500">${nama}</td>
        <td style="text-align:right;font-family:var(--mn);font-weight:600">${fmt(v.revenue)}</td>
        <td style="text-align:right;font-family:var(--mn);color:var(--ac)">${pct.toFixed(1)}%</td>
        <td style="text-align:right;color:var(--t3)">${v.cnt}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }
}

