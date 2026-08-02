// ===== ARSIP DATA — pembangun ringkasan =====
// Fungsi murni: tidak menyentuh _cache, tidak menulis Firestore.
// Semua agregat yang dibutuhkan laporan setelah PO dipindah ke sims_arsip/{periode}.

// PO diarsipkan setelah lebih tua dari ini. Turunkan ke 2 kalau dokumen terasa mepet.
const ARSIP_BULAN=3;

// Batas periode: PO dengan date < batas ini layak diarsip.
// Mengembalikan 'YYYY-MM' — periode paling awal yang MASIH ditahan di dokumen utama.
function arsipBatasPeriode(hariIni){
  const d=new Date((hariIni||today())+'T00:00:00');
  d.setMonth(d.getMonth()-ARSIP_BULAN);
  return d.toISOString().substring(0,7);
}

// PO tutup penuh = semua item diterima, semua invV lunas, semua invD lunas.
// Hanya PO tutup yang boleh diarsip — yang masih berjalan tetap butuh diedit.
function poTutupPenuh(po,invvs,invds){
  const items=po.items||[];
  if(!items.length)return false;
  if(!items.every(i=>i.status_kirim==='diterima'))return false;
  const vs=invvs.filter(v=>v.po_id===po.id);
  const ds=invds.filter(d=>d.po_id===po.id);
  if(!vs.every(v=>v.bayar_status==='lunas'))return false;
  if(!ds.every(d=>d.terima_status==='lunas'))return false;
  return true;
}

// Kelompokkan PO yang layak arsip per periode 'YYYY-MM' (berdasarkan po.date).
function periodeLayakArsip(pos,invvs,invds,hariIni){
  const batas=arsipBatasPeriode(hariIni);
  const per={};
  (pos||[]).forEach(po=>{
    const periode=(po.date||'').substring(0,7);
    if(!periode||periode>=batas)return;
    if(!poTutupPenuh(po,invvs,invds))return;
    if(!per[periode])per[periode]={periode,pos:[],invvs:[],invds:[]};
    per[periode].pos.push(po);
  });
  Object.values(per).forEach(g=>{
    const ids=new Set(g.pos.map(p=>p.id));
    g.invvs=(invvs||[]).filter(v=>ids.has(v.po_id));
    g.invds=(invds||[]).filter(d=>ids.has(d.po_id));
  });
  return Object.values(per).sort((a,b)=>a.periode.localeCompare(b.periode));
}

