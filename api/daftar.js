const DEFAULTS = require('./_lib/site-defaults');
const { readOverrides } = require('./_lib/global-config-store');
const { panggilAppsScript } = require('./_lib/apps-script');
const { fieldAktif, validasiJawaban, susunBaris } = require('./_lib/form-schema');
const { statusForm } = require('./_lib/form-status');
const { kirimTandaTerima } = require('./_lib/kirim-email');
const { kerjakanDiLatar } = require('./_lib/kerja-latar');
const { bolehKirimForm, bolehKirimTandaTerima } = require('./_lib/rem-laju');
const { laporMasalah } = require('./_lib/lapor-masalah');

/**
 * Endpoint form pendaftaran di /daftar. INI SATU-SATUNYA endpoint di
 * proyek ini yang terbuka untuk umum tanpa login, jadi penjagaannya
 * beda dari endpoint /admin.
 *
 * Yang membuat ini tidak berbahaya walau terbuka: pendaftaran masuk ke
 * tab "Pendaftar Web", yang TIDAK terdaftar di ROSTER_CSV_URLS. Jadi
 * mengirim form ini tidak pernah memberi akses ruang kelas ke siapa pun.
 * Akses baru terbuka setelah admin menekan Setujui di /pendaftar, yang
 * memindahkan barisnya ke Form_Responses. Skenario terburuk dari
 * penyalahgunaan endpoint ini cuma baris sampah yang bisa dihapus, bukan
 * orang asing masuk ke kelas berbayar.
 *
 * PERTANYAAN FORMNYA TIDAK DIPAKU DI SINI. Susunannya dibaca dari Global
 * Config (bisa diubah admin lewat /admin), dan validasi mengikuti susunan
 * itu. Yang dikirim browser TIDAK dipercaya menentukan apa pun soal
 * struktur -- browser cuma mengirim jawaban, server yang menentukan
 * pertanyaan apa yang berlaku dan ke kolom mana jawabannya ditulis.
 */

// Batas ukuran total body. Vercel sendiri membatasi 4,5 MB; angka di
// sini lebih kecil supaya penolakannya datang dari kode ini dengan pesan
// yang jelas, bukan dari platform dengan error mentah. Foto sudah
// dikompres di browser (lihat daftar.js), jadi normalnya jauh di bawah ini.
const MAKS_BODY_BYTES = 3.5 * 1024 * 1024;

