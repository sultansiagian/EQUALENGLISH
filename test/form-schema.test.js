const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  susunBaris,
  bacaBaris,
  validasiJawaban,
  normalisasiFields,
  fieldAktif,
  pilihanPaket,
} = require('../api/_lib/form-schema');

/**
 * ============================================================
 * KENAPA BERKAS INI ADA
 * ============================================================
 *
 * form-schema.js memetakan jawaban ke kolom spreadsheet. Salahnya SUNYI:
 * barisnya tetap tersimpan, situsnya tetap jalan, tidak ada error di mana
 * pun. Yang terjadi cuma data mendarat di kolom yang salah, dan komentar
 * di berkas aslinya sudah menyebut skenario terburuknya sendiri: email
 * bisa pindah ke kolom yang tidak dibaca sistem akses, dan itu baru
 * ketahuan berhari-hari kemudian waktu ada siswa yang tidak bisa login.
 *
 * Karena itu tes yang paling penting di sini bukan tes satu fungsi,
 * melainkan tes BOLAK-BALIK: apa pun yang ditulis susunBaris() harus
 * terbaca kembali utuh oleh bacaBaris(). Selama keduanya sepakat, kolom
 * boleh bergeser tanpa merusak apa pun; begitu tidak sepakat, tes ini
 * gagal jauh sebelum ada siswa yang terkunci di luar.
 */

const JAWABAN_GROUP = {
  nama: 'Sultan Siagian',
  fakultas: 'Fasilkom',
  telepon: '081234567890',
  idLine: 'sultan.s',
  emailDiri: 'sultan@ui.ac.id',
  paket: 'group',
  p2Nama: 'Rani Putri',
  p2Telepon: '081200000002',
  p2Email: 'rani@ui.ac.id',
  p3Nama: 'Bagus Wicaksono',
  p3Telepon: '081200000003',
  p3Email: 'bagus@ui.ac.id',
};

const LINK = {
  buktiBayar: 'https://drive.google.com/file/d/aaa/view',
  buktiBroadcast: 'https://drive.google.com/file/d/bbb/view',
  buktiInstagram: 'https://drive.google.com/file/d/ccc/view',
};

describe('susunBaris lalu bacaBaris: bolak-balik', () => {
  test('semua jawaban terbaca kembali dengan nilai yang sama', () => {
    const baris = susunBaris(undefined, JAWABAN_GROUP, LINK, '08/25/2026 10:00:00');
    const kembali = bacaBaris(undefined, baris);

    assert.strictEqual(kembali.nama, JAWABAN_GROUP.nama);
    assert.strictEqual(kembali.fakultas, JAWABAN_GROUP.fakultas);
    assert.strictEqual(kembali.telepon, JAWABAN_GROUP.telepon);
    assert.strictEqual(kembali.idLine, JAWABAN_GROUP.idLine);
    assert.strictEqual(kembali.p2Nama, JAWABAN_GROUP.p2Nama);
    assert.strictEqual(kembali.p2Email, JAWABAN_GROUP.p2Email);
    assert.strictEqual(kembali.p3Nama, JAWABAN_GROUP.p3Nama);
    assert.strictEqual(kembali.p3Email, JAWABAN_GROUP.p3Email);
  });

  test('EMAIL PENDAFTAR selalu terbaca kembali, ini yang menentukan akses kelas', () => {
    // Diuji untuk KETIGA paket, karena susunBaris menulis email ke kolom
    // yang berbeda tergantung paketnya (kolom J selalu, kolom M cuma
    // kalau pesertanya lebih dari satu). Kalau salah satu jalur itu
    // rusak, orangnya terdaftar tapi tidak pernah bisa masuk.
    for (const paket of ['individual', 'pair', 'group']) {
      const baris = susunBaris(
        undefined,
        Object.assign({}, JAWABAN_GROUP, { paket }),
        LINK,
        '08/25/2026 10:00:00'
      );
      const kembali = bacaBaris(undefined, baris);
      assert.strictEqual(
        kembali.emailDiri,
        'sultan@ui.ac.id',
        'email hilang pada paket ' + paket
      );
    }
  });

  test('timestamp mendarat di kolom A', () => {
    const baris = susunBaris(undefined, JAWABAN_GROUP, LINK, '08/25/2026 10:00:00');
    assert.strictEqual(baris[0], '08/25/2026 10:00:00');
    assert.strictEqual(bacaBaris(undefined, baris).timestamp, '08/25/2026 10:00:00');
  });

  test('link bukti bayar ikut ditulis ke kolom B yang lama', () => {
    // Kolom B sudah dipakai memeriksa bukti bayar sejak sebelum form ini
    // ada. Kalau berhenti terisi, kebiasaan lama itu diam-diam rusak.
    const baris = susunBaris(undefined, JAWABAN_GROUP, LINK, 'x');
    assert.strictEqual(baris[1], LINK.buktiBayar);
  });
});

