// ===== DOKUMEN BGN HARIAN =====
// 4 dokumen BGN per hari (SPM Bahan Baku, SPM Operasional, Kuitansi insentif,
// LPDH) diupload tim keuangan dapur → dicocokkan dengan transfer Kopra hari
// itu → pemilik approve → tanda tangan (gambar) dipasang di keempat PDF →
// tim dapur mengunduh hasilnya.
//
// Penyimpanan (semua di luar sims/data — PDF tidak pernah masuk _cache):
// Semua di koleksi yang sudah diizinkan Firestore rules saat ini (sims, sims_files):
//   sims/bgn_cfg           — owner_uid, dapur_emails, settings
//   sims/bgn_idx           — ringkasan per hari {hari:{tgl:{status,n,nx,saldo,topup}}}
//   sims/bgn_h_YYYYMMDD    — satu dokumen per hari: acuan (salinan transfer Kopra
//                            hari itu saja), docs (metadata + hasil baca), status,
//                            signed, approved, tolak, histori
//   sims_files/bgn_<key>_<i> — isi PDF base64, dipecah per ~700 KB
//   sims/bgn_ttd_<uid>     — gambar tanda tangan (rules: hanya pemiliknya)
// Akun tim dapur (email di dapur_emails) hanya melihat halaman ini dan tidak
// memuat sims/data. Penegakan sebenarnya lewat Firestore rules — teksnya dibuat
// di kartu Setting halaman ini.

// ----- Konstanta -----
const BGN_JENIS=['spm_bb','spm_ops','kuitansi','lpdh'];
const BGN_LABEL={spm_bb:'SPM Bahan Baku',spm_ops:'SPM Operasional',kuitansi:'Kuitansi Insentif',lpdh:'LPDH'};
const BGN_KEL={bb:'bahan baku',ops:'operasional',ins:'Insentif Fasilitas'};
const BGN_KEL_DOK={bb:'spm_bb',ops:'spm_ops',ins:'kuitansi'};
const BGN_STATUS={tunggu:'Menunggu dokumen',acuan:'Menunggu data transfer',selisih:'Ada selisih',siap:'Siap disetujui',tolak:'Ditolak',ok:'Disetujui'};
const BGN_DEFAULT={nama_ttd:'Reihan Putra Utama',tarif_insentif:2000,ttd_lebar:1.6,ttd_turun:0.35,dapur_emails:[]};
const BGN_CDN={
  pdfjs:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  worker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  pdflib:'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
};
const BGN_CHUNK=700*1024;          // karakter base64 per dokumen Firestore
const BGN_MAX_FILE=2*1024*1024;    // ukuran PDF maksimal (byte)
const _B_BULAN={januari:1,jan:1,februari:2,feb:2,maret:3,mar:3,april:4,apr:4,mei:5,juni:6,jun:6,juli:7,jul:7,agustus:8,agu:8,agt:8,september:9,sep:9,oktober:10,okt:10,november:11,nov:11,desember:12,des:12,
  may:5,june:6,july:7,august:8,october:10,oct:10,december:12,dec:12};
const _B_MON=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

