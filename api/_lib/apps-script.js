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
/**
 * ============================================================
 * KENAPA BALASANNYA HTML, BUKAN JSON
 * ============================================================
 *
 * Kalau Apps Script membalas HTML dengan status 200, hampir selalu yang
 * terjadi adalah SKRIPNYA TIDAK PERNAH JALAN: Google yang menyajikan
 * halamannya sendiri (halaman masuk akun, halaman minta izin, atau
 * halaman error), dan halaman itu tetap berstatus 200.
 *
 * Pesan lama di sini cuma menyebut dua kemungkinan (URL salah, atau belum
 * di-Deploy ulang) dan tidak pernah menyebut dua penyebab yang justru
 * paling sering: URL /dev, dan "Who has access" yang bukan Anyone.
 * Akibatnya orang mengecek dua hal yang sudah benar berulang kali.
 *
 * Fungsi ini membaca ciri balasannya lalu menyebut penyebab yang cocok.
 */
function jelaskanBalasanBukanJson(teks, status, url) {
  const cuplikan = String(teks || '').slice(0, 200);
  const rendah = cuplikan.toLowerCase();
  const bukanHtml = !rendah.includes('<!doctype html') && !rendah.includes('<html');

  // Bukan HTML sama sekali: biarkan cuplikannya bicara sendiri.
  if (bukanHtml) {
    return (
      'Apps Script membalas sesuatu yang bukan JSON (status ' + status + '). ' +
      'Cuplikan balasan: ' + cuplikan
    );
  }

  const dasar =
    'Apps Script membalas halaman HTML, bukan JSON (status ' + status + '). Artinya ' +
    'skripnya TIDAK jalan sama sekali -- yang menjawab Google, bukan skrip kamu. ';

  // URL /dev tidak pernah bisa dipanggil server. Dia selalu menuntut
  // pemilik skrip sedang login di peramban, jadi dari Vercel hasilnya
  // selalu halaman masuk akun. Ini dicek dari URL-nya langsung, bukan dari
  // isi balasan, jadi paling bisa dipercaya.
  if (/\/dev\/?$/.test(String(url || '').trim())) {
    return (
      dasar +
      'PENYEBABNYA KETAHUAN: APPS_SCRIPT_URL di Vercel berakhiran "/dev". URL itu ' +
      'cuma bisa dibuka pemilik skrip lewat peramban dan tidak pernah bisa dipanggil ' +
      'server. Yang dibutuhkan URL berakhiran "/exec", yang muncul setelah ' +
      'Deploy > New deployment (bukan yang tertera di editor sebagai Test deployment).'
    );
  }

  const halamanLogin =
    rendah.includes('accounts.google.com') ||
    rendah.includes('servicelogin') ||
    rendah.includes('ppconfig') ||
    rendah.includes('signin');

  if (halamanLogin) {
    return (
      dasar +
      'Balasannya berupa halaman akun Google, jadi permintaannya ditolak sebelum ' +
      'sampai ke skrip. Dua hal yang perlu dicek, berurutan: ' +
      '(1) Di Apps Script, Deploy > Manage deployments > ikon pensil, pastikan ' +
      '"Who has access" = Anyone. Kalau isinya "Anyone with Google account" atau ' +
      '"Only myself", server situs tidak akan pernah bisa memanggilnya. ' +
      '(2) Pastikan APPS_SCRIPT_URL di Vercel berakhiran "/exec", bukan "/dev". ' +
      'Setelah salah satunya diubah, Deploy ulang sebagai Version: New version, lalu ' +
      'salin ulang URL-nya ke Vercel dan redeploy project-nya.'
    );
  }

  return (
    dasar +
    'Penyebab tersering: URL-nya salah atau deployment-nya sudah dihapus, "Who has ' +
    'access" bukan Anyone, atau skrip sudah diubah tapi belum di-Deploy ulang sebagai ' +
    'versi baru. Cuplikan balasan: ' + cuplikan
  );
}

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
    throw new Error(jelaskanBalasanBukanJson(teks, res.status, url));
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
