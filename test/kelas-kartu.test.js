const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  BAGIAN_FINAL,
  KARTU_BAWAAN,
  ID_BAWAAN,
  hitungFinalTest,
  urlFinalTest,
  kartuBawaanMati,
  normalisasiKartuTambahan,
  kartuTambahanUntukSiswa,
  lebarDipakai,
} = require('../api/_lib/kelas-kartu');

/**
 * ============================================================
 * KENAPA BERKAS INI ADA
 * ============================================================
 *
 * Yang dijaga di sini bukan tampilan, melainkan SATU HAL: link ujian
 * tidak boleh sampai ke browser sebelum waktunya, dan tidak boleh masih
 * ada di sana setelah waktunya habis.
 *
 * Salahnya sunyi. Kartunya tetap tampil, halamannya tetap jalan, tidak
 * ada pesan galat di mana pun. Yang terjadi cuma link ujian ikut
 * terkirim di balasan server, dan siapa pun yang membuka isi balasan itu
 * bisa mengerjakan ujian lebih awal atau setelah ditutup. Tidak akan ada
 * yang melaporkannya.
 *
 * Waktu selalu dioper sebagai angka, tidak pernah dibiarkan memakai jam
 * sungguhan, supaya tes ini memberi jawaban yang sama hari ini dan tahun
 * depan.
 */

// 10 September 2026, WIB.
const jam = (h, m) => Date.parse('2026-09-10T' + h + ':' + (m || '00') + ':00+07:00');

const SISWA = 'a@ui.ac.id';

// Listening 09.00-11.00, Reading 11.00-13.00, Writing 15.00 tanpa tutup.
const JADWAL = {
  testimoniSudahIsi: [SISWA],
  kelasFinalListeningUrl: 'https://uji/listening',
  kelasFinalListeningBuka: '2026-09-10T09:00',
  kelasFinalListeningTutup: '2026-09-10T11:00',
  kelasFinalReadingUrl: 'https://uji/reading',
  kelasFinalReadingBuka: '2026-09-10T11:00',
  kelasFinalReadingTutup: '2026-09-10T13:00',
  kelasFinalWritingUrl: 'https://uji/writing',
  kelasFinalWritingBuka: '2026-09-10T15:00',
};

function bagian(status, id) {
  return status.bagian.find((b) => b.id === id);
}

