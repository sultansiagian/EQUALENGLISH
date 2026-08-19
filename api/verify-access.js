// Modul bawaan Node, bukan dependency tambahan (proyek ini sengaja
// zero-dependency) -- dipakai buat verifikasi signature JWT secara
// lokal, lihat verifyGoogleTokenLocal() di bawah.
const crypto = require('crypto');

/**
 * Endpoint terlindungi untuk halaman kelas EQUAL English.
 *
 * INI YANG BIKIN PROTEKSINYA NYATA: fungsi ini jalan di server Vercel,
 * bukan di browser pengunjung. Materi (link Drive, Zoom, Quizizz, jadwal)
 * tidak pernah dikirim ke browser sampai email pengunjung terverifikasi
 * ada di daftar siswa. Kalau proteksinya cuma dicek di JavaScript sisi
 * klien, siapa pun bisa buka "View Page Source" dan lihat semua link
 * tanpa login sama sekali.
 *
 * Alur:
 *   1. Klien mengirim ID token dari tombol "Sign in with Google".
 *   2. Fungsi ini memverifikasi token itu SECARA LOKAL (cek signature JWT
 *      pakai kunci publik Google yang di-cache, lihat
 *      verifyGoogleTokenLocal), tanpa nge-hit server Google tiap login.
 *      Endpoint tokeninfo Google (dipakai versi lama fungsi ini) cuma
 *      cadangan sekarang -- dipakai OTOMATIS kalau verifikasi lokal
 *      gagal karena sebab teknis, lihat verifyGoogleToken di bawah.
 *   3. Fungsi ini mengambil daftar siswa dari Google Sheet yang sudah
 *      di-publish sebagai CSV, lalu mencocokkan email yang sudah
 *      terverifikasi tadi. Hasil fetch sheet (roster/jadwal/materi)
 *      di-cache singkat (lihat CSV_CACHE_TTL_MS) supaya banyak siswa
 *      yang login berdekatan waktu tidak masing-masing memicu fetch
 *      baru ke Google untuk data yang sama persis.
 *   4. Materi dikembalikan hanya jika keduanya cocok.
 *
 * ENV VARS yang wajib diisi di Vercel (Project Settings > Environment
 * Variables), bukan di sini, supaya tidak ikut ter-commit ke Git:
 *   GOOGLE_CLIENT_ID    Client ID dari Google Cloud Console
 *   ROSTER_CSV_URLS     Satu atau lebih link "Publish to web" (format
 *                       CSV), dipisah koma. Bisa lebih dari satu sheet
 *                       -- misalnya respons Google Form (yang kadang
 *                       ada human error atau gagal submit) DAN sheet
 *                       manual berisi orang yang sudah bayar tapi
 *                       belum sempat isi form. Kalau salah satu sheet
 *                       gagal diakses, sheet yang lain tetap dipakai;
 *                       tidak semua orang ikut ditolak gara-gara satu
 *                       sumber bermasalah.
 *   SCHEDULE_CSV_URL    OPSIONAL. Link "Publish to web" (format CSV) dari
 *                       sheet utama EQUAL yang berisi tabel "TANGGAL FIX"
 *                       (bulan, tanggal, topik materi) dan keterangan jam
 *                       mulai kelas ("MULAI JAM 20.00 WIB"). Dipakai untuk
 *                       kartu jadwal + timer sesi berikutnya di kelas.html.
 *                       Kosongkan untuk mematikan kedua fitur itu (materi
 *                       lain tetap jalan seperti biasa). Lihat
 *                       extractSchedule() di bawah untuk detail parsing --
 *                       posisi kolomnya mengikuti bentuk sheet apa adanya,
 *                       jadi kalau tabel "TANGGAL FIX" dipindah/diubah
 *                       strukturnya di sheet, parsing ini bisa berhenti
 *                       menemukan datanya (gagal diam-diam, kartu jadwal
 *                       cuma jadi kosong, bukan error yang menghentikan
 *                       login).
 *   MATERIALS_CSV_URL   OPSIONAL. Link "Publish to web" (format CSV) dari
 *                       sheet 2 kolom (Nama | Isi/Link) berisi link Zoom/
 *                       Drive/WhatsApp/kuis dan teks pengumuman -- supaya
 *                       hal-hal yang paling sering berubah (mis. link
 *                       Drive tiap ganti batch) bisa diedit langsung di
 *                       Sheets tanpa commit/push kode. Baris yang
 *                       namanya cocok sama salah satu keyword di
 *                       MATERIALS_FIELDS di bawah menimpa nilai
 *                       DEFAULT_MATERIALS untuk field itu; baris yang
 *                       kosong/tidak dikenali diabaikan, dan field yang
 *                       sama sekali tidak ada di sheet tetap pakai nilai
 *                       DEFAULT_MATERIALS. Kosongkan env var ini untuk
 *                       matikan fitur ini sepenuhnya (semua materi balik
 *                       ke DEFAULT_MATERIALS, sama seperti sebelum ada
 *                       sheet ini).
 *
 *                       Sheet yang sama ini JUGA dipakai buat tanggal buka
 *                       kuis Latihan Soal -- baris "Kuis Reading Buka",
 *                       "Kuis Listening Buka", "Kuis Writing Buka", isi
 *                       formatnya "20 Agustus" atau "20 Agustus 2026".
 *                       SENGAJA terpisah dari tabel jadwal "TANGGAL FIX"
 *                       (SCHEDULE_CSV_URL) -- ganti tanggal buka kuis
 *                       tidak perlu mengutak-atik kalender kelas beneran.
 *                       Kosongkan/hapus baris itu untuk kuis yang tidak
 *                       mau dikunci. Lihat computePracticeUnlocksFromDates().
 *
 * ENV VAR OPSIONAL, untuk buka form yang sama ke beberapa batch tanpa
 * batch lama ikut kebawa ke kelas batch baru:
 *   BATCH_CUTOFF_DATE   Tanggal buka batch yang sedang berjalan, format
 *                       "2026-09-01". Baris di sheet RESPONS FORM yang
 *                       kolom Timestamp-nya SEBELUM tanggal ini dianggap
 *                       bukan siswa batch aktif dan tidak dihitung.
 *                       Dipakai lewat kolom "Timestamp" yang otomatis
 *                       dibuat Google Form di setiap respons, jadi tidak
 *                       perlu ubah apa pun di form.
 *
 *                       Sheet MANUAL (tidak punya kolom Timestamp) TIDAK
 *                       ikut difilter tanggal ini -- kosongkan sheet itu
 *                       secara manual tiap mulai batch baru.
 *
 *                       Kosongkan env var ini untuk mematikan filter
 *                       (semua baris dihitung, seperti sebelum ada
 *                       konsep batch). Cocok dipakai selama masih
 *                       satu batch pertama berjalan.
 *
 *                       SEDANG DI-HOLD, belum dipakai aktif (lihat
 *                       REVOKED_MARKER di bawah untuk cara yang sedang
 *                       dipakai). Kodenya dibiarkan menyala, tidak
 *                       dihapus, kalau-kalau nanti dibutuhkan lagi.
 *
 * CARA YANG SEDANG DIPAKAI untuk mencabut akses satu siswa (tanpa env
 * var, tanpa mikirin tanggal): ketik kata "done" di sel PALING KANAN
 * baris orang itu, di sheet form atau sheet manual, kapan saja. Lihat
 * konstanta REVOKED_MARKER di bawah. Baris yang ditandai langsung
 * tidak dihitung lagi di request berikutnya (tidak perlu redeploy,
 * roster diambil ulang setiap kali ada yang login).
 */

