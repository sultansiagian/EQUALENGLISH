/**
 * Logika halaman /admin. Tidak ada session/cookie -- ID token Google yang
 * didapat sekali dari tombol Sign in disimpan di variabel JS (currentIdToken)
 * dan dikirim ulang di header Authorization tiap kali admin.js manggil
 * /api/admin-content atau /api/admin-upload. Token ini berlaku sekitar 1
 * jam; kalau server balas token_expired/token_invalid, halaman ini minta
 * login ulang (lihat handleUnauthorized()).
 */

let currentIdToken = null;

function showPanel(name) {
  ['signin', 'loading', 'denied', 'error', 'dashboard'].forEach((p) => {
    document.getElementById('admin-panel-' + p).hidden = p !== name;
  });
}

function authHeaders() {
  return { Authorization: 'Bearer ' + currentIdToken };
}

// Penjelasan per-alasan yang dikembalikan server (lihat verifyGoogleIdToken
// di api/_lib/google-verify.js). Ditulis sebagai kalimat yang bisa
// ditindaklanjuti, bukan kode mentah, karena yang baca ini bukan programmer.
const AUTH_REASON_TEXT = {
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

  const box = document.getElementById('admin-signin-error');
  box.textContent =
    (AUTH_REASON_TEXT[reason] || 'Server menolak login ini.') +
    (reason ? ' (kode: ' + reason + ')' : '');
  box.hidden = false;

  console.error('Login admin ditolak server. reason=' + reason);
}

// Dipanggil otomatis oleh Google Identity Services lewat
// data-callback="handleAdminCredential" di admin.html.
window.handleAdminCredential = async function handleAdminCredential(response) {
  showPanel('loading');
  currentIdToken = response.credential;

  let payloadEmail = '';
  try {
    const parts = response.credential.split('.');
    const profile = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    payloadEmail = profile.email || '';
  } catch (err) {
    // Cuma buat ditampilkan; kalau gagal decode, server tetap yang menentukan.
  }

  try {
    const res = await fetch('/api/admin-content', { headers: authHeaders() });
    const data = await res.json();

    if (res.ok && data.ok) {
      const userEl = document.getElementById('admin-user');
      userEl.textContent = data.email;
      userEl.hidden = false;
      fillForm(data.values);
      loadPhotoPreviews(data.values);
      showPanel('dashboard');
      return;
    }

    if (res.status === 403 && data.reason === 'not_admin') {
      document.getElementById('admin-denied-email').textContent = payloadEmail;
      showPanel('denied');
      return;
    }

    if (res.status === 401) {
      handleUnauthorized(data.reason);
      return;
    }

    document.getElementById('admin-error-detail').textContent =
      'Server menolak dengan status ' + res.status + ' (' + (data.reason || 'tanpa keterangan') +
      '). Kalau tertulis server_not_configured, berarti ADMIN_EMAILS belum keisi di Vercel.';
    showPanel('error');
  } catch (err) {
    document.getElementById('admin-error-detail').textContent =
      'Tidak bisa menghubungi server: ' + err.message;
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

// ============================================================
// FORM TEKS & HARGA
// ============================================================

function fillForm(values) {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (!(key in values)) return;
    const value = values[key];
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value;
    }
  });
}

function collectFormItems() {
  const items = {};
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (el.type === 'checkbox') {
      items[key] = el.checked;
    } else if (el.type === 'number') {
      items[key] = Number(el.value);
    } else {
      items[key] = el.value;
    }
  });
  return items;
}

function setSaveStatus(state, text) {
  const el = document.getElementById('admin-save-status');
  el.textContent = text;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

async function saveForm() {
  const btn = document.getElementById('admin-save-btn');
  btn.disabled = true;
  setSaveStatus(null, 'Menyimpan…');

  try {
    const res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ items: collectFormItems() }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      setSaveStatus('ok', 'Tersimpan. Biasanya tayang di situs dalam ~10 detik.');
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setSaveStatus('error', 'Gagal menyimpan: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setSaveStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================
// FOTO -- kompresi di browser (canvas) lalu upload sebagai data URL base64
// ============================================================

// width/height = ukuran target akhir. mode 'cover' memotong bagian tengah
// foto supaya pas persis ke rasio target (dipakai untuk foto yang punya
// slot ukuran tetap di index.html/OG banner). mode 'contain' cuma
// mengecilkan kalau lebih besar dari target, tanpa memotong dan tanpa
// memperbesar (dipakai untuk logo, biar tidak ada bagian logo yang hilang).
const PHOTO_SLOT_SPECS = {
  logo: { width: 400, height: 400, mode: 'contain', type: 'image/webp', quality: 0.9 },
  photoKomunitas: { width: 1600, height: 1064, mode: 'cover', type: 'image/webp', quality: 0.82 },
  photoKelasZoom: { width: 1600, height: 1200, mode: 'cover', type: 'image/webp', quality: 0.82 },
  // JPEG, bukan WebP -- beberapa platform share link (WhatsApp/Instagram)
  // kadang tidak konsisten menampilkan preview WebP untuk og:image.
  ogBanner: { width: 1200, height: 630, mode: 'cover', type: 'image/jpeg', quality: 0.85 },
};

const SLOT_TO_KEY = {
  logo: 'logoUrl',
  photoKomunitas: 'photoKomunitasUrl',
  photoKelasZoom: 'photoKelasZoomUrl',
  ogBanner: 'ogBannerUrl',
};

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File bukan gambar yang valid'));
    img.src = URL.createObjectURL(file);
  });
}

async function compressImage(file, spec) {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (spec.mode === 'cover') {
    canvas.width = spec.width;
    canvas.height = spec.height;
    const scale = Math.max(spec.width / img.width, spec.height / img.height);
    const sw = spec.width / scale;
    const sh = spec.height / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, spec.width, spec.height);
  } else {
    const scale = Math.min(spec.width / img.width, spec.height / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal mengompres gambar'))),
      spec.type,
      spec.quality
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function setPhotoStatus(container, state, text) {
  const el = container.querySelector('.admin-photo-status');
  el.textContent = text;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

function showPhotoPreview(container, url) {
  const img = container.querySelector('.admin-photo-preview');
  img.src = url;
  img.hidden = false;
}

function loadPhotoPreviews(values) {
  document.querySelectorAll('.admin-photo').forEach((container) => {
    const slot = container.dataset.slot;
    const key = SLOT_TO_KEY[slot];
    if (values[key]) showPhotoPreview(container, values[key]);
  });
}

async function handlePhotoUpload(container, file) {
  const slot = container.dataset.slot;
  const spec = PHOTO_SLOT_SPECS[slot];
  const input = container.querySelector('.admin-photo-input');

  input.disabled = true;
  setPhotoStatus(container, null, 'Mengompres…');

  try {
    const compressed = await compressImage(file, spec);
    setPhotoStatus(container, null, 'Mengupload…');
    const dataUrl = await blobToDataUrl(compressed);

    const res = await fetch('/api/admin-upload', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ slot, dataUrl }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      showPhotoPreview(container, data.url);
      setPhotoStatus(container, 'ok', 'Tersimpan dan langsung tayang.');
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setPhotoStatus(container, 'error', 'Gagal upload: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setPhotoStatus(container, 'error', 'Gagal upload: ' + err.message);
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-save-btn').addEventListener('click', saveForm);

  document.querySelectorAll('.admin-photo').forEach((container) => {
    const input = container.querySelector('.admin-photo-input');
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handlePhotoUpload(container, input.files[0]);
    });
  });
});
