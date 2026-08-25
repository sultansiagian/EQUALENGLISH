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

module.exports = { laporMasalah };
