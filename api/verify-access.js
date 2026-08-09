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
 */

// ============================================================
// ISI MATERI KELAS DI SINI. Aman ditaruh di sini (bukan di kode
// yang dikirim ke browser) karena file ini hanya berjalan di server.
// Update, commit, push seperti biasa setiap ada perubahan.
//
// Rekaman Zoom dan link Quizizz tidak punya field terpisah karena
// semuanya digabung jadi satu di dalam folder Drive ini (ditaruh di
// sana langsung oleh mentor, bukan ditautkan dari sini).
//
// zoomJoinUrl adalah link meeting yang dipakai ULANG tiap sesi, bukan
// rekaman. Sengaja hanya muncul di halaman terlindungi ini (bukan di
// index.html) supaya tidak ada orang luar yang menyelonong masuk saat
// sesi live berlangsung.
// ============================================================
const CLASS_MATERIALS = {
  zoomJoinUrl:
    'https://ui-ac-id.zoom.us/j/91548748401?pwd=WFhzja7b2aC5iamDQwMNaoHi7maipt.1',
  driveUrl:
    'https://drive.google.com/drive/folders/12HtL4Rchwy6JdPBs3hEa81lgwk5dxluU?usp=sharing',
  announcement:
    'Semua materi ada di folder Drive ini. Rekaman Zoom dan link Quizizz akan ditambahkan langsung ke dalamnya setelah tiap sesi.',
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

function extractEmailsFromSheet(csvText) {
  // Sengaja TIDAK bergantung pada baris header (mis. mencari kolom yang
  // namanya mengandung "email"). Sheet respons Google Form rapi dan
  // punya header yang jelas, tapi sheet manual yang diisi tangan bisa
  // saja baris pertamanya kosong, ada label seperti "MANUAL" di tengah,
  // atau kolomnya bergeser -- semua itu bikin pencarian lewat header
  // gagal diam-diam dan seluruh sheet dianggap kosong.
  //
  // Jadi setiap sel di seluruh baris (termasuk baris pertama, yang
  // aman karena teks header seperti "Nama" atau "Person 1 E-mail"
  // tidak akan pernah cocok dengan pola alamat email sungguhan) diuji:
  // kalau bentuknya seperti alamat email, dianggap email. Ini bekerja
  // untuk sheet rapi maupun berantakan, apa pun urutan kolomnya.
  const rows = csvToRows(csvText);
  const emails = [];
  rows.forEach((row) => {
    row.forEach((cell) => {
      const value = cell.trim().toLowerCase();
      if (EMAIL_PATTERN.test(value)) emails.push(value);
    });
  });
  return emails;
}

async function fetchEnrolledEmails(csvUrls) {
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
        extractEmailsFromSheet(text).forEach((email) => emails.add(email));
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

    const enrolledEmails = await fetchEnrolledEmails(rosterUrls);
    if (!enrolledEmails.has(verified.email)) {
      return res.status(403).json({ ok: false, reason: 'not_enrolled' });
    }

    return res.status(200).json({ ok: true, materials: CLASS_MATERIALS });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}