describe('kolom tidak boleh bergeser', () => {
  test('memindah urutan tampilan TIDAK memindah kolom penyimpanan', () => {
    const bawaan = normalisasiFields(undefined);
    // Balik urutan tampilannya sepenuhnya, persis yang bisa dilakukan
    // admin lewat /admin.
    const dibalik = bawaan.map((f, i) => Object.assign({}, f, { urutan: bawaan.length - i }));

    const barisAsli = susunBaris(bawaan, JAWABAN_GROUP, LINK, 'x');
    const barisDibalik = susunBaris(dibalik, JAWABAN_GROUP, LINK, 'x');

    assert.deepStrictEqual(
      barisDibalik,
      barisAsli,
      'urutan tampilan berubah dan isi kolomnya ikut bergeser -- data lama di ' +
        'spreadsheet akan salah kolom'
    );
  });

  test('field inti tidak bisa dihapus lewat susunan yang dikirim admin', () => {
    // Kalau email atau paket bisa dihilangkan, semua pendaftar
    // berikutnya tidak akan pernah bisa masuk kelas.
    const tanpaApaPun = normalisasiFields([]);
    const id = tanpaApaPun.map((f) => f.id);
    assert.ok(id.includes('emailDiri'), 'field email hilang');
    assert.ok(id.includes('paket'), 'field paket hilang');
    assert.ok(id.includes('peserta'), 'field peserta hilang');
  });
});

describe('paket ditulis sebagai teks baku', () => {
  test('nama paket karangan admin tidak ikut masuk ke sheet', () => {
    // Kolom paket dibaca statistik dan pengecekan peserta. Isinya harus
    // satu bentuk sepanjang waktu walau namanya diganti-ganti di /admin.
    const overrides = { pkg3Name: 'Paket Rame-Rame Diskon' };
    const baris = susunBaris(undefined, JAWABAN_GROUP, LINK, 'x');
    const kembali = bacaBaris(undefined, baris);
    assert.ok(
      !/Rame-Rame/.test(kembali.paket),
      'nama karangan admin bocor ke kolom paket: ' + kembali.paket
    );
    assert.ok(kembali.paket.length > 0, 'kolom paket malah kosong');
    void overrides;
  });

  test('paket yang tidak dikenal jadi kosong, bukan disimpan mentah', () => {
    const baris = susunBaris(
      undefined,
      Object.assign({}, JAWABAN_GROUP, { paket: 'paket-karangan' }),
      LINK,
      'x'
    );
    assert.strictEqual(bacaBaris(undefined, baris).paket, '');
  });
});

describe('validasiJawaban', () => {
  // Bukti pembayaran adalah field wajib bertipe upload, jadi jawaban yang
  // dianggap lengkap harus membawanya juga. Nilainya berupa data URL,
  // sama seperti yang dikirim daftar.js setelah mengompres fotonya.
  const FOTO = 'data:image/webp;base64,UklGRhoAAABXRUJQ';
  const LENGKAP = Object.assign({}, JAWABAN_GROUP, { buktiBayar: FOTO });

  test('jawaban lengkap paket group lolos', () => {
    assert.deepStrictEqual(validasiJawaban(undefined, LENGKAP, {}), []);
  });

  test('paket individual tidak menuntut data teman', () => {
    const individual = {
      nama: 'Sultan', fakultas: 'Fasilkom', telepon: '0812',
      emailDiri: 'sultan@ui.ac.id', paket: 'individual', buktiBayar: FOTO,
    };
    assert.deepStrictEqual(validasiJawaban(undefined, individual, {}), []);
  });

  test('bukti pembayaran yang belum diunggah ditolak', () => {
    const tanpaBukti = Object.assign({}, LENGKAP, { buktiBayar: '' });
    assert.ok(validasiJawaban(undefined, tanpaBukti, {}).length > 0);
  });

  test('paket group menuntut email teman', () => {
    const kurang = Object.assign({}, LENGKAP, { p3Email: '' });
    assert.ok(validasiJawaban(undefined, kurang, {}).length > 0);
  });

  test('email tanpa @ ditolak', () => {
    const salah = Object.assign({}, LENGKAP, { emailDiri: 'bukan-email' });
    assert.ok(validasiJawaban(undefined, salah, {}).length > 0);
  });

  test('paket yang sedang dimatikan admin ditolak', () => {
    // Menyembunyikan kartunya di beranda tidak menjaga apa pun kalau
    // server masih mau menerima pilihan itu.
    const hasil = validasiJawaban(undefined, LENGKAP, { pkg3Available: false });
    assert.ok(hasil.length > 0, 'paket yang dimatikan tetap diterima');
  });
});

describe('fieldAktif dan pilihanPaket', () => {
  test('field yang dimatikan tidak ikut dikirim ke browser', () => {
    const semua = normalisasiFields(undefined);
    const dimatikan = semua.map((f) =>
      f.id === 'idLine' ? Object.assign({}, f, { aktif: false }) : f
    );
    const aktif = fieldAktif(dimatikan).map((f) => f.id);
    assert.ok(!aktif.includes('idLine'));
  });

  test('paket yang dimatikan tidak ikut ditawarkan', () => {
    const tersedia = pilihanPaket({ pkg2Available: false }).map((p) => p.id);
    assert.ok(!tersedia.includes('pair'));
    assert.ok(tersedia.includes('individual'));
  });
});
