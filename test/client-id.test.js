const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ============================================================
 * KENAPA BERKAS INI ADA
 * ============================================================
 *
 * Client ID Google ditulis ulang sebagai atribut `data-client_id` di
 * DELAPAN halaman HTML, plus sekali lagi sebagai env var GOOGLE_CLIENT_ID
 * yang dipakai server untuk memverifikasi token.
 *
 * Duplikasi itu tidak bisa dihilangkan dengan mudah: pustaka Google Sign-In
 * membaca atribut itu langsung dari markup waktu skripnya dimuat, sebelum
 * kode kita sempat berjalan. Yang BISA dilakukan adalah memastikan
 * kedelapannya tidak pernah berselisih.
 *
 * Kalau satu halaman terlewat waktu client ID-nya diganti, gejalanya
 * sunyi dan menyesatkan: tujuh halaman tetap bisa login, satu halaman
 * menolak semua orang dengan pesan yang terdengar seperti masalah akun
 * ("token tidak sah"), padahal yang salah konfigurasinya. Tes ini gagal
 * duluan sebelum itu sempat ter-deploy.
 *
 * Yang TIDAK bisa dijaga tes ini: apakah nilai itu cocok dengan env var
 * GOOGLE_CLIENT_ID di Vercel. Env var tidak ada di repo, jadi kecocokan
 * itu tetap harus dipastikan manual waktu menggantinya.
 */

const AKAR = path.join(__dirname, '..');
const POLA = /data-client_id="([^"]+)"/g;

function halamanBerlogin() {
  return fs
    .readdirSync(AKAR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ({ nama: f, isi: fs.readFileSync(path.join(AKAR, f), 'utf8') }))
    .filter((h) => h.isi.includes('data-client_id'));
}

describe('Client ID Google harus sama di semua halaman', () => {
  test('ada halaman berlogin yang terbaca', () => {
    const halaman = halamanBerlogin();
    // Kalau ini gagal, kemungkinan besar POLA di atas yang usang, bukan
    // halamannya yang benar-benar hilang. Diperiksa supaya tes ini tidak
    // pernah "lolos" hanya karena tidak menemukan apa pun.
    assert.ok(
      halaman.length >= 5,
      'cuma ' + halaman.length + ' halaman berlogin terbaca; pola pembacaannya mungkin usang'
    );
  });

  test('semuanya memakai nilai yang sama persis', () => {
    const halaman = halamanBerlogin();
    const perNilai = new Map();

    halaman.forEach((h) => {
      for (const cocok of h.isi.matchAll(POLA)) {
        const id = cocok[1].trim();
        if (!perNilai.has(id)) perNilai.set(id, []);
        perNilai.get(id).push(h.nama);
      }
    });

    if (perNilai.size > 1) {
      const rincian = [...perNilai.entries()]
        .map(([id, berkas]) => '  ' + id + '  <- ' + berkas.join(', '))
        .join('\n');
      assert.fail('Client ID berbeda antar halaman:\n' + rincian);
    }

    assert.strictEqual(perNilai.size, 1);
  });

  test('bentuknya masuk akal sebagai client ID Google', () => {
    const halaman = halamanBerlogin();
    const id = [...halaman[0].isi.matchAll(POLA)][0][1];
    // Bentuk bakunya "<angka>-<huruf/angka>.apps.googleusercontent.com".
    // Diperiksa supaya nilai placeholder atau yang terpotong waktu
    // menyalin tidak diam-diam lolos.
    assert.match(
      id,
      /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
      'client ID tidak berbentuk seperti milik Google: ' + id
    );
  });
});
