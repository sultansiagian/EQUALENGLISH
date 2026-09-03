const { panggilAppsScript } = require('./apps-script');
const { remLaju } = require('./rem-laju');

/**
 * ============================================================
 * PEMBERITAHUAN KALAU ADA YANG RUSAK
 * ============================================================
 *
 * Sebelum ini, semua kegagalan berakhir di console.error, yang cuma
 * terlihat kalau seseorang sengaja membuka Vercel lalu menggulir log
 * fungsi. Dua kegagalan yang paling mahal justru yang paling sunyi:
 *
 *   - /api/daftar gagal menyimpan: orangnya sudah transfer, dan yang dia
 *     lihat cuma "coba lagi nanti".
 *   - Kuota Gmail habis: pendaftaran tetap tersimpan, tapi tidak ada
 *     satu pun tanda terima yang sampai, dan kegagalannya sengaja
 *     ditelan (lihat kirim-email.js) supaya tidak menggagalkan
 *     pendaftaran. Bisa berlangsung berhari-hari tanpa ada yang sadar.
 *
 * ============================================================
 * TIGA ATURAN YANG TIDAK BOLEH DILANGGAR
 * ============================================================
 *
 * 1. TIDAK PERNAH MENGGAGALKAN PEMANGGILNYA. Fungsi ini menelan seluruh
 *    errornya sendiri. Pemberitahuan yang gagal terkirim tidak boleh
 *    berubah jadi alasan kedua kenapa pendaftaran batal.
 *
 * 2. TIDAK PERNAH DITUNGGU. Panggil tanpa await, atau lewat
 *    kerjakanDiLatar. Ini bukan bagian dari pekerjaan yang ditunggu
 *    pendaftar di layarnya.
 *
 * 3. DIREM KETAT. Satu insiden bisa memicu puluhan kegagalan berturut-
 *    turut, dan mengirim satu email per kegagalan akan menghabiskan
 *    kuota Gmail yang justru sedang dilindungi -- lalu pemberitahuannya
 *    sendiri ikut berhenti terkirim. Maksimal satu per jam per jenis.
 */

// Per JENIS masalah, bukan global: kuota email habis dan Apps Script
// mati adalah dua kabar berbeda, dan yang satu tidak boleh menutupi
// yang lain.
const MAKS_PER_JENIS = 1;
const JENDELA_MS = 60 * 60 * 1000;

function alamatAdmin() {
  // Alamat pertama di ADMIN_EMAILS. Kalau ada beberapa admin, yang
  // pertama dianggap penanggung jawab teknisnya -- mengirim ke semuanya
  // berarti mengalikan pemakaian kuota untuk kabar yang sama.
  return (process.env.ADMIN_EMAILS || '').split(',')[0].trim();
}

/**
 * @param {string} jenis  Pengenal singkat, dipakai juga sebagai kunci rem
 *                        laju. Contoh: 'daftar-gagal-simpan'.
 * @param {string} ringkas Satu kalimat yang menjelaskan apa yang rusak.
 * @param {string} rinci   Detail teknis untuk ditempel apa adanya.
 */
async function laporMasalah(jenis, ringkas, rinci) {
  try {
    const ke = alamatAdmin();
    if (!ke) {
      // Bukan error: pemasangan yang belum lengkap. Dicatat sekali saja
      // supaya tidak memenuhi log.
      console.error(
        'lapor-masalah: ADMIN_EMAILS belum diisi, jadi pemberitahuan "' + jenis +
          '" tidak dikirim ke mana pun.'
      );
      return;
    }

    const laju = remLaju('lapor:' + jenis, MAKS_PER_JENIS, JENDELA_MS);
    if (!laju.boleh) return;

    const isi =
      ringkas +
      '\n\n' +
      'Waktu: ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB\n' +
      'Jenis: ' + jenis + '\n\n' +
      String(rinci || '').slice(0, 1500) +
      '\n\n' +
      'Pemberitahuan ini dikirim otomatis dan dibatasi satu per jam per jenis, ' +
      'jadi mungkin ada kejadian lain yang tidak ikut dilaporkan. Cek log lengkapnya ' +
      'di Vercel > Deployments > Functions.';

    await panggilAppsScript('email', {
      ke: ke,
      subjek: '[EQUAL] Ada yang perlu dicek: ' + ringkas.slice(0, 80),
      isi: isi,
      html: '',
    });
  } catch (err) {
    // Jalur pemberitahuannya sendiri yang rusak. Tidak ada yang bisa
    // dilakukan dari sini selain mencatatnya, dan yang jelas tidak boleh
    // adalah melempar error ini ke pemanggil.
    console.error('lapor-masalah: pemberitahuan "' + jenis + '" gagal dikirim: ' + err.message);
  }
}

