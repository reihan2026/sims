// ===== FIREBASE INIT =====
const firebaseConfig={apiKey:"AIzaSyDVno4yTcgOdCAf9X-VaNwulIUOYSry_24",authDomain:"sims-supply.firebaseapp.com",projectId:"sims-supply",storageBucket:"sims-supply.firebasestorage.app",messagingSenderId:"358117996377",appId:"1:358117996377:web:1d5fc8b448e7d0db5e7e48"};
firebase.initializeApp(firebaseConfig);
const auth=firebase.auth();
const db=firebase.firestore();

// ===== AUTH =====
let _currentUser=null;
auth.onAuthStateChanged(user=>{
  if(user){
    _currentUser=user;
    document.getElementById('login-screen').style.display='none';
    document.querySelector('.shell').style.display='';
    const name=user.email.split('@')[0];
    document.getElementById('user-display-name').textContent=user.email;
    document.getElementById('user-avatar').textContent=name.substring(0,2).toUpperCase();
    loadAllData().then(()=>{normalizeDapurRefs();syncPassthroughInvV();syncMissingPTInvD();syncPTInvDTotals();initUserProfile();renderDashboard();updateDL();});
  } else {
    _currentUser=null;
    document.getElementById('login-screen').style.display='flex';
    document.querySelector('.shell').style.display='none';
  }
});
function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-pw').value;
  const err=document.getElementById('login-err');const btn=document.getElementById('login-btn');
  if(!email||!pw){err.style.display='block';err.textContent='Isi email dan password.';return;}
  btn.textContent='Masuk...';btn.disabled=true;err.style.display='none';
  auth.signInWithEmailAndPassword(email,pw).catch(e=>{
    err.style.display='block';
    err.textContent=e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'?'Email atau password salah.':e.code==='auth/user-not-found'?'Email tidak terdaftar.':e.message;
    btn.textContent='Masuk';btn.disabled=false;
  });
}
function doLogout(){if(!confirm('Keluar dari SIMS?'))return;if(_snapshotUnsub){_snapshotUnsub();_snapshotUnsub=null;}auth.signOut();}
function showForgotPw(){
  const email=document.getElementById('login-email').value.trim()||prompt('Masukkan email Anda:');
  if(!email)return;
  auth.sendPasswordResetEmail(email).then(()=>alert('Email reset dikirim ke '+email)).catch(e=>alert('Gagal: '+e.message));
}
