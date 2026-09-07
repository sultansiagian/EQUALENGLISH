const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  tebakPaket,
  PAKET,
  hitungStatistik,
  entriRiwayatHarga,
  susunRiwayatHarga,
} = require('../api/_lib/statistik');
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

/**
 * ============================================================
 * HARGA BERUBAH, PENDAPATAN BATCH LAMA TIDAK IKUT BERUBAH
 * ============================================================
 * Ini bagian /analitik yang paling gampang salah tanpa ketahuan. Kalau
 * tiap baris dihargai memakai harga yang kebetulan berlaku hari ini,
 * menaikkan harga untuk batch berikutnya akan ikut menaikkan pendapatan
 * batch-batch sebelumnya. Tidak ada yang meledak, tidak ada pesan galat,
 * cuma catatan yang tadinya benar jadi salah tanpa ada yang menyentuhnya.
 *
 * Seluruh mekanismenya (catatan riwayat harga, pemilihan harga menurut
 * tanggal daftar, penanda harga campuran) sebelumnya sama sekali tidak
 * punya tes. Ada, terbaca benar, tapi tidak ada yang membuktikannya
 * masih jalan besok.
 *
 * Tanggalnya sengaja memakai hari di atas 12 (15/03, 15/09). Pembaca
 * tanggal menebak DD/MM atau MM/DD dari seluruh kolom sekaligus, dan
 * tanggal seperti 01/03 tidak bisa dibedakan, jadi tes yang memakainya
 * akan menguji tebakan pembaca tanggal, bukan logika harga.
 */
describe('harga menurut kapan orangnya mendaftar', () => {
  // Kolom A timestamp, kolom G (indeks 6) paket. Lihat KOLOM di
  // form-schema.js.
  function baris(tanggal, paket) {
    const sel = new Array(10).fill('');
    sel[0] = tanggal;
    sel[6] = paket;
    return sel.join(',');
  }

  const CSV = [
    new Array(10).fill('judul').join(','),
    baris('15/03/2026 10:00:00', 'Group (3 students)'),
    baris('15/03/2026 11:00:00', 'Individual (1 student)'),
    baris('15/09/2026 10:00:00', 'Group (3 students)'),
    baris('15/09/2026 11:00:00', 'Individual (1 student)'),
  ].join('\n');

  const HARGA_LAMA = [59000, 53000, 47000];
  const HARGA_BARU = [75000, 70000, 65000];

  // Persis seperti yang ditulis api/admin-content.js waktu harga diubah
  // 1 Juni 2026: harga lama dicatat sebagai berlaku sejak awal, harga
  // baru sejak tanggal perubahannya.
  const SETELAH_NAIK = {
    pkg1Price: HARGA_BARU[0], pkg2Price: HARGA_BARU[1], pkg3Price: HARGA_BARU[2],
    hargaRiwayat: [
      entriRiwayatHarga(null, HARGA_LAMA),
      entriRiwayatHarga('2026-06-01T00:00:00.000Z', HARGA_BARU),
    ],
  };

  test('belum pernah ganti harga: semua baris pakai harga sekarang', () => {
    const s = hitungStatistik(CSV, {
      pkg1Price: 59000, pkg2Price: 53000, pkg3Price: 47000,
    });
    assert.strictEqual(s.totalPendapatan, 2 * 59000 + 2 * (3 * 47000));
    assert.strictEqual(s.totalOrang, 1 + 3 + 1 + 3);
  });

  test('setelah harga naik, baris lama tetap dihargai harga lama', () => {
    const s = hitungStatistik(CSV, SETELAH_NAIK);
    const benar = (59000 + 3 * 47000) + (75000 + 3 * 65000);
    const kalauSalah = 2 * 75000 + 2 * (3 * 65000);

    assert.strictEqual(s.totalPendapatan, benar, 'pendapatan tidak memakai harga per tanggal daftar');
    assert.notStrictEqual(s.totalPendapatan, kalauSalah,
      'seluruh baris dihargai dengan harga sekarang, batch lama ikut menggelembung');
  });

  test('menaikkan harga tidak mengubah angka batch yang sudah lewat', () => {
    // Inti jaminannya, ditulis sebagai perbandingan langsung: hitung
    // batch Maret SEBELUM dan SESUDAH harga dinaikkan, hasilnya harus
    // sama persis.
    const jendelaMaret = { mulai: null, selesai: new Date('2026-05-01') };
    const sebelum = hitungStatistik(CSV, {
      pkg1Price: HARGA_LAMA[0], pkg2Price: HARGA_LAMA[1], pkg3Price: HARGA_LAMA[2],
    }, jendelaMaret);
    const sesudah = hitungStatistik(CSV, SETELAH_NAIK, jendelaMaret);

    assert.strictEqual(sebelum.totalPendapatan, 59000 + 3 * 47000);
    assert.strictEqual(sesudah.totalPendapatan, sebelum.totalPendapatan);
  });

  test('batch baru dihargai dengan harga baru', () => {
    const s = hitungStatistik(CSV, SETELAH_NAIK, {
      mulai: new Date('2026-08-01'), selesai: null,
    });
    assert.strictEqual(s.totalPendapatan, 75000 + 3 * 65000);
  });

  test('paket yang harganya campuran ditandai, yang seragam tidak', () => {
    // Tanda ini yang dipakai /analitik menaruh bintang di tabel. Tanpa
    // itu, baris "Rp75.000 x 2" terlihat seperti salah hitung waktu
    // tidak cocok dengan kolom pendapatannya.
    const campur = hitungStatistik(CSV, SETELAH_NAIK);
    const perId = {};
    campur.perPaket.forEach((p) => { perId[p.id] = p; });
    assert.strictEqual(perId.individual.hargaBeragam, true);
    assert.strictEqual(perId.group.hargaBeragam, true);
    assert.strictEqual(perId.pair.hargaBeragam, false, 'paket tanpa pendaftar tidak boleh ikut ditandai');

    // Cuma batch baru: semuanya dibayar dengan harga yang berlaku
    // sekarang, jadi tidak ada yang perlu ditandai.
    const seragam = hitungStatistik(CSV, SETELAH_NAIK, {
      mulai: new Date('2026-08-01'), selesai: null,
    });
    seragam.perPaket.forEach((p) => {
      assert.strictEqual(p.hargaBeragam, false, 'paket ' + p.id + ' ditandai padahal harganya seragam');
    });
  });

  test('baris yang tanggalnya tidak terbaca dihargai harga PALING AWAL', () => {
    // Sengaja begitu, dan arahnya penting: menebak "lama" tidak pernah
    // menggelembungkan pendapatan. Menebak "baru" bisa.
    const csv = [
      new Array(10).fill('judul').join(','),
      baris('catatan tangan', 'Individual (1 student)'),
    ].join('\n');
    const s = hitungStatistik(csv, SETELAH_NAIK);
    assert.strictEqual(s.totalPendapatan, HARGA_LAMA[0]);
  });

  test('harga yang diubah tanpa sempat tercatat tetap dipakai untuk pendaftar sesudahnya', () => {
    // Riwayatnya cuma berisi harga lama, sedangkan harga sekarang sudah
    // berbeda. susunRiwayatHarga() menambahkan harga sekarang sebagai
    // entri terakhir supaya pendaftar baru tidak ikut dihargai murah.
    const riwayat = susunRiwayatHarga({
      pkg1Price: 99000, pkg2Price: 90000, pkg3Price: 80000,
      hargaRiwayat: [entriRiwayatHarga(null, HARGA_LAMA)],
    });
    assert.strictEqual(riwayat.length, 2);
    assert.deepStrictEqual(riwayat[0].harga, HARGA_LAMA);
    assert.deepStrictEqual(riwayat[1].harga, [99000, 90000, 80000]);
    assert.strictEqual(riwayat[0].sejak, null, 'entri pertama harus berlaku sejak awal');
    assert.ok(Number.isFinite(riwayat[1].sejak), 'entri kedua harus punya waktu berlaku');
  });

  test('riwayat yang urutannya terbalik tetap dibaca urut waktu', () => {
    const riwayat = susunRiwayatHarga({
      pkg1Price: HARGA_BARU[0], pkg2Price: HARGA_BARU[1], pkg3Price: HARGA_BARU[2],
      hargaRiwayat: [
        entriRiwayatHarga('2026-06-01T00:00:00.000Z', HARGA_BARU),
        entriRiwayatHarga(null, HARGA_LAMA),
      ],
    });
    assert.deepStrictEqual(riwayat.map((r) => r.harga), [HARGA_LAMA, HARGA_BARU]);
  });
});

