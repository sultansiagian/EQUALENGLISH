const { test, describe } = require('node:test');
const assert = require('node:assert');
const { ringkasNilai } = require('../api/admin-content');

/**
 * Yang dijaga di sini SATU hal, dan kalau salah akibatnya langsung
 * terasa: /admin selalu mengirim SEMUA field di halamannya setiap kali
 * Simpan ditekan, bukan cuma yang berubah. Tanpa perbandingan yang benar,
 * satu klik menghasilkan puluhan baris riwayat yang isinya sama semua,
 * dan riwayatnya jadi tidak berguna justru karena terlalu penuh.
 */
describe('nilai yang tidak berubah harus terbaca sama', () => {
  test('teks', () => {
    assert.strictEqual(ringkasNilai('halo'), ringkasNilai('halo'));
  });

  test('angka dan teks angka dianggap sama', () => {
    // Global Config bisa mengembalikan 59000 sementara form mengirim
    // "59000". Kalau dibedakan, harga tercatat "berubah" tiap kali
    // Simpan ditekan walau tidak ada yang menyentuhnya.
    assert.strictEqual(ringkasNilai(59000), ringkasNilai('59000'));
  });

  test('array dengan isi sama', () => {
    const a = [{ tanya: 'A', jawab: 'B' }];
    const b = [{ tanya: 'A', jawab: 'B' }];
    assert.strictEqual(ringkasNilai(a), ringkasNilai(b));
  });

  test('undefined dan null sama-sama kosong', () => {
    assert.strictEqual(ringkasNilai(undefined), '');
    assert.strictEqual(ringkasNilai(null), '');
    assert.strictEqual(ringkasNilai(undefined), ringkasNilai(null));
  });
});

describe('nilai yang berubah harus terbaca beda', () => {
  test('teks berbeda', () => {
    assert.notStrictEqual(ringkasNilai('lama'), ringkasNilai('baru'));
  });

  test('satu item ditambah ke array', () => {
    const a = [{ tanya: 'A', jawab: 'B' }];
    const b = [{ tanya: 'A', jawab: 'B' }, { tanya: 'C', jawab: 'D' }];
    assert.notStrictEqual(ringkasNilai(a), ringkasNilai(b));
  });

  test('urutan array berubah tetap terbaca beda', () => {
    // Memindah urutan pertanyaan FAQ ADALAH perubahan yang layak dicatat.
    const a = [{ t: 1 }, { t: 2 }];
    const b = [{ t: 2 }, { t: 1 }];
    assert.notStrictEqual(ringkasNilai(a), ringkasNilai(b));
  });

  test('boolean dimatikan', () => {
    assert.notStrictEqual(ringkasNilai(true), ringkasNilai(false));
  });

  test('teks kosong beda dari teks berisi', () => {
    assert.notStrictEqual(ringkasNilai(''), ringkasNilai('sesuatu'));
  });
});

describe('nilai yang tidak wajar tidak melempar error', () => {
  test('objek melingkar', () => {
    // Kalau ini melempar, penyimpanan yang SUDAH berhasil ikut gagal di
    // layar admin, gara-gara pencatatan riwayat yang seharusnya cuma
    // pelengkap.
    const a = { nama: 'x' };
    a.diri = a;
    assert.strictEqual(ringkasNilai(a), '(tidak bisa dibaca)');
  });

  test('array kosong dan objek kosong', () => {
    assert.strictEqual(ringkasNilai([]), '[]');
    assert.strictEqual(ringkasNilai({}), '{}');
  });
});
