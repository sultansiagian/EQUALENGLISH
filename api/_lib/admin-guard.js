const { verifyGoogleIdToken } = require('./google-verify');

// Sama persis Client ID yang dipakai kelas.html (lihat data-client_id di
// sana) -- ini BUKAN rahasia, ID ini memang dimaksudkan tampil di sisi
// klien. Yang menentukan siapa boleh masuk /admin bukan Client ID ini,
// tapi daftar ADMIN_EMAILS di bawah dicek di server.
const CLIENT_ID = '367439644430-4t8r204v4h6ufouinpd2ctdftgndbehf.apps.googleusercontent.com';

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Dipanggil di awal SETIAP endpoint admin (GET maupun POST/PUT) -- tidak ada
 * cookie/session yang disimpan di server, admin.js mengirim ulang ID token
 * Google yang sama (didapat sekali dari tombol Sign in) di header
 * Authorization tiap request selama halaman admin masih terbuka. Token
 * Google berlaku sekitar 1 jam; setelah itu admin.js akan minta login ulang.
 *
 * Kenapa tanpa session cookie: proyek ini sengaja zero-dependency, bikin
 * cookie yang ditandatangani sendiri butuh secret tambahan yang harus
 * disetel manual di Vercel juga -- lebih banyak yang bisa salah setup untuk
 * keuntungan yang kecil di sini (dipakai satu-dua orang, jarang).
 */
async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!idToken) return { ok: false, status: 401, reason: 'missing_credential' };

  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    console.error(
      'ADMIN_EMAILS belum diisi di Vercel Project Settings > Environment Variables -- ' +
        'tidak ada satu pun email yang dianggap admin sampai ini diisi.'
    );
    return { ok: false, status: 500, reason: 'server_not_configured' };
  }

  const verified = await verifyGoogleIdToken(idToken, CLIENT_ID);
  if (!verified.valid) {
    // Dicatat supaya kegagalan login yang tidak jelas bisa didiagnosis dari
    // Vercel > Deployments > Functions log, tanpa perlu menebak-nebak.
    // Tidak mencatat token-nya sendiri (itu kredensial), cuma alasannya.
    console.error('admin: token ditolak, reason=' + verified.reason);
    return { ok: false, status: 401, reason: verified.reason };
  }
  if (!adminEmails.includes(verified.email)) {
    console.error(
      'admin: email "' + verified.email + '" terverifikasi Google tapi TIDAK ada di ' +
        'ADMIN_EMAILS (yang terdaftar: ' + adminEmails.join(', ') + ').'
    );
    return { ok: false, status: 403, reason: 'not_admin' };
  }

  return { ok: true, email: verified.email };
}

module.exports = { requireAdmin, CLIENT_ID };
