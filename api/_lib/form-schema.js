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

/**
 * Kolom W DIPESAN khusus untuk tanggal berakhirnya akses ruang kelas.
 * Diisi otomatis waktu admin menekan Setujui di /pendaftar.
 *
 * Kenapa berupa tanggal di tiap baris, bukan satu setelan global:
 * baris lama (dari Google Form dan sheet manual) tidak punya isi di
 * kolom ini, jadi mereka OTOMATIS tidak pernah kedaluwarsa tanpa perlu
 * penanda "ini pendaftar web" terpisah. Persis yang diminta: yang lama
 * tetap diatur manual dengan kata "done", yang baru punya batas waktu
 * sendiri.
 *
 * Nilainya juga kelihatan dan bisa diubah langsung di spreadsheet, jadi
 * memperpanjang akses satu orang cukup dengan mengganti tanggalnya, dan
 * mencabut batas waktunya cukup dengan mengosongkan selnya.
 */
const KOLOM_BERLAKU_SAMPAI = 22; // W

// Pertanyaan tambahan buatan admin mulai dari kolom X, MELEWATI kolom W
// yang sudah dipesan di atas.
const KOLOM_TAMBAHAN_MULAI = 23;

/**
 * Dua kolom lagi yang dipesan, jauh di kanan: label batch dan penanda
 * pencabutan dari halaman /batch.
 *
 * KENAPA JAUH DI KANAN, BUKAN DI SEBELAH KOLOM W.
 * Kolom X ke kanan itu jatah pertanyaan tambahan buatan admin, dan
 * jumlahnya tumbuh tiap kali ada pertanyaan baru, sampai batas
 * MAKS_FIELD di bawah. Menaruh penanda batch di X+1 berarti pertanyaan
 * tambahan kesekian nanti akan menimpanya, dan gejalanya jahat: label
 * batch berubah jadi jawaban seseorang, atau sebaliknya jawaban
 * seseorang terbaca sebagai nama batch. Tidak ada yang error, cuma
 * datanya diam-diam salah.
 *
 * ANGKANYA DIHITUNG, BUKAN DIKIRA-KIRA. Pertanyaan tambahan mulai di
 * KOLOM_TAMBAHAN_MULAI (23) dan bertambah satu kolom per pertanyaan,
 * dibatasi MAKS_FIELD (40), jadi kolom terjauh yang mungkin dipakainya
 * adalah 23 + 40 - 1 = 62.
 *
 * Percobaan pertama menaruhnya di 63 -- tepat satu kolom di sebelahnya,
 * yang secara teknis benar hari ini tapi langsung bertabrakan begitu
 * MAKS_FIELD dinaikkan seorang pun. 70 memberi jarak tujuh kolom, dan
 * test/batch.test.js menjaga jarak itu supaya kalau MAKS_FIELD naik
 * sampai mendekat, tesnya gagal duluan sebelum ada data yang tertimpa.
 *
 * Angkanya ditulis ulang di apps-script.gs (KOLOM_BATCH/KOLOM_CABUT) dan
 * HARUS sama; kalau salah satunya diubah, yang lain ikut.
 */
const KOLOM_BATCH = 70;  // BS
const KOLOM_CABUT = 71;  // BT

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
    /* Kalimatnya menyebut SYARATNYA, bukan cuma anjuran.
       Versi sebelumnya berbunyi "Pakai email Google yang aktif", dan itu
       terbaca sebagai saran, bukan keharusan. Akibatnya ada yang mengisi
       alamat yang tidak pernah didaftarkan sebagai akun Google, lalu
       sampai di ruang kelas dan menemukan tombol masuknya tidak bisa
       ditekan sama sekali -- bukan ditolak dengan pesan, tapi memang
       tidak ada jalan masuk. Satu-satunya penyelesaian saat itu adalah
       lewat WhatsApp satu per satu.
       Mencegahnya di sini jauh lebih murah daripada menanganinya di
       belakang. Alamat non-Gmail tetap boleh: yang menentukan bukan
       domainnya, melainkan apakah alamat itu punya akun Google
       (@ui.ac.id lewat Workspace sudah terbukti jalan). */
    bantuan:
      'WAJIB email yang punya akun Google, karena ini yang dipakai masuk ruang kelas. ' +
      'Boleh selain Gmail (misalnya @ui.ac.id), asal alamatnya bisa dipakai login Google.',
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
// Nilai yang DITULIS ke spreadsheet. Tetap dipaku di sini, bukan diambil
// dari nama paket yang bisa diganti admin, supaya baris baru dan baris
// lama tetap bisa dibandingkan. Nama yang admin atur cuma mengubah apa
// yang DIBACA pendaftar di layar.
const PILIHAN_PAKET = [
  'Individual (1 student)',
  'Pair (2 students)',
  'Group (3 students)',
];

