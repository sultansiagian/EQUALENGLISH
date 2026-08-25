const { test, describe } = require('node:test');
const assert = require('node:assert');
const { buatIcs, lipatBarisIcs, loloskanIcs, stempelIcs } = require('../kelas-kalender');

const SESI = [
  { isoDatetime: '2026-09-01T13:00:00.000Z', topic: 'Listening: catatan cepat' },
  { isoDatetime: '2026-09-02T13:00:00.000Z', topic: null },
];
const ZOOM = 'https://zoom.us/j/1234567890';

describe('bentuk berkas .ics', () => {
  const ics = buatIcs(SESI, ZOOM);

  test('dibuka dan ditutup dengan benar', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  });

  test('memakai CRLF, bukan LF saja', () => {
    // Sebagian aplikasi kalender menolak berkas ber-LF. Kalau ini salah,
    // gejalanya berkas yang "tidak bisa dibuka" tanpa sebab yang jelas.
    const lfTelanjang = ics.split('\n').filter((b, i, a) => i < a.length - 1 && !b.endsWith('\r'));
    assert.strictEqual(lfTelanjang.length, 0);
  });

  test('satu VEVENT per sesi', () => {
    assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
    assert.strictEqual((ics.match(/END:VEVENT/g) || []).length, 2);
  });

  test('tiap sesi punya pengingat 15 menit', () => {
    // Ini alasan utama fitur ini ada: yang dibutuhkan siswa bukan catatan,
    // melainkan sesuatu yang berbunyi.
    assert.strictEqual((ics.match(/TRIGGER:-PT15M/g) || []).length, 2);
  });

  test('link Zoom masuk ke DESCRIPTION dan LOCATION', () => {
    assert.ok(ics.includes('zoom.us'));
    assert.ok(ics.includes('LOCATION:'));
  });

  test('sesi tanpa topik tetap punya judul', () => {
    assert.ok(ics.includes('SUMMARY:Sesi Bootcamp EPT UI'));
  });
});

describe('UID harus stabil', () => {
  test('dua kali unduh menghasilkan UID yang sama', () => {
    // Kalau UID berubah tiap unduh, mengunduh ulang menambah DUPLIKAT
    // acara di kalender siswa, bukan memperbarui yang sudah ada.
    const uid = (t) => (t.match(/^UID:.*$/gm) || []).map((x) => x.trim());
    assert.deepStrictEqual(uid(buatIcs(SESI, ZOOM)), uid(buatIcs(SESI, ZOOM)));
  });

  test('sesi berbeda punya UID berbeda', () => {
    const uid = (buatIcs(SESI, ZOOM).match(/^UID:.*$/gm) || []).map((x) => x.trim());
    assert.strictEqual(new Set(uid).size, 2);
  });
});

describe('isi yang perlu dilolos', () => {
  test('koma dan titik koma di judul dilolos', () => {
    // Keduanya pemisah field di format ini. Tanpa dilolos, satu koma di
    // judul membuat sisa barisnya terbaca sebagai field lain.
    const ics = buatIcs([{ isoDatetime: '2026-09-01T13:00:00.000Z', topic: 'A, B; C' }], '');
    assert.ok(ics.includes('A\\, B\\; C'));
  });

  test('baris baru di judul tidak memecah barisnya', () => {
    const ics = buatIcs([{ isoDatetime: '2026-09-01T13:00:00.000Z', topic: 'A\nB' }], '');
    assert.ok(ics.includes('A\\nB'));
    assert.ok(!/SUMMARY:EQUAL: A\r?\nB/.test(ics));
  });

  test('garis miring terbalik dilolos lebih dulu', () => {
    assert.strictEqual(loloskanIcs('a\\b'), 'a\\\\b');
  });
});

describe('lipat baris 75 oktet', () => {
  test('baris pendek dibiarkan', () => {
    assert.strictEqual(lipatBarisIcs('SUMMARY:pendek'), 'SUMMARY:pendek');
  });

  test('baris panjang dipatahkan dengan spasi di awal sambungan', () => {
    const hasil = lipatBarisIcs('SUMMARY:' + 'x'.repeat(300));
    const baris = hasil.split('\r\n');
    assert.ok(baris.length > 1);
    assert.ok(baris.every((b) => b.length <= 75), 'ada baris melebihi 75 oktet');
    assert.ok(baris.slice(1).every((b) => b.startsWith(' ')), 'sambungan tanpa spasi di awal');
  });

  test('judul panjang dari admin tidak merusak berkasnya', () => {
    const ics = buatIcs([{ isoDatetime: '2026-09-01T13:00:00.000Z', topic: 'y'.repeat(400) }], '');
    assert.ok(ics.split('\r\n').every((b) => b.length <= 75));
  });
});

describe('sesi yang tidak sah', () => {
  test('tanggal rusak dilewati, sisanya tetap jadi', () => {
    const ics = buatIcs(
      [{ isoDatetime: 'bukan tanggal' }, { isoDatetime: '2026-09-01T13:00:00.000Z' }],
      ''
    );
    assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  });

  test('daftar kosong tetap menghasilkan kalender yang sah', () => {
    const ics = buatIcs([], '');
    assert.ok(ics.includes('BEGIN:VCALENDAR'));
    assert.ok(!ics.includes('BEGIN:VEVENT'));
  });
});

describe('stempelIcs', () => {
  test('format UTC tanpa tanda baca', () => {
    assert.strictEqual(stempelIcs(new Date('2026-09-01T13:00:00.000Z')), '20260901T130000Z');
  });
});
