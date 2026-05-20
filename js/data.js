// ===== DATA LAYER =====
const _cache={po:[],invv:[],invd:[],pov:[],rek:[],vendor_saya:[],master:{dapur:[],vendor:[]},log:[],user:{nama:'',initial:''},ctr_invv:0,ctr_invd:0,ctr_pov:0};
function loadAllData(){
  return new Promise((resolve)=>{
    // Unsubscribe any existing listener first
    if(_snapshotUnsub){_snapshotUnsub();_snapshotUnsub=null;}

    let resolved=false;
    _snapshotUnsub=db.collection('sims').doc('data').onSnapshot(
      {includeMetadataChanges:false},
      snap=>{
        // Skip snapshots triggered by our own pending write to avoid render flicker
        if(_ignoreNextSnapshot&&snap.metadata.hasPendingWrites){return;}
        _ignoreNextSnapshot=false;

        if(snap.exists){
          const d=snap.data();
          // Only update keys that aren't currently dirty (avoid overwriting unsaved local edits)
          Object.keys(_cache).forEach(k=>{
            if(!_dirty.has(k)&&d[k]!==undefined)_cache[k]=d[k];
          });
          Object.keys(d).forEach(k=>{if(k.startsWith('file_'))_cache[k]=d[k];});
        }

        // Auto-fix counter from existing data
        const fixCtr=(invArr,key,prefix)=>{
          const maxN=(invArr||[]).reduce((mx,iv)=>{
            const m=iv.no?.match(new RegExp(prefix+'(\\d+)'));
            return m?Math.max(mx,parseInt(m[1])):mx;
          },0);
          if(maxN>(_cache[key]||0))_cache[key]=maxN;
        };
        fixCtr(_cache.invv,'ctr_invv','INV-V-');
        fixCtr(_cache.invd,'ctr_invd','INV-D-');

        // Auto-fix invoices stuck in 'belum' despite being fully paid
        let statusFixed=0;
        (_cache.invv||[]).forEach(iv=>{
          if(iv.bayar_status!=='lunas'){
            const paid=(iv.payments||[]).reduce((s,p)=>s+p.jumlah,0);
            const retur=(iv.returs||[]).reduce((s,r)=>s+r.val,0);
            const netTotal=Math.max(0,(iv.total||0)-retur);
            if(paid>=netTotal&&netTotal>0){iv.bayar_status='lunas';statusFixed++;}
          }
        });
        (_cache.invd||[]).forEach(id=>{
          if(id.terima_status!=='lunas'){
            const recv=(id.payments||[]).reduce((s,p)=>s+p.jumlah,0);
            if(recv>=(id.total||0)&&id.total>0){id.terima_status='lunas';statusFixed++;}
          }
        });
        if(statusFixed>0){saveData(['invv','invd']);console.log(`[SIMS] Auto-fixed ${statusFixed} invoice statuses`);}

        // Dedup vendor_saya by nama (keep first occurrence per name)
        if((_cache.vendor_saya||[]).length>0){
          const seen=new Set();const before=_cache.vendor_saya.length;
          _cache.vendor_saya=_cache.vendor_saya.filter(v=>{if(seen.has(v.nama))return false;seen.add(v.nama);return true;});
          if(_cache.vendor_saya.length<before){saveData(['vendor_saya']);console.log(`[SIMS] Deduped vendor_saya: ${before}→${_cache.vendor_saya.length}`);}
        }

        _rc.invalidate();

        // Save to localStorage for offline fallback
        try{localStorage.setItem('sims_cache',JSON.stringify({data:{po:_cache.po,invv:_cache.invv,invd:_cache.invd,rek:_cache.rek,master:_cache.master},saved:new Date().toISOString()}));}catch(e){}

        // Detect concurrent edit from another user
        if(!_ignoreNextSnapshot&&_dirty.size>0&&resolved){_showConcurrentWarning();}

        _hideOfflineBanner();

        if(!resolved){
          // First snapshot — resolve the promise (used by initial login flow)
          resolved=true;
          resolve();
        } else {
          // Subsequent snapshots — re-render active page if not in middle of editing
          _reRenderActivePage();
        }
      },
      err=>{
        console.error('[SIMS] onSnapshot error:',err);
        // Try to load from localStorage as read-only fallback
        try{
          const cached=localStorage.getItem('sims_cache');
          if(cached){const{data,saved}=JSON.parse(cached);Object.assign(_cache,data);_showOfflineBanner(saved);}
        }catch(e){}
        if(!resolved){resolved=true;resolve();}
      }
    );
  });
}

