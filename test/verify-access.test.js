const { test, describe } = require('node:test');
const assert = require('node:assert');
const va = require('../api/verify-access');

/**
 * ============================================================
 * JARING PENGAMAN UNTUK PEMECAHAN verify-access.js
 * ============================================================
 *
 * Berkas ini ditulis SEBELUM verify-access.js dipecah, bukan sesudah.
 * Urutan itu yang membuatnya berguna: tesnya lulus melawan versi utuh
 * lebih dulu, jadi kalau nanti gagal setelah dipecah, yang berubah pasti
 * perilakunya, bukan tesnya.
 *
 * Yang diuji di sini fungsi murni yang sudah diekspor. Handler-nya
 * sendiri tidak diuji: dia menuntut token Google asli, roster sungguhan,
 * dan env var, dan memalsukan semua itu berarti menguji tiruan, bukan
 * yang sebenarnya jalan.
 */

describe('normalisasiEmail', () => {
  test('titik dan tanda plus di Gmail diabaikan', () => {
    // Google memperlakukan ketiganya sebagai satu kotak masuk yang sama.
    // Kalau tidak disamakan, siswa yang mendaftar dengan satu bentuk lalu
    // login dengan bentuk lain akan ditolak di pintu.
    assert.strictEqual(va.normalisasiEmail('sul.tan+kelas@gmail.com'), 'sultan@gmail.com');
    assert.strictEqual(va.normalisasiEmail('s.u.l.t.a.n@gmail.com'), 'sultan@gmail.com');
  });

  test('googlemail.com disamakan dengan gmail.com', () => {
    assert.strictEqual(va.normalisasiEmail('sultan@googlemail.com'), 'sultan@gmail.com');
  });

  test('domain lain TIDAK ikut dinormalkan', () => {
    // Di luar Gmail, titik itu bermakna. Menghapusnya akan menyamakan dua
    // alamat yang benar-benar berbeda orang.
    assert.strictEqual(va.normalisasiEmail('sul.tan@ui.ac.id'), 'sul.tan@ui.ac.id');
    assert.strictEqual(va.normalisasiEmail('a+b@outlook.com'), 'a+b@outlook.com');
  });

  test('huruf besar dan spasi dibersihkan', () => {
    assert.strictEqual(va.normalisasiEmail('  SULTAN@UI.AC.ID '), 'sultan@ui.ac.id');
  });

  test('nilai kosong dan tanpa @ tidak melempar error', () => {
    assert.strictEqual(va.normalisasiEmail(''), '');
    assert.strictEqual(va.normalisasiEmail(null), '');
    assert.strictEqual(va.normalisasiEmail('bukan-email'), 'bukan-email');
  });
});

describe('hitungProgres', () => {
  const lampau = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
  const depan = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString();

  test('tanpa sesi mengembalikan null, bukan 0 dari 0', () => {
    // "0 dari 0" akan tampil di kartu seperti bar progres yang rusak.
    assert.strictEqual(va.hitungProgres([]), null);
    assert.strictEqual(va.hitungProgres(null), null);
  });

  test('menghitung sesi yang sudah lewat', () => {
    const h = va.hitungProgres([
      { isoDatetime: lampau }, { isoDatetime: lampau }, { isoDatetime: depan },
    ]);
    assert.deepStrictEqual(h, { selesai: 2, total: 3 });
  });

  test('sesi bertanggal rusak tidak dihitung selesai, tapi tetap masuk total', () => {
    const h = va.hitungProgres([{ isoDatetime: lampau }, { isoDatetime: 'bukan tanggal' }]);
    assert.strictEqual(h.selesai, 1);
    assert.strictEqual(h.total, 2);
  });
});

