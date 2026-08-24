/**
 * ============================================================
 * REM LAJU UNTUK ENDPOINT PUBLIK
 * ============================================================
 *
 * Dipakai /api/daftar, satu-satunya endpoint di proyek ini yang terbuka
 * tanpa login. Sebelum ini, penjaganya cuma perangkap bot tersembunyi di
 * daftar.html, yang cuma menahan bot pengisi-semua-field dan tidak
 * menahan apa pun yang mengirim JSON langsung ke endpointnya.
 *
 * ============================================================
 * YANG SEBENARNYA DILINDUNGI: KUOTA GMAIL, BUKAN BARIS SHEET
 * ============================================================
 *
 * Baris sampah di spreadsheet gampang dihapus. Yang tidak gampang
 * dipulihkan adalah kuota kirim Gmail harian: setiap pendaftaran yang
 * lolos memanggil kirimTandaTerima() ke alamat yang DITENTUKAN PENGIRIM
 * SENDIRI lewat field email di form. Artinya endpoint ini, tanpa
 * penjagaan, bisa dipakai orang lain untuk mengirim email dari akun
 * Gmail pemilik sheet ke alamat siapa pun. Dua akibatnya:
 *
 *   1. Orang yang tidak pernah mendaftar menerima email dari kamu.
 *   2. Kuota harian habis, lalu pendaftar ASLI tidak menerima tanda
 *      terima, dan kegagalan itu sengaja ditelan (lihat kirim-email.js)
 *      sehingga tidak muncul di layar siapa pun.
 *
 * Karena itu ada tiga lapisan di bawah, bukan satu.
 *
 * ============================================================
 * INI POLISI TIDUR, BUKAN TEMBOK
 * ============================================================
 *
 * Hitungannya disimpan di memori proses. Vercel membekukan dan
 * membangunkan fungsi sesuka kebutuhan, jadi hitungan ini HILANG setiap
 * cold start, dan dua instance yang jalan berbarengan punya hitungan
 * sendiri-sendiri. Penyerang yang sabar dan tahu ini tetap bisa lewat.
 *
 * Itu diterima dengan sadar. Alternatifnya (Redis/KV) berarti satu
 * layanan baru, satu env var baru, dan satu titik gagal baru pada alur
 * yang paling tidak boleh gagal di situs ini. Untuk skala sekarang,
 * menghentikan skrip iseng sudah cukup, dan lapisan email di bawah tetap
 * bekerja walau lapisan IP-nya bocor.
 */

// Satu ember per kunci, isinya stempel waktu tiap permintaan yang lolos.
// Jendela geser, bukan jendela tetap, supaya 20 permintaan di detik
// terakhir jendela lama tidak langsung disusul 20 lagi di detik pertama
// jendela baru.
const EMBER = new Map();

// Batas jumlah kunci yang disimpan, supaya memori tidak tumbuh terus
// kalau ada yang mengirim dari ribuan IP berbeda. Kalau tembus, ember
// yang isinya sudah kedaluwarsa dibuang duluan.
const MAKS_KUNCI = 5000;

function buangYangKedaluwarsa(sekarang) {
  for (const [kunci, cap] of EMBER) {
    // Jendela terpanjang yang dipakai di file ini satu jam. Apa pun yang
    // stempel terakhirnya lebih tua dari itu sudah pasti tidak relevan
    // untuk hitungan mana pun.
    if (cap.length === 0 || sekarang - cap[cap.length - 1] > 60 * 60 * 1000) {
      EMBER.delete(kunci);
    }
  }
}

