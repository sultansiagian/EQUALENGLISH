// Modul bawaan Node, bukan dependency tambahan (proyek ini sengaja
// zero-dependency) -- dipakai buat verifikasi signature JWT secara
// lokal, lihat _lib/google-verify.js.

// Parser CSV dipisah ke _lib/csv.js karena halaman analitik membaca
// sheet yang sama persis. Perilakunya sudah dibuktikan identik dengan
// versi yang dulu ada di file ini.
const { csvToRows } = require('./_lib/csv');
// Dipakai untuk isi ruang kelas dan syarat Final Test (siapa yang sudah mengisi
// testimoni). Global Config dioptimalkan untuk dibaca tiap request --
// api/render-home.js melakukannya untuk tiap pengunjung beranda.
const { readOverrides } = require('./_lib/global-config-store');
// Pembaca waktu WIB yang sama dengan yang dipakai jadwal buka/tutup
// formulir, supaya "2026-09-09T19:00" berarti hal yang sama di keduanya.
const { waktuWibKeEpoch } = require('./_lib/form-status');
// Dipakai HANYA oleh mode status (halaman /status), lihat tanganiStatus().
const { cariStatus } = require('./_lib/status-pendaftar');
const { bolehKirimForm } = require('./_lib/rem-laju');
const DEFAULTS = require('./_lib/site-defaults');

// ============================================================
// BAGIAN YANG DULU ADA DI BERKAS INI
// ============================================================
// Berkas ini sempat 1.452 baris berisi verifikasi token, parser CSV,
// pembacaan roster, jadwal, progres, kunci Zoom, dan materi sekaligus.
// Semua yang menyentuh ruang kelas lewat sini, jadi setiap perubahan
// kecil ikut membawa risiko ke semua yang lain, dan tidak ada satu pun
// bagiannya yang bisa diuji terpisah.
//
// Dipecah 2026-08-25, DIPINDAH APA ADANYA -- tidak ada satu baris pun
// yang diketik ulang. Tesnya (test/verify-access.test.js) ditulis lebih
// dulu dan sudah lulus melawan versi utuh, jadi kalau nanti ada yang
// gagal, yang berubah pasti perilakunya.
// Verifikasi token Google. SATU implementasi untuk seluruh proyek, ada
// di _lib/google-verify.js.
//
// Sebelum 2026-08-25 ada DUA salinan: satu di sini, satu di sana, dan
// komentar di berkas itu mengakuinya sendiri ("disalin, bukan diimpor").
// Utang itu berbunyi justru pada kode yang memutuskan siapa boleh masuk:
// tambalan yang cuma terpasang di satu sisi meninggalkan gerbang satunya
// terbuka, tanpa gejala apa pun.
//
// Waktu digabung, keduanya ternyata TIDAK identik. Yang di sini juga
// mengembalikan `nama` dari token, dipakai /kelas untuk menyapa siswa dan
// oleh kelas-testimoni.js sebagai nama cadangan. Jadi yang digabung ke
// arah sebaliknya: google-verify.js yang dilengkapi, bukan `nama` yang
// dibuang.
const { verifyGoogleIdToken } = require('./_lib/google-verify');

// Nama lamanya dipertahankan karena api/kelas-testimoni.js mengimpornya
// lewat nama ini, dan bentuk balasannya sama persis.
const verifyGoogleToken = verifyGoogleIdToken;
const { normalisasiEmail, fetchEnrolledEmails } = require('./_lib/roster');
const {
  hitungProgres,
  jadwalDariConfig,
  computeZoomUnlock,
  fetchSchedule,
  computePracticeUnlocksFromDates,
} = require('./_lib/jadwal');
const { DEFAULT_MATERIALS, materiDariConfig, fetchMaterialsOverrides } = require('./_lib/materi');

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
function hitungFinalTest(overrides, email) {
  const o = overrides || {};
  const url = String(o.kelasFinalTestUrl || '').trim();
  const bukaMs = waktuWibKeEpoch(o.kelasFinalTestBukaPada);

  const daftar = Array.isArray(o.testimoniSudahIsi) ? o.testimoniSudahIsi : [];
  const sudahTestimoni = daftar.indexOf(normalisasiEmail(email)) !== -1;

  const adaJadwal = bukaMs !== null;
  const sudahWaktunya = adaJadwal && Date.now() >= bukaMs;

  return {
    boleh: Boolean(url) && sudahWaktunya && sudahTestimoni,
    adaLink: Boolean(url),
    adaJadwal,
    sudahWaktunya,
    sudahTestimoni,
    bukaPada: adaJadwal ? new Date(bukaMs).toISOString() : null,
  };
}



