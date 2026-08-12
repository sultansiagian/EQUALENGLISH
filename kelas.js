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
  // Bug lama: cuma me-reveal SATU elemen ([data-reveal-stagger] pertama,
  // yaitu grid kartu aksi), jadi .kelas-practice-card dan
  // .kelas-announcement-card (yang pakai [data-reveal] biasa) tidak
  // pernah dapat class is-visible -- tetap nyangkut di opacity:0
  // selamanya walau kotaknya sendiri ada dan makan tempat di layout.
  // Baru ketahuan lewat sesi asli user, karena tes simulasi sebelumnya
  // langsung set hidden=false manual, melewati showState() sama sekali.
  if (name === 'welcome' && functionalZone) {
    functionalZone.querySelectorAll('[data-reveal], [data-reveal-stagger]').forEach(revealNow);
  }
}

// Reveal awal untuk kicker + gerbang signin, yang tampil dari awal
// tanpa lewat showState().
revealNow(document.querySelector('.kelas-hero-content > [data-reveal]'));
revealNow(gateStates.signin);

function renderMaterials(materials) {
  const zoomLink = document.getElementById('kelas-zoom-link');
  const driveLink = document.getElementById('kelas-drive-link');
  const communityLink = document.getElementById('kelas-community-link');
  const practiceReadingLink = document.getElementById('kelas-practice-reading');
  const practiceListeningLink = document.getElementById('kelas-practice-listening');
  const practiceWritingLink = document.getElementById('kelas-practice-writing');
  const announcement = document.getElementById('kelas-announcement');

  zoomLink.href = materials.zoomJoinUrl || '#';
  driveLink.href = materials.driveUrl || '#';
  communityLink.href = materials.communityUrl || '#';
  practiceReadingLink.href = materials.practiceReadingUrl || '#';
  practiceListeningLink.href = materials.practiceListeningUrl || '#';
  practiceWritingLink.href = materials.practiceWritingUrl || '#';
  announcement.textContent = materials.announcement || '';

  renderSchedule(materials.schedule || []);
  startZoomCountdown(materials.nextSessionAt || null);

  // Default semua terbuka kalau server belum kirim practiceUnlocked
  // sama sekali (mis. materials lama yang di-cache) -- gagal terbuka,
  // bukan gagal tertutup, sama seperti fallback di server-nya.
  const unlocked = materials.practiceUnlocked || {
    reading: { unlocked: true },
    listening: { unlocked: true },
    writing: { unlocked: true },
  };
  applyPracticeLock('kelas-practice-reading', unlocked.reading);
  applyPracticeLock('kelas-practice-listening', unlocked.listening);
  applyPracticeLock('kelas-practice-writing', unlocked.writing);
}

// Kuis terkunci/terbuka ditentukan server dari jadwal (lihat
// computePracticeUnlocks di api/verify-access.js) -- fungsi ini cuma
// menerapkan hasilnya ke DOM, bukan memutuskan sendiri.
function applyPracticeLock(linkId, status) {
  const link = document.getElementById(linkId);
  if (!link) return;
  const item = link.closest('.kelas-practice-item');
  const note = document.getElementById(linkId + '-note');

  if (!status || status.unlocked) {
    if (item) item.classList.remove('is-locked');
    link.removeAttribute('aria-disabled');
    link.innerHTML = 'Mulai <span aria-hidden="true">↗</span>';
    // href sudah di-set sebelum applyPracticeLock dipanggil di
    // renderMaterials, jadi tidak perlu diulang di sini.
    if (note) note.hidden = true;
    return;
  }

  if (item) item.classList.add('is-locked');
  link.removeAttribute('href');
  link.removeAttribute('target');
  link.setAttribute('aria-disabled', 'true');
  link.innerHTML = 'Terkunci';

  if (note) {
    note.textContent = status.unlocksAt
      ? 'Kebuka setelah sesi ini: ' + formatSessionDate(status.unlocksAt)
      : 'Kebuka setelah materinya dibahas di kelas.';
    note.hidden = false;
  }
}