// ----- Utilitas murni (tanpa DOM / Firestore) -----
function _be(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function _bN(s){return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();}
// "Rp5.050.000,00" / "25.744.000" / "1.475.550" → angka bulat rupiah
function _bNum(s){
  const t=String(s==null?'':s).replace(/rp/ig,'').replace(/\s/g,'');
  const m=t.match(/^-?[\d.]+(,\d{1,2})?$/);if(!m)return NaN;
  return parseInt(t.split(',')[0].replace(/\./g,''),10);
}
function _bRp(n){return isNaN(n)||n==null?'?':'Rp'+Math.round(n).toLocaleString('id-ID');}
function _bFmtTgl(iso){if(!iso)return '—';const [y,m,d]=iso.split('-');return parseInt(d,10)+' '+_B_MON[parseInt(m,10)-1]+' '+y;}
function _bIso(y,m,d){return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
// "27 November 2026" | "27-11-2026" | "27/11/2026" → ISO
function _bTgl(s){
  s=String(s||'');let m=s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if(m&&_B_BULAN[m[2].toLowerCase()])return _bIso(m[3],_B_BULAN[m[2].toLowerCase()],m[1]);
  m=s.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if(m)return _bIso(m[3],m[2],m[1]);
  return null;
}
function _bRek(s){return String(s||'').replace(/[\s.\-]/g,'');}
// Nama dianggap sama kalau token pentingnya (tanpa PT/CV/UD/titik) sama atau saling memuat
function _bNamaMirip(a,b){
  const t=s=>_bN(s).replace(/[^a-z0-9 ]/g,' ').split(' ').filter(w=>w&&!['pt','cv','ud','tbk','bapak','ibu'].includes(w));
  const A=t(a),B=t(b);if(!A.length||!B.length)return false;
  const ja=A.join(' '),jb=B.join(' ');if(ja===jb||ja.includes(jb)||jb.includes(ja))return true;
  const sa=new Set(A),hit=B.filter(w=>sa.has(w)).length;
  return hit/Math.max(A.length,B.length)>=0.6;
}
function _bBankMirip(a,b){const f=s=>_bN(s).replace(/\bbank\b/g,'').replace(/[^a-z]/g,'');const x=f(a),y=f(b);return !x||!y||x===y||x.includes(y)||y.includes(x);}
function _bTerbilang(n){
  const s=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  const t=x=>{
    if(x<12)return s[x];if(x<20)return t(x-10)+' belas';if(x<100)return t(Math.floor(x/10))+' puluh '+t(x%10);
    if(x<200)return 'seratus '+t(x-100);if(x<1000)return t(Math.floor(x/100))+' ratus '+t(x%100);
    if(x<2000)return 'seribu '+t(x-1000);if(x<1e6)return t(Math.floor(x/1000))+' ribu '+t(x%1000);
    if(x<1e9)return t(Math.floor(x/1e6))+' juta '+t(x%1e6);if(x<1e12)return t(Math.floor(x/1e9))+' miliar '+t(x%1e9);
    return String(x);
  };
  return (t(n)+' rupiah').replace(/\s+/g,' ').trim();
}

// Item teks pdf.js {p,s,x,y,w,h} → baris (kelompok y sama per halaman)
function _bLines(items){
  const out=[];const pages=[...new Set(items.map(i=>i.p))].sort((a,b)=>a-b);
  pages.forEach(p=>{
    const its=items.filter(i=>i.p===p).sort((a,b)=>b.y-a.y||a.x-b.x);
    let cur=null;
    its.forEach(i=>{if(cur&&Math.abs(cur.y-i.y)<=3)cur.items.push(i);else{cur={p,y:i.y,items:[i]};out.push(cur);}});
  });
  out.forEach(l=>{l.items.sort((a,b)=>a.x-b.x);l.text=l.items.map(i=>i.s.trim()).filter(Boolean).join(' ');});
  return out;
}
function _bTeks(items){return _bLines(items).map(l=>l.text).join('\n');}

// PDF yang disimpan ulang lewat Preview macOS memecah kata ("SURAT PERI" + "N" +
// "TAH"). Item yang bersambung tanpa jarak di baris yang sama digabung lagi.
function _bGabung(items){
  const s=[...items].sort((a,b)=>b.y-a.y||a.x-b.x);const out=[];
  s.forEach(i=>{const l=out[out.length-1];
    if(l&&Math.abs(l.y-i.y)<1&&i.x-(l.x+l.w)<1&&i.x-(l.x+l.w)>-2){l.s+=i.s;l.w=i.x+i.w-l.x;l.h=Math.max(l.h,i.h);}
    else out.push(Object.assign({},i));});
  return out;
}
// Jenis dokumen dari isinya (bukan dari nama file / slot)
function _bJenis(items){
  const T=_bTeks(items).toUpperCase().replace(/\s+/g,'');
  if(/LAPORANPENGGUNAANDANAHARIAN/.test(T))return 'lpdh';
  if(/KUITANSI/.test(T)&&/SUDAHTERIMA/.test(T))return 'kuitansi';
  if(/SURATPERINTAHMEMBAYAR/.test(T)){
    const P=_bParseSpm(items);
    const bb=P.rows.filter(r=>/bahan baku/i.test(r.uraian)).length;
    return P.rows.length&&bb*2>=P.rows.length?'spm_bb':'spm_ops';
  }
  return null;
}

// SPM: kolom ditentukan dari posisi header (No., Tanggal, Uraian, Bank, No.Rekening,
// Nama Pemilik, Jumlah); baris = satu nomor rekening; teks lain menempel ke
// rekening terdekat secara vertikal. Halaman lanjutan memakai kolom halaman 1.
function _bParseSpm(items){
  const lines=_bLines(items);const T=lines.map(l=>l.text).join('\n');
  const out={nomor:(T.match(/Nomor\s*:\s*(\S+)/i)||[])[1]||'',tgl:null,rows:[],total:null};
  const tm=T.match(/Jakarta,?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);if(tm)out.tgl=_bTgl(tm[1]);
  const hl=lines.find(l=>/uraian/i.test(l.text)&&/jumlah/i.test(l.text)&&/rekening/i.test(l.text));
  if(!hl)return out;
  const pick=re=>hl.items.find(i=>re.test(i.s.trim()));
  const H={no:pick(/^no\.?$/i),tgl:pick(/^tanggal$/i),uraian:pick(/^uraian/i),bank:pick(/^bank$/i),rek:pick(/rekening/i),nama:pick(/nama/i),jumlah:pick(/^jumlah$/i)};
  const cols=Object.keys(H).filter(k=>H[k]).map(k=>({k,c:H[k].x+H[k].w/2})).sort((a,b)=>a.c-b.c);
  if(!cols.find(c=>c.k==='rek')||!cols.find(c=>c.k==='jumlah'))return out;
  const colOf=i=>{const c=i.x+i.w/2;let best=cols[0];for(let j=0;j<cols.length;j++){const lo=j?(cols[j-1].c+cols[j].c)/2:-1e9;const hi=j<cols.length-1?(cols[j].c+cols[j+1].c)/2:1e9;if(c>=lo&&c<hi){best=cols[j];break;}}return best.k;};
  const totals={};items.forEach(i=>{if(/^total$/i.test(i.s.trim())&&!(totals[i.p]>i.y))totals[i.p]=i.y;});
  const inZone=i=>{
    if(i.p===hl.p&&i.y>=hl.y-2)return false;
    if(i.p<hl.p)return false;
    if(totals[i.p]!=null&&i.y<totals[i.p]-2)return false;
    return true;
  };
  const anchors=items.filter(i=>inZone(i)&&colOf(i)==='rek'&&/^\d[\d .\-]{4,}\d$/.test(i.s.trim())&&!(totals[i.p]!=null&&Math.abs(i.y-totals[i.p])<3));
  const rows=anchors.map(a=>({a,p:a.p,y:a.y,cells:{}}));
  items.forEach(i=>{
    if(!inZone(i)||anchors.includes(i))return;
    if(totals[i.p]!=null&&Math.abs(i.y-totals[i.p])<3)return;
    let best=null,bd=1e9;rows.forEach(r=>{if(r.p!==i.p)return;const d=Math.abs(r.y-i.y);if(d<bd){bd=d;best=r;}});
    if(!best||bd>40)return;
    const k=colOf(i);(best.cells[k]=best.cells[k]||[]).push(i);
  });
  // Sambungan uraian yang pendek ("78kg)") bisa jatuh di kolom Tanggal/No — pindahkan
  rows.forEach(r=>{['tgl','no'].forEach(k=>{const bad=(r.cells[k]||[]).filter(i=>!(k==='tgl'?/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/:/^\d{1,3}\.?$/).test(i.s.trim()));
    if(bad.length){r.cells[k]=r.cells[k].filter(i=>!bad.includes(i));r.cells.uraian=(r.cells.uraian||[]).concat(bad);}});});
  const txt=arr=>(arr||[]).sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.s.trim()).join(' ').replace(/\s+/g,' ').trim();
  out.rows=rows.sort((a,b)=>a.p-b.p||b.y-a.y).map(r=>({
    no:txt(r.cells.no),tanggal:txt(r.cells.tgl),tglIso:_bTgl(txt(r.cells.tgl)),uraian:txt(r.cells.uraian),bank:txt(r.cells.bank),
    rek:_bRek(r.a.s),nama:txt(r.cells.nama),jumlah:_bNum(txt(r.cells.jumlah))
  }));
  // Total: angka di kolom Jumlah sejajar kata "Total"
  Object.keys(totals).forEach(p=>{
    const v=items.filter(i=>i.p===+p&&Math.abs(i.y-totals[p])<4&&colOf(i)==='jumlah').map(i=>i.s.trim()).join('');
    if(v&&!isNaN(_bNum(v)))out.total=_bNum(v);
  });
  return out;
}
function _bParseKuitansi(items){
  const lines=_bLines(items);const T=lines.map(l=>l.text).join(' ').replace(/\s+/g,' ');
  const out={nomor:(T.match(/(\d+\/KUI\S*)/i)||[])[1]||'',jumlah:NaN,terbilang:'',pm:NaN,tgl:null,tgl_untuk:null,va:''};
  const j=T.match(/Rp\s*([\d.]+,\d{2})/);if(j)out.jumlah=_bNum(j[1]);
  const tb=lines.find(l=>/rupiah/i.test(l.text)&&!/rp\s*\d/i.test(l.text));
  if(tb)out.terbilang=tb.text.replace(/^.*?:\s*/,'').replace(/^uang sejumlah\s*/i,'').trim();
  const pm=T.match(/PM\s*([\d.]+)/);if(pm)out.pm=_bNum(pm[1]);
  const tg=T.match(/Jakarta,?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);if(tg)out.tgl=_bTgl(tg[1]);
  const un=T.match(/Untuk Pembayaran\s*:?\s*(.*?)(?:dengan PM|Jakarta,|$)/i);if(un)out.tgl_untuk=_bTgl(un[1]);
  const va=T.match(/VA\s+MANDIRI\D*(\d{8,})/i);if(va)out.va=va[1];
  return out;
}
function _bParseLpdh(items){
  const lines=_bLines(items);
  const out={tgl:null,pm:NaN,bb:NaN,ops:NaN,ins_hitung:NaN,ins_bayar:NaN,saldo:NaN,topup:NaN,periksa:'',id_sppg:''};
  const val=t=>{const m=t.match(/([\d.]+)\s*$/);return m?_bNum(m[1]):NaN;};
  lines.forEach(l=>{
    const t=l.text;
    if(/tanggal pelayanan/i.test(t)){const d=_bTgl(t);if(d)out.tgl=d;}
    else if(/penerima manfaat/i.test(t))out.pm=val(t);
    else if(/belanja bahan baku/i.test(t))out.bb=val(t);
    else if(/biaya operasional/i.test(t))out.ops=val(t);
    else if(/insentif dihitung/i.test(t))out.ins_hitung=val(t);
    else if(/insentif dibayarkan/i.test(t))out.ins_bayar=val(t);
    else if(/saldo akhir/i.test(t))out.saldo=val(t);
    else if(/usulan top ?up/i.test(t))out.topup=val(t);
    else if(/hasil daftar periksa/i.test(t))out.periksa=t.replace(/hasil daftar periksa\s*:?\s*/i,'').trim();
    else if(/ID SPPG/i.test(t))out.id_sppg=t.replace(/^.*?:\s*/,'').trim();
  });
  return out;
}
function _bParse(jenis,items){
  if(jenis==='spm_bb'||jenis==='spm_ops')return _bParseSpm(items);
  if(jenis==='kuitansi')return _bParseKuitansi(items);
  if(jenis==='lpdh')return _bParseLpdh(items);
  return null;
}
function _bTglDok(jenis,P){return P?(P.tgl||null):null;}
// Posisi nama penanda tangan: kemunculan TERAKHIR di dokumen (blok tanda tangan)
function _bPosNama(items,nama){
  const n=_bN(nama);let hit=null;
  items.forEach(i=>{if(_bN(i.s).includes(n)){if(!hit||i.p>hit.p||(i.p===hit.p&&i.y<hit.y))hit=i;}});
  if(!hit){
    // Nama terpecah jadi beberapa item — gabungkan per baris
    _bLines(items).forEach(l=>{if(_bN(l.text).includes(n)){
      const its=l.items;const x0=Math.min(...its.map(i=>i.x)),x1=Math.max(...its.map(i=>i.x+i.w));
      const c={p:l.p,s:l.text,x:x0,y:l.y,w:x1-x0,h:Math.max(...its.map(i=>i.h))};
      if(!hit||c.p>hit.p||(c.p===hit.p&&c.y<hit.y))hit=c;}});
  }
  return hit?{p:hit.p,x:hit.x,y:hit.y,w:hit.w,h:hit.h||10}:null;
}

// ----- Pencocokan -----
// acuan.rows: {ref,nama,bank,rek,nominal,ket,kategori,obu,kel:'bb'|'ops'|'ins'}
function _bCekSpm(P,acuan,kel,tgl){
  const out=[];const add=(lv,m)=>out.push({lv,m});
  if(!P||!P.rows||!P.rows.length){add('x','Tabel SPM tidak terbaca — upload PDF asli hasil "Save as PDF" dari Excel, bukan foto/scan.');return out;}
  if(P.tgl&&P.tgl!==tgl)add('w','Tanggal tanda tangan "Jakarta, '+_bFmtTgl(P.tgl)+'" — seharusnya '+_bFmtTgl(tgl)+'.');
  const rows=acuan.rows.map((r,i)=>Object.assign({},r,{i}));
  const exp=rows.filter(r=>r.kel===kel),lain=rows.filter(r=>r.kel!==kel);
  const used=new Set();const bebas=()=>exp.filter(e=>!used.has(e.i));
  P.rows.forEach((d,k)=>{
    const lbl='Baris '+(d.no||k+1)+' ('+(d.nama||'?')+', '+_bRp(d.jumlah)+')';
    const B=bebas();
    let m=B.find(e=>e.rek===d.rek&&e.nominal===d.jumlah)||B.find(e=>e.rek===d.rek)
      ||B.find(e=>e.nominal===d.jumlah&&_bNamaMirip(e.nama,d.nama))||B.find(e=>_bNamaMirip(e.nama,d.nama));
    if(!m){const sama=B.filter(e=>e.nominal===d.jumlah);if(sama.length===1)m=sama[0];}
    if(!m){
      const o=lain.find(e=>e.rek===d.rek&&e.nominal===d.jumlah)||lain.find(e=>e.nominal===d.jumlah&&_bNamaMirip(e.nama,d.nama));
      if(o)add('x',lbl+': ini transfer '+BGN_KEL[o.kel]+' — tulis di '+BGN_LABEL[BGN_KEL_DOK[o.kel]]+', bukan di sini.');
      else add('x',lbl+': tidak ada transfer Kopra ke rekening '+d.rek+' dengan nominal ini pada '+_bFmtTgl(tgl)+'. Hapus barisnya atau cek lagi.');
      return;
    }
    used.add(m.i);
    const e=[];
    if(m.nominal!==d.jumlah)e.push('jumlah ditulis '+_bRp(d.jumlah)+', transfer Kopra '+_bRp(m.nominal)+' → ganti jadi '+_bRp(m.nominal));
    if(m.rek!==d.rek)e.push('rekening ditulis '+(d.bank||'')+' '+d.rek+', padahal transfer ke '+m.bank+' '+m.rek);
    if(!_bNamaMirip(m.nama,d.nama))e.push('nama pemilik ditulis "'+d.nama+'", padahal rekening tujuan atas nama "'+m.nama+'"');
    if(e.length)add('x',lbl+': '+e.join('; ')+'.');
    else add('ok',d.nama+' '+_bRp(d.jumlah)+' = transfer '+m.ref);
    if(!e.length&&!_bBankMirip(m.bank,d.bank))add('w',lbl+': bank ditulis "'+d.bank+'", di Kopra "'+m.bank+'".');
  });
  bebas().forEach(e=>{
    const ket=e.ket?' — "'+e.ket+'"':'';
    add('x','Transfer ke '+e.nama+' ('+e.bank+' '+e.rek+') '+_bRp(e.nominal)+ket+' belum ada di SPM ini. Tambahkan barisnya.');
  });
  const sumRows=P.rows.reduce((s,r)=>s+(isNaN(r.jumlah)?0:r.jumlah),0);
  const sumExp=exp.reduce((s,r)=>s+r.nominal,0);
  if(P.total==null||isNaN(P.total))add('w','Baris Total tidak terbaca.');
  else{
    if(P.total!==sumRows)add('x','Total ditulis '+_bRp(P.total)+', padahal jumlah baris-barisnya '+_bRp(sumRows)+'.');
    if(P.total!==sumExp)add('x','Total ditulis '+_bRp(P.total)+', total transfer '+BGN_KEL[kel]+' di Kopra '+_bRp(sumExp)+' → Total harus '+_bRp(sumExp)+'.');
    else add('ok','Total '+_bRp(P.total)+' cocok');
  }
  const beda=[...new Set(P.rows.map(r=>r.tglIso).filter(t=>t&&t!==tgl))];
  if(beda.length)add('w','Kolom Tanggal berisi '+beda.map(_bFmtTgl).join(', ')+' — seharusnya '+_bFmtTgl(tgl)+'.');
  return out;
}
function _bSum(acuan,kel){return acuan.rows.filter(r=>r.kel===kel).reduce((s,r)=>s+r.nominal,0);}
function _bNObu(acuan){return acuan.rows.filter(r=>r.obu).length;}
function _bCekKuitansi(P,acuan,tgl,S){
  const out=[];const add=(lv,m)=>out.push({lv,m});
  if(!P||isNaN(P.jumlah)){add('x','Nominal kuitansi tidak terbaca — upload PDF asli, bukan foto/scan.');return out;}
  const ins=acuan.rows.filter(r=>r.kel==='ins');const sum=_bSum(acuan,'ins');
  if(!ins.length)add('x','Tidak ada transfer Insentif Fasilitas di Kopra tanggal '+_bFmtTgl(tgl)+'.');
  else if(P.jumlah!==sum)add('x','Uang sejumlah ditulis '+_bRp(P.jumlah)+', transfer Insentif Fasilitas di Kopra '+_bRp(sum)+' → ganti jadi '+_bRp(sum)+'.');
  else add('ok',_bRp(P.jumlah)+' = transfer '+ins.map(r=>r.ref+' ke '+r.nama).join(', '));
  const tb=_bTerbilang(P.jumlah);
  if(!P.terbilang)add('w','Terbilang tidak terbaca.');
  else if(_bN(P.terbilang).replace(/[^a-z ]/g,'')!==tb)add('x','Terbilang ditulis "'+P.terbilang+'" — seharusnya "'+tb.replace(/\b\w/g,c=>c.toUpperCase())+'".');
  else add('ok','Terbilang cocok');
  if(!isNaN(P.pm)){
    const hit=P.pm*(S.tarif_insentif||0);
    if(hit!==P.jumlah)add('x','PM '+P.pm.toLocaleString('id-ID')+' × '+_bRp(S.tarif_insentif)+' = '+_bRp(hit)+', bukan '+_bRp(P.jumlah)+'.');
    else add('ok','PM '+P.pm.toLocaleString('id-ID')+' × '+_bRp(S.tarif_insentif)+' cocok');
  }else add('w','Jumlah PM tidak terbaca.');
  if(P.tgl&&P.tgl!==tgl)add('x','Tanggal "Jakarta, '+_bFmtTgl(P.tgl)+'" — seharusnya '+_bFmtTgl(tgl)+'.');
  if(P.tgl_untuk&&P.tgl_untuk!==tgl)add('x','"Untuk Pembayaran" menyebut '+_bFmtTgl(P.tgl_untuk)+' — seharusnya '+_bFmtTgl(tgl)+'.');
  return out;
}
function _bCekLpdh(P,acuan,tgl,S,ctx){
  const out=[];const add=(lv,m)=>out.push({lv,m});
  if(!P||isNaN(P.bb)){add('x','Angka LPDH tidak terbaca — upload PDF asli dari aplikasi BGN.');return out;}
  if(P.tgl!==tgl)add('x','Tanggal pelayanan '+_bFmtTgl(P.tgl)+' — seharusnya '+_bFmtTgl(tgl)+'.');
  const bb=_bSum(acuan,'bb'),opsT=_bSum(acuan,'ops'),nObu=_bNObu(acuan),biaya=acuan.biaya_obu||0,ops=opsT+nObu*biaya,ins=_bSum(acuan,'ins');
  const cek=(lbl,doc,exp,rumus)=>{if(doc!==exp)add('x',lbl+' ditulis '+_bRp(doc)+', seharusnya '+_bRp(exp)+(rumus?' ('+rumus+')':'')+'.');else add('ok',lbl+' '+_bRp(doc)+' cocok'+(rumus?' ('+rumus+')':''));};
  cek('Belanja bahan baku',P.bb,bb,'total transfer bahan baku Kopra');
  cek('Biaya operasional',P.ops,ops,_bRp(opsT)+' transfer operasional + '+nObu+' × '+_bRp(biaya)+' biaya transfer antarbank');
  cek('Insentif dibayarkan',P.ins_bayar,ins,'transfer Insentif Fasilitas');
  if(!isNaN(P.pm))cek('Insentif dihitung',P.ins_hitung,P.pm*(S.tarif_insentif||0),'PM '+P.pm.toLocaleString('id-ID')+' × '+_bRp(S.tarif_insentif));
  cek('Usulan top up',P.topup,bb+ops+ins,'bahan baku + operasional + insentif');
  if(ctx&&ctx.kuitansi&&!isNaN(ctx.kuitansi.pm)&&!isNaN(P.pm)&&ctx.kuitansi.pm!==P.pm)add('w','PM di LPDH '+P.pm.toLocaleString('id-ID')+', di kuitansi '+ctx.kuitansi.pm.toLocaleString('id-ID')+'.');
  if(ctx&&ctx.prev&&!isNaN(ctx.prev.saldo)){
    const exp=ctx.prev.saldo-(isNaN(P.topup)?0:P.topup);
    if(P.saldo!==exp)add('w','Saldo akhir VA '+_bRp(P.saldo)+' — dari LPDH '+_bFmtTgl(ctx.prev.tgl)+' ('+_bRp(ctx.prev.saldo)+') dikurangi usulan top up seharusnya '+_bRp(exp)+'. Abaikan kalau ada top up masuk.');
    else add('ok','Saldo akhir VA '+_bRp(P.saldo)+' = saldo '+_bFmtTgl(ctx.prev.tgl)+' − usulan top up');
  }
  if(P.periksa&&!/lengkap/i.test(P.periksa))add('w','Hasil daftar periksa: '+P.periksa);
  return out;
}
// Semua dokumen → {per:{jenis:[...]}, x, w}
function _bCekSemua(docs,acuan,tgl,S,prev){
  const per={};let x=0,w=0;
  if(!acuan||!acuan.rows||!acuan.rows.length)return{per,x:0,w:0,tanpaAcuan:true};
  BGN_JENIS.forEach(j=>{
    const d=docs&&docs[j];if(!d)return;
    if(d.err){per[j]=[{lv:'x',m:d.err}];return;}
    const P=_bParsedDariDoc(d.parsed);
    if(j==='spm_bb')per[j]=_bCekSpm(P,acuan,'bb',tgl);
    else if(j==='spm_ops')per[j]=_bCekSpm(P,acuan,'ops',tgl);
    else if(j==='kuitansi')per[j]=_bCekKuitansi(P,acuan,tgl,S);
    else per[j]=_bCekLpdh(P,acuan,tgl,S,{kuitansi:docs.kuitansi&&docs.kuitansi.parsed,prev});
  });
  Object.values(per).forEach(a=>a.forEach(i=>{if(i.lv==='x')x++;else if(i.lv==='w')w++;}));
  return{per,x,w};
}
function _bKel(r,S,ovr){
  if(ovr&&ovr[r.ref])return ovr[r.ref];
  const k=_bN(r.kategori),t=_bN(r.ket);
  if(k.includes('insentif fasilitas')||t.includes('insentif fasilitas'))return 'ins';
  if(typeof _kRule==='function'&&_kRule(r.nama))return 'bb';
  if(k.includes('bahan baku'))return 'bb';
  if((S.kategori_operasional||[]).some(c=>_bN(c)===k)||/operasional|gaji|insentif|reimburse/.test(k))return 'ops';
  if(/gaji|insentif|reimburse|es ?batu|elpiji|\bgas\b|bbm|bensin|listrik/.test(t))return 'ops';
  return 'bb';
}

// ----- State -----
let _bg={cfg:null,mode:null,tgl:null,day:null,unsub:null,hari:[],busy:'',prev:null,ttd:null,preview:null,setOpen:false,err:''};
function _bS(){return Object.assign({},BGN_DEFAULT,(_bg.cfg&&_bg.cfg.settings)||{});}
function _bDocId(tgl){return 'bgn_h_'+tgl.replace(/-/g,'');}
function _bRefHari(tgl){return db.collection('sims').doc(_bDocId(tgl));}
const _bRefCfg=()=>db.collection('sims').doc('bgn_cfg');
const _bRefIdx=()=>db.collection('sims').doc('bgn_idx');
const _bRefTtd=uid=>db.collection('sims').doc('bgn_ttd_'+uid);
const _bRefFile=(key,i)=>db.collection('sims_files').doc('bgn_'+key+'_'+i);
function _bEmail(){return (_currentUser&&_currentUser.email||'').toLowerCase();}
function _bIsOwner(){return !!(_bg.cfg&&_bg.cfg.owner_uid&&_currentUser&&_bg.cfg.owner_uid===_currentUser.uid);}
function _bIsDapur(cfg){const c=cfg||_bg.cfg;return !!(c&&(c.dapur_emails||[]).map(e=>e.toLowerCase()).includes(_bEmail()));}

// ----- Login: akun tim dapur tidak memuat sims/data -----
async function bgnCekDapur(){
  try{const s=await _bRefCfg().get();_bg.cfg=s.exists?s.data():{};}
  catch(e){console.warn('[BGN] baca config:',e);_bg.cfg=null;return false;}
  return _bIsDapur();
}
function bgnModeDapur(){
  _bg.mode='dapur';document.body.classList.add('mode-dapur');
  nav('bgn');
}

// ----- Library PDF (dimuat hanya saat dibutuhkan) -----
const _bScripts={};
function _bLoadScript(src){
  if(_bScripts[src])return _bScripts[src];
  _bScripts[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>{delete _bScripts[src];rej(new Error('Gagal memuat '+src.split('/').pop()+' — cek koneksi internet.'));};document.head.appendChild(s);});
  return _bScripts[src];
}
async function _bPdfjs(){await _bLoadScript(BGN_CDN.pdfjs);pdfjsLib.GlobalWorkerOptions.workerSrc=BGN_CDN.worker;return pdfjsLib;}
async function _bPdfLib(){await _bLoadScript(BGN_CDN.pdflib);return PDFLib;}
async function _bItems(bytes){
  const L=await _bPdfjs();
  const pdf=await L.getDocument({data:bytes.slice()}).promise;
  const out=[];
  for(let p=1;p<=pdf.numPages;p++){
    const pg=await pdf.getPage(p);const tc=await pg.getTextContent();
    const pi=[];tc.items.forEach(it=>{if(!it.str||!it.str.trim())return;const t=it.transform;pi.push({p,s:it.str,x:t[4],y:t[5],w:it.width,h:it.height||Math.abs(t[3])});});
    out.push(..._bGabung(pi));
  }
  return{items:out,pages:pdf.numPages};
}
async function _bSha(bytes){const h=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}
function _bB64(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function _bUnB64(b64){const s=atob(b64);const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;}
async function _bSimpanFile(key,bytes){
  const b64=_bB64(bytes);const n=Math.ceil(b64.length/BGN_CHUNK);const b=db.batch();
  for(let i=0;i<n;i++)b.set(_bRefFile(key,i),{d:b64.slice(i*BGN_CHUNK,(i+1)*BGN_CHUNK),i,n});
  await b.commit();return n;
}
const _bFileCache={};
async function _bAmbilFile(key,n){
  if(_bFileCache[key])return _bFileCache[key];
  const parts=await Promise.all([...Array(n)].map((_,i)=>_bRefFile(key,i).get()));
  if(parts.some(p=>!p.exists))throw new Error('Potongan file '+key+' tidak lengkap di server.');
  const u=_bUnB64(parts.map(p=>p.data().d).join(''));_bFileCache[key]=u;return u;
}

// ----- Acuan: salinan transfer Kopra hari itu (ditulis akun tim/pemilik) -----
async function bgnSyncAcuan(tgl){
  if(typeof _kp==='undefined')return null;
  if(!_kp.doc)await _kLoadDoc();
  const S=_kSet();
  const ref=_bRefHari(tgl);
  const cur=await ref.get();const ovr=(cur.exists&&cur.data().kel_override)||{};
  const idx=(_kp.doc.batches_idx||[]).filter(b=>b.tgl===tgl&&b.status!==KOPRA_STATUS.batal);
  const rows=[],batches=[];
  for(const b of idx){
    const s=await db.collection('sims').doc('kopra_b_'+b.id).get();if(!s.exists)continue;
    const B=s.data();if(B.status===KOPRA_STATUS.batal)continue;
    batches.push({id:B.id,file:B.file||'',status:B.status});
    (B.rows||[]).forEach(r=>rows.push({ref:r.ref,nama:r.nama,bank:r.bank,rek:_bRek(r.rek),nominal:r.nominal,ket:r.ket||'',kategori:r.kategori||'',obu:r.tipe==='OBU',kel:_bKel(r,S,ovr)}));
  }
  const acuan={rows,batches,biaya_obu:S.biaya_obu||0,belum_verif:batches.some(b=>(_kRank[b.status]||0)<1),at:new Date().toISOString(),by:_bEmail()};
  await ref.set({tgl,acuan},{merge:true});
  await _bRefIdx().set({hari:{[tgl]:{ada:rows.length>0}}},{merge:true});
  return acuan;
}
// Sinkron otomatis hari-hari yang punya batch Kopra 14 hari terakhir
async function _bSyncTerbaru(){
  if(typeof _kp==='undefined')return;
  if(!_kp.doc)await _kLoadDoc();
  const batas=new Date(Date.now()-14*864e5).toISOString().slice(0,10);
  const tgls=[...new Set((_kp.doc.batches_idx||[]).filter(b=>b.tgl>=batas).map(b=>b.tgl))];
  for(const t of tgls){
    const s=await _bRefHari(t).get();
    const a=s.exists&&s.data().acuan;
    const sig=(_kp.doc.batches_idx||[]).filter(b=>b.tgl===t&&b.status!==KOPRA_STATUS.batal).map(b=>b.id+':'+b.status).sort().join('|');
    const sigDoc=a?(a.batches||[]).map(b=>b.id+':'+b.status).sort().join('|'):null;
    if(sig!==sigDoc)await bgnSyncAcuan(t);
  }
}

// ----- Render -----
async function renderBgn(){
  const root=document.getElementById('bgn-root');if(!root)return;
  if(_bg.mode!=='dapur'&&typeof _dataLoaded!=='undefined'&&!_dataLoaded){
    root.innerHTML='<div class="card"><div class="empty">Memuat data SIMS…</div></div>';
    clearTimeout(_bg.tunggu);_bg.tunggu=setTimeout(()=>{if(_currentPage==='bgn')renderBgn();},800);return;
  }
  if(!_bg.cfg||_bg.cfgStale){
    root.innerHTML='<div class="card"><div class="empty">Memuat…</div></div>';
    try{const s=await _bRefCfg().get();_bg.cfg=s.exists?s.data():{};_bg.cfgStale=false;}
    catch(e){root.innerHTML='<div class="card" style="color:var(--dn)">Gagal membaca pengaturan Dokumen BGN: '+_be(e.message)+'</div>';return;}
  }
  if(!_bg.mode)_bg.mode=_bIsDapur()?'dapur':'tim';
  if(!_bg.cfg.owner_uid&&_bg.mode!=='dapur'){
    root.innerHTML=`<div class="card"><div class="ct">Belum ada pemilik</div>
      <p style="font-size:13px;margin:0 0 10px">Pemilik adalah satu-satunya akun yang bisa menyetujui dan menandatangani dokumen BGN. Jadikan ${_be(_currentUser?.email||'')} pemilik?</p>
      <button class="btn bp bsm" onclick="bgnKlaim()">Jadikan saya pemilik</button></div>`;
    return;
  }
  if(!_bg.tgl)_bg.tgl=today();
  if(!_bg.hariLoaded){_bg.hariLoaded=true;_bMuatDaftarHari();}
  if(_bIsOwner()&&_bg.ttdUid!==_currentUser.uid){_bg.ttdUid=_currentUser.uid;_bMuatTtd().then(()=>{if(_currentPage==='bgn'&&!_bg.preview)_bRenderHari(document.getElementById('bgn-root'));}).catch(e=>console.warn('[BGN] ttd:',e));}
  if(_bIsOwner()&&!_bg.synced){_bg.synced=true;_bSyncTerbaru().then(()=>_bMuatDaftarHari()).catch(e=>console.warn('[BGN] sync:',e));}
  if(!_bg.dayFor||_bg.dayFor!==_bg.tgl){_bBukaHari(_bg.tgl);return;}
  _bRenderHari(root);
}
async function bgnKlaim(){
  if(!_currentUser)return;
  if(!confirm('Jadikan '+_currentUser.email+' pemilik Dokumen BGN (satu-satunya yang bisa menandatangani)?'))return;
  const ref=_bRefCfg();const s=await ref.get();
  if(s.exists&&s.data().owner_uid){showToast('Sudah ada pemilik.',true);_bg.cfg=s.data();renderBgn();return;}
  _bg.cfg=Object.assign({},s.exists?s.data():{},{owner_uid:_currentUser.uid,owner_email:_bEmail(),dapur_emails:(s.exists&&s.data().dapur_emails)||[],settings:Object.assign({},BGN_DEFAULT,(s.exists&&s.data().settings)||{})});
  await ref.set(_bg.cfg);
  if(typeof addLog==='function')addLog('bgn_klaim','Klaim pemilik Dokumen BGN','bgn','','',_currentUser.email);
  renderBgn();
}
async function _bMuatDaftarHari(){
  try{
    const s=await _bRefIdx().get();const H=(s.exists&&s.data().hari)||{};_bg.idx=H;
    _bg.hari=Object.keys(H).sort().reverse().slice(0,21).map(t=>Object.assign({tgl:t},H[t]));
    if(_currentPage==='bgn'&&!_bg.preview)_bRenderHari(document.getElementById('bgn-root'));
  }catch(e){console.warn('[BGN] daftar hari:',e);}
}
function _bBukaHari(tgl){
  if(_bg.unsub){_bg.unsub();_bg.unsub=null;}
  _bg.tgl=tgl;_bg.dayFor=tgl;_bg.day=null;_bg.prev=null;_bg.err='';
  const root=document.getElementById('bgn-root');if(root)root.innerHTML='<div class="card"><div class="empty">Memuat '+_bFmtTgl(tgl)+'…</div></div>';
  _bg.unsub=_bRefHari(tgl).onSnapshot(s=>{
    if(_bg.tgl!==tgl)return;
    _bg.day=s.exists?s.data():{tgl};
    if(_currentPage==='bgn'&&!_bg.preview)_bRenderHari(document.getElementById('bgn-root'));
    _bPerbaruiStatus();
  },e=>{_bg.err='Gagal membaca dokumen hari ini: '+e.message;_bg.day={tgl};_bRenderHari(document.getElementById('bgn-root'));});
  _bRefIdx().get().then(s=>{
    if(_bg.tgl!==tgl)return;
    const H=(s.exists&&s.data().hari)||{};
    const t=Object.keys(H).filter(k=>k<tgl&&typeof H[k].saldo==='number').sort().pop();
    _bg.prev=t?{tgl:t,saldo:H[t].saldo}:null;
    if(_currentPage==='bgn'&&_bg.day&&!_bg.preview)_bRenderHari(document.getElementById('bgn-root'));
  }).catch(e=>console.warn('[BGN] saldo kemarin:',e));
}
function bgnPilihTgl(t){if(!t)return;_bg.tgl=t;_bg.dayFor=null;renderBgn();}

function _bHasil(){const d=_bg.day||{};return _bCekSemua(d.docs||{},d.acuan,_bg.tgl,_bS(),_bg.prev);}
function _bStatusHitung(d,H){
  const lengkap=BGN_JENIS.every(j=>d.docs&&d.docs[j]);
  if(d.approved&&d.signed&&BGN_JENIS.every(j=>d.signed[j]&&d.approved.versi&&d.approved.versi[j]===(d.docs[j]&&d.docs[j].versi)))return BGN_STATUS.ok;
  if(d.tolak)return BGN_STATUS.tolak;
  if(!lengkap)return BGN_STATUS.tunggu;
  if(H.tanpaAcuan)return BGN_STATUS.acuan;
  return H.x?BGN_STATUS.selisih:BGN_STATUS.siap;
}
// Status ringkas ditulis ke dokumen hari supaya daftar hari tidak perlu menghitung ulang
function _bPerbaruiStatus(){
  const d=_bg.day;if(!d||!d.tgl)return;
  const H=_bHasil();const st=_bStatusHitung(d,H);
  if(d.status===st&&d.nx===H.x)return;
  const docs=d.docs||{};if(!Object.keys(docs).length&&!d.acuan)return;
  const L=docs.lpdh&&docs.lpdh.parsed;const n=BGN_JENIS.filter(j=>docs[j]).length;
  const ent={status:st,nx:H.x,n,ada:!!(d.acuan&&d.acuan.rows&&d.acuan.rows.length)};
  if(L&&typeof L.saldo==='number')ent.saldo=L.saldo;if(L&&typeof L.topup==='number')ent.topup=L.topup;
  _bRefHari(d.tgl).set({tgl:d.tgl,status:st,nx:H.x,nw:H.w},{merge:true}).catch(e=>console.warn('[BGN] status:',e));
  _bRefIdx().set({hari:{[d.tgl]:ent}},{merge:true}).then(()=>{if(_bg.idx){_bg.idx[d.tgl]=Object.assign({},_bg.idx[d.tgl],ent);_bg.hari=Object.keys(_bg.idx).sort().reverse().slice(0,21).map(t=>Object.assign({tgl:t},_bg.idx[t]));}}).catch(e=>console.warn('[BGN] idx:',e));
}
function _bTag(s){const c={[BGN_STATUS.ok]:'tok',[BGN_STATUS.siap]:'tin',[BGN_STATUS.selisih]:'tno',[BGN_STATUS.tolak]:'tno',[BGN_STATUS.tunggu]:'twn',[BGN_STATUS.acuan]:'twn'}[s]||'tgr';return '<span class="tag '+c+'">'+_be(s||'—')+'</span>';}

function _bRenderHari(root){
  if(!root)return;
  const d=_bg.day||{tgl:_bg.tgl};const S=_bS();const owner=_bIsOwner();
  const H=_bHasil();const st=_bStatusHitung(d,H);const docs=d.docs||{};const A=d.acuan;
  const hari=_bg.hari.filter(h=>h.tgl!==_bg.tgl).slice(0,10);
  root.innerHTML=`
  ${_bg.mode==='dapur'?`<div class="card" style="font-size:13px;background:var(--ibg);border-color:var(--ibg)">Upload keempat dokumen BGN hari ini (SPM Bahan Baku, SPM Operasional, Kuitansi, LPDH). SIMS langsung mencocokkannya dengan transfer Kopra. Perbaiki yang bertanda ⛔ lalu upload ulang; setelah disetujui, dokumen bertanda tangan bisa diunduh di bawah.</div>`:''}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><input type="date" value="${_be(_bg.tgl)}" onchange="bgnPilihTgl(this.value)"><b>${_bFmtTgl(_bg.tgl)}</b> ${_bTag(st)}</div>
      <div class="bg"><button class="btn bp bsm" onclick="document.getElementById('bgn-file').click()" ${_bg.busy?'disabled':''}>⬆ Upload dokumen</button>
      <input type="file" id="bgn-file" accept="application/pdf,.pdf" multiple style="display:none" onchange="bgnUpload(this.files);this.value=''"></div>
    </div>
    ${hari.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;font-size:11px">${hari.map(h=>`<button class="btn bxs" onclick="bgnPilihTgl('${h.tgl}')">${_bFmtTgl(h.tgl)} ${_bTag(h.status)}</button>`).join('')}</div>`:''}
    ${_bg.busy?`<div style="margin-top:8px;font-size:12px;color:var(--it)">⏳ ${_be(_bg.busy)}</div>`:''}
    ${_bg.err?`<div style="margin-top:8px;font-size:12px;color:var(--dn)">${_be(_bg.err)}</div>`:''}
    ${d.tolak?`<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:var(--dbg);color:var(--dt);font-size:13px"><b>Ditolak</b> oleh ${_be(d.tolak.by)} — ${_be(d.tolak.catatan)}<div style="font-size:11px">Upload ulang dokumen yang diperbaiki; status otomatis kembali dicek.</div></div>`:''}
  </div>
  ${_bHtmlDokumen(d,H)}
  ${_bHtmlAcuan(d)}
  ${_bHtmlAksi(d,H,st)}
  ${owner?_bHtmlSetting():''}`;
}
function _bHtmlDokumen(d,H){
  const docs=d.docs||{};
  return `<div class="card"><div class="ct">Dokumen &amp; hasil pencocokan</div>
  ${H.tanpaAcuan?`<div style="font-size:12px;color:var(--wt);margin-bottom:8px">⚠ Belum ada data transfer Kopra untuk ${_bFmtTgl(_bg.tgl)} — pencocokan otomatis berjalan begitu transfer hari ini diexport di Kopra.</div>`:''}
  ${d.acuan&&d.acuan.belum_verif?`<div style="font-size:12px;color:var(--wt);margin-bottom:8px">⚠ Batch Kopra hari ini belum diverifikasi dengan transfer list — angka pembanding bisa masih berubah.</div>`:''}
  ${BGN_JENIS.map(j=>{
    const x=docs[j];const it=(H.per&&H.per[j])||[];const nx=it.filter(i=>i.lv==='x').length,nw=it.filter(i=>i.lv==='w').length;
    const sig=d.signed&&d.signed[j]&&d.approved&&d.approved.versi&&x&&d.approved.versi[j]===x.versi;
    return `<div style="border:1px solid var(--bd);border-radius:8px;padding:9px 11px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><b>${BGN_LABEL[j]}</b> ${x?`<span style="font-size:11px;color:var(--t3)">${_be(x.nama)} · v${x.versi} · ${_be(x.by||'')} ${_be(_bWaktu(x.at))}${x.parsed&&x.parsed.nomor?' · No. '+_be(x.parsed.nomor):''}</span>`:'<span class="tag twn">belum diupload</span>'}</div>
        <div class="bg">${x?(H.tanpaAcuan?'':nx?`<span class="tag tno">${nx} selisih</span>`:'<span class="tag tok">cocok</span>')+(nw?` <span class="tag twn">${nw} peringatan</span>`:''):''}
        ${x?`<button class="btn bxs" onclick="bgnLihat('${j}',false)">Lihat</button>`:''}${sig?`<button class="btn bxs bp" onclick="bgnUnduh('${j}')">⬇ Bertanda tangan</button>`:''}</div>
      </div>
      ${it.length?`<div style="margin-top:6px;font-size:12px;line-height:1.5">${it.filter(i=>i.lv!=='ok').map(i=>`<div style="color:${i.lv==='x'?'var(--dn)':'var(--wt)'}">${i.lv==='x'?'⛔':'⚠'} ${_be(i.m)}</div>`).join('')}
        ${it.some(i=>i.lv==='ok')?`<details style="color:var(--t3)"><summary style="cursor:pointer">${it.filter(i=>i.lv==='ok').length} cocok</summary>${it.filter(i=>i.lv==='ok').map(i=>`<div style="color:var(--ac)">✓ ${_be(i.m)}</div>`).join('')}</details>`:''}</div>`:''}
    </div>`;}).join('')}
  </div>`;
}
function _bWaktu(iso){if(!iso)return '';const d=new Date(iso);if(isNaN(d))return '';const p=n=>String(n).padStart(2,'0');return d.getDate()+' '+_B_MON[d.getMonth()]+' '+p(d.getHours())+':'+p(d.getMinutes());}
function _bHtmlAcuan(d){
  const A=d.acuan;const owner=_bIsOwner();
  if(!A||!A.rows||!A.rows.length)return owner?`<div class="card"><div class="ct">Transfer Kopra ${_bFmtTgl(_bg.tgl)}</div><div class="empty">Tidak ada batch Kopra untuk tanggal ini.</div><button class="btn bsm" onclick="bgnSync()">Ambil ulang dari Kopra</button></div>`:'';
  const grup=['bb','ops','ins'];const nObu=_bNObu(A);
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="ct" style="margin:0">Transfer Kopra ${_bFmtTgl(_bg.tgl)}</div>
    ${owner?`<button class="btn bxs" onclick="bgnSync()">Ambil ulang dari Kopra</button>`:''}</div>
    <div style="font-size:11px;color:var(--t3);margin:4px 0 8px">${A.batches.map(b=>_be(b.file)+' ('+_be(b.status)+')').join(', ')} · ${nObu} transfer antarbank × ${_bRp(A.biaya_obu)}</div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Kelompok</th><th>Penerima</th><th>Rekening</th><th>Keterangan</th><th style="text-align:right">Nominal</th></tr></thead><tbody>
    ${grup.map(g=>{const rs=A.rows.filter(r=>r.kel===g);if(!rs.length)return '';
      return rs.map(r=>`<tr><td>${owner?`<select style="font-size:11px;padding:2px" onchange="bgnUbahKel('${_be(r.ref)}',this.value)">${grup.map(k=>`<option value="${k}" ${k===r.kel?'selected':''}>${BGN_LABEL[BGN_KEL_DOK[k]]}</option>`).join('')}</select>`:BGN_LABEL[BGN_KEL_DOK[g]]}</td>
        <td>${_be(r.nama)}</td><td style="font-family:var(--mn);font-size:11px">${_be(r.bank)} ${_be(r.rek)}${r.obu?' <span class="tag tgr">OBU</span>':''}</td><td class="txt-cell" style="max-width:260px;font-size:12px">${_be(r.ket)}</td><td class="num-cell">${_bRp(r.nominal)}</td></tr>`).join('')
        +`<tr><td colspan="4" style="text-align:right;font-size:12px;color:var(--t2)">Total ${BGN_KEL[g]}</td><td class="num-cell"><b>${_bRp(_bSum(A,g))}</b></td></tr>`;}).join('')}
    </tbody></table></div></div>`;
}
function _bHtmlAksi(d,H,st){
  const owner=_bIsOwner();const docs=d.docs||{};const lengkap=BGN_JENIS.every(j=>docs[j]);
  const ok=st===BGN_STATUS.ok;
  let h='<div class="card"><div class="ct">Persetujuan &amp; tanda tangan</div>';
  if(ok)h+=`<div style="font-size:13px;color:var(--ac);margin-bottom:8px">✓ Disetujui dan ditandatangani ${_be(d.approved.by)} — ${_be(_bWaktu(d.approved.at))}</div>
    <button class="btn bp bsm" onclick="bgnUnduhSemua()">⬇ Unduh 4 dokumen bertanda tangan</button>`;
  else if(!lengkap)h+=`<div style="font-size:12px;color:var(--t3)">Menunggu ${BGN_JENIS.filter(j=>!docs[j]).map(j=>BGN_LABEL[j]).join(', ')}.</div>`;
  else if(H.tanpaAcuan)h+='<div style="font-size:12px;color:var(--t3)">Menunggu data transfer Kopra.</div>';
  else if(H.x)h+=`<div style="font-size:12px;color:var(--dn)">Masih ada ${H.x} selisih ⛔ — dokumen belum bisa disetujui. Tim dapur memperbaiki lalu upload ulang.</div>`;
  else h+=`<div style="font-size:12px;color:var(--t2)">Keempat dokumen cocok dengan transfer Kopra${H.w?' ('+H.w+' peringatan ⚠ — baca dulu)':''}. ${owner?'':'Menunggu persetujuan pemilik.'}</div>`;
  if(owner&&lengkap&&!ok){
    h+=`<div class="bg" style="margin-top:10px">
      <button class="btn bp bsm" onclick="bgnSiapkanTtd(true)" ${_bg.busy?'disabled':''}>${H.x?'Pratinjau tanda tangan':'Setujui &amp; tanda tangani…'}</button>
      ${d.tolak?'':`<button class="btn bsm" onclick="bgnTolak()">Tolak dengan catatan</button>`}</div>
      <div style="font-size:11px;color:var(--t3);margin-top:6px">Sebelum menandatangani, SIMS mengambil ulang transfer dari Kopra, memeriksa file belum berubah (sidik SHA-256), dan membaca ulang keempat PDF di perangkat ini.</div>`;
  }
  if(owner&&ok)h+=`<div style="margin-top:8px"><button class="btn bxs" onclick="bgnTolak()">Batalkan persetujuan…</button></div>`;
  return h+'</div>';
}
function _bHtmlSetting(){
  const S=_bS();const C=_bg.cfg||{};
  return `<div class="card"><details ${_bg.setOpen?'open':''} ontoggle="_bg.setOpen=this.open"><summary class="ct" style="cursor:pointer;margin:0">Setting Dokumen BGN (pemilik)</summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:10px;font-size:12px">
      <label>Email akun tim keuangan dapur (pisahkan dengan koma)<input type="text" id="bgn-set-emails" value="${_be((C.dapur_emails||[]).join(', '))}" style="width:100%"></label>
      <label>Nama penanda tangan (dicari di PDF)<input type="text" id="bgn-set-nama" value="${_be(S.nama_ttd)}" style="width:100%"></label>
      <label>Insentif per PM (Rp)<input type="number" id="bgn-set-tarif" value="${S.tarif_insentif}" style="width:100%"></label>
      <label>Lebar tanda tangan (× lebar nama)<input type="number" step="0.1" id="bgn-set-lebar" value="${S.ttd_lebar}" style="width:100%"></label>
      <label>Turun di bawah garis nama (× tinggi huruf)<input type="number" step="0.05" id="bgn-set-turun" value="${S.ttd_turun}" style="width:100%"></label>
    </div>
    <button class="btn bp bsm" style="margin-top:10px" onclick="bgnSimpanSetting()">Simpan setting</button>
    <div style="margin-top:14px;font-size:12px"><b>Gambar tanda tangan</b> — PNG/JPG tanda tangan di kertas putih; latar putih dibuang otomatis. Hanya akun Anda yang bisa membacanya (setelah rules dipasang).
      <div style="display:flex;gap:10px;align-items:center;margin-top:6px;flex-wrap:wrap">
        <div id="bgn-ttd-prev" style="min-width:160px;min-height:60px;border:1px dashed var(--bd);border-radius:6px;display:flex;align-items:center;justify-content:center;background:repeating-conic-gradient(#f3f3f3 0 25%,#fff 0 50%) 0 0/14px 14px">${_bg.ttd?`<img src="${_bg.ttd.png}" style="max-height:70px;max-width:220px">`:'<span style="color:var(--t3)">belum ada</span>'}</div>
        <button class="btn bsm" onclick="document.getElementById('bgn-ttd-file').click()">${_bg.ttd?'Ganti gambar':'Upload gambar'}</button>
        <input type="file" id="bgn-ttd-file" accept="image/*" style="display:none" onchange="bgnUploadTtd(this.files[0]);this.value=''">
      </div></div>
    <div style="margin-top:14px;font-size:12px"><b>Firestore rules</b> — tanpa ini, akun tim dapur secara teknis masih bisa membaca seluruh data SIMS lewat console browser. Salin, bandingkan dulu dengan rules yang sekarang di Firebase console → Firestore → Rules, lalu ganti dan Publish.
      <textarea id="bgn-rules" readonly style="width:100%;height:190px;font-family:var(--mn);font-size:11px;margin-top:6px">${_be(_bRules(C.dapur_emails||[]))}</textarea>
      <button class="btn bxs" onclick="navigator.clipboard.writeText(document.getElementById('bgn-rules').value).then(()=>showToast('Rules disalin'))">Salin rules</button></div>
  </details></div>`;
}
function _bRules(emails){
  const list=emails.length?emails.map(e=>"'"+e.toLowerCase()+"'").join(', '):"'email-tim-dapur@contoh.com'";
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function masuk() { return request.auth != null; }
    function dapur() { return masuk() && request.auth.token.email.lower() in [${list}]; }
    function tim() { return masuk() && !dapur(); }
    // Tim SIMS: dokumen sims/* kecuali gambar tanda tangan orang lain
    match /sims/{d} {
      allow read, write: if tim() && !d.matches('bgn_ttd_.*');
      allow read, write: if masuk() && d == 'bgn_ttd_' + request.auth.uid;
      // Tim dapur: hanya pengaturan (baca), ringkasan, dan dokumen harian BGN
      allow read: if dapur() && d == 'bgn_cfg';
      allow read, write: if dapur() && (d == 'bgn_idx' || d.matches('bgn_h_[0-9]{8}'));
    }
    match /sims_files/{f} {
      allow read, write: if tim() || (dapur() && f.matches('bgn_.*'));
    }
    match /sims_arsip/{doc=**} { allow read, write: if tim(); }
  }
}`;
}
async function bgnSimpanSetting(){
  const v=id=>document.getElementById(id).value;
  const emails=v('bgn-set-emails').split(/[,\s;]+/).map(e=>e.trim().toLowerCase()).filter(e=>/^\S+@\S+\.\S+$/.test(e));
  if(emails.includes(_bg.cfg.owner_email)){showToast('Email pemilik tidak boleh masuk daftar tim dapur.',true);return;}
  const settings=Object.assign({},_bS(),{nama_ttd:v('bgn-set-nama').trim()||BGN_DEFAULT.nama_ttd,tarif_insentif:parseInt(v('bgn-set-tarif'),10)||0,
    ttd_lebar:parseFloat(v('bgn-set-lebar'))||BGN_DEFAULT.ttd_lebar,ttd_turun:parseFloat(v('bgn-set-turun'))||0});
  const cfg=Object.assign({},_bg.cfg,{dapur_emails:emails,settings});
  try{await _bRefCfg().set(cfg);}catch(e){showToast('Gagal simpan: '+e.message,true);return;}
  _bg.cfg=cfg;addLog('bgn_setting','Setting Dokumen BGN','bgn','','',`tim dapur: ${emails.join(', ')||'-'} · ttd ${settings.nama_ttd} · insentif/PM ${settings.tarif_insentif}`);
  showToast('Setting tersimpan. Jangan lupa perbarui Firestore rules kalau daftar email berubah.');renderBgn();
}
async function bgnSync(){
  _bg.busy='Mengambil transfer dari Kopra…';renderBgn();
  try{await bgnSyncAcuan(_bg.tgl);showToast('Transfer Kopra diperbarui.');}catch(e){showToast('Gagal: '+e.message,true);}
  _bg.busy='';renderBgn();
}
async function bgnUbahKel(ref,kel){
  const id=_bDocId(_bg.tgl);
  try{await _bRefHari(_bg.tgl).set({kel_override:{[ref]:kel}},{merge:true});await bgnSyncAcuan(_bg.tgl);
    addLog('bgn_kelompok','Ubah kelompok transfer BGN','bgn',id,ref,BGN_LABEL[BGN_KEL_DOK[kel]]);}
  catch(e){showToast('Gagal: '+e.message,true);}
}

// ----- Upload (tim dapur / tim) -----
async function bgnUpload(files){
  files=[...(files||[])];if(!files.length)return;
  const hasil=[];
  for(const f of files){
    _bg.busy='Membaca '+f.name+'…';renderBgn();
    try{hasil.push(await _bUploadSatu(f));}
    catch(e){hasil.push('⛔ '+f.name+': '+e.message);}
  }
  _bg.busy='';_bMuatDaftarHari();renderBgn();
  alert(hasil.join('\n'));
}
async function _bUploadSatu(f){
  if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf')throw new Error('bukan file PDF.');
  if(f.size>BGN_MAX_FILE)throw new Error('ukuran '+Math.round(f.size/1024)+' KB, maksimal '+Math.round(BGN_MAX_FILE/1024)+' KB.');
  const bytes=new Uint8Array(await f.arrayBuffer());
  let R;try{R=await _bItems(bytes);}catch(e){throw new Error('PDF tidak bisa dibuka ('+e.message+').');}
  if(!R.items.length)throw new Error('PDF tidak berisi teks (hasil scan/foto?). Upload PDF asli hasil export dari Excel/aplikasi BGN.');
  const jenis=_bJenis(R.items);
  if(!jenis)throw new Error('tidak dikenali sebagai SPM, Kuitansi, atau LPDH.');
  const parsed=_bParse(jenis,R.items);
  const pos=_bPosNama(R.items,_bS().nama_ttd);
  const tgl=_bTglDok(jenis,parsed)||_bg.tgl;
  if(tgl!==_bg.tgl&&!confirm(f.name+' bertanggal '+_bFmtTgl(tgl)+', bukan '+_bFmtTgl(_bg.tgl)+'.\n\nSimpan ke hari '+_bFmtTgl(tgl)+'?'))throw new Error('dibatalkan (tanggal dokumen '+_bFmtTgl(tgl)+').');
  const sha=await _bSha(bytes);
  const ref=_bRefHari(tgl);
  const cur=await ref.get();const lama=cur.exists&&cur.data().docs&&cur.data().docs[jenis];
  if(lama&&lama.sha===sha)return '• '+f.name+': sama persis dengan '+BGN_LABEL[jenis]+' yang sudah ada — dilewati.';
  const versi=(lama?lama.versi:0)+1;const key=tgl.replace(/-/g,'')+'_'+jenis+'_v'+versi;
  const n=await _bSimpanFile(key,bytes);
  const meta={key,n,nama:f.name,size:f.size,sha,versi,by:_bEmail(),at:new Date().toISOString(),parsed:JSON.parse(JSON.stringify(parsed,(k,v)=>typeof v==='number'&&isNaN(v)?null:v)),pos,halaman:R.pages};
  const FV=firebase.firestore.FieldValue;
  const hist=FV.arrayUnion({t:meta.at,by:meta.by,a:'upload',j:jenis,v:versi,f:f.name});
  // update() dengan path 'docs.<jenis>' mengganti metadata lama seluruhnya (set+merge akan mencampur)
  if(cur.exists){
    const patch={tgl,['docs.'+jenis]:meta,histori:hist};
    if(cur.data().approved||cur.data().tolak){patch.approved=null;patch.signed=null;patch.tolak=null;}
    await ref.update(patch);
  }else await ref.set({tgl,docs:{[jenis]:meta},histori:hist});
  if(_bg.mode!=='dapur'&&typeof addLog==='function'&&(typeof _dataLoaded==='undefined'||_dataLoaded))addLog('bgn_upload','Upload dokumen BGN','bgn',_bDocId(tgl),BGN_LABEL[jenis],f.name+' v'+versi);
  if(tgl!==_bg.tgl)bgnPilihTgl(tgl);
  return '✓ '+f.name+' → '+BGN_LABEL[jenis]+' '+_bFmtTgl(tgl)+(versi>1?' (versi '+versi+')':'');
}
// Angka NaN tidak bisa disimpan sebagai null lalu dibandingkan — kembalikan ke NaN
function _bParsedDariDoc(P){if(!P)return P;const o=JSON.parse(JSON.stringify(P));['jumlah','pm','bb','ops','ins_hitung','ins_bayar','saldo','topup','total'].forEach(k=>{if(o[k]===null)o[k]=NaN;});(o.rows||[]).forEach(r=>{if(r.jumlah===null)r.jumlah=NaN;});return o;}

// ----- Lihat / unduh -----
async function bgnLihat(j,signed){
  const d=_bg.day;const x=signed?d.signed[j]:d.docs[j];if(!x)return;
  try{const b=await _bAmbilFile(x.key,x.n);_bBukaBlob(b,signed?_bNamaTtd(d.docs[j].nama):d.docs[j].nama,false);}catch(e){showToast('Gagal membuka: '+e.message,true);}
}
function _bNamaTtd(n){return String(n||'dokumen.pdf').replace(/\.pdf$/i,'')+' - TTD.pdf';}
async function bgnUnduh(j){
  const d=_bg.day;const x=d.signed&&d.signed[j];if(!x)return;
  try{const b=await _bAmbilFile(x.key,x.n);await _bBukaBlob(b,_bNamaTtd(d.docs[j].nama),true);
    _bCatatHistori('unduh',j);}catch(e){if(e&&e.name!=='AbortError')showToast('Gagal mengunduh: '+e.message,true);}
}
async function bgnUnduhSemua(){
  const d=_bg.day;
  try{
    const files=[];for(const j of BGN_JENIS){const x=d.signed[j];const b=await _bAmbilFile(x.key,x.n);files.push(new File([b],_bNamaTtd(d.docs[j].nama),{type:'application/pdf'}));}
    // iPhone/Android: satu lembar Bagikan untuk keempat file (WhatsApp, Files, dst.)
    if(navigator.canShare&&navigator.canShare({files})&&/iPhone|iPad|Android/i.test(navigator.userAgent)){await navigator.share({files,title:'Dokumen BGN '+_bFmtTgl(_bg.tgl)});}
    else{for(const f of files){_bUnduhFile(f,f.name);await new Promise(r=>setTimeout(r,400));}}
    _bCatatHistori('unduh','semua');
  }catch(e){if(e&&e.name!=='AbortError')showToast('Gagal mengunduh: '+e.message,true);}
}
function _bUnduhFile(blob,nama){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nama;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
async function _bBukaBlob(bytes,nama,unduh){
  const f=new File([bytes],nama,{type:'application/pdf'});
  if(unduh){
    if(navigator.canShare&&navigator.canShare({files:[f]})&&/iPhone|iPad|Android/i.test(navigator.userAgent)){await navigator.share({files:[f],title:nama});return;}
    _bUnduhFile(f,nama);return;
  }
  const url=URL.createObjectURL(f);const w=window.open(url,'_blank');if(!w)_bUnduhFile(f,nama);setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function _bCatatHistori(a,j){
  const FV=firebase.firestore.FieldValue;
  _bRefHari(_bg.tgl).set({histori:FV.arrayUnion({t:new Date().toISOString(),by:_bEmail(),a,j})},{merge:true}).catch(()=>{});
}

// ----- Gambar tanda tangan -----
async function _bMuatTtd(){
  if(_bg.ttd&&_bg.ttdUid===_currentUser.uid)return _bg.ttd;
  const s=await _bRefTtd(_currentUser.uid).get();
  _bg.ttd=s.exists?s.data():null;_bg.ttdUid=_currentUser.uid;return _bg.ttd;
}
// Latar terang → transparan, tinta dipertahankan, dipotong ke kotak tinta
async function _bProsesTtd(file){
  const url=URL.createObjectURL(file);
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Gambar tidak bisa dibuka.'));i.src=url;});
  const sc=Math.min(1,1200/img.width);const W=Math.round(img.width*sc),Hh=Math.round(img.height*sc);
  const c=document.createElement('canvas');c.width=W;c.height=Hh;const g=c.getContext('2d');g.drawImage(img,0,0,W,Hh);URL.revokeObjectURL(url);
  const D=g.getImageData(0,0,W,Hh);const p=D.data;let x0=W,y0=Hh,x1=-1,y1=-1;
  for(let i=0;i<p.length;i+=4){
    const lum=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];
    let a=p[i+3];if(a>20){a=lum>200?0:Math.min(a,Math.round(255*Math.min(1,(215-lum)/90)));}
    p[i+3]=a;
    if(a>30){const k=i/4,x=k%W,y=(k-x)/W;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  }
  if(x1<0)throw new Error('Tidak ada tinta yang terdeteksi di gambar.');
  g.putImageData(D,0,0);const pad=6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(W-1,x1+pad);y1=Math.min(Hh-1,y1+pad);
  const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(c,x0,y0,o.width,o.height,0,0,o.width,o.height);
  return{png:o.toDataURL('image/png'),w:o.width,h:o.height};
}
async function bgnUploadTtd(file){
  if(!file||!_bIsOwner())return;
  try{
    const t=await _bProsesTtd(file);
    if(t.png.length>900*1024)throw new Error('Gambar terlalu besar setelah diproses — potong lebih rapat.');
    t.at=new Date().toISOString();
    await _bRefTtd(_currentUser.uid).set(t);_bg.ttd=t;_bg.ttdUid=_currentUser.uid;
    addLog('bgn_ttd','Ganti gambar tanda tangan','bgn','','',t.w+'×'+t.h+' px');showToast('Tanda tangan tersimpan.');renderBgn();
  }catch(e){showToast('Gagal: '+e.message,true);}
}

// ----- Pasang tanda tangan (pdf-lib) -----
async function _bPasangTtd(bytes,pos,ttd,S){
  const L=await _bPdfLib();
  const doc=await L.PDFDocument.load(bytes);
  const img=await doc.embedPng(_bUnB64(ttd.png.split(',')[1]));
  const page=doc.getPage(pos.p-1);
  const w=Math.max(80,Math.min(180,pos.w*(S.ttd_lebar||1.6)));const h=w*ttd.h/ttd.w;
  const x=pos.x+pos.w/2-w/2;const y=pos.y-(pos.h||10)*(S.ttd_turun||0);
  page.drawImage(img,{x,y,width:w,height:h});
  doc.setModificationDate(new Date());
  return new Uint8Array(await doc.save());
}
async function _bRenderHalaman(bytes,p,canvas){
  const L=await _bPdfjs();const pdf=await L.getDocument({data:bytes.slice()}).promise;const pg=await pdf.getPage(p);
  const vp0=pg.getViewport({scale:1});const sc=Math.min(2,(canvas.parentElement.clientWidth||600)/vp0.width)*(window.devicePixelRatio>1?1.5:1);
  const vp=pg.getViewport({scale:sc});canvas.width=vp.width;canvas.height=vp.height;canvas.style.width='100%';
  await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
}
// simpanBoleh=true: kalau semua cocok, tampilkan tombol "Simpan"; selain itu pratinjau saja
async function bgnSiapkanTtd(){
  if(!_bIsOwner())return;
  if(typeof _dataLoaded!=='undefined'&&!_dataLoaded){showToast('Data SIMS belum selesai dimuat.',true);return;}
  const d=_bg.day;const S=_bS();const tgl=_bg.tgl;
  try{
    _bg.busy='Memuat gambar tanda tangan…';renderBgn();
    const ttd=await _bMuatTtd();if(!ttd)throw new Error('Gambar tanda tangan belum diupload — buka Setting di bawah.');
    _bg.busy='Mengambil ulang transfer dari Kopra…';renderBgn();
    const acuan=await bgnSyncAcuan(tgl);
    const fresh={};const signed={};
    for(const j of BGN_JENIS){
      const x=d.docs[j];_bg.busy='Membaca ulang '+BGN_LABEL[j]+'…';renderBgn();
      const bytes=await _bAmbilFile(x.key,x.n);
      if(await _bSha(bytes)!==x.sha)throw new Error(BGN_LABEL[j]+': isi file di server tidak sama dengan yang dicek (sidik SHA-256 beda). Upload ulang.');
      const R=await _bItems(bytes);
      if(_bJenis(R.items)!==j)throw new Error(BGN_LABEL[j]+': isi file ternyata bukan '+BGN_LABEL[j]+'.');
      const pos=_bPosNama(R.items,S.nama_ttd);
      if(!pos)throw new Error(BGN_LABEL[j]+': nama "'+S.nama_ttd+'" tidak ditemukan di PDF — tidak tahu di mana tanda tangan dipasang.');
      fresh[j]={parsed:_bParse(j,R.items)};
      signed[j]={bytes:await _bPasangTtd(bytes,pos,ttd,S),pos,versi:x.versi};
    }
    const H=_bCekSemua(fresh,acuan,tgl,S,_bg.prev);
    _bg.preview={signed,H,tgl,acuan};_bg.busy='';
    _bTampilPreview();
  }catch(e){_bg.busy='';_bg.err=e.message;renderBgn();showToast(e.message,true);}
}
function _bTampilPreview(){
  const P=_bg.preview;if(!P)return;
  let m=document.getElementById('bgn-modal');if(m)m.remove();
  m=document.createElement('div');m.id='bgn-modal';m.className='modal-bg open';
  const boleh=!P.H.x;
  m.innerHTML=`<div class="modal" style="max-width:860px"><div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><b>${boleh?'Periksa posisi tanda tangan':'Pratinjau saja'}</b> — ${_bFmtTgl(P.tgl)}<div style="font-size:12px;color:${boleh?'var(--t3)':'var(--dn)'}">${boleh?'Cek ulang di perangkat ini: 0 selisih'+(P.H.w?', '+P.H.w+' peringatan':'')+'. Halaman bertanda tangan:':'Masih ada '+P.H.x+' selisih ⛔ setelah dicek ulang — tidak bisa disimpan.'}</div></div>
      <div class="bg">${boleh?'<button class="btn bp bsm" id="bgn-btn-simpan" onclick="bgnSimpanTtd()">✓ Setujui &amp; simpan 4 dokumen</button>':''}<button class="btn bsm" onclick="bgnTutupPreview()">Tutup</button></div></div>
    <div style="padding:12px 16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${BGN_JENIS.map(j=>`<div><div style="font-size:12px;font-weight:600;margin-bottom:4px">${BGN_LABEL[j]} · hlm ${P.signed[j].pos.p}</div><div style="border:1px solid var(--bd)"><canvas id="bgn-cv-${j}"></canvas></div></div>`).join('')}
    </div></div>`;
  document.body.appendChild(m);
  BGN_JENIS.forEach(j=>_bRenderHalaman(P.signed[j].bytes,P.signed[j].pos.p,document.getElementById('bgn-cv-'+j)).catch(e=>console.warn('[BGN] render',e)));
}
function bgnTutupPreview(){_bg.preview=null;const m=document.getElementById('bgn-modal');if(m)m.remove();renderBgn();}
async function bgnSimpanTtd(){
  const P=_bg.preview;if(!P||P.H.x||!_bIsOwner())return;
  const btn=document.getElementById('bgn-btn-simpan');if(btn){btn.disabled=true;btn.textContent='Menyimpan…';}
  try{
    const ref=_bRefHari(P.tgl);
    const cur=(await ref.get()).data();
    // Ada upload baru sejak pratinjau dibuat → jangan tandatangani versi lama
    const berubah=BGN_JENIS.filter(j=>!cur.docs[j]||cur.docs[j].versi!==P.signed[j].versi);
    if(berubah.length)throw new Error('Ada dokumen baru diupload sejak pratinjau ('+berubah.map(j=>BGN_LABEL[j]).join(', ')+'). Ulangi.');
    const signed={},versi={};
    for(const j of BGN_JENIS){
      const key=P.tgl.replace(/-/g,'')+'_'+j+'_v'+P.signed[j].versi+'_ttd';
      const n=await _bSimpanFile(key,P.signed[j].bytes);
      signed[j]={key,n,sha:await _bSha(P.signed[j].bytes),pos:P.signed[j].pos};versi[j]=P.signed[j].versi;
      _bFileCache[key]=P.signed[j].bytes;
    }
    const at=new Date().toISOString();
    await ref.update({signed,approved:{by:_bEmail(),at,versi},tolak:null,status:BGN_STATUS.ok,nx:0,
      histori:firebase.firestore.FieldValue.arrayUnion({t:at,by:_bEmail(),a:'setuju'})});
    const A=P.acuan;
    addLog('bgn_setuju','Setujui & tanda tangani dokumen BGN','bgn',_bDocId(P.tgl),_bFmtTgl(P.tgl),
      `BB ${_bRp(_bSum(A,'bb'))} · OPS ${_bRp(_bSum(A,'ops'))} · insentif ${_bRp(_bSum(A,'ins'))} · ${BGN_JENIS.map(j=>(cur.docs[j].parsed&&cur.docs[j].parsed.nomor)||BGN_LABEL[j]).join(', ')}`);
    showToast('Disetujui — 4 dokumen bertanda tangan siap diunduh tim dapur.');
    bgnTutupPreview();
  }catch(e){showToast('Gagal menyimpan: '+e.message,true);if(btn){btn.disabled=false;btn.textContent='✓ Setujui & simpan 4 dokumen';}}
}
async function bgnTolak(){
  if(!_bIsOwner())return;
  const d=_bg.day;const ok=d.status===BGN_STATUS.ok||d.approved;
  const cat=prompt(ok?'Batalkan persetujuan — alasan (tim dapur akan melihatnya):':'Catatan untuk tim dapur (apa yang harus diperbaiki):');
  if(!cat||!cat.trim())return;
  const at=new Date().toISOString();
  try{
    await _bRefHari(_bg.tgl).set({tolak:{catatan:cat.trim(),by:_bEmail(),at},approved:null,signed:null,status:BGN_STATUS.tolak,
      histori:firebase.firestore.FieldValue.arrayUnion({t:at,by:_bEmail(),a:ok?'batal':'tolak',c:cat.trim()})},{merge:true});
    addLog(ok?'bgn_batal':'bgn_tolak',ok?'Batalkan persetujuan dokumen BGN':'Tolak dokumen BGN','bgn',_bDocId(_bg.tgl),_bFmtTgl(_bg.tgl),cat.trim());
  }catch(e){showToast('Gagal: '+e.message,true);}
}
