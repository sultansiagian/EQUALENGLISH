/**
 * Login Google untuk halaman-halaman admin. DIPAKAI BERSAMA oleh
 * /admin (admin.js) dan /pendaftar (pendaftar.js).
 *
 * Sengaja dipisah ke file sendiri begitu halaman admin jadi lebih dari
 * satu: menyalin logika login ke tiap halaman berarti satu perbaikan
 * harus diketik dua kali, dan cepat atau lambat salah satunya
 * ketinggalan. Di proyek ini sudah pernah kejadian versi tersalin yang
 * menyimpang (lihat komentar [hidden] di admin.css), jadi kali ini
 * dipisah dari awal.
 *
 * Tidak ada session/cookie. ID token Google disimpan di variabel JS
 * selama halaman terbuka, dan dikirim ulang di header Authorization tiap
 * kali memanggil endpoint admin. Token Google berlaku sekitar 1 jam;
 * setelah itu server menolak dan halaman ini minta login ulang.
 *
 * CARA DIPAKAI halaman yang menyertakan file ini:
 *   1. Sediakan lima panel dengan id admin-panel-signin / -loading /
 *      -denied / -error / -dashboard
 *   2. Definisikan window.onAdminReady = function (data) { ... }
 *      Dipanggil setelah login terverifikasi sebagai admin. Isi `data`
 *      adalah balasan /api/admin-content (ada .email dan .values).
 *   3. Muat file ini SEBELUM script halamannya sendiri.
 */

var currentIdToken = null;

/* Cadangan kalau admin-motion.js gagal dimuat.
 *
 * File itu isinya hiasan: reveal, angka menghitung naik, keadaan tombol.
 * Halaman-halaman admin memanggil fungsinya dari kode penyimpanan yang
 * BUKAN hiasan, jadi kalau file-nya hilang, tombol Simpan akan melempar
 * "tombolSibuk is not a function" dan menyimpan jadi mustahil. Menukar
 * animasi dengan kemampuan menyimpan jelas bukan tukar yang benar.
 *
 * Ditaruh di sini karena admin-auth.js selalu dimuat (tanpa dia tidak ada
 * halaman admin sama sekali) dan urutannya SETELAH admin-motion.js, jadi
 * `||` di bawah tidak pernah menimpa versi asli yang berhasil dimuat. */
window.tombolSibuk =
  window.tombolSibuk ||
  function (tombol, sibuk) {
    if (tombol) tombol.disabled = !!sibuk;
  };
window.tombolBerhasil = window.tombolBerhasil || function () {};
window.hitungNaik =
  window.hitungNaik ||
  function (elemen, nilai, format) {
    if (elemen) elemen.textContent = (format || String)(nilai);
  };

/* =====================================================================
   TOKEN BERTAHAN ANTAR HALAMAN
   =====================================================================
   Dulu token cuma ada di variabel currentIdToken di atas, dan variabel
   JS mati tiap kali halaman dimuat ulang. Akibatnya pindah dari /admin
   ke /pendaftar berarti login Google lagi, padahal loginnya baru sedetik
   yang lalu. Waktu navigasinya masih berupa bar mendatar yang jarang
   dipakai itu cuma menjengkelkan; setelah jadi sidebar yang mengundang
   pindah halaman, jadi tidak masuk akal.

   sessionStorage, BUKAN localStorage: isinya ikut hilang begitu tab
   ditutup. Untuk alat admin itu batas yang benar -- tidak ada alasan
   token tertinggal di komputer setelah pekerjaannya selesai.

   Ini TIDAK melonggarkan keamanan. Yang disimpan adalah token yang sama
   persis yang tadinya dipegang di memori, umurnya tetap sekitar 1 jam
   dari Google, dan server tetap memverifikasinya dari nol di setiap
   permintaan lewat requireAdmin() -- tidak ada satu pun pemeriksaan yang
   dipindah ke sisi browser. Skrip jahat yang bisa membaca sessionStorage
   halaman ini juga sudah bisa membaca variabel currentIdToken sejak
   dulu, jadi permukaan serangannya sama saja. */
var KUNCI_TOKEN = 'equalAdminIdToken';