describe('Final Test: tiga bagian, jadwal masing-masing', () => {
  test('cuma bagian yang sedang berjalan yang terbuka', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('12'));
    assert.strictEqual(bagian(s, 'listening').terbuka, false, 'Listening sudah lewat jam tutupnya');
    assert.strictEqual(bagian(s, 'reading').terbuka, true);
    assert.strictEqual(bagian(s, 'writing').terbuka, false, 'Writing belum jam bukanya');
  });

  test('link yang dikirim cuma milik bagian yang terbuka', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('12'));
    assert.deepStrictEqual(urlFinalTest(JADWAL, s), {
      listening: '',
      reading: 'https://uji/reading',
      writing: '',
    });
  });

  test('sebelum jam buka, tidak ada satu pun link yang ikut terkirim', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('08'));
    const url = urlFinalTest(JADWAL, s);
    assert.deepStrictEqual(Object.values(url), ['', '', '']);
    assert.strictEqual(s.boleh, false);
  });

  test('setelah jam tutup, link BERHENTI dikirim', () => {
    // Ini inti dari "cuma dibuka sekali". Kalau baris ini gagal, ujian
    // yang sudah ditutup masih bisa dibuka oleh siapa pun yang memuat
    // ulang halamannya.
    const s = hitungFinalTest(JADWAL, SISWA, jam('11', '01'));
    assert.strictEqual(bagian(s, 'listening').sudahTutup, true);
    assert.strictEqual(urlFinalTest(JADWAL, s).listening, '');
  });

  test('tepat pada detik jam tutup sudah dianggap tutup', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('11'));
    assert.strictEqual(bagian(s, 'listening').sudahTutup, true, 'jam 11.00 tepat harusnya sudah tutup');
    assert.strictEqual(bagian(s, 'reading').terbuka, true, 'jam 11.00 tepat harusnya Reading sudah buka');
  });

  test('bagian tanpa jam tutup tidak pernah tutup sendiri', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('23', '59'));
    const w = bagian(s, 'writing');
    assert.strictEqual(w.adaTutup, false);
    assert.strictEqual(w.sudahTutup, false);
    assert.strictEqual(w.terbuka, true);
    assert.strictEqual(urlFinalTest(JADWAL, s).writing, 'https://uji/writing');
  });

  test('belum mengisi testimoni: tidak ada link, walau jadwalnya terbuka', () => {
    const s = hitungFinalTest(JADWAL, 'belum@ui.ac.id', jam('12'));
    assert.strictEqual(s.sudahTestimoni, false);
    // Jadwalnya tetap dilaporkan terbuka, supaya halaman bisa bilang
    // "sudah dibuka, tinggal isi testimoni" -- bukan "belum waktunya".
    assert.strictEqual(bagian(s, 'reading').terbuka, true);
    assert.deepStrictEqual(Object.values(urlFinalTest(JADWAL, s)), ['', '', '']);
  });

  test('jam buka kosong berarti TIDAK PERNAH terbuka, bukan langsung terbuka', () => {
    const s = hitungFinalTest(
      { testimoniSudahIsi: [SISWA], kelasFinalReadingUrl: 'https://uji/reading' },
      SISWA,
      jam('12')
    );
    assert.strictEqual(bagian(s, 'reading').adaJadwal, false);
    assert.strictEqual(bagian(s, 'reading').terbuka, false);
    assert.strictEqual(s.adaYangSiap, false);
  });

  test('jam tutup lebih awal dari jam buka diabaikan, bukan mengunci ujian', () => {
    // Satu salah ketik tidak boleh mematikan ujian yang seharusnya
    // berjalan. Ditandai supaya /atur-kelas bisa menegur pemiliknya.
    const o = Object.assign({}, JADWAL, { kelasFinalReadingTutup: '2026-09-10T10:00' });
    const b = bagian(hitungFinalTest(o, SISWA, jam('12')), 'reading');
    assert.strictEqual(b.jadwalTerbalik, true);
    assert.strictEqual(b.adaTutup, false);
    assert.strictEqual(b.terbuka, true);
  });

  test('pengaturan lama satu link tetap jalan sebagai cadangan', () => {
    // Situs yang sudah terlanjur memakai kelasFinalTestUrl tidak boleh
    // mati begitu versi ini dipasang.
    const lama = {
      testimoniSudahIsi: [SISWA],
      kelasFinalTestUrl: 'https://uji/lama',
      kelasFinalTestBukaPada: '2026-09-10T09:00',
    };
    const s = hitungFinalTest(lama, SISWA, jam('12'));
    assert.deepStrictEqual(urlFinalTest(lama, s), {
      listening: 'https://uji/lama',
      reading: 'https://uji/lama',
      writing: 'https://uji/lama',
    });
  });

  test('bagian yang sudah diisi sendiri menang atas cadangan lama', () => {
    const campur = Object.assign({}, JADWAL, {
      kelasFinalTestUrl: 'https://uji/lama',
      kelasFinalTestBukaPada: '2026-09-10T00:00',
    });
    const s = hitungFinalTest(campur, SISWA, jam('12'));
    assert.strictEqual(urlFinalTest(campur, s).reading, 'https://uji/reading');
    // Writing punya jam bukanya sendiri (15.00), jadi jam 12 belum
    // terbuka walau cadangan lamanya bilang sejak tengah malam.
    assert.strictEqual(bagian(s, 'writing').terbuka, false);
  });

  test('bentuk balasan lama tetap ada supaya pemanggil lama tidak pecah', () => {
    const s = hitungFinalTest(JADWAL, SISWA, jam('12'));
    ['boleh', 'adaLink', 'adaJadwal', 'sudahWaktunya', 'sudahTestimoni', 'bukaPada'].forEach((k) => {
      assert.ok(k in s, 'field ' + k + ' hilang dari balasan');
    });
    assert.strictEqual(s.boleh, true, 'ada satu bagian terbuka, jadi boleh harusnya true');
  });

  test('daftar bagian tetap tiga dan urutannya tetap', () => {
    assert.deepStrictEqual(BAGIAN_FINAL.map((b) => b.id), ['listening', 'reading', 'writing']);
  });
});

describe('kartu bawaan: nyala / mati', () => {
  test('id karangan tidak ikut tersimpan sebagai kartu mati', () => {
    const hasil = kartuBawaanMati({ kelasKartuMati: ['zoom', 'kartu-palsu', 'jadwal'] });
    assert.deepStrictEqual(hasil, ['zoom', 'jadwal']);
  });

  test('tanpa pengaturan, tidak ada yang dimatikan', () => {
    assert.deepStrictEqual(kartuBawaanMati({}), []);
    assert.deepStrictEqual(kartuBawaanMati({ kelasKartuMati: 'bukan array' }), []);
  });

  test('tujuh kartu bawaan, id-nya unik', () => {
    assert.strictEqual(KARTU_BAWAAN.length, 7);
    assert.strictEqual(new Set(ID_BAWAAN).size, 7);
  });

  test('id kartu bawaan sama persis dengan data-kartu di kelas.html', () => {
    // Kalau keduanya berbeda, sakelarnya tetap tersimpan tapi tidak
    // mematikan apa pun -- kerusakan yang tidak terlihat sampai ada
    // yang mencoba mematikan kartunya.
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'kelas.html'), 'utf8');
    const diHtml = (html.match(/data-kartu="([a-z]+)"/g) || []).map((m) =>
      m.replace(/data-kartu="|"/g, '')
    );
    assert.deepStrictEqual(diHtml.slice().sort(), ID_BAWAAN.slice().sort());
  });
});

