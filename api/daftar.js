const DEFAULTS = require('./_lib/site-defaults');
const { readOverrides } = require('./_lib/global-config-store');
const { panggilAppsScript } = require('./_lib/apps-script');
const { fieldAktif, validasiJawaban, susunBaris } = require('./_lib/form-schema');
const { statusForm } = require('./_lib/form-status');
const { kirimTandaTerima } = require('./_lib/kirim-email');
const { kerjakanDiLatar } = require('./_lib/kerja-latar');
const { bolehKirimForm, bolehKirimTandaTerima } = require('./_lib/rem-laju');
const { laporMasalah, kabarPendaftarBaru } = require('./_lib/lapor-masalah');
const { asalDari } = require('./_lib/email-html');
const { periksaGambar } = require('./_lib/periksa-gambar');

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

// Batas per berkas SETELAH decode. Angkanya lebih longgar dari batas di
// browser (lihat MAKS_PER_BERKAS_KB di daftar.js), karena yang di sini
// adalah pagar terakhir untuk kiriman yang tidak lewat browser sama
// sekali, bukan aturan yang dilihat pendaftar biasa.
const MAKS_BERKAS_KB = 2500;

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
  //
  // Tipe berkasnya diperiksa dari BYTE PERTAMA isinya, bukan dari label
  // "image/png" di depan data URL -- label itu diketik pengirim dan bisa
  // berisi apa saja. Lihat _lib/periksa-gambar.js.
  const berkas = [];
  const berkasDitolak = [];
  fields.forEach((f) => {
    const dataUrl = String(jawaban[f.id] || '');
    if (f.tipe !== 'upload') {
      // Field teks yang membawa data URL raksasa tidak pernah diproses
      // sebagai berkas, tapi sekarang ikut dicatat: satu-satunya alasan
      // orang melakukannya adalah mencoba-coba.
      if (/^data:/.test(dataUrl)) {
        console.log('daftar: data URL di field non-upload "' + f.id + '", diabaikan.');
      }
      return;
    }
    if (!dataUrl) return;

    const periksa = periksaGambar(dataUrl, MAKS_BERKAS_KB);
    if (!periksa.ok) {
      berkasDitolak.push({ id: f.id, label: f.label, alasan: periksa.alasan, kb: periksa.kb });
      return;
    }
    berkas.push({ id: f.id, dataUrl: dataUrl });
  });

  // Berkas WAJIB yang ditolak menggagalkan pendaftaran dengan pesan yang
  // menyebut sebabnya. Yang OPSIONAL cukup dilewati: menolak seluruh
  // pendaftaran karena bukti follow Instagram-nya bermasalah jauh lebih
  // merugikan daripada kolom yang kosong.
  const wajibDitolak = berkasDitolak.filter((b) =>
    fields.some((f) => f.id === b.id && f.wajib)
  );
  if (wajibDitolak.length > 0) {
    const b = wajibDitolak[0];
    const pesan =
      b.alasan === 'terlalu_besar'
        ? 'Berkas "' + b.label + '" berukuran ' + b.kb + ' KB, terlalu besar. ' +
          'Coba unggah ulang lewat halaman pendaftaran supaya otomatis dikecilkan.'
        : 'Berkas "' + b.label + '" sepertinya bukan gambar. Unggah tangkapan layar ' +
          'atau foto dalam format JPG, PNG, atau WebP.';
    console.log('daftar: berkas wajib ditolak, alasan=' + b.alasan);
    return res.status(400).json({ ok: false, reason: 'berkas_tidak_sah', pesan: pesan });
  }
  berkasDitolak.forEach((b) => {
    console.log('daftar: berkas opsional "' + b.id + '" dilewati, alasan=' + b.alasan);
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

    /* Kabar ke admin bahwa ada yang menunggu persetujuan.
       Tanpa ini, satu-satunya cara tahu ada pendaftar baru adalah rajin
       membuka /pendaftar sendiri, dan orang yang sudah transfer menunggu
       tanpa ada yang menyadarinya.

       Dikirim SETELAH barisnya tersimpan dan setelah tanda terima ke
       pendaftarnya, karena urutan itu yang menentukan siapa yang lebih
       dulu dilayani kalau kuota Gmail mepet: pendaftarnya lebih penting
       daripada kabar ke kita sendiri.

       Kegagalannya ditelan di dalam kabarPendaftarBaru, jadi tidak ada
       jalan bagi pemberitahuan ini untuk menggagalkan pendaftaran. */
    await kerjakanDiLatar(
      () =>
        kabarPendaftarBaru({
          nama: jawaban.nama,
          fakultas: jawaban.fakultas,
          paket: jawaban.paket,
          email: jawaban.emailDiri,
          asal: asalDari(
            overrides.linkRuangKelas !== undefined
              ? overrides.linkRuangKelas
              : DEFAULTS.linkRuangKelas
          ),
        }),
      'kabar pendaftar baru'
    );

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