/**
 * LIHAT dan CATAT sengaja dipisah jadi dua fungsi.
 *
 * Alasannya bukan kerapian. Tanda terima dijaga DUA hitungan sekaligus
 * (per alamat tujuan dan jatah global), dan kalau tiap pemeriksaan
 * langsung ikut mencatat, hitungan yang diperiksa duluan tetap bertambah
 * walaupun pemeriksaan kedua akhirnya menolak. Akibatnya nyata: orang
 * yang menghantam satu alamat yang sama berkali-kali akan menghabiskan
 * jatah global tanpa satu email pun benar-benar terkirim, yaitu persis
 * kerusakan yang mau dicegah rem ini.
 *
 * Jadi aturannya: hitungan cuma boleh bertambah kalau emailnya BENAR
 * BENAR jadi dikirim.
 */
function lihat(kunci, maks, jendelaMs) {
  const sekarang = Date.now();
  if (EMBER.size > MAKS_KUNCI) buangYangKedaluwarsa(sekarang);

  // Stempel yang sudah lewat jendela dibuang sekalian di sini, supaya
  // ember tidak menyimpan riwayat yang tidak dipakai siapa pun lagi.
  const cap = (EMBER.get(kunci) || []).filter((t) => sekarang - t < jendelaMs);
  EMBER.set(kunci, cap);

  if (cap.length >= maks) {
    const tunggu = Math.ceil((jendelaMs - (sekarang - cap[0])) / 1000);
    return { boleh: false, tungguDetik: Math.max(tunggu, 1) };
  }
  return { boleh: true, tungguDetik: 0 };
}

function catat(kunci) {
  const cap = EMBER.get(kunci) || [];
  cap.push(Date.now());
  EMBER.set(kunci, cap);
}

/**
 * Lihat lalu langsung catat kalau boleh. Dipakai untuk hitungan yang
 * berdiri sendiri (per IP), yang tidak perlu menunggu pemeriksaan lain.
 *
 * Permintaan yang DITOLAK tidak ikut dicatat. Kalau ditolak pun tetap
 * dicatat, penyerang yang terus mencoba akan memperpanjang hukumannya
 * sendiri tanpa batas, dan orang yang cuma kebetulan satu IP dengannya
 * ikut terkunci selamanya.
 */
function remLaju(kunci, maks, jendelaMs) {
  const hasil = lihat(kunci, maks, jendelaMs);
  if (hasil.boleh) catat(kunci);
  return hasil;
}

/**
 * Alamat IP pengirim di belakang proxy Vercel.
 *
 * x-forwarded-for bisa berisi rantai ("klien, proxy1, proxy2"); yang
 * pertama adalah kliennya. Header ini bisa dipalsukan kalau permintaan
 * datang langsung, tapi di Vercel semua lalu lintas lewat proxy mereka
 * yang menulis ulang nilainya, jadi entri pertama bisa dipercaya.
 */
function alamatIp(req) {
  const rantai = String(req.headers['x-forwarded-for'] || '');
  const pertama = rantai.split(',')[0].trim();
  if (pertama) return pertama;
  const nyata = String(req.headers['x-real-ip'] || '').trim();
  return nyata || 'tanpa-ip';
}

// ============================================================
// LAPISAN 1: per IP
// ============================================================
//
// SENGAJA LONGGAR. Mahasiswa UI mendaftar dari wifi kampus, dan puluhan
// orang di balik satu NAT terlihat sebagai SATU alamat IP dari sisi
// server. Batas ketat di sini akan mengunci satu ruang kelas sekaligus
// waktu link pendaftaran baru saja disebar, dan gejalanya di layar
// mereka cuma "coba lagi nanti" tanpa sebab yang bisa dimengerti.
//
// 20 per 10 menit tetap jauh di bawah laju skrip mana pun, tapi jauh di
// atas apa pun yang mungkin dilakukan sekelas mahasiswa yang antusias.
const IP_MAKS = 20;
const IP_JENDELA_MS = 10 * 60 * 1000;

function bolehKirimForm(req) {
  return remLaju('ip:' + alamatIp(req), IP_MAKS, IP_JENDELA_MS);
}

