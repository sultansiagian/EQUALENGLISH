const DEFAULTS = require('./site-defaults');
const { waktuWibKeEpoch } = require('./form-status');

/**
 * ============================================================
 * KARTU DI RUANG KELAS, DAN FINAL TEST YANG TIGA BAGIAN
 * ============================================================
 *
 * Dua hal dikerjakan di sini karena keduanya menjawab satu pertanyaan
 * yang sama: APA YANG BOLEH DILIHAT SISWA SEKARANG.
 *
 * Sengaja MURNI. Semua fungsi di sini menerima nilai Global Config dan
 * waktu, lalu mengembalikan objek. Tidak ada yang mengambil dari
 * jaringan dan tidak ada yang membaca jam sendiri kecuali diberi. Waktu
 * dijadikan parameter supaya "besok jam 9" bisa diuji tanpa menunggu
 * besok, dan supaya satu permintaan memakai SATU titik waktu untuk
 * semua bagian -- bukan Date.now() yang bergeser di tengah perhitungan.
 *
 * ------------------------------------------------------------
 * YANG TIDAK BOLEH DILONGGARKAN DI SINI
 * ------------------------------------------------------------
 * Link yang belum waktunya TIDAK PERNAH ikut dikirim ke browser.
 * Menyembunyikan tombolnya saja tidak menjaga apa pun: isi balasan
 * server bisa dibaca siapa saja yang mau melihatnya. Jadi fungsi di
 * bawah mengembalikan url kosong, bukan url yang disertai tanda
 * "jangan ditampilkan".
 */

// ============================================================
// FINAL TEST
// ============================================================
// Tiga bagian, masing-masing punya link, jam buka, dan jam tutup
// SENDIRI. Sebelumnya cuma ada satu link dan satu jam buka untuk
// seluruh Final Test.
//
// Kuncinya diberi nama mengikuti pola yang sudah ada di berkas ini
// (kelasPracticeListeningUrl, kelasKuisListeningBuka), bukan bentuk
// baru, supaya yang membaca /atur-kelas tidak perlu menghafal dua pola.
const BAGIAN_FINAL = [
  {
    id: 'listening',
    nama: 'Listening',
    kunciUrl: 'kelasFinalListeningUrl',
    kunciBuka: 'kelasFinalListeningBuka',
    kunciTutup: 'kelasFinalListeningTutup',
  },
  {
    id: 'reading',
    nama: 'Reading',
    kunciUrl: 'kelasFinalReadingUrl',
    kunciBuka: 'kelasFinalReadingBuka',
    kunciTutup: 'kelasFinalReadingTutup',
  },
  {
    id: 'writing',
    nama: 'Writing',
    kunciUrl: 'kelasFinalWritingUrl',
    kunciBuka: 'kelasFinalWritingBuka',
    kunciTutup: 'kelasFinalWritingTutup',
  },
];

function teks(nilai) {
  return String(nilai === undefined || nilai === null ? '' : nilai).trim();
}

function ambil(overrides, kunci) {
  const o = overrides || {};
  return teks(o[kunci] !== undefined ? o[kunci] : DEFAULTS[kunci]);
}

/**
 * Keadaan satu bagian Final Test pada satu titik waktu.
 *
 * WARISAN SATU LINK. Sebelum ada tiga bagian, seluruh Final Test cuma
 * punya kelasFinalTestUrl dan kelasFinalTestBukaPada. Nilai itu dipakai
 * sebagai CADANGAN kalau bagian ini belum diisi sendiri, supaya
 * pengaturan yang sudah terlanjur ada tidak mati begitu versi ini
 * dipasang. Begitu bagian ini diisi, cadangannya berhenti berpengaruh.
 *
 * Jam tutup TIDAK punya cadangan: dulu memang tidak ada, dan kosong di
 * sini berarti "tidak pernah tutup" -- persis perilaku lama.
 */
