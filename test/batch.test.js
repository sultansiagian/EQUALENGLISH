const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalisasiBatch,
  batchAktif,
  bukaBatch,
  tutupBatch,
  namaBatchBerikutnya,
  labelBatchBaris,
  tanggalSah,
  daftarTersimpan,
  gantiNamaBatch,
  stempelSah,
  aturTanggalBatch,
} = require('../api/_lib/batch');
const { KOLOM_BATCH, KOLOM_CABUT, KOLOM_BERLAKU_SAMPAI, KOLOM_TAMBAHAN_MULAI, MAKS_FIELD } =
  require('../api/_lib/form-schema');

/**
 * ============================================================
 * KENAPA BERKAS INI ADA
 * ============================================================
 *
 * batch.js tidak menentukan siapa boleh masuk kelas -- itu roster.js.
 * Tapi dia menentukan dua hal yang MENGALIR KE SANA: tanggal apa yang
 * ditulis ke kolom W waktu seseorang disetujui, dan baris mana yang
 * ditandai "done" waktu satu batch dicabut.
 *
 * Dua kesalahan yang paling mahal di sini, dan dua-duanya sunyi:
 *
 *   1. Lebih dari satu batch terbuka sekaligus. Persetujuan berikutnya
 *      jatuh ke batch yang tidak terduga, dan orangnya ikut tercabut
 *      waktu batch yang salah dibersihkan.
 *   2. Tanggal setengah jadi lolos ke kolom W. roster.js mengabaikan
 *      tanggal yang tidak terbaca, jadi hasilnya TERLIHAT seperti batas
 *      waktu terpasang padahal tidak pernah berlaku.
 *
 * Keduanya tidak memunculkan error di mana pun, jadi yang bisa
 * menangkapnya cuma tes.
 */

describe('normalisasiBatch', () => {
  test('membuang isi yang tidak bisa diselamatkan, bukan melempar error', () => {
    const hasil = normalisasiBatch([
      null,
      'bukan objek',
      { nama: 'Tanpa id' },
      { id: 'a' },
      { id: 'b1', nama: 'Batch 1', selesai: '2026-08-01T00:00:00.000Z' },
    ]);
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(hasil[0].id, 'b1');
  });

  test('bukan array -> daftar kosong', () => {
    assert.deepStrictEqual(normalisasiBatch(undefined), []);
    assert.deepStrictEqual(normalisasiBatch({ id: 'b1' }), []);
  });

  test('id kembar dibuang, yang pertama menang', () => {
    const hasil = normalisasiBatch([
      { id: 'b1', nama: 'Asli' },
      { id: 'b1', nama: 'Kembar' },
    ]);
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(hasil[0].nama, 'Asli');
  });

  test('kalau ada beberapa batch terbuka, sisakan yang PALING BELAKANG', () => {
    const hasil = normalisasiBatch([
      { id: 'b1', nama: 'Batch 1', selesai: null },
      { id: 'b2', nama: 'Batch 2', selesai: null },
      { id: 'b3', nama: 'Batch 3', selesai: null },
    ]);
    assert.deepStrictEqual(
      hasil.map((b) => Boolean(b.selesai)),
      [true, true, false]
    );
  });

  test('tanggal yang tidak terbaca dikosongkan, tidak diteruskan apa adanya', () => {
    const hasil = normalisasiBatch([
      { id: 'b1', nama: 'Batch 1', aksesBerakhir: '31/03/2027', mulai: '2026-09-01T00:00:00.000Z' },
    ]);
    assert.strictEqual(hasil[0].aksesBerakhir, '');
    assert.strictEqual(hasil[0].mulai, '2026-09-01T00:00:00.000Z');
  });
});

describe('tanggalSah', () => {
  test('menerima bentuk yang benar', () => {
    assert.strictEqual(tanggalSah('2027-03-31'), '2027-03-31');
  });

  test('menolak bentuk lain', () => {
    ['31/03/2027', '2027-3-31', '2027-03-31T00:00', 'besok', '', null].forEach((v) => {
      assert.strictEqual(tanggalSah(v), '', 'harusnya ditolak: ' + v);
    });
  });

  test('menolak tanggal yang tidak ada di kalender', () => {
    // Date membetulkan ini diam-diam jadi 3 Maret kalau tidak diperiksa.
    assert.strictEqual(tanggalSah('2026-02-31'), '');
    assert.strictEqual(tanggalSah('2026-13-01'), '');
    assert.strictEqual(tanggalSah('2026-00-10'), '');
  });

  test('menerima 29 Februari di tahun kabisat, menolak di tahun biasa', () => {
    assert.strictEqual(tanggalSah('2028-02-29'), '2028-02-29');
    assert.strictEqual(tanggalSah('2027-02-29'), '');
  });
});

