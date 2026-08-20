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
// Disimpan supaya tombol unduh bisa menggambar sertifikat tanpa
// meminta ulang datanya ke server.
var dataSertifikat = null;

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
  renderProgres(materials.progres);
  renderSertifikat(materials);

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
// SERTIFIKAT KELULUSAN
// ============================================================
// Syaratnya ditentukan SERVER (hitungSertifikat di
// api/verify-access.js), bukan di sini: seluruh sesi sudah lewat DAN
// siswa ini sudah mengisi testimoni. File ini cuma menggambarkan
// keadaannya dan menyediakan tombolnya.

var SERTIFIKAT_LEBAR = 1600;
var SERTIFIKAT_TINGGI = 1131; // sekitar rasio A4 mendatar

function renderSertifikat(materials) {
  var kartu = document.getElementById('kelas-sertifikat');
  if (!kartu) return;

  var s = materials.sertifikat;
  // materials lama (mis. dari cache) belum punya field ini. Kartunya
  // disembunyikan saja, bukan menampilkan keadaan yang salah.
  if (!s) {
    kartu.hidden = true;
    return;
  }

  dataSertifikat = {
    nama: materials.namaLengkap || '',
    mentorNama: materials.sertifikatMentorNama || '',
    tandaTanganUrl: materials.sertifikatTandaTanganUrl || '',
    // Setelan templat buatan pemilik situs. Kalau url-nya terisi,
    // seluruh desain bawaan dilewati (lihat buatSertifikat).
    templat: materials.sertifikatTemplate || null,
  };

  var status = document.getElementById('sertifikat-status');
  var form = document.getElementById('sertifikat-form');
  var unduh = document.getElementById('sertifikat-unduh');

  kartu.hidden = false;
  form.hidden = true;
  unduh.hidden = true;

  if (!s.adaJadwal) {
    // Tanpa jadwal, tidak ada cara tahu kelasnya sudah selesai. Dikatakan
    // apa adanya, bukan dibiarkan seperti tombol yang rusak.
    status.textContent =
      'Sertifikat terbuka setelah sesi terakhir selesai. Jadwal sesi belum terbaca di sini, ' +
      'jadi hubungi kami lewat WhatsApp kalau kelasmu sebenarnya sudah selesai.';
    return;
  }

  if (!s.kelasSelesai) {
    status.textContent =
      'Sertifikatmu terbuka setelah sesi terakhir selesai. Sedikit lagi, teruskan sampai tuntas.';
    return;
  }

  if (!s.sudahTestimoni) {
    status.textContent =
      'Kelasmu sudah selesai. Tinggal satu langkah: ceritakan pengalamanmu di bawah, ' +
      'lalu sertifikatmu langsung bisa diunduh.';
    form.hidden = false;
    return;
  }

  status.textContent =
    'Selamat, kamu sudah menyelesaikan kelasnya. Terima kasih sudah menulis testimoni.';
  unduh.hidden = false;
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
          nama: dataSertifikat ? dataSertifikat.nama : '',
          fakultas: document.getElementById('testi-fakultas').value.trim(),
          skorEpt: document.getElementById('testi-skor').value.trim(),
          izinTayang: document.getElementById('testi-izin').checked,
          pesan: pesan,
        },
      }),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      document.getElementById('sertifikat-form').hidden = true;
      document.getElementById('sertifikat-status').textContent = data.pesan
        ? data.pesan
        : 'Terima kasih. Sertifikatmu sudah bisa diunduh.';
      document.getElementById('sertifikat-unduh').hidden = data.sertifikatTerbuka === false;
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

/**
 * Muat satu gambar, balik null kalau gagal.
 *
 * Sengaja tidak pernah melempar: sertifikat tanpa logo atau tanpa tanda
 * tangan masih berguna, sedangkan sertifikat yang gagal dibuat sama
 * sekali tidak.
 */