// CommonJS (module.exports), bukan `export default`: proyek ini tidak
// punya package.json, jadi Vercel menjalankan file .js sebagai CommonJS
// secara default. Sintaks ES Module di sini akan gagal saat runtime.
/**
 * Penangan mode status. Dipisah dari handler utama supaya alur login
 * ruang kelas yang sudah jalan tidak ikut bertambah cabang.
 */
async function tanganiStatus(req, res, idToken, clientId, rosterUrls, validCutoff) {
  // Rem laju dipasang di sini, bukan cuma di /api/daftar. Setiap
  // panggilan yang lolos bisa memicu pembacaan SELURUH antrean lewat
  // Apps Script, jadi tanpa rem, halaman ini jadi cara paling murah
  // untuk menguras kuota Apps Script milik pemilik sheet.
  const laju = bolehKirimForm(req);
  if (!laju.boleh) {
    res.setHeader('Retry-After', String(laju.tungguDetik));
    return res.status(429).json({
      ok: false,
      reason: 'terlalu_sering',
      pesan: 'Terlalu banyak pengecekan dari jaringan ini. Tunggu beberapa menit, lalu coba lagi.',
    });
  }

  try {
    const verified = await verifyGoogleToken(idToken, clientId);
    if (!verified.valid) {
      return res.status(401).json({ ok: false, reason: verified.reason });
    }

    const [overrides, enrolledEmails] = await Promise.all([
      readOverrides().catch(() => ({})),
      // Kegagalan roster tidak boleh membuat halaman ini menjawab "tidak
      // ditemukan". Dianggap "belum ada di roster" saja, lalu antrean
      // yang menentukan -- salah paling parah dari sini cuma peserta yang
      // sudah disetujui terbaca sebagai masih menunggu, dan itu jauh
      // lebih baik daripada memberi tahu orang yang sudah membayar bahwa
      // pendaftarannya tidak ada.
      fetchEnrolledEmails(rosterUrls, validCutoff).catch((err) => {
        console.error('status: roster gagal dibaca: ' + err.message);
        return new Set();
      }),
    ]);

    const adaDiRoster = enrolledEmails.has(normalisasiEmail(verified.email));
    const hasil = await cariStatus(verified.email, adaDiRoster, overrides);

    return res.status(200).json({
      ok: true,
      email: verified.email,
      status: hasil.status,
      paket: hasil.paket || null,
      // Dipakai halaman buat menampilkan tombol "Buka Ruang Kelas" hanya
      // waktu aksesnya memang sudah terbuka.
      linkRuangKelas:
        hasil.status === 'disetujui'
          ? String(overrides.linkRuangKelas || DEFAULTS.linkRuangKelas || '').trim()
          : '',
    });
  } catch (err) {
    if (err && err.kode === 'antrean_tidak_terbaca') {
      return res.status(502).json({ ok: false, reason: 'antrean_tidak_terbaca' });
    }
    console.error('status error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}

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

  // ============================================================
  // MODE STATUS (halaman /status)
  // ============================================================
  //
  // Menumpang endpoint ini, BUKAN berdiri sebagai api/status.js sendiri.
  // Dua alasannya:
  //
  //   1. Vercel Hobby membatasi 12 Serverless Function per deployment,
  //      dan melampauinya membuat SELURUH build gagal tanpa gejala di
  //      situs (lihat catatan admin-data.js di README). Sekarang ada 11.
  //      Slot terakhir lebih baik disimpan untuk kebutuhan yang benar-
  //      benar tidak bisa menumpang.
  //   2. Yang dibutuhkan mode ini persis yang sudah ada di file ini:
  //      verifikasi token Google dan pembacaan roster. Menaruhnya di
  //      berkas lain berarti menyalin ulang keduanya, dan proyek ini
  //      sudah punya satu salinan verifikasi token yang harus dijaga
  //      (lihat _lib/google-verify.js).
  //
  // Dicabang SEBELUM pengambilan jadwal dan materi di bawah: halaman
  // status tidak butuh keduanya, dan orang yang membukanya justru
  // kemungkinan besar BELUM ada di roster.
  if (req.body && req.body.mode === 'status') {
    return tanganiStatus(req, res, idToken, clientId, rosterUrls, validCutoff);
  }

  try {
    // Pengambilan data DIMULAI bersamaan dengan verifikasi token, bukan
    // sesudahnya. Keduanya tidak saling bergantung: roster, jadwal, dan
    // materi sama saja isinya siapa pun yang login. Kalau diurutkan,
    // setiap login menunggu dua babak jaringan berturut-turut, dan babak
    // pertama itu paling mahal justru waktu instance-nya baru bangun --
    // saat kunci publik Google belum ada di memori dan harus diambil.
    //
    // Yang ikut terambil untuk token yang ternyata tidak sah cuma tiga
    // link publish-to-web publik yang hasilnya di-cache; tidak ada data
    // rahasia yang tersentuh sebelum tokennya lulus.
    // SEMUANYA dimulai bersamaan: verifikasi token, Global Config, roster,
    // jadwal, dan materi. Sheet jadwal/materi tetap diambil walau isinya
    // mungkin nanti kalah oleh isi /atur-kelas.
    //
    // Sengaja begitu. Kalau pengambilan sheet ditunda sampai Global Config
    // terbaca (untuk tahu sheet mana yang masih perlu), login berubah jadi
    // DUA babak berurutan dan justru lebih lambat -- terukur 602ms lawan
    // 334ms untuk beban yang sama. Yang dirasakan siswa adalah babak
    // terpanjang, bukan jumlah permintaannya.
    //
    // Kalau nanti seluruh isi kelas sudah diatur dari /atur-kelas, cara
    // menghentikan pengambilan sheet ini bukan dengan menunda, melainkan
    // mengosongkan SCHEDULE_CSV_URL dan MATERIALS_CSV_URL di Vercel.
    const overridesPromise = readOverrides().catch(() => ({}));
    const rosterPromise = fetchEnrolledEmails(rosterUrls, validCutoff);
    const jadwalSheetPromise = scheduleUrl
      ? fetchSchedule(scheduleUrl)
      : Promise.resolve({ sessions: [] });
    const materiSheetPromise = materialsUrl
      ? fetchMaterialsOverrides(materialsUrl)
      : Promise.resolve({});
    jadwalSheetPromise.catch(() => {});
    materiSheetPromise.catch(() => {});
    // Penangan penolakan dipasang SEKARANG, bukan nanti waktu di-await.
    // Kalau tokennya tidak sah kita keluar lebih dulu dan promise ini
    // tidak pernah di-await; tanpa penangan, penolakannya jadi
    // unhandled rejection yang bisa mematikan seluruh proses.
    rosterPromise.catch(() => {});

    const verified = await verifyGoogleToken(idToken, clientId);
    if (!verified.valid) {
      return res.status(401).json({ ok: false, reason: verified.reason });
    }

    const overrides = await overridesPromise;

    // ============================================================
    // ISI KELAS: /atur-kelas MENANG, SHEET CUMA UNTUK YANG KOSONG
    // ============================================================
    // Sheet jadwal dan sheet materi CUMA diambil untuk bagian yang
    // belum diisi admin. Begitu keduanya lengkap di /atur-kelas, dua
    // pengambilan ke Google itu dilewati sama sekali, dan login jadi
    // lebih cepat daripada sebelum halaman itu ada.
    //
    // Selama masih ada yang kosong, keduanya tetap diambil seperti dulu,
    // supaya pemasangan lama tidak mendadak kehilangan isinya.
    const jadwalConfig = jadwalDariConfig(overrides);
    const materiConfig = materiDariConfig(overrides);

    if (jadwalConfig === null && !scheduleUrl) {
      console.log('Jadwal belum diisi di /atur-kelas dan SCHEDULE_CSV_URL kosong -- kartu jadwal & timer akan kosong.');
    }
    if (!materialsUrl) {
      console.log(
        'MATERIALS_CSV_URL kosong/belum diisi -- semua materi pakai ' +
          'DEFAULT_MATERIALS di kode, sheet materi belum aktif.'
      );
    }
    const [enrolledEmails, jadwalSheet, materiSheet] = await Promise.all([
      rosterPromise,
      // Kegagalan sheet tidak boleh menggagalkan login: tanpa jadwal,
      // kartu jadwalnya kosong tapi materinya tetap terbuka.
      jadwalSheetPromise.catch(() => ({ sessions: [] })),
      materiSheetPromise.catch(() => ({})),
    ]);

    const scheduleResult = jadwalConfig !== null ? { sessions: jadwalConfig } : jadwalSheet;
    // Isi dari admin ditumpuk DI ATAS isi sheet, jadi field yang diisi
    // di /atur-kelas menang dan sisanya tetap datang dari sheet.
    const materialsOverrides = Object.assign({}, materiSheet, materiConfig.nilai);
    // Dicocokkan dalam bentuk yang sudah disamakan di KEDUA sisi. Email
    // aslinya tetap dipakai buat ditampilkan ke siswa dan dicatat di log,
    // supaya yang dia lihat sama dengan yang dia ketik.
    if (!enrolledEmails.has(normalisasiEmail(verified.email))) {
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
    // Global Config sekarang SELALU dibaca (lihat blok ISI KELAS di atas),
    // karena isinya yang menentukan sheet mana yang masih perlu diambil.
    //
    // Itu bukan kemunduran dari sisi kecepatan: satu pembacaan Global
    // Config, yang memang dirancang untuk dibaca tiap request,
    // menggantikan sampai DUA pengambilan sheet ke Google. Selama
    // /atur-kelas belum diisi, keduanya memang masih dibayar; begitu
    // diisi, login jadi lebih ringan daripada sebelum halaman itu ada.
    const progresBatch = hitungProgres(scheduleResult.sessions);
    const statusFinal = hitungFinalTest(overrides, verified.email);

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
      // Sama alasannya: progres perlu tahu total sesi seluruhnya.
      // Dipakai ulang dari perhitungan di atas, bukan dihitung lagi.
      progres: progresBatch,
      finalTest: statusFinal,
      // Link ujiannya CUMA dikirim kalau kedua syaratnya terpenuhi.
      // Menyembunyikan tombolnya saja tidak menjaga apa pun: isi balasan
      // server bisa dibaca siapa saja yang mau melihatnya.
      finalTestUrl: statusFinal.boleh ? String(overrides.kelasFinalTestUrl || '').trim() : '',
    };

    return res.status(200).json({ ok: true, materials });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}

// Diekspor supaya api/kelas-testimoni.js tidak perlu menyalin ulang
// verifikasi token Google dan pengecekan roster. Pola yang sama dipakai
// api/render-home.js. Vercel tetap memanggil module.exports sebagai
// fungsi handler; properti tambahan di atasnya tidak mengganggu.
module.exports.verifyGoogleToken = verifyGoogleToken;
module.exports.fetchEnrolledEmails = fetchEnrolledEmails;
module.exports.normalisasiEmail = normalisasiEmail;
module.exports.hitungFinalTest = hitungFinalTest;
module.exports.hitungProgres = hitungProgres;
module.exports.materiDariConfig = materiDariConfig;
module.exports.jadwalDariConfig = jadwalDariConfig;
