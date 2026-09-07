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
    // Latar morphic (morphic-background.js) diukur pertama kali saat
    // scriptnya jalan di page load, waktu zona ini masih hidden (kotak
    // 0x0) -- panggil ulang eksplisit di sini begitu zona ini benar-benar
    // tampil, jangan cuma andalkan ResizeObserver-nya sendiri. Dibungkus
    // setTimeout (BUKAN requestAnimationFrame) supaya baris ini jalan
    // setelah browser sempat memproses perubahan hidden->tampil barusan.
    // rAF sengaja dihindari di sini -- browser men-throttle/menjeda rAF
    // di tab yang sedang tidak fokus/di-background, dan login lewat
    // Google redirect/popup persis situasi di mana tab bisa saja belum
    // fokus penuh. setTimeout tidak kena masalah itu.
    if (window.__kelasMorphicSync) {
      window.setTimeout(window.__kelasMorphicSync, 0);
    }
  }
}

// Reveal awal untuk kicker + gerbang signin, yang tampil dari awal
// tanpa lewat showState().
revealNow(document.querySelector('.kelas-hero-content > [data-reveal]'));
revealNow(gateStates.signin);

var kredensialTerakhir = null;

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

  // progres ikut dikirim ke renderSchedule karena dialah satu-satunya yang
  // tahu jumlah sesi SELURUHNYA. materials.schedule cuma memuat sesi yang
  // belum lewat, jadi daftar kosong bisa berarti dua hal yang sangat
  // berbeda bagi siswa, dan keduanya butuh kalimat yang berbeda pula.
  renderSchedule(materials.schedule || [], materials.progres);
  pasangUnduhKalender(materials.schedule || [], materials);
  renderProgres(materials.progres);
  renderFinalTest(materials);

  // Kartu yang dimatikan pemilik disembunyikan SETELAH semuanya
  // digambar, bukan sebelum. Kartu Final Test mengatur `hidden`-nya
  // sendiri di renderFinalTest(), jadi menyembunyikannya lebih dulu
  // akan langsung dibatalkan lagi.
  terapkanKartuMati(materials.kartuMati);
  gambarKartuTambahan(materials.kartuTambahan);

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

/**
 * Bar progres batch di kartu jadwal.
 *
 * Angkanya datang dari server (hitungProgres di api/verify-access.js),
 * bukan dihitung dari materials.schedule di sini: daftar itu sengaja
 * cuma memuat sesi yang belum lewat, jadi kalau dihitung dari situ,
 * progresnya akan selalu terbaca 0 dari sisa sesi.
 */
function renderProgres(progres) {
  const kotak = document.getElementById('kelas-progres');
  if (!kotak) return;

  // Tanpa data jadwal sama sekali (SCHEDULE_CSV_URL kosong atau sheetnya
  // gagal diparsing), bar ini tidak punya arti apa pun. Disembunyikan,
  // bukan ditampilkan sebagai "0 dari 0" yang terlihat seperti rusak.
  if (!progres || !progres.total) {
    kotak.hidden = true;
    return;
  }

  const selesai = progres.selesai;
  const total = progres.total;
  const persen = Math.round((selesai / total) * 100);

  document.getElementById('kelas-progres-teks').textContent =
    selesai >= total
      ? 'Semua ' + total + ' sesi sudah selesai'
      : 'Sesi ' + selesai + ' dari ' + total + ' selesai';
  document.getElementById('kelas-progres-persen').textContent = persen + '%';
  document.getElementById('kelas-progres-isi').style.width = persen + '%';

  // aria-valuetext diisi kalimat, bukan cuma angka persen: "40 persen"
  // tidak memberi tahu pembaca layar ini progres apa.
  const bar = document.getElementById('kelas-progres-bar');
  bar.setAttribute('aria-valuenow', String(persen));
  bar.setAttribute('aria-valuetext', selesai + ' dari ' + total + ' sesi selesai');

  kotak.hidden = false;
}