function _showOfflineBanner(saved){
  let b=document.getElementById('offline-banner');
  if(!b){b=document.createElement('div');b.id='offline-banner';b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:#fff;font-size:12px;font-weight:600;padding:7px 16px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px';document.body.prepend(b);}
  const tgl=saved?new Date(saved).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'tidak diketahui';
  b.innerHTML=`Koneksi terputus — menampilkan data offline per ${tgl}. Perubahan tidak bisa disimpan. <button onclick="this.closest('#offline-banner').remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px">✕</button>`;
}
function _hideOfflineBanner(){const b=document.getElementById('offline-banner');if(b)b.remove();}
let _concurrentWarnTimer=null;
function _showConcurrentWarning(){
  if(document.getElementById('concurrent-banner'))return;
  const b=document.createElement('div');b.id='concurrent-banner';b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9998;background:#e67e22;color:#fff;font-size:12px;font-weight:600;padding:7px 16px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px';
  b.innerHTML='Ada perubahan masuk dari pengguna lain. Tunggu status ✓ Tersimpan sebelum reload. <button onclick="this.closest(\'#concurrent-banner\').remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px">✕</button>';
  document.body.prepend(b);
  if(_concurrentWarnTimer)clearTimeout(_concurrentWarnTimer);
  _concurrentWarnTimer=setTimeout(()=>{const el=document.getElementById('concurrent-banner');if(el)el.remove();},8000);
}

function _reRenderActivePage(){
  // Don't interrupt if a modal is open
  const anyModalOpen=document.querySelector('.modal-bg[style*="flex"]')||document.querySelector('.modal-bg.open');
  if(anyModalOpen)return;
  // Re-render current page silently
  try{
    if(_currentPage==='dash')renderDashboard();
    else if(_currentPage==='daftar-po')renderDaftar();
    else if(_currentPage==='inv-vendor')renderInvV();
    else if(_currentPage==='inv-dapur')renderInvD();
    else if(_currentPage==='cashflow')renderCashflow();
    else if(_currentPage==='rekening')renderRekening();
    // detail PO: re-render only if not in edit state
    if(_currentPoId&&_currentPage==='daftar-po')showDetail(_currentPoId);
  }catch(e){console.error('[SIMS] re-render error:',e);}
}


// Strip undefined values — Firebase rejects them
function stripUndefined(obj){
  if(Array.isArray(obj))return obj.map(stripUndefined);
  if(obj&&typeof obj==='object'){const r={};Object.keys(obj).forEach(k=>{if(obj[k]!==undefined)r[k]=stripUndefined(obj[k]);});return r;}
  return obj;
}

function _pgBar(pgKey,pgFn,pg,pgTotal,total){
  if(pgTotal<=1)return'';
  const start=pg*PG_SIZE+1;const end=Math.min((pg+1)*PG_SIZE,total);
  return`<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 0;font-size:12px;color:var(--t2)">
    <button class="btn bsm" onclick="${pgFn}(-1)" ${pg===0?'disabled':''}>← Prev</button>
    <span style="font-family:var(--mn)">${start}–${end} dari ${total}</span>
    <button class="btn bsm" onclick="${pgFn}(1)" ${pg>=pgTotal-1?'disabled':''}>Next →</button>
  </div>`;
}
function pgInvV(d){_pg.invv=Math.max(0,_pg.invv+d);renderInvV();}
function pgInvD(d){_pg.invd=Math.max(0,_pg.invd+d);renderInvD();}
function pgDaftar(d){_pg.daftar=Math.max(0,_pg.daftar+d);renderDaftar();}
function _rekonKeys(){try{return new Set(JSON.parse(localStorage.getItem('sims_rekon')||'[]'));}catch(e){return new Set();}}
function _rekonKey(p){return p.id||(p.dir+'|'+p.no+'|'+p.tgl+'|'+p.jumlah);}
function toggleRekon(key){const s=_rekonKeys();if(s.has(key))s.delete(key);else s.add(key);localStorage.setItem('sims_rekon',JSON.stringify([...s]));renderCashflow();}

// ===== BATCH FIREBASE WRITE =====
// Collects all changes within 300ms window, sends as single write
const _dirty=new Set();
let _saveTimer=null;
let _saving=false;
let _pendingAfterSave=false;
let _snapshotUnsub=null; // onSnapshot unsubscribe handle
let _ignoreNextSnapshot=false; // skip snapshot triggered by our own save
let _currentPage='dash'; // track active page for selective re-render
const _pg={invv:0,invd:0,daftar:0};
const _pgHash={invv:'',invd:'',daftar:''};
const PG_SIZE=20;
let _rekonMode=false;
let _logShowAll=false;

function saveData(keys){
  if(!_currentUser)return;
  // Mark keys as dirty
  (keys||Object.keys(_cache)).forEach(k=>{
    if(k.startsWith('file_'))return;// files handled separately
    _dirty.add(k);
  });
  // Debounce: reset timer on each call, fire after 300ms of silence
  if(_saveTimer)clearTimeout(_saveTimer);
  _saveTimer=setTimeout(_flushSave,300);
}

function _setSaveStatus(msg,color){
  const el=document.getElementById('save-status');
  if(el){el.textContent=msg;el.style.color=color||'var(--t3)';}
}

async function _flushSave(){
  if(!_currentUser||_dirty.size===0)return;
  if(_saving){_pendingAfterSave=true;return;}
  _saving=true;
  _setSaveStatus('⟳ Menyimpan...','var(--wn)');
  const keysToSave=[..._dirty];
  _dirty.clear();
  _saveTimer=null;
  const payload={};
  keysToSave.forEach(k=>{if(_cache[k]!==undefined)payload[k]=stripUndefined(_cache[k]);});
  try{
    _ignoreNextSnapshot=true; // our own write — skip the echo snapshot
    await db.collection('sims').doc('data').set(payload,{merge:true});
    const sizeKB=Math.round(JSON.stringify(Object.fromEntries(Object.entries(_cache).filter(([k])=>!k.startsWith('file_')))).length/1024);
    const sizeColor=sizeKB>900?'var(--dn)':sizeKB>700?'var(--wn)':'var(--ac)';
    _setSaveStatus(`✓ Tersimpan · ~${sizeKB} KB / 1024 KB`,sizeColor);
    setTimeout(()=>_setSaveStatus(`✓ Tersimpan · ~${sizeKB} KB`,sizeKB>700?sizeColor:'var(--t3)'),2000);
    const cb=document.getElementById('concurrent-banner');if(cb)cb.remove();
  }catch(e){
    console.error('Firebase save error:',e);
    _setSaveStatus('✕ Gagal simpan','var(--dn)');
    keysToSave.forEach(k=>_dirty.add(k));
    if(_saveTimer)clearTimeout(_saveTimer);
    _saveTimer=setTimeout(_flushSave,2000);
  }finally{
    _saving=false;
    if(_pendingAfterSave){_pendingAfterSave=false;_flushSave();}
  }
}

// Force immediate save — call before critical operations
async function flushNow(){
  if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}
  if(_dirty.size>0)await _flushSave();
}
const ST={g:(k,d)=>_cache[k]!==undefined?_cache[k]:d,s:(k,v)=>{_cache[k]=v;saveData([k]);}};
const getPOs=()=>_cache.po;
const setPOs=d=>{_cache.po=d;_rc.invalidate();saveData(['po']);};
const getMaster=()=>_cache.master;
const setMaster=m=>{_cache.master=m;saveData(['master']);};
const getReks=()=>_cache.rek;
const setReks=d=>{_cache.rek=d;saveData(['rek']);};
const getInvV=()=>_cache.invv;
const setInvV=d=>{_cache.invv=d;_rc.invalidate();saveData(['invv']);};
const getInvD=()=>_cache.invd;
const setInvD=d=>{_cache.invd=d;_rc.invalidate();saveData(['invd']);};
const getPOVs=()=>_cache.pov||[];
const setPOVs=d=>{_cache.pov=d;saveData(['pov']);};
const getVendorSaya=()=>_cache.vendor_saya||[];
const setVendorSaya=d=>{_cache.vendor_saya=d;saveData(['vendor_saya']);};
function nextCtrPOV(){_cache.ctr_pov=(_cache.ctr_pov||0)+1;saveData(['ctr_pov']);return String(_cache.ctr_pov).padStart(3,'0');};