function bagianFinal(overrides, def, sekarangMs) {
  const url = ambil(overrides, def.kunciUrl) || ambil(overrides, 'kelasFinalTestUrl');
  const bukaTeks = ambil(overrides, def.kunciBuka) || ambil(overrides, 'kelasFinalTestBukaPada');
  const tutupTeks = ambil(overrides, def.kunciTutup);

  const bukaMs = waktuWibKeEpoch(bukaTeks);
  const tutupMs = waktuWibKeEpoch(tutupTeks);

  const adaLink = Boolean(url);
  const adaJadwal = bukaMs !== null;
  const sudahWaktunya = adaJadwal && sekarangMs >= bukaMs;
  // Jam tutup yang lebih awal dari jam buka itu salah isi, bukan bagian
  // yang tutup selamanya. Diabaikan supaya satu salah ketik tidak
  // mengunci ujian yang seharusnya berjalan, dan ditandai lewat
  // jadwalTerbalik supaya /atur-kelas bisa memperingatkan pemiliknya.
  const jadwalTerbalik = adaJadwal && tutupMs !== null && tutupMs <= bukaMs;
  const adaTutup = tutupMs !== null && !jadwalTerbalik;
  const sudahTutup = adaTutup && sekarangMs >= tutupMs;

  return {
    id: def.id,
    nama: def.nama,
    adaLink,
    adaJadwal,
    sudahWaktunya,
    adaTutup,
    sudahTutup,
    jadwalTerbalik,
    // Terbuka = sudah lewat jam buka dan belum lewat jam tutup. Syarat
    // testimoni TIDAK ikut di sini: itu urusan siswanya, bukan urusan
    // jadwal, dan dipisah supaya pesan di layar bisa membedakan
    // "belum waktunya" dari "kamu belum isi testimoni".
    terbuka: adaLink && sudahWaktunya && !sudahTutup,
    bukaPada: adaJadwal ? new Date(bukaMs).toISOString() : null,
    tutupPada: adaTutup ? new Date(tutupMs).toISOString() : null,
  };
}

/**
 * Keadaan seluruh Final Test untuk satu siswa.
 *
 * @param {object} overrides nilai Global Config
 * @param {string} email     email siswa yang sedang login
 * @param {number} [sekarangMs] titik waktu, default jam sekarang
 */
function hitungFinalTest(overrides, email, sekarangMs) {
  const o = overrides || {};
  const kini = Number.isFinite(sekarangMs) ? sekarangMs : Date.now();

  const daftar = Array.isArray(o.testimoniSudahIsi) ? o.testimoniSudahIsi : [];
  const sudahTestimoni = daftar.indexOf(normalisasiEmailSederhana(email)) !== -1;

  const bagian = BAGIAN_FINAL.map((def) => bagianFinal(o, def, kini));

  // Kartunya sendiri disiapkan kalau ADA satu saja bagian yang punya
  // link dan jadwal. Kalau semuanya kosong, kartu tidak menampilkan
  // tombol rusak, melainkan mengatakan bahwa Final Test belum
  // dijadwalkan.
  const adaYangSiap = bagian.some((b) => b.adaLink && b.adaJadwal);

  return {
    sudahTestimoni,
    bagian,
    adaYangSiap,
    // Dipertahankan supaya balasan lama tetap punya bentuk yang sama.
    // Bernilai true kalau ada MINIMAL SATU bagian yang benar-benar bisa
    // dibuka siswa ini sekarang.
    boleh: sudahTestimoni && bagian.some((b) => b.terbuka),
    adaLink: bagian.some((b) => b.adaLink),
    adaJadwal: bagian.some((b) => b.adaJadwal),
    sudahWaktunya: bagian.some((b) => b.sudahWaktunya),
    bukaPada: bagian.reduce(function (paling, b) {
      if (!b.bukaPada) return paling;
      if (!paling) return b.bukaPada;
      return b.bukaPada < paling ? b.bukaPada : paling;
    }, null),
  };
}