describe('bukaBatch', () => {
  test('batch lama otomatis tertutup, cuma yang baru yang terbuka', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    const hasil = bukaBatch(awal, { nama: 'Batch 2', sekarang: 1_800_000_000_000 });
    assert.ok(hasil.ok);
    assert.strictEqual(hasil.daftar.length, 2);
    assert.ok(hasil.daftar[0].selesai, 'batch lama harus ikut ditutup');
    assert.strictEqual(hasil.daftar[1].selesai, null);
    assert.strictEqual(batchAktif(hasil.daftar).nama, 'Batch 2');
  });

  test('daftar lama TIDAK disunting di tempat', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    bukaBatch(awal, { nama: 'Batch 2' });
    assert.strictEqual(awal[0].selesai, null, 'daftar asal ikut berubah');
  });

  test('nama kembar ditolak, tidak diam-diam dibuat dua', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: '2026-08-01T00:00:00.000Z' }];
    const hasil = bukaBatch(awal, { nama: 'batch 1' });
    assert.strictEqual(hasil.ok, false);
    assert.strictEqual(hasil.reason, 'nama_sudah_dipakai');
  });

  test('tanpa nama -> nomor lanjut dari yang tertinggi, bukan dari jumlah', () => {
    // Batch 2 pernah dihapus. Menghitung dari jumlah akan menghasilkan
    // "Batch 3" yang sudah ada.
    const awal = [
      { id: 'b1', nama: 'Batch 1', selesai: '2026-08-01T00:00:00.000Z' },
      { id: 'b3', nama: 'Batch 3', selesai: '2026-08-01T00:00:00.000Z' },
    ];
    assert.strictEqual(namaBatchBerikutnya(awal), 'Batch 4');
    const hasil = bukaBatch(awal, {});
    assert.strictEqual(hasil.batch.nama, 'Batch 4');
  });

  test('tanggal berakhir yang cacat tidak ikut tersimpan', () => {
    const hasil = bukaBatch([], { nama: 'Batch 1', aksesBerakhir: '31 Maret 2027' });
    assert.ok(hasil.ok);
    assert.strictEqual(hasil.batch.aksesBerakhir, '');
  });

  test('id-nya unik walau dibuka pada milidetik yang sama', () => {
    const a = bukaBatch([], { nama: 'Batch 1', sekarang: 1_800_000_000_000 });
    const b = bukaBatch(a.daftar, { nama: 'Batch 2', sekarang: 1_800_000_000_000 });
    assert.ok(b.ok);
    assert.notStrictEqual(b.batch.id, a.batch.id);
  });
});

describe('tutupBatch', () => {
  test('menutup yang terbuka, dan sesudahnya tidak ada yang aktif', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    const hasil = tutupBatch(awal, 'b1');
    assert.ok(hasil.ok);
    assert.strictEqual(batchAktif(hasil.daftar), null);
  });

  test('menutup yang sudah tertutup ditolak, bukan diam-diam berhasil', () => {
    const hasil = tutupBatch([{ id: 'b1', nama: 'Batch 1', selesai: '2026-08-01T00:00:00.000Z' }], 'b1');
    assert.strictEqual(hasil.ok, false);
    assert.strictEqual(hasil.reason, 'batch_sudah_tertutup');
  });

  test('id yang tidak ada ditolak', () => {
    const hasil = tutupBatch([{ id: 'b1', nama: 'Batch 1' }], 'b9');
    assert.strictEqual(hasil.reason, 'batch_tidak_ketemu');
  });
});

