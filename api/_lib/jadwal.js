/**
 * Jadwal sesi kelas: membaca dari sheet maupun dari /atur-kelas,
 * menghitung progres batch, dan menentukan kapan Zoom serta kuis
 * terbuka.
 *
 * Dipisah dari verify-access.js pada 2026-08-25, dipindah apa adanya.
 */

const { csvToRows } = require('./csv');
const { cachedFetch, fetchTextWithRetry, ISI_KELAS_CACHE_TTL_MS } = require('./ambil-sheet');

const INDONESIAN_MONTHS = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
];

function extractSchedule(csvText) {
  // Sheet jadwal ini sheet perencanaan manual (bukan tabel respons rapi
  // kayak roster), bentuknya kira-kira begini:
  //
  //   ,,TANGGAL FIX,,MATERI,,...
  //   ,,AGUSTUS,12,Reading,...
  //   ,,,16,,...
  //   ,,,19,,...
  //   ,,,21,Writing,...
  //   ,,SEPTEMBER,2,,...
  //
  // Jadi parsing-nya berbasis POSISI KOLOM relatif terhadap sel
  // "TANGGAL FIX": kolom itu sendiri berisi nama bulan (cuma diisi di
  // baris pertama tiap bulan, baris berikutnya kosong di kolom itu tapi
  // masih milik bulan yang sama), kolom+1 berisi tanggal (angka hari),
  // kolom+2 berisi topik materi (opsional, boleh kosong).
  const rows = csvToRows(csvText);
  if (rows.length === 0) {
    console.error('extractSchedule: sheet jadwal kosong (0 baris terbaca dari CSV).');
    return { sessions: [] };
  }

  let dateCol = -1;
  for (const row of rows) {
    const idx = row.findIndex((cell) => cell.trim().toLowerCase() === 'tanggal fix');
    if (idx !== -1) {
      dateCol = idx;
      break;
    }
  }
  if (dateCol === -1) {
    // Ini penyebab paling umum kartu jadwal kosong padahal env var sudah
    // diisi benar: sel "TANGGAL FIX" di sheet berubah teks/posisi/hilang,
    // atau SCHEDULE_CSV_URL kebetulan menunjuk ke tab/sheet yang salah
    // (mis. tab lain di spreadsheet yang sama, bukan yang ada tabel ini).
    console.error(
      'extractSchedule: sel "TANGGAL FIX" tidak ditemukan di ' + rows.length +
        ' baris yang dibaca dari SCHEDULE_CSV_URL. Cek apakah sheet-nya masih ' +
        'punya sel persis bertuliskan "TANGGAL FIX", dan apakah SCHEDULE_CSV_URL ' +
        'menunjuk ke tab/sheet yang benar.'
    );
    return { sessions: [] };
  }

  // Jam kelas dicari lewat teks bebas ("...JAM 20.00 WIB...") di sel mana
  // pun, bukan posisi kolom tetap -- itu cuma satu baris keterangan biasa
  // di sheet, bukan bagian dari tabel tanggal. Berlaku sama untuk semua
  // sesi di tabel "TANGGAL FIX" (sheet ini tidak punya jam berbeda per
  // sesi).
  let classHour = 20;
  let classMinute = 0;
  outer: for (const row of rows) {
    for (const cell of row) {
      const match = cell.match(/jam\s*(\d{1,2})[.:](\d{2})/i);
      if (match) {
        classHour = Number(match[1]);
        classMinute = Number(match[2]);
        break outer;
      }
    }
  }

  const now = Date.now();
  const sessions = [];
  let currentMonthIndex = -1;

  for (const row of rows) {
    const monthCell = (row[dateCol] || '').trim().toLowerCase();
    const monthIdx = INDONESIAN_MONTHS.indexOf(monthCell);
    if (monthIdx !== -1) currentMonthIndex = monthIdx;

    const dayCell = (row[dateCol + 1] || '').trim();
    const day = Number(dayCell);
    if (currentMonthIndex === -1 || !dayCell || !Number.isInteger(day) || day < 1 || day > 31) {
      continue;
    }

    const topic = (row[dateCol + 2] || '').trim();

    // Sheet tidak pernah menulis tahun (cuma "AGUSTUS", bukan "Agustus
    // 2026"), jadi tahun ditebak: coba tahun berjalan dulu, dan kalau
    // hasilnya jatuh lebih dari ~200 hari di masa lalu, majukan setahun.
    // Ini supaya batch yang jadwalnya disusun di penghujung tahun untuk
    // bulan awal tahun depan (mis. Januari) tetap terbaca sebagai sesi
    // yang akan datang, bukan dianggap sudah lewat.
    let year = new Date().getFullYear();
    // WIB = UTC+7 tetap sepanjang tahun (tidak ada DST), jadi jam lokal
    // dikonversi ke UTC dengan mengurangi 7 jam saat membangun Date-nya.
    let sessionMs = Date.UTC(year, currentMonthIndex, day, classHour - 7, classMinute);
    if (sessionMs < now - 200 * 24 * 60 * 60 * 1000) {
      year += 1;
      sessionMs = Date.UTC(year, currentMonthIndex, day, classHour - 7, classMinute);
    }

    sessions.push({
      isoDatetime: new Date(sessionMs).toISOString(),
      topic: topic || null,
    });
  }

  sessions.sort((a, b) => a.isoDatetime.localeCompare(b.isoDatetime));
  // console.log (bukan console.error) -- ini bukan kegagalan, cuma jejak
  // buat ketauan lewat Vercel Functions log kalau kartu jadwal ternyata
  // kosong padahal parsing-nya sendiri berhasil (mis. semua sesi di sheet
  // sudah lewat tanggalnya).
  console.log(
    'extractSchedule: ketemu ' + sessions.length + ' baris sesi di tabel "TANGGAL FIX" ' +
      '(kolom tanggal index ' + dateCol + ', jam kelas ' + classHour + ':' +
      String(classMinute).padStart(2, '0') + ' WIB). Sesi yang sudah lewat difilter ' +
      'terpisah setelah ini oleh pemanggil.'
  );
  return { sessions };
}