// ============================================================
// NILAI CADANGAN MATERI KELAS. Dipakai kalau MATERIALS_CSV_URL kosong,
// gagal diakses, ATAU sheet-nya tidak punya baris untuk field tertentu
// (field itu jatuh balik ke sini, field lain di sheet tetap dipakai).
// Aman ditaruh di sini (bukan di kode yang dikirim ke browser) karena
// file ini hanya berjalan di server.
//
// Cara mengubah materi SEHARI-HARI (link Drive ganti batch, dst): edit
// langsung di Google Sheet lewat MATERIALS_CSV_URL, TIDAK perlu commit/
// push kode. Nilai di bawah ini cuma jaring pengaman kalau sheet-nya lagi
// kosong/error/belum diisi -- bukan cara utama lagi buat update materi.
//
// Rekaman Zoom tidak punya field terpisah karena ditaruh langsung oleh
// mentor ke dalam folder Drive di bawah (bukan ditautkan dari sini).
//
// zoomJoinUrl, communityUrl, dan ketiga practiceXxxUrl adalah link yang
// dipakai ULANG terus-menerus (bukan sekali pakai) -- grup/meeting/kuis
// yang bisa disusupi kalau linknya bocor ke publik. Makanya semuanya
// sengaja cuma muncul di halaman terlindungi ini (bukan di index.html),
// dan baru dikirim ke browser setelah email pengunjung lolos verifikasi.
//
// Ketiga practiceXxxUrl mengarah ke kuis latihan EPT UI di Wayground
// (rebrand dari Quizizz), satu link per kemampuan yang diuji.
// ============================================================
const DEFAULT_MATERIALS = {
  zoomJoinUrl:
    'https://ui-ac-id.zoom.us/j/91548748401?pwd=WFhzja7b2aC5iamDQwMNaoHi7maipt.1',
  driveUrl:
    'https://drive.google.com/drive/folders/12HtL4Rchwy6JdPBs3hEa81lgwk5dxluU?usp=sharing',
  communityUrl: 'https://chat.whatsapp.com/DZsFkQv353M2u3Ue0HKbjJ',
  practiceReadingUrl: 'https://wayground.com/join?gc=09747545',
  practiceListeningUrl: 'https://wayground.com/join?gc=57785433',
  practiceWritingUrl: 'https://wayground.com/join?gc=10992729',
  announcement:
    'Semua materi ada di folder Drive ini. Rekaman Zoom ditambahkan langsung ke dalamnya setelah tiap sesi.',
};