describe('labelBatchBaris', () => {
  test('membaca kolom BS', () => {
    const baris = [];
    baris[KOLOM_BATCH] = ' Batch 2 ';
    assert.strictEqual(labelBatchBaris(baris, KOLOM_BATCH), 'Batch 2');
  });

  test('baris lama tanpa label -> kosong, bukan error', () => {
    assert.strictEqual(labelBatchBaris(['a', 'b'], KOLOM_BATCH), '');
    assert.strictEqual(labelBatchBaris(null, KOLOM_BATCH), '');
  });
});

describe('kolom yang dipesan tidak boleh bertabrakan', () => {
  /**
   * Ini penjagaan yang paling penting di berkas ini.
   *
   * Pertanyaan tambahan buatan admin tumbuh ke kanan mulai dari kolom X.
   * Kalau suatu hari MAKS_FIELD dinaikkan sampai jangkauannya menyentuh
   * kolom batch, label batch akan tertimpa jawaban seseorang tanpa error
   * apa pun -- dan sebaliknya, jawaban seseorang akan terbaca sebagai
   * nama batch. Tes ini gagal duluan sebelum itu sempat terjadi.
   */
  test('kolom batch berada di luar jangkauan pertanyaan tambahan', () => {
    // Pertanyaan tambahan menempati 23 sampai 23 + MAKS_FIELD - 1.
    const kolomTerjauh = KOLOM_TAMBAHAN_MULAI + MAKS_FIELD - 1;
    assert.ok(
      KOLOM_BATCH > kolomTerjauh,
      'KOLOM_BATCH (' + KOLOM_BATCH + ') harus di kanan ' + kolomTerjauh
    );
    assert.ok(KOLOM_CABUT > kolomTerjauh);
  });

  test('masih ada jarak aman, bukan pas menempel di batas', () => {
    // Menempel tepat satu kolom di sebelah jangkauan terjauh secara
    // teknis benar, tapi langsung bertabrakan begitu MAKS_FIELD dinaikkan
    // seorang pun. Tes ini gagal duluan sebelum data ada yang tertimpa.
    const kolomTerjauh = KOLOM_TAMBAHAN_MULAI + MAKS_FIELD - 1;
    assert.ok(
      KOLOM_BATCH - kolomTerjauh >= 5,
      'jarak cuma ' + (KOLOM_BATCH - kolomTerjauh) + ' kolom; naikkan KOLOM_BATCH'
    );
  });

  test('kolom batch, kolom cabut, dan kolom W tidak saling menimpa', () => {
    const dipakai = [KOLOM_BERLAKU_SAMPAI, KOLOM_BATCH, KOLOM_CABUT];
    assert.strictEqual(new Set(dipakai).size, dipakai.length);
  });
});


describe('daftarTersimpan (migrasi dari /analitik)', () => {
  test('batchList dipakai kalau ada', () => {
    const hasil = daftarTersimpan({
      batchList: [{ id: 'b1', nama: 'Baru', selesai: null }],
      batchDaftar: [{ nama: 'Lama', mulai: null, selesai: null }],
    });
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(hasil[0].nama, 'Baru');
  });

  test('jatuh ke batchDaftar lama supaya riwayat pendapatan tidak hilang', () => {
    const hasil = daftarTersimpan({
      batchDaftar: [
        { nama: 'Batch 1', mulai: null, selesai: '2026-06-01T00:00:00.000Z' },
        { nama: 'Batch 2', mulai: '2026-06-01T00:00:00.000Z', selesai: null },
      ],
    });
    assert.strictEqual(hasil.length, 2);
    assert.strictEqual(hasil[0].nama, 'Batch 1');
    // null = hitung sejak awal. Harus bertahan melewati migrasi, kalau
    // tidak semua pendaftar lama lenyap dari rincian per batch.
    assert.strictEqual(hasil[0].mulai, null);
    assert.strictEqual(batchAktif(hasil).nama, 'Batch 2');
  });

  test('migrasi dua kali menghasilkan id yang sama, tidak menggandakan', () => {
    const asal = { batchDaftar: [{ nama: 'Batch 1', mulai: null, selesai: null }] };
    assert.deepStrictEqual(
      daftarTersimpan(asal).map((b) => b.id),
      daftarTersimpan(asal).map((b) => b.id)
    );
  });

  test('anggota batch lama tidak mendadak punya batas waktu akses', () => {
    const hasil = daftarTersimpan({ batchDaftar: [{ nama: 'Batch 1', mulai: null, selesai: null }] });
    assert.strictEqual(hasil[0].aksesBerakhir, '');
  });

  test('kosong di dua-duanya -> daftar kosong', () => {
    assert.deepStrictEqual(daftarTersimpan({}), []);
    assert.deepStrictEqual(daftarTersimpan(null), []);
  });
});