describe('jadwalDariConfig', () => {
  test('kosong berarti null, artinya "pakai sheet"', () => {
    // Bedanya penting: null = admin belum mengisi, jadi sheet yang
    // dipakai. Array kosong akan berarti "jadwalnya memang tidak ada".
    assert.strictEqual(va.jadwalDariConfig({}), null);
    assert.strictEqual(va.jadwalDariConfig({ kelasJadwal: [] }), null);
  });

  test('jam dibaca sebagai WIB, bukan waktu server', () => {
    // Vercel berjalan di UTC. Kalau ini ikut zona server, sesi jam 8
    // malam WIB akan tercatat jam 8 malam UTC, yaitu jam 3 pagi WIB.
    const s = va.jadwalDariConfig({ kelasJadwal: [{ tanggal: '2026-09-01', jam: '20:00' }] });
    assert.strictEqual(s[0].isoDatetime, '2026-09-01T13:00:00.000Z');
  });

  test('jam kosong jatuh ke 20:00', () => {
    const s = va.jadwalDariConfig({ kelasJadwal: [{ tanggal: '2026-09-01' }] });
    assert.strictEqual(s[0].isoDatetime, '2026-09-01T13:00:00.000Z');
  });

  test('baris bertanggal rusak dibuang, sisanya tetap terbaca', () => {
    const s = va.jadwalDariConfig({
      kelasJadwal: [
        { tanggal: '01/09/2026', jam: '20:00' },
        { tanggal: '2026-09-02', jam: '19:00' },
      ],
    });
    assert.strictEqual(s.length, 1);
  });

  test('hasilnya selalu urut waktu', () => {
    const s = va.jadwalDariConfig({
      kelasJadwal: [
        { tanggal: '2026-09-05' }, { tanggal: '2026-09-01' }, { tanggal: '2026-09-03' },
      ],
    });
    assert.deepStrictEqual(
      s.map((x) => x.isoDatetime),
      [...s.map((x) => x.isoDatetime)].sort()
    );
  });
});

describe('materiDariConfig', () => {
  test('field yang dikosongkan admin TIDAK ikut', () => {
    // Supaya sheet materi (atau nilai bawaan) yang mengisinya. Kalau
    // string kosong ikut terkirim, pemasangan lama mendadak kehilangan
    // isinya begitu /atur-kelas dibuka sekali.
    const h = va.materiDariConfig({ kelasZoomUrl: 'https://zoom.us/j/1', kelasDriveUrl: '' });
    assert.strictEqual(h.nilai.zoomJoinUrl, 'https://zoom.us/j/1');
    assert.ok(!('driveUrl' in h.nilai), 'field kosong ikut terkirim');
  });

  test('config kosong tidak menimpa apa pun', () => {
    assert.deepStrictEqual(va.materiDariConfig({}).nilai, {});
    assert.deepStrictEqual(va.materiDariConfig(null).nilai, {});
  });
});

describe('hitungFinalTest', () => {
  const lampau = '2020-01-01T00:00';
  const depan = '2090-01-01T00:00';

  test('belum boleh sebelum waktunya', () => {
    const h = va.hitungFinalTest(
      { kelasFinalTestUrl: 'https://x', kelasFinalTestBukaPada: depan },
      'a@ui.ac.id'
    );
    assert.strictEqual(h.boleh, false);
  });

  test('tanpa URL ujian, tidak pernah boleh', () => {
    const h = va.hitungFinalTest({ kelasFinalTestBukaPada: lampau }, 'a@ui.ac.id');
    assert.strictEqual(h.boleh, false);
  });

  test('sudah waktunya DAN sudah mengisi testimoni', () => {
    const h = va.hitungFinalTest(
      {
        kelasFinalTestUrl: 'https://x',
        kelasFinalTestBukaPada: lampau,
        testimoniSudahIsi: ['a@ui.ac.id'],
      },
      'a@ui.ac.id'
    );
    assert.strictEqual(h.boleh, true);
  });

  test('sudah waktunya tapi BELUM mengisi testimoni', () => {
    const h = va.hitungFinalTest(
      {
        kelasFinalTestUrl: 'https://x',
        kelasFinalTestBukaPada: lampau,
        testimoniSudahIsi: ['lain@ui.ac.id'],
      },
      'a@ui.ac.id'
    );
    assert.strictEqual(h.boleh, false);
  });
});

describe('permukaan modul', () => {
  test('semua fungsi yang dipakai berkas lain tetap terekspor', () => {
    // api/kelas-testimoni.js dan api/render-home.js mengimpor dari sini.
    // Kalau salah satu hilang waktu berkas ini dipecah, yang terjadi
    // bukan error saat build melainkan endpoint yang mati saat dipakai.
    for (const nama of [
      'verifyGoogleToken', 'fetchEnrolledEmails', 'normalisasiEmail',
      'hitungFinalTest', 'hitungProgres', 'materiDariConfig', 'jadwalDariConfig',
    ]) {
      assert.strictEqual(typeof va[nama], 'function', nama + ' hilang dari ekspor');
    }
  });

  test('handler-nya sendiri tetap sebuah fungsi', () => {
    assert.strictEqual(typeof va, 'function');
  });
});