/**
 * Kabar ke admin bahwa ada pendaftar baru yang menunggu persetujuan.
 *
 * ------------------------------------------------------------
 * KENAPA MENUMPANG BERKAS INI
 * ------------------------------------------------------------
 * Isinya kabar baik, bukan masalah, jadi sekilas tidak cocok di sini.
 * Tapi seluruh mesinnya sama persis: alamat admin dari ADMIN_EMAILS,
 * pengiriman lewat action 'email' di Apps Script, dan kegagalan yang
 * ditelan supaya tidak pernah menggagalkan pendaftaran. Menyalinnya ke
 * berkas baru berarti dua tempat yang harus dijaga tetap sama.
 *
 * PENTING: memakai action 'email' yang SUDAH ADA di Apps Script, jadi
 * fitur ini tidak menuntut skripnya ditempel dan di-deploy ulang.
 *
 * ------------------------------------------------------------
 * BATASNYA LEBIH LONGGAR DARIPADA LAPORAN MASALAH
 * ------------------------------------------------------------
 * laporMasalah dibatasi satu per jam karena sepuluh kabar tentang
 * kerusakan yang sama tidak menambah apa pun. Di sini kebalikannya:
 * tiap pendaftar adalah orang yang berbeda dan uang yang berbeda, jadi
 * yang tertelan berarti ada yang menunggu tanpa kamu tahu.
 *
 * Tetap dibatasi, karena kuota Gmail 100 penerima per hari dipakai
 * bersama email tanda terima ke pendaftarnya sendiri -- tiap pendaftaran
 * sudah memakai satu. 20 per jam jauh di atas laju wajar di sini, dan
 * menyisakan ruang kalau ada lonjakan.
 */
const MAKS_KABAR_PENDAFTAR = 20;

async function kabarPendaftarBaru(ringkasan) {
  try {
    const ke = alamatAdmin();
    if (!ke) return;

    const laju = remLaju('kabar:pendaftar-baru', MAKS_KABAR_PENDAFTAR, JENDELA_MS);
    if (!laju.boleh) {
      console.error(
        'lapor-masalah: kabar pendaftar baru dilewati, sudah ' + MAKS_KABAR_PENDAFTAR +
          ' dalam sejam terakhir. Pendaftarnya TETAP tersimpan, cek /pendaftar.'
      );
      return;
    }

    const r = ringkasan || {};
    const baris = [
      r.nama ? 'Nama: ' + r.nama : '',
      r.fakultas ? 'Fakultas: ' + r.fakultas : '',
      r.paket ? 'Paket: ' + r.paket : '',
      r.email ? 'Email: ' + r.email : '',
    ].filter(Boolean);

    const asal = String(r.asal || '').replace(/\/+$/, '');

    await panggilAppsScript('email', {
      ke: ke,
      subjek: '[EQUAL] Pendaftar baru' + (r.nama ? ': ' + String(r.nama).slice(0, 60) : ''),
      isi:
        'Ada pendaftar baru yang menunggu persetujuanmu.\n\n' +
        baris.join('\n') + '\n\n' +
        'Waktu: ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB\n\n' +
        'Cek bukti pembayarannya, lalu Setujui di:\n' +
        (asal ? asal + '/pendaftar\n\n' : '/pendaftar di situsmu\n\n') +
        'Dia BELUM bisa membuka ruang kelas sampai kamu menyetujuinya.',
      html: '',
    });
  } catch (err) {
    // Sama seperti laporMasalah: jalur kabarnya sendiri yang rusak.
    // Pendaftarnya sudah tersimpan, jadi tidak ada yang hilang selain
    // pemberitahuannya.
    console.error('lapor-masalah: kabar pendaftar baru gagal dikirim: ' + err.message);
  }
}

module.exports = { laporMasalah, kabarPendaftarBaru };