// ============================================================
// CACHE + RETRY UNTUK SEMUA FETCH KE GOOGLE (Sheets & kunci publik JWT)
//
// Kenapa ini ada: tanpa cache, tiap SATU siswa login = fetch ulang total
// roster + jadwal + materi dari nol ke Google -- padahal isinya SAMA
// PERSIS buat semua orang selama beberapa puluh detik ke depan. Kalau
// puluhan/ratusan siswa login bersamaan (mis. persis pas kelas mau
// mulai -- momen paling mungkin ini kejadian beneran), itu jadi ratusan
// request duplikat yang sia-sia dan menaikkan risiko kena rate-limit
// dari sisi Google.
//
// Cache-nya nyimpen PROMISE-nya, bukan cuma hasil akhirnya -- supaya
// request yang datang HAMPIR BERSAMAAN (sebelum fetch pertama selesai)
// ikut "numpang" ke fetch yang sama, bukan masing-masing bikin fetch
// baru sendiri-sendiri. Ini cuma efektif kalau beberapa request
// mendarat di instance server Vercel yang sama (instance "hangat" bisa
// dipakai ulang); kalau tiap request dapat instance baru, cache ini
// gak kepakai -- tapi tetap gak rugi, cuma balik ke perilaku lama.
//
// Kegagalan TIDAK ikut di-cache (langsung dihapus lagi dari cache begitu
// gagal) supaya satu hiccup sesaat gak bikin semua orang gagal login
// selama sisa TTL.
// ============================================================
const CSV_CACHE_TTL_MS = 45 * 1000;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // kunci publik Google jarang rotasi
const fetchCache = new Map(); // key -> { promise, expiresAt }

function cachedFetch(key, ttlMs, fetcher) {
  const now = Date.now();
  const cached = fetchCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetcher().catch((err) => {
    fetchCache.delete(key);
    throw err;
  });
  fetchCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTextWithRetry(url, attempts = 2) {
  // Sengaja cuma diulang SEKALI (attempts=2 -> 1 percobaan awal + 1
  // percobaan ulang), bukan berkali-kali -- momen paling rawan gagal
  // (banyak siswa login bersamaan) juga momen paling penting buat dapat
  // jawaban cepat, jadi retry bertubi-tubi cuma bikin orang nunggu lebih
  // lama tanpa manfaat tambahan yang berarti.
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('status ' + res.status);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(300);
    }
  }
  throw lastErr;
}