/**
 * Kalimat untuk keadaan kosong, DIPILIH menurut sebabnya.
 *
 * Siswa yang baru disetujui hampir selalu langsung membuka halaman ini,
 * sering di hari yang sama, dan sering sebelum batchnya dijadwalkan.
 * Yang mereka lihat waktu itu adalah halaman yang berhasil dibuka tapi
 * isinya kosong, dan kosong yang tidak dijelaskan terbaca sebagai rusak.
 * Pesan pertama yang masuk ke WhatsApp biasanya "kok kosong ya kak".
 *
 * Tiga sebabnya beda, jadi kalimatnya juga beda:
 *   - belum ada jadwal sama sekali  -> batchnya memang belum dipasang
 *   - semua sesi sudah lewat        -> batchnya sudah selesai
 *   - sisanya                       -> keadaan tak terduga, jangan
 *                                      mengarang sebab yang belum tentu
 *                                      benar
 */
function pesanJadwalKosong(progres) {
  const total = progres && progres.total ? progres.total : 0;
  const selesai = progres && progres.selesai ? progres.selesai : 0;

  if (!total) {
    return (
      'Jadwal batch kamu belum dipasang. Begitu tanggalnya ditentukan, semua ' +
      'sesi muncul di sini dan diumumkan juga di grup WhatsApp. Akses kamu ' +
      'sendiri sudah aktif, jadi tidak ada yang perlu dilakukan sekarang.'
    );
  }

  if (selesai >= total) {
    return (
      'Semua ' + total + ' sesi batch ini sudah selesai. Rekaman dan materinya ' +
      'tetap bisa kamu buka dari kartu di bawah selama masa aksesmu masih ' +
      'berlaku.'
    );
  }

  return (
    'Belum ada jadwal terbaru di sini. Cek pengumuman atau tanya lewat grup ' +
    'WhatsApp kalau kamu butuh kepastian jadwal.'
  );
}

