/**
 * Batch (angkatan): membuka, menutup, dan mencocokkan baris roster ke
 * batch-nya.
 *
 * ------------------------------------------------------------
 * YANG TIDAK DILAKUKAN FILE INI
 * ------------------------------------------------------------
 * File ini TIDAK menentukan siapa boleh masuk ruang kelas. Itu tetap
 * milik api/_lib/roster.js sendirian, dan aturannya tidak berubah sama
 * sekali: sebuah baris kehilangan akses kalau ada sel berisi persis kata
 * "done", atau kalau tanggal di kolom W sudah lewat.
 *
 * Batch cuma menumpang dua hal yang sudah ada itu:
 *   - "Cabut akses batch" = menulis "done" di tiap baris anggotanya,
 *     penanda yang sama yang selama ini diketik manual di spreadsheet.
 *   - "Tanggal berakhir batch" = nilai yang disalin ke kolom W waktu
 *     seseorang disetujui masuk batch tersebut.
 *
 * Artinya kalau seluruh fitur ini dimatikan besok, gerbang kelasnya
 * berperilaku persis seperti sebelum fitur ini ada. Itu disengaja:
 * menambah cara baru untuk kehilangan akses berarti menambah cara baru
 * bagi orang yang sudah bayar untuk terkunci di luar.
 *
 * ------------------------------------------------------------
 * SATU BATCH TERBUKA PADA SATU WAKTU
 * ------------------------------------------------------------
 * "Terbuka" di sini artinya MENERIMA ANGGOTA BARU, bukan "aksesnya
 * hidup". Anggota batch yang sudah ditutup tetap bisa masuk kelas sampai
 * aksesnya dicabut atau tanggalnya lewat -- itu justru gunanya menutup:
 * mengunci daftar anggotanya supaya persetujuan berikutnya masuk ke
 * batch baru.
 */

const KODE_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function teks(nilai, maks) {
  return String(nilai === undefined || nilai === null ? '' : nilai)
    .trim()
    .slice(0, maks || 80);
}

/**
 * Tanggal hanya diterima kalau bentuknya benar-benar dikenali.
 *
 * Nilai setengah jadi di kolom W lebih berbahaya daripada kolom kosong:
 * roster.js mengabaikan yang tidak terbaca (gagal terbuka), jadi
 * "31/03/2027" akan terlihat seperti batas waktu terpasang padahal tidak
 * pernah berlaku, dan tidak ada yang tahu sampai ada yang memeriksa.
 */
function tanggalSah(nilai) {
  // SENGAJA tidak memakai teks() yang memotong panjang. Memotong dulu
  // baru memeriksa berarti "2027-03-31T00:00" terpotong jadi
  // "2027-03-31" dan lolos sebagai tanggal yang sah -- nilai yang tidak
  // pernah dimaksudkan siapa pun, diam-diam diterima. Yang diperiksa
  // harus SELURUH isinya.
  const bersih = String(nilai === undefined || nilai === null ? '' : nilai).trim();
  if (!KODE_TANGGAL.test(bersih)) return '';
  const [thn, bln, tgl] = bersih.split('-').map(Number);
  if (bln < 1 || bln > 12 || tgl < 1 || tgl > 31) return '';
  // Tanggal seperti 2026-02-31 lolos pemeriksaan rentang di atas tapi
  // tidak ada di kalender. Date membetulkannya diam-diam jadi 3 Maret,
  // jadi hasilnya dibandingkan balik untuk menangkap itu.
  const d = new Date(Date.UTC(thn, bln - 1, tgl));
  if (d.getUTCMonth() !== bln - 1 || d.getUTCDate() !== tgl) return '';
  return bersih;
}

/**
 * Stempel waktu penuh (ISO) untuk rentang perhitungan pendapatan.
 *
 * Balik null, bukan string kosong, karena null di sini PUNYA ARTI:
 * `mulai: null` berarti "hitung sejak awal" dan `selesai: null` berarti
 * "masih berjalan". String kosong akan diperlakukan sama oleh pembanding
 * tanggal, tapi tidak terbaca sebagai keputusan waktu dibaca orang.
 */
