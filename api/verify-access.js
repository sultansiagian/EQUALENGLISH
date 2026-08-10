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
 *   2. Fungsi ini memverifikasi token itu ke server Google (memastikan
 *      token asli, belum kedaluwarsa, dan dibuat untuk app ini).
 *   3. Fungsi ini mengambil daftar siswa dari Google Sheet yang sudah
 *      di-publish sebagai CSV, lalu mencocokkan email yang sudah
 *      terverifikasi tadi.
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
// ISI MATERI KELAS DI SINI. Aman ditaruh di sini (bukan di kode
// yang dikirim ke browser) karena file ini hanya berjalan di server.
// Update, commit, push seperti biasa setiap ada perubahan.
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
const CLASS_MATERIALS = {
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
  // Dihitung dari baris TERPANJANG di seluruh sheet, bukan panjang baris
  // saat itu -- supaya "kolom paling kanan" konsisten sama untuk semua
  // baris, walau ada baris yang pendek/tidak lengkap (lihat sheet manual,
  // yang barisnya suka tidak rata).
  const rightmostCol = Math.max(...rows.map((r) => r.length)) - 1;
  const emails = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const marker = (row[rightmostCol] || '').trim().toLowerCase();
    if (marker === REVOKED_MARKER) continue;

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
        const res = await fetch(url);
        if (!res.ok) throw new Error('status ' + res.status);
        const text = await res.text();
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

async function fetchSchedule(url) {
  // Sama seperti sumber roster: kalau sheet ini gagal diakses atau
  // bentuknya berubah sampai tidak ketemu tabel "TANGGAL FIX", jangan
  // sampai menggagalkan login -- materi lain (Zoom/Drive/WhatsApp/dll)
  // tetap harus bisa diakses. Kartu jadwal & timer di client cukup jadi
  // kosong/tersembunyi kalau ini gagal.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('status ' + res.status);
    const text = await res.text();
    return extractSchedule(text);
  } catch (err) {
    console.error('Gagal memuat jadwal kelas dari SCHEDULE_CSV_URL: ' + err.message);
    return { sessions: [] };
  }
}

async function verifyGoogleToken(idToken, expectedClientId) {
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
    const [enrolledEmails, scheduleResult] = await Promise.all([
      fetchEnrolledEmails(rosterUrls, validCutoff),
      scheduleUrl ? fetchSchedule(scheduleUrl) : Promise.resolve({ sessions: [] }),
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
      ...CLASS_MATERIALS,
      schedule: upcomingSessions,
      nextSessionAt: upcomingSessions.length > 0 ? upcomingSessions[0].isoDatetime : null,
    };

    return res.status(200).json({ ok: true, materials });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}
