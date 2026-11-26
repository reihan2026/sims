// ===== BACA INVOICE TANPA AI =====
// Tombol "Baca (tanpa AI)" di form Invoice Vendor. Semua berjalan di browser,
// file invoice tidak dikirim ke mana pun:
//   - PDF berisi teks (invoice dari sistem vendor) → pdf.js, akurat
//   - Foto / PDF hasil scan → OCR Tesseract.js (bahasa ind+eng), angka umumnya
//     terbaca, nama item sering rusak → dicocokkan ke PO lewat qty & harga
// Hasilnya masuk ke layar preview yang sama dengan Scan AI (_showScanPreview
// di js/scan.js) supaya bisa dikoreksi sebelum "Apply ke form".
// Library dimuat hanya saat tombol dipakai (bukan saat halaman dibuka).

const _BI_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const _BI_PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const _BI_TESS='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const _biScripts={};
function _biLoadScript(src){
  if(_biScripts[src])return _biScripts[src];
  _biScripts[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>{delete _biScripts[src];rej(new Error('Gagal memuat '+src.split('/').slice(-1)[0]+' — cek koneksi internet'));};document.head.appendChild(s);});
  return _biScripts[src];
}
async function _biPdfjs(){
  await _biLoadScript(_BI_PDFJS);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=_BI_PDFJS_WORKER;
  return window.pdfjsLib;
}

// ----- Parser (tanpa DOM — diuji di node) -----
const _BI_BULAN={jan:1,januari:1,january:1,feb:2,februari:2,february:2,mar:3,maret:3,march:3,apr:4,april:4,mei:5,may:5,jun:6,juni:6,june:6,jul:7,juli:7,july:7,agu:8,agt:8,ags:8,aug:8,agustus:8,august:8,sep:9,sept:9,september:9,okt:10,oct:10,oktober:10,october:10,nov:11,november:11,des:12,dec:12,desember:12,december:12};
// "17.276.000" / "17,276,000" / "34000" / "Rp1.597.000" → angka bulat; "1,5" / "0.5" → desimal (qty)
function _biNum(tok){
  let t=String(tok||'').replace(/^rp\.?/i,'').replace(/[^\d.,]/g,'').replace(/^[.,]+|[.,]+$/g,'');
  if(!t)return NaN;
  if(/^\d{1,3}([.,]\d{3})+$/.test(t))return parseInt(t.replace(/[.,]/g,''),10);
  if(/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t))return parseFloat(t.replace(/\./g,'').replace(',','.'));
  if(/^\d+$/.test(t))return parseInt(t,10);
  if(/^\d+[.,]\d{1,2}$/.test(t))return parseFloat(t.replace(',','.'));
  return NaN;
}
function _biBersih(l){return String(l||'').replace(/[|[\]{}]/g,' ').replace(/[—–]/g,' ').replace(/\s+/g,' ').trim();}
function _biTgl(teks){
  const s=String(teks);
  let m=s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const B='(jan(?:uari|uary)?|feb(?:ruari|ruary)?|mar(?:et|ch)?|apr(?:il)?|mei|may|jun[ei]?|jul[iy]?|agu(?:stus)?|agt|ags|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|des(?:ember)?|dec(?:ember)?)';
  m=s.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-]+'+B+'\\.?[\\s\\-,]+(\\d{4})\\b','i'));
  if(m)return `${m[3]}-${String(_BI_BULAN[m[2].toLowerCase()]||_BI_BULAN[m[2].toLowerCase().slice(0,3)]).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(new RegExp('\\b'+B+'\\.?,?\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b','i'));
  if(m)return `${m[3]}-${String(_BI_BULAN[m[1].toLowerCase()]||_BI_BULAN[m[1].toLowerCase().slice(0,3)]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return null;
}
// Satu baris item: [no] nama qty [satuan] harga jumlah — dicek qty × harga = jumlah
function _biBarisItem(line){
  const t=_biBersih(line).split(' ').filter(x=>x&&!/^rp\.?$/i.test(x));
  if(t.length<4)return null;
  const jumlah=_biNum(t[t.length-1]),harga=_biNum(t[t.length-2]);
  if(!(jumlah>0)||!(harga>0))return null;
  let i=t.length-3,satuan='';
  let qty=_biNum(t[i]);
  if(isNaN(qty)){ // satuan terpisah: "60 kg"
    if(/^[a-zA-Z.]{1,10}$/.test(t[i])){satuan=t[i].replace(/\.$/,'');i--;qty=_biNum(t[i]);}
    else{const g=t[i].match(/^(\d+(?:[.,]\d+)?)([a-zA-Z]{1,8})$/);if(g){qty=_biNum(g[1]);satuan=g[2];}} // "60kg"
  }
  if(!(qty>0))return null;
  let nama=t.slice(0,i).join(' ');
  // Bersihkan sisa OCR: tanda baca/nomor urut di depan, potongan 1–2 huruf di belakang ("Wortel RE")
  nama=nama.replace(/^[^A-Za-z0-9]+/,'').replace(/^\d{1,3}[.)]?\s+/,'').replace(/^[^A-Za-z0-9]+/,'');
  for(let k=0;k<4;k++)nama=nama.replace(/[^A-Za-z0-9)%]+$/,'').replace(/\s+[A-Za-z]{1,2}$/,'').trim();
  if(!nama||!/[a-zA-Z]{2,}/.test(nama))return null;
  if(/\b(sub\s*total|total|ppn|pajak|diskon|discount|ongkir|ongkos|dp|bayar|sisa|telp|telepon|hp|rekening|no\.?\s*rek)\b/i.test(nama))return null;
  const pas=(h,j)=>Math.abs(qty*h-j)<=Math.max(1,j*0.005);
  let h=harga,j=jumlah;
  if(!pas(h,j)){
    // Garis tabel sering terbaca sebagai angka "1" di belakang angka ("17000|" → "170001").
    // Coba buang satu digit 1 di belakang harga/jumlah — tetap wajib lolos qty × harga = jumlah.
    const buang1=n=>/1$/.test(String(n))&&n>=10?Math.floor(n/10):null;
    const hb=buang1(h),jb=buang1(j);
    if(hb&&pas(hb,j))h=hb;else if(jb&&pas(h,jb))j=jb;else if(hb&&jb&&pas(hb,jb)){h=hb;j=jb;}else return null;
  }
  return{nama,qty,satuan:satuan||'',harga_vendor:h,jumlah:j};
}
function _biParse(lines){
  const L=lines.map(l=>String(l||'')).filter(l=>l.trim());
  const items=[];L.forEach(l=>{const it=_biBarisItem(l);if(it)items.push(it);});
  const sum=items.reduce((s,x)=>s+x.jumlah,0);
  // Total: "Grand Total" > "Total" > "Subtotal"; kalau tidak terbaca, baris yang angka terakhirnya = jumlah item
  let total=null,prio=-1;
  L.forEach(l=>{
    const c=_biBersih(l);const nums=c.split(' ').map(_biNum).filter(n=>n>0);if(!nums.length)return;
    const p=/grand\s*total/i.test(c)?3:/\btotal\b/i.test(c)&&!/sub\s*total/i.test(c)?2:/sub\s*total/i.test(c)?1:-1;
    if(p>prio){prio=p;total=nums[nums.length-1];}
  });
  if(total==null&&sum>0&&L.some(l=>{const n=_biBersih(l).split(' ').map(_biNum).filter(x=>x>0);return n.length&&n[n.length-1]===sum;}))total=sum;
  let tgl=null;for(const l of L){tgl=_biTgl(l);if(tgl)break;}
  let no=null;for(const l of L){const m=l.match(/(?:invoice\s*no\.?|no\.?\s*invoice|nomor|no\.?\s*faktur|faktur\s*no\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-_.]{2,})/i);if(m){no=m[1].replace(/[.,]$/,'');break;}}
  return{items,total,sum,tgl,no,lines:L};
}
if(typeof module!=='undefined')module.exports={_biNum,_biBarisItem,_biParse,_biTgl};

