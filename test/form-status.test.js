const { test, describe } = require('node:test');
const assert = require('node:assert');
const { statusForm, waktuWibKeEpoch, MODE_SAH } = require('../api/_lib/form-status');

/**
 * statusForm menerima waktu sebagai argumen, bukan membaca Date.now()
 * sendiri, dan itulah yang membuat berkas ini bisa ada: buka-tutup
 * terjadwal bisa diuji tanpa menunggu tanggalnya benar-benar tiba.
 */
const WIB = (iso) => waktuWibKeEpoch(iso);

describe('mode buka dan tutup', () => {
  test('bawaan adalah terbuka', () => {
    assert.strictEqual(statusForm({}).terbuka, true);
  });

  test('mode yang tidak dikenal dianggap terbuka, bukan mengunci semua orang', () => {
    // Gagal ke arah yang tidak merugikan pendaftar: setelan yang rusak
    // tidak boleh diam-diam menutup pendaftaran tanpa ada yang sadar.
    assert.strictEqual(statusForm({ formMode: 'entah-apa' }).terbuka, true);
  });

  test('tutup manual memakai pesan admin kalau ada', () => {
    const s = statusForm({ formMode: 'tutup', formPesanTutup: 'Batch 3 penuh.' });
    assert.strictEqual(s.terbuka, false);
    assert.strictEqual(s.pesan, 'Batch 3 penuh.');
  });

  test('tutup manual tanpa pesan tetap punya kalimat', () => {
    const s = statusForm({ formMode: 'tutup' });
    assert.strictEqual(s.terbuka, false);
    assert.ok(s.pesan.length > 0, 'pesan kosong, pengunjung tidak diberi tahu apa-apa');
  });

  test('daftar mode yang sah memuat ketiganya', () => {
    assert.deepStrictEqual([...MODE_SAH].sort(), ['buka', 'jadwal', 'tutup']);
  });
});

describe('mode jadwal', () => {
  const jadwal = {
    formMode: 'jadwal',
    formBukaPada: '2026-09-01T08:00',
    formTutupPada: '2026-09-10T23:59',
  };

  test('sebelum tanggal buka: tertutup', () => {
    assert.strictEqual(statusForm(jadwal, WIB('2026-08-30T10:00')).terbuka, false);
  });

  test('di antara buka dan tutup: terbuka', () => {
    assert.strictEqual(statusForm(jadwal, WIB('2026-09-05T10:00')).terbuka, true);
  });

  test('setelah tanggal tutup: tertutup', () => {
    assert.strictEqual(statusForm(jadwal, WIB('2026-09-11T10:00')).terbuka, false);
  });

  test('tanggal yang tidak terbaca tidak mengunci pendaftaran', () => {
    // Salah ketik tanggal tidak boleh berakibat sama dengan menutup
    // pendaftaran, karena gejalanya identik dan sebabnya tidak terlihat.
    const rusak = { formMode: 'jadwal', formBukaPada: 'bukan tanggal', formTutupPada: '' };
    assert.strictEqual(statusForm(rusak, WIB('2026-09-05T10:00')).terbuka, true);
  });
});

describe('waktuWibKeEpoch', () => {
  test('dibaca sebagai WIB, bukan waktu server', () => {
    // Vercel berjalan di UTC. Kalau ini ikut zona server, pendaftaran
    // yang dijadwalkan tutup tengah malam WIB akan tutup jam 7 pagi.
    const epoch = waktuWibKeEpoch('2026-09-01T00:00');
    assert.strictEqual(new Date(epoch).toISOString(), '2026-08-31T17:00:00.000Z');
  });

  test('nilai kosong dan sampah jadi null', () => {
    assert.strictEqual(waktuWibKeEpoch(''), null);
    assert.strictEqual(waktuWibKeEpoch('besok'), null);
    assert.strictEqual(waktuWibKeEpoch(null), null);
  });
});