/**
 * Link tiap bagian, HANYA untuk bagian yang benar-benar boleh dibuka
 * siswa ini sekarang. Bagian yang belum waktunya, sudah tutup, atau
 * siswanya belum mengisi testimoni mengembalikan string kosong.
 */
function urlFinalTest(overrides, status) {
  const hasil = {};
  BAGIAN_FINAL.forEach((def) => {
    const b = status.bagian.find((x) => x.id === def.id);
    const boleh = Boolean(b && b.terbuka && status.sudahTestimoni);
    hasil[def.id] = boleh
      ? ambil(overrides, def.kunciUrl) || ambil(overrides, 'kelasFinalTestUrl')
      : '';
  });
  return hasil;
}

// Disalin kecil dari api/verify-access.js, bukan diimpor: berkas ini
// tidak boleh me-require handler, karena handler itu me-require berkas
// ini. Isinya cuma satu baris dan artinya tidak akan bergeser.
function normalisasiEmailSederhana(email) {
  return String(email || '').trim().toLowerCase();
}

// ============================================================
// KARTU BAWAAN
// ============================================================
// Tujuh kartu yang ditulis tetap di kelas.html. Yang diatur pemilik
// cuma TAMPIL atau TIDAK, bukan isinya -- masing-masing punya perilaku
// sendiri (hitung mundur Zoom, daftar sesi, logika kunci Final Test)
// yang tidak bisa dibuat ulang dari kartu biasa.
//
// `id` di sini harus sama dengan atribut data-kartu di kelas.html.
// Kalau tidak sama, sakelarnya tetap tersimpan tapi tidak mematikan
// apa pun, dan itu jenis kerusakan yang tidak terlihat sampai ada yang
// mencoba mematikan kartunya.
const KARTU_BAWAAN = [
  { id: 'zoom', nama: 'Kelas Zoom', keterangan: 'Link masuk kelas dan hitung mundur sesi berikutnya' },
  { id: 'rekaman', nama: 'Rekaman & Materi', keterangan: 'Folder Google Drive' },
  { id: 'komunitas', nama: 'Grup Komunitas', keterangan: 'Link grup WhatsApp' },
  { id: 'jadwal', nama: 'Jadwal', keterangan: 'Daftar sesi dan progres batch' },
  { id: 'final', nama: 'Final Test', keterangan: 'Tiga bagian comprehension, terkunci sampai jadwalnya' },
  { id: 'latihan', nama: 'Latihan Soal', keterangan: 'Tiga kuis Wayground' },
  { id: 'pengumuman', nama: 'Pengumuman', keterangan: 'Teks bebas, sembunyi sendiri kalau kosong' },
];

const ID_BAWAAN = KARTU_BAWAAN.map((k) => k.id);

/**
 * Id kartu bawaan yang sedang dimatikan pemilik.
 *
 * Yang disimpan adalah daftar yang DIMATIKAN, bukan yang dinyalakan.
 * Bedanya penting waktu ada kartu bawaan baru ditambahkan nanti: dengan
 * daftar "dimatikan", kartu baru otomatis tampil. Dengan daftar
 * "dinyalakan", kartu baru akan diam-diam tidak muncul di situs yang
 * pengaturannya sudah pernah disimpan, dan tidak ada yang tahu kenapa.
 */
function kartuBawaanMati(overrides) {
  const o = overrides || {};
  const daftar = Array.isArray(o.kelasKartuMati) ? o.kelasKartuMati : [];
  return daftar.map(teks).filter((id) => ID_BAWAAN.indexOf(id) !== -1);
}

// ============================================================
// KARTU BUATAN SENDIRI
// ============================================================

const MAKS_KARTU = 20;
const LEBAR_SAH = ['auto', 'sempit', 'lebar'];

// Batas panjang deskripsi sebelum kartu "auto" dianggap butuh satu baris
// penuh. Dipilih dari isi yang ada sekarang: deskripsi kartu bawaan yang
// sempit panjangnya 40-55 karakter, yang lebar jauh di atas itu.
const AMBANG_LEBAR = 120;

