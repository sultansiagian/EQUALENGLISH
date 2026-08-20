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

  renderSchedule(materials.schedule || []);
  renderProgres(materials.progres);
  renderFinalTest(materials);

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
// FINAL TEST
// ============================================================
// Syaratnya ditentukan SERVER (hitungFinalTest di
// api/verify-access.js): waktunya sudah lewat DAN siswa ini sudah
// mengisi testimoni. File ini cuma menggambarkan keadaannya.
//
// Link ujiannya juga datang dari server dan CUMA dikirim kalau kedua
// syaratnya terpenuhi, jadi tidak ada yang bisa didapat dengan membuka
// isi balasan server lebih awal.

var finalPenanda = null; // id setInterval hitung mundur

function renderFinalTest(materials) {
  var kartu = document.getElementById('kelas-final');
  if (!kartu) return;

  var f = materials.finalTest;
  // materials lama (mis. dari cache) belum punya field ini. Kartunya
  // disembunyikan saja, bukan menampilkan keadaan yang salah.
  if (!f) {
    kartu.hidden = true;
    return;
  }

  var status = document.getElementById('final-status');
  var form = document.getElementById('final-form');
  var buka = document.getElementById('final-buka');
  var timer = document.getElementById('final-timer');

  kartu.hidden = false;
  form.hidden = true;
  buka.hidden = true;
  timer.hidden = true;
  hentikanHitungMundurFinal();

  if (!f.adaJadwal || !f.adaLink) {
    // Belum disiapkan admin. Dikatakan apa adanya, bukan dibiarkan
    // seperti tombol yang rusak.
    status.textContent =
      'Final Test belum dijadwalkan. Pantau pengumuman atau tanya lewat grup ' +
      'WhatsApp kalau menurutmu seharusnya sudah dibuka.';
    return;
  }

  // Form testimoni ditampilkan selama belum diisi, TERMASUK sebelum
  // waktunya tiba. Supaya bisa disiapkan lebih dulu dan tidak menumpuk
  // di menit terakhir saat semua orang mau mulai bersamaan.
  if (!f.sudahTestimoni) form.hidden = false;

  if (!f.sudahWaktunya) {
    status.textContent = f.sudahTestimoni
      ? 'Testimonimu sudah masuk, terima kasih. Tinggal menunggu waktunya tiba.'
      : 'Final Test dibuka ' + waktuFinalTerbaca(f.bukaPada) +
        '. Sambil menunggu, isi dulu ceritanya di bawah supaya nanti kamu ' +
        'langsung bisa masuk.';
    timer.hidden = false;
    mulaiHitungMundurFinal(f.bukaPada);
    return;
  }

  if (!f.sudahTestimoni) {
    status.textContent =
      'Final Test sudah dibuka. Tinggal satu langkah: ceritakan pengalamanmu ' +
      'di bawah, lalu tombol ujiannya langsung muncul.';
    return;
  }

  status.textContent = 'Final Test sudah dibuka. Semoga lancar.';
  document.getElementById('final-link').href = materials.finalTestUrl || '#';
  buka.hidden = false;
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

    var detik = Math.floor(sisa / 1000);
    var hari = Math.floor(detik / 86400);
    var jam = Math.floor((detik % 86400) / 3600);
    var menit = Math.floor((detik % 3600) / 60);

    var bagian = [];
    if (hari > 0) bagian.push(hari + ' hari');
    if (hari > 0 || jam > 0) bagian.push(jam + ' jam');
    bagian.push(menit + ' menit');

    // Detik cuma ditampilkan kalau sudah dekat, supaya angka yang
    // berkedip tiap detik tidak mengganggu padahal masih berhari-hari.
    if (sisa < 3600000) bagian.push((detik % 60) + ' detik');

    el.textContent = bagian.join(' ') + ' lagi';
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
      status.textContent = 'Terima kasih, testimonimu sudah masuk.';

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