describe('bukaBatch: rentang pendapatan', () => {
  test('batch PERTAMA mulai null, artinya hitung sejak awal', () => {
    const hasil = bukaBatch([], { nama: 'Batch 1' });
    assert.strictEqual(hasil.batch.mulai, null);
  });

  test('batch kedua mulai dari sekarang, bukan null', () => {
    const a = bukaBatch([], { nama: 'Batch 1' });
    const b = bukaBatch(a.daftar, { nama: 'Batch 2', sekarang: 1_800_000_000_000 });
    assert.ok(b.batch.mulai, 'batch kedua harus punya tanggal mulai');
  });

  test('rentangnya bersambung: batch lama tutup persis saat yang baru buka', () => {
    const a = bukaBatch([], { nama: 'Batch 1' });
    const b = bukaBatch(a.daftar, { nama: 'Batch 2', sekarang: 1_800_000_000_000 });
    assert.strictEqual(b.daftar[0].selesai, b.daftar[1].mulai);
  });
});

describe('gantiNamaBatch', () => {
  test('mengganti nama dan melaporkan nama lamanya', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    const hasil = gantiNamaBatch(awal, 'b1', 'Angkatan Ganjil');
    assert.ok(hasil.ok);
    assert.strictEqual(hasil.namaLama, 'Batch 1');
    assert.strictEqual(hasil.daftar[0].nama, 'Angkatan Ganjil');
  });

  test('nama yang bentrok dengan batch lain ditolak', () => {
    const awal = [
      { id: 'b1', nama: 'Batch 1', selesai: '2026-08-01T00:00:00.000Z' },
      { id: 'b2', nama: 'Batch 2', selesai: null },
    ];
    assert.strictEqual(gantiNamaBatch(awal, 'b2', 'batch 1').reason, 'nama_sudah_dipakai');
  });

  test('nama yang sama dengan miliknya sendiri tidak dianggap bentrok', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    assert.ok(gantiNamaBatch(awal, 'b1', 'Batch 1').ok);
  });

  test('nama kosong ditolak', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    assert.strictEqual(gantiNamaBatch(awal, 'b1', '   ').reason, 'nama_kosong');
  });
});

describe('stempelSah', () => {
  /**
   * Nilai inilah yang jadi batas rentang pendapatan per batch di
   * /analitik. Salahnya sunyi: rentang yang tidak terbaca membuat baris
   * pendaftaran jatuh ke batch yang salah, atau tidak ke batch mana pun,
   * dan angkanya tetap terlihat masuk akal di layar.
   */
  test('null dipertahankan sebagai null, bukan diubah jadi tanggal', () => {
    // null di sini PUNYA ARTI: mulai null = hitung sejak awal,
    // selesai null = masih berjalan.
    assert.strictEqual(stempelSah(null), null);
    assert.strictEqual(stempelSah(undefined), null);
    assert.strictEqual(stempelSah(''), null);
  });

  test('ISO dinormalkan ke bentuk baku', () => {
    assert.strictEqual(stempelSah('2026-06-01T00:00:00.000Z'), '2026-06-01T00:00:00.000Z');
    assert.strictEqual(stempelSah('2026-06-01'), '2026-06-01T00:00:00.000Z');
  });

  test('yang tidak terbaca jadi null, bukan Invalid Date', () => {
    // "Invalid Date" yang lolos akan bikin seluruh perbandingan rentang
    // membalik false diam-diam, dan batch itu jadi tidak pernah cocok
    // dengan baris mana pun.
    assert.strictEqual(stempelSah('besok'), null);
    assert.strictEqual(stempelSah('31/06/2026'), null);
    assert.strictEqual(stempelSah({}), null);
  });

  test('menerima angka milidetik', () => {
    assert.strictEqual(stempelSah(Date.UTC(2026, 5, 1)), '2026-06-01T00:00:00.000Z');
  });
});