function csvToRows(csvText) {
  // Parser CSV sederhana yang menangani nilai berkoma di dalam tanda
  // kutip (format standar yang dipakai Google Sheets saat publish).
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (char === '\r' && next === '\n') i++;
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Cocok untuk "nama@domain.tld" secara umum: tidak boleh ada spasi atau
// "@" ganda, dan domainnya harus punya titik. Cukup ketat untuk tidak
// salah menganggap nomor telepon atau nama sebagai email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cara mencabut akses satu siswa (atau satu baris pendaftaran Pair/
// Group, yang otomatis mencabut semua nama di baris itu): ketik kata
// ini persis di sel PALING KANAN baris tersebut di sheet mana pun
// (form atau manual). Tidak perlu ubah tanggal atau env var apa pun.
const REVOKED_MARKER = 'done';

// Kolom W di sheet: tanggal berakhirnya akses ruang kelas untuk pendaftar
// yang masuk lewat form di situs. Angkanya HARUS sama dengan
// KOLOM_BERLAKU_SAMPAI di api/_lib/form-schema.js -- sengaja ditulis ulang
// di sini, bukan di-import, supaya file ini tetap berdiri sendiri tanpa
// bergantung pada modul lain (kalau modul itu error, gerbang kelas ikut
// mati, dan itu risiko yang tidak sebanding untuk satu angka).
const KOLOM_BERLAKU_SAMPAI = 22;

/**
 * Apakah tanggal "YYYY-MM-DD" sudah lewat?
 *
 * Aksesnya berlaku SAMPAI AKHIR hari itu waktu WIB, bukan sampai jam 00.00.
 * "Berlaku sampai 31 Maret" yang mati pada 31 Maret dini hari akan terasa
 * seperti kecolongan sehari bagi orang yang membacanya.
 *
 * Balik false untuk apa pun yang tidak bisa dibaca, supaya sel yang salah
 * ketik tidak pernah mengunci orang keluar (gagal terbuka).
 */
function sudahKedaluwarsa(teks) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || '').trim());
  if (!cocok) return false;

  const [, thn, bln, tgl] = cocok.map(Number);
  if (bln < 1 || bln > 12 || tgl < 1 || tgl > 31) return false;

  // Akhir hari WIB = 16:59:59 UTC di hari yang sama (WIB = UTC+7).
  const batasMs = Date.UTC(thn, bln - 1, tgl, 16, 59, 59, 999);
  if (!Number.isFinite(batasMs)) return false;

  return Date.now() > batasMs;
}

function findColumnIndex(headerRow, keyword) {
  // Cocok dengan huruf saja (angka/spasi/tanda hubung dibuang) supaya
  // variasi kecil di nama kolom tetap ketemu -- lihat bug "E-mail" vs
  // "email" yang pernah kejadian di sini.
  const normalized = headerRow.map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  return normalized.findIndex((h) => h.includes(keyword));
}

function extractEmailsFromSheet(csvText, cutoffDate) {
  // Sengaja TIDAK bergantung pada baris header untuk KOLOM EMAIL (mis.
  // mencari kolom yang namanya mengandung "email"). Sheet respons
  // Google Form rapi dan punya header yang jelas, tapi sheet manual
  // yang diisi tangan bisa saja baris pertamanya kosong, ada label
  // seperti "MANUAL" di tengah, atau kolomnya bergeser -- semua itu
  // bikin pencarian lewat header gagal diam-diam dan seluruh sheet
  // dianggap kosong. Jadi tiap sel diuji langsung: kalau bentuknya
  // seperti alamat email, dianggap email, apa pun posisi kolomnya.
  //
  // Kolom TIMESTAMP beda cerita: itu nama yang dibuat otomatis oleh
  // Google Form sendiri (bukan ketikan manual), jadi bisa dipercaya
  // konsisten. Dipakai untuk memfilter batch lama kalau BATCH_CUTOFF_DATE
  // diisi. Sheet yang tidak punya kolom ini (mis. sheet manual) sama
  // sekali tidak kena filter tanggal.
  const rows = csvToRows(csvText);
  if (rows.length === 0) return [];

  const timestampCol = findColumnIndex(rows[0], 'timestamp');
  const emails = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    // Baris dicabut aksesnya kalau ADA SEL MANA PUN yang isinya persis
    // kata "done".
    //
    // Dulu yang diperiksa cuma sel PALING KANAN, dihitung dari baris
    // terlebar di seluruh sheet. Itu diam-diam rapuh: begitu ada kolom
    // baru terisi di sheet (mis. kolom W untuk tanggal berakhirnya akses
    // pendaftar web), posisi "paling kanan" bergeser, dan semua tanda
    // "done" lama berhenti berfungsi TANPA gejala apa pun -- orang yang
    // sudah dicabut aksesnya diam-diam bisa masuk lagi.
    //
    // Memindai seluruh sel menghilangkan ketergantungan pada lebar sheet
    // sama sekali. Risiko salah tangkap sangat kecil karena yang dicocokkan
    // adalah SELURUH isi sel yang persis "done", bukan sel yang mengandung
    // kata itu; jawaban wajar tidak pernah berbentuk begitu.
    const dicabut = row.some((cell) => (cell || '').trim().toLowerCase() === REVOKED_MARKER);
    if (dicabut) continue;

    // Tanggal berakhirnya akses, diisi otomatis waktu admin menyetujui
    // pendaftar dari /pendaftar (lihat KOLOM_BERLAKU_SAMPAI di
    // api/_lib/form-schema.js). Formatnya "YYYY-MM-DD".
    //
    // Baris lama dari Google Form dan sheet manual TIDAK punya isi di
    // kolom ini, jadi mereka tidak pernah kedaluwarsa dan tetap diatur
    // manual dengan kata "done" seperti selama ini.
    //
    // GAGAL TERBUKA: sel kosong, format tidak dikenali, atau tanggal yang
    // tidak masuk akal semuanya diperlakukan sebagai "tanpa batas waktu".
    // Mengunci orang yang sudah bayar gara-gara satu sel salah ketik jauh
    // lebih merugikan daripada akses yang telat dicabut beberapa hari.
    const berlakuSampai = (row[KOLOM_BERLAKU_SAMPAI] || '').trim();
    if (berlakuSampai && sudahKedaluwarsa(berlakuSampai)) continue;

    if (cutoffDate && timestampCol !== -1) {
      const raw = (row[timestampCol] || '').trim();
      const rowDate = raw ? new Date(raw) : null;
      const isValidDate = rowDate && !Number.isNaN(rowDate.getTime());
      // Baris dengan tanggal yang gagal dibaca sengaja DIANGGAP di luar
      // batch aktif (bukan malah diloloskan). Kalau ini salah mengunci
      // siswa batch baru, mereka tetap bisa menghubungi lewat WhatsApp
      // di halaman "belum terdaftar", dan sementara itu ditambahkan ke
      // sheet manual sambil dicek kenapa tanggalnya tidak terbaca.
      if (!isValidDate || rowDate < cutoffDate) continue;
    }

    row.forEach((cell) => {
      const value = cell.trim().toLowerCase();
      if (EMAIL_PATTERN.test(value)) emails.push(value);
    });
  }

  return emails;
}

