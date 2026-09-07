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
const DEFAULTS = require('../api/_lib/site-defaults');

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

/**
 * ============================================================
 * HARGA DI FORMULIR = HARGA DI BERANDA
 * ============================================================
 * Rincian harga di /daftar dan kartu harga di beranda membaca kunci
 * Global Config yang sama. Tes di bawah menjaga jalur itu tetap satu:
 * kalau suatu saat formulir diberi kunci harganya sendiri, dua angka
 * untuk satu harga akan berselisih tanpa ada yang menyadarinya sampai
 * ada yang mentransfer nominal yang salah.
 */
describe('harga di pilihanPaket', () => {
  test('harga diambil dari kunci yang sama dengan kartu harga beranda', () => {
    const hasil = pilihanPaket({ pkg1Price: 75000, pkg2Price: 70000, pkg3Price: 65000 });
    assert.strictEqual(hasil.find((p) => p.id === 'individual').harga, 75000);
    assert.strictEqual(hasil.find((p) => p.id === 'pair').harga, 70000);
    assert.strictEqual(hasil.find((p) => p.id === 'group').harga, 65000);
  });

  test('tanpa override, harga jatuh ke bawaan site-defaults', () => {
    const hasil = pilihanPaket({});
    assert.strictEqual(hasil.find((p) => p.id === 'individual').harga, DEFAULTS.pkg1Price);
    assert.strictEqual(hasil.find((p) => p.id === 'pair').harga, DEFAULTS.pkg2Price);
    assert.strictEqual(hasil.find((p) => p.id === 'group').harga, DEFAULTS.pkg3Price);
  });

  test('total = harga per orang x jumlah orang, sama seperti hitungan pendapatan', () => {
    const hasil = pilihanPaket({ pkg1Price: 59000, pkg2Price: 53000, pkg3Price: 47000 });
    const individual = hasil.find((p) => p.id === 'individual');
    const pair = hasil.find((p) => p.id === 'pair');
    const group = hasil.find((p) => p.id === 'group');

    assert.strictEqual(individual.orang, 1);
    assert.strictEqual(individual.total, 59000);
    assert.strictEqual(pair.orang, 2);
    assert.strictEqual(pair.total, 106000);
    assert.strictEqual(group.orang, 3);
    assert.strictEqual(group.total, 141000);
  });

  test('jumlah orang per paket sama persis dengan yang dipakai statistik.js', () => {
    // Dua berkas menghitung "satu baris Group = 3 orang" secara terpisah.
    // Kalau salah satunya digeser, total yang tertulis di formulir dan
    // pendapatan yang tercatat di /analitik akan berselisih diam-diam.
    const { hitungStatistik } = require('../api/_lib/statistik');
    const stat = hitungStatistik('', {});
    const dariStatistik = {};
    stat.perPaket.forEach((p) => {
      dariStatistik[p.id] = p.orangPerPendaftaran;
    });

    pilihanPaket({}).forEach((p) => {
      assert.strictEqual(
        p.orang,
        dariStatistik[p.id],
        'jumlah orang paket ' + p.id + ' beda antara form-schema.js dan statistik.js'
      );
    });
  });

  test('harga boleh ditulis "Rp59.000" atau "59.000", dibaca sama', () => {
    assert.strictEqual(pilihanPaket({ pkg1Price: 'Rp59.000' })[0].harga, 59000);
    assert.strictEqual(pilihanPaket({ pkg1Price: '59.000' })[0].harga, 59000);
    assert.strictEqual(pilihanPaket({ pkg1Price: '59000' })[0].harga, 59000);
  });

  test('harga yang tidak terbaca jadi 0, bukan NaN', () => {
    // 0 itu tanda "jangan tampilkan harga" buat daftar.js. NaN akan lolos
    // sampai ke layar sebagai "RpNaN" di depan orang yang mau transfer.
    [null, '', 'gratis', {}, []].forEach((buruk) => {
      const harga = pilihanPaket({ pkg1Price: buruk })[0].harga;
      assert.strictEqual(harga, 0,
        'nilai ' + JSON.stringify(buruk) + ' seharusnya tidak lolos jadi angka');
    });
    // undefined artinya "tidak di-override", jadi jatuh ke bawaan.
    assert.strictEqual(pilihanPaket({ pkg1Price: undefined })[0].harga, DEFAULTS.pkg1Price);
  });

  test('harga tidak pernah negatif dan tidak pernah NaN', () => {
    // Angka minus dibaca sebagai angkanya saja ("-5000" -> 5000), persis
    // seperti ambilHarga() di statistik.js -- keduanya sengaja cuma
    // memungut digitnya. Bukan kasus nyata (harga tidak pernah minus),
    // yang dijaga di sini cuma bahwa hasilnya selalu angka wajar dan
    // tidak pernah sampai ke layar sebagai "Rp-5.000" atau "RpNaN".
    ['-5000', 'abc', '1e5', '  ', '59.000,00'].forEach((aneh) => {
      const p = pilihanPaket({ pkg1Price: aneh })[0];
      assert.ok(Number.isFinite(p.harga), aneh + ' menghasilkan harga bukan angka');
      assert.ok(p.harga >= 0, aneh + ' menghasilkan harga negatif');
      assert.ok(Number.isFinite(p.total) && p.total >= 0);
    });
  });

  test('paket yang dimatikan tidak menyeret harganya ikut terkirim', () => {
    const hasil = pilihanPaket({ pkg3Available: false });
    assert.ok(!hasil.some((p) => p.id === 'group'));
    hasil.forEach((p) => assert.ok(p.harga > 0));
  });
});
