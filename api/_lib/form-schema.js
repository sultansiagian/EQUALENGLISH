/**
 * ============================================================
 * DEFINISI ISI FORM PENDAFTARAN
 * ============================================================
 *
 * Satu-satunya sumber kebenaran soal "form /daftar isinya apa saja".
 * Dipakai bersama oleh:
 *   - api/daftar-schema.js  : dikirim ke browser buat menggambar formnya
 *   - api/daftar.js         : validasi ulang di server + menyusun baris sheet
 *   - api/admin-content.js  : membersihkan susunan yang disimpan dari /admin
 *
 * ============================================================
 * DUA HAL YANG SENGAJA DIPISAH: URUTAN vs KOLOM
 * ============================================================
 *
 * `urutan` = posisi pertanyaan di layar. Bebas diubah admin.
 * `kolom`  = kolom ke berapa di spreadsheet (0 = A, 1 = B, dst).
 *            DITETAPKAN SEKALI waktu field dibuat, lalu TIDAK PERNAH
 *            berubah lagi.
 *
 * Kenapa dipisah: kalau kolom ikut urutan tampilan, memindahkan satu
 * pertanyaan ke atas akan menggeser SEMUA data lama di spreadsheet ke
 * kolom yang salah. Nama orang tiba-tiba ada di kolom fakultas, dan
 * yang lebih parah, email bisa pindah ke kolom yang tidak dibaca sistem
 * akses. Dengan dipisah, memindahkan pertanyaan cuma mengubah tampilan.
 *
 * ============================================================
 * FIELD INTI (inti: true) TIDAK BISA DIHAPUS
 * ============================================================
 *
 * Email peserta dan pilihan paket menopang sistem akses ruang kelas:
 * api/verify-access.js mencocokkan email akun Google yang dipakai login
 * dengan email di spreadsheet. Kalau field email bisa dihapus dari
 * form, satu klik di /admin akan membuat semua pendaftar berikutnya
 * tidak pernah bisa masuk kelas, dan itu baru ketahuan berhari-hari
 * kemudian waktu ada yang mengeluh.
 *
 * Label dan urutannya tetap bisa diubah. Yang dikunci cuma keberadaannya.
 */

// Kolom di sheet Form_Responses, 0 = A. Dipetakan dari susunan yang sudah
// ada di spreadsheet user (dikonfirmasi lewat screenshot header).
const KOLOM = {
  timestamp: 0,      // A
  buktiPembayaran: 1, // B (kolom manual lama, diisi link bukti bayar juga)
  nama: 2,           // C
  fakultas: 3,       // D
  telepon: 4,        // E
  idLine: 5,         // F
  paket: 6,          // G
  namaDiri: 7,       // H
  teleponDiri: 8,    // I
  emailDiri: 9,      // J
  p1Nama: 10,        // K
  p1Telepon: 11,     // L
  p1Email: 12,       // M
  p2Nama: 13,        // N
  p2Telepon: 14,     // O
  p2Email: 15,       // P
  p3Nama: 16,        // Q
  p3Telepon: 17,     // R
  p3Email: 18,       // S
  buktiBayar: 19,    // T
  buktiBroadcast: 20, // U
  buktiInstagram: 21, // V
};

// Pertanyaan tambahan buatan admin mulai dari kolom W. User sudah
// mengonfirmasi kolom setelah V tidak dipakai apa pun.
const KOLOM_TAMBAHAN_MULAI = 22;

const TIPE_SAH = ['teks', 'teksPanjang', 'email', 'telepon', 'pilihan', 'upload', 'paket', 'peserta'];

/**
 * Susunan bawaan, sama persis dengan form yang sekarang sudah jalan.
 * Ini yang tampil kalau admin belum pernah mengubah apa pun.
 */
