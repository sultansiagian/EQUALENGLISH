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
 *   GOOGLE_CLIENT_ID   Client ID dari Google Cloud Console
 *   ROSTER_CSV_URL     Link "Publish to web" (format CSV) dari sheet
 *                      respons Google Form pendaftaran
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

async function fetchEnrolledEmails(csvUrl) {
  const res = await fetch(csvUrl);
  if (!res.ok) {
    throw new Error('Gagal mengambil daftar siswa, status ' + res.status);
  }
  const text = await res.text();
  const rows = csvToRows(text);
  if (rows.length === 0) return new Set();

  // Satu baris respons form bisa mewakili lebih dari satu siswa (paket
  // Pair/Group didaftarkan oleh satu orang, tapi mencakup 2-3 siswa).
  // Karena itu SEMUA kolom yang namanya mengandung "email" dikumpulkan
  // -- misalnya "Email Peserta 1", "Email Peserta 2", "Email Peserta 3"
  // -- bukan cuma kolom pertama yang ketemu.
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const emailCols = [];
  header.forEach((h, i) => {
    if (h.includes('email')) emailCols.push(i);
  });
  if (emailCols.length === 0) {
    throw new Error(
      'Tidak ada kolom email di sheet respons. Pastikan pertanyaan email ' +
        'ada di form, atau "Collect email addresses" aktif di pengaturan.'
    );
  }

  const emails = new Set();
  for (let i = 1; i < rows.length; i++) {
    emailCols.forEach((col) => {
      const value = (rows[i][col] || '').trim().toLowerCase();
      if (value) emails.add(value);
    });
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
  const rosterUrl = process.env.ROSTER_CSV_URL;

  if (!clientId || !rosterUrl) {
    // Belum di-setup di Vercel. Pesan ini sengaja jelas supaya gampang
    // didiagnosis lewat Vercel dashboard > Deployments > Functions log.
    console.error(
      'ENV VAR BELUM DIISI: GOOGLE_CLIENT_ID dan/atau ROSTER_CSV_URL ' +
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

    const enrolledEmails = await fetchEnrolledEmails(rosterUrl);
    if (!enrolledEmails.has(verified.email)) {
      return res.status(403).json({ ok: false, reason: 'not_enrolled' });
    }

    return res.status(200).json({ ok: true, materials: CLASS_MATERIALS });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}
