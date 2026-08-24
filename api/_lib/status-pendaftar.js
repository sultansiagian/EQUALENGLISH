const { panggilAppsScript } = require('./apps-script');
const { bacaBaris } = require('./form-schema');

/**
 * ============================================================
 * "PENDAFTARAN SAYA SUDAH MASUK BELUM?"
 * ============================================================
 *
 * Dipakai halaman /status lewat mode khusus di api/verify-access.js.
 *
 * Kenapa halaman ini ada: setelah mengirim formulir, satu-satunya kabar
 * yang diterima pendaftar adalah email tanda terima, dan kirim-email.js
 * SENGAJA menelan kegagalannya sendiri. Keputusan itu benar untuk
 * melindungi pendaftarannya, tapi akibatnya di sisi orangnya: kalau
 * emailnya tersaring ke spam atau kuota Gmail habis, dia sudah mentransfer
 * uang dan tidak punya bukti apa pun bahwa datanya sampai. Yang terjadi
 * berikutnya adalah pesan WhatsApp yang harus dijawab satu per satu.
 *
 * ============================================================
 * YANG DIKEMBALIKAN CUMA SATU KATA, DAN ITU DISENGAJA
 * ============================================================
 *
 * Untuk mencari satu orang di antrean, seluruh isi tab "Pendaftar Web"
 * harus ditarik dulu (Apps Script tidak punya cara mencari satu baris).
 * Artinya fungsi ini memegang data SEMUA pendaftar di memori sesaat.
 *
 * Karena itu bentuk balasannya dikunci: sebuah status, dan paling jauh
 * nama paket. Tidak ada nama, nomor HP, atau email orang lain yang bisa
 * ikut terbawa keluar, bahkan seandainya penyaringannya nanti salah.
 * Batas ini lebih penting daripada kelengkapan datanya -- kalau suatu
 * saat ada yang ingin menambah field ke balasan ini, pikirkan dulu apa
 * yang terjadi kalau pencocokan emailnya meleset satu baris.
 */

const STATUS = {
  DISETUJUI: 'disetujui',
  MENUNGGU: 'menunggu',
  TIDAK_DITEMUKAN: 'tidak_ditemukan',
};

/**
 * Email yang dicocokkan bukan cuma emailDiri.
 *
 * Pada paket Pair dan Group, teman-temannya juga peserta yang sah dan
 * juga menunggu kabar, tapi yang mengisi formulir cuma satu orang. Kalau
 * cuma emailDiri yang dicek, dua dari tiga peserta Group akan diberi tahu
 * bahwa pendaftaran mereka tidak ditemukan, padahal ada.
 */
function emailDiBaris(data) {
  return [data.emailDiri, data.p2Email, data.p3Email]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} email     Email yang SUDAH diverifikasi Google.
 * @param {boolean} adaDiRoster  Hasil pengecekan roster dari pemanggil.
 * @param {object} overrides Global Config, untuk membaca susunan kolom.
 */
async function cariStatus(email, adaDiRoster, overrides) {
  const alamat = String(email || '').trim().toLowerCase();
  if (!alamat) return { status: STATUS.TIDAK_DITEMUKAN };

  // Roster diperiksa DULUAN dan hasilnya dipakai apa adanya. Roster
  // adalah sumber kebenaran yang sama dengan yang dipakai gerbang masuk
  // ruang kelas, jadi kalau di sana ada, orang ini memang sudah punya
  // akses -- tidak perlu menyentuh Apps Script sama sekali.
  if (adaDiRoster) return { status: STATUS.DISETUJUI };

  let hasil;
  try {
    hasil = await panggilAppsScript('list');
  } catch (err) {
    // Antrean tidak terbaca bukan berarti orangnya tidak mendaftar.
    // Membalas "tidak ditemukan" di sini akan memberi tahu orang yang
    // sudah membayar bahwa datanya hilang, padahal yang bermasalah
    // justru sambungan ke spreadsheet.
    console.error('status-pendaftar: antrean gagal dibaca: ' + err.message);
    const e = new Error('antrean_tidak_terbaca');
    e.kode = 'antrean_tidak_terbaca';
    throw e;
  }

  const baris = (hasil && hasil.pendaftar) || [];
  for (const p of baris) {
    const data = bacaBaris(overrides && overrides.formFields, p.baris);
    if (emailDiBaris(data).indexOf(alamat) !== -1) {
      return {
        status: STATUS.MENUNGGU,
        // Nama paket saja, karena inilah yang paling sering jadi bahan
        // ragu ("aku daftar yang mana ya kemarin"). Bukan nama orang,
        // bukan nomor, bukan email siapa pun.
        paket: String(data.paket || '').trim() || null,
      };
    }
  }

  return { status: STATUS.TIDAK_DITEMUKAN };
}

module.exports = { cariStatus, STATUS };