const FIELD_BAWAAN = [
  {
    id: 'nama', label: 'Nama lengkap', tipe: 'teks', wajib: true, aktif: true,
    inti: true, kolom: KOLOM.nama, bantuan: '',
  },
  {
    id: 'fakultas', label: 'Fakultas', tipe: 'teks', wajib: true, aktif: true,
    inti: false, kolom: KOLOM.fakultas, bantuan: 'mis. FT, FKM, Fasilkom',
  },
  {
    id: 'telepon', label: 'Nomor HP', tipe: 'telepon', wajib: true, aktif: true,
    inti: false, kolom: KOLOM.telepon, bantuan: '',
  },
  {
    id: 'idLine', label: 'ID Line', tipe: 'teks', wajib: false, aktif: true,
    inti: false, kolom: KOLOM.idLine, bantuan: '',
  },
  {
    id: 'emailDiri', label: 'Email', tipe: 'email', wajib: true, aktif: true,
    inti: true, kolom: KOLOM.emailDiri,
    bantuan: 'Pakai email Google yang aktif. Email ini yang jadi kunci masuk ruang kelas nanti.',
  },
  {
    id: 'paket', label: 'Pilihan paket', tipe: 'paket', wajib: true, aktif: true,
    inti: true, kolom: KOLOM.paket, bantuan: '',
  },
  // Satu "field" yang sebenarnya sekelompok isian (nama/HP/email peserta
  // 2 dan 3), muncul cuma kalau paketnya Pair/Group. Diperlakukan sebagai
  // satu unit supaya bisa dipindah urutannya utuh, bukan tercerai-berai.
  {
    id: 'peserta', label: 'Data teman kamu', tipe: 'peserta', wajib: true, aktif: true,
    inti: true, kolom: KOLOM.p2Nama,
    bantuan: 'Tiap peserta butuh emailnya sendiri, karena itu yang dipakai untuk masuk ruang kelas.',
  },
  {
    id: 'buktiBayar', label: 'Bukti pembayaran', tipe: 'upload', wajib: true, aktif: true,
    inti: false, kolom: KOLOM.buktiBayar, bantuan: '',
  },
  {
    id: 'buktiBroadcast', label: 'Bukti kirim broadcast ke grup teman', tipe: 'upload',
    wajib: false, aktif: true, inti: false, kolom: KOLOM.buktiBroadcast, bantuan: '',
  },
  {
    id: 'buktiInstagram', label: 'Bukti follow Instagram @equal.english', tipe: 'upload',
    wajib: false, aktif: true, inti: false, kolom: KOLOM.buktiInstagram, bantuan: '',
  },
].map((f, i) => Object.assign({ urutan: i + 1, pilihan: [] }, f));

// Pilihan paket dikunci ke tiga nilai ini karena teksnya HARUS sama
// persis dengan yang sudah tercatat di baris-baris lama spreadsheet.
// Kalau admin bisa mengarangnya sendiri, data lama dan baru jadi tidak
// bisa dibandingkan, dan logika "muncul isian peserta 2/3" ikut rusak.
const PILIHAN_PAKET = [
  'Individual (1 student)',
  'Pair (2 students)',
  'Group (3 students)',
];

const MAKS_FIELD = 40;

function teks(nilai, maks) {
  return String(nilai === undefined || nilai === null ? '' : nilai).trim().slice(0, maks || 200);
}

/**
 * Bersihkan susunan field yang dikirim dari /admin sebelum disimpan.
 *
 * Yang dijaga di sini, dan alasannya:
 *  - Field inti tidak boleh hilang. Kalau admin mengirim susunan tanpa
 *    salah satunya (bug di UI, request dibuat manual, dll), field itu
 *    DIKEMBALIKAN dengan nilai bawaan, bukan ditolak mentah-mentah --
 *    supaya sisa perubahannya tetap tersimpan.
 *  - `kolom` field bawaan dipaksa balik ke nilai aslinya. Ini
 *    penjagaan paling penting: kolom yang tertukar akan menulis data ke
 *    kolom yang salah di spreadsheet, dan itu tidak kelihatan sampai
 *    ada yang memeriksa sheet-nya langsung.
 *  - Field tambahan dapat kolom sendiri mulai dari W, tidak pernah
 *    menabrak kolom A sampai V.
 */