// Kartu Zoom terkunci sampai 5 menit sebelum sesi berikutnya mulai, dan
// tetap terbuka sepanjang sesi itu masih berlangsung (durasi dianggap 1
// jam penuh -- fakta produk yang sama dipakai di tempat lain, "Satu jam
// penuh via Zoom"). BEDA dari tanggal buka kuis (lihat
// computePracticeUnlocksFromDates): ini SENGAJA tetap terikat ke jadwal
// kelas beneran (SCHEDULE_CSV_URL / tabel "TANGGAL FIX"), bukan tanggal
// manual terpisah -- karena pertanyaannya memang "sesi ini lagi jalan
// atau enggak", bukan "kontennya udah boleh dibuka belum".
const ZOOM_UNLOCK_LEAD_MS = 5 * 60 * 1000;
const ZOOM_SESSION_DURATION_MS = 60 * 60 * 1000;

// Dipanggil dengan SEMUA sesi (bukan cuma upcomingSessions yang sudah
// difilter di pemanggil) -- justru sesi yang SUDAH MULAI tapi belum
// genap 1 jam yang perlu dicek di sini juga. Kalau cuma pakai
// upcomingSessions, siswa yang login PAS sesi lagi jalan bisa salah
// dikunci, karena begitu jam mulai sebuah sesi lewat, sesi itu langsung
// hilang dari daftar "akan datang".
/**
 * Berapa sesi dari batch ini yang sudah selesai, dari total seluruhnya.
 *
 * Dihitung dari SEMUA sesi, bukan upcomingSessions, karena yang dikirim
 * ke browser sengaja cuma sesi yang belum lewat -- browser sendiri tidak
 * punya cara tahu batch ini seluruhnya ada berapa sesi.
 *
 * Sebuah sesi dihitung selesai setelah jam mulainya lewat DITAMBAH durasi
 * satu sesi, bukan begitu jam mulainya lewat. Kalau tidak, siswa yang
 * membuka halaman ini di tengah kelas akan melihat sesi yang sedang dia
 * ikuti sudah dihitung selesai.
 */
function hitungProgres(sessions) {
  if (!sessions || sessions.length === 0) return null;

  const now = Date.now();
  let selesai = 0;

  for (const session of sessions) {
    const mulai = new Date(session.isoDatetime).getTime();
    // Sesi dengan tanggal yang gagal diparsing tidak dihitung selesai
    // maupun tersisa; mengabaikannya lebih jujur daripada menebak.
    if (!Number.isFinite(mulai)) continue;
    if (mulai + ZOOM_SESSION_DURATION_MS <= now) selesai++;
  }

  return { selesai, total: sessions.length };
}