// ============================================================
// LAPISAN 2: per alamat email tujuan
// ============================================================
//
// Inilah yang benar-benar mematikan penyalahgunaan sebagai pengirim
// email. Berapa pun IP yang dipakai penyerang, satu alamat korban cuma
// bisa menerima satu email per jam dari situs ini.
//
// Efeknya ke orang asli hampir nol: pendaftar yang mengirim dua kali
// karena ragu tetap terdaftar dua kali (barisnya tetap masuk sheet),
// yang tidak terjadi cuma tanda terima keduanya.
const EMAIL_MAKS = 1;
const EMAIL_JENDELA_MS = 60 * 60 * 1000;

// ============================================================
// LAPISAN 3: jatah total tanda terima
// ============================================================
//
// Pagar terakhir kalau dua lapisan di atas ternyata bocor. Akun Gmail
// biasa punya sekitar 100 email per hari. Membatasi 25 per jam untuk
// tanda terima otomatis berarti penyalahgunaan paling parah pun cuma
// bisa menghabiskan seperempat kuota per jam, dan menyisakan ruang untuk
// email "akses dibuka" yang dikirim admin secara sadar.
//
// Angkanya perlu dinaikkan kalau nanti ada batch yang benar-benar
// menerima lebih dari 25 pendaftar dalam satu jam. Kalau itu terjadi,
// log di bawah yang akan memberi tahu, bukan keluhan siswa.
const GLOBAL_MAKS = 25;
const GLOBAL_JENDELA_MS = 60 * 60 * 1000;

/**
 * Dipanggil TEPAT SEBELUM tanda terima dikirim, bukan di awal permintaan.
 * Pendaftarannya sendiri sudah tersimpan pada titik itu, jadi jawaban
 * "tidak boleh" di sini berarti "jangan kirim emailnya", BUKAN "tolak
 * pendaftarannya". Membedakan dua hal itu penting: orang yang sudah
 * transfer uang tidak boleh gagal terdaftar gara-gara rem email.
 */
function bolehKirimTandaTerima(tujuan) {
  const alamat = String(tujuan || '').trim().toLowerCase();
  if (!alamat) return { boleh: false, alasan: 'alamat_kosong' };

  const kunciAlamat = 'email:' + alamat;

  // Per alamat diperiksa DULUAN, dan dua-duanya cuma DILIHAT di tahap
  // ini. Lihat catatan di lihat()/catat() soal kenapa urutan dan
  // pemisahan ini penting.
  const perAlamat = lihat(kunciAlamat, EMAIL_MAKS, EMAIL_JENDELA_MS);
  if (!perAlamat.boleh) {
    console.log(
      'rem-laju: tanda terima ke alamat yang sama sudah dikirim kurang dari sejam lalu, ' +
        'yang kedua tidak dikirim. Pendaftarannya tetap tersimpan.'
    );
    return { boleh: false, alasan: 'baru_saja_dikirim' };
  }

  const global = lihat('email:global', GLOBAL_MAKS, GLOBAL_JENDELA_MS);
  if (!global.boleh) {
    console.error(
      'rem-laju: jatah tanda terima otomatis (' + GLOBAL_MAKS + '/jam) sudah habis. ' +
        'Kalau ini batch yang memang ramai, naikkan GLOBAL_MAKS di api/_lib/rem-laju.js. ' +
        'Kalau tidak, ada yang menyalahgunakan /api/daftar. Pendaftaran TETAP tersimpan, ' +
        'yang tertahan cuma emailnya.'
    );
    return { boleh: false, alasan: 'jatah_global_habis' };
  }

  // Baru di sini dua-duanya bertambah, karena baru di sini emailnya
  // dipastikan jadi dikirim.
  catat(kunciAlamat);
  catat('email:global');
  return { boleh: true };
}

// remLaju ikut diekspor supaya endpoint publik berikutnya (kalau nanti
// ada) tidak perlu menulis ulang jendela gesernya sendiri.
module.exports = { remLaju, alamatIp, bolehKirimForm, bolehKirimTandaTerima };