function muatGambar(src) {
  return new Promise(function (resolve) {
    if (!src) return resolve(null);
    var img = new Image();
    // Tanda tangan disimpan di Vercel Blob (domain lain). Tanpa ini,
    // menggambarnya ke canvas membuat canvas tercemar dan toBlob ditolak
    // browser, jadi unduhannya gagal total.
    img.crossOrigin = 'anonymous';
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

function teksTengah(ctx, teks, y, font, warna) {
  ctx.font = font;
  ctx.fillStyle = warna;
  ctx.textAlign = 'center';
  ctx.fillText(teks, SERTIFIKAT_LEBAR / 2, y);
}

/**
 * Tulis nama siswa di atas templat buatan pemilik situs.
 *
 * Semua nilai posisinya PERSEN terhadap ukuran templat, bukan piksel,
 * supaya setelan yang sama tetap benar kalau templatnya nanti diganti
 * dengan yang resolusinya berbeda.
 *
 * Dipakai bersama pratinjau di /admin (lihat gambarPratinjauSertifikat di
 * admin.js). Kalau perhitungan di sini berubah, yang di sana harus ikut,
 * kalau tidak pratinjaunya berbohong.
 */
function gambarNamaDiTemplat(ctx, lebar, tinggi, nama, t) {
  var font = t.namaFont === 'DM Sans' ? '"DM Sans", sans-serif' : '"Syne", sans-serif';
  var px = (Number(t.namaUkuran) / 100) * lebar;
  if (!Number.isFinite(px) || px <= 0) px = lebar * 0.06;

  ctx.font = '700 ' + px + 'px ' + font;

  // Nama panjang dikecilkan supaya tidak keluar dari templat. Batasnya
  // 84% lebar, menyisakan tepi kiri kanan supaya tidak menempel bingkai
  // desain apa pun yang dipakai.
  var maks = lebar * 0.84;
  while (ctx.measureText(nama).width > maks && px > 10) {
    px -= Math.max(1, px * 0.04);
    ctx.font = '700 ' + px + 'px ' + font;
  }

  ctx.fillStyle = t.namaWarna || '#000000';
  ctx.textAlign = 'center';
  // 'middle' supaya titik Y yang diatur admin adalah TENGAH tinggi
  // hurufnya. Dengan baseline bawaan ('alphabetic'), menggeser Y akan
  // terasa meleset karena yang dipindah adalah garis dasar huruf.
  ctx.textBaseline = 'middle';
  ctx.fillText(nama, (Number(t.namaX) / 100) * lebar, (Number(t.namaY) / 100) * tinggi);
}

async function buatSertifikat() {
  var status = document.getElementById('sertifikat-unduh-status');
  var tombol = document.getElementById('sertifikat-tombol');

  tombol.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Menyiapkan...';

  try {
    // Font harus benar-benar termuat sebelum digambar. Canvas tidak
    // menunggu font seperti HTML: kalau digambar terlalu cepat, hasilnya
    // memakai font cadangan dan sertifikatnya terlihat asal jadi.
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    var nama = (dataSertifikat && dataSertifikat.nama) || 'Peserta EQUAL English';
    var templat = (dataSertifikat && dataSertifikat.templat) || null;

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');

    // Templat buatan sendiri menang atas desain bawaan. Kalau gambarnya
    // gagal dimuat (URL mati, jaringan bermasalah), TIDAK jatuh ke desain
    // bawaan diam-diam: pemilik situs sudah memutuskan sertifikatnya
    // berbentuk lain, dan mengirim bentuk yang berbeda tanpa memberi tahu
    // siapa pun lebih buruk daripada berterus terang gagal.
    var tmplImg = templat && templat.url ? await muatGambar(templat.url) : null;
    if (templat && templat.url && !tmplImg) {
      throw new Error('templat sertifikat gagal dimuat');
    }

    if (tmplImg) {
      canvas.width = tmplImg.width;
      canvas.height = tmplImg.height;
      ctx.drawImage(tmplImg, 0, 0);
      gambarNamaDiTemplat(ctx, canvas.width, canvas.height, nama, templat);
    } else {
      await gambarDesainBawaan(ctx, canvas, nama);
    }

    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) throw new Error('gambar gagal dibuat');

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Sertifikat EQUAL English - ' + nama + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Ditunda sebentar sebelum dilepas: sebagian browser membatalkan
    // unduhan kalau URL blob-nya sudah dicabut waktu unduhan mulai.
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 30000);

    status.dataset.state = 'ok';
    status.textContent = 'Tersimpan ke folder unduhanmu.';
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent =
      'Gagal membuat sertifikat: ' + err.message + '. Hubungi kami lewat WhatsApp.';
  } finally {
    tombol.disabled = false;
  }
}

/**
 * Desain bawaan, dipakai selama pemilik situs belum mengunggah templat
 * sendiri. Menggambar seluruh sertifikat dari nol: bingkai, logo, teks,
 * dan blok tanda tangan.
 */
async function gambarDesainBawaan(ctx, canvas, nama) {
  canvas.width = SERTIFIKAT_LEBAR;
  canvas.height = SERTIFIKAT_TINGGI;

  var hasil = await Promise.all([
    muatGambar('/EDITS/logo-equal-black.png'),
    muatGambar(dataSertifikat && dataSertifikat.tandaTanganUrl),
  ]);
  var logo = hasil[0];
  var ttd = hasil[1];

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SERTIFIKAT_LEBAR, SERTIFIKAT_TINGGI);

  // Bingkai: garis pink tebal di luar, garis hitam tipis di dalam.
  ctx.strokeStyle = '#ffacdf';
  ctx.lineWidth = 18;
  ctx.strokeRect(40, 40, SERTIFIKAT_LEBAR - 80, SERTIFIKAT_TINGGI - 80);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 72, SERTIFIKAT_LEBAR - 144, SERTIFIKAT_TINGGI - 144);

  if (logo) {
    var lebarLogo = 260;
    var tinggiLogo = (logo.height / logo.width) * lebarLogo;
    ctx.drawImage(logo, (SERTIFIKAT_LEBAR - lebarLogo) / 2, 140, lebarLogo, tinggiLogo);
  }

  teksTengah(ctx, 'SERTIFIKAT KELULUSAN', 330, '500 30px "DM Mono", monospace', '#5c5b5b');
  teksTengah(ctx, 'Diberikan kepada', 420, '400 30px "DM Sans", sans-serif', '#5c5b5b');

  // Nama panjang dikecilkan supaya tetap muat di dalam bingkai, bukan
  // terpotong di tepinya.
  var ukuran = 90;
  ctx.font = '700 ' + ukuran + 'px "Syne", sans-serif';
  while (ctx.measureText(nama).width > SERTIFIKAT_LEBAR - 320 && ukuran > 36) {
    ukuran -= 4;
    ctx.font = '700 ' + ukuran + 'px "Syne", sans-serif';
  }
  teksTengah(ctx, nama, 530, '700 ' + ukuran + 'px "Syne", sans-serif', '#000000');

  ctx.strokeStyle = '#ffacdf';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(SERTIFIKAT_LEBAR / 2 - 320, 570);
  ctx.lineTo(SERTIFIKAT_LEBAR / 2 + 320, 570);
  ctx.stroke();

  teksTengah(
    ctx,
    'atas keikutsertaannya dalam Bootcamp Persiapan EPT UI',
    650,
    '400 32px "DM Sans", sans-serif',
    '#000000'
  );
  teksTengah(
    ctx,
    'yang diselenggarakan oleh EQUAL English.',
    700,
    '400 32px "DM Sans", sans-serif',
    '#000000'
  );

  var bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  var kini = new Date();
  teksTengah(
    ctx,
    kini.getDate() + ' ' + bulan[kini.getMonth()] + ' ' + kini.getFullYear(),
    770,
    '500 26px "DM Mono", monospace',
    '#5c5b5b'
  );

  // Blok tanda tangan. Kalau tidak ada nama mentor yang disetel, seluruh
  // blok ini dilewati -- garis tanda tangan kosong tanpa nama terlihat
  // seperti sertifikat yang belum selesai dibuat.
  var namaMentor = (dataSertifikat && dataSertifikat.mentorNama) || '';
  if (namaMentor) {
    // 915, bukan lebih rendah: di bawah garis masih ada nama mentor
    // (+45) dan kata Mentor (+82), jadi barisan terakhirnya mendarat di
    // 997 sementara bingkai dalam berakhir di 1059. Sisa 62px itu yang
    // membuatnya tidak terlihat mepet.
    var yGaris = 915;
    if (ttd) {
      var lebarTtd = 240;
      var tinggiTtd = (ttd.height / ttd.width) * lebarTtd;
      if (tinggiTtd > 120) {
        tinggiTtd = 120;
        lebarTtd = (ttd.width / ttd.height) * tinggiTtd;
      }
      ctx.drawImage(
        ttd,
        (SERTIFIKAT_LEBAR - lebarTtd) / 2,
        yGaris - tinggiTtd - 10,
        lebarTtd,
        tinggiTtd
      );
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SERTIFIKAT_LEBAR / 2 - 200, yGaris);
    ctx.lineTo(SERTIFIKAT_LEBAR / 2 + 200, yGaris);
    ctx.stroke();
    teksTengah(ctx, namaMentor, yGaris + 45, '600 28px "DM Sans", sans-serif', '#000000');
    teksTengah(ctx, 'Mentor', yGaris + 82, '400 24px "DM Mono", monospace', '#5c5b5b');
  }
}

(function pasangSertifikat() {
  var form = document.getElementById('sertifikat-form');
  if (form) form.addEventListener('submit', kirimTestimoni);
  var tombol = document.getElementById('sertifikat-tombol');
  if (tombol) tombol.addEventListener('click', buatSertifikat);
})();