const POLA_DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  // Rem laju DIPASANG PALING DEPAN, sebelum membaca body, memanggil
  // Global Config, atau menyentuh Apps Script. Gunanya justru supaya
  // permintaan yang berlebihan berhenti sebelum menghabiskan apa pun.
  // Perangkap bot di bawah juga ikut terhitung di sini, karena bot yang
  // mengirim JSON langsung ke endpoint ini tidak pernah melihat
  // perangkapnya sama sekali. Alasan angkanya ada di _lib/rem-laju.js.
  const laju = bolehKirimForm(req);
  if (!laju.boleh) {
    res.setHeader('Retry-After', String(laju.tungguDetik));
    return res.status(429).json({
      ok: false,
      reason: 'terlalu_sering',
      pesan:
        'Terlalu banyak percobaan pendaftaran dari jaringan ini. Tunggu beberapa menit, ' +
        'lalu coba lagi. Kalau kamu sedang memakai wifi kampus dan buru-buru, daftar ' +
        'lewat WhatsApp saja supaya tidak tertunda.',
    });
  }

  const body = req.body || {};

  // Perangkap bot: field tersembunyi yang tidak pernah diisi manusia
  // (disembunyikan lewat CSS, bukan type=hidden, supaya bot pengisi-semua
  // tetap mengisinya). Kalau terisi, pura-pura berhasil supaya bot tidak
  // tahu perangkapnya ketahuan dan mencoba cara lain.
  if (String(body.website || '').trim()) {
    console.log('daftar: submission ditolak karena perangkap bot terisi.');
    return res.status(200).json({ ok: true });
  }

  if (JSON.stringify(body).length > MAKS_BODY_BYTES) {
    return res.status(413).json({
      ok: false,
      reason: 'terlalu_besar',
      pesan: 'Total ukuran foto yang diunggah terlalu besar. Coba unggah foto yang lebih kecil.',
    });
  }

  let overrides;
  try {
    overrides = await readOverrides();
  } catch (err) {
    // readOverrides sendiri sudah gagal-diam-diam, tapi dijaga sekali lagi
    // supaya form tidak pernah menolak orang gara-gara masalah baca config.
    overrides = {};
  }

  // Penolakan waktu form tutup DILAKUKAN DI SINI, bukan cuma di halaman.
  // Orang bisa mengirim langsung ke endpoint ini tanpa pernah membuka
  // /daftar, jadi pemeriksaan di browser tidak pernah cukup.
  const status = statusForm(overrides);
  if (!status.terbuka) {
    return res.status(403).json({
      ok: false,
      reason: 'form_tutup',
      pesan: [status.pesan, status.pesanTambahan].filter(Boolean).join(' '),
    });
  }

  const fields = fieldAktif(overrides.formFields);
  const jawaban = body.jawaban && typeof body.jawaban === 'object' ? body.jawaban : {};

  // Validasi diulang di server memakai susunan yang sama dengan yang
  // dipakai menggambar form. Validasi di browser gampang dilewati
  // (matikan JS, kirim request langsung), jadi tidak pernah boleh jadi
  // satu-satunya penjaga.
  // overrides ikut dikirim supaya validasi tahu paket mana yang sedang
  // tersedia, bukan cuma paket mana yang dikenal.
  const kurang = validasiJawaban(overrides.formFields, jawaban, overrides);
  if (kurang.length > 0) {
    return res.status(400).json({
      ok: false,
      reason: 'data_kurang',
      pesan: 'Masih ada yang belum diisi: ' + kurang.join(', ') + '.',
    });
  }

  // Pisahkan berkas unggahan dari jawaban teks. Cuma field bertipe
  // 'upload' yang boleh membawa data URL; kalau ada yang menyelipkan data
  // URL raksasa ke field teks biasa, itu tidak ikut diproses sebagai file.
  const berkas = [];
  fields.forEach((f) => {
    if (f.tipe !== 'upload') return;
    const dataUrl = String(jawaban[f.id] || '');
    if (!POLA_DATA_URL.test(dataUrl)) return;
    berkas.push({ id: f.id, dataUrl: dataUrl });
  });

  const folder =
    overrides.driveFolder !== undefined && String(overrides.driveFolder).trim()
      ? String(overrides.driveFolder).trim()
      : DEFAULTS.driveFolder;

  try {
    // Apps Script yang menyimpan berkas ke Drive lalu mengembalikan
    // linknya, karena file harus mendarat di Drive milik pemilik sheet
    // (privat), bukan di penyimpanan situs yang bersifat publik.
    const hasilUpload = await panggilAppsScript('upload', { berkas, folder });
    const link = (hasilUpload && hasilUpload.link) || {};

    // Baris disusun DI SINI, bukan di Apps Script. Dengan begitu,
    // menambah atau memindah pertanyaan tidak pernah menuntut skrip di
    // Google Sheet ditempel ulang, dan pemetaan kolomnya bisa diuji
    // otomatis (lihat susunBaris di form-schema.js).
    const stempel = new Date()
      .toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour12: false })
      .replace(',', '');
    const baris = susunBaris(overrides.formFields, jawaban, link, stempel);

    const hasil = await panggilAppsScript('submit', { baris });

    // Tanda terima dikirim SETELAH barisnya tersimpan, dan hasilnya sengaja
    // TIDAK ditunggu sebelum membalas berhasil ke pendaftar. Email yang gagal
    // terkirim tidak boleh membuat pendaftaran yang sudah tersimpan terlihat
    // gagal di layar orangnya.
    //
    // Tapi dititipkan lewat kerjakanDiLatar, bukan dilepas begitu saja:
    // fungsi Vercel dibekukan begitu balasan terkirim, dan panggilan yang
    // masih di tengah jalan saat itu bisa hilang tanpa jejak. Penjelasan
    // lengkapnya di _lib/kerja-latar.js.
    // Rem kedua, khusus email, dan dipasang DI SINI bukan di atas: pada
    // titik ini barisnya SUDAH tersimpan. Jadi kalau jatah email habis,
    // yang batal cuma tanda terimanya, bukan pendaftarannya. Membedakan
    // dua hal itu penting, karena orang yang sudah transfer uang tidak
    // boleh gagal terdaftar gara-gara rem yang dipasang untuk melindungi
    // kuota Gmail. Alasan angkanya ada di _lib/rem-laju.js.
    const lajuEmail = bolehKirimTandaTerima(jawaban.emailDiri);
    if (lajuEmail.boleh) {
      await kerjakanDiLatar(
        () => kirimTandaTerima(overrides, jawaban.emailDiri, jawaban.nama),
        'tanda terima /daftar'
      );
    }

    return res.status(200).json({ ok: true, id: hasil.id });
  } catch (err) {
    console.error('daftar: gagal mengirim ke Apps Script:', err.message);
    // Dilaporkan, TIDAK ditunggu. Ini kegagalan yang paling mahal di
    // seluruh situs: orangnya sudah transfer dan yang dia lihat cuma
    // "coba lagi nanti". Tanpa pemberitahuan, satu-satunya cara tahu
    // adalah menunggu ada yang mengeluh lewat WhatsApp.
    kerjakanDiLatar(
      () =>
        laporMasalah(
          'daftar-gagal-simpan',
          'Pendaftaran gagal tersimpan ke spreadsheet',
          'Ada calon peserta yang mengirim formulir dan gagal. Kemungkinan besar ' +
            'dia sudah mentransfer. Cek /pendaftar, dan kalau barisnya memang tidak ' +
            'ada, hubungi dia untuk mendaftarkan manual.\n\nPesan teknis: ' + err.message
        ),
      'lapor daftar gagal'
    );
    return res.status(502).json({
      ok: false,
      reason: 'gagal_simpan',
      pesan:
        'Pendaftaran gagal tersimpan. Coba lagi sebentar lagi, atau hubungi kami lewat ' +
        'WhatsApp supaya didaftarkan manual.',
    });
  }
};
