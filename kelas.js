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
      window.setTimeout(() => child.classList.add('is-visible'), i * 50);
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

  // Default terbuka kalau server belum kirim zoomUnlocked (mis. materials
  // lama yang di-cache) -- gagal terbuka, sama seperti practiceUnlocked.
  const zoomStatus = materials.zoomUnlocked || { unlocked: true, unlocksAt: null };
  const zoomJoinUrl = materials.zoomJoinUrl || '#';
  applyZoomLock(zoomStatus, zoomJoinUrl);
  // unlocksAt & zoomJoinUrl dioper ke countdown supaya tick() bisa buka
  // link-nya sendiri begitu ambang waktunya lewat -- lihat catatan di
  // startZoomCountdown soal bug lama (link nyangkut "Terkunci" walau
  // waktunya udah lewat, karena dulu cuma reload manual yang bisa
  // manggil ulang applyZoomLock). zoomJoinUrl WAJIB dioper ulang di sini
  // (bukan cuma di renderMaterials), karena applyZoomLock yang dipanggil
  // dari dalam tick() terjadi SETELAH href sempat dilepas oleh kondisi
  // terkunci -- tanpa ini link kelihatan kebuka (aria-disabled hilang)
  // tapi hrefnya kosong, jadi tetap tidak bisa diklik.
  startZoomCountdown(materials.nextSessionAt || null, zoomStatus.unlocksAt, zoomJoinUrl);

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