async function fetchEnrolledEmails(csvUrls, cutoffDate) {
  const emails = new Set();
  const failures = [];

  // Semua sumber diambil paralel. Satu sumber yang gagal (sheet belum
  // di-publish ulang, jaringan bermasalah, dll.) tidak boleh
  // menggagalkan sumber lain -- makanya try/catch ada di dalam setiap
  // iterasi, bukan membungkus semuanya sekaligus.
  await Promise.all(
    csvUrls.map(async (url) => {
      try {
        const text = await cachedFetch('roster:' + url, CSV_CACHE_TTL_MS, () =>
          fetchTextWithRetry(url)
        );
        extractEmailsFromSheet(text, cutoffDate).forEach((email) => emails.add(email));
      } catch (err) {
        failures.push(url + ' -> ' + err.message);
      }
    })
  );

  if (failures.length > 0) {
    // Tidak menghentikan proses selama ada sumber lain yang berhasil,
    // tapi tetap dicatat supaya kelihatan di Vercel > Functions log
    // kalau salah satu sheet berhenti bisa diakses.
    console.error('Sebagian sumber roster gagal dimuat: ' + failures.join('; '));
  }
  if (emails.size === 0 && failures.length === csvUrls.length) {
    throw new Error('Semua sumber daftar siswa gagal diakses: ' + failures.join('; '));
  }

  return emails;
}