/**
 * ============================================================
 * TIGA SLOT PAKET, ISINYA BISA DIATUR, JUMLAHNYA TIDAK
 * ============================================================
 * Nama dan tersedia/tidaknya tiap paket diatur admin lewat kunci yang
 * SAMA dengan yang dipakai kartu harga di beranda (pkg1Name,
 * pkg1Available, dan seterusnya). Jadi mematikan satu paket di beranda
 * otomatis menghilangkannya juga dari formulir pendaftaran, tidak ada
 * dua tempat yang harus diingat.
 *
 * Yang TIDAK bisa diubah: jumlah slotnya, dan berapa orang per slot.
 * Angka itu bukan sekadar label -- 2 dan 3 menentukan isian peserta
 * mana yang muncul di formulir, kolom mana yang diisi di spreadsheet,
 * dan berapa kali harga dikalikan waktu menghitung pendapatan.
 */
// Aman dari import melingkar: site-defaults.js tidak me-require apa pun.
const DEFAULTS_PAKET = require('./site-defaults');

const PAKET_SLOT = [
  { id: 'individual', orang: 1, kunciNama: 'pkg1Name', kunciAktif: 'pkg1Available' },
  { id: 'pair', orang: 2, kunciNama: 'pkg2Name', kunciAktif: 'pkg2Available' },
  { id: 'group', orang: 3, kunciNama: 'pkg3Name', kunciAktif: 'pkg3Available' },
];

/**
 * Paket yang boleh dipilih pendaftar, sudah disaring yang dimatikan.
 * Bentuknya { id, nama, jumlah } -- id itu yang dikirim browser dan
 * disimpan server, nama cuma untuk dibaca manusia.
 */
function pilihanPaket(overrides) {
  const o = overrides || {};
  return PAKET_SLOT.filter((s) => o[s.kunciAktif] !== false).map((s, i) => ({
    id: s.id,
    nama:
      String(
        o[s.kunciNama] !== undefined ? o[s.kunciNama] : DEFAULTS_PAKET[s.kunciNama]
      ).trim() || s.id,
    jumlah: s.orang === 1 ? '1 orang' : s.orang + ' orang',
  }));
}

/**
 * Cocokkan nilai paket apa pun ke salah satu slot.
 *
 * Menerima tiga bentuk sekaligus, karena ketiganya benar-benar ada di
 * data: id yang dikirim formulir sekarang ("pair"), teks panjang yang
 * tersimpan di baris-baris lama ("Pair (2 students)"), dan nama karangan
 * admin yang mungkin dipakai sementara ("PAIR"). Semuanya dikenali lewat
 * kata intinya, bukan disamakan persis.
 */