// Batch setter — update multiple keys at once, single Firebase write
function setBatch(updates){
  Object.entries(updates).forEach(([k,v])=>{_cache[k]=v;});
  // Invalidate if any key affects render cache
  if(updates.invv||updates.invd||updates.po)_rc.invalidate();
  saveData(Object.keys(updates));
}

function nextInvNo(type){
  const key=type==='v'?'ctr_invv':'ctr_invd';
  _cache[key]=(_cache[key]||0)+1;
  saveData([key]);
  return(type==='v'?'INV-V-':'INV-D-')+String(_cache[key]).padStart(3,'0');
}
// File storage — separate Firestore collection to avoid 1MB main doc limit
const saveFile=async(key,dataUrl)=>{
  _cache['file_'+key]=dataUrl;
  if(_currentUser){
    try{await db.collection('sims_files').doc(key).set({data:dataUrl});}
    catch(e){console.error('saveFile:',e);}
  }
};
const getFile=k=>_cache['file_'+k]||null;
const loadFile=async(key)=>{
  if(_cache['file_'+key])return _cache['file_'+key];
  try{const s=await db.collection('sims_files').doc(key).get();if(s.exists){_cache['file_'+key]=s.data().data;return _cache['file_'+key];}}
  catch(e){console.error('loadFile:',e);}
  return null;
};
function backupData(){
  const data={po:getPOs(),invv:getInvV(),invd:getInvD(),pov:getPOVs(),rek:getReks(),vendor_saya:getVendorSaya(),master:getMaster(),ctr_invv:_cache.ctr_invv,ctr_invd:_cache.ctr_invd,ctr_pov:_cache.ctr_pov,exported:new Date().toISOString(),ver:'5'};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='SIMS-backup-'+today()+'.json';a.click();localStorage.setItem('sims_last_backup',new Date().toISOString());showToast('Backup berhasil didownload!');
}
function restoreData(){
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{
    try{const data=JSON.parse(ev.target.result);if(!data.po||!data.invv)throw new Error('Format tidak valid');
      if(!confirm(`Restore dari backup ${data.exported?.split('T')[0]||'?'}?\n\nSEMUA DATA SAAT INI AKAN DIGANTIKAN.`))return;
      ['po','invv','invd','pov','rek','vendor_saya','master','ctr_invv','ctr_invd','ctr_pov'].forEach(k=>{if(data[k]!==undefined)_cache[k]=data[k];});
      addLog('restore_backup','Restore backup','sistem','','',data.exported||'unknown');
      saveData();showToast('Restore berhasil! Memuat ulang...');setTimeout(()=>location.reload(),1200);
    }catch(err){showToast('Gagal restore: '+err.message,true);}
  };r.readAsText(file);};input.click();
}
