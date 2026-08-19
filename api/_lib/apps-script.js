/**
 * Pemanggil Google Apps Script yang terpasang di spreadsheet pendaftaran
 * (lihat apps-script.gs di root repo untuk kode dan cara pasangnya).
 *
 * URL dan secret-nya HANYA ada di sini (sisi server). Tidak pernah
 * dikirim ke browser pengunjung -- kalau bocor, siapa pun bisa menulis
 * baris ke spreadsheet pendaftaran.
 */

function konfigurasi() {
  const url = (process.env.APPS_SCRIPT_URL || '').trim();
  const secret = (process.env.APPS_SCRIPT_SECRET || '').trim();
  return { url, secret, siap: Boolean(url && secret) };
}

/**
 * Apps Script membalas 302 ke googleusercontent.com untuk hasil akhirnya.
 * fetch() bawaan Node mengikuti redirect ini secara otomatis, jadi tidak
 * perlu penanganan khusus -- tapi jangan diubah jadi redirect:'manual'
 * tanpa menambah penanganan itu.
 *
 * Balasannya kadang berupa halaman HTML error (mis. skrip belum
 * di-deploy ulang setelah diubah, atau URL-nya salah), bukan JSON. Itu
 * ditangkap di sini dan diubah jadi pesan yang bisa dibaca manusia,
 * bukan dilempar sebagai "Unexpected token < in JSON".
 */
async function panggilAppsScript(action, payload) {
  const { url, secret, siap } = konfigurasi();
  if (!siap) {
    throw new Error(
      'APPS_SCRIPT_URL dan/atau APPS_SCRIPT_SECRET belum diisi di Vercel > Settings > ' +
        'Environment Variables. Lihat cara pasangnya di apps-script.gs.'
    );
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ secret, action }, payload || {})),
  });

  const teks = await res.text();
  let data;
  try {
    data = JSON.parse(teks);
  } catch (err) {
    throw new Error(
      'Apps Script tidak membalas JSON (status ' + res.status + '). Penyebab tersering: ' +
        'URL-nya salah, atau skrip sudah diubah tapi belum di-Deploy ulang sebagai ' +
        'versi baru. Cuplikan balasan: ' + teks.slice(0, 120)
    );
  }

  if (!data.ok) {
    if (data.reason === 'secret_salah') {
      throw new Error(
        'Secret ditolak Apps Script. Pastikan APPS_SCRIPT_SECRET di Vercel sama persis ' +
          'dengan nilai SECRET di dalam skrip, lalu Deploy ulang skripnya sebagai versi baru.'
      );
    }
    throw new Error(data.pesan || data.reason || 'Apps Script menolak permintaan.');
  }

  return data;
}

module.exports = { panggilAppsScript, konfigurasi };