// ----- Membaca file -----
// PDF: baris teks dikelompokkan per posisi vertikal, kata diurutkan dari kiri
async function _biPdfTeks(file){
  const pdfjs=await _biPdfjs();
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const lines=[];let chars=0;
  for(let p=1;p<=Math.min(doc.numPages,5);p++){
    const pg=await doc.getPage(p);const tc=await pg.getTextContent();
    const rows=[];
    tc.items.forEach(it=>{const s=(it.str||'').trim();if(!s)return;chars+=s.length;
      const y=it.transform[5],x=it.transform[4];
      let r=rows.find(r=>Math.abs(r.y-y)<=3);if(!r){r={y,t:[]};rows.push(r);}r.t.push([x,s]);});
    rows.sort((a,b)=>b.y-a.y).forEach(r=>lines.push(r.t.sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' ')));
  }
  return{doc,lines,adaTeks:chars>=30};
}
async function _biOcr(sumber,progres){
  await _biLoadScript(_BI_TESS);
  const w=await window.Tesseract.createWorker('ind+eng',1,{logger:m=>{if(m.status==='recognizing text'&&progres)progres(Math.round(m.progress*100));}});
  try{const {data}=await w.recognize(sumber);return data.text.split('\n');}
  finally{await w.terminate();}
}
// Hitam-putih + hapus garis tabel panjang. Garis tabel membuat Tesseract salah
// memotong baris (uji invoice TM Kaya: tanpa ini item terbaca acak-acakan).
function _biPrep(c){
  const ctx=c.getContext('2d');const W=c.width,H=c.height;const im=ctx.getImageData(0,0,W,H);const d=im.data;
  const bw=new Uint8Array(W*H);
  for(let i=0,p=0;i<d.length;i+=4,p++){bw[p]=(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<150?1:0;}
  const hMin=Math.round(W*0.06),vMin=Math.round(W*0.025);const kill=new Uint8Array(W*H);
  for(let y=0;y<H;y++){let s=-1;for(let x=0;x<=W;x++){const on=x<W&&bw[y*W+x];if(on&&s<0)s=x;if(!on&&s>=0){if(x-s>=hMin)for(let k=s;k<x;k++)kill[y*W+k]=1;s=-1;}}}
  for(let x=0;x<W;x++){let s=-1;for(let y=0;y<=H;y++){const on=y<H&&bw[y*W+x];if(on&&s<0)s=y;if(!on&&s>=0){if(y-s>=vMin)for(let k=s;k<y;k++)kill[k*W+x]=1;s=-1;}}}
  for(let p=0,i=0;p<W*H;p++,i+=4){const v=(bw[p]&&!kill[p])?0:255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
  ctx.putImageData(im,0,0);return c;
}
// Gambar sumber (halaman PDF atau file foto) ke kanvas selebar W piksel
async function _biKanvas(sumber,W){
  const c=document.createElement('canvas');
  if(sumber.doc){
    const pg=await sumber.doc.getPage(sumber.page);const vp0=pg.getViewport({scale:1});const vp=pg.getViewport({scale:W/vp0.width});
    c.width=Math.round(vp.width);c.height=Math.round(vp.height);
    await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
  } else {
    const img=await createImageBitmap(sumber.file);const k=W/img.width;
    c.width=W;c.height=Math.round(img.height*k);const ctx=c.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
  }
  return c;
}
// Coba beberapa ukuran/praproses; berhenti begitu jumlah baris = total invoice
async function _biOcrTerbaik(sumber,set){
  const varian=[{W:1400,prep:true},{W:1600,prep:true},{W:1400,prep:false}];
  let best=null,bestSkor=-1;
  for(let v=0;v<varian.length;v++){
    const c=await _biKanvas(sumber,varian[v].W);if(varian[v].prep)_biPrep(c);
    const lines=await _biOcr(c,x=>set('OCR '+(v+1)+'/'+varian.length+' · '+x+'%'));
    const P=_biParse(lines);const valid=P.items.length&&P.total!=null&&P.total===P.sum;
    const skor=(valid?1000:0)+P.items.length;
    if(skor>bestSkor){bestSkor=skor;best=lines;}
    if(valid)break;
  }
  return best||[];
}

function triggerBacaInvoice(){
  const input=document.createElement('input');input.type='file';input.accept='image/*,.pdf';
  input.onchange=async e=>{const f=e.target.files[0];if(f)await _biBaca(f);};
  input.click();
}
async function _biBaca(file){
  const btn=document.getElementById('baca-inv-btn');const set=t=>{if(btn)btn.textContent=t;};
  if(btn)btn.disabled=true;
  try{
    let lines,sumber;
    const isPdf=/pdf$/i.test(file.type)||/\.pdf$/i.test(file.name);
    if(isPdf){
      set('Membaca PDF…');
      const r=await _biPdfTeks(file);
      if(r.adaTeks){lines=r.lines;sumber='pdf';}
      else{
        set('OCR…');lines=[];
        for(let p=1;p<=Math.min(r.doc.numPages,3);p++)lines=lines.concat(await _biOcrTerbaik({doc:r.doc,page:p},set));
        sumber='ocr';
      }
    } else {set('OCR…');lines=await _biOcrTerbaik({file},set);sumber='ocr';}
    const P=_biParse(lines);
    const vendor=_biTebakVendor(P);
    if(!P.items.length){
      showToast(sumber==='ocr'?'Tidak ada baris item yang terbaca dari gambar — isi manual atau pakai Scan AI.':'Tidak ada baris item yang dikenali di PDF ini — isi manual.',true);
      return;
    }
    try{const dt=new DataTransfer();dt.items.add(file);document.getElementById('invv-file').files=dt.files;}catch(e){}
    _showScanPreview({vendor,tgl:P.tgl,total:P.total!=null?P.total:P.sum,items:P.items});
    _scanMeta.no=P.no;_scanMeta.sumber=sumber;
    if(vendor)document.getElementById('scan-vendor').value=vendor;
    _biInfoPreview(P,sumber);
  }catch(e){showToast('Gagal membaca invoice: '+e.message,true);}
  finally{if(btn){btn.disabled=false;btn.textContent='Baca (tanpa AI)';}}
}
// Vendor, urut dari yang paling bisa dipercaya:
// 1. nama pemilik rekening di invoice ("a/n Unggul Pamungkas") → aturan penerima Kopra
// 2. nominal sama dengan tepat satu transfer Kopra yang menunggu → aturan penerimanya
// 3. kepala invoice — baris alamat tujuan (Kepada/SPPG/Jl.) diabaikan, karena
//    "Kebayoran Lama" di alamat SPPG sempat tertebak jadi vendor "Pasar Kebayoran Lama"
function _biTebakVendor(P){
  const master=(getMaster()?.vendor||[]).map(v=>v.nama).filter(Boolean);
  const dariAturan=frag=>{if(!frag)return '';const f=String(frag).toLowerCase();const c=master.filter(v=>v.toLowerCase().includes(f));return c.length===1?c[0]:'';};
  const rules=(typeof _kSet==='function'&&typeof _kp!=='undefined'&&_kp.doc)?(_kSet().rules||[]):[];
  const teks=P.lines.join(' ').toLowerCase().replace(/\s+/g,' ');
  for(const r of rules){if(r.cara==='pt'&&r.penerima&&teks.includes(r.penerima.toLowerCase())){const v=dariAturan(r.vendor);if(v)return v;}}
  try{
    const tot=P.total!=null?P.total:P.sum;
    const m=((_kp&&_kp.doc&&_kp.doc.menunggu)||[]).filter(x=>x.nominal===tot);
    if(m.length===1){const r=_kRule(m[0].nama);if(r&&r.cara==='pt'){const v=dariAturan(r.vendor);if(v)return v;}}
  }catch(e){}
  const tujuan=/kepada|yth|sppg|dapur|jl\.|jalan|ciputat|rt\s*\d|kel\.|kec\.|kota|jakarta/i;
  for(const l of P.lines.slice(0,15)){if(tujuan.test(l))continue;const v=_matchVendor(_biBersih(l));if(v)return v;}
  return '';
}

// Keterangan tambahan di preview: sumber baca, no. invoice vendor, transfer Kopra yang cocok
function _biInfoPreview(P,sumber){
  const body=document.querySelector('#modal-scan-preview .mb');if(!body)return;
  let el=document.getElementById('scan-info-tanpa-ai');
  if(!el){el=document.createElement('div');el.id='scan-info-tanpa-ai';el.style.cssText='font-size:12px;margin-bottom:10px;padding:8px 10px;border-radius:var(--r);background:var(--s2)';body.insertBefore(el,body.children[1]);}
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const parts=[];
  parts.push(sumber==='pdf'?'Dibaca dari teks PDF (tanpa AI).':'Dibaca dengan OCR (tanpa AI) — <b>periksa nama item</b>; angka sudah dicek qty × harga = jumlah.');
  if(P.no)parts.push('No. invoice vendor: <b>'+esc(P.no)+'</b> (diisi ke catatan).');
  if(P.total!=null&&P.total!==P.sum)parts.push('<span style="color:var(--dn)">Total invoice '+fmtF(P.total)+' ≠ jumlah baris terbaca '+fmtF(P.sum)+' — ada baris yang tidak terbaca.</span>');
  try{
    if(typeof _kp!=='undefined'&&_kp.doc&&typeof _kIsOwner==='function'&&_kIsOwner()){
      const tot=P.total!=null?P.total:P.sum;
      const m=(_kp.doc.menunggu||[]).filter(x=>x.nominal===tot);
      m.forEach(x=>parts.push('<span style="color:var(--ac)">Cocok dengan transfer Kopra '+esc(_kFmtTgl(x.tgl))+' baris '+x.row+' ('+esc(x.nama)+', '+esc(_kFmtNum(x.nominal))+') — setelah disimpan, SIMS menawarkan catat lunas.</span>'));
    }
  }catch(e){}
  el.innerHTML=parts.join('<br>');el.style.display='';
}
// Scan AI tidak memakai kotak info ini — sembunyikan saat preview dibuka dari sana
function _biSembunyikanInfo(){const el=document.getElementById('scan-info-tanpa-ai');if(el)el.style.display='none';}

// PO otomatis: kalau form belum memilih PO, pilih PO terbaru yang punya item
// vendor ini dan belum ber-invoice. Dipanggil dari applyScanToForm.
function _biPilihPOOtomatis(vendor){
  if(!vendor)return false;
  const n=s=>String(s||'').trim().toLowerCase();
  const pos=getPOs().filter(p=>(p.items||[]).some(i=>n(i.vendor)===n(vendor)))
    .sort((a,b)=>String(b.tgl||b.created||'').localeCompare(String(a.tgl||a.created||'')));
  if(!pos.length)return false;
  const sel=document.getElementById('invv-po');if(!sel)return false;
  sel.value=pos[0].id;
  document.getElementById('invv-vendor').value=vendor;
  loadInvVItems();
  return !!document.querySelector('.invv-cb');
}