describe('apps-script.gs harus sepakat dengan form-schema.js', () => {
  /**
   * apps-script.gs bukan bagian dari situs: isinya ditempel manual ke
   * editor Apps Script di spreadsheet. Jadi tidak ada yang memaksanya
   * tetap sejalan dengan kode di sini, dan kalau salah satunya digeser
   * sendirian, gejalanya sunyi total:
   *
   *   - situs menulis label batch ke kolom yang tidak dibaca skrip
   *   - tombol Cabut menandai kolom yang salah, dan aksesnya tidak mati
   *
   * Dua-duanya tidak memunculkan error di mana pun. Tes ini yang
   * menangkapnya sebelum ditempel ke spreadsheet.
   */
  const gs = fs.readFileSync(path.join(__dirname, '..', 'apps-script.gs'), 'utf8');
  const angka = (nama) => {
    const cocok = new RegExp('var ' + nama + ' = ([0-9]+)').exec(gs);
    assert.ok(cocok, nama + ' tidak ditemukan di apps-script.gs');
    return Number(cocok[1]);
  };

  test('KOLOM_BATCH sama di kedua berkas', () => {
    assert.strictEqual(angka('KOLOM_BATCH'), KOLOM_BATCH);
  });

  test('KOLOM_CABUT sama di kedua berkas', () => {
    assert.strictEqual(angka('KOLOM_CABUT'), KOLOM_CABUT);
  });

  test('tiap aksi yang didaftarkan punya fungsi handler-nya', () => {
    const aksi = [...gs.matchAll(/body\.action === .([a-zA-Z]+).\) return (\w+)/g)];
    assert.ok(aksi.length >= 13, 'aksi terbaca cuma ' + aksi.length + ', pola pembacaannya mungkin usang');
    const kurang = aksi.filter(([, , fn]) => !gs.includes('function ' + fn + '(')).map((a) => a[1]);
    assert.deepStrictEqual(kurang, [], 'aksi tanpa handler: ' + kurang.join(', '));
  });
});

describe('aturTanggalBatch', () => {
  /**
   * Tanggal ini yang disalin ke kolom W tiap peserta waktu disetujui,
   * dan kolom W itu yang menutup akses. Nilai setengah jadi yang lolos
   * ke sana TERLIHAT seperti batas waktu terpasang padahal roster.js
   * mengabaikannya -- kesalahan yang tidak pernah memunculkan error.
   */
  test('menyetel tanggal pada batch yang sudah ada', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    const hasil = aturTanggalBatch(awal, 'b1', '2027-03-31');
    assert.ok(hasil.ok);
    assert.strictEqual(hasil.daftar[0].aksesBerakhir, '2027-03-31');
  });

  test('mengosongkan tanggal DITERIMA, artinya tanpa batas waktu', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', aksesBerakhir: '2027-03-31', selesai: null }];
    const hasil = aturTanggalBatch(awal, 'b1', '');
    assert.ok(hasil.ok);
    assert.strictEqual(hasil.daftar[0].aksesBerakhir, '');
  });

  test('tanggal yang tidak terbaca DITOLAK, bukan diam-diam jadi kosong', () => {
    // Menyimpannya sebagai kosong berarti pemiliknya mengira batas
    // waktunya terpasang padahal tidak pernah berlaku.
    const awal = [{ id: 'b1', nama: 'Batch 1', selesai: null }];
    ['31/03/2027', '2027-13-01', '2026-02-31', 'besok'].forEach((t) => {
      assert.strictEqual(
        aturTanggalBatch(awal, 'b1', t).reason,
        'tanggal_tidak_terbaca',
        'harusnya ditolak: ' + t
      );
    });
  });

  test('batch yang tidak ada ditolak', () => {
    assert.strictEqual(
      aturTanggalBatch([{ id: 'b1', nama: 'Batch 1' }], 'b9', '2027-03-31').reason,
      'batch_tidak_ketemu'
    );
  });

  test('daftar asal tidak disunting di tempat', () => {
    const awal = [{ id: 'b1', nama: 'Batch 1', aksesBerakhir: '', selesai: null }];
    aturTanggalBatch(awal, 'b1', '2027-03-31');
    assert.strictEqual(awal[0].aksesBerakhir, '');
  });
});