function slotPaket(nilai) {
  const t = String(nilai || '').trim().toLowerCase();
  if (!t) return null;
  if (t.includes('individual') || t.includes('solo')) return PAKET_SLOT[0];
  if (t.includes('pair')) return PAKET_SLOT[1];
  if (t.includes('group')) return PAKET_SLOT[2];
  return null;
}

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
function validasiJawaban(fields, jawaban, overrides) {
  const aktif = fieldAktif(fields);
  const kurang = [];
  const slot = slotPaket(jawaban.paket);

  aktif.forEach((f) => {
    if (f.tipe === 'peserta') {
      // Isian peserta 2/3 cuma wajib sesuai paket yang dipilih.
      // Dinilai dari JUMLAH ORANG slotnya, bukan dari teks paketnya,
      // supaya nama paket yang diganti admin tidak mematikan aturan ini.
      const jumlahOrang = slot ? slot.orang : 0;
      if (jumlahOrang >= 2) {
        if (!teks(jawaban.p2Nama, 120)) kurang.push('nama peserta 2');
        if (!emailSah(jawaban.p2Email)) kurang.push('email peserta 2');
      }
      if (jumlahOrang >= 3) {
        if (!teks(jawaban.p3Nama, 120)) kurang.push('nama peserta 3');
        if (!emailSah(jawaban.p3Email)) kurang.push('email peserta 3');
      }
      return;
    }

    if (f.tipe === 'paket') {
      // Paket yang sedang DIMATIKAN admin ditolak juga, bukan cuma tidak
      // ditampilkan. Halaman bisa dibuka lama lalu dikirim setelah paketnya
      // ditutup, atau dikirim langsung ke endpoint tanpa membuka halaman.
      const boleh = pilihanPaket(overrides).some((p) => slot && p.id === slot.id);
      if (!boleh) kurang.push(f.label.toLowerCase());
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
  KOLOM_BERLAKU_SAMPAI,
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

    if (f.tipe === 'paket') {
      // Yang ditulis ke sheet adalah teks bakunya, BUKAN id yang dikirim
      // browser dan bukan nama karangan admin. Kolom ini dibaca banyak
      // tempat (statistik, pengecekan peserta, baris lama dari Google
      // Form), jadi isinya harus tetap satu bentuk sepanjang waktu walau
      // nama paketnya diganti-ganti di /admin.
      const s = slotPaket(jawaban[f.id]);
      baris[f.kolom] = s ? PILIHAN_PAKET[PAKET_SLOT.indexOf(s)] : '';
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
  const slotTerpilih = slotPaket(jawaban.paket);
  if (slotTerpilih && slotTerpilih.orang > 1) {
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

/**
 * Kebalikan susunBaris(): terjemahkan satu baris spreadsheet (array yang
 * indeksnya = kolom) kembali jadi nilai bernama, supaya bisa ditampilkan
 * di halaman /pendaftar.
 *
 * Ini HARUS ada karena Apps Script sengaja dibuat tidak tahu apa-apa soal
 * isi formulir -- dia cuma mengirim baris mentah. Penerjemahannya
 * dilakukan di sini, di tempat yang sama dengan penulisannya, supaya
 * keduanya tidak mungkin berbeda pendapat soal kolom mana artinya apa.
 *
 * Pernah tidak ada, dan akibatnya seluruh kartu di /pendaftar tampil
 * "(tanpa nama)" tanpa satu pun data: barisnya tersimpan benar di
 * spreadsheet, tapi tidak ada yang menerjemahkannya kembali.
 */
function bacaBaris(fields, baris) {
  const arr = Array.isArray(baris) ? baris : [];
  const ambil = (i) => String(arr[i] === undefined || arr[i] === null ? '' : arr[i]).trim();
  const semua = normalisasiFields(fields);

  const hasil = {
    timestamp: ambil(KOLOM.timestamp),
    // Kolom H/I/J berisi data pendaftar itu sendiri (blok Person 1 di
    // sheet lama). Dibaca terpisah karena bukan milik field mana pun.
    namaDiri: ambil(KOLOM.namaDiri),
    teleponDiri: ambil(KOLOM.teleponDiri),
    p2Nama: ambil(KOLOM.p2Nama),
    p2Telepon: ambil(KOLOM.p2Telepon),
    p2Email: ambil(KOLOM.p2Email),
    p3Nama: ambil(KOLOM.p3Nama),
    p3Telepon: ambil(KOLOM.p3Telepon),
    p3Email: ambil(KOLOM.p3Email),
    // Jawaban pertanyaan buatan admin, dibawa lengkap dengan labelnya
    // supaya /pendaftar bisa menampilkannya tanpa perlu tahu ada
    // pertanyaan apa saja.
    tambahan: [],
  };

  semua.forEach((f) => {
    if (f.tipe === 'peserta') return; // sudah dibaca di atas
    const nilai = ambil(f.kolom);
    hasil[f.id] = nilai;

    // Field bawaan punya tempatnya sendiri di kartu /pendaftar; yang
    // buatan admin dikumpulkan terpisah supaya ikut tampil juga.
    const bawaan = FIELD_BAWAAN.some((b) => b.id === f.id);
    if (!bawaan && nilai) hasil.tambahan.push({ label: f.label, nilai: nilai });
  });

  // Email pendaftar bisa berada di kolom J (data dirinya) atau kolom M
  // (blok Person 1) tergantung paketnya. Diambil mana pun yang terisi,
  // karena inilah email yang menentukan dia bisa masuk kelas atau tidak.
  if (!hasil.emailDiri) hasil.emailDiri = ambil(KOLOM.p1Email);
  if (!hasil.nama) hasil.nama = hasil.namaDiri || ambil(KOLOM.p1Nama);

  return hasil;
}

module.exports = {
  FIELD_BAWAAN,
  PAKET_SLOT,
  pilihanPaket,
  slotPaket,
  bacaBaris,
  PILIHAN_PAKET,
  KOLOM,
  KOLOM_TAMBAHAN_MULAI,
  KOLOM_BERLAKU_SAMPAI,
  KOLOM_BATCH,
  KOLOM_CABUT,
  TIPE_SAH,
  MAKS_FIELD,
  normalisasiFields,
  fieldAktif,
  validasiJawaban,
  susunBaris,
  emailSah,
};