// Nama bulan Indonesia dipakai buat cocokin sel seperti "AGUSTUS" atau
// "SEPTEMBER" di sheet jadwal. Daftar manual, bukan lewat locale bawaan
// JS (mis. toLocaleDateString('id-ID')), karena arahnya kebalik -- di sini
// yang perlu diubah adalah TEKS jadi ANGKA bulan, dan environment server
// tidak dijamin punya data locale id-ID lengkap terpasang.
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
    const text = await cachedFetch('schedule:' + url, CSV_CACHE_TTL_MS, () =>
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
const MATERIALS_FIELDS = [
  { key: 'zoomJoinUrl', keywords: ['zoom'] },
  { key: 'driveUrl', keywords: ['drive'] },
  { key: 'communityUrl', keywords: ['whatsapp', 'grup'] },
  { key: 'practiceReadingUrl', keywords: ['reading'] },
  { key: 'practiceListeningUrl', keywords: ['listening'] },
  { key: 'practiceWritingUrl', keywords: ['writing'] },
  { key: 'announcement', keywords: ['pengumuman', 'announcement'] },
];

function extractMaterials(csvText) {
  // Sheet ini sengaja dibuat baru dari nol (bukan nebeng sheet lama yang
  // berantakan kayak roster), jadi posisi kolom dianggap tetap: kolom A
  // nama field, kolom B isinya. Yang FLEKSIBEL cuma teks nama fieldnya --
  // dicocokkan lewat keyword, bukan harus persis sama -- supaya salah
  // ketik kecil atau variasi kata (mis. "Link Zoom" vs "Zoom Meeting")
  // tetap kebaca.
  const rows = csvToRows(csvText);
  const found = {};
  const unlockDates = {};

  for (const row of rows) {
    const label = (row[0] || '').trim().toLowerCase();
    if (!label) continue;
    const value = (row[1] || '').trim();
    if (!value) continue;

    // Baris tanggal buka kuis ("Kuis Reading Buka", dst) dicek DULUAN,
    // sebelum daftar MATERIALS_FIELDS di bawah -- kalau tidak, label
    // itu bisa kepeleset ketimpa jadi practiceReadingUrl (keyword-nya
    // cuma 'reading', juga ketemu di label ini) dan isi kuisnya jadi
    // tanggal, bukan link.
    if (label.includes('buka') || label.includes('unlock')) {
      if (label.includes('reading')) unlockDates.reading = value;
      else if (label.includes('listening')) unlockDates.listening = value;
      else if (label.includes('writing')) unlockDates.writing = value;
      continue;
    }

    const field = MATERIALS_FIELDS.find((f) => f.keywords.some((kw) => label.includes(kw)));
    if (field) found[field.key] = value;
  }

  found.practiceUnlockDates = unlockDates;
  return found;
}

async function fetchMaterialsOverrides(url) {
  // Sama seperti roster & jadwal: gagal diakses atau tidak ada baris yang
  // kebaca TIDAK BOLEH menggagalkan login. Field yang tidak ketemu di
  // sini otomatis jatuh balik ke DEFAULT_MATERIALS di pemanggil.
  try {
    const text = await cachedFetch('materials:' + url, CSV_CACHE_TTL_MS, () =>
      fetchTextWithRetry(url)
    );
    const found = extractMaterials(text);

    // practiceUnlockDates dihitung terpisah dari MATERIALS_FIELDS (bukan
    // salah satu field di array itu), jadi dilaporkan sendiri di bawah
    // supaya angka "ketemu X dari Y field" di sini tetap akurat.
    const regularFieldsFound = Object.keys(found).filter((k) => k !== 'practiceUnlockDates');
    console.log(
      'extractMaterials: ketemu ' + regularFieldsFound.length + ' dari ' +
        MATERIALS_FIELDS.length + ' field di MATERIALS_CSV_URL (' +
        regularFieldsFound.join(', ') + '). Field yang tidak ketemu pakai ' +
        'nilai DEFAULT_MATERIALS.'
    );

    // Baris ini yang paling gampang dipakai buat mastiin lewat Vercel >
    // Functions log apakah baris "Kuis Reading Buka" dkk kebaca benar,
    // tanpa perlu buka sheet-nya langsung (URL-nya cuma ada sebagai env
    // var, tidak pernah tersimpan di kode).
    const unlockDates = found.practiceUnlockDates || {};
    const unlockSummary = ['reading', 'listening', 'writing']
      .map((skill) => skill + '=' + (unlockDates[skill] ? '"' + unlockDates[skill] + '"' : 'kosong'))
      .join(', ');
    console.log('extractMaterials: tanggal buka kuis dari MATERIALS_CSV_URL -- ' + unlockSummary);

    return found;
  } catch (err) {
    console.error('Gagal memuat sheet materi dari MATERIALS_CSV_URL: ' + err.message);
    return {};
  }
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(withPadding, 'base64');
}

async function getGoogleJwks() {
  // Dicache lewat cachedFetch yang sama dipakai buat sheet -- kunci
  // publik Google jarang rotasi (dalam hitungan hari/minggu), jadi TTL
  // 1 jam (JWKS_CACHE_TTL_MS) jauh lebih dari cukup dan sangat
  // memangkas jumlah request ke endpoint ini.
  const text = await cachedFetch('google-jwks', JWKS_CACHE_TTL_MS, async () => {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) throw new Error('status ' + res.status);
    return res.text();
  });
  const data = JSON.parse(text);
  return Array.isArray(data.keys) ? data.keys : [];
}

