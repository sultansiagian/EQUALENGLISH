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

function showPanel(name) {
  ['signin', 'loading', 'denied', 'error', 'dashboard'].forEach(function (p) {
    var el = document.getElementById('admin-panel-' + p);
    if (el) el.hidden = p !== name;
  });
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
  currentIdToken = null;
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

// Dipanggil otomatis oleh Google Identity Services lewat
// data-callback="handleAdminCredential" di HTML.
window.handleAdminCredential = async function handleAdminCredential(response) {
  showPanel('loading');
  currentIdToken = response.credential;

  var payloadEmail = '';
  try {
    var parts = response.credential.split('.');
    var profile = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    payloadEmail = profile.email || '';
  } catch (err) {
    // Cuma buat ditampilkan; kalau gagal decode, server tetap yang menentukan.
  }

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
        userEl.hidden = false;
      }
      if (typeof window.onAdminReady === 'function') window.onAdminReady(data);
      showPanel('dashboard');
      return;
    }

    if (res.status === 403 && data.reason === 'not_admin') {
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
};

function trySwitchAdminAccount() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  currentIdToken = null;
  showPanel('signin');
}
window.trySwitchAdminAccount = trySwitchAdminAccount;
