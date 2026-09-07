const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const rh = require('../api/render-home');

const AKAR = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(AKAR, 'home-template.html'), 'utf8');

/**
 * ============================================================
 * SATU PENULIS SAJA UNTUK KARTU HARGA DI BERANDA
 * ============================================================
 *
 * Pernah ada DUA yang menulis kartu harga beranda:
 *
 *   1. api/render-home.js, dari sisi server, isi /admin, sebelum
 *      halaman dikirim.
 *   2. content-sheet.js, dari browser, isi Google Sheet, SETELAH
 *      halaman tampil.
 *
 * Yang belakangan menang. Akibatnya mematikan "Tersedia" di /admin tidak
 * berpengaruh apa-apa: servernya benar menandai "Tidak Tersedia", lalu
 * script itu menyalakannya lagi sepersekian detik kemudian. Dan bukan
 * cuma waktu sheet-nya bilang "Ya" -- barisnya menyalakan ulang tanpa
 * syarat, jadi sheet yang tidak menyebut Tersedia sama sekali pun tetap
 * membatalkannya.
 *
 * Salahnya sunyi total: tidak ada galat, halaman tampil normal, cuma
 * setelan pemiliknya diam-diam tidak berlaku. Yang melihatnya cuma orang
 * yang membandingkan /admin dengan beranda.
 *
 * content-sheet.js sudah dihapus 2026-09-07. Tes di bawah menjaga dua
 * hal: render-home.js benar-benar menandai paket yang dimatikan, dan
 * tidak ada script penimpa yang dipasang lagi di beranda.
 */

function kelasKartu(html, n) {
  const m = new RegExp('id="plan-card-' + n + '"[^>]*class="([^"]*)"').exec(html);
  return m ? m[1] : null;
}

function badge(html, n) {
  const m = new RegExp('id="plan-save-' + n + '"[^>]*>([\\s\\S]*?)</p>').exec(html);
  return m ? m[1].trim() : null;
}

describe('kartu harga menuruti setelan /admin', () => {
  test('paket yang dimatikan ditandai Tidak Tersedia', () => {
    const html = rh.applyPackages(TEMPLATE, { pkg2Available: false });
    assert.ok(kelasKartu(html, 2).includes('plan-card-unavailable'));
    assert.strictEqual(badge(html, 2), 'Tidak Tersedia');
  });

  test('mematikan ketiganya menandai ketiganya', () => {
    // Persis keadaan yang dilaporkan pemilik: ketiga centang dimatikan.
    const html = rh.applyPackages(TEMPLATE, {
      pkg1Available: false, pkg2Available: false, pkg3Available: false,
    });
    [1, 2, 3].forEach((n) => {
      assert.ok(
        kelasKartu(html, n).includes('plan-card-unavailable'),
        'kartu ' + n + ' tidak ditandai'
      );
      assert.strictEqual(badge(html, n), 'Tidak Tersedia', 'badge kartu ' + n + ' salah');
    });
  });

  test('kartu 3 tidak kehilangan plan-card-best waktu dimatikan', () => {
    // Kelas lain di atribut yang sama tidak boleh ikut terhapus waktu
    // penandanya ditambahkan.
    const kelas = kelasKartu(rh.applyPackages(TEMPLATE, { pkg3Available: false }), 3);
    assert.ok(kelas.includes('plan-card-best'));
    assert.ok(kelas.includes('plan-card-unavailable'));
  });

  test('dinyalakan lagi menghapus penandanya, tidak menumpuk', () => {
    const mati = rh.applyPackages(TEMPLATE, { pkg2Available: false });
    const hidup = rh.applyPackages(mati, { pkg2Available: true });
    assert.ok(!kelasKartu(hidup, 2).includes('plan-card-unavailable'));
    assert.strictEqual(badge(hidup, 2), 'Hemat Rp6.000 per orang');
  });

  test('tanpa setelan apa pun, ketiganya tersedia seperti bawaan', () => {
    const html = rh.applyPackages(TEMPLATE, {});
    [1, 2, 3].forEach((n) => {
      assert.ok(!kelasKartu(html, n).includes('plan-card-unavailable'));
    });
    assert.strictEqual(badge(html, 1), 'Harga dasar');
  });

  test('harga dari /admin benar-benar masuk ke HTML yang dikirim', () => {
    const html = rh.applyPackages(TEMPLATE, { pkg1Price: 75000, pkg3Price: 65000 });
    assert.ok(html.includes('>Rp75.000<'), 'harga paket 1 tidak tersisip');
    assert.ok(html.includes('>Rp65.000<'), 'harga paket 3 tidak tersisip');
    // Badge hemat ikut dihitung ulang dari harga baru, bukan teks lama.
    assert.strictEqual(badge(html, 3), 'Hemat Rp10.000 per orang');
  });
});

describe('tidak ada penimpa client-side di beranda', () => {
  test('content-sheet.js tidak dimuat lagi, dan berkasnya tidak ada', () => {
    assert.ok(
      !/<script[^>]+src="[^"]*content-sheet\.js"/.test(TEMPLATE),
      'content-sheet.js dipasang lagi di beranda -- itu membatalkan setelan /admin'
    );
    assert.ok(
      !fs.existsSync(path.join(AKAR, 'content-sheet.js')),
      'content-sheet.js ada lagi di repo'
    );
  });

  test('tidak ada script beranda yang menulis ke id kartu harga', () => {
    // Penjagaan yang lebih luas dari sekadar melarang satu nama berkas:
    // yang dilarang adalah SIAPA PUN yang menulis ke id kartu harga dari
    // browser, dengan nama berkas apa pun. Kalau suatu saat butuh
    // mengedit tanpa /admin, pembacaannya dilakukan di render-home.js,
    // bukan dihidupkan lagi sebagai penimpa di browser.
    const src = (TEMPLATE.match(/<script[^>]+src="\/([^"]+)"/g) || [])
      .map((s) => s.replace(/.*src="\/|"$/g, ''))
      .filter((f) => f.endsWith('.js'));

    const menulis = [];
    src.forEach((berkas) => {
      const p = path.join(AKAR, berkas);
      if (!fs.existsSync(p)) return;
      const isi = fs.readFileSync(p, 'utf8');
      if (/plan-card-|plan-save-|plan-price-|plan-name-/.test(isi)) menulis.push(berkas);
    });

    assert.deepStrictEqual(
      menulis, [],
      'script ini menyentuh kartu harga dari browser dan bisa membatalkan setelan /admin'
    );
  });
});
