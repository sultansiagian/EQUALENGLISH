const { test, describe } = require('node:test');
const assert = require('node:assert');
const { tebakPaket, PAKET } = require('../api/_lib/statistik');
const { cariStatus, STATUS } = require('../api/_lib/status-pendaftar');

describe('tebakPaket', () => {
  test('mengenali ketiga paket dari teks sheet', () => {
    assert.strictEqual(tebakPaket('Individual'), 'individual');
    assert.strictEqual(tebakPaket('Pair'), 'pair');
    assert.strictEqual(tebakPaket('Group'), 'group');
  });

  test('tidak peduli besar-kecil huruf dan teks di sekelilingnya', () => {
    // Baris lama dari Google Form berisi kalimat panjang, bukan satu kata,
    // dan sebagiannya diketik manual oleh orang yang berbeda-beda.
    assert.strictEqual(tebakPaket('  GROUP (3 orang) - Rp 45.000  '), 'group');
    assert.strictEqual(tebakPaket('paket individual / solo'), 'individual');
  });

  test('teks yang tidak dikenal jadi null, bukan ditebak ke salah satu', () => {
    // Menebak akan membuat statistik pendapatan terlihat wajar padahal
    // salah, dan tidak ada yang akan curiga.
    assert.strictEqual(tebakPaket('Paket Spesial Ramadan'), null);
    assert.strictEqual(tebakPaket(''), null);
    assert.strictEqual(tebakPaket(null), null);
  });

  test('daftar PAKET utuh dan jumlah orangnya benar', () => {
    // Angka orang dipakai menghitung total peserta dari jumlah baris.
    assert.deepStrictEqual(PAKET.map((p) => p.id), ['individual', 'pair', 'group']);
    assert.deepStrictEqual(PAKET.map((p) => p.orang), [1, 2, 3]);
  });
});

describe('cariStatus', () => {
  test('yang ada di roster langsung disetujui, tanpa menyentuh Apps Script', () => {
    // Kalau jalur ini sampai memanggil Apps Script, tes ini akan gagal
    // karena env var-nya tidak diisi di sini. Jadi tes ini sekaligus
    // membuktikan pemeriksaan roster benar-benar mendahului antrean.
    return cariStatus('sultan@ui.ac.id', true, {}).then((h) => {
      assert.strictEqual(h.status, STATUS.DISETUJUI);
    });
  });

  test('email kosong tidak pernah dianggap ketemu', () => {
    return cariStatus('', false, {}).then((h) => {
      assert.strictEqual(h.status, STATUS.TIDAK_DITEMUKAN);
    });
  });

  test('antrean yang gagal dibaca melempar kode khusus, bukan tidak_ditemukan', () => {
    // Bedanya menentukan kalimat yang dibaca orang yang sudah transfer:
    // "sistem sedang bermasalah" versus "pendaftaran kamu tidak ada".
    return cariStatus('orang@ui.ac.id', false, {}).then(
      () => assert.fail('harusnya melempar karena APPS_SCRIPT_URL tidak diisi'),
      (err) => assert.strictEqual(err.kode, 'antrean_tidak_terbaca')
    );
  });
});
