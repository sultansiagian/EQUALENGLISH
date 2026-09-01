const statistik = require('./_lib/handler-statistik');
const testimoni = require('./_lib/handler-testimoni');
const emailUji = require('./_lib/handler-email-uji');
const susunanForm = require('./_lib/handler-susunan-form');
const batch = require('./_lib/handler-batch');

/**
 * Satu pintu untuk beberapa endpoint panel admin sekaligus.
 *
 * ============================================================
 * KENAPA DIGABUNG, PADAHAL ISINYA TIDAK BERHUBUNGAN
 * ============================================================
 * Vercel paket Hobby membatasi 12 Serverless Function per deployment,
 * dan tiap berkas .js langsung di dalam api/ dihitung satu. Waktu jumlah
 * itu terlampaui, build-nya GAGAL SELURUHNYA -- bukan cuma fungsi yang
 * lebih itu yang tidak ikut, tapi tidak ada satu pun perubahan yang naik,
 * sementara situs lama tetap melayani seperti biasa. Jadi gejalanya
 * "kode sudah di-push tapi situsnya tidak berubah", tanpa error di mana
 * pun yang terlihat tanpa membuka dashboard Vercel. Itu persis yang
 * terjadi 2026-08-20 waktu jumlahnya sempat menyentuh 13.
 *
 * Berkas di dalam api/_lib/ TIDAK dihitung karena namanya diawali garis
 * bawah, jadi Vercel tidak memperlakukannya sebagai rute. Karena itu isi
 * ketiga endpoint di bawah dipindahkan ke sana, dan berkas ini yang jadi
 * satu-satunya rutenya.
 *
 * ============================================================
 * KALAU MAU MENAMBAH ENDPOINT ADMIN BARU
 * ============================================================
 * Jangan bikin berkas baru di api/. Taruh handler-nya di api/_lib/ lalu
 * daftarkan di BAGIAN di bawah. Hitung dulu: `ls api/*.js | wc -l` harus
 * tetap di bawah 12.
 *
 * Tiap handler tetap memanggil requireAdmin sendiri. Sengaja tidak
 * dipusatkan di sini: kalau suatu saat salah satunya dipanggil dari
 * tempat lain, penjagaannya ikut, tidak tertinggal di router.
 */

const BAGIAN = {
  statistik: statistik,
  testimoni: testimoni,
  'email-uji': emailUji,
  // Dulu berdiri sendiri sebagai api/atur-form.js. Dipindah ke sini
  // 2026-08-25 bukan karena ada yang salah dengannya, tapi untuk
  // mengosongkan slot lebih dulu: waktu itu jumlahnya 11 dari 12, dan
  // menunggu sampai mentok berarti membereskannya sambil panik.
  'susunan-form': susunanForm,
  // Halaman /batch. Ditaruh di sini sejak awal, bukan sebagai rute
  // sendiri: waktu ditambahkan, jumlah rutenya sudah 10 dari 12, dan
  // menaruhnya di api/ akan menghabiskan satu slot untuk sesuatu yang
  // memang tidak butuh rutenya sendiri.
  batch: batch,
};

module.exports = async function handler(req, res) {
  // Dibaca dari query untuk GET dan dari body untuk POST, supaya
  // pemanggilnya tidak perlu menempelkan query string di request POST
  // yang sudah punya body.
  const dariQuery = req.query && req.query.bagian;
  const dariBody = req.body && req.body.bagian;
  const nama = String(dariQuery || dariBody || '').trim();

  const tujuan = Object.prototype.hasOwnProperty.call(BAGIAN, nama) ? BAGIAN[nama] : null;
  if (!tujuan) {
    return res.status(400).json({
      ok: false,
      reason: 'bagian_tidak_dikenal',
      pesan:
        'Parameter "bagian" harus salah satu dari: ' + Object.keys(BAGIAN).join(', ') + '.',
    });
  }

  return tujuan(req, res);
};
