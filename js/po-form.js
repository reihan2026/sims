// ===== PO FORM =====
let importedItems=[];let activeTab=0;let manualId=0;

function initPOForm(){
  ['in-no','in-date','in-dapur','in-cat-po'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('in-date').value=today();
  const jenisEl=document.getElementById('in-jenis');if(jenisEl)jenisEl.value='bahan_baku';
  importedItems=[];manualId=0;
  document.getElementById('manual-tbody').innerHTML='';
  ['paste-in','file-prev','paste-prev'].forEach(id=>{const el=document.getElementById(id);if(el)el.value!==undefined?el.value='':el.innerHTML='';});
  document.getElementById('merged-wrap').style.display='none';
  document.getElementById('total-prev').style.display='none';
  switchTab(0);addRow();updateDL();
}
function switchTab(idx){activeTab=idx;[0,1,2].forEach(i=>{document.getElementById('tab-'+i).style.display=i===idx?'block':'none';document.querySelectorAll('#imp-steps .step')[i].classList.toggle('active',i===idx);});}
function createItemRow(rowId,tbodyId,d){
  const tr=document.createElement('tr');tr.id=rowId;
  tr.innerHTML=`<td><input type="text" value="${d?.hari||''}" placeholder="Senin 20 Apr" id="${rowId}-h" style="width:105px"></td>
    <td><input type="text" value="${d?.nama||''}" placeholder="Nama bahan baku" id="${rowId}-n" style="min-width:130px"></td>
    <td><select id="${rowId}-kat" style="width:74px;font-size:11px;padding:2px 3px"><option value="">—</option>${getCatOpts()}</select></td>
    <td><input type="text" value="${d?.satuan||''}" placeholder="kg" id="${rowId}-s" style="width:50px"></td>
    <td><input type="number" value="${d?.qty||''}" placeholder="0" id="${rowId}-q" style="width:62px" min="0"></td>
    <td><input type="number" value="${d?.harga_po||''}" placeholder="0" id="${rowId}-hp" style="width:90px" min="0"></td>
    <td><input type="text" value="${d?.spek||''}" placeholder="Spesifikasi..." id="${rowId}-sp" style="min-width:130px"></td>
    <td><input type="date" value="${d?.deadline||''}" id="${rowId}-dl" style="width:125px"></td>
    <td><select id="${rowId}-tipe" style="width:70px"><option value="fresh">Fresh</option><option value="bulk">Bulk</option></select></td>
    <td><button class="btn bxs bd-" onclick="document.getElementById('${rowId}').remove()">✕</button></td>`;
  if(d?.tipe_kirim)setTimeout(()=>{const el=document.getElementById(rowId+'-tipe');if(el)el.value=d.tipe_kirim;},0);
  if(d?.kat)setTimeout(()=>{const el=document.getElementById(rowId+'-kat');if(el)el.value=d.kat;},0);
  document.getElementById(tbodyId).appendChild(tr);
}
function addRow(d){manualId++;createItemRow('mr-'+manualId,'manual-tbody',d);}
function readItemRows(tbodyId){
  const items=[];
  document.querySelectorAll('#'+tbodyId+' tr').forEach(tr=>{
    const id=tr.id;
    const nama=document.getElementById(id+'-n')?.value?.trim();if(!nama)return;
    items.push({hari:document.getElementById(id+'-h')?.value||'',kat:document.getElementById(id+'-kat')?.value||'',nama,satuan:document.getElementById(id+'-s')?.value||'pcs',qty:parseFloat(document.getElementById(id+'-q')?.value)||0,harga_po:parseFloat(document.getElementById(id+'-hp')?.value)||0,spek:document.getElementById(id+'-sp')?.value||'',deadline:document.getElementById(id+'-dl')?.value||'',tipe_kirim:document.getElementById(id+'-tipe')?.value||'fresh',harga_vendor:0,vendor:'',nota_key:null,status_kirim:'belum',tgl_kirim:'',tgl_diterima:'',retur:null});
  });
  return items;
}
function getManualItems(){return readItemRows('manual-tbody');}
function parseItemCols(cols,hari){
  const base={tipe_kirim:'fresh',harga_vendor:0,vendor:'',nota_key:null,status_kirim:'belum',tgl_kirim:'',tgl_diterima:'',retur:null};
  // Format baru (>=8 col): Hari|Nama|Kat|Qty|Sat|Harga/kg|Total|Keterangan|Deadline
  if(cols.length>=8){const nama=cols[1].trim();if(!nama||nama.length<2)return null;const _kat2=cols[2]||'';const _katMatch2=getCats().find(c=>c.toLowerCase()===_kat2.toLowerCase());return{...base,hari,nama,kat:_katMatch2||_kat2,qty:parseFloat((cols[3]||'0').replace(/[^0-9.]/g,''))||0,satuan:cols[4]||'pcs',harga_po:parseFloat((cols[5]||'0').replace(/[^0-9]/g,''))||0,spek:cols[7]||'',deadline:cols[8]||''};}
  // Format lama (>=7 col): Hari|Nama|Qty|Sat|Harga/kg|Total|Keterangan|Deadline
  if(cols.length>=7){const nama=cols[1].trim();if(!nama||nama.length<2)return null;return{...base,hari,nama,kat:'',qty:parseFloat((cols[2]||'0').replace(/[^0-9.]/g,''))||0,satuan:cols[3]||'pcs',harga_po:parseFloat((cols[4]||'0').replace(/[^0-9]/g,''))||0,spek:cols[6]||'',deadline:cols[7]||''};}
  const nama=cols[0].trim();if(!nama||nama.length<2)return null;
  return{...base,hari,nama,kat:'',satuan:cols[1]||'pcs',qty:parseFloat((cols[2]||'0').replace(/[^0-9.]/g,''))||0,harga_po:parseFloat((cols[3]||'0').replace(/[^0-9]/g,''))||0,spek:cols[4]||'',deadline:cols[5]||''};
}
function parsePaste(){
  const raw=document.getElementById('paste-in').value.trim();if(!raw){showToast('Paste data dulu!',true);return;}
  const lines=raw.split('\n').filter(l=>l.trim());
  const items=[];let curHari='';
  lines.forEach(line=>{
    const cols=line.split('\t').map(c=>c.trim());if(cols.length<2)return;
    const isDay=/senin|selasa|rabu|kamis|jumat|sabtu|minggu/i.test(cols[0]);
    if(isDay&&cols[0].length<40){curHari=cols[0];if(cols.length<3)return;}
    if(/bahan makanan|hari.menu|nama/i.test(cols[0]||cols[1]))return;
    const item=parseItemCols(cols,curHari);if(item)items.push(item);
  });
  if(!items.length){document.getElementById('paste-prev').innerHTML='<p style="color:var(--dn);font-size:12px;margin-top:5px">Tidak ada data terproses.</p>';return;}
  importedItems=items;document.getElementById('paste-prev').innerHTML=`<p style="color:var(--ac);font-size:12px;font-family:var(--mn);margin-top:4px">${items.length} item berhasil diproses</p>`;
  renderMerged(items);
}
function clearPaste(){document.getElementById('paste-in').value='';document.getElementById('paste-prev').innerHTML='';importedItems=[];document.getElementById('merged-wrap').style.display='none';document.getElementById('total-prev').style.display='none';}
function handleFile(file){
  if(!file)return;
  if(file.name.endsWith('.csv')){const r=new FileReader();r.onload=e=>parseRows(e.target.result.split('\n').map(l=>l.split(/[,;\t]/).map(c=>c.trim().replace(/^"|"$/g,''))),file.name);r.readAsText(file);return;}
  const r=new FileReader();r.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array'});parseRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}),file.name);}catch(err){document.getElementById('file-prev').innerHTML=`<p style="color:var(--dn);font-size:12px">Gagal: ${err.message}</p>`;}};r.readAsArrayBuffer(file);
}
function parseRows(rows,fname){
  const items=[];let curHari='';
  // Detect header row: skip if first data row has non-numeric at col 2 or 3
  const start=isNaN(parseFloat(String(rows[0]?.[3]||rows[0]?.[2]||'').replace(/[^0-9]/g,'')))?1:0;
  for(let i=start;i<rows.length;i++){
    const r=rows[i];if(!r[0]&&!r[1])continue;
    const isDay=/senin|selasa|rabu|kamis|jumat|sabtu|minggu/i.test(String(r[0]||''));
    if(isDay&&String(r[0]).length<40){curHari=String(r[0]);if(!r[1])continue;}
    const cols=r.map(c=>String(c||''));
    const item=parseItemCols(cols,curHari||cols[0]);
    if(item&&!/bahan makanan|nama bahan/i.test(item.nama))items.push(item);
  }
  if(!items.length){document.getElementById('file-prev').innerHTML=`<p style="color:var(--dn);font-size:12px">Tidak ada item dari ${fname}</p>`;return;}
  importedItems=items;document.getElementById('file-prev').innerHTML=`<p style="color:var(--ac);font-size:12px;font-family:var(--mn)">${items.length} item dari ${fname}</p>`;
  renderMerged(items);
}
function clearImport(){importedItems=[];document.getElementById('merged-wrap').style.display='none';document.getElementById('total-prev').style.display='none';}
function renderMerged(items){
  document.getElementById('merged-wrap').style.display='block';document.getElementById('total-prev').style.display='block';
  document.getElementById('merged-cnt').textContent='('+items.length+' item)';
  let tp=0;let lastH='';
  document.getElementById('merged-body').innerHTML=items.map((i,idx)=>{
    tp+=(i.qty||0)*(i.harga_po||0);
    const hc=i.hari&&i.hari!==lastH;if(i.hari)lastH=i.hari;
    return`<tr${hc&&i.hari?' style="border-top:2px solid var(--bd)"':''}>
      <td style="font-size:11px;color:var(--t3)">${i.hari||''}</td>
      <td style="font-weight:500">${i.nama}</td>
      <td><select onchange="importedItems[${idx}].kat=this.value" style="font-size:10px;padding:2px 4px;width:74px;background:var(--bg);border:1px solid var(--bd);border-radius:3px;color:var(--tx)">
        <option value="">—</option>${getCats().map(c=>`<option value="${c}" ${(i.kat||'').toLowerCase()===(c||'').toLowerCase()?'selected':''}>${c}</option>`).join('')}
      </select></td>
      <td>${i.satuan}</td><td class="num">${i.qty}</td><td class="num">${fmtF(i.harga_po)}</td>
      <td style="font-size:11px;color:var(--t2);max-width:160px">${i.spek||'—'}</td>
      <td style="font-size:11px;font-family:var(--mn)">${i.deadline||'—'}</td><td>${tipeTag(i.tipe_kirim)}</td>
    </tr>`;
  }).join('');
  document.getElementById('prev-tot').textContent=fmtF(tp);
}
function savePO(){
  const btn=document.querySelector('button[onclick="savePO()"]');
  if(btn&&btn.disabled)return;
  if(btn){btn.disabled=true;btn.textContent='Menyimpan...';}
  const resetBtn=()=>{if(btn){btn.disabled=false;btn.textContent='Simpan PO';}};
  const no=document.getElementById('in-no').value.trim();const date=document.getElementById('in-date').value;const dapur=document.getElementById('in-dapur').value.trim();
  if(!no||!date||!dapur){showToast('Isi No. PO, tanggal, dan dapur!',true);resetBtn();return;}
  const items=activeTab===0?getManualItems():importedItems;
  if(!items.length){showToast('Tambah minimal 1 item!',true);resetBtn();return;}
  autoMaster(dapur,[]);
  const po={id:uid(),no,date,dapur,jenis:document.getElementById('in-jenis')?.value||'bahan_baku',catatan:document.getElementById('in-cat-po').value.trim(),items,revisions:[],created:new Date().toISOString()};
  const pos=getPOs();pos.push(po);setPOs(pos);
  addLog('buat_po','Buat PO','po',po.id,po.no,po.items.length+' item · '+po.dapur);
  resetBtn();
  showToast('PO '+no+' disimpan!');nav('daftar-po');
}

function populateMonthFilter(el,months,selected){
  el.innerHTML='<option value="">Semua bulan</option>'+[...months].sort().reverse().map(b=>`<option value="${b}" ${b===selected?'selected':''}>${new Date(b+'-01').toLocaleDateString('id-ID',{year:'numeric',month:'long'})}</option>`).join('');
}