// Verifikasi ID token TANPA nge-hit server Google tiap kali ada yang
// login (beda dari cara lama, verifyGoogleTokenRemote di bawah, yang
// manggil endpoint tokeninfo Google setiap request) -- signature JWT-nya
// dicek langsung pakai kunci publik Google yang di-cache (getGoogleJwks),
// pakai modul crypto bawaan Node. Ini persis cara kerja library resmi
// Google (google-auth-library) di balik layar, ditulis ulang manual di
// sini supaya proyek ini tetap zero-dependency.
//
// PENTING: fungsi ini SENGAJA bisa throw kalau ada yang gagal secara
// TEKNIS (JWKS gak bisa diambil, format token gak terduga, dll) --
// BUKAN kalau tokennya memang tidak valid (itu balik
// { valid:false, reason: ... } seperti biasa, tanpa throw). Pemanggil
// (verifyGoogleToken) menangkap exception ini dan fallback ke
// verifyGoogleTokenRemote kalau ini gagal, supaya bug atau gangguan di
// sini tidak langsung mengunci semua siswa keluar dari kelasnya.
async function verifyGoogleTokenLocal(idToken, expectedClientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'token_invalid' };
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

  if (header.alg !== 'RS256' || !header.kid) {
    return { valid: false, reason: 'token_invalid' };
  }

  let keys = await getGoogleJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Kunci belum ketemu di cache -- kemungkinan Google baru rotasi
    // kunci sejak terakhir kita ambil. Coba ambil ULANG sekali (lewati
    // cache lama), BUKAN langsung anggap tokennya invalid, karena ini
    // kejadian normal, bukan tanda ada yang salah.
    fetchCache.delete('google-jwks');
    keys = await getGoogleJwks();
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return { valid: false, reason: 'token_invalid' };

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signedData = Buffer.from(headerB64 + '.' + payloadB64);
  const signature = base64UrlDecode(sigB64);
  const signatureValid = crypto.verify('RSA-SHA256', signedData, publicKey, signature);
  if (!signatureValid) return { valid: false, reason: 'token_invalid' };

  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    return { valid: false, reason: 'token_invalid' };
  }
  if (payload.aud !== expectedClientId) {
    return { valid: false, reason: 'wrong_audience' };
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    return { valid: false, reason: 'email_unverified' };
  }
  const expiresAt = Number(payload.exp) * 1000;
  if (!expiresAt || Date.now() > expiresAt) {
    return { valid: false, reason: 'token_expired' };
  }

  return { valid: true, email: String(payload.email || '').toLowerCase() };
}

// Jalur CADANGAN -- ini cara verifikasi yang dipakai SEBELUM ada
// verifyGoogleTokenLocal di atas. Sekarang cuma dipakai kalau
// verifikasi lokal gagal karena alasan TEKNIS, bukan dipakai tiap
// request seperti sebelumnya -- itu justru yang berisiko kena
// rate-limit dari Google kalau banyak siswa login bersamaan.
async function verifyGoogleTokenRemote(idToken, expectedClientId) {
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' +
      encodeURIComponent(idToken)
  );
  if (!res.ok) return { valid: false, reason: 'token_invalid' };

  const payload = await res.json();

  if (payload.aud !== expectedClientId) {
    return { valid: false, reason: 'wrong_audience' };
  }
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    return { valid: false, reason: 'email_unverified' };
  }
  const expiresAt = Number(payload.exp) * 1000;
  if (!expiresAt || Date.now() > expiresAt) {
    return { valid: false, reason: 'token_expired' };
  }

  return { valid: true, email: String(payload.email || '').toLowerCase() };
}

async function verifyGoogleToken(idToken, expectedClientId) {
  try {
    return await verifyGoogleTokenLocal(idToken, expectedClientId);
  } catch (err) {
    // Ini jalur yang HARUSNYA jarang kepakai. Kalau ini sering muncul di
    // Vercel Functions log, ada yang perlu dicek di verifyGoogleTokenLocal
    // atau ketersediaan endpoint kunci publik Google.
    console.error(
      'Verifikasi token lokal gagal (' + err.message + '), fallback ke endpoint ' +
        'tokeninfo Google.'
    );
    try {
      return await verifyGoogleTokenRemote(idToken, expectedClientId);
    } catch (err2) {
      console.error('Verifikasi token via fallback juga gagal: ' + err2.message);
      return { valid: false, reason: 'token_invalid' };
    }
  }
}