function stempelSah(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return null;
  const d = new Date(nilai);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

const MAKS_BATCH = 60;

/**
 * Bersihkan daftar batch yang dibaca dari Global Config.
 *
 * Isinya bisa saja rusak (ditulis manual lewat dashboard Vercel, sisa
 * versi lama, dll), dan halaman admin tidak boleh ikut rusak karenanya.
 * Yang tidak bisa diselamatkan dibuang, bukan bikin seluruh halaman
 * gagal dimuat.
 */
function normalisasiBatch(masukan) {
  if (!Array.isArray(masukan)) return [];

  const hasil = [];
  const idTerpakai = new Set();

  masukan.slice(0, MAKS_BATCH).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    const id = teks(b.id, 40);
    const nama = teks(b.nama, 60);
    // Batch tanpa id atau nama tidak bisa dirujuk maupun ditampilkan.
    if (!id || !nama || idTerpakai.has(id)) return;
    idTerpakai.add(id);

    hasil.push({
      id,
      nama,
      // Rentang waktu untuk perhitungan pendapatan di /analitik. Stempel
      // waktu penuh, bukan tanggal, karena batch bisa dibuka dan ditutup
      // di hari yang sama dan barisnya dibandingkan per stempel waktu.
      //
      // mulai null berarti "hitung sejak awal". Cuma masuk akal untuk
      // batch PERTAMA: kalau ia dimulai dari sekarang, semua pendaftar
      // yang sudah ada tidak masuk batch mana pun dan hilang dari
      // rincian pendapatan.
      mulai: stempelSah(b.mulai),
      // selesai null berarti masih menerima anggota. Inilah satu-satunya
      // penanda terbuka/tertutup -- sengaja TIDAK ada field `tertutup`
      // terpisah, karena dua penanda untuk satu keadaan cepat atau
      // lambat akan berselisih dan tidak ada yang tahu mana yang benar.
      selesai: stempelSah(b.selesai),
      // Kapan akses ruang kelas anggotanya mati. BEDA dari `selesai`:
      // batch berhenti menerima anggota jauh lebih dulu daripada
      // aksesnya berakhir (di sini sekitar enam bulan). Nilai inilah
      // yang disalin ke kolom W tiap orang yang disetujui.
      aksesBerakhir: tanggalSah(b.aksesBerakhir),
    });
  });

  // Hanya SATU yang boleh terbuka. Kalau ternyata ada beberapa (config
  // disunting manual, dua tab admin menekan tombol bersamaan, atau
  // penulisan yang gagal separuh jalan), yang dipertahankan yang PALING
  // BELAKANG -- itu yang paling mungkin baru saja dibuka, dan menutup
  // yang lain lebih aman daripada membiarkan persetujuan jatuh ke batch
  // yang tidak terduga.
  const terbuka = hasil.map((b, i) => (b.selesai ? -1 : i)).filter((i) => i !== -1);
  if (terbuka.length > 1) {
    const penutup = new Date().toISOString();
    terbuka.slice(0, -1).forEach((i) => {
      hasil[i].selesai = penutup;
    });
  }

  return hasil;
}

/**
 * Daftar batch yang tersimpan, DENGAN migrasi dari bentuk lama.
 *
 * Sebelum ini ada dua daftar batch yang hidup berdampingan tanpa saling
 * tahu: `batchDaftar` yang ditulis tombol di /analitik (dipakai untuk
 * memisahkan pendapatan per angkatan), dan `batchList` yang ditulis
 * /batch. Keduanya berarti "angkatan", tapi bisa berisi hal yang
 * berbeda, dan tidak ada yang memberi tahu kalau keduanya berselisih.
 *
 * Sekarang `batchList` jadi satu-satunya yang ditulis. `batchDaftar`
 * TIDAK dihapus dan tetap dibaca di sini sebagai asal migrasi, supaya
 * riwayat pendapatan per batch yang sudah terlanjur tercatat tidak
 * hilang begitu fitur ini menyala. Begitu ada penulisan pertama ke
 * `batchList`, nilai lama itu berhenti dipakai dengan sendirinya.
 */