function normalisasiFields(masukan) {
  // Belum pernah disimpan dari /admin (atau isinya rusak) -> pakai susunan
  // bawaan LENGKAP, bukan cuma field inti. Kalau di sini cuma field inti
  // yang dikembalikan, form /daftar akan kehilangan fakultas, nomor HP,
  // dan seluruh unggahan bukti sejak hari pertama, padahal admin belum
  // pernah mengubah apa pun.
  if (!Array.isArray(masukan) || masukan.length === 0) {
    return FIELD_BAWAAN.map((f) => Object.assign({}, f));
  }

  const arr = masukan;
  const bawaanPerId = {};
  FIELD_BAWAAN.forEach((f) => {
    bawaanPerId[f.id] = f;
  });

  const hasil = [];
  const idTerpakai = {};
  let kolomTambahanBerikut = KOLOM_TAMBAHAN_MULAI;

  arr.slice(0, MAKS_FIELD).forEach((f) => {
    if (!f || typeof f !== 'object') return;
    const id = teks(f.id, 40);
    if (!id || idTerpakai[id]) return; // id kembar diabaikan
    idTerpakai[id] = true;

    const bawaan = bawaanPerId[id];
    const tipe = TIPE_SAH.includes(f.tipe) ? f.tipe : 'teks';

    hasil.push({
      id: id,
      label: teks(f.label, 120) || (bawaan ? bawaan.label : 'Pertanyaan'),
      // Tipe field bawaan tidak boleh diubah -- mengubah 'email' jadi
      // 'teks' akan mematikan pemeriksaan format email, padahal email
      // itu kunci akses kelas.
      tipe: bawaan ? bawaan.tipe : tipe,
      bantuan: teks(f.bantuan, 300),
      // Field inti selalu wajib dan selalu aktif, apa pun yang dikirim.
      wajib: bawaan && bawaan.inti ? true : Boolean(f.wajib),
      aktif: bawaan && bawaan.inti ? true : f.aktif !== false,
      inti: bawaan ? bawaan.inti : false,
      // Kolom bawaan dikunci; field tambahan dapat kolom baru berurutan.
      kolom: bawaan ? bawaan.kolom : kolomTambahanBerikut++,
      urutan: Number.isFinite(Number(f.urutan)) ? Number(f.urutan) : hasil.length + 1,
      pilihan:
        tipe === 'pilihan' && Array.isArray(f.pilihan)
          ? f.pilihan.map((p) => teks(p, 120)).filter(Boolean).slice(0, 12)
          : [],
    });
  });

  // Kembalikan field inti yang hilang, taruh di urutan bawaannya.
  FIELD_BAWAAN.forEach((b) => {
    if (b.inti && !idTerpakai[b.id]) hasil.push(Object.assign({}, b));
  });

  // Batasnya diberlakukan SETELAH field inti dikembalikan, bukan cuma di
  // masukan. Kalau cuma di masukan, mengirim 40 field tambahan tetap
  // menghasilkan 44 field (40 + inti yang disusulkan), jadi angka batasnya
  // tidak berarti apa-apa. Yang dibuang selalu field TAMBAHAN paling
  // belakang -- field inti tidak pernah boleh kena potong, apa pun
  // kondisinya.
  if (hasil.length > MAKS_FIELD) {
    for (let i = hasil.length - 1; i >= 0 && hasil.length > MAKS_FIELD; i--) {
      if (!hasil[i].inti) hasil.splice(i, 1);
    }
  }

  hasil.sort((a, b) => a.urutan - b.urutan);
  hasil.forEach((f, i) => {
    f.urutan = i + 1;
  });
  return hasil;
}

// Field yang benar-benar ditanyakan ke pendaftar (yang dimatikan admin
// tidak ikut). Dipakai bareng oleh penggambar form dan validasi server,
// supaya keduanya tidak mungkin berbeda pendapat soal apa yang ditanya.
function fieldAktif(fields) {
  return normalisasiFields(fields).filter((f) => f.aktif);
}

function emailSah(nilai) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(nilai || '').trim());
}

/**
 * Validasi jawaban di server. TIDAK memakai daftar field bawaan, tapi
 * susunan yang sedang aktif -- jadi kalau admin mematikan pertanyaan
 * "ID Line", server ikut berhenti mewajibkannya tanpa perlu diubah.
 */