function bacaProfilToken(token) {
  try {
    var bagian = token.split('.');
    return JSON.parse(atob(bagian[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch (err) {
    // Cuma buat ditampilkan dan buat cek kedaluwarsa; kalau gagal
    // dibaca, server tetap yang menentukan.
    return null;
  }
}

function tokenKedaluwarsa(token) {
  var profil = bacaProfilToken(token);
  // Tidak punya exp atau tidak bisa dibaca sama sekali: perlakukan
  // sebagai tidak layak pakai, jangan dikirim ke server.
  if (!profil || !profil.exp) return true;
  // Disisakan 30 detik supaya token yang tinggal sedetik lagi tidak
  // dipakai lalu ditolak di tengah jalan.
  return Date.now() >= profil.exp * 1000 - 30000;
}

function simpanToken(token) {
  currentIdToken = token;
  try {
    window.sessionStorage.setItem(KUNCI_TOKEN, token);
  } catch (err) {
    // Sebagian browser melarang sessionStorage di mode penyamaran. Itu
    // bukan alasan untuk menggagalkan login: token tetap ada di memori,
    // cuma tidak bertahan waktu pindah halaman, persis seperti perilaku
    // sebelum bagian ini ada.
  }
}

function lupakanToken() {
  currentIdToken = null;
  try {
    window.sessionStorage.removeItem(KUNCI_TOKEN);
  } catch (err) {
    // Tidak bisa dihapus berarti memang tidak pernah tersimpan.
  }
}

function showPanel(name) {
  ['signin', 'loading', 'denied', 'error', 'dashboard'].forEach(function (p) {
    var el = document.getElementById('admin-panel-' + p);
    if (el) el.hidden = p !== name;
  });

  // Sidebar navigasi cuma masuk akal setelah login: sebelum itu semua
  // halaman admin cuma menampilkan tombol login yang sama, jadi menawarkan
  // pindah halaman tidak membawa ke mana-mana. Class ini yang menyalakan
  // sidebar, tombol menu, dan latar terang panel isi (lihat admin.css);
  // ditaruh di satu tempat ini supaya kelima halaman ikut sekaligus.
  document.body.classList.toggle('admin-masuk', name === 'dashboard');

  // Keluar dari dashboard sementara laci di HP masih terbuka akan
  // meninggalkan scrim gelap menutupi panel login.
  if (name !== 'dashboard' && typeof window.tutupLaciAdmin === 'function') {
    window.tutupLaciAdmin();
  }

  // Isi dashboard baru punya ukuran dan posisi begitu atribut hidden-nya
  // dilepas. Sebelum itu IntersectionObserver tidak pernah menganggapnya
  // terlihat, jadi kartu-kartunya perlu diamati ulang di sini -- kalau
  // tidak, semuanya berhenti di opacity 0 dan halamannya terlihat kosong.
  if (name === 'dashboard' && typeof window.segarkanGerakAdmin === 'function') {
    window.segarkanGerakAdmin();
  }
}

function authHeaders() {
  return { Authorization: 'Bearer ' + currentIdToken };
}

// Penjelasan per-alasan yang dikembalikan server (lihat verifyGoogleIdToken
// di api/_lib/google-verify.js). Ditulis sebagai kalimat yang bisa
// ditindaklanjuti, bukan kode mentah, karena yang baca ini bukan programmer.
var AUTH_REASON_TEXT = {
  token_expired:
    'Sesi login kamu sudah kedaluwarsa (token Google cuma berlaku sekitar 1 jam). Login lagi.',
  wrong_audience:
    'Client ID Google di halaman ini tidak cocok dengan yang diharapkan server. Ini salah konfigurasi kode, bukan salah kamu.',
  email_unverified:
    'Google melaporkan email akun ini belum terverifikasi, jadi tidak bisa dipakai masuk.',
  missing_credential:
    'Browser tidak mengirim token login ke server. Coba muat ulang halaman ini.',
  token_invalid:
    'Server tidak bisa memvalidasi token login dari Google. Coba login ulang; kalau tetap begini, cek Vercel > Deployments > Functions log untuk pesan lengkapnya.',
};

// Dipanggil kalau sebuah fetch admin balas 401 (token habis/tidak valid) --
// beda dari 403 (login sah tapi bukan admin), yang punya panel sendiri.
//
// WAJIB selalu memberi tahu alasannya. Versi pertama fungsi ini cuma
// memanggil showPanel('signin') tanpa pesan apa pun, dan dari sisi pengguna
// itu terlihat seperti "diklik tapi tidak terjadi apa-apa" -- gagal
// diam-diam yang bikin masalah aslinya mustahil didiagnosis.
function handleUnauthorized(reason) {
  lupakanToken();
  showPanel('signin');

  var box = document.getElementById('admin-signin-error');
  if (box) {
    box.textContent =
      (AUTH_REASON_TEXT[reason] || 'Server menolak login ini.') +
      (reason ? ' (kode: ' + reason + ')' : '');
    box.hidden = false;
  }

  console.error('Login admin ditolak server. reason=' + reason);
}

// Memeriksa satu token ke server lalu membuka dashboard kalau diterima.
// Dipakai DUA jalur: token baru dari tombol Google, dan token lama yang
// diambil dari sessionStorage waktu halaman dibuka. Sengaja satu fungsi
// supaya keduanya tidak bisa menyimpang -- perbaikan di penanganan 401
// atau 403 otomatis berlaku untuk dua-duanya.
async function masukDenganToken(token) {
  showPanel('loading');
  currentIdToken = token;

  var profil = bacaProfilToken(token);
  var payloadEmail = (profil && profil.email) || '';

  try {
    // /api/admin-content dipakai sebagai pemeriksa login untuk SEMUA halaman
    // admin, termasuk yang tidak butuh isinya. Alasannya supaya tidak perlu
    // endpoint khusus "cek saya admin bukan"; balasannya kecil dan sekalian
    // membawa email yang sudah terverifikasi server buat ditampilkan.
    var res = await fetch('/api/admin-content', { headers: authHeaders() });
    var data = await res.json();

    if (res.ok && data.ok) {
      var userEl = document.getElementById('admin-user');
      if (userEl) {
        userEl.textContent = data.email;
        // Email panjang dipotong ellipsis di topbar sempit (lihat
        // .admin-topbar-user). Yang terpotong harus tetap bisa dibaca
        // utuh, kalau tidak admin tidak bisa memastikan sedang masuk
        // sebagai akun yang mana.
        userEl.title = data.email;
        userEl.hidden = false;
      }
      if (typeof window.onAdminReady === 'function') window.onAdminReady(data);
      showPanel('dashboard');
      return;
    }

    if (res.status === 403 && data.reason === 'not_admin') {
      // Token sah tapi bukan admin. Jangan disimpan: kalau dibiarkan,
      // tiap halaman yang dibuka berikutnya akan mencobanya lagi dan
      // memunculkan panel "Bukan akun admin" tanpa pernah menawarkan
      // tombol login yang bisa dipakai untuk ganti akun.
      lupakanToken();
      var deniedEl = document.getElementById('admin-denied-email');
      if (deniedEl) deniedEl.textContent = payloadEmail;
      showPanel('denied');
      return;
    }

    if (res.status === 401) {
      handleUnauthorized(data.reason);
      return;
    }

    var detail = document.getElementById('admin-error-detail');
    if (detail) {
      detail.textContent =
        'Server menolak dengan status ' + res.status + ' (' + (data.reason || 'tanpa keterangan') +
        '). Kalau tertulis server_not_configured, berarti ADMIN_EMAILS belum keisi di Vercel.';
    }
    showPanel('error');
  } catch (err) {
    var detail2 = document.getElementById('admin-error-detail');
    if (detail2) detail2.textContent = 'Tidak bisa menghubungi server: ' + err.message;
    showPanel('error');
  }
}

// Dipanggil otomatis oleh Google Identity Services lewat
// data-callback="handleAdminCredential" di HTML.
window.handleAdminCredential = function handleAdminCredential(response) {
  simpanToken(response.credential);
  masukDenganToken(response.credential);
};

function trySwitchAdminAccount() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  lupakanToken();
  showPanel('signin');
}
window.trySwitchAdminAccount = trySwitchAdminAccount;

/* Login otomatis dari token yang masih berlaku di tab ini. Inilah yang
   membuat pindah halaman lewat sidebar tidak minta login lagi.
   Dijalankan langsung (bukan menunggu DOMContentLoaded) supaya
   showPanel('loading') sempat mengganti panel login SEBELUM gambar
   pertama halaman ini dilukis -- kalau ditunda, tombol Google sempat
   berkelebat sekejap tiap kali pindah halaman.

   Token yang sudah lewat umurnya dibuang tanpa pesan apa-apa dan
   halaman kembali ke panel login biasa. Itu bukan kegagalan yang perlu
   dijelaskan, cuma sesi yang habis; kotak merah untuk hal seperti ini
   akan terbaca seperti ada yang rusak. */
(function masukOtomatis() {
  var tersimpan = null;
  try {
    tersimpan = window.sessionStorage.getItem(KUNCI_TOKEN);
  } catch (err) {
    // sessionStorage diblokir. Tidak ada yang bisa dipulihkan, tampilkan
    // panel login seperti biasa.
  }
  if (!tersimpan) return;

  if (tokenKedaluwarsa(tersimpan)) {
    lupakanToken();
    return;
  }

  masukDenganToken(tersimpan);
})();