describe('kartu buatan pemilik', () => {
  test('kartu tanpa judul dibuang, sisanya dipertahankan', () => {
    const hasil = normalisasiKartuTambahan([
      { judul: 'Slide Pertemuan 1' },
      { judul: '   ', deskripsi: 'ada isinya tapi tanpa judul' },
      { deskripsi: 'juga tanpa judul' },
    ]);
    assert.strictEqual(hasil.length, 1);
    assert.strictEqual(hasil[0].judul, 'Slide Pertemuan 1');
  });

  test('kartu tanpa id diberi id sendiri, tidak dibiarkan kosong', () => {
    const hasil = normalisasiKartuTambahan([{ judul: 'A' }, { judul: 'B' }]);
    assert.ok(hasil[0].id);
    assert.notStrictEqual(hasil[0].id, hasil[1].id, 'dua kartu tidak boleh berbagi id');
  });

  test('lebar karangan jatuh ke auto, bukan diteruskan apa adanya', () => {
    assert.strictEqual(normalisasiKartuTambahan([{ judul: 'A', lebar: 'raksasa' }])[0].lebar, 'auto');
    assert.strictEqual(normalisasiKartuTambahan([{ judul: 'A', lebar: 'lebar' }])[0].lebar, 'lebar');
  });

  test('bukan array jadi daftar kosong, bukan melempar', () => {
    assert.deepStrictEqual(normalisasiKartuTambahan(undefined), []);
    assert.deepStrictEqual(normalisasiKartuTambahan('kartu'), []);
  });

  test('lebar auto: tanpa link jadi lebar, dengan link dan deskripsi pendek jadi sempit', () => {
    assert.strictEqual(lebarDipakai({ lebar: 'auto', url: '', deskripsi: 'pendek' }), 'lebar');
    assert.strictEqual(lebarDipakai({ lebar: 'auto', url: 'https://x', deskripsi: 'pendek' }), 'sempit');
    assert.strictEqual(
      lebarDipakai({ lebar: 'auto', url: 'https://x', deskripsi: 'p'.repeat(200) }),
      'lebar'
    );
  });

  test('lebar yang ditentukan sendiri tidak ikut ditebak ulang', () => {
    assert.strictEqual(lebarDipakai({ lebar: 'sempit', url: '', deskripsi: 'p'.repeat(200) }), 'sempit');
  });
});

describe('kartu berjadwal tidak bocor sebelum waktunya', () => {
  const KARTU = {
    kelasKartuTambahan: [
      { id: 'a', judul: 'Selalu tampil', url: 'https://x/a' },
      { id: 'b', judul: 'Bocoran soal', url: 'https://x/b', bukaPada: '2026-09-10T14:00' },
      { id: 'c', judul: 'Tanggal salah ketik', url: 'https://x/c', bukaPada: 'besok sore' },
    ],
  };

  test('kartu berjadwal TIDAK ikut dikirim sebelum tanggalnya', () => {
    const hasil = kartuTambahanUntukSiswa(KARTU, jam('12'));
    assert.deepStrictEqual(hasil.map((k) => k.id), ['a']);
    // Bukan cuma disembunyikan: judul dan linknya tidak boleh ada sama
    // sekali di balasan server.
    assert.strictEqual(JSON.stringify(hasil).includes('https://x/b'), false);
  });

  test('kartu berjadwal muncul begitu tanggalnya tiba', () => {
    const hasil = kartuTambahanUntukSiswa(KARTU, jam('14'));
    assert.deepStrictEqual(hasil.map((k) => k.id), ['a', 'b']);
  });

  test('tanggal yang tidak terbaca dianggap BELUM dibuka', () => {
    // Menganggapnya "tampil saja" akan membocorkan kartu yang justru
    // sengaja dijadwalkan, gara-gara satu salah ketik.
    const hasil = kartuTambahanUntukSiswa(KARTU, jam('23', '59'));
    assert.strictEqual(hasil.some((k) => k.id === 'c'), false);
  });

  test('yang dikirim ke siswa cuma field yang dipakai menggambar', () => {
    const hasil = kartuTambahanUntukSiswa(KARTU, jam('12'));
    assert.deepStrictEqual(
      Object.keys(hasil[0]).sort(),
      ['deskripsi', 'id', 'ikonUrl', 'judul', 'label', 'lebar', 'url']
    );
    assert.ok(!('bukaPada' in hasil[0]), 'jadwal internal tidak perlu ikut ke browser');
  });
});