// Format "Selasa, 12 Agustus, 20:00 WIB" dari ISO UTC -- selalu di zona
// WIB eksplisit (bukan zona lokal browser si siswa), karena jamnya
// datang dari server dalam WIB dan harus tetap kebaca sama persis buat
// siapa pun yang buka halaman ini dari zona waktu mana pun.
const kelasScheduleDateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
});
const kelasScheduleTimeFmt = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

function formatSessionDate(isoDatetime) {
  const date = new Date(isoDatetime);
  return kelasScheduleDateFmt.format(date) + ', ' + kelasScheduleTimeFmt.format(date) + ' WIB';
}

function renderSchedule(sessions) {
  const list = document.getElementById('kelas-schedule-list');
  const empty = document.getElementById('kelas-schedule-empty');
  if (!list) return;

  list.innerHTML = '';

  if (!sessions.length) {
    list.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }

  list.hidden = false;
  if (empty) empty.hidden = true;

  sessions.forEach((session, i) => {
    const item = document.createElement('li');
    item.className = 'kelas-schedule-item' + (i === 0 ? ' is-next' : '');

    const dateEl = document.createElement('span');
    dateEl.className = 'kelas-schedule-date';
    dateEl.textContent = formatSessionDate(session.isoDatetime);
    item.appendChild(dateEl);

    if (session.topic) {
      const topicEl = document.createElement('span');
      topicEl.className = 'kelas-schedule-topic';
      topicEl.textContent = session.topic;
      item.appendChild(topicEl);
    }

    if (i === 0) {
      const badge = document.createElement('span');
      badge.className = 'kelas-schedule-badge';
      badge.textContent = 'BERIKUTNYA';
      item.appendChild(badge);
    }

    list.appendChild(item);
  });
}

// Interval disimpan di luar fungsi supaya bisa dimatikan lagi (ganti akun,
// login ulang, dst) tanpa numpuk banyak setInterval berjalan sekaligus.
let kelasCountdownInterval = null;

function stopZoomCountdown() {
  if (kelasCountdownInterval) {
    window.clearInterval(kelasCountdownInterval);
    kelasCountdownInterval = null;
  }
}

function startZoomCountdown(nextSessionAt) {
  stopZoomCountdown();
  const timerEl = document.getElementById('kelas-zoom-timer');
  if (!timerEl) return;

  const target = nextSessionAt ? new Date(nextSessionAt).getTime() : NaN;
  if (Number.isNaN(target)) {
    timerEl.hidden = true;
    return;
  }

  timerEl.hidden = false;

  function tick() {
    const diffMs = target - Date.now();

    if (diffMs <= 0) {
      timerEl.textContent = 'Sesi berikutnya sudah dimulai -- langsung gabung.';
      stopZoomCountdown();
      return;
    }

    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days > 0) parts.push(days + ' hari');
    if (days > 0 || hours > 0) parts.push(hours + ' jam');
    parts.push(minutes + ' menit');
    // Detik cuma ditampilkan kalau sesinya sudah dekat (di bawah 1 jam
    // lagi) -- supaya baris tidak ramai angka yang jalan tiap detik
    // padahal sesinya masih berhari-hari lagi.
    if (days === 0 && hours === 0) parts.push(seconds + ' detik');

    timerEl.textContent = parts.join(' ') + ' lagi ke sesi berikutnya';
  }

  tick();
  kelasCountdownInterval = window.setInterval(tick, 1000);
}

function renderGreeting(profile) {
  const greeting = document.getElementById('kelas-greeting');
  const avatar = document.getElementById('kelas-avatar');

  // given_name TIDAK dijamin cuma satu kata -- akun Google yang nama
  // depan/belakangnya tidak diisi terpisah bisa mengembalikan nama
  // lengkap di sana juga. Makanya kata pertama selalu diambil ulang di
  // sini, dari sumber mana pun, supaya sapaannya tetap pendek berapa
  // pun panjang nama aslinya.
  const rawName = (profile.given_name || profile.name || '').trim();
  const firstName = rawName ? rawName.split(/\s+/)[0] : '';
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
  stopZoomCountdown();
  showState('signin');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// shader-background.js mencari .hero-shader begitu file itu sendiri
// dimuat (self-invoking), jadi tidak ada inisialisasi tambahan yang
// perlu dipanggil dari sini -- lihat urutan <script> di kelas.html.
