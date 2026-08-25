const { test, describe } = require('node:test');
const assert = require('node:assert');
const { csvToRows, buatPembacaTanggal, tebakFormatTanggal } = require('../api/_lib/csv');

/**
 * Penebak format tanggal ada karena kolom Timestamp di spreadsheet bisa
 * berisi "bulan/tanggal" DAN "tanggal/bulan" sekaligus, tergantung
 * setelan locale orang yang mengisinya. Salahnya sunyi: 03/04/2026
 * terbaca sah dalam dua-duanya, cuma artinya beda tiga puluh hari, dan
 * yang terlihat kemudian cuma angka statistik yang aneh.
 */
describe('csvToRows', () => {
  test('baris dan kolom biasa', () => {
    assert.deepStrictEqual(csvToRows('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  test('koma di dalam tanda kutip tidak memecah kolom', () => {
    assert.deepStrictEqual(csvToRows('nama,alamat\n"Sultan","Depok, Jawa Barat"'), [
      ['nama', 'alamat'],
      ['Sultan', 'Depok, Jawa Barat'],
    ]);
  });

  test('tanda kutip ganda di dalam nilai', () => {
    assert.deepStrictEqual(csvToRows('a\n"dia bilang ""halo"""'), [['a'], ['dia bilang "halo"']]);
  });

  test('baris baru di dalam tanda kutip tetap satu baris', () => {
    const hasil = csvToRows('a,b\n"baris satu\nbaris dua",x');
    assert.strictEqual(hasil.length, 2);
    assert.strictEqual(hasil[1][0], 'baris satu\nbaris dua');
  });

  test('CRLF dari Google Sheets tidak menyisakan \\r', () => {
    const hasil = csvToRows('a,b\r\n1,2\r\n');
    assert.strictEqual(hasil[1][1], '2');
  });
});

describe('tebakFormatTanggal', () => {
  test('angka pertama di atas 12 berarti tanggal-dulu', () => {
    assert.strictEqual(tebakFormatTanggal(['25/08/2026', '13/01/2026']), 'tanggalDulu');
  });

  test('angka kedua di atas 12 berarti bulan-dulu', () => {
    assert.strictEqual(tebakFormatTanggal(['08/25/2026', '01/13/2026']), 'bulanDulu');
  });

  test('kolom yang ambigu jatuh ke bulan-dulu, bukan menebak acak', () => {
    // Tidak ada satu pun angka di atas 12, jadi tidak ada bukti apa pun.
    // Yang penting di sini bukan tebakannya benar, tapi tebakannya SAMA
    // setiap kali dijalankan.
    assert.strictEqual(tebakFormatTanggal(['03/04/2026', '05/06/2026']), 'bulanDulu');
    assert.strictEqual(tebakFormatTanggal(['03/04/2026', '05/06/2026']), 'bulanDulu');
  });

  test('daftar kosong tidak melempar error', () => {
    assert.strictEqual(tebakFormatTanggal([]), 'bulanDulu');
  });
});

describe('buatPembacaTanggal', () => {
  test('format ditetapkan dari SELURUH kolom, bukan per baris', () => {
    // Inilah alasan formatnya ditebak sekali di depan: baris "03/04/2026"
    // sendirian tidak punya petunjuk apa pun, tapi kolom yang memuat
    // "25/08/2026" membuktikan seluruh kolomnya tanggal-dulu.
    const baca = buatPembacaTanggal(['25/08/2026', '03/04/2026']);
    const d = baca('03/04/2026');
    assert.strictEqual(d.getMonth(), 3, 'harusnya April (bulan ke-4)');
    assert.strictEqual(d.getDate(), 3);
  });

  test('kolom bulan-dulu membaca tanggal yang sama secara berbeda', () => {
    const baca = buatPembacaTanggal(['08/25/2026', '03/04/2026']);
    const d = baca('03/04/2026');
    assert.strictEqual(d.getMonth(), 2, 'harusnya Maret (bulan ke-3)');
    assert.strictEqual(d.getDate(), 4);
  });

  test('format ISO dibaca apa adanya, tidak ikut ditebak', () => {
    const baca = buatPembacaTanggal(['25/08/2026']);
    const d = baca('2026-09-01');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 8);
  });

  test('nilai kosong dan sampah jadi null, bukan Invalid Date', () => {
    const baca = buatPembacaTanggal(['25/08/2026']);
    assert.strictEqual(baca(''), null);
    assert.strictEqual(baca('bukan tanggal'), null);
    assert.strictEqual(baca(null), null);
  });
});