// CommonJS (module.exports), bukan `export default`: proyek ini tidak
// punya package.json, jadi Vercel menjalankan file .js sebagai CommonJS
// secara default. Sintaks ES Module di sini akan gagal saat runtime.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const rosterUrls = (process.env.ROSTER_CSV_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const scheduleUrl = (process.env.SCHEDULE_CSV_URL || '').trim();
  const materialsUrl = (process.env.MATERIALS_CSV_URL || '').trim();

  // Opsional. String kosong/tidak diisi -> tidak ada filter tanggal,
  // sama seperti perilaku sebelum ada konsep batch. String yang gagal
  // di-parse juga diperlakukan sama (dianggap tidak diisi) supaya salah
  // format tidak diam-diam mengunci semua orang keluar.
  const rawCutoff = (process.env.BATCH_CUTOFF_DATE || '').trim();
  const cutoffDate = rawCutoff ? new Date(rawCutoff) : null;
  const validCutoff = cutoffDate && !Number.isNaN(cutoffDate.getTime()) ? cutoffDate : null;
  if (rawCutoff && !validCutoff) {
    console.error(
      'BATCH_CUTOFF_DATE tidak bisa dibaca sebagai tanggal: "' + rawCutoff + '". ' +
        'Filter batch dinonaktifkan sampai ini diperbaiki (pakai format "2026-09-01").'
    );
  }

  if (!clientId || rosterUrls.length === 0) {
    // Belum di-setup di Vercel. Pesan ini sengaja jelas supaya gampang
    // didiagnosis lewat Vercel dashboard > Deployments > Functions log.
    console.error(
      'ENV VAR BELUM DIISI: GOOGLE_CLIENT_ID dan/atau ROSTER_CSV_URLS ' +
        'kosong di Vercel Project Settings > Environment Variables.'
    );
    return res.status(500).json({ ok: false, reason: 'server_not_configured' });
  }

  const idToken = req.body && req.body.credential;
  if (!idToken) {
    return res.status(400).json({ ok: false, reason: 'missing_credential' });
  }

  try {
    const verified = await verifyGoogleToken(idToken, clientId);
    if (!verified.valid) {
      return res.status(401).json({ ok: false, reason: verified.reason });
    }

    // Diambil paralel: latensi jaringan biasanya lebih mahal daripada
    // request yang kadang "sia-sia" (mis. jadwal ikut diambil walau
    // ternyata emailnya tidak terdaftar). Sheet jadwal juga cuma link
    // publish-to-web publik, tidak ada beban auth tambahan seperti roster.
    if (!scheduleUrl) {
      console.log('SCHEDULE_CSV_URL kosong/belum diisi -- kartu jadwal & timer akan kosong.');
    }
    if (!materialsUrl) {
      console.log(
        'MATERIALS_CSV_URL kosong/belum diisi -- semua materi pakai ' +
          'DEFAULT_MATERIALS di kode, sheet materi belum aktif.'
      );
    }
    const [enrolledEmails, scheduleResult, materialsOverrides] = await Promise.all([
      fetchEnrolledEmails(rosterUrls, validCutoff),
      scheduleUrl ? fetchSchedule(scheduleUrl) : Promise.resolve({ sessions: [] }),
      materialsUrl ? fetchMaterialsOverrides(materialsUrl) : Promise.resolve({}),
    ]);
    if (!enrolledEmails.has(verified.email)) {
      return res.status(403).json({ ok: false, reason: 'not_enrolled' });
    }

    // Cuma sesi yang BELUM lewat yang dikirim ke browser -- kartu jadwal
    // menunjukkan "kapan aja bakal ada kelas", bukan riwayat kelas yang
    // sudah selesai. Sesi pertama di daftar (kalau ada) otomatis jadi
    // sesi berikutnya untuk timer di kartu Zoom.
    const upcomingSessions = scheduleResult.sessions.filter(
      (s) => new Date(s.isoDatetime).getTime() > Date.now()
    );
    if (scheduleUrl && upcomingSessions.length === 0) {
      // Beda dari 0 baris ditemukan sama sekali (dicatat di extractSchedule)
      // -- ini kasus "parsing berhasil tapi semua sesinya sudah lewat
      // tanggalnya", yang juga bikin kartu jadwal kosong tapi sebabnya beda.
      console.log(
        'SCHEDULE_CSV_URL terbaca (' + scheduleResult.sessions.length +
          ' baris sesi total) tapi tidak ada satu pun yang belum lewat -- ' +
          'kartu jadwal & timer akan kosong sampai sheet-nya diisi tanggal baru.'
      );
    }
    const materials = {
      ...DEFAULT_MATERIALS,
      ...materialsOverrides,
      schedule: upcomingSessions,
      nextSessionAt: upcomingSessions.length > 0 ? upcomingSessions[0].isoDatetime : null,
      // Terpisah dari jadwal kelas -- lihat computePracticeUnlocksFromDates().
      practiceUnlocked: computePracticeUnlocksFromDates(materialsOverrides.practiceUnlockDates),
      // Dihitung dari SEMUA sesi (scheduleResult.sessions), bukan
      // upcomingSessions -- lihat computeZoomUnlock().
      zoomUnlocked: computeZoomUnlock(scheduleResult.sessions),
    };

    return res.status(200).json({ ok: true, materials });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}
