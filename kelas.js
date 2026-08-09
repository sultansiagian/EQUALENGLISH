/**
 * Halaman kelas: kirim ID token dari "Sign in with Google" ke
 * /api/verify-access, lalu tampilkan salah satu state di gerbang
 * (zona gelap ber-shader), dan kalau berhasil, buka zona fungsional
 * (grid kartu terang) di bawahnya.
 *
 * Materi tidak pernah ada di file ini atau di kelas.html. Server yang
 * memutuskan apakah email pengunjung berhak lihat materi, baru
 * setelah itu materinya dikirim. Lihat api/verify-access.js.
 */

window.__kelasRevealReady = true;

const gateStates = {
  signin: document.getElementById('kelas-gate-signin'),
  loading: document.getElementById('kelas-gate-loading'),
  welcome: document.getElementById('kelas-gate-welcome'),
  denied: document.getElementById('kelas-gate-denied'),
  error: document.getElementById('kelas-gate-error'),
};
const heroEl = document.querySelector('.kelas-hero');
const functionalZone = document.getElementById('kelas-functional');

// Reveal manual (bukan IntersectionObserver kayak di script.js index.html):
// halaman ini pendek dan state-driven, jadi elemen cukup di-fade-up begitu
// state-nya jadi aktif, tidak perlu mendeteksi scroll-into-view.
function revealNow(root) {
  if (!root) return;
  root.classList.add('is-visible');
  if (root.hasAttribute('data-reveal-stagger')) {
    Array.from(root.children).forEach((child, i) => {
      window.setTimeout(() => child.classList.add('is-visible'), i * 80);
    });
  }
}

function showState(name) {
  Object.entries(gateStates).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== name;
  });
  if (functionalZone) functionalZone.hidden = name !== 'welcome';

  revealNow(gateStates[name]);
  if (name === 'welcome') revealNow(functionalZone.querySelector('[data-reveal-stagger]'));
}

// Reveal awal untuk kicker + gerbang signin, yang tampil dari awal
// tanpa lewat showState().
revealNow(document.querySelector('.kelas-hero-content > [data-reveal]'));
revealNow(gateStates.signin);

function renderMaterials(materials) {
  const zoomLink = document.getElementById('kelas-zoom-link');
  const driveLink = document.getElementById('kelas-drive-link');
  const communityLink = document.getElementById('kelas-community-link');
  const announcement = document.getElementById('kelas-announcement');

  zoomLink.href = materials.zoomJoinUrl || '#';
  driveLink.href = materials.driveUrl || '#';
  communityLink.href = materials.communityUrl || '#';
  announcement.textContent = materials.announcement || '';

  // Kartu Quizizz sengaja tidak disentuh di sini -- lihat komentar di
  // kelas.html tentang cara mengaktifkannya begitu link-nya sudah ada.
}

function renderGreeting(profile) {
  const greeting = document.getElementById('kelas-greeting');
  const avatar = document.getElementById('kelas-avatar');

  const firstName = profile.given_name || (profile.name || '').split(' ')[0];
  greeting.textContent = firstName ? 'Halo, ' + firstName + '!' : 'Kamu masuk!';

  if (profile.picture) {
    avatar.src = profile.picture;
    avatar.alt = firstName ? 'Foto profil ' + firstName : '';
    avatar.hidden = false;
  } else {
    avatar.hidden = true;
  }
}

// Dipanggil otomatis oleh Google Identity Services lewat
// data-callback="handleCredentialResponse" di kelas.html.
// Harus jadi fungsi global (window.*), bukan sekadar deklarasi biasa.
window.handleCredentialResponse = async function handleCredentialResponse(response) {
  showState('loading');

  let profile = {};
  try {
    // Cuma buat ditampilkan di UI (email, nama, foto profil). Ini BUKAN
    // proses verifikasi asli, jadi tidak dipakai untuk keputusan akses.
    // Keputusan sebenarnya ada di server lewat api/verify-access.js.
    const parts = response.credential.split('.');
    profile = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch (err) {
    // Kalau gagal decode, tidak masalah, server tetap yang menentukan.
  }
  const payloadEmail = profile.email || '';

  try {
    const res = await fetch('/api/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });

    const data = await res.json();

    if (res.ok && data.ok) {
      document.getElementById('kelas-email').textContent = payloadEmail;
      renderGreeting(profile);
      renderMaterials(data.materials || {});
      showState('welcome');
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// shader-background.js mencari .hero-shader begitu file itu sendiri
// dimuat (self-invoking), jadi tidak ada inisialisasi tambahan yang
// perlu dipanggil dari sini -- lihat urutan <script> di kelas.html.