function daftarTersimpan(overrides) {
  const o = overrides || {};
  if (Array.isArray(o.batchList) && o.batchList.length > 0) {
    return normalisasiBatch(o.batchList);
  }
  if (Array.isArray(o.batchDaftar) && o.batchDaftar.length > 0) {
    return normalisasiBatch(
      o.batchDaftar.map((b, i) => ({
        // Bentuk lama tidak punya id. Dibuat dari posisinya, bukan dari
        // waktu, supaya migrasi yang dijalankan dua kali menghasilkan id
        // yang sama persis dan tidak menggandakan batch.
        id: 'lama-' + i,
        nama: (b && b.nama) || 'Batch ' + (i + 1),
        mulai: b && b.mulai,
        selesai: b && b.selesai,
        // Bentuk lama tidak punya tanggal berakhirnya akses. Dikosongkan,
        // yang berarti anggotanya tidak dibatasi waktu -- sama persis
        // dengan perilaku mereka sebelum migrasi ini.
        aksesBerakhir: '',
      }))
    );
  }
  return [];
}

function batchAktif(daftar) {
  return normalisasiBatch(daftar).find((b) => !b.selesai) || null;
}

/**
 * Nama bawaan untuk batch berikutnya: "Batch N", N dihitung dari yang
 * paling besar yang pernah dipakai.
 *
 * Dihitung dari NAMA, bukan dari jumlah batch. Kalau ada batch yang
 * pernah dihapus, menghitung dari jumlah akan memakai ulang nomor yang
 * sudah pernah ada, dan dua "Batch 3" di riwayat jauh lebih
 * membingungkan daripada nomor yang melompat.
 */
function namaBatchBerikutnya(daftar) {
  let tertinggi = 0;
  normalisasiBatch(daftar).forEach((b) => {
    const cocok = /(\d+)\s*$/.exec(b.nama);
    if (!cocok) return;
    const n = Number(cocok[1]);
    if (Number.isFinite(n) && n > tertinggi) tertinggi = n;
  });
  return 'Batch ' + (tertinggi + 1);
}

function buatId(daftar, sekarang) {
  const dasar = 'b' + (Number.isFinite(sekarang) ? sekarang : Date.now()).toString(36);
  const dipakai = new Set(normalisasiBatch(daftar).map((b) => b.id));
  if (!dipakai.has(dasar)) return dasar;
  let n = 2;
  while (dipakai.has(dasar + '-' + n)) n++;
  return dasar + '-' + n;
}

/**
 * Buka batch baru. Yang sedang terbuka otomatis ikut tertutup, karena
 * hanya boleh ada satu yang menerima anggota baru.
 *
 * Balikannya daftar BARU, bukan daftar lama yang disunting di tempat --
 * pemanggilnya menyimpan hasilnya ke Global Config, dan menyunting di
 * tempat membuat kegagalan penyimpanan menyisakan state yang sudah
 * terlanjur berubah di memori.
 */
