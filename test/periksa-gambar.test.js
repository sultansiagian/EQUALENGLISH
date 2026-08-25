const { test, describe } = require('node:test');
const assert = require('node:assert');
const { periksaGambar } = require('../api/_lib/periksa-gambar');

/**
 * Yang dijaga di sini satu hal: label "image/png" di depan data URL itu
 * DIKETIK PENGIRIM, jadi tidak boleh dipercaya sama sekali. Yang
 * menentukan harus byte pertama isinya.
 */
const url = (tipe, byte) =>
  'data:' + tipe + ';base64,' + Buffer.from(byte).toString('base64');

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

describe('gambar yang sah diterima', () => {
  test('JPEG', () => assert.strictEqual(periksaGambar(url('image/jpeg', JPEG)).tipe, 'image/jpeg'));
  test('PNG', () => assert.strictEqual(periksaGambar(url('image/png', PNG)).tipe, 'image/png'));
  test('GIF', () => assert.strictEqual(periksaGambar(url('image/gif', GIF)).tipe, 'image/gif'));

  test('WebP, format yang paling sering datang', () => {
    // Kompresor di browser menghasilkan ini (SPEC_UNGGAHAN tipe
    // image/webp), jadi kalau yang satu ini salah, HAMPIR SEMUA
    // pendaftaran ditolak.
    assert.strictEqual(periksaGambar(url('image/webp', WEBP)).tipe, 'image/webp');
  });

  test('label yang salah TIDAK menghalangi gambar sungguhan', () => {
    // Isinya benar PNG walau labelnya bilang jpeg. Yang dipercaya isinya.
    assert.strictEqual(periksaGambar(url('image/jpeg', PNG)).tipe, 'image/png');
  });
});

describe('yang bukan gambar ditolak walau labelnya meyakinkan', () => {
  test('teks biasa berlabel image/png', () => {
    const jahat = 'data:image/png;base64,' + Buffer.from('halo ini bukan gambar').toString('base64');
    const h = periksaGambar(jahat);
    assert.strictEqual(h.ok, false);
    assert.strictEqual(h.alasan, 'bukan_gambar');
  });

  test('HTML berlabel image/jpeg', () => {
    const jahat =
      'data:image/jpeg;base64,' +
      Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    assert.strictEqual(periksaGambar(jahat).ok, false);
  });

  test('PDF berlabel image/png', () => {
    const pdf = 'data:image/png;base64,' + Buffer.from('%PDF-1.7\n%aaa').toString('base64');
    assert.strictEqual(periksaGambar(pdf).ok, false);
  });

  test('byte benar tapi bergeser satu posisi', () => {
    // Menjaga pencocokannya benar-benar dari posisi 0, bukan "mengandung".
    assert.strictEqual(periksaGambar(url('image/png', [0x00].concat(PNG))).ok, false);
  });

  test('RIFF tanpa WEBP di posisi 8 ditolak', () => {
    // Berkas WAV juga diawali RIFF. Kalau cuma "RIFF" yang dicek, berkas
    // audio ikut lolos sebagai gambar.
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    assert.strictEqual(periksaGambar(url('image/webp', wav)).ok, false);
  });
});

describe('bentuk masukan yang tidak wajar', () => {
  test('bukan data URL', () => {
    assert.strictEqual(periksaGambar('https://contoh.com/a.png').alasan, 'bukan_data_url');
    assert.strictEqual(periksaGambar('').alasan, 'bukan_data_url');
    assert.strictEqual(periksaGambar(null).alasan, 'bukan_data_url');
  });

  test('data URL kosong isinya', () => {
    assert.strictEqual(periksaGambar('data:image/png;base64,').alasan, 'bukan_data_url');
  });
});

describe('batas ukuran per berkas', () => {
  test('di bawah batas lolos', () => {
    const kecil = url('image/png', PNG.concat(new Array(1000).fill(0)));
    assert.strictEqual(periksaGambar(kecil, 100).ok, true);
  });

  test('di atas batas ditolak, dan ukurannya ikut dilaporkan', () => {
    // Ukurannya perlu ikut supaya pesan ke pendaftar bisa menyebut angka,
    // bukan cuma "terlalu besar".
    const besar = url('image/png', PNG.concat(new Array(300 * 1024).fill(0)));
    const h = periksaGambar(besar, 100);
    assert.strictEqual(h.ok, false);
    assert.strictEqual(h.alasan, 'terlalu_besar');
    assert.ok(h.kb > 100, 'kb tidak dilaporkan: ' + h.kb);
  });

  test('tanpa batas, ukuran berapa pun lolos', () => {
    const besar = url('image/png', PNG.concat(new Array(300 * 1024).fill(0)));
    assert.strictEqual(periksaGambar(besar).ok, true);
  });

  test('ukuran diperiksa SEBELUM jenis berkasnya', () => {
    // Berkas raksasa yang juga bukan gambar harus ditolak karena
    // ukurannya, supaya tidak ada decoding sia-sia pada berkas besar.
    const besar = 'data:image/png;base64,' + Buffer.from(new Array(300 * 1024).fill(65)).toString('base64');
    assert.strictEqual(periksaGambar(besar, 100).alasan, 'terlalu_besar');
  });
});