// Pemetaan field materi -> kunci yang diisi admin di /atur-kelas.

function jadwalDariConfig(overrides) {
  const daftar = overrides && Array.isArray(overrides.kelasJadwal) ? overrides.kelasJadwal : [];
  if (daftar.length === 0) return null;

  const sessions = [];
  daftar.forEach((s) => {
    const tanggal = String((s && s.tanggal) || '').trim();
    const jam = String((s && s.jam) || '').trim() || '20:00';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
    const j = /^(\d{1,2}):(\d{2})$/.exec(jam);
    if (!m || !j) return;

    // Jam ditulis admin dalam WIB, sedangkan server berjalan di UTC.
    const ms = Date.UTC(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(j[1]) - 7, Number(j[2])
    );
    if (!Number.isFinite(ms)) return;

    sessions.push({
      isoDatetime: new Date(ms).toISOString(),
      topic: String((s && s.topik) || '').trim() || null,
    });
  });

  sessions.sort((a, b) => a.isoDatetime.localeCompare(b.isoDatetime));
  return sessions;
}

/**
 * Boleh atau tidak siswa ini membuka Final Test.
 *
 * Dua syarat, dan keduanya harus terpenuhi:
 *   1. waktunya sudah lewat
 *   2. dia sudah mengisi testimoni
 *
 * Syarat kedua yang membuat testimoni benar-benar terkumpul. Syarat
 * pertama yang menjaga supaya ujiannya tidak dibuka lebih awal.
 *
 * TANPA jadwal yang disetel, hasilnya TIDAK BOLEH. Ini kebalikan dari
 * computeZoomUnlock yang sengaja gagal-terbuka: kartu Zoom yang keliru
 * terkunci merugikan siswa yang sedang menunggu kelas, sedangkan ujian
 * yang keliru terbuka lebih awal tidak bisa ditarik kembali.
 */

function computeZoomUnlock(sessions) {
  const now = Date.now();

  // Tidak ada data jadwal sama sekali (SCHEDULE_CSV_URL kosong/gagal
  // diakses/gagal diparsing) -- jangan pernah mengunci tanpa kepastian
  // kapan kebuka. Gagal terbuka, bukan gagal tertutup.
  if (!sessions || sessions.length === 0) {
    return { unlocked: true, unlocksAt: null };
  }

  let soonestUnlockAt = null;

  for (const session of sessions) {
    const startMs = new Date(session.isoDatetime).getTime();
    const openFrom = startMs - ZOOM_UNLOCK_LEAD_MS;
    const openUntil = startMs + ZOOM_SESSION_DURATION_MS;

    if (now >= openFrom && now <= openUntil) {
      return { unlocked: true, unlocksAt: null };
    }
    if (openFrom > now && (soonestUnlockAt === null || openFrom < soonestUnlockAt)) {
      soonestUnlockAt = openFrom;
    }
  }

  if (soonestUnlockAt === null) {
    // Tidak ada sesi yang lagi berlangsung DAN tidak ada sesi akan
    // datang yang jadwalnya kebaca (mis. semua tanggal di sheet sudah
    // lewat) -- daripada mengunci tanpa kepastian kapan kebuka lagi,
    // biarkan terbuka.
    return { unlocked: true, unlocksAt: null };
  }

  return { unlocked: false, unlocksAt: new Date(soonestUnlockAt).toISOString() };
}

async function fetchSchedule(url) {
  // Sama seperti sumber roster: kalau sheet ini gagal diakses atau
  // bentuknya berubah sampai tidak ketemu tabel "TANGGAL FIX", jangan
  // sampai menggagalkan login -- materi lain (Zoom/Drive/WhatsApp/dll)
  // tetap harus bisa diakses. Kartu jadwal & timer di client cukup jadi
  // kosong/tersembunyi kalau ini gagal.
  try {
    const text = await cachedFetch('schedule:' + url, ISI_KELAS_CACHE_TTL_MS, () =>
      fetchTextWithRetry(url)
    );
    return extractSchedule(text);
  } catch (err) {
    console.error('Gagal memuat jadwal kelas dari SCHEDULE_CSV_URL: ' + err.message);
    return { sessions: [] };
  }
}