function validasiJawaban(fields, jawaban) {
  const aktif = fieldAktif(fields);
  const kurang = [];
  const paket = teks(jawaban.paket, 60);

  aktif.forEach((f) => {
    if (f.tipe === 'peserta') {
      // Isian peserta 2/3 cuma wajib sesuai paket yang dipilih.
      if (paket === PILIHAN_PAKET[1] || paket === PILIHAN_PAKET[2]) {
        if (!teks(jawaban.p2Nama, 120)) kurang.push('nama peserta 2');
        if (!emailSah(jawaban.p2Email)) kurang.push('email peserta 2');
      }
      if (paket === PILIHAN_PAKET[2]) {
        if (!teks(jawaban.p3Nama, 120)) kurang.push('nama peserta 3');
        if (!emailSah(jawaban.p3Email)) kurang.push('email peserta 3');
      }
      return;
    }

    if (f.tipe === 'paket') {
      if (!PILIHAN_PAKET.includes(paket)) kurang.push(f.label.toLowerCase());
      return;
    }

    const nilai = teks(jawaban[f.id], 600);
    if (f.tipe === 'email') {
      // Email diperiksa formatnya walau tidak wajib -- email salah ketik
      // yang lolos akan bikin orangnya gagal masuk kelas nanti.
      if (f.wajib && !nilai) kurang.push(f.label.toLowerCase());
      else if (nilai && !emailSah(nilai)) kurang.push(f.label.toLowerCase() + ' (formatnya belum benar)');
      return;
    }

    if (f.wajib && !nilai) kurang.push(f.label.toLowerCase());
  });

  return kurang;
}

/**
 * Susun satu baris untuk spreadsheet: array yang indeksnya = kolom.
 *
 * Sengaja dihitung DI SINI, bukan di Apps Script. Apps Script cuma
 * menerima array jadi dan menempelkannya. Dengan begitu, menambah atau
 * memindah pertanyaan tidak pernah menuntut skrip di Google Sheet
 * ditempel ulang, dan seluruh logika pemetaan kolom bisa diuji otomatis
 * di sini.
 */
function susunBaris(fields, jawaban, linkUpload, stempelWaktu) {
  const semua = normalisasiFields(fields);
  const lebar = Math.max(
    KOLOM_TAMBAHAN_MULAI,
    ...semua.map((f) => f.kolom + 1)
  );
  const baris = new Array(lebar).fill('');

  baris[KOLOM.timestamp] = stempelWaktu;

  semua.forEach((f) => {
    if (!f.aktif) return;

    if (f.tipe === 'peserta') {
      baris[KOLOM.p2Nama] = teks(jawaban.p2Nama, 120);
      baris[KOLOM.p2Telepon] = teks(jawaban.p2Telepon, 40);
      baris[KOLOM.p2Email] = teks(jawaban.p2Email, 120);
      baris[KOLOM.p3Nama] = teks(jawaban.p3Nama, 120);
      baris[KOLOM.p3Telepon] = teks(jawaban.p3Telepon, 40);
      baris[KOLOM.p3Email] = teks(jawaban.p3Email, 120);
      return;
    }

    if (f.tipe === 'upload') {
      baris[f.kolom] = teks(linkUpload[f.id], 400);
      return;
    }

    baris[f.kolom] = teks(jawaban[f.id], 600);
  });

  // Kolom H/I/J dan K/L/M di sheet lama berisi data pendaftar itu
  // sendiri (Person 1). Diisi ulang dari jawaban supaya baris baru
  // sebentuk dengan baris-baris lama, bukan menyisakan kolom kosong di
  // tengah yang bikin sheet terlihat rusak.
  baris[KOLOM.namaDiri] = teks(jawaban.nama, 120);
  baris[KOLOM.teleponDiri] = teks(jawaban.telepon, 40);
  const paket = teks(jawaban.paket, 60);
  if (paket !== PILIHAN_PAKET[0]) {
    baris[KOLOM.p1Nama] = teks(jawaban.nama, 120);
    baris[KOLOM.p1Telepon] = teks(jawaban.telepon, 40);
    baris[KOLOM.p1Email] = teks(jawaban.emailDiri, 120);
  }

  // Kolom B ikut diisi link bukti bayar: itu kolom "BUKTI PEMBAYARAN"
  // yang sudah ada di sheet sejak sebelum form ini, jadi tetap terisi
  // supaya kebiasaan lama memeriksa lewat kolom B tidak berubah.
  if (linkUpload.buktiBayar) baris[KOLOM.buktiPembayaran] = linkUpload.buktiBayar;

  return baris;
}

module.exports = {
  FIELD_BAWAAN,
  PILIHAN_PAKET,
  KOLOM,
  KOLOM_TAMBAHAN_MULAI,
  TIPE_SAH,
  MAKS_FIELD,
  normalisasiFields,
  fieldAktif,
  validasiJawaban,
  susunBaris,
  emailSah,
};