// Ringkasan padat satu periode. Bentuknya mengikuti apa yang dibaca laporan:
// _lkBuildData (js/laporan.js), _getKonsumsiRows, renderCashflow, renderRekening.
function buildRingkasan(pos,invvs,invds){
  // tp/tv/margin memakai basis poTotals (nilai PO vs harga vendor) — beda dari
  // revenue/modal yang berbasis total invoice. Rekap Bulanan dashboard pakai yang ini.
  const r={revenue:0,modal:0,ongkir:0,cashback:0,profit:0,po_cnt:0,
    tp:0,tv:0,margin:0,
    byVendor:{},byDapur:{},po:[],konsumsi:[],bayar:{},rek:{},dapurs:[],vendors:[]};
  const konsMap=new Map();
  const dapurSet=new Set(),vendorSet=new Set();

  (pos||[]).forEach(po=>{
    const ivs=(invvs||[]).filter(v=>v.po_id===po.id);
    const ids=(invds||[]).filter(d=>d.po_id===po.id);
    const revenue=ids.reduce((s,d)=>s+(d.total||0),0);
    const modal=ivs.reduce((s,v)=>s+(v.total||0),0);
    const ongkir=ivs.reduce((s,v)=>s+(v.ongkir||0),0);
    const cashback=ivs.reduce((s,v)=>s+(v.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0),0);
    const profit=revenue-modal-ongkir+cashback;
    r.revenue+=revenue;r.modal+=modal;r.ongkir+=ongkir;r.cashback+=cashback;r.profit+=profit;r.po_cnt++;
    // Basis Rekap Bulanan — dihitung ulang di sini agar tidak bergantung pada
    // cache render (_rc) yang isinya hanya data hidup.
    let tp=0,tvFilled=0,tpFilled=0;
    (po.items||[]).forEach(i=>{
      tp+=(i.qty||0)*(i.harga_po||0);
      if(i.harga_vendor>0){tpFilled+=(i.qty||0)*(i.harga_po||0);tvFilled+=(i.qty||0)*(i.harga_vendor||0);}
    });
    r.tp+=tp;r.tv+=tvFilled;r.margin+=tpFilled-tvFilled-ongkir;
    if(po.dapur)dapurSet.add(po.dapur);
    r.po.push({id:po.id,no:po.no,date:po.date,dapur:po.dapur||'',
      revenue,modal,ongkir,cashback,profit,n_item:(po.items||[]).length});

    ivs.forEach(iv=>{
      const v=iv.vendor||'(tanpa vendor)';
      vendorSet.add(v);
      if(!r.byVendor[v])r.byVendor[v]={modal:0,ongkir:0,cashback:0};
      r.byVendor[v].modal+=iv.total||0;
      r.byVendor[v].ongkir+=iv.ongkir||0;
      r.byVendor[v].cashback+=(iv.cashbacks||[]).reduce((sc,c)=>sc+c.jumlah,0);
    });
    ids.forEach(d=>{
      const dp=d.dapur||po.dapur||'(tanpa dapur)';
      if(!r.byDapur[dp])r.byDapur[dp]={revenue:0,cnt:0};
      r.byDapur[dp].revenue+=d.total||0;r.byDapur[dp].cnt++;
    });

    // Konsumsi bahan baku — tiru _getKonsumsiRows (js/laporan.js:458) lalu gabung
    // baris dengan kunci yang sama supaya ringkas.
    (po.items||[]).forEach(item=>{
      if(item.status_kirim!=='diterima')return;
      const tgl=item.tgl_diterima||po.date||'';
      const bulan=tgl.substring(0,7);
      const satuan=item.satuan||'pcs';
      const qty=Math.max(0,(item.qty||0)-(item.retur?.qty||0));
      const harga=(item.harga_vendor>0?item.harga_vendor:(item.harga_po||0));
      const nama=(item.nama||'').trim();
      const kat=item.kat||'Lainnya';
      const vendor=item.vendor||'—';
      const k=[nama,kat,satuan,vendor,po.dapur||'',bulan].join('||');
      if(!konsMap.has(k))konsMap.set(k,{nama,kat,satuan,vendor,dapur:po.dapur||'',bulan,qty:0,nilai:0});
      const row=konsMap.get(k);
      row.qty+=qty;row.nilai+=harga*qty;
    });
  });

  // Pembayaran dikelompokkan per bulan TRANSAKSI (bisa beda dari periode PO)
  // dan per rekening — dipakai Cashflow & halaman Rekening.
  const catat=(payments,arah)=>{
    (payments||[]).forEach(p=>{
      const bl=(p.tgl||'').substring(0,7);
      if(bl){
        if(!r.bayar[bl])r.bayar[bl]={keluar:0,masuk:0};
        r.bayar[bl][arah]+=p.jumlah||0;
      }
      if(p.rek_id){
        if(!r.rek[p.rek_id])r.rek[p.rek_id]={keluar:0,masuk:0};
        r.rek[p.rek_id][arah]+=p.jumlah||0;
      }
    });
  };
  (invvs||[]).forEach(iv=>catat(iv.payments,'keluar'));
  (invds||[]).forEach(d=>catat(d.payments,'masuk'));

  r.konsumsi=[...konsMap.values()];
  r.dapurs=[...dapurSet].sort();
  r.vendors=[...vendorSet].sort();
  return r;
}

// ===== Akses ringkasan yang sudah tersimpan =====
function getArsipRingkas(){return _cache.arsip_ringkas||{};}
function getArsipIdx(){return _cache.arsip_idx||[];}

// Semua baris konsumsi dari seluruh periode terarsip.
function arsipKonsumsiRows(){
  const out=[];
  Object.values(getArsipRingkas()).forEach(r=>{(r.konsumsi||[]).forEach(x=>out.push(x));});
  return out;
}