function renderSchedule(sessions, progres) {
  const list = document.getElementById('kelas-schedule-list');
  const empty = document.getElementById('kelas-schedule-empty');
  if (!list) return;

  list.innerHTML = '';

  if (!sessions.length) {
    list.hidden = true;
    if (empty) {
      empty.textContent = pesanJadwalKosong(progres);
      empty.hidden = false;
    }
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

  // Disimpan karena pengiriman testimoni nanti perlu membuktikan
  // identitas yang sama ke server. Token Google berlaku sekitar satu
  // jam; setelah itu server menolak dan siswa diminta login ulang,
  // yang memang perilaku yang benar.
  kredensialTerakhir = response.credential;

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

// ============================================================
// FINAL TEST
// ============================================================
// Syaratnya ditentukan SERVER (hitungFinalTest di
// api/verify-access.js): waktunya sudah lewat DAN siswa ini sudah
// mengisi ceritanya. File ini cuma menggambarkan keadaannya.
//
// Catatan penamaan: yang dibaca siswa selalu "cerita", tapi nama
// fungsi, kunci Global Config (testimoniSudahIsi), dan endpoint
// (/api/kelas-testimoni) tetap memakai "testimoni". Mengganti nama
// data yang sudah tersimpan tidak menambah kejelasan bagi siapa pun
// dan berisiko memutus baris yang sudah ada.
//
// Link ujiannya juga datang dari server dan CUMA dikirim kalau kedua
// syaratnya terpenuhi, jadi tidak ada yang bisa didapat dengan membuka
// isi balasan server lebih awal.

// ============================================================
// KARTU: MANA YANG TAMPIL, DAN KARTU BUATAN PEMILIK
// ============================================================
// Tujuh kartu bawaan ditulis tetap di kelas.html dan diberi
// data-kartu="...". Yang menentukan tampil atau tidak adalah daftar
// materials.kartuMati dari server (lihat KARTU_BAWAAN di
// api/_lib/kelas-kartu.js).
//
// Kartu bawaan disembunyikan, bukan dibuang dari halaman: isinya diisi
// fungsi lain di berkas ini lewat getElementById, dan membuangnya akan
// membuat fungsi-fungsi itu diam-diam menulis ke elemen yang tidak ada.

function terapkanKartuMati(daftar) {
  var mati = Array.isArray(daftar) ? daftar : [];
  document.querySelectorAll('[data-kartu]').forEach(function (el) {
    if (mati.indexOf(el.dataset.kartu) === -1) return;
    el.hidden = true;
  });
}

/**
 * Gambar kartu buatan pemilik.
 *
 * Yang sempit masuk ke grid dua kolom di atas (berbaris dengan Rekaman
 * dan Komunitas), yang lebar masuk ke tumpukan di bawah. Server yang
 * memutuskan lebarnya, termasuk untuk kartu yang lebarnya "auto" --
 * supaya aturannya cuma ada di satu tempat, bukan di server dan di
 * browser sekaligus.
 *
 * Kartu yang jadwal bukanya belum tiba tidak pernah sampai ke sini:
 * server tidak mengirimnya sama sekali.
 */
function gambarKartuTambahan(daftar) {
  var grid = document.querySelector('.kelas-tile-grid');
  var tumpukan = document.querySelector('.kelas-wide-stack');
  if (!grid || !tumpukan) return;

  // Kartu dari penggambaran sebelumnya dibuang dulu. Materi bisa dimuat
  // ulang tanpa halaman ikut dimuat ulang (mis. setelah kirim
  // testimoni), dan tanpa ini kartunya bertambah dua kali lipat.
  document.querySelectorAll('[data-kartu-tambahan]').forEach(function (el) {
    el.remove();
  });

  (Array.isArray(daftar) ? daftar : []).forEach(function (k) {
    if (!k || !k.judul) return;
    var lebar = k.lebar === 'lebar';
    (lebar ? tumpukan : grid).appendChild(kartuTambahanEl(k, lebar));
  });
}

function kartuTambahanEl(k, lebar) {
  var art = document.createElement('article');
  art.className = 'kelas-tile' + (lebar ? ' kelas-tile-wide' : '');
  art.dataset.kartuTambahan = k.id || '';

  var atas = document.createElement('div');
  atas.className = 'kelas-tile-top';

  // Ikon cuma digambar kalau pemiliknya mengunggahnya. Kotak ikon kosong
  // membuat kartu terlihat gagal memuat gambar, bukan terlihat rapi.
  if (k.ikonUrl) {
    var kotak = document.createElement('div');
    kotak.className = 'kelas-tile-icon';
    var img = document.createElement('img');
    img.src = k.ikonUrl;
    img.alt = '';
    img.width = 40;
    img.height = 40;
    // Ikon yang gagal dimuat menghapus kotaknya sendiri, daripada
    // meninggalkan lambang gambar rusak di tengah kartu.
    img.onerror = function () { kotak.remove(); };
    kotak.appendChild(img);
    atas.appendChild(kotak);
  }

  if (k.label) {
    var badge = document.createElement('span');
    badge.className = 'kelas-tile-badge kelas-tile-badge-quiet';
    badge.textContent = k.label;
    atas.appendChild(badge);
  }

  if (atas.childNodes.length > 0) art.appendChild(atas);

  var h = document.createElement('h3');
  h.textContent = k.judul;
  art.appendChild(h);

  if (k.deskripsi) {
    var p = document.createElement('p');
    p.className = 'kelas-tile-desc';
    p.textContent = k.deskripsi;
    art.appendChild(p);
  }

  if (k.url) {
    var a = document.createElement('a');
    a.className = 'kelas-tile-link';
    // href diisi lewat properti, dan isinya berasal dari pemilik situs
    // sendiri lewat /atur-kelas, bukan dari siswa. Tetap disaring ke
    // skema yang aman supaya satu tempelan salah tidak berubah jadi
    // javascript: yang berjalan di halaman terlindungi ini.
    a.href = urlAman(k.url);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Buka ';
    var panah = document.createElement('span');
    panah.setAttribute('aria-hidden', 'true');
    panah.textContent = '↗';
    a.appendChild(panah);
    art.appendChild(a);
  }

  return art;
}

/**
 * Loloskan cuma tautan yang benar-benar menuju tempat lain.
 *
 * Yang ditolak dikembalikan sebagai '#', bukan dibiarkan apa adanya:
 * tombol yang tidak ke mana-mana lebih baik daripada tombol yang
 * menjalankan sesuatu.
 */
function urlAman(mentah) {
  var t = String(mentah || '').trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (t.charAt(0) === '/' && t.charAt(1) !== '/') return t;
  return '#';
}

var finalPenanda = null;  // hitung mundur menuju pembukaan berikutnya
var penandaTutup = [];    // hitung mundur penutupan, satu per bagian terbuka

function renderFinalTest(materials) {
  var kartu = document.getElementById('kelas-final');
  if (!kartu) return;

  var f = materials.finalTest;
  // materials lama (mis. dari cache) belum punya field ini. Kartunya
  // disembunyikan saja, bukan menampilkan keadaan yang salah.
  if (!f || !Array.isArray(f.bagian)) {
    kartu.hidden = true;
    return;
  }

  var status = document.getElementById('final-status');
  var form = document.getElementById('final-form');
  var timer = document.getElementById('final-timer');
  var wadah = document.getElementById('final-bagian');

  kartu.hidden = false;
  form.hidden = true;
  timer.hidden = true;
  wadah.hidden = true;
  wadah.textContent = '';
  hentikanHitungMundurFinal();

  if (!f.adaYangSiap) {
    // Belum disiapkan admin. Dikatakan apa adanya, bukan dibiarkan
    // seperti tombol yang rusak.
    status.textContent =
      'Final Test belum dijadwalkan. Pantau pengumuman atau tanya lewat grup ' +
      'WhatsApp kalau menurutmu seharusnya sudah dibuka.';
    return;
  }

  // Form ceritanya ditampilkan selama belum diisi, TERMASUK sebelum
  // waktunya tiba. Supaya bisa disiapkan lebih dulu dan tidak menumpuk
  // di menit terakhir saat semua orang mau mulai bersamaan.
  if (!f.sudahTestimoni) form.hidden = false;

  var siap = f.bagian.filter(function (b) { return b.adaLink && b.adaJadwal; });
  var terbuka = siap.filter(function (b) { return b.terbuka; });
  var belumBuka = siap.filter(function (b) { return !b.sudahWaktunya; });

  if (!f.sudahTestimoni) {
    status.textContent = terbuka.length > 0
      ? 'Ada bagian yang sudah dibuka. Tinggal satu langkah: ceritakan ' +
        'pengalamanmu di bawah, lalu tombolnya langsung muncul.'
      : 'Sambil menunggu, isi dulu ceritanya di bawah supaya nanti kamu ' +
        'langsung bisa masuk.';
  } else if (terbuka.length > 0) {
    status.textContent = 'Kerjakan bagian yang sudah terbuka sebelum waktunya habis. Semoga lancar.';
  } else if (belumBuka.length > 0) {
    status.textContent = 'Ceritamu sudah masuk, terima kasih. Tinggal menunggu bagian berikutnya dibuka.';
  } else {
    status.textContent = 'Semua bagian Final Test sudah ditutup.';
  }

  // Hitung mundur besar di atas kartu cuma dipakai kalau BELUM ada yang
  // terbuka. Begitu ada yang terbuka, dua hitung mundur di satu kartu
  // (satu ke pembukaan berikutnya, satu ke penutupan yang sedang
  // berjalan) cuma bikin bingung mana yang sedang dihitung.
  if (terbuka.length === 0 && belumBuka.length > 0) {
    var paling = belumBuka.reduce(function (a, b) {
      return !a || b.bukaPada < a.bukaPada ? b : a;
    }, null);
    timer.hidden = false;
    mulaiHitungMundurFinal(paling.bukaPada);
  }

  gambarBagianFinal(wadah, f, materials.finalTestUrls || {});
  wadah.hidden = false;
}

/**
 * Tiga baris comprehension di dalam satu kartu.
 *
 * Bagian yang belum disiapkan admin (belum ada link atau belum ada
 * jadwal) TIDAK digambar sama sekali. Menampilkannya sebagai baris
 * berstatus "belum dijadwalkan" cuma memberi tahu siswa tentang ujian
 * yang mungkin memang tidak akan pernah ada.
 */
function gambarBagianFinal(wadah, f, urls) {
  f.bagian.forEach(function (b) {
    if (!b.adaLink || !b.adaJadwal) return;

    var baris = document.createElement('div');
    baris.className = 'final-bagian-baris';

    var kiri = document.createElement('div');
    kiri.className = 'final-bagian-teks';

    var nama = document.createElement('strong');
    nama.textContent = b.nama;
    kiri.appendChild(nama);

    var ket = document.createElement('span');
    ket.className = 'final-bagian-ket';
    kiri.appendChild(ket);

    baris.appendChild(kiri);

    if (b.sudahTutup) {
      baris.dataset.keadaan = 'tutup';
      ket.textContent = 'Ditutup ' + waktuFinalTerbaca(b.tutupPada);
      baris.appendChild(tandaBagian('Selesai'));
    } else if (!b.sudahWaktunya) {
      baris.dataset.keadaan = 'nanti';
      ket.textContent = 'Dibuka ' + waktuFinalTerbaca(b.bukaPada);
      // Syarat kedua disebut DI BARISNYA, bukan cuma di kalimat status
      // di atas kartu. Sebelumnya baris ini cuma menyebut jadwal, jadi
      // yang membacanya wajar mengira tinggal menunggu jam segitu --
      // lalu datang tepat waktu dan menemukan tombolnya tetap tidak
      // ada. Syarat yang cuma disebut sekali di tempat lain sama saja
      // dengan syarat yang tidak disebut.
      if (!f.sudahTestimoni) kiri.appendChild(syaratCerita());
      baris.appendChild(tandaBagian('Terkunci'));
    } else if (!f.sudahTestimoni) {
      baris.dataset.keadaan = 'terkunci';
      ket.textContent = b.tutupPada
        ? 'Waktunya sudah tiba, ditutup ' + waktuFinalTerbaca(b.tutupPada)
        : 'Waktunya sudah tiba';
      kiri.appendChild(syaratCerita());
      baris.appendChild(tandaBagian('Terkunci'));
    } else {
      baris.dataset.keadaan = 'buka';
      // Sisa waktu sampai TUTUP. Inilah yang paling dibutuhkan orang
      // yang sedang mengerjakan, dan satu-satunya angka yang berubah
      // arti kalau salah: telat berarti tidak bisa mengumpulkan.
      if (b.tutupPada) {
        ket.textContent = 'Ditutup ' + waktuFinalTerbaca(b.tutupPada);
        pasangHitungMundurTutup(ket, b.tutupPada, baris);
      } else {
        ket.textContent = 'Terbuka, tanpa batas waktu';
      }

      var tombol = document.createElement('a');
      tombol.className = 'button button-pink';
      tombol.target = '_blank';
      tombol.rel = 'noopener';
      tombol.href = urls[b.id] || '#';
      tombol.textContent = 'Kerjakan ' + b.nama + ' ';
      var panah = document.createElement('span');
      panah.setAttribute('aria-hidden', 'true');
      panah.textContent = '↗';
      tombol.appendChild(panah);
      baris.appendChild(tombol);
    }

    wadah.appendChild(baris);
  });
}

/**
 * Lencana keadaan di ujung kanan baris, di tempat yang sama dengan
 * tombol "Kerjakan" pada baris yang terbuka.
 *
 * Sengaja menempati posisi tombol: yang dicari mata di baris seperti ini
 * adalah "ada tombolnya atau tidak", jadi di situlah jawabannya harus
 * berada. Kata, bukan gambar gembok, supaya sejalan dengan lencana lain
 * di halaman ini (LIVE, JADWAL, FINAL TEST) dan tetap terbaca pembaca
 * layar tanpa teks alternatif tambahan.
 */
function tandaBagian(teks) {
  var t = document.createElement('span');
  t.className = 'final-bagian-tanda';
  t.textContent = teks;
  return t;
}

/**
 * Baris kedua yang menyebut syarat yang belum terpenuhi.
 *
 * Ditulis sebagai ajakan ("tinggal isi ceritamu"), bukan penolakan
 * ("kamu belum mengisi"), karena yang membacanya sedang menunggu ujian
 * dan tidak sedang melakukan kesalahan apa pun.
 */
function syaratCerita() {
  var s = document.createElement('span');
  s.className = 'final-bagian-syarat';
  s.textContent = 'Tinggal isi ceritamu di bawah, lalu tombolnya muncul sendiri.';
  return s;
}

function pasangHitungMundurTutup(el, iso, baris) {
  var target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return;

  function perbarui() {
    var sisa = target - Date.now();

    if (sisa <= 0) {
      // Waktunya habis. Tombolnya dicabut SEKARANG, tidak menunggu
      // halaman dimuat ulang: link-nya sudah ada di browser ini, jadi
      // membiarkannya berarti membiarkan ujian dibuka setelah ditutup.
      // Server tetap berhenti mengirimnya di permintaan berikutnya.
      var tombol = baris.querySelector('a');
      if (tombol) tombol.remove();
      baris.dataset.keadaan = 'tutup';
      el.textContent = 'Waktunya sudah habis.';
      // Lencana menggantikan tombol yang barusan dicabut, supaya barisnya
      // tidak berakhir kosong sebelah kanan dan terlihat seperti gagal
      // memuat, bukan seperti ujian yang memang sudah selesai.
      if (!baris.querySelector('.final-bagian-tanda')) {
        baris.appendChild(tandaBagian('Selesai'));
      }
      return;
    }

    el.textContent = 'Sisa ' + sisaTerbaca(sisa);
  }

  perbarui();
  penandaTutup.push(window.setInterval(perbarui, 1000));
}

/**
 * "2 jam 5 menit" atau "4 menit 12 detik".
 *
 * Detik cuma disebut kalau sudah di bawah satu jam, supaya angka yang
 * berkedip tiap detik tidak mengganggu padahal masih berjam-jam. Aturan
 * yang sama dipakai hitung mundur menuju pembukaan.
 */
function sisaTerbaca(ms) {
  var detik = Math.floor(ms / 1000);
  var hari = Math.floor(detik / 86400);
  var jam = Math.floor((detik % 86400) / 3600);
  var menit = Math.floor((detik % 3600) / 60);

  var bagian = [];
  if (hari > 0) bagian.push(hari + ' hari');
  if (hari > 0 || jam > 0) bagian.push(jam + ' jam');
  bagian.push(menit + ' menit');
  if (ms < 3600000) bagian.push((detik % 60) + ' detik');
  return bagian.join(' ');
}

function waktuFinalTerbaca(iso) {
  var d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'nanti';
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
}

function hentikanHitungMundurFinal() {
  if (finalPenanda) {
    window.clearInterval(finalPenanda);
    finalPenanda = null;
  }
  // Hitung mundur penutupan tiap bagian ikut dihentikan. Tanpa ini,
  // menggambar ulang kartunya meninggalkan interval yang terus berjalan
  // menulis ke baris yang sudah dibuang dari halaman: tidak terlihat di
  // layar, tapi menumpuk tiap kali materi dimuat ulang.
  penandaTutup.forEach(function (id) { window.clearInterval(id); });
  penandaTutup = [];
}

/**
 * Hitung mundur sampai waktunya tiba.
 *
 * Begitu habis, halaman TIDAK membuka sendiri tombolnya: yang menentukan
 * boleh atau tidak tetap server, dan link-nya memang belum ada di browser
 * ini. Jadi siswa diminta memuat ulang, dan permintaan berikutnya itulah
 * yang membawa link-nya.
 */
function mulaiHitungMundurFinal(iso) {
  var target = new Date(iso).getTime();
  var el = document.getElementById('final-timer');
  if (!Number.isFinite(target) || !el) return;

  function perbarui() {
    var sisa = target - Date.now();

    if (sisa <= 0) {
      hentikanHitungMundurFinal();
      el.textContent = 'Waktunya sudah tiba. Muat ulang halaman ini untuk membukanya.';
      return;
    }

    // Bentuk angkanya dipakai bersama hitung mundur penutupan tiap
    // bagian, lihat sisaTerbaca(). Dua hitung mundur di satu kartu yang
    // menulis "2 jam 5 menit" dan "2j 5m" akan terbaca seperti dua hal
    // yang berbeda.
    el.textContent = sisaTerbaca(sisa) + ' lagi';
  }

  perbarui();
  finalPenanda = window.setInterval(perbarui, 1000);
}

async function kirimTestimoni(e) {
  e.preventDefault();

  var pesan = document.getElementById('testi-pesan').value.trim();
  var status = document.getElementById('testi-status');
  var tombol = document.getElementById('testi-kirim');

  if (!pesan) {
    status.dataset.state = 'error';
    status.textContent = 'Ceritanya masih kosong.';
    return;
  }
  if (!kredensialTerakhir) {
    status.dataset.state = 'error';
    status.textContent = 'Sesi loginmu sudah kedaluwarsa. Muat ulang halaman lalu masuk lagi.';
    return;
  }

  tombol.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Mengirim...';

  try {
    var res = await fetch('/api/kelas-testimoni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credential: kredensialTerakhir,
        testimoni: {
          fakultas: document.getElementById('testi-fakultas').value.trim(),
          skorEpt: document.getElementById('testi-skor').value.trim(),
          izinTayang: document.getElementById('testi-izin').checked,
          pesan: pesan,
        },
      }),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      document.getElementById('final-form').hidden = true;
      status.dataset.state = 'ok';
      status.textContent = 'Terima kasih, ceritamu sudah masuk.';

      // Materi diminta ULANG ke server, bukan ditebak sendiri di sini.
      // Link ujiannya memang belum pernah dikirim ke browser ini (server
      // menahannya sampai kedua syarat terpenuhi), jadi satu-satunya cara
      // mendapatkannya adalah bertanya lagi sekarang setelah syaratnya
      // berubah. Memakai kredensial yang masih tersimpan, jadi siswa
      // tidak perlu login ulang.
      await segarkanMateri();
      return;
    }

    status.dataset.state = 'error';
    status.textContent = data.pesan || 'Gagal mengirim. Coba lagi sebentar lagi.';
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal mengirim: ' + err.message;
  } finally {
    tombol.disabled = false;
  }
}

(function pasangFinalTest() {
  var form = document.getElementById('final-form');
  if (form) form.addEventListener('submit', kirimTestimoni);
})();

/**
 * Minta ulang materi ke server memakai kredensial yang masih tersimpan.
 *
 * Dipakai setelah testimoni terkirim: syarat Final Test berubah di sisi
 * server, dan link ujiannya baru ikut dikirim pada permintaan berikutnya.
 * Tanpa ini siswa harus memuat ulang halaman dan login lagi.
 */
async function segarkanMateri() {
  if (!kredensialTerakhir) return;

  try {
    var res = await fetch('/api/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: kredensialTerakhir }),
    });
    var data = await res.json();
    if (res.ok && data.ok) renderMaterials(data.materials || {});
  } catch (err) {
    // Bukan kegagalan yang perlu dibesarkan: testimoninya sudah tersimpan,
    // dan memuat ulang halaman akan memberi hasil yang sama.
    console.error('Gagal menyegarkan materi setelah testimoni:', err.message);
  }
}
