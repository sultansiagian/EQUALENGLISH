/**
 * Halaman kelas: kirim ID token dari "Sign in with Google" ke
 * /api/verify-access, lalu tampilkan salah satu state sesuai hasilnya.
 *
 * Materi tidak pernah ada di file ini atau di kelas.html. Server yang
 * memutuskan apakah email pengunjung berhak lihat materi, baru
 * setelah itu materinya dikirim. Lihat api/verify-access.js.
 */

const states = {
  signin: document.getElementById('kelas-signin'),
  loading: document.getElementById('kelas-loading'),
  content: document.getElementById('kelas-content'),
  denied: document.getElementById('kelas-denied'),
  error: document.getElementById('kelas-error'),
};

function showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== name;
  });
}

function renderMaterials(materials) {
  const driveLink = document.getElementById('kelas-drive-link');
  const announcement = document.getElementById('kelas-announcement');

  driveLink.href = materials.driveUrl || '#';
  announcement.textContent = materials.announcement || '';
}

// Dipanggil otomatis oleh Google Identity Services lewat
// data-callback="handleCredentialResponse" di kelas.html.
// Harus jadi fungsi global (window.*), bukan sekadar deklarasi biasa.
window.handleCredentialResponse = async function handleCredentialResponse(response) {
  showState('loading');

  let payloadEmail = '';
  try {
    // Cuma buat ditampilkan di UI ("Masuk sebagai ..."). Ini BUKAN
    // proses verifikasi asli, jadi tidak dipakai untuk keputusan akses.
    // Keputusan sebenarnya ada di server lewat api/verify-access.js.
    const parts = response.credential.split('.');
    const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    payloadEmail = decoded.email || '';
  } catch (err) {
    // Kalau gagal decode, tidak masalah, server tetap yang menentukan.
  }

  try {
    const res = await fetch('/api/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });

    const data = await res.json();

    if (res.ok && data.ok) {
      document.getElementById('kelas-email').textContent = payloadEmail;
      renderMaterials(data.materials || {});
      showState('content');
      return;
    }

    if (res.status === 403 && data.reason === 'not_enrolled') {
      document.getElementById('kelas-denied-email').textContent = payloadEmail;
      showState('denied');
      return;
    }

    // token_invalid / token_expired / wrong_audience / dll: minta login ulang.
    showState('signin');
  } catch (err) {
    showState('error');
  }
};

document.getElementById('kelas-signout').addEventListener('click', () => {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    // Supaya tombol sign-in menampilkan pilihan akun lagi, bukan
    // langsung memilih akun yang sama seperti sebelumnya.
    window.google.accounts.id.disableAutoSelect();
  }
  showState('signin');
});