// Kartu Zoom terkunci/terbuka ditentukan server dari jadwal kelas beneran
// (lihat computeZoomUnlock di api/verify-access.js) -- fungsi ini cuma
// menerapkan hasilnya ke DOM. Beda dari applyPracticeLock: link Zoom
// bukan .button (class-nya .kelas-tile-link), jadi styling & markup
// disabled-nya juga beda.
function applyZoomLock(status, joinUrl) {
  const link = document.getElementById('kelas-zoom-link');
  const note = document.getElementById('kelas-zoom-lock-note');
  if (!link) return;

  if (!status || status.unlocked) {
    link.removeAttribute('aria-disabled');
    // tabindex eksplisit cuma dipasang pas terkunci (lihat di bawah) --
    // begitu terbuka dan href beneran balik, elemen &lt;a&gt; sudah
    // focusable secara native, tabindex="0" jadi sisa yang tidak perlu.
    link.removeAttribute('tabindex');
    link.innerHTML = 'Buka Zoom <span aria-hidden="true">↗</span>';
    // joinUrl WAJIB di-set ulang di sini (bukan diasumsikan sudah ada
    // dari renderMaterials) -- kalau applyZoomLock ini datang dari
    // auto-unlock di tick(), href sempat dilepas duluan oleh cabang
    // terkunci, jadi tanpa baris ini link kelihatan kebuka tapi tidak
    // bisa diklik kemana-mana.
    if (joinUrl) link.href = joinUrl;
    if (note) note.hidden = true;
    return;
  }

  // href dilepas supaya klik/Enter tidak pernah menavigasi ke link Zoom
  // asli walau elemennya sempat ke-render dulu dengan href terisi.
  // TAPI &lt;a&gt; tanpa href kehilangan status "link" di accessibility
  // tree hampir di semua browser -- jadi pengguna screen reader/keyboard
  // tidak tahu kartu ini ada sama sekali, beda dari pengguna awas yang
  // masih lihat kartunya (redup) dan catatan "Kebuka jam sekian". tabindex
  // eksplisit "0" mengembalikannya ke urutan Tab tanpa mengembalikan
  // kemampuan navigasinya.
  link.removeAttribute('href');
  link.removeAttribute('target');
  link.setAttribute('aria-disabled', 'true');
  link.setAttribute('tabindex', '0');
  link.innerHTML = 'Terkunci';

  if (note) {
    note.textContent = status.unlocksAt
      ? 'Kebuka ' + formatSessionDate(status.unlocksAt)
      : 'Belum ada jadwal sesi berikutnya.';
    note.hidden = false;
  }
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
    // Lihat catatan di applyZoomLock soal tabindex eksplisit ini.
    link.removeAttribute('tabindex');
    link.innerHTML = 'Mulai <span aria-hidden="true">↗</span>';
    // href sudah di-set sebelum applyPracticeLock dipanggil di
    // renderMaterials, jadi tidak perlu diulang di sini.
    if (note) note.hidden = true;
    return;
  }

  // Sama seperti applyZoomLock: href dilepas biar tidak bisa dinavigasi,
  // tapi tabindex="0" dipasang eksplisit supaya kuis yang terkunci tetap
  // ke-tab dan ke-announce screen reader, bukan cuma redup buat mata.
  if (item) item.classList.add('is-locked');
  link.removeAttribute('href');
  link.removeAttribute('target');
  link.setAttribute('aria-disabled', 'true');
  link.setAttribute('tabindex', '0');
  link.innerHTML = 'Terkunci';

  if (note) {
    // Tanggal buka kuis sekarang independen dari jadwal kelas (bukan
    // lagi "setelah sesi ini selesai") -- lihat
    // computePracticeUnlocksFromDates() di api/verify-access.js.
    note.textContent = status.unlocksAt
      ? 'Kebuka ' + formatSessionDate(status.unlocksAt)
      : 'Belum ada tanggal buka.';
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

// Bug lama: link Zoom cuma dibuka sekali di renderMaterials() lewat
// applyZoomLock(), lalu tidak pernah dicek ulang. Siswa yang buka
// halaman ini pas masih terkunci, lalu nurut instruksi kartunya sendiri
// ("simpan halaman ini") dan cuma nunggu tanpa reload, bakal lihat link
// tetap "Terkunci" walau ambang bukanya (unlocksAt, 5 menit sebelum
// sesi -- lihat ZOOM_UNLOCK_LEAD_MS di api/verify-access.js) sudah
// lewat. tick() jalan tiap detik buat teks countdown, jadi dipakai juga
// buat re-cek unlocksAt dan buka link-nya sendiri begitu waktunya lewat
// -- tidak perlu reload manual lagi.
function startZoomCountdown(nextSessionAt, unlocksAt, joinUrl) {
  stopZoomCountdown();
  const timerEl = document.getElementById('kelas-zoom-timer');
  if (!timerEl) return;

  const unlockTarget = unlocksAt ? new Date(unlocksAt).getTime() : NaN;
  let autoUnlocked = false;

  function maybeAutoUnlock() {
    if (autoUnlocked || Number.isNaN(unlockTarget)) return;
    if (Date.now() < unlockTarget) return;
    autoUnlocked = true;
    applyZoomLock({ unlocked: true }, joinUrl);
  }

  const target = nextSessionAt ? new Date(nextSessionAt).getTime() : NaN;
  if (Number.isNaN(target)) {
    timerEl.hidden = true;
    // Tidak ada teks countdown buat ditampilkan, tapi ambang unlock-nya
    // tetap perlu dicek ulang, jadi tick minimal buat itu tetap jalan.
    if (!Number.isNaN(unlockTarget)) {
      maybeAutoUnlock();
      kelasCountdownInterval = window.setInterval(maybeAutoUnlock, 1000);
    }
    return;
  }

  timerEl.hidden = false;

  function tick() {
    maybeAutoUnlock();
    const diffMs = target - Date.now();

    if (diffMs <= 0) {
      timerEl.textContent = 'Sesi berikutnya sudah dimulai -- langsung gabung.';
      // Jaring pengaman kalau unlocksAt kosong/null (mis. sheet jadwal
      // gagal diparsing) -- begitu waktu mulai sesi lewat, link tidak
      // boleh tetap terkunci apa pun alasannya.
      applyZoomLock({ unlocked: true }, joinUrl);
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

// Dipakai baik oleh "Bukan kamu? Ganti akun" di zona fungsional maupun
// tombol "Coba akun lain" di state denied/error -- penyebab paling umum
// "denied" adalah akun Google yang ke-cache salah, jadi siswa harus bisa
// benerin sendiri di halaman ini, bukan cuma diarahkan ke WhatsApp.
function trySwitchAccount() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    // Supaya tombol sign-in menampilkan pilihan akun lagi, bukan
    // langsung memilih akun yang sama seperti sebelumnya.
    window.google.accounts.id.disableAutoSelect();
  }
  stopZoomCountdown();
  showState('signin');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('kelas-signout').addEventListener('click', trySwitchAccount);

const deniedRetryBtn = document.getElementById('kelas-denied-retry');
if (deniedRetryBtn) deniedRetryBtn.addEventListener('click', trySwitchAccount);

const errorRetryBtn = document.getElementById('kelas-error-retry');
if (errorRetryBtn) errorRetryBtn.addEventListener('click', trySwitchAccount);

const errorReloadBtn = document.getElementById('kelas-error-reload');
if (errorReloadBtn) errorReloadBtn.addEventListener('click', () => window.location.reload());

// shader-background.js mencari .hero-shader begitu file itu sendiri
// dimuat (self-invoking), jadi tidak ada inisialisasi tambahan yang
// perlu dipanggil dari sini -- lihat urutan <script> di kelas.html.
