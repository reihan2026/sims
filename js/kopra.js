// ===== EXPORT KOPRA =====
// Sheet Monitoring VA → file TXT Kopra → verifikasi transfer list → Status Maker
// di sheet → rekonsiliasi lunas di SIMS. Lihat private/prd-export-kopra.md.
//
// Penyimpanan (terpisah dari sims/data supaya dokumen utama tidak membengkak):
//   sims/kopra          — owner_uid, settings, remarks, batches_idx (ringkasan)
//   sims/kopra_b_<id>   — satu dokumen per export (baris, isi file, verifikasi, rekon)
// Akses sheet lewat Apps Script Web App (apps-script/kopra-monitoring.gs);
// URL + token disimpan di sims/kopra, TIDAK di kode (repo publik).

// ----- Konstanta & default -----
const KOPRA_STATUS={dl:'Diunduh',ver:'Terverifikasi',sheet:'Status sheet diperbarui',sebagian:'Sebagian direkonsiliasi',rekon:'Direkonsiliasi',batal:'Dibatalkan'};
const KOPRA_DEFAULT_SETTINGS={
  gas_url:'',gas_token:'',tab:'Monitoring VA',
  kolom:{tanggal:'Tanggal',ket:'Keterangan',kategori:'Kategori',nominal:'Nominal',bank:'Bank Penerima',biaya:'Biaya Admin',rek:'Nomor Rekening',nama:'Nama Penerima',status:'Status Maker/ Yayasan'},
  status_perlu:'Perlu Di Input',status_done:'Telah Di Input',
  // Baris sebelum tanggal ini diabaikan walau statusnya masih "Perlu Di Input" (sisa data lama)
  mulai_tgl:'2026-11-01',
  rek_sumber:'',biaya_obu:6500,ref_prefix:'SPPG',remark_max:20,
  remark_buang:['Reimburse pembelian','Pembelian','Pembayaran'],
  bank_ibu:['MANDIRI','BANK MANDIRI'],
  bank_codes:{'BCA':{kode:'CENAIDJA',nama:'BCA'},'BANK JAGO':{kode:'JAGBIDJA',nama:'BANK JAGO'},'JAGO':{kode:'JAGBIDJA',nama:'BANK JAGO'},'BRI':{kode:'BRINIDJA',nama:'BRI'}},
  kategori_operasional:['Operasional','Insentif Fasilitas'],
  rutin:['Insentif PIC','Insentif Fasilitas','Gaji Relawan'],
  rekon_mode:'usulan',
  // cara: 'terima' = Rekam terima di INV-D vendor mitra ke rekening `rek`;
  //       'pt'     = Konversi pass-through INV-V vendor `vendor`, cashback tidak dicentang.
  // Semua pencocokan nama = "mengandung", tanpa beda huruf besar/kecil.
  rules:[
    {penerima:'Yogi Sugianto',cara:'terima',mitra:'Sukses Selamat',rek:'Jago'},
    {penerima:'Jamila Padmini',cara:'terima',mitra:'Hasil Bumi',rek:'Hasil Bumi'},
    {penerima:'Renaldo',cara:'pt',vendor:'Anak Amai'},
    {penerima:'Unggul Pamungkas',cara:'pt',vendor:'Kaya Berkah'},
    {penerima:'Salsabila Nadhifah',cara:'pt',vendor:'Arsyila'},
    {penerima:'Abdul Ghoni',cara:'pt',vendor:'Gunz'}
  ]
};
const _K_BULAN={jan:1,januari:1,feb:2,februari:2,mar:3,maret:3,apr:4,april:4,mei:5,may:5,jun:6,juni:6,jul:7,juli:7,agu:8,agt:8,ags:8,aug:8,agustus:8,sep:9,sept:9,september:9,okt:10,oct:10,oktober:10,nov:11,november:11,des:12,dec:12,desember:12};
const _K_MON_EN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ----- Utilitas murni (tanpa DOM — diuji di node dengan fixture) -----
function _ke(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function _kNorm(s){return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();}
// Nama untuk dibandingkan dengan nama Host Kopra: huruf besar, tanpa tanda baca,
// "PT" di depan/belakang diabaikan ("PT.PANGAN BERKAH REZEKI" = "PANGAN BERKAH REZEKI PT")
function _kNormNama(s){
  let w=String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().split(' ').filter(Boolean);
  if(w[0]==='PT')w=w.slice(1);
  if(w[w.length-1]==='PT')w=w.slice(0,-1);
  return w.join(' ');
}
// "Rp17.276.000" → 17276000 · "Rp277.530" → 277530 · kosong/teks → NaN · ada sen ≠ 0 → NaN
function _kNum(s){
  let t=String(s==null?'':s).trim();if(!t)return NaN;
  t=t.replace(/rp/i,'').replace(/\s/g,'');
  if(!/^-?[\d.,]+$/.test(t))return NaN;
  const m=t.match(/^(-?[\d.]+)(?:,(\d+))?$/);
  if(!m)return NaN;
  if(m[2]&&/[1-9]/.test(m[2]))return NaN;
  const n=parseInt(m[1].replace(/\./g,''),10);
  return isNaN(n)?NaN:n;
}
// Teks aman untuk file Kopra: ASCII cetak saja, tanpa ";" (pemisah kolom)
function _kAscii(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-')
    .replace(/;/g,',').replace(/[\r\n\t]+/g,' ').replace(/[^\x20-\x7E]/g,'').replace(/\s+/g,' ').trim();
}
function _kAutoRemark(ket,S){
  let s=_kAscii(ket);
  const buang=[...(S.remark_buang||[])].sort((a,b)=>b.length-a.length);
  for(const p of buang){if(s.toLowerCase().startsWith(p.toLowerCase()+' ')){s=s.slice(p.length+1).trim();break;}}
  if(s)s=s.charAt(0).toUpperCase()+s.slice(1);
  const max=S.remark_max||20;
  if(s.length>max){
    let out='';
    for(const w of s.split(' ')){const nx=out?out+' '+w:w;if(nx.length>max)break;out=nx;}
    // Buang potongan yang menggantung: "…368kg, dan" · "Insentif PIC 25" · "12kg @10"
    const w=(out||s.slice(0,max)).split(' ');
    while(w.length>1&&/^(dan|&|dengan|@\S*|\d+[.,]?|[,.\-]+)$/i.test(w[w.length-1]))w.pop();
    s=w.join(' ').replace(/[\s,.\-@&]+$/,'');
  }
  return s;
}
// Tanggal dari teks keterangan: "25 November 2026", "23 Nov", "Gaji Relawan 24 Nov"
function _kTglDariTeks(s,refISO){
  const m=String(s||'').match(/\b(\d{1,2})\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|sept|jan|feb|mar|apr|may|jun|jul|agu|agt|ags|aug|sep|okt|oct|nov|des|dec)\b\.?(?:\s*(\d{4}))?/i);
  if(!m)return null;
  const d=parseInt(m[1],10),mo=_K_BULAN[m[2].toLowerCase()];
  if(!mo||d<1||d>31)return null;
  let y=m[3]?parseInt(m[3],10):parseInt((refISO||new Date().toISOString()).slice(0,4),10);
  if(!m[3]&&refISO){const c=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;if(c>_kAddDays(refISO,40))y--;}
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function _kTglKolom(s){const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;}
function _kAddDays(iso,n){const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
// ISO (UTC) → jam lokal pengguna, mis. "26 Nov 2026 18:32"
function _kWaktu(iso){if(!iso)return '';const d=new Date(iso);if(isNaN(d))return iso;const p=n=>String(n).padStart(2,'0');return `${d.getDate()} ${_K_MON_EN[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function _kFmtNum(n){return Math.round(n||0).toLocaleString('id-ID');}
function _kFmtTgl(iso){if(!iso)return '—';const [y,m,d]=iso.split('-');return `${parseInt(d,10)} ${_K_MON_EN[parseInt(m,10)-1]} ${y}`;}

// Baca isi tab Monitoring VA (array 2D nilai tampil) → baris transaksi + grup.
// Grup = baris transaksi di antara dua baris merah. Baris merah: Nama, Kategori &
// Rekening kosong tapi Nominal terisi. Keterangan-nya berisi label tanggal untuk
// grup DI BAWAHNYA ("25 November" di baris 808 → baris 809–819), sedangkan
// angka totalnya (nominal + biaya) biasanya milik grup DI ATASNYA. Keduanya
// disimpan (judul & penutup) dan dicek dua-duanya.
function _kParseSheet(values,S){
  const K=S.kolom||{};
  let hi=-1;
  for(let i=0;i<Math.min(values.length,40);i++){
    const n=values[i].map(_kNorm);
    if(n.includes(_kNorm(K.ket))&&n.includes(_kNorm(K.nama))){hi=i;break;}
  }
  if(hi<0)throw new Error(`Header tidak ditemukan — kolom "${K.ket}" dan "${K.nama}" tidak ada di 40 baris pertama. Cek pemetaan kolom di Setting.`);
  const hdr=values[hi].map(_kNorm);
  const cols={};Object.keys(K).forEach(f=>{cols[f]=hdr.indexOf(_kNorm(K[f]));});
  const wajib=['ket','nominal','bank','rek','nama','status'].filter(f=>cols[f]<0);
  if(wajib.length)throw new Error('Kolom tidak ditemukan di sheet: '+wajib.map(f=>`"${K[f]}"`).join(', ')+'. Cek pemetaan kolom di Setting.');
  const rows=[],groups=[];let cur=[],judul=null;
  for(let i=hi+1;i<values.length;i++){
    const v=values[i];const g=f=>cols[f]>=0?String(v[cols[f]]==null?'':v[cols[f]]).trim():'';
    const ket=g('ket'),nama=g('nama'),nomRaw=g('nominal');
    if(!ket&&!nama&&!nomRaw)continue;
    if(!nama&&!g('rek')&&!g('kategori')&&nomRaw){
      const merah={row:i+1,label:ket,nominal:_kNum(nomRaw),nominalRaw:nomRaw,biaya:_kNum(g('biaya'))};
      if(cur.length)groups.push({rows:cur,judul,total:merah});
      cur=[];judul=merah;continue;
    }
    const t={row:i+1,tanggal:g('tanggal'),ket,kategori:g('kategori'),nominalRaw:nomRaw,nominal:_kNum(nomRaw),
      bank:g('bank'),biayaRaw:g('biaya'),biaya:_kNum(g('biaya')),rekRaw:g('rek'),rek:g('rek').replace(/[\s.\-]/g,''),nama,status:g('status')};
    rows.push(t);cur.push(t);
  }
  if(cur.length)groups.push({rows:cur,judul,total:null});
  return{hdrRow:hi+1,cols,rows,groups};
}
function _kTglGrup(rows,refISO,judul){
  for(const r of rows){const t=_kTglKolom(r.tanggal);if(t)return t;}
  if(judul&&judul.label){const t=_kTglDariTeks(judul.label,refISO);if(t)return t;}
  const cnt={};rows.forEach(r=>{const t=_kTglDariTeks(r.ket,refISO);if(t)cnt[t]=(cnt[t]||0)+1;});
  const best=Object.entries(cnt).sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0];
  return best?best[0]:null;
}
// Tanggal per baris: kolom Tanggal kalau terisi, selain itu tanggal grupnya
function _kIsiTanggal(sheet,refISO){
  sheet.groups.forEach(g=>{g.tgl=_kTglGrup(g.rows,refISO,g.judul);g.rows.forEach(r=>{r.tgl=_kTglKolom(r.tanggal)||g.tgl;});});
}
// Baris yang masih perlu diexport: status "Perlu Di Input" dan tidak lebih lama dari mulai_tgl
function _kPerlu(r,S){return _kNorm(r.status)===_kNorm(S.status_perlu)&&!(S.mulai_tgl&&r.tgl&&r.tgl<S.mulai_tgl);}
function _kBankInfo(bank,S){
  const b=String(bank||'').trim().toUpperCase().replace(/\s+/g,' ');
  if(!b)return{err:'Bank kosong'};
  if((S.bank_ibu||[]).map(x=>x.toUpperCase()).includes(b))return{tipe:'IBU',kode:'',nama:''};
  const c=(S.bank_codes||{})[b];
  if(!c||!c.kode)return{err:`Kode bank tidak dikenal: "${bank}" — tambahkan di Setting`};
  return{tipe:'OBU',kode:c.kode,nama:c.nama||b};
}
function _kRef(S,tgl,i){const [y,m,d]=tgl.split('-');return `${S.ref_prefix||'SPPG'}-${d}${m}${y.slice(2)}-${String(i+1).padStart(2,'0')}`;}
function _kNamaFile(tgl,rowsNo){const [y,m,d]=tgl.split('-');return `Kopra_Transfer_${d}${_K_MON_EN[parseInt(m,10)-1]}${y}_baris${Math.min(...rowsNo)}-${Math.max(...rowsNo)}.txt`;}
// Satu baris file Kopra — 75 kolom dipisah ";" + CRLF (lihat PRD, bagian Format file Kopra)
function _kBarisTxt(S,r){
  const c=new Array(75).fill('');
  c[0]='M';c[1]='1';c[7]=S.rek_sumber;c[8]=r.rek;c[9]=_kAscii(r.nama);
  c[13]='IDR';c[14]=String(r.nominal);c[15]='IDR';c[18]=_kAscii(r.remark);c[19]=r.ref;c[20]=r.tipe;
  if(r.tipe==='OBU'){c[21]=r.bank_kode;c[22]=r.bank_nama;c[49]='OUR';}
  c[27]='N';c[71]='E';c[72]=_kAscii(r.ket);
  return c.join(';')+'\r\n';
}
function _kBuildTxt(S,rows){return rows.map(r=>_kBarisTxt(S,r)).join('');}
// Transfer list Kopra (xlsx) → array baris {ref, rek, host, amount, remark, product, status, error}
function _kParseTransferList(aoa){
  const hi=aoa.findIndex(r=>(r||[]).some(c=>String(c).trim()==='Reference Number'));
  if(hi<0)throw new Error('Kolom "Reference Number" tidak ditemukan — pastikan ini file "Transfer List" dari Kopra.');
  const h=aoa[hi].map(c=>String(c).trim());
  const ix=n=>h.indexOf(n);
  const need=['Credit Account Number','Credit Account Name (From Host)','Amount','Transaction Remark','Reference Number','Status','Error Reason'];
  const miss=need.filter(n=>ix(n)<0);
  if(miss.length)throw new Error('Kolom tidak ada di file Kopra: '+miss.join(', '));
  const out=[];
  for(let i=hi+1;i<aoa.length;i++){
    const r=aoa[i]||[];const g=n=>ix(n)>=0?String(r[ix(n)]==null?'':r[ix(n)]).trim():'';
    const ref=g('Reference Number');if(!ref)continue;
    const amt=parseFloat(g('Amount').replace(/,/g,''));
    out.push({ref,rek:g('Credit Account Number').replace(/\D/g,''),host:g('Credit Account Name (From Host)'),hostFile:g('Credit Account Name (From File)'),
      amount:isNaN(amt)?NaN:Math.round(amt),remark:g('Transaction Remark'),product:g('Product Name'),status:g('Status'),error:g('Error Reason')});
  }
  return out;
}
function _kVerifikasi(batchRows,list){
  const byRef={};list.forEach(x=>{(byRef[x.ref]=byRef[x.ref]||[]).push(x);});
  const res=batchRows.map(r=>{
    const xs=byRef[r.ref]||[];const x=xs[0];const cek=[];
    if(!x)return{ref:r.ref,row:r.row,ok:false,cek:[{ok:false,msg:'Tidak ada di file Kopra'}]};
    if(xs.length>1)cek.push({ok:false,msg:'Reference Number muncul '+xs.length+'×'});
    cek.push({ok:x.rek===r.rek,msg:'Rekening'+(x.rek===r.rek?'':': '+x.rek)});
    cek.push({ok:x.amount===r.nominal,msg:'Nominal'+(x.amount===r.nominal?'':': '+_kFmtNum(x.amount))});
    cek.push({ok:x.remark===r.remark,msg:'Remark'+(x.remark===r.remark?'':': "'+x.remark+'"')});
    const prodOk=!x.product||(r.tipe==='IBU'?/inhouse/i.test(x.product):/online|domestic|skn|rtgs|bi-?fast/i.test(x.product));
    cek.push({ok:prodOk,msg:'Jenis'+(prodOk?'':': '+x.product)});
    // "Valid" = file lolos validasi Kopra (transfer list diunduh sebelum approve);
    // "Transaction is successfully submitted" = sudah disubmit. Keduanya diterima.
    const stNorm=_kNorm(x.status);
    const stOk=(stNorm==='valid'||stNorm==='transaction is successfully submitted')&&(x.error===''||x.error==='-');
    cek.push({ok:stOk,msg:'Status'+(stOk?'':': '+x.status+(x.error&&x.error!=='-'?' ('+x.error+')':''))});
    const namaOk=_kNormNama(x.host)===_kNormNama(r.nama);
    const hard=cek.every(c=>c.ok);
    return{ref:r.ref,row:r.row,host:x.host,ok:hard&&namaOk,namaOk,hardOk:hard,cek,belumSubmit:stNorm==='valid'};
  });
  const refs=new Set(batchRows.map(r=>r.ref));
  const extra=list.filter(x=>!refs.has(x.ref)).map(x=>({ref:x.ref,host:x.host,amount:x.amount}));
  return{res,extra,countOk:list.length===batchRows.length};
}
if(typeof module!=='undefined')module.exports={_kNum,_kNormNama,_kAutoRemark,_kTglDariTeks,_kParseSheet,_kTglGrup,_kBankInfo,_kRef,_kNamaFile,_kBuildTxt,_kParseTransferList,_kVerifikasi,_kAscii,KOPRA_DEFAULT_SETTINGS};

// ----- State halaman -----
let _kp={doc:null,loading:false,err:'',sheet:null,sheetAt:null,showDone:false,sel:null,batch:null,verif:null,rekon:null,showSet:false,sheetErr:null};

// Penjaga untuk setiap aksi yang menulis (lihat _dataLoaded di js/data.js)
function _kSiap(){if(typeof _dataLoaded!=='undefined'&&!_dataLoaded){showToast('Data SIMS belum selesai dimuat — tunggu sebentar.',true);return false;}return true;}
function _kSet(){
  const s=Object.assign({},KOPRA_DEFAULT_SETTINGS,(_kp.doc&&_kp.doc.settings)||{});
  s.kolom=Object.assign({},KOPRA_DEFAULT_SETTINGS.kolom,s.kolom||{});
  return s;
}
function _kRemarkMem(ket){const m=((_kp.doc&&_kp.doc.remarks)||[]).find(x=>x.k===ket);return m?m.r:null;}
async function _kLoadDoc(){
  const snap=await db.collection('sims').doc('kopra').get();
  _kp.doc=snap.exists?snap.data():{};
  if(!_kp.doc.batches_idx)_kp.doc.batches_idx=[];
  if(!_kp.doc.remarks)_kp.doc.remarks=[];
}
async function _kSaveDoc(){await db.collection('sims').doc('kopra').set(_kp.doc);}
function _kIsOwner(){return !!(_kp.doc&&_kp.doc.owner_uid&&_currentUser&&_kp.doc.owner_uid===_currentUser.uid);}

async function _kGas(payload){
  const S=_kSet();
  if(!S.gas_url||!S.gas_token)throw new Error('URL Apps Script atau token belum diisi di Setting.');
  let res;
  try{
    res=await fetch(S.gas_url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({token:S.gas_token,tab:S.tab},payload))});
  }catch(e){throw new Error('Tidak bisa menghubungi Apps Script ('+e.message+'). Cek URL Web App dan akses "Anyone".');}
  if(!res.ok)throw new Error('Apps Script membalas HTTP '+res.status+'.');
  let j;try{j=await res.json();}catch(e){throw new Error('Balasan Apps Script bukan JSON — kemungkinan URL salah atau Web App belum di-deploy untuk "Anyone".');}
  return j;
}

// ----- Render utama -----
async function renderKopra(){
  const root=document.getElementById('kopra-root');if(!root)return;
  // Jangan izinkan aksi apa pun sebelum data SIMS termuat: rekonsiliasi butuh
  // invoice, dan addLog/saveData saat _cache masih kosong menimpa data server.
  if(typeof _dataLoaded!=='undefined'&&!_dataLoaded){
    root.innerHTML='<div class="card"><div class="empty">Memuat data SIMS… halaman ini terbuka otomatis setelah data siap.</div></div>';
    clearTimeout(_kp.tunggu);_kp.tunggu=setTimeout(()=>{if(_currentPage==='kopra')renderKopra();},800);
    return;
  }
  if(!_kp.doc){
    root.innerHTML='<div class="card"><div class="empty">Memuat data Kopra…</div></div>';
    try{await _kLoadDoc();}catch(e){root.innerHTML=`<div class="card" style="color:var(--dn)">Gagal membaca sims/kopra: ${_ke(e.message)}</div>`;return;}
  }
  if(!_kp.doc.owner_uid){
    root.innerHTML=`<div class="card"><div class="ct">Belum ada pemilik</div>
      <p style="font-size:13px;margin:0 0 10px">Halaman ini memuat nomor rekening dan hanya untuk satu akun. Klaim untuk akun yang sedang login (${_ke(_currentUser?.email||'')})?</p>
      <button class="btn bp bsm" onclick="kopraKlaim()">Klaim halaman Export Kopra</button></div>`;
    return;
  }
  if(!_kIsOwner()){root.innerHTML='<div class="card"><div class="empty">Halaman Export Kopra hanya untuk akun pemilik.</div></div>';return;}
  if(!_kp.doc.menunggu_v1){try{await _kMigrasiMenunggu();}catch(e){console.warn('[Kopra] migrasi menunggu:',e);}}
  try{const n=await _kBersihkanMenunggu();if(n)showToast(n+' transfer menunggu ternyata sudah dicatat lunas — ditutup.');}catch(e){console.warn('[Kopra] bersihkan menunggu:',e);}
  if(_kp.batch){_kRenderBatch(root);return;}
  _kRenderMain(root);
}
async function kopraKlaim(){
  if(!_kSiap())return;
  if(!_currentUser)return;
  if(!confirm('Jadikan '+_currentUser.email+' satu-satunya akun yang bisa membuka Export Kopra?'))return;
  await _kLoadDoc();
  if(_kp.doc.owner_uid){showToast('Sudah diklaim akun lain.',true);renderKopra();return;}
  _kp.doc.owner_uid=_currentUser.uid;_kp.doc.owner_email=_currentUser.email;
  _kp.doc.settings=Object.assign({},KOPRA_DEFAULT_SETTINGS,_kp.doc.settings||{});
  await _kSaveDoc();addLog('kopra_klaim','Klaim Export Kopra','kopra','','',_currentUser.email);
  renderKopra();
}

function _kRenderMain(root){
  const S=_kSet();
  const belumSet=!S.gas_url||!S.gas_token||!S.rek_sumber;
  const groups=_kp.sheet?_kp.sheet.groups.map((g,i)=>({g,i})).filter(({g})=>_kp.showDone||g.rows.some(r=>_kPerlu(r,S))).slice(-12).reverse():[];
  root.innerHTML=`
  ${belumSet?`<div class="card" style="border-color:var(--wb);background:var(--wbg);font-size:13px">Setting belum lengkap (${[!S.gas_url&&'URL Apps Script',!S.gas_token&&'token',!S.rek_sumber&&'rekening sumber Mandiri'].filter(Boolean).join(', ')}). Buka <b>Setting</b> di bawah.</div>`:''}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <div class="ct" style="margin:0">1 · Baca sheet Monitoring VA</div>
      <div class="bg">
        <button class="btn bp bsm" id="kopra-btn-baca" onclick="kopraBacaSheet()" ${_kp.loading?'disabled':''}>${_kp.loading?'Membaca…':(_kp.sheet?'Baca ulang':'Baca sheet')}</button>
      </div>
    </div>
    ${_kp.err?`<div style="color:var(--dn);font-size:12px;margin-bottom:8px">${_ke(_kp.err)}</div>`:''}
    ${_kp.sheet?`
      <div class="fbar" style="font-size:12px">
        <label style="display:flex;gap:5px;align-items:center"><input type="checkbox" ${_kp.showDone?'checked':''} onchange="_kp.showDone=this.checked;renderKopra()"> Tampilkan grup yang sudah diinput</label>
        <span style="color:var(--t3)">Dibaca ${_ke(_kp.sheetAt||'')} · ${_kp.sheet.rows.length} baris transaksi</span>
      </div>
      ${groups.length?`<table class="tbl"><thead><tr><th>Tanggal</th><th>Baris</th><th style="text-align:right">Transaksi</th><th style="text-align:right">Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${groups.map(({g,i})=>{const tgl=_kTglGrup(g.rows,today(),g.judul);const perlu=g.rows.filter(r=>_kPerlu(r,S)).length;
        return `<tr><td>${_kFmtTgl(tgl)}</td><td style="font-family:var(--mn)">${g.rows[0].row}–${g.rows[g.rows.length-1].row}</td><td style="text-align:right">${g.rows.length}</td><td class="num-cell">${_kFmtNum(g.rows.reduce((s,r)=>s+(r.nominal||0),0))}</td>
        <td>${perlu?`<span class="tag twn">${perlu} perlu input</span>`:'<span class="tag tok">sudah diinput</span>'}${g.total?'':' <span class="tag twn">belum ditutup baris merah</span>'}</td>
        <td><button class="btn bxs ${_kp.sel&&_kp.sel.gi===i?'bp':''}" onclick="kopraPilihGrup(${i})">Pilih</button></td></tr>`;}).join('')}
      </tbody></table>`:'<div class="empty">Tidak ada baris "'+_ke(S.status_perlu)+'" sejak '+_kFmtTgl(S.mulai_tgl)+'. Centang "Tampilkan grup yang sudah diinput" untuk melihat grup lama.</div>'}
      <div class="fbar" style="margin-top:9px;margin-bottom:0;font-size:12px"><span style="color:var(--t3)">Cadangan — rentang baris manual:</span>
        <input type="number" id="kopra-r1" placeholder="dari" style="width:80px"><input type="number" id="kopra-r2" placeholder="sampai" style="width:80px">
        <button class="btn bxs" onclick="kopraPilihRentang()">Pakai rentang</button></div>`
    :'<div style="font-size:12px;color:var(--t3)">Klik "Baca sheet" untuk mengambil baris dari tab '+_ke(S.tab)+'.</div>'}
  </div>
  ${_kHtmlMenunggu()}
  ${_kp.sel?_kHtmlPreview():''}
  ${_kHtmlRiwayat()}
  ${_kHtmlSetting()}`;
}

async function kopraBacaSheet(){
  _kp.loading=true;_kp.err='';renderKopra();
  try{
    const j=await _kGas({action:'read'});
    if(!j.ok)throw new Error(j.error||'Gagal membaca sheet.');
    _kp.sheet=_kParseSheet(j.values||[],_kSet());_kIsiTanggal(_kp.sheet,today());
    _kp.sheetAt=new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    _kp.sel=null;
    // Langsung pilih grup terbaru yang masih perlu diinput
    const S=_kSet();
    const gi=_kp.sheet.groups.map((g,i)=>({g,i})).filter(({g})=>g.rows.some(r=>_kPerlu(r,S))).map(x=>x.i);
    if(gi.length===1)_kSelect(_kp.sheet.groups[gi[0]].rows,gi[0]);
  }catch(e){_kp.err=e.message;}
  _kp.loading=false;renderKopra();
}
function kopraPilihGrup(i){_kSelect(_kp.sheet.groups[i].rows,i);renderKopra();}
function kopraPilihRentang(){
  const a=parseInt(document.getElementById('kopra-r1').value,10),b=parseInt(document.getElementById('kopra-r2').value,10);
  if(!a||!b||b<a){showToast('Isi rentang baris yang benar.',true);return;}
  const rows=_kp.sheet.rows.filter(r=>r.row>=a&&r.row<=b);
  if(!rows.length){showToast('Tidak ada baris transaksi di rentang itu.',true);return;}
  _kSelect(rows,null);renderKopra();
}
function _kSelect(rows,gi){
  const S=_kSet();
  const anyPerlu=rows.some(r=>_kPerlu(r,S));
  const skip=new Set(anyPerlu?rows.filter(r=>!_kPerlu(r,S)).map(r=>r.row):[]);
  const g=gi!=null&&_kp.sheet?_kp.sheet.groups[gi]:null;
  _kp.sel={gi,rows,tgl:_kTglGrup(rows,today(),g&&g.judul)||today(),skip,remarks:{},reexport:false};
}

// Baris terpilih + hasil validasi
function _kPrepare(){
  const S=_kSet();const sel=_kp.sel;
  const inc=sel.rows.filter(r=>!sel.skip.has(r.row));
  const blokBatch=_kRowsInVerifiedBatch();
  const sheetRows=_kp.sheet?_kp.sheet.rows:[];
  const out=inc.map((r,i)=>{
    const issues=[];const bi=_kBankInfo(r.bank,S);
    const remark=sel.remarks[r.row]!=null?sel.remarks[r.row]:(_kRemarkMem(r.ket)??_kAutoRemark(r.ket,S));
    const x={row:r.row,nama:r.nama,rek:r.rek,rekRaw:r.rekRaw,bank:r.bank,nominal:r.nominal,nominalRaw:r.nominalRaw,ket:r.ket,kategori:r.kategori,
      remark:_kAscii(remark),ref:_kRef(S,sel.tgl,i),tipe:bi.tipe||'',bank_kode:bi.kode||'',bank_nama:bi.nama||'',biaya:bi.tipe==='OBU'?(S.biaya_obu||0):0,issues};
    if(!r.nama)issues.push({b:1,m:'Nama penerima kosong'});
    if(!/^\d{5,20}$/.test(r.rek))issues.push({b:1,m:r.rek?'Nomor rekening tidak valid: '+r.rekRaw:'Rekening kosong'});
    if(bi.err)issues.push({b:1,m:bi.err});
    if(isNaN(r.nominal)||r.nominal<=0)issues.push({b:1,m:'Nominal bukan angka bulat: "'+r.nominalRaw+'"'});
    if(!x.remark)issues.push({b:1,m:'Remark kosong'});
    else if(x.remark.length>(S.remark_max||20))issues.push({m:`Remark ${x.remark.length} karakter (batas ${S.remark_max||20})`});
    if(_kAscii(r.ket)!==r.ket.replace(/\s+/g,' ').trim())issues.push({m:'Keterangan berisi karakter khusus/";" — dirapikan di file'});
    if(!bi.err&&!isNaN(r.biaya)&&r.biaya!==x.biaya)issues.push({m:`Biaya admin di sheet ${_kFmtNum(r.biaya)}, seharusnya ${_kFmtNum(x.biaya)}`});
    if(_kNorm(r.status)===_kNorm(S.status_done))issues.push({m:'Status sheet sudah "'+S.status_done+'"'});
    if(blokBatch[r.row]&&!sel.reexport)issues.push({b:1,m:'Sudah ada di batch '+blokBatch[r.row]+' yang terverifikasi — centang "export ulang" kalau memang perlu'});
    if(r.rek&&!sheetRows.some(o=>o.row<r.row&&o.rek===r.rek))issues.push({m:'Penerima baru — cek nama Host setelah upload'});
    const rut=(S.rutin||[]).find(k=>_kNorm(r.ket).includes(_kNorm(k)));
    if(rut&&!isNaN(r.nominal)){
      const prev=sheetRows.filter(o=>o.row<r.row&&o.rek===r.rek&&_kNorm(o.ket).includes(_kNorm(rut))&&!isNaN(o.nominal)).slice(-5).map(o=>o.nominal);
      if(prev.length){const med=[...prev].sort((a,b)=>a-b)[Math.floor(prev.length/2)];
        if(Math.abs(r.nominal-med)/med>0.25)issues.push({m:`${rut} tidak biasa — 5 terakhir: ${prev.map(_kFmtNum).join(', ')}`});}
    }
    const tk=_kTglDariTeks(r.ket,sel.tgl);
    if(tk&&tk!==sel.tgl)issues.push({m:'Tanggal di keterangan ('+_kFmtTgl(tk)+') beda dengan tanggal grup'});
    if(!_kIsOperasional(r,S)){
      const k=_kKandidat(x,sel.tgl);
      if(k.cara==='none')issues.push({m:'Pembelian bahan baku tanpa pasangan invoice di SIMS'});
    }
    return x;
  });
  const total=out.reduce((s,r)=>s+(r.nominal||0),0),biaya=out.reduce((s,r)=>s+r.biaya,0);
  let cekTotal=null;
  const g=sel.gi!=null?_kp.sheet.groups[sel.gi]:null;
  if(g&&(g.judul||g.total)){
    const all=g.rows.reduce((s,r)=>s+(r.nominal||0),0),allB=g.rows.reduce((s,r)=>s+(isNaN(r.biaya)?0:r.biaya),0);
    const hit=all+allB;
    // Cocok dengan baris judul (atas) atau baris penutup (bawah) — tampilkan mana yang cocok
    const cand=[g.judul,g.total].filter(Boolean);
    const m=cand.find(x=>x.nominal===hit);
    const ref=m||g.judul||g.total;
    cekTotal={row:ref.row,sheet:ref.nominal,hitung:hit,ok:!!m,posisi:ref===g.judul?'judul':'penutup',biayaSheet:ref.biaya,biayaHitung:allB};
  }
  return{rows:out,total,biaya,cekTotal,blok:out.some(r=>r.issues.some(i=>i.b))};
}
function _kIsOperasional(r,S){
  if(_kRule(r.nama))return false;
  return (S.kategori_operasional||[]).some(k=>_kNorm(k)===_kNorm(r.kategori));
}
function _kRowsInVerifiedBatch(){
  const m={};
  (_kp.doc.batches_idx||[]).forEach(b=>{if([KOPRA_STATUS.ver,KOPRA_STATUS.sheet,KOPRA_STATUS.sebagian,KOPRA_STATUS.rekon].includes(b.status))(b.rows||[]).forEach(r=>{m[r]=b.file||b.id;});});
  return m;
}

function _kHtmlPreview(){
  const S=_kSet();const sel=_kp.sel;const P=_kPrepare();
  const nWarn=P.rows.reduce((s,r)=>s+r.issues.filter(i=>!i.b).length,0);
  return `<div class="card">
    <div class="ct">2 · Preview &amp; validasi</div>
    <div class="fbar" style="font-size:12px">
      <label style="display:flex;gap:5px;align-items:center">Tanggal transfer <input type="date" value="${sel.tgl}" onchange="_kp.sel.tgl=this.value||today();renderKopra()"></label>
      <label style="display:flex;gap:5px;align-items:center"><input type="checkbox" ${sel.reexport?'checked':''} onchange="_kp.sel.reexport=this.checked;renderKopra()"> Export ulang (baris sudah pernah terverifikasi)</label>
    </div>
    <div class="mg">
      <div class="met"><div class="ml">Transaksi</div><div class="mv">${P.rows.length}</div><div class="ms">${sel.skip.size?sel.skip.size+' di-skip':'tidak ada skip'}</div></div>
      <div class="met"><div class="ml">Total transfer</div><div class="mv" style="font-size:16px">${_kFmtNum(P.total)}</div></div>
      <div class="met"><div class="ml">Biaya antar bank</div><div class="mv" style="font-size:16px">${_kFmtNum(P.biaya)}</div><div class="ms">${P.rows.filter(r=>r.tipe==='OBU').length} × ${_kFmtNum(S.biaya_obu)}</div></div>
      <div class="met"><div class="ml">Baris total sheet</div>${P.cekTotal?`<div class="mv ${P.cekTotal.ok?'g':'r'}" style="font-size:16px">${P.cekTotal.ok?'Cocok':'Beda'}</div><div class="ms">baris ${P.cekTotal.posisi} ${P.cekTotal.row}: ${_kFmtNum(P.cekTotal.sheet)}${P.cekTotal.ok?'':' · hitung '+_kFmtNum(P.cekTotal.hitung)}</div>`:'<div class="mv a" style="font-size:14px">Tidak ada</div><div class="ms">grup belum punya baris total</div>'}</div>
    </div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th><th>Baris</th><th>Keterangan</th><th>Remark Kopra</th><th>Penerima</th><th style="text-align:right">Nominal</th><th>Cek</th></tr></thead><tbody>
    ${sel.rows.map(r=>{const x=P.rows.find(p=>p.row===r.row);const skip=sel.skip.has(r.row);
      return `<tr style="${skip?'opacity:.45':''}">
        <td><input type="checkbox" ${skip?'':'checked'} onchange="kopraToggleSkip(${r.row},!this.checked)" title="Ikutkan baris ini"></td>
        <td style="font-family:var(--mn)">${r.row}${x?`<div style="font-size:10px;color:var(--t3)">${_ke(x.ref.slice(-2))}</div>`:''}</td>
        <td class="txt-cell" style="max-width:240px">${_ke(r.ket)}<div style="font-size:10px;color:var(--t3)">${_ke(r.kategori)}</div></td>
        <td>${skip?'':`<input type="text" value="${_ke(x.remark)}" maxlength="40" style="font-size:12px;padding:3px 6px;width:170px" onchange="kopraEditRemark(${r.row},this.value)">`}</td>
        <td>${_ke(r.nama)}<div style="font-size:10px;color:var(--t3)">${_ke(r.bank)}${x&&x.tipe?' · '+x.tipe:''}</div></td>
        <td class="num-cell">${isNaN(r.nominal)?_ke(r.nominalRaw):_kFmtNum(r.nominal)}</td>
        <td style="font-size:11px;min-width:180px">${skip?'<span style="color:var(--t3)">di-skip</span>':(x.issues.length?x.issues.map(i=>`<div style="color:${i.b?'var(--dn)':'var(--wt)'}">${i.b?'⛔':'⚠'} ${_ke(i.m)}</div>`).join(''):'<span style="color:var(--ac)">✓</span>')}</td>
      </tr>`;}).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">
      <div style="font-size:12px;color:${P.blok?'var(--dn)':'var(--t3)'}">${P.blok?'Ada masalah ⛔ — perbaiki di sheet lalu baca ulang, atau skip barisnya.':(nWarn?nWarn+' peringatan ⚠ — tidak memblokir download.':'Semua baris lolos cek.')}</div>
      <button class="btn bp" onclick="kopraDownload()" ${P.blok||!P.rows.length||!S.rek_sumber?'disabled':''}>⬇ Download file Kopra</button>
    </div>
  </div>`;
}
function kopraToggleSkip(row,skip){if(skip)_kp.sel.skip.add(row);else _kp.sel.skip.delete(row);renderKopra();}
function kopraEditRemark(row,val){_kp.sel.remarks[row]=_kAscii(val);renderKopra();}

async function kopraDownload(){
  if(!_kSiap())return;
  const S=_kSet();const sel=_kp.sel;const P=_kPrepare();
  if(P.blok||!P.rows.length)return;
  if(!S.rek_sumber){showToast('Isi rekening sumber Mandiri di Setting.',true);return;}
  const rows=P.rows.map(r=>{const o=Object.assign({},r);delete o.issues;return o;});
  const txt=_kBuildTxt(S,rows);
  const file=_kNamaFile(sel.tgl,rows.map(r=>r.row));
  const id='KB'+Date.now();
  const batch={id,tgl:sel.tgl,file,txt,rows,total:P.total,biaya:P.biaya,n:rows.length,status:KOPRA_STATUS.dl,
    cek_total:P.cekTotal,created:new Date().toISOString(),created_by:_currentUser?.email||'',
    histori:[{t:new Date().toISOString(),by:_currentUser?.email||'',s:KOPRA_STATUS.dl}]};
  // Remark yang diedit diingat per teks keterangan
  sel.rows.forEach(r=>{
    if(sel.remarks[r.row]==null)return;
    const auto=_kAutoRemark(r.ket,S);const v=sel.remarks[r.row];
    _kp.doc.remarks=(_kp.doc.remarks||[]).filter(x=>x.k!==r.ket);
    if(v&&v!==auto)_kp.doc.remarks.push({k:r.ket,r:v});
  });
  // Batch lama berstatus Diunduh yang memuat baris yang sama → digantikan batch ini
  const rowSet=new Set(rows.map(r=>r.row));
  const diganti=[];
  _kp.doc.batches_idx.forEach(b=>{if(b.status===KOPRA_STATUS.dl&&(b.rows||[]).some(r=>rowSet.has(r))){b.status=KOPRA_STATUS.batal;diganti.push(b.id);}});
  _kp.doc.batches_idx.push({id,tgl:sel.tgl,file,rows:rows.map(r=>r.row),n:rows.length,total:P.total,status:KOPRA_STATUS.dl,created:batch.created});
  try{
    await db.collection('sims').doc('kopra_b_'+id).set(batch);
    for(const bid of diganti){await db.collection('sims').doc('kopra_b_'+bid).set({status:KOPRA_STATUS.batal,diganti_oleh:id},{merge:true});}
    await _kSaveDoc();
  }catch(e){showToast('Gagal menyimpan batch: '+e.message+' — file tidak diunduh.',true);await _kLoadDoc();renderKopra();return;}
  _kUnduh(file,txt);
  addLog('export_kopra','Export file Kopra','kopra',id,file,`${rows.length} transfer · ${fmtF(P.total)} · biaya ${fmtF(P.biaya)}`);
  showToast('File Kopra diunduh — upload ke Kopra, lalu verifikasi di Riwayat.');
  _kp.sel=null;renderKopra();
}
function _kUnduh(file,txt){
  const blob=new Blob([txt],{type:'text/plain'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

function _kStatusTag(s){
  const c={[KOPRA_STATUS.dl]:'twn',[KOPRA_STATUS.ver]:'tin',[KOPRA_STATUS.sheet]:'tin',[KOPRA_STATUS.sebagian]:'twn',[KOPRA_STATUS.rekon]:'tok',[KOPRA_STATUS.batal]:'tno'}[s]||'';
  return `<span class="tag ${c}">${_ke(s)}</span>`;
}
function _kHtmlRiwayat(){
  const list=[...(_kp.doc.batches_idx||[])].sort((a,b)=>(b.created||'').localeCompare(a.created||'')).slice(0,15);
  return `<div class="card"><div class="ct">3 · Riwayat export</div>
    ${list.length?`<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Tanggal</th><th>File</th><th style="text-align:right">Trx</th><th style="text-align:right">Total</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(b=>`<tr><td>${_kFmtTgl(b.tgl)}</td><td style="font-size:11px;font-family:var(--mn)">${_ke(b.file)}</td><td style="text-align:right">${b.n}</td><td class="num-cell">${_kFmtNum(b.total)}</td><td>${_kStatusTag(b.status)}</td>
      <td><button class="btn bxs" onclick="kopraBukaBatch('${_ke(b.id)}')">Buka</button></td></tr>`).join('')}
    </tbody></table></div>`:'<div class="empty">Belum ada export.</div>'}</div>`;
}

// ----- Setting -----
function _kHtmlSetting(){
  const S=_kSet();
  if(!_kp.showSet)return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div class="ct" style="margin:0">Setting</div><button class="btn bxs" onclick="_kp.showSet=true;renderKopra()">Buka setting</button></div></div>`;
  const ta=(id,v)=>`<textarea id="${id}" rows="6" style="width:100%;font-family:var(--mn);font-size:11px">${_ke(JSON.stringify(v,null,1))}</textarea>`;
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="ct" style="margin:0">Setting</div><button class="btn bxs" onclick="_kp.showSet=false;renderKopra()">Tutup</button></div>
    <div class="r2">
      <div class="fg"><label class="lbl">URL Web App Apps Script</label><input type="text" id="kset-url" value="${_ke(S.gas_url)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
      <div class="fg"><label class="lbl">Token (sama dengan KOPRA_TOKEN di Apps Script)</label><input type="password" id="kset-token" value="${_ke(S.gas_token)}" autocomplete="off"></div>
    </div>
    <div class="r2">
      <div class="fg"><label class="lbl">Nama tab</label><input type="text" id="kset-tab" value="${_ke(S.tab)}"></div>
      <div class="fg"><label class="lbl">Rekening sumber Mandiri</label><input type="text" id="kset-rek" value="${_ke(S.rek_sumber)}" inputmode="numeric"></div>
    </div>
    <div class="r2">
      <div class="fg"><label class="lbl">Biaya per transfer bank lain</label><input type="number" id="kset-biaya" value="${S.biaya_obu}"></div>
      <div class="fg"><label class="lbl">Awalan referensi / batas remark</label><div style="display:flex;gap:6px"><input type="text" id="kset-prefix" value="${_ke(S.ref_prefix)}"><input type="number" id="kset-max" value="${S.remark_max}" style="width:80px"></div></div>
    </div>
    <div class="fg"><label class="lbl">Abaikan baris sebelum tanggal</label><input type="date" id="kset-mulai" value="${_ke(S.mulai_tgl||'')}"></div>
    <div class="fg"><label class="lbl">Rekonsiliasi lunas</label><select id="kset-mode"><option value="usulan" ${S.rekon_mode!=='catat'?'selected':''}>Usulan saja — tombol "Catat semua" nonaktif</option><option value="catat" ${S.rekon_mode==='catat'?'selected':''}>Aktif — "Catat semua" mencatat lunas di SIMS</option></select></div>
    <details style="margin-bottom:9px"><summary style="font-size:12px;cursor:pointer">Lanjutan: pemetaan kolom, kode bank, aturan penerima (JSON)</summary>
      <div class="fg" style="margin-top:8px"><label class="lbl">Pemetaan kolom (field → nama kolom di sheet)</label>${ta('kset-kolom',S.kolom)}</div>
      <div class="fg"><label class="lbl">Kode bank (OBU)</label>${ta('kset-bank',S.bank_codes)}</div>
      <div class="fg"><label class="lbl">Bank sesama Mandiri (IBU)</label>${ta('kset-ibu',S.bank_ibu)}</div>
      <div class="fg"><label class="lbl">Kategori operasional (tidak dicatat di SIMS)</label>${ta('kset-ops',S.kategori_operasional)}</div>
      <div class="fg"><label class="lbl">Aturan penerima</label>${ta('kset-rules',S.rules)}</div>
    </details>
    <div class="bg" style="flex-wrap:wrap">
      <button class="btn bp bsm" onclick="kopraSimpanSetting()">Simpan setting</button>
      <button class="btn bsm" onclick="kopraTesKoneksi()">Tes koneksi</button>
      <button class="btn bsm" onclick="kopraImporLama()">Impor file Kopra lama (remark)</button>
    </div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">${(_kp.doc.remarks||[]).length} remark tersimpan. Kode Apps Script: <code>apps-script/kopra-monitoring.gs</code> di repo SIMS.</div>
  </div>`;
}
async function kopraSimpanSetting(){
  if(!_kSiap())return;
  const S=_kSet();const v=id=>document.getElementById(id).value;
  const js=(id,lbl)=>{try{return JSON.parse(v(id));}catch(e){throw new Error(lbl+': JSON tidak valid ('+e.message+')');}};
  let n;
  try{
    n=Object.assign({},S,{gas_url:v('kset-url').trim(),gas_token:v('kset-token').trim(),tab:v('kset-tab').trim()||'Monitoring VA',
      rek_sumber:v('kset-rek').replace(/\D/g,''),biaya_obu:parseInt(v('kset-biaya'),10)||0,ref_prefix:v('kset-prefix').trim()||'SPPG',
      remark_max:parseInt(v('kset-max'),10)||20,rekon_mode:v('kset-mode'),mulai_tgl:v('kset-mulai')||'',
      kolom:js('kset-kolom','Pemetaan kolom'),bank_codes:js('kset-bank','Kode bank'),bank_ibu:js('kset-ibu','Bank IBU'),
      kategori_operasional:js('kset-ops','Kategori operasional'),rules:js('kset-rules','Aturan penerima')});
    if(n.gas_url&&!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(n.gas_url))throw new Error('URL harus berbentuk https://script.google.com/macros/s/…/exec');
  }catch(e){showToast(e.message,true);return;}
  const ubah=Object.keys(n).filter(k=>JSON.stringify(n[k])!==JSON.stringify(S[k])&&k!=='gas_token').join(', ')+(n.gas_token!==S.gas_token?' (token)':'');
  _kp.doc.settings=n;
  try{await _kSaveDoc();}catch(e){showToast('Gagal simpan: '+e.message,true);return;}
  addLog('kopra_setting','Ubah setting Export Kopra','kopra','','',ubah||'tanpa perubahan');
  showToast('Setting disimpan.');renderKopra();
}
async function kopraTesKoneksi(){
  try{const j=await _kGas({action:'ping'});showToast(j.ok?'Koneksi ke Apps Script OK.':'Gagal: '+j.error,!j.ok);}
  catch(e){showToast(e.message,true);}
}
// File Kopra lama → ingat remark (kolom 19) per keterangan (kolom 73); isi rekening sumber kalau kosong
function kopraImporLama(){
  if(!_kSiap())return;
  const inp=document.createElement('input');inp.type='file';inp.accept='.txt';inp.multiple=true;
  inp.onchange=async()=>{
    const S=_kSet();let n=0,rekS='';
    for(const f of inp.files){
      const t=await f.text();
      t.split(/\r?\n/).forEach(l=>{const c=l.split(';');if(c.length<73||c[0]!=='M')return;
        const ket=c[72],rem=c[18];if(c[7])rekS=rekS||c[7];
        if(!ket||!rem)return;
        _kp.doc.remarks=(_kp.doc.remarks||[]).filter(x=>x.k!==ket);
        if(rem!==_kAutoRemark(ket,S)){_kp.doc.remarks.push({k:ket,r:rem});n++;}
      });
    }
    if(rekS&&!S.rek_sumber){_kp.doc.settings=Object.assign({},S,{rek_sumber:rekS});}
    try{await _kSaveDoc();}catch(e){showToast('Gagal simpan: '+e.message,true);return;}
    addLog('kopra_impor','Impor remark dari file Kopra lama','kopra','','',n+' remark');
    showToast(n+' remark diingat'+(rekS&&!S.rek_sumber?' · rekening sumber diisi dari file':'')+'.');renderKopra();
  };
  inp.click();
}

// ----- Batch: verifikasi, update sheet, rekonsiliasi -----
async function kopraBukaBatch(id){
  try{const s=await db.collection('sims').doc('kopra_b_'+id).get();if(!s.exists){showToast('Batch tidak ditemukan.',true);return;}
    _kp.batch=s.data();_kp.verif=null;_kp.rekon=null;_kp.sheetErr=null;renderKopra();window.scrollTo(0,0);}
  catch(e){showToast('Gagal membuka batch: '+e.message,true);}
}
function kopraTutupBatch(){_kp.batch=null;_kp.verif=null;_kp.rekon=null;_kp.sheetErr=null;renderKopra();}
async function _kSimpanBatch(patch,logArgs){
  const b=_kp.batch;Object.assign(b,patch);
  b.histori=(b.histori||[]).concat([{t:new Date().toISOString(),by:_currentUser?.email||'',s:b.status}]);
  const ix=_kp.doc.batches_idx.find(x=>x.id===b.id);if(ix)ix.status=b.status;
  await db.collection('sims').doc('kopra_b_'+b.id).set(b);
  await _kSaveDoc();
  if(logArgs)addLog(...logArgs);
}
const _kRank={[KOPRA_STATUS.batal]:-1,[KOPRA_STATUS.dl]:0,[KOPRA_STATUS.ver]:1,[KOPRA_STATUS.sheet]:2,[KOPRA_STATUS.sebagian]:2.5,[KOPRA_STATUS.rekon]:3};
function _kNextStatus(b,s){return _kRank[s]>(_kRank[b.status]||0)?s:b.status;}

function _kRenderBatch(root){
  const b=_kp.batch;const S=_kSet();
  const verified=!!b.verif;const batal=b.status===KOPRA_STATUS.batal;
  root.innerHTML=`
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><div style="font-weight:600">${_ke(b.file)}</div><div style="font-size:12px;color:var(--t3)">${_kFmtTgl(b.tgl)} · ${b.n} transfer · ${fmtF(b.total)} + biaya ${fmtF(b.biaya)} · dibuat ${_ke(_kWaktu(b.created))} ${_ke(b.created_by||'')}</div></div>
      <div class="bg">${_kStatusTag(b.status)}<button class="btn bsm" onclick="_kUnduh(_kp.batch.file,_kp.batch.txt)">⬇ Unduh lagi</button><button class="btn bsm" onclick="kopraTutupBatch()">← Kembali</button></div>
    </div>
    ${batal?'<div style="margin-top:8px;font-size:12px;color:var(--dn)">Batch ini digantikan export yang lebih baru — jangan dipakai.</div>':''}
  </div>
  <div class="card"><div class="ct">Baris</div><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Ref</th><th>Baris</th><th>Penerima</th><th>Remark</th><th style="text-align:right">Nominal</th></tr></thead><tbody>
    ${b.rows.map(r=>`<tr><td style="font-family:var(--mn);font-size:11px">${_ke(r.ref)}</td><td>${r.row}</td><td>${_ke(r.nama)}<div style="font-size:10px;color:var(--t3)">${_ke(r.bank)} · ${r.tipe}</div></td><td>${_ke(r.remark)}</td><td class="num-cell">${_kFmtNum(r.nominal)}</td></tr>`).join('')}
  </tbody></table></div></div>
  ${batal?'':_kHtmlVerif()}
  ${batal?'':`<div class="card"><div class="ct">5 · Status Maker di sheet</div>
    ${b.sheet_done?`<div style="font-size:13px;color:var(--ac)">✓ "${_ke(S.status_done)}" ditulis ke baris ${b.rows.map(r=>r.row).join(', ')} — ${_ke(_kWaktu(b.sheet_done.at))}</div>`
      :`<div style="font-size:12px;color:var(--t2);margin-bottom:8px">Menulis "${_ke(S.status_done)}" ke kolom ${_ke(S.kolom.status)} untuk ${b.n} baris batch ini saja. Isi baris dicek ulang dulu (penerima, rekening, nominal, keterangan); kalau ada yang berubah, tidak ada yang ditulis.</div>
      ${_kp.sheetErr?_kHtmlSheetErr():''}
      <button class="btn bp bsm" onclick="kopraTulisSheet()" ${verified?'':'disabled'}>Tulis status ke sheet</button>${verified?'':' <span style="font-size:11px;color:var(--t3)">Verifikasi dulu.</span>'}`}
  </div>`}
  ${batal?'':_kHtmlRekon()}`;
}

function _kHtmlVerif(){
  const b=_kp.batch;
  if(b.verif)return `<div class="card"><div class="ct">4 · Verifikasi Kopra</div><div style="font-size:13px;color:var(--ac)">✓ Terverifikasi (${b.verif.method==='file'?'file '+_ke(b.verif.file||''):'manual'}) — ${_ke(_kWaktu(b.verif.at))}${b.verif.konfirmasi_nama&&b.verif.konfirmasi_nama.length?' · nama host dikonfirmasi: baris '+b.verif.konfirmasi_nama.join(', '):''}</div></div>`;
  const V=_kp.verif;
  let body='';
  if(V&&V.mode==='file'){
    const allOk=V.r.countOk&&!V.r.extra.length&&V.r.res.every(x=>x.ok||(x.hardOk&&!x.namaOk&&V.konf.has(x.row)));
    const nValid=V.r.res.filter(x=>x.belumSubmit).length;
    body=`<div style="font-size:12px;margin-bottom:6px">File: ${_ke(V.file)} · ${V.r.res.filter(x=>x.ok).length}/${b.n} cocok${V.r.countOk?'':' · <span style="color:var(--dn)">jumlah baris file beda dengan batch</span>'}</div>
    ${nValid?`<div style="font-size:12px;color:var(--wt);margin-bottom:6px">⚠ ${nValid} baris masih berstatus "Valid" di Kopra (belum disubmit) — isi file sudah cocok, pastikan transaksinya di-approve di Kopra.</div>`:''}
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th></th><th>Ref</th><th>Baris</th><th>Nama Host</th><th>Cek</th></tr></thead><tbody>
    ${V.r.res.map(x=>{const r=b.rows.find(y=>y.row===x.row);return `<tr><td>${x.ok?'✅':(x.hardOk&&!x.namaOk&&V.konf.has(x.row)?'☑️':'❌')}</td><td style="font-family:var(--mn);font-size:11px">${_ke(x.ref)}</td><td>${x.row}</td>
      <td>${_ke(x.host||'—')}${x.namaOk===false?`<div style="font-size:11px;color:var(--wt)">beda dengan "${_ke(r.nama)}"${x.hardOk?` <label><input type="checkbox" ${V.konf.has(x.row)?'checked':''} onchange="kopraKonfNama(${x.row},this.checked)"> nama benar</label>`:''}</div>`:''}</td>
      <td style="font-size:11px">${x.cek.filter(c=>!c.ok).map(c=>`<div style="color:var(--dn)">${_ke(c.msg)}</div>`).join('')||'<span style="color:var(--ac)">semua cocok</span>'}</td></tr>`;}).join('')}
    ${V.r.extra.map(x=>`<tr><td>❌</td><td style="font-family:var(--mn);font-size:11px">${_ke(x.ref)}</td><td>—</td><td>${_ke(x.host)}</td><td style="font-size:11px;color:var(--dn)">Tidak ada di batch</td></tr>`).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap"><div style="font-size:12px;color:${allOk?'var(--ac)':'var(--dn)'}">${allOk?'Semua cocok.':'Ada yang tidak cocok — perbaiki sheet lalu export ulang. Status sheet & lunas tidak dicatat.'}</div>
    <button class="btn bp bsm" onclick="kopraSimpanVerif()" ${allOk?'':'disabled'}>Tandai terverifikasi</button></div>`;
  } else if(V&&V.mode==='manual'){
    const all=b.rows.every(r=>V.cek.has(r.row));
    body=`<div style="font-size:12px;color:var(--t2);margin-bottom:6px">Centang baris yang di layar Kopra cocok: rekening, nominal, remark, reference number, dan status berhasil.</div>
    ${b.rows.map(r=>`<label style="display:flex;gap:6px;font-size:12px;padding:3px 0"><input type="checkbox" ${V.cek.has(r.row)?'checked':''} onchange="kopraCekManual(${r.row},this.checked)"> ${_ke(r.ref)} · ${_ke(r.nama)} · ${_kFmtNum(r.nominal)} · ${_ke(r.remark)}</label>`).join('')}
    <div style="text-align:right;margin-top:8px"><button class="btn bp bsm" onclick="kopraSimpanVerif()" ${all?'':'disabled'}>Tandai terverifikasi</button></div>`;
  }
  return `<div class="card"><div class="ct">4 · Verifikasi Kopra</div>
    <div class="bg" style="margin-bottom:${body?'10px':'0'};flex-wrap:wrap"><button class="btn bp bsm" onclick="kopraUploadTL()">Upload transfer list (.xlsx)</button><button class="btn bsm" onclick="_kp.verif={mode:'manual',cek:new Set()};renderKopra()">Cek manual</button></div>
    ${body}</div>`;
}
function kopraUploadTL(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls';
  inp.onchange=async()=>{
    const f=inp.files[0];if(!f)return;
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
      const aoa=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',raw:false});
      const list=_kParseTransferList(aoa);
      _kp.verif={mode:'file',file:f.name,r:_kVerifikasi(_kp.batch.rows,list),konf:new Set()};
      renderKopra();
    }catch(e){showToast('Gagal membaca file: '+e.message,true);}
  };
  inp.click();
}
function kopraKonfNama(row,on){if(on)_kp.verif.konf.add(row);else _kp.verif.konf.delete(row);renderKopra();}
function kopraCekManual(row,on){if(on)_kp.verif.cek.add(row);else _kp.verif.cek.delete(row);renderKopra();}
async function kopraSimpanVerif(){
  if(!_kSiap())return;
  const b=_kp.batch;const V=_kp.verif;if(!V)return;
  const verif={method:V.mode,at:new Date().toISOString(),by:_currentUser?.email||''};
  if(V.mode==='file'){verif.file=V.file;verif.konfirmasi_nama=[...V.konf];verif.hasil=V.r.res.map(x=>({ref:x.ref,row:x.row,host:x.host||'',ok:x.ok}));}
  try{await _kSimpanBatch({verif,status:_kNextStatus(b,KOPRA_STATUS.ver)},['verif_kopra','Verifikasi transfer Kopra','kopra',b.id,b.file,
    (V.mode==='file'?'file '+V.file:'manual')+' · '+b.n+' baris'+(verif.konfirmasi_nama&&verif.konfirmasi_nama.length?' · nama dikonfirmasi: '+verif.konfirmasi_nama.join(','):'')]);}
  catch(e){showToast('Gagal simpan: '+e.message,true);return;}
  _kp.verif=null;showToast('Batch terverifikasi.');renderKopra();
}

async function kopraTulisSheet(){
  if(!_kSiap())return;
  const b=_kp.batch;const S=_kSet();if(!b.verif)return;
  const rows=b.rows.map(r=>r.row);
  if(!confirm(`Tulis "${S.status_done}" ke kolom ${S.kolom.status} untuk ${rows.length} baris (${Math.min(...rows)}–${Math.max(...rows)})?`))return;
  const K=S.kolom;
  const checks=b.rows.map(r=>({row:r.row,expect:{[K.nama]:r.nama,[K.nominal]:r.nominalRaw,[K.rek]:r.rekRaw,[K.ket]:r.ket}}));
  _kp.sheetErr=null;
  let j;
  try{j=await _kGas({action:'mark',status_header:K.status,status_from:S.status_perlu,checks});}
  catch(e){_kp.sheetErr={error:e.message};renderKopra();return;}
  if(!j.ok){_kp.sheetErr=j;addLog('sheet_kopra_gagal','Tulis status sheet dibatalkan','kopra',b.id,b.file,j.error||'');renderKopra();return;}
  try{await _kSimpanBatch({sheet_done:{at:new Date().toISOString(),by:_currentUser?.email||'',rows:j.written},status:_kNextStatus(b,KOPRA_STATUS.sheet)},
    ['sheet_kopra','Status Maker sheet diperbarui','kopra',b.id,b.file,'baris '+j.written.join(', ')]);}
  catch(e){showToast('Sheet sudah ditulis, tapi gagal menyimpan status batch: '+e.message,true);}
  showToast('Status Maker di sheet diperbarui.');renderKopra();
}
function _kHtmlSheetErr(){
  const e=_kp.sheetErr;
  return `<div style="background:var(--dbg);color:var(--dt);border-radius:var(--r);padding:8px 10px;font-size:12px;margin-bottom:8px">${_ke(e.error||'Gagal')}
    ${(e.mismatches||[]).length?`<table class="tbl" style="margin-top:6px"><thead><tr><th>Baris</th><th>Kolom</th><th>Saat export</th><th>Sekarang di sheet</th></tr></thead><tbody>
    ${e.mismatches.map(m=>`<tr><td>${_ke(m.row)}</td><td>${_ke(m.field)}</td><td>${_ke(m.expect)}</td><td>${_ke(m.actual)}</td></tr>`).join('')}</tbody></table>
    <div style="margin-top:6px">Perbaiki sheet atau export ulang dari baris yang benar.</div>`:''}</div>`;
}

// ----- Rekonsiliasi lunas -----
function _kRule(nama){const S=_kSet();const n=_kNorm(nama);return (S.rules||[]).find(r=>r.penerima&&n.includes(_kNorm(r.penerima)))||null;}
function _kResolve(rule){
  const out={};
  if(rule.cara==='terima'){
    const vs=getVendorSaya().filter(v=>_kNorm(v.nama).includes(_kNorm(rule.mitra)));
    if(vs.length!==1)out.err=`Aturan ${rule.penerima}: vendor mitra "${rule.mitra}" ${vs.length?'cocok ke '+vs.length+' mitra':'tidak ditemukan'}`;else out.vs=vs[0];
    const rk=getReks().filter(r=>_kNorm(r.nama).includes(_kNorm(rule.rek)));
    if(rk.length!==1)out.err=(out.err?out.err+'; ':'')+`rekening "${rule.rek}" ${rk.length?'cocok ke '+rk.length+' rekening':'tidak ditemukan'}`;else out.rek=rk[0];
  }
  return out;
}
function _kPoTgl(poId){const p=getPOs().find(x=>x.id===poId);return p?(p.tgl||p.tanggal||''):'';}
function _kJarak(a,b){if(!a||!b)return 999;return Math.abs((new Date(a)-new Date(b))/864e5);}
// Kandidat invoice untuk satu baris transfer → {cara, rule, err, cands:[{id,no,kind,label,state,po_id}]}
// state: siap | sudah (sudah tercatat untuk transfer ini) | lunas_beda | blok
// Jendela tanggal invoice: 21 hari sebelum s/d 7 hari sesudah transfer — nominal
// yang sama sering berulang (mis. tempe 140 papan), jangan cocokkan ke invoice lama.
function _kDalamJendela(invTgl,tgl){if(!invTgl||!tgl)return true;const d=(new Date(invTgl)-new Date(tgl))/864e5;return d>=-21&&d<=7;}
function _kDekat(a,b){return b>0&&Math.abs(Math.round(a)-b)/b<=0.15;}
function _kSelisih(inv,trf){const d=Math.round(inv)-trf;return 'nominal invoice '+_kFmtNum(inv)+' ('+(d>0?'+':'')+_kFmtNum(d)+' dari transfer) — pilih hanya kalau memang invoice ini';}
function _kKandidat(r,tgl){
  const rule=_kRule(r.nama);const S=_kSet();
  const tandaBaris='Sheet baris '+r.row+' ';
  const urut=(a,b)=>_kJarak(a.tgl,tgl)-_kJarak(b.tgl,tgl);
  if(rule&&rule.cara==='terima'){
    const R=_kResolve(rule);if(R.err)return{cara:'terima',rule,err:R.err,cands:[]};
    const cands=[];
    getInvD().forEach(d=>{
      if(d.vendor_saya_id!==R.vs.id||(d.type||'markup')==='passthrough'||!_kDalamJendela(d.tgl,tgl))return;
      const pays=d.payments||[];const paid=pays.reduce((s,p)=>s+p.jumlah,0);
      if(Math.round(d.total)!==r.nominal){
        // Kandidat dekat: nominal beda ≤15%, belum ada pembayaran — hanya bisa dipilih manual
        if(_kDekat(d.total,r.nominal)&&!paid&&d.terima_status!=='lunas')cands.push({id:d.id,no:d.no,kind:'invd',po_id:d.po_id,tgl:d.tgl,label:`${d.no} · ${d.tgl||''} · ${_kFmtNum(d.total)}`,state:'beda',why:_kSelisih(d.total,r.nominal),rek:R.rek});
        return;
      }
      let state='siap',why='';
      if(pays.some(p=>(p.catatan||'').startsWith(tandaBaris))){state='sudah';why='sudah dicatat dari baris ini';}
      else if(d.terima_status==='lunas'||paid>=d.total){
        if(pays.some(p=>p.rek_id===R.rek.id&&p.jumlah===r.nominal&&p.tgl===tgl)){state='sudah';why='sudah lunas ke '+R.rek.nama+' tgl '+_kFmtTgl(tgl);}
        else if(pays.some(p=>p.rek_id===R.rek.id))return; // lunas untuk transfer lain — bukan kandidat
        else{state='lunas_beda';why='sudah LUNAS dengan cara lain — cek manual';}
      } else if(paid>0){state='lunas_beda';why='sudah ada pembayaran sebagian '+_kFmtNum(paid);}
      cands.push({id:d.id,no:d.no,kind:'invd',po_id:d.po_id,tgl:d.tgl,label:`${d.no} · ${d.tgl||''} · ${d.dapur||''}`,state,why,rek:R.rek});
    });
    return{cara:'terima',rule,cands:cands.sort(urut)};
  }
  const vendorCands=(filterVendor,dekat)=>{
    const out=[];
    getInvV().forEach(v=>{
      if(filterVendor&&!_kNorm(v.vendor).includes(_kNorm(filterVendor)))return;
      const n=invVNet(v);
      if(!_kDalamJendela(v.tgl,tgl))return;
      if(Math.round(v.total)!==r.nominal&&Math.round(n.netTotal)!==r.nominal){
        if(dekat&&_kDekat(n.netTotal,r.nominal)&&v.bayar_status!=='lunas'&&!isPassthrough(v.id)&&!(v.payments||[]).length&&!_ptSudahDitagihMarkup(v.id).length)
          out.push({id:v.id,no:v.no,kind:'invv',po_id:v.po_id,tgl:v.tgl,label:`${v.no} · ${v.tgl||''} · ${v.vendor} · ${_kFmtNum(n.netTotal)}`,state:'beda',why:_kSelisih(n.netTotal,r.nominal)});
        return;
      }
      let state='siap',why='';
      if(isPassthrough(v.id)){
        const pays=v.payments||[];
        if(pays.some(p=>(p.catatan||'').includes(tandaBaris)||p.tgl===tgl)){state='sudah';why='sudah pass-through';}
        else return; // pass-through untuk transfer lain
      }
      else if(v.bayar_status==='lunas'){state='lunas_beda';why='sudah LUNAS dari rekening — seharusnya pass-through? Cek manual';}
      else if(_ptSudahDitagihMarkup(v.id).length){state='blok';why='item sudah ditagihkan ke dapur lewat invoice markup';}
      else if((v.payments||[]).length){state='lunas_beda';why='ada pembayaran manual '+_kFmtNum(n.paid)+' — cek manual';}
      out.push({id:v.id,no:v.no,kind:'invv',po_id:v.po_id,tgl:v.tgl,label:`${v.no} · ${v.tgl||''} · ${v.vendor}`,state,why});
    });
    return out.sort(urut);
  };
  if(rule&&rule.cara==='pt')return{cara:'pt',rule,cands:vendorCands(rule.vendor,true)};
  if((S.kategori_operasional||[]).some(k=>_kNorm(k)===_kNorm(r.kategori)))return{cara:'ops',cands:[]};
  // Penerima tanpa aturan: INV-V yang belum dibayar (harus dikonfirmasi), atau yang
  // sudah dicatat pass-through untuk transfer ini (dicatat manual di luar Export Kopra)
  const semua=vendorCands(null);
  const sudah=semua.filter(x=>x.state==='sudah'),c=semua.filter(x=>x.state==='siap');
  if(sudah.length)return{cara:'pt',rule:null,cands:sudah.concat(c)};
  return c.length?{cara:'pt',rule:null,perluKonfirmasi:true,cands:c}:{cara:'none',cands:[]};
}

function _kBangunRekon(){
  const b=_kp.batch;
  const items=b.rows.map(r=>{
    const k=_kKandidat(r,b.tgl);
    const siap=k.cands.filter(c=>c.state==='siap');
    const sudah=k.cands.find(c=>c.state==='sudah');
    let pilih='';
    // Pilih otomatis hanya kalau tepat satu kandidat siap dan aturannya jelas
    if(!sudah&&siap.length===1&&!k.perluKonfirmasi)pilih=siap[0].id;
    return{row:r.row,r,k,pilih,sudah:!!sudah};
  });
  // Satu invoice tidak boleh dipakai dua baris
  const dipakai={};items.forEach(it=>{if(it.pilih){if(dipakai[it.pilih])it.pilih='';else dipakai[it.pilih]=1;}});
  _kp.rekon={items};
}
function kopraRekonPilih(row,id){const it=_kp.rekon.items.find(x=>x.row===row);if(it)it.pilih=id;renderKopra();}

function _kHtmlRekon(){
  const b=_kp.batch;const S=_kSet();
  if(!b.verif)return `<div class="card"><div class="ct">6 · Rekonsiliasi lunas di SIMS</div><div style="font-size:12px;color:var(--t3)">Tersedia setelah batch terverifikasi.</div></div>`;
  if(b.rekon&&!_kp.rekon)return _kHtmlRekonHasil(b.rekon);
  if(!_kp.rekon)_kBangunRekon();
  const R=_kp.rekon;const mode=S.rekon_mode==='catat';
  const caraTxt=it=>{const k=it.k;
    if(k.cara==='ops')return '<span style="color:var(--t3)">Operasional — tidak dicatat</span>';
    if(k.cara==='none')return '<span style="color:var(--wt)">Tidak ada pasangan invoice — dilewati</span>';
    if(k.err)return `<span style="color:var(--dn)">${_ke(k.err)}</span>`;
    return k.cara==='terima'?'Rekam terima → '+_ke((k.cands[0]&&k.cands[0].rek&&k.cands[0].rek.nama)||k.rule.rek):'Konversi pass-through'+(k.perluKonfirmasi?' <span class="tag twn">tanpa aturan — konfirmasi</span>':'');};
  const nCatat=R.items.filter(it=>it.pilih&&!it.sudah).length;
  return `<div class="card"><div class="ct">6 · Rekonsiliasi lunas di SIMS</div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:8px">Tanggal bayar = ${_kFmtTgl(b.tgl)}. Catatan: "Sheet baris N — keterangan — nominal". Invoice yang sudah lunas dengan cara lain tidak diubah.</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Baris</th><th>Sheet</th><th style="text-align:right">Nominal</th><th>Invoice SIMS</th><th>Cara dicatat</th></tr></thead><tbody>
    ${R.items.map(it=>{const k=it.k;
      let inv='—';
      if(it.sudah){const c=k.cands.find(c=>c.state==='sudah');inv=`<span style="color:var(--ac)">✓ ${_ke(c.no)}</span><div style="font-size:10px;color:var(--t3)">${_ke(c.why)}</div>`;}
      else if(k.cands.length){
        inv=`<select style="font-size:12px;max-width:260px" onchange="kopraRekonPilih(${it.row},this.value)"><option value="">— lewati —</option>${k.cands.map(c=>`<option value="${_ke(c.id)}" ${c.id===it.pilih?'selected':''} ${c.state==='siap'||c.state==='beda'?'':'disabled'}>${_ke(c.label)}${c.state==='siap'?'':c.state==='beda'?' — nominal beda':' — '+_ke(c.why)}</option>`).join('')}</select>`
          +k.cands.filter(c=>c.state!=='siap').map(c=>`<div style="font-size:10px;color:var(--wt)">⚠ ${_ke(c.no)}: ${_ke(c.why)}</div>`).join('')
          +(k.cands.filter(c=>c.state==='siap').length>1?'<div style="font-size:10px;color:var(--wt)">Lebih dari satu kandidat — pilih</div>':'');
      }
      return `<tr><td>${it.row}</td><td class="txt-cell" style="max-width:220px">${_ke(it.r.ket)}<div style="font-size:10px;color:var(--t3)">${_ke(it.r.nama)}</div></td><td class="num-cell">${_kFmtNum(it.r.nominal)}</td><td>${inv}</td><td style="font-size:12px">${caraTxt(it)}</td></tr>`;}).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--t3)">${mode?nCatat+' invoice akan dicatat.':'Mode usulan — aktifkan "Catat semua" di Setting setelah aturan terbukti benar.'}</div>
      <button class="btn bp bsm" onclick="kopraCatatSemua()" ${mode&&(nCatat||R.items.some(it=>!it.sudah&&it.k.cara!=='ops'))?'':'disabled'}>Catat semua (${nCatat})</button>
    </div></div>`;
}

// Catat satu baris transfer ke kandidat c (state siap/beda) — mengubah data SIMS
// dan addLog. Dipakai "Catat semua", tombol Catat di daftar menunggu, dan tawaran
// saat invoice disimpan. Kembalikan entri hasil untuk batch.rekon.hasil.
function _kCatatSatu(r,c,tgl){
  const base={row:r.row,ket:r.ket,nama:r.nama,kategori:r.kategori,nominal:r.nominal};
  const catatan=`Sheet baris ${r.row} — ${r.ket} — ${_kFmtNum(r.nominal)}`;
  if(c.kind==='invd'){
    const invDs=getInvD();const d=invDs.find(x=>x.id===c.id);
    if(!d)return Object.assign(base,{cara:'terima',hasil:'menunggu',catatan:'invoice tidak ditemukan'});
    if(!d.payments)d.payments=[];
    d.payments.push({id:uid(),jumlah:r.nominal,tgl,rek_id:c.rek.id,catatan});
    if(d.payments.reduce((s2,p)=>s2+p.jumlah,0)>=d.total)d.terima_status='lunas';
    setInvD(invDs);
    addLog('terima_invd','Terima dari dapur (Kopra)','invd',d.id,d.no,fmtF(r.nominal)+' ke '+c.rek.nama+' · sheet baris '+r.row+(c.state==='beda'?' · nominal invoice '+fmtF(d.total):''));
    return Object.assign(base,{inv:d.no,inv_id:d.id,po_id:d.po_id,cara:'terima',hasil:'dicatat'});
  }
  const iv=getInvV().find(x=>x.id===c.id);
  const cat=catatan+(c.state==='beda'&&iv?' (nominal invoice '+_kFmtNum(iv.total)+')':'');
  _konversiPTApply(c.id,{alasan:cat,tgl});
  addLog('konversi_pt','Konversi pass-through (Kopra)','invv',c.id,c.no,cat);
  return Object.assign(base,{inv:c.no,inv_id:c.id,po_id:c.po_id,cara:'pt',hasil:'dicatat'});
}
function _kStatusRekon(hasil){return hasil.some(h=>h.hasil==='menunggu')?KOPRA_STATUS.sebagian:KOPRA_STATUS.rekon;}
// Sinkronkan ringkasan baris menunggu batch ini ke sims/kopra.menunggu
function _kSyncMenunggu(b){
  const lain=(_kp.doc.menunggu||[]).filter(m=>m.b!==b.id);
  const ini=((b.rekon&&b.rekon.hasil)||[]).filter(h=>h.hasil==='menunggu').map(h=>{
    const r=b.rows.find(x=>x.row===h.row)||{};
    return{b:b.id,file:b.file,tgl:b.tgl,row:h.row,nama:h.nama||r.nama||'',ket:h.ket||r.ket||'',kategori:h.kategori||r.kategori||'',nominal:h.nominal};
  });
  _kp.doc.menunggu=lain.concat(ini);
}

async function kopraCatatSemua(){
  if(!_kSiap())return;
  const b=_kp.batch;const S=_kSet();if(S.rekon_mode!=='catat')return;
  const R=_kp.rekon;const todo=R.items.filter(it=>it.pilih&&!it.sudah);
  if(!todo.length&&!R.items.some(it=>!it.sudah&&it.k.cara!=='ops'))return;
  if(!confirm(todo.length?`Catat ${todo.length} invoice sebagai lunas dengan tanggal ${_kFmtTgl(b.tgl)}? Baris pembelian lain ditandai "menunggu invoice".`:'Tandai baris pembelian tanpa invoice sebagai "menunggu invoice"?'))return;
  _kp.sibuk=Date.now();
  const hasil=[];
  for(const it of R.items){
    const r=it.r;const base={row:r.row,ket:r.ket,nama:r.nama,kategori:r.kategori,nominal:r.nominal};
    if(it.sudah){const c=it.k.cands.find(c=>c.state==='sudah');hasil.push(Object.assign(base,{inv:c.no,inv_id:c.id,po_id:c.po_id,cara:it.k.cara,hasil:'sudah'}));continue;}
    if(it.k.cara==='ops'){hasil.push(Object.assign(base,{cara:'ops',hasil:'operasional'}));continue;}
    if(!it.pilih){hasil.push(Object.assign(base,{cara:it.k.cara,hasil:'menunggu'}));continue;}
    // Cek ulang kondisi terkini (data bisa berubah sejak usulan dibuat)
    const k=_kKandidat(r,b.tgl);const c=k.cands.find(x=>x.id===it.pilih);
    if(!c||(c.state!=='siap'&&c.state!=='beda')){hasil.push(Object.assign(base,{inv:c?c.no:'',cara:k.cara,hasil:'menunggu',catatan:'gagal: '+(c?c.why:'invoice tidak ditemukan')}));continue;}
    hasil.push(_kCatatSatu(r,c,b.tgl));
  }
  const n=hasil.filter(h=>h.hasil==='dicatat').length,nm=hasil.filter(h=>h.hasil==='menunggu').length;
  b.rekon={at:new Date().toISOString(),by:_currentUser?.email||'',hasil};
  _kSyncMenunggu(b);
  try{await _kSimpanBatch({rekon:b.rekon,status:_kNextStatus(b,_kStatusRekon(hasil))},
    ['rekon_kopra','Rekonsiliasi lunas dari Kopra','kopra',b.id,b.file,n+' invoice dicatat lunas'+(nm?' · '+nm+' menunggu invoice':'')]);}
  catch(e){showToast('Lunas dicatat di SIMS, tapi gagal menyimpan hasil ke batch: '+e.message,true);}
  _kp.rekon=null;_kp.sibuk=Date.now();showToast(n+' invoice dicatat lunas'+(nm?' · '+nm+' menunggu invoice':'')+'.');renderKopra();
}

// Catat satu baris yang menunggu (dari daftar menunggu, hasil batch, atau tawaran)
async function kopraCatatMenunggu(batchId,row,candId){
  if(!_kSiap())return;
  const S=_kSet();if(S.rekon_mode!=='catat'){showToast('Mode rekonsiliasi masih "usulan" — aktifkan di Setting.',true);return;}
  let b;try{const sn=await db.collection('sims').doc('kopra_b_'+batchId).get();b=sn.data();}catch(e){showToast('Gagal membaca batch: '+e.message,true);return;}
  const h=b&&b.rekon&&b.rekon.hasil.find(x=>x.row===row);
  if(!h||h.hasil!=='menunggu'){showToast('Baris ini sudah tidak menunggu.',true);await _kLoadDoc();_kTutupTawaran();renderKopra();return;}
  const r=b.rows.find(x=>x.row===row);
  const c=_kKandidat(r,b.tgl).cands.find(x=>x.id===candId);
  if(!c||(c.state!=='siap'&&c.state!=='beda')){showToast('Invoice tidak lagi bisa dicatat: '+(c?c.why:'tidak ditemukan'),true);return;}
  if(!confirm(`Catat ${c.no} lunas untuk transfer ${_kFmtTgl(b.tgl)} baris ${row} (${r.nama}, ${_kFmtNum(r.nominal)})?`+(c.state==='beda'?'\n\nPerhatian: '+c.why:'')))return;
  _kp.sibuk=Date.now();
  const baru=_kCatatSatu(r,c,b.tgl);
  b.rekon.hasil=b.rekon.hasil.map(x=>x.row===row?baru:x);
  await _kLoadDoc();_kSyncMenunggu(b);
  const st=_kStatusRekon(b.rekon.hasil);
  b.status=st;b.histori=(b.histori||[]).concat([{t:new Date().toISOString(),by:_currentUser?.email||'',s:st}]);
  const ix=_kp.doc.batches_idx.find(x=>x.id===b.id);if(ix)ix.status=st;
  try{await db.collection('sims').doc('kopra_b_'+b.id).set(b);await _kSaveDoc();}
  catch(e){showToast('Lunas dicatat di SIMS, tapi gagal menyimpan ke batch: '+e.message,true);}
  addLog('rekon_kopra','Rekonsiliasi lunas dari Kopra','kopra',b.id,b.file,'baris '+row+' → '+c.no);
  if(_kp.batch&&_kp.batch.id===b.id){_kp.batch=b;_kp.rekon=null;}
  _kp.sibuk=Date.now();_kTutupTawaran();showToast(c.no+' dicatat lunas.');
  if(_currentPage==='kopra')renderKopra();
}
async function kopraAbaikanMenunggu(batchId,row){
  if(!_kSiap())return;
  const alasan=prompt('Abaikan baris '+row+' — tidak akan dicatat lunas di SIMS. Alasannya?','Bukan pembelian ber-invoice');
  if(alasan===null)return;
  let b;try{b=(await db.collection('sims').doc('kopra_b_'+batchId).get()).data();}catch(e){showToast(e.message,true);return;}
  b.rekon.hasil=b.rekon.hasil.map(x=>x.row===row&&x.hasil==='menunggu'?Object.assign({},x,{hasil:'diabaikan',catatan:alasan}):x);
  await _kLoadDoc();_kSyncMenunggu(b);
  const st=_kStatusRekon(b.rekon.hasil);b.status=st;
  const ix=_kp.doc.batches_idx.find(x=>x.id===b.id);if(ix)ix.status=st;
  try{await db.collection('sims').doc('kopra_b_'+b.id).set(b);await _kSaveDoc();}catch(e){showToast('Gagal simpan: '+e.message,true);return;}
  addLog('kopra_abaikan','Abaikan transfer menunggu invoice','kopra',b.id,b.file,'baris '+row+' · '+alasan);
  if(_kp.batch&&_kp.batch.id===b.id){_kp.batch=b;_kp.rekon=null;}
  _kTutupTawaran();renderKopra();
}

// ----- Daftar transfer menunggu invoice -----
function _kHtmlMenunggu(){
  const list=[...(_kp.doc.menunggu||[])].sort((a,b)=>(a.tgl||'').localeCompare(b.tgl||'')||a.row-b.row);
  if(!list.length)return '';
  const S=_kSet();const hari=t=>Math.max(0,Math.round((new Date(today())-new Date(t))/864e5));
  return `<div class="card" style="border-color:var(--wb)"><div class="ct">Transfer menunggu invoice (${list.length})</div>
    <div style="font-size:12px;color:var(--t2);margin-bottom:8px">Sudah ditransfer lewat Kopra, tapi invoicenya belum ada di SIMS. Begitu invoice yang cocok disimpan, SIMS menawarkan untuk mencatatnya.</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Transfer</th><th>Penerima</th><th>Keterangan</th><th style="text-align:right">Nominal</th><th>Invoice di SIMS</th><th></th></tr></thead><tbody>
    ${list.map(m=>{const k=_kKandidat(m,m.tgl);const ok=k.cands.filter(c=>c.state==='siap'||c.state==='beda');
      const sel=ok.length?`<select id="km-${_ke(m.b)}-${m.row}" style="font-size:12px;max-width:230px">${ok.map(c=>`<option value="${_ke(c.id)}">${_ke(c.label)}${c.state==='beda'?' — nominal beda':''}</option>`).join('')}</select>`:'<span style="font-size:11px;color:var(--t3)">belum ada</span>';
      return `<tr><td style="white-space:nowrap">${_kFmtTgl(m.tgl)}<div style="font-size:10px;color:var(--t3)">baris ${m.row} · ${hari(m.tgl)} hari</div></td><td>${_ke(m.nama)}</td><td class="txt-cell" style="max-width:200px">${_ke(m.ket)}</td><td class="num-cell">${_kFmtNum(m.nominal)}</td><td>${sel}</td>
        <td><div class="bg" style="flex-wrap:nowrap">${ok.length?`<button class="btn bxs bp" ${S.rekon_mode==='catat'?'':'disabled'} onclick="kopraCatatMenunggu('${_ke(m.b)}',${m.row},document.getElementById('km-${_ke(m.b)}-${m.row}').value)">Catat</button>`:''}<button class="btn bxs" onclick="kopraBukaBatch('${_ke(m.b)}')">Batch</button><button class="btn bxs" onclick="kopraAbaikanMenunggu('${_ke(m.b)}',${m.row})">Abaikan</button></div></td></tr>`;}).join('')}
    </tbody></table></div></div>`;
}

// Baris menunggu yang ternyata sudah dicatat di luar Export Kopra (mis. lewat
// tombol Bayar/Konversi biasa) → tutup otomatis. Hanya menulis dokumen Kopra
// dan log; data invoice tidak diubah.
async function _kBersihkanMenunggu(){
  if(!_kp.doc||!(_kp.doc.menunggu||[]).length||!_kIsOwner())return 0;
  if(typeof _dataLoaded!=='undefined'&&!_dataLoaded)return 0;
  if(_kp.bersih)return 0; // cegah dua render berjalan bersamaan mencatat dua kali
  _kp.bersih=true;try{return await _kBersihkanMenungguInti();}finally{_kp.bersih=false;}
}
async function _kBersihkanMenungguInti(){
  const perBatch={};
  _kp.doc.menunggu.forEach(m=>{const c=_kKandidat(m,m.tgl).cands.find(x=>x.state==='sudah');if(c)(perBatch[m.b]=perBatch[m.b]||[]).push({row:m.row,c});});
  let n=0;
  for(const bid of Object.keys(perBatch)){
    const b=(await db.collection('sims').doc('kopra_b_'+bid).get()).data();if(!b||!b.rekon)continue;
    perBatch[bid].forEach(({row,c})=>{
      b.rekon.hasil=b.rekon.hasil.map(h=>h.row===row&&h.hasil==='menunggu'?Object.assign({},h,{hasil:'sudah',inv:c.no,inv_id:c.id,po_id:c.po_id,catatan:'dicatat di luar Export Kopra'}):h);
      addLog('rekon_kopra','Rekonsiliasi lunas dari Kopra','kopra',b.id,b.file,'baris '+row+' → '+c.no+' (sudah dicatat manual)');n++;
    });
    b.status=_kStatusRekon(b.rekon.hasil);
    const ix=_kp.doc.batches_idx.find(x=>x.id===b.id);if(ix)ix.status=b.status;
    await db.collection('sims').doc('kopra_b_'+b.id).set(b);
    _kSyncMenunggu(b);
    if(_kp.batch&&_kp.batch.id===b.id){_kp.batch=b;_kp.rekon=null;}
  }
  if(n)await _kSaveDoc();
  return n;
}

// ----- Tawaran saat invoice disimpan -----
// Dipanggil dari saveData (js/data.js) setiap invv/invd berubah. Ringan: hanya
// membaca sims/kopra sekali per sesi (untuk pemilik) lalu mencocokkan di memori.
let _kTawaranTimer=null;
function kopraCekMenungguNanti(){clearTimeout(_kTawaranTimer);_kTawaranTimer=setTimeout(_kCekMenunggu,1500);}
async function _kCekMenunggu(){
  if(!_currentUser||typeof _dataLoaded==='undefined'||!_dataLoaded)return;
  if(_kp.sibuk&&Date.now()-_kp.sibuk<5000)return;
  try{if(!_kp.doc)await _kLoadDoc();}catch(e){return;}
  if(!_kIsOwner())return;
  await _kMigrasiMenunggu();
  try{await _kBersihkanMenunggu();}catch(e){console.warn('[Kopra] bersihkan menunggu:',e);}
  const tolak=_kp.tawaranTolak||(_kp.tawaranTolak=new Set());
  for(const m of (_kp.doc.menunggu||[])){
    const c=_kKandidat(m,m.tgl).cands.find(x=>x.state==='siap'&&!tolak.has(m.b+':'+m.row+':'+x.id));
    if(c){_kTampilTawaran(m,c);return;}
  }
}
function _kTampilTawaran(m,c){
  _kTutupTawaran();const S=_kSet();
  const el=document.createElement('div');el.id='kopra-tawaran';
  el.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;max-width:420px;background:var(--sf);border:1px solid var(--wb);border-radius:var(--rl);box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px 14px;font-size:13px';
  el.innerHTML=`<div style="font-weight:600;margin-bottom:4px">Transfer Kopra cocok dengan ${_ke(c.no)}</div>
    <div style="color:var(--t2);margin-bottom:8px">${_kFmtTgl(m.tgl)} baris ${m.row} · ${_ke(m.nama)} · ${_kFmtNum(m.nominal)}<br>${_ke(m.ket)}<br>Dicatat sebagai ${c.kind==='invd'?'Rekam terima':'pass-through'}, tanggal ${_kFmtTgl(m.tgl)}.</div>
    <div class="bg" style="justify-content:flex-end">${S.rekon_mode==='catat'?`<button class="btn bp bsm" onclick="kopraCatatMenunggu('${_ke(m.b)}',${m.row},'${_ke(c.id)}')">Catat lunas</button>`:`<button class="btn bsm" onclick="_kTutupTawaran();nav('kopra')">Buka Export Kopra</button>`}
    <button class="btn bsm" onclick="(_kp.tawaranTolak=_kp.tawaranTolak||new Set()).add('${_ke(m.b)}:${m.row}:${_ke(c.id)}');_kTutupTawaran()">Nanti</button></div>`;
  document.body.appendChild(el);
}
function _kTutupTawaran(){const el=document.getElementById('kopra-tawaran');if(el)el.remove();}
// Sekali jalan: batch lama yang hasilnya "dilewati" untuk baris pembelian → "menunggu"
async function _kMigrasiMenunggu(){
  if(!_kp.doc||_kp.doc.menunggu_v1)return;
  for(const bi of _kp.doc.batches_idx||[]){
    if(bi.status!==KOPRA_STATUS.rekon)continue;
    const b=(await db.collection('sims').doc('kopra_b_'+bi.id).get()).data();
    if(!b||!b.rekon)continue;
    let ubah=false;
    b.rekon.hasil=b.rekon.hasil.map(h=>{
      if(h.hasil!=='dilewati'&&!/^gagal/.test(h.hasil||''))return h;
      if(h.cara==='ops')return h;
      const r=b.rows.find(x=>x.row===h.row)||{};ubah=true;
      return Object.assign({},h,{nama:h.nama||r.nama,kategori:h.kategori||r.kategori,hasil:'menunggu'});
    });
    if(!ubah)continue;
    b.status=_kStatusRekon(b.rekon.hasil);bi.status=b.status;
    await db.collection('sims').doc('kopra_b_'+b.id).set(b);
    _kSyncMenunggu(b);
  }
  _kp.doc.menunggu=_kp.doc.menunggu||[];_kp.doc.menunggu_v1=true;
  await _kSaveDoc();
}
function _kHtmlRekonHasil(rk){
  const poIds=[...new Set(rk.hasil.map(h=>h.po_id).filter(Boolean))];
  const belum=getInvV().filter(v=>poIds.includes(v.po_id)&&v.bayar_status!=='lunas');
  return `<div class="card"><div class="ct">6 · Rekonsiliasi lunas di SIMS</div>
    <div style="font-size:12px;color:var(--t3);margin-bottom:6px">Dicatat ${_ke(_kWaktu(rk.at))} oleh ${_ke(rk.by||'')}</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Baris</th><th>Sheet</th><th style="text-align:right">Nominal</th><th>SIMS</th><th>Cara</th><th>Hasil</th></tr></thead><tbody>
    ${rk.hasil.map(h=>`<tr><td>${h.row}</td><td class="txt-cell" style="max-width:220px">${_ke(h.ket)}</td><td class="num-cell">${_kFmtNum(h.nominal)}</td><td>${_ke(h.inv||'—')}</td><td style="font-size:11px">${h.cara==='terima'?'Rekam terima':h.cara==='pt'?'Pass-through':h.cara==='ops'?'Operasional':'—'}</td>
      <td style="font-size:11px;color:${h.hasil==='dicatat'?'var(--ac)':h.hasil==='menunggu'?'var(--wt)':/^gagal/.test(h.hasil)?'var(--dn)':'var(--t3)'}">${h.hasil==='menunggu'?'menunggu invoice':_ke(h.hasil)}${h.catatan?`<div style="color:var(--t3)">${_ke(h.catatan)}</div>`:''}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="ct" style="margin-top:12px">Invoice vendor di PO yang sama yang belum dibayar</div>
    ${belum.length?belum.map(v=>`<div style="font-size:12px;padding:2px 0">${_ke(v.no)} · ${_ke(v.vendor)} · ${fmtF(invVNet(v).sisa)}</div>`).join(''):'<div style="font-size:12px;color:var(--ac)">Tidak ada — semua sudah lunas.</div>'}
    ${rk.hasil.some(h=>h.hasil==='menunggu')?'<div style="font-size:12px;color:var(--wt);margin-top:8px">Baris "menunggu invoice" bisa dicatat dari daftar <b>Transfer menunggu invoice</b> di halaman utama Export Kopra, atau otomatis ditawarkan saat invoicenya disimpan.</div>':''}
    <div style="text-align:right;margin-top:8px"><button class="btn bxs" onclick="_kp.batch.rekon=null;_kp.rekon=null;renderKopra()">Rekonsiliasi lagi</button></div>
  </div>`;
}
