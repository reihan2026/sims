// ===== MASTER DATA =====
function renderMaster(){
  renderKats();
  const m=getMaster();const reks=getReks();
  document.getElementById('dapur-list').innerHTML=m.dapur.length?m.dapur.map((d,i)=>{const o=typeof d==='string'?{kode:'',nama:d,alamat:'',tlp:''}:d;return`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bd)"><div><div style="font-size:13px;font-weight:500">${o.kode?`<span style="font-family:var(--mn);color:var(--ac);margin-right:6px">${o.kode}</span>`:''}${o.nama}</div>${o.alamat?`<div style="font-size:11px;color:var(--t3)">${o.alamat}</div>`:''}${o.tlp?`<div style="font-size:11px;color:var(--t3)">${o.tlp}</div>`:''}</div><div class="bg"><button class="btn bxs bi" onclick="openEditDapur(${i})">Edit</button><button class="btn bxs bd-" onclick="rmDapur(${i})">Hapus</button></div></div>`;}).join(''):'<div class="empty" style="padding:10px">Kosong</div>';
  document.getElementById('master-rek-list').innerHTML=reks.length?reks.map(r=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--bd)"><div><div style="font-size:13px;font-weight:500">${r.nama}</div><div style="font-size:10px;color:var(--t3)">${r.pj||''}${r.no?' · '+r.no:''}</div></div><button class="btn bxs bd-" onclick="delRek('${r.id}')">Hapus</button></div>`).join(''):'<div class="empty" style="padding:10px">Belum ada rekening</div>';
  const vtbl=document.getElementById('vendor-tbl');
  const mitraRows=getVendorSaya().map(vs=>`<tr style="background:color-mix(in srgb,var(--ac) 4%,transparent)"><td style="font-weight:500">${vs.nama}<span class="tag" style="margin-left:6px;background:var(--ac);color:#fff;font-size:9px">MITRA</span></td><td style="font-size:11px;color:var(--t2)">${(vs.rekening||[]).map(r=>r.bank+' '+r.no).join('<br>')||'—'}</td><td style="font-family:var(--mn);font-size:11px">${vs.telp||'—'}</td><td>—</td><td><div class="bg"><button class="btn bxs bi" onclick="openModalVendorSaya('${vs.id}')">Edit</button><button class="btn bxs bd-" onclick="delVendorSaya('${vs.id}')">Hapus</button></div></td></tr>`).join('');
  const supplierRows=m.vendor.map((v,i)=>`<tr><td style="font-weight:500">${v.nama}</td><td>${catBadge(v.kat)}</td><td style="font-family:var(--mn);font-size:11px">${v.hp||'—'}</td><td>${v.cashback?`<span class="tag tpu">CB ~${v.cashback_pct||'?'}%</span>`:'—'}</td><td><div class="bg"><button class="btn bxs bi" onclick="editVendor(${i})">Edit</button><button class="btn bxs bd-" onclick="rmVendor(${i})">Hapus</button></div></td></tr>`).join('');
  vtbl.innerHTML=mitraRows+supplierRows||`<tr><td colspan="5"><div class="empty">Belum ada vendor</div></td></tr>`;
  document.getElementById('master-cat-vendor').value=m.catatan_vendor||'';
  updateDL();
}
function saveCatatanVendor(){const m=getMaster();m.catatan_vendor=document.getElementById('master-cat-vendor').value.trim();setMaster(m);showToast('Catatan baku ke vendor disimpan');}
function addKat(){
  const val=document.getElementById('new-kat')?.value.trim();if(!val)return;
  const m=getMaster();
  if(!m.kategori)m.kategori=[...DEFAULT_CATS];
  if(m.kategori.includes(val)){showToast('Kategori sudah ada',true);return;}
  m.kategori.push(val);setMaster(m);
  document.getElementById('new-kat').value='';
  renderKats();showToast('Kategori ditambahkan!');
}
function delKat(nama){
  if(!confirm(`Hapus kategori "${nama}"?\nItem yang sudah pakai kategori ini tidak terpengaruh.`))return;
  const m=getMaster();
  m.kategori=(m.kategori||[...DEFAULT_CATS]).filter(k=>k!==nama);
  setMaster(m);
  renderKats();showToast('Kategori dihapus');
}
function renderKats(){
  const cats=getCats();
  const el=document.getElementById('kat-list');if(!el)return;
  el.innerHTML=cats.map(k=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--bd)">
    <span style="font-size:13px">${k}</span>
    <button class="btn bxs bd-" onclick="delKat('${k}')">✕</button>
  </div>`).join('');
}
function addDapur(){
  const kode=document.getElementById('new-dapur-kode').value.trim();
  const nama=document.getElementById('new-dapur-nama').value.trim();
  const alamat=document.getElementById('new-dapur-alamat').value.trim();
  const tlp=document.getElementById('new-dapur-tlp').value.trim();
  if(!nama){showToast('Isi nama dapur!',true);return;}
  const m=getMaster();
  const exists=m.dapur.some(d=>(typeof d==='string'?d:d.nama)===nama);
  if(!exists)m.dapur.push({kode,nama,alamat,tlp});
  setMaster(m);
  ['new-dapur-kode','new-dapur-nama','new-dapur-alamat','new-dapur-tlp'].forEach(id=>document.getElementById(id).value='');
  renderMaster();showToast('Dapur ditambahkan');
}
function rmDapur(i){
  const m=getMaster();const d=m.dapur[i];if(!d)return;
  const nama=typeof d==='string'?d:(d.nama||'');
  const usedInPO=getPOs().filter(p=>p.dapur===nama);
  if(usedInPO.length){showToast(`Tidak bisa hapus — "${nama}" masih dipakai di: ${usedInPO.map(p=>p.no).slice(0,5).join(', ')}${usedInPO.length>5?' ...':''}`,true);return;}
  if(!confirm(`Hapus dapur "${nama}"?`))return;
  m.dapur.splice(i,1);setMaster(m);renderMaster();
}
function openEditDapur(i){
  const m=getMaster();const d=m.dapur[i];
  const o=typeof d==='string'?{kode:'',nama:d,alamat:'',tlp:''}:d;
  document.getElementById('ed-idx').value=i;
  document.getElementById('ed-kode').value=o.kode||'';
  document.getElementById('ed-nama').value=o.nama||'';
  document.getElementById('ed-alamat').value=o.alamat||'';
  document.getElementById('ed-tlp').value=o.tlp||'';
  openModal('modal-edit-dapur');
}
function saveEditDapur(){
  const nama=document.getElementById('ed-nama').value.trim();
  if(!nama){showToast('Isi nama dapur!',true);return;}
  const i=parseInt(document.getElementById('ed-idx').value);
  const m=getMaster();
  m.dapur[i]={kode:document.getElementById('ed-kode').value.trim(),nama,alamat:document.getElementById('ed-alamat').value.trim(),tlp:document.getElementById('ed-tlp').value.trim()};
  setMaster(m);closeModal('modal-edit-dapur');renderMaster();updateDL();showToast('Dapur diperbarui');
}
function openModalVendor(){document.getElementById('vmodal-title').textContent='Tambah Vendor';['v-nama','v-hp','v-cat'].forEach(id=>document.getElementById(id).value='');document.getElementById('v-kat').value='';document.getElementById('v-cashback').checked=false;document.getElementById('v-cb-pct').value='';document.getElementById('v-cb-wrap').style.display='none';document.getElementById('v-edit-idx').value='';openModal('modal-vendor');}
function editVendor(i){const m=getMaster();const v=m.vendor[i];if(!v)return;document.getElementById('vmodal-title').textContent='Edit Vendor';document.getElementById('v-nama').value=v.nama||'';document.getElementById('v-kat').value=v.kat||'';document.getElementById('v-hp').value=v.hp||'';document.getElementById('v-cashback').checked=!!v.cashback;document.getElementById('v-cb-pct').value=v.cashback_pct||'';document.getElementById('v-cb-wrap').style.display=v.cashback?'block':'none';document.getElementById('v-cat').value=v.catatan||'';document.getElementById('v-edit-idx').value=i;openModal('modal-vendor');}
document.getElementById('v-cashback').onchange=function(){document.getElementById('v-cb-wrap').style.display=this.checked?'block':'none';};
function saveVendor(){const nama=document.getElementById('v-nama').value.trim();if(!nama){showToast('Isi nama vendor!',true);return;}const v={nama,kat:document.getElementById('v-kat').value,hp:document.getElementById('v-hp').value.trim(),cashback:document.getElementById('v-cashback').checked,cashback_pct:parseFloat(document.getElementById('v-cb-pct').value)||0,catatan:document.getElementById('v-cat').value.trim()};const m=getMaster();const idx=document.getElementById('v-edit-idx').value;if(idx!=='')m.vendor[parseInt(idx)]=v;else m.vendor.push(v);setMaster(m);closeModal('modal-vendor');renderMaster();showToast('Vendor disimpan');}
function rmVendor(i){
  const m=getMaster();const v=m.vendor[i];if(!v)return;
  const nama=v.nama||'';
  const usedInPO=getPOs().filter(p=>p.items.some(it=>it.vendor===nama));
  const usedInInvV=getInvV().filter(iv=>iv.vendor===nama);
  if(usedInPO.length||usedInInvV.length){
    const parts=[];
    if(usedInPO.length)parts.push('PO: '+usedInPO.map(p=>p.no).slice(0,3).join(', ')+(usedInPO.length>3?' ...':''));
    if(usedInInvV.length)parts.push('Invoice Vendor: '+usedInInvV.map(iv=>iv.no).slice(0,3).join(', ')+(usedInInvV.length>3?' ...':''));
    showToast(`Tidak bisa hapus — "${nama}" masih dipakai di:\n${parts.join('\n')}`,true);return;
  }
  if(!confirm(`Hapus vendor "${nama}"?`))return;
  m.vendor.splice(i,1);setMaster(m);renderMaster();
}
function normalizeDapurRefs(){
  const m=getMaster();
  const withKode=m.dapur.filter(d=>typeof d==='object'&&d.kode);
  if(!withKode.length)return;
  const namaToKode={};
  withKode.forEach(d=>{if(d.nama&&d.kode)namaToKode[d.nama]=d.kode;});
  const kodeSet=new Set(withKode.map(d=>d.kode));
  // Remove duplicate entries: string "KLU003" OR codeless object {kode:'', nama:'KLU003'}
  const lenBefore=m.dapur.length;
  m.dapur=m.dapur.filter(d=>{
    if(typeof d==='string')return!kodeSet.has(d);
    if(!d.kode&&kodeSet.has(d.nama))return false;
    return true;
  });
  if(m.dapur.length!==lenBefore)setMaster(m);
  // Migrate po.dapur from nama → kode
  const pos=getPOs();let posChanged=false;
  pos.forEach(p=>{if(namaToKode[p.dapur]){p.dapur=namaToKode[p.dapur];posChanged=true;}});
  if(posChanged)setPOs(pos);
  // Migrate pov.dapur
  const povs=getPOVs();let povChanged=false;
  povs.forEach(p=>{if(namaToKode[p.dapur]){p.dapur=namaToKode[p.dapur];povChanged=true;}});
  if(povChanged)setPOVs(povs);
  // Migrate invd.dapur
  const invds=getInvD();let invdChanged=false;
  invds.forEach(i=>{if(namaToKode[i.dapur]){i.dapur=namaToKode[i.dapur];invdChanged=true;}});
  if(invdChanged)setInvD(invds);
}
function getDapurInfo(val){
  const m=getMaster();
  const found=m.dapur.find(d=>typeof d==='string'?d===val:(d.nama===val||d.kode===val));
  if(!found)return{kode:'',nama:val||'',alamat:'',tlp:''};
  return typeof found==='string'?{kode:'',nama:found,alamat:'',tlp:''}:{alamat:'',...found};
}
function fmtDapurKode(val){const o=getDapurInfo(val);return o.kode||val;}
function updateDL(){
  const m=getMaster();
  ['dl-dapur','dl-dapur-invd'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=m.dapur.map(d=>{const o=typeof d==='string'?{kode:'',nama:d,tlp:''}:d;return`<option value="${o.kode||o.nama}">${o.kode?o.kode+' — '+o.nama:o.nama}</option>`;}).join('');});
  const vnames=m.vendor.map(v=>v.nama);
  ['dl-vendor-invv'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=vnames.map(v=>`<option value="${v}">`).join('');});
}
function autoMaster(dapur,vendors){
  const m=getMaster();
  if(dapur&&!m.dapur.some(d=>(typeof d==='string'?d:d.nama)===dapur))m.dapur.push({kode:'',nama:dapur,tlp:''});
  vendors.forEach(vn=>{if(vn&&!m.vendor.find(v=>v.nama===vn))m.vendor.push({nama:vn,kat:'',hp:'',cashback:false,cashback_pct:0});});
  setMaster(m);updateDL();
}

// ===== REKENING =====
function openModalRek(){['rek-nama','rek-pj','rek-no'].forEach(id=>document.getElementById(id).value='');openModal('modal-rek');}
function saveRek(){const nama=document.getElementById('rek-nama').value.trim();if(!nama){showToast('Isi nama!',true);return;}const reks=getReks();const r={id:uid(),nama,pj:document.getElementById('rek-pj').value.trim(),no:document.getElementById('rek-no').value.trim(),pengembalian:[]};reks.push(r);setReks(reks);addLog('tambah_rekening','Tambah rekening','rek',r.id,r.nama,'');closeModal('modal-rek');renderRekening();renderMaster();showToast('Rekening ditambahkan');}
function delRek(id){if(!confirm('Hapus rekening?'))return;const _delRek=getReks().find(r=>r.id===id);addLog('hapus_rekening','Hapus rekening','rek',id,_delRek?.nama||id,'');setReks(getReks().filter(r=>r.id!==id));renderRekening();renderMaster();}
function openKembali(rekId){const rek=getReks().find(r=>r.id===rekId);if(!rek)return;document.getElementById('kembali-id').value=rekId;document.getElementById('kembali-jml').value='';document.getElementById('kembali-tgl').value=today();document.getElementById('kembali-cat').value='';document.getElementById('kembali-info').textContent=rek.nama+(rek.pj?' — '+rek.pj:'');openModal('modal-kembali');}
function saveKembali(){const id=document.getElementById('kembali-id').value;const jml=parseFloat(document.getElementById('kembali-jml').value)||0;if(!jml){showToast('Isi jumlah!',true);return;}const reks=getReks();const rek=reks.find(r=>r.id===id);if(!rek)return;if(!rek.pengembalian)rek.pengembalian=[];rek.pengembalian.push({jumlah:jml,tgl:document.getElementById('kembali-tgl').value,catatan:document.getElementById('kembali-cat').value});setReks(reks);closeModal('modal-kembali');renderRekening();showToast('Pengembalian dicatat');}
