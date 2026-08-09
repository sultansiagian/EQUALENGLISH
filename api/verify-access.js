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
// Rekaman Zoom dan link Quizizz tidak punya field terpisah karena
// semuanya digabung jadi satu di dalam folder Drive ini (ditaruh di
// sana langsung oleh mentor, bukan ditautkan dari sini).
//
// zoomJoinUrl dan communityUrl adalah link yang dipakai ULANG terus-
// menerus (bukan sekali pakai), sama-sama grup/meeting yang bisa
// disusupi kalau linknya bocor ke publik. Makanya dua-duanya sengaja
// cuma muncul di halaman terlindungi ini (bukan di index.html), dan
// baru dikirim ke browser setelah email pengunjung lolos verifikasi.
//
// Quizizz belum ada link-nya (kelasnya masih disiapkan), jadi kartunya
// di kelas.html sengaja dibiarkan nonaktif ("Segera hadir") dulu. Nanti
// kalau linknya sudah ada, tambahkan field quizizzUrl di sini lalu ganti
// markup kartunya di kelas.html dari <button disabled> jadi <a href>
// mengikuti pola kartu lain di bawah ini.
// ============================================================
const CLASS_MATERIALS = {
  zoomJoinUrl:
    'https://ui-ac-id.zoom.us/j/91548748401?pwd=WFhzja7b2aC5iamDQwMNaoHi7maipt.1',
  driveUrl:
    'https://drive.google.com/drive/folders/12HtL4Rchwy6JdPBs3hEa81lgwk5dxluU?usp=sharing',
  communityUrl: 'https://chat.whatsapp.com/DZsFkQv353M2u3Ue0HKbjJ',
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

    const enrolledEmails = await fetchEnrolledEmails(rosterUrls, validCutoff);
    if (!enrolledEmails.has(verified.email)) {
      return res.status(403).json({ ok: false, reason: 'not_enrolled' });
    }

    return res.status(200).json({ ok: true, materials: CLASS_MATERIALS });
  } catch (err) {
    console.error('verify-access error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upstream_error' });
  }
}