/**
 * ============================================================
 * PENULIS DAN PEMBACA CATATAN HARGA HARUS SEPAKAT
 * ============================================================
 * api/admin-content.js MENULIS catatan riwayat harga, statistik.js
 * MEMBACANYA. Nama kuncinya dulu diketik penuh di kedua berkas. Kalau
 * salah satu diganti sendirian, riwayatnya tetap tersimpan dan
 * /analitik tetap terbuka, cuma tidak ada satu pun kunci yang cocok
 * sehingga SEMUA baris jatuh ke harga paling awal. Uang di layar
 * berubah tanpa satu pun pesan galat.
 */
describe('bentuk catatan riwayat harga', () => {
  test('entriRiwayatHarga memakai kunci yang sama dengan PAKET', () => {
    const entri = entriRiwayatHarga(null, [1, 2, 3]);
    PAKET.forEach((p, i) => {
      assert.strictEqual(entri[p.kunciHarga], i + 1,
        'kunci ' + p.kunciHarga + ' tidak ditulis entriRiwayatHarga');
    });
  });

  test('bentuknya masih sama dengan yang sudah terlanjur tersimpan', () => {
    // Catatan yang sudah ada di Global Config ditulis dengan bentuk ini.
    // Kalau bentuknya bergeser, riwayat lama berhenti terbaca dan
    // pendapatan batch lama ikut berubah.
    assert.deepStrictEqual(entriRiwayatHarga(null, [59000, 53000, 47000]), {
      berlakuSejak: null,
      pkg1Price: 59000,
      pkg2Price: 53000,
      pkg3Price: 47000,
    });
  });

  test('admin-content memakai fungsi ini, bukan menulis kuncinya sendiri', () => {
    // Dibaca dari berkasnya supaya duplikasi yang dulu ada tidak
    // diam-diam kembali. Yang dilarang menulis ulang nama kuncinya di
    // sana, bukan menyebutnya.
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'api', 'admin-content.js'), 'utf8'
    );
    assert.ok(src.includes('entriRiwayatHarga'), 'admin-content.js tidak memakai entriRiwayatHarga');
    PAKET.forEach((p) => {
      assert.ok(
        !new RegExp(p.kunciHarga + '[ ]*:').test(src),
        'admin-content.js menulis ulang kunci ' + p.kunciHarga + ', pakai entriRiwayatHarga saja'
      );
    });
  });
});