function bukaBatch(daftar, opsi) {
  const o = opsi || {};
  const sekarang = stempelSah(o.sekarang ? new Date(o.sekarang) : new Date());
  // Yang sedang terbuka ikut ditutup pada detik yang sama batch baru
  // dibuka, supaya rentang pendapatan keduanya bersambung tanpa celah
  // dan tanpa tumpang tindih.
  const bersih = normalisasiBatch(daftar).map((b) =>
    b.selesai ? b : Object.assign({}, b, { selesai: sekarang })
  );
  const nama = teks(o.nama, 60) || namaBatchBerikutnya(bersih);

  if (bersih.some((b) => b.nama.toLowerCase() === nama.toLowerCase())) {
    return { ok: false, reason: 'nama_sudah_dipakai' };
  }
  if (bersih.length >= MAKS_BATCH) {
    return { ok: false, reason: 'terlalu_banyak_batch' };
  }

  const baru = {
    id: buatId(bersih, o.sekarang),
    nama,
    // Batch PERTAMA sengaja tanpa tanggal awal: null berarti menghitung
    // sejak awal. Kalau ia dimulai dari sekarang, semua pendaftar yang
    // sudah terlanjur ada tidak masuk batch mana pun dan lenyap dari
    // rincian pendapatan di /analitik. Aturan ini diwarisi apa adanya
    // dari tombol lama di halaman itu.
    mulai: bersih.length === 0 ? null : sekarang,
    selesai: null,
    aksesBerakhir: tanggalSah(o.aksesBerakhir),
  };

  return { ok: true, daftar: bersih.concat([baru]), batch: baru };
}

function tutupBatch(daftar, id, sekarang) {
  const bersih = normalisasiBatch(daftar);
  const target = bersih.find((b) => b.id === teks(id, 40));
  if (!target) return { ok: false, reason: 'batch_tidak_ketemu' };
  if (target.selesai) return { ok: false, reason: 'batch_sudah_tertutup' };

  const stempel = stempelSah(sekarang ? new Date(sekarang) : new Date());
  return {
    ok: true,
    daftar: bersih.map((b) => (b.id === target.id ? Object.assign({}, b, { selesai: stempel }) : b)),
  };
}

/**
 * Ganti nama satu batch.
 *
 * Ada di sini, bukan di /analitik seperti dulu, karena seluruh
 * pengelolaan batch sekarang satu pintu. Namanya dipakai DUA kali: di
 * layar, dan sebagai isi kolom BS di tiap baris anggotanya.
 *
 * Yang penting dipahami: mengganti nama TIDAK menulis ulang kolom BS
 * baris-baris yang sudah terlanjur diberi label nama lama. Menulis ulang
 * puluhan baris demi kosmetik menukar risiko yang besar dengan manfaat
 * yang kecil, dan kegagalan separuh jalan akan memecah satu batch jadi
 * dua kelompok yang namanya beda. Pemanggil yang memutuskan apa yang
 * dilakukan terhadap anggota lama -- lihat handler-batch.js.
 */
function gantiNamaBatch(daftar, id, namaBaru) {
  const bersih = normalisasiBatch(daftar);
  const target = bersih.find((b) => b.id === teks(id, 40));
  if (!target) return { ok: false, reason: 'batch_tidak_ketemu' };

  const nama = teks(namaBaru, 60);
  if (!nama) return { ok: false, reason: 'nama_kosong' };
  if (bersih.some((b) => b.id !== target.id && b.nama.toLowerCase() === nama.toLowerCase())) {
    return { ok: false, reason: 'nama_sudah_dipakai' };
  }

  return {
    ok: true,
    namaLama: target.nama,
    daftar: bersih.map((b) => (b.id === target.id ? Object.assign({}, b, { nama }) : b)),
  };
}

/**
 * Label batch untuk satu baris roster, dari kolom BS.
 *
 * Baris yang kolomnya kosong TIDAK dianggap milik batch mana pun.
 * Itu keadaan yang wajar, bukan kesalahan: semua baris yang masuk
 * sebelum fitur ini ada (Google Form lama dan sheet manual) memang tidak
 * punya label, dan halaman /batch menampilkannya sebagai satu kelompok
 * tersendiri.
 */
function labelBatchBaris(isi, kolomBatch) {
  if (!Array.isArray(isi)) return '';
  return teks(isi[kolomBatch], 60);
}

module.exports = {
  normalisasiBatch,
  daftarTersimpan,
  batchAktif,
  gantiNamaBatch,
  stempelSah,
  namaBatchBerikutnya,
  bukaBatch,
  tutupBatch,
  labelBatchBaris,
  tanggalSah,
  MAKS_BATCH,
};
