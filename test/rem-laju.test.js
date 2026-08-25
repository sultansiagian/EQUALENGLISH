const { test, describe } = require('node:test');
const assert = require('node:assert');
const { alamatIp, bolehKirimForm, bolehKirimTandaTerima } = require('../api/_lib/rem-laju');

/**
 * Rem laju menyimpan hitungannya di memori modul, jadi urutan tes di
 * berkas ini SALING MEMENGARUHI dan itu disengaja: yang diuji justru
 * perilakunya sepanjang rentetan permintaan, bukan satu panggilan.
 *
 * Tes jatah global di bawah bergantung pada berapa email yang sudah
 * terpakai di tes sebelumnya, jadi jangan menyisipkan tes email baru di
 * tengah tanpa ikut menyesuaikan angkanya.
 */
describe('batas per IP', () => {
  test('20 permintaan lolos, sisanya ditolak', () => {
    const req = { headers: { 'x-forwarded-for': '10.0.0.1, 172.16.0.1' } };
    let lolos = 0;
    let tolak = 0;
    for (let i = 0; i < 25; i++) (bolehKirimForm(req).boleh ? lolos++ : tolak++);
    assert.strictEqual(lolos, 20);
    assert.strictEqual(tolak, 5);
  });

  test('IP lain tidak ikut terkunci', () => {
    // Penting karena wifi kampus membuat banyak orang terlihat sebagai
    // satu IP; yang tidak boleh terjadi adalah satu IP mengunci yang lain.
    assert.strictEqual(bolehKirimForm({ headers: { 'x-forwarded-for': '10.0.0.2' } }).boleh, true);
  });

  test('penolakan memberi tungguDetik yang masuk akal', () => {
    const req = { headers: { 'x-forwarded-for': '10.0.0.1' } };
    const hasil = bolehKirimForm(req);
    assert.strictEqual(hasil.boleh, false);
    assert.ok(hasil.tungguDetik > 0 && hasil.tungguDetik <= 600, 'dapat ' + hasil.tungguDetik);
  });
});

describe('alamatIp', () => {
  test('entri PERTAMA rantai x-forwarded-for yang dipakai', () => {
    // Sisanya proxy. Salah ambil berarti seluruh lalu lintas terlihat
    // datang dari satu alamat proxy, dan rem lajunya mengunci semua orang.
    assert.strictEqual(alamatIp({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } }), '1.1.1.1');
  });

  test('jatuh ke x-real-ip kalau tidak ada rantai', () => {
    assert.strictEqual(alamatIp({ headers: { 'x-real-ip': '9.9.9.9' } }), '9.9.9.9');
  });

  test('tanpa header apa pun tetap mengembalikan kunci, bukan kosong', () => {
    // Kunci kosong akan membuat SEMUA permintaan tanpa header berbagi
    // satu ember yang sama, yang justru lebih ketat daripada seharusnya.
    assert.strictEqual(alamatIp({ headers: {} }), 'tanpa-ip');
  });
});

describe('rem tanda terima', () => {
  test('satu alamat cuma dapat satu tanda terima per jam', () => {
    assert.strictEqual(bolehKirimTandaTerima('siswa@ui.ac.id').boleh, true);
    assert.strictEqual(bolehKirimTandaTerima('siswa@ui.ac.id').boleh, false);
  });

  test('beda besar-kecil huruf tetap dianggap alamat yang sama', () => {
    assert.strictEqual(bolehKirimTandaTerima('SISWA@UI.AC.ID').boleh, false);
  });

  test('alamat lain tidak ikut tertahan', () => {
    assert.strictEqual(bolehKirimTandaTerima('lain@ui.ac.id').boleh, true);
  });

  test('alamat kosong ditolak', () => {
    assert.strictEqual(bolehKirimTandaTerima('').boleh, false);
  });

  test('PENOLAKAN karena duplikat TIDAK memakan jatah global', () => {
    // Ini bug yang pernah ada dan ketahuan lewat tes. Waktu jatah global
    // dicatat sebelum pemeriksaan alamat selesai, penyerang yang
    // menghantam satu alamat yang sama bisa menghabiskan jatah kirim
    // tanpa satu email pun benar-benar terkirim -- yaitu persis kerusakan
    // yang mau dicegah rem ini.
    //
    // Dua terpakai di atas (siswa@ dan lain@). Kalau penolakan ikut
    // memakan jatah, sisanya akan kurang dari 23.
    let kirim = 0;
    for (let i = 0; i < 40; i++) {
      if (bolehKirimTandaTerima('orang' + i + '@contoh.com').boleh) kirim++;
    }
    assert.strictEqual(kirim + 2, 25, 'jatah global terpakai oleh email yang tidak jadi dikirim');
  });
});