function potong(nilai, maks) {
  return teks(nilai).slice(0, maks);
}

/**
 * Bersihkan daftar kartu buatan pemilik.
 *
 * Kartu tanpa judul dibuang: judul itu satu-satunya bagian yang pasti
 * terlihat siswa, dan kartu tanpa judul di halaman siswa cuma jadi
 * kotak kosong yang membingungkan. Bagian lain boleh kosong semua.
 */
function normalisasiKartuTambahan(daftar) {
  if (!Array.isArray(daftar)) return [];
  return daftar
    .slice(0, MAKS_KARTU)
    .map((k, i) => {
      const lebar = teks(k && k.lebar);
      return {
        // Id dipakai sebagai kunci waktu menggambar dan waktu mengurut.
        // Dibuatkan kalau belum ada supaya kartu lama yang tersimpan
        // tanpa id tidak saling tertukar.
        id: potong(k && k.id, 40) || 'kartu-' + (i + 1),
        label: potong(k && k.label, 24),
        judul: potong(k && k.judul, 80),
        deskripsi: potong(k && k.deskripsi, 300),
        ikonUrl: potong(k && k.ikonUrl, 400),
        url: potong(k && k.url, 500),
        // Waktu WIB "2026-09-09T19:00", atau kosong untuk selalu tampil.
        bukaPada: potong(k && k.bukaPada, 20),
        lebar: LEBAR_SAH.indexOf(lebar) !== -1 ? lebar : 'auto',
      };
    })
    .filter((k) => k.judul);
}

/**
 * Lebar yang benar-benar dipakai menggambar.
 *
 * "auto" diputuskan dari ISI KARTU ITU SENDIRI, bukan dari berapa kartu
 * lain yang kebetulan ada. Sempat terpikir memakai jumlah kartu supaya
 * tidak ada yang tersisa sendirian di barisnya, tapi akibatnya
 * menambah satu kartu bisa mengubah lebar kartu lain yang tidak
 * disentuh, dan itu terasa seperti kerusakan.
 */
function lebarDipakai(kartu) {
  if (kartu.lebar !== 'auto') return kartu.lebar;
  if (!kartu.url) return 'lebar';
  return kartu.deskripsi.length > AMBANG_LEBAR ? 'lebar' : 'sempit';
}

/**
 * Kartu tambahan yang boleh dilihat siswa sekarang.
 *
 * Kartu yang jadwal bukanya belum tiba TIDAK ikut dikirim sama sekali,
 * bukan dikirim lalu disembunyikan browser. Alasannya sama dengan link
 * Final Test: yang tidak boleh dilihat tidak boleh ada di balasan.
 */
function kartuTambahanUntukSiswa(overrides, sekarangMs) {
  const o = overrides || {};
  const kini = Number.isFinite(sekarangMs) ? sekarangMs : Date.now();

  return normalisasiKartuTambahan(o.kelasKartuTambahan)
    .filter((k) => {
      if (!k.bukaPada) return true;
      const bukaMs = waktuWibKeEpoch(k.bukaPada);
      // Tanggal yang tidak terbaca dianggap BELUM dibuka. Menganggapnya
      // "tampil saja" akan membocorkan kartu yang justru sengaja
      // dijadwalkan, gara-gara satu salah ketik.
      if (bukaMs === null) return false;
      return kini >= bukaMs;
    })
    .map((k) => ({
      id: k.id,
      label: k.label,
      judul: k.judul,
      deskripsi: k.deskripsi,
      ikonUrl: k.ikonUrl,
      url: k.url,
      lebar: lebarDipakai(k),
    }));
}

module.exports = {
  BAGIAN_FINAL,
  KARTU_BAWAAN,
  ID_BAWAAN,
  MAKS_KARTU,
  hitungFinalTest,
  urlFinalTest,
  kartuBawaanMati,
  normalisasiKartuTambahan,
  kartuTambahanUntukSiswa,
  lebarDipakai,
};