// Tanggal buka kuis Latihan Soal (Reading/Listening/Writing) di
// kelas.html itu TERPISAH dari tabel jadwal "TANGGAL FIX" -- sengaja,
// atas permintaan user, supaya ganti tanggal buka kuis tidak perlu
// mengutak-atik kalender kelas beneran. Diisi manual per skill lewat
// MATERIALS_CSV_URL (baris "Kuis Reading Buka", dst -- lihat
// extractMaterials), format "20 Agustus" atau "20 Agustus 2026".
//
// parseIndonesianDate: sama gaya parsing tahun dengan extractSchedule
// (tahun opsional, pakai tahun berjalan, majukan setahun kalau hasilnya
// jatuh jauh di masa lalu). Beda dari jadwal sesi kelas yang punya jam
// spesifik ("MULAI JAM 20.00 WIB"), tanggal buka kuis dianggap berlaku
// mulai AWAL hari itu (00:00 WIB) -- ini tanggal kebuka akses, bukan
// jadwal sesi.
function parseIndonesianDate(str) {
  const text = (str || '').trim().toLowerCase();

  // Bentuk ISO ikut diterima karena /atur-kelas memakai <input type="date">
  // yang selalu menghasilkan "2026-09-01". Sheet lama tetap memakai
  // "20 Agustus", dan keduanya harus jalan berdampingan selama sheet
  // masih dipakai sebagai cadangan.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), -7, 0);
  }
  const match = text.match(/(\d{1,2})\s+([a-z]+)\s*(\d{4})?/);
  if (!match) return null;

  const day = Number(match[1]);
  const monthIdx = INDONESIAN_MONTHS.indexOf(match[2]);
  if (monthIdx === -1 || !Number.isInteger(day) || day < 1 || day > 31) return null;

  let year = match[3] ? Number(match[3]) : new Date().getFullYear();
  let ms = Date.UTC(year, monthIdx, day, -7, 0);
  if (!match[3] && ms < Date.now() - 200 * 24 * 60 * 60 * 1000) {
    year += 1;
    ms = Date.UTC(year, monthIdx, day, -7, 0);
  }
  return ms;
}

// Kalau tanggal buka kuis untuk suatu skill tidak diisi di sheet, atau
// formatnya gagal dibaca, kuis itu SENGAJA TIDAK dikunci -- gagal
// terbuka, bukan gagal tertutup. Mengunci kuis tanpa tanggal yang jelas
// (atau karena salah ketik format) lebih buruk daripada kuisnya kebuka
// lebih awal dari rencana.
function computePracticeUnlocksFromDates(unlockDates) {
  const result = {
    reading: { unlocked: true, unlocksAt: null },
    listening: { unlocked: true, unlocksAt: null },
    writing: { unlocked: true, unlocksAt: null },
  };
  if (!unlockDates) return result;

  Object.keys(result).forEach((skill) => {
    const raw = unlockDates[skill];
    if (!raw) return;

    const ms = parseIndonesianDate(raw);
    if (ms === null) {
      console.error(
        'Tanggal buka kuis ' + skill + ' tidak kebaca dari MATERIALS_CSV_URL: "' +
          raw + '" -- pakai format "20 Agustus" atau "20 Agustus 2026". Kuis ' +
          'ini sementara tetap terbuka sampai formatnya diperbaiki.'
      );
      return;
    }

    if (ms > Date.now()) {
      result[skill] = { unlocked: false, unlocksAt: new Date(ms).toISOString() };
    }
  });

  return result;
}

// Kolom A di sheet materi = nama field dalam bahasa manusia (bebas, boleh
// beda-beda kata asal masih mengandung salah satu keyword di sini).
// Kolom B = isinya (link atau teks pengumuman). Urutan array menentukan
// prioritas kalau ada label ambigu yang cocok ke lebih dari satu field
// (dicek dari atas ke bawah, yang pertama cocok yang menang) -- makanya
// 'reading'/'listening'/'writing' ditaruh sebelum keyword umum apa pun
// yang bisa tumpang tindih.

module.exports = { extractSchedule, hitungProgres, jadwalDariConfig, computeZoomUnlock, fetchSchedule, parseIndonesianDate, computePracticeUnlocksFromDates, ZOOM_UNLOCK_LEAD_MS, ZOOM_SESSION_DURATION_MS };
