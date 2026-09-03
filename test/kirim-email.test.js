const { test, describe } = require('node:test');
const assert = require('node:assert');
const { isiPenanda } = require('../api/_lib/kirim-email');
const { linkWhatsApp, urlAman, escapeHtml } = require('../api/_lib/email-html');

/**
 * ============================================================
 * KENAPA BERKAS INI ADA
 * ============================================================
 *
 * Email adalah satu-satunya bagian sistem ini yang keluar dari layar dan
 * mendarat di kotak masuk orang lain. Salahnya tidak bisa ditarik balik,
 * dan tidak ada yang melihatnya sebelum terkirim.
 *
 * Yang paling berisiko bukan pengirimannya (itu Apps Script), melainkan
 * PENYUSUNAN TEKSNYA: penanda {nama} dan {link} diganti nilai yang
 * berasal dari isian orang, dan tautan WhatsApp dibentuk dari nomor yang
 * diketik bebas di /atur-form. Dua-duanya berupa fungsi murni, jadi bisa
 * diuji tanpa mengirim satu email pun.
 */

describe('isiPenanda', () => {
  test('mengganti penanda yang dikenal', () => {
    assert.strictEqual(
      isiPenanda('Halo {nama}, buka {link} ya.', { nama: 'Sultan', link: 'https://x/kelas' }),
      'Halo Sultan, buka https://x/kelas ya.'
    );
  });

  test('penanda yang sama boleh muncul berkali-kali', () => {
    assert.strictEqual(isiPenanda('{nama} {nama}', { nama: 'Budi' }), 'Budi Budi');
  });

  test('penanda tanpa nilai DIBIARKAN apa adanya, tidak jadi undefined', () => {
    // Kalau ini meleset, penerimanya membaca "Halo undefined," -- terlihat
    // seperti sistem yang rusak, dan itu email pertama yang dia terima
    // dari kita.
    assert.strictEqual(isiPenanda('Halo {nama}.', {}), 'Halo {nama}.');
    assert.strictEqual(isiPenanda('Buka {link}.', { nama: 'Budi' }), 'Buka {link}.');
  });

  test('penanda yang tidak dikenal tidak disentuh', () => {
    assert.strictEqual(isiPenanda('Kode {promo} berlaku.', { nama: 'A' }), 'Kode {promo} berlaku.');
  });

  test('teks kosong atau null tidak melempar error', () => {
    assert.strictEqual(isiPenanda('', { nama: 'A' }), '');
    assert.strictEqual(isiPenanda(null, { nama: 'A' }), '');
    assert.strictEqual(isiPenanda(undefined, {}), '');
  });

  test('nilai pengganti diperlakukan sebagai teks biasa, bukan pola', () => {
    // Nama yang kebetulan berisi "$&" akan diperlakukan sebagai rujukan
    // hasil cocok oleh String.replace kalau penggantinya string, bukan
    // fungsi. Fungsinya sudah memakai callback, dan tes ini menjaganya
    // tetap begitu.
    assert.strictEqual(isiPenanda('Halo {nama}.', { nama: '$&' }), 'Halo $&.');
  });
});

describe('linkWhatsApp', () => {
  test('menerima bentuk apa pun yang lazim diketik orang', () => {
    ['0858-8834-5058', '+62 858 8834 5058', '62858 8834 5058', '085888345058'].forEach((n) => {
      assert.strictEqual(linkWhatsApp(n), 'https://wa.me/6285888345058', 'gagal untuk: ' + n);
    });
  });

  test('nol di depan diganti kode negara, bukan dibuang begitu saja', () => {
    assert.strictEqual(linkWhatsApp('08123456789'), 'https://wa.me/628123456789');
  });

  test('nomor yang tidak masuk akal ditolak, bukan menghasilkan tautan rusak', () => {
    ['', null, 'bukan nomor', '0812', '0812345678901234567'].forEach((n) => {
      assert.strictEqual(linkWhatsApp(n), '', 'harusnya ditolak: ' + JSON.stringify(n));
    });
  });
});

describe('urlAman', () => {
  test('hanya http dan https yang boleh jadi tombol', () => {
    assert.strictEqual(urlAman('https://equal.test/kelas'), 'https://equal.test/kelas');
    assert.strictEqual(urlAman('http://equal.test'), 'http://equal.test');
  });

  test('skema lain ditolak', () => {
    // Tombol di email diklik orang tanpa berpikir. javascript: dan data:
    // tidak punya alasan berada di sana sama sekali.
    ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.test'].forEach((u) => {
      assert.strictEqual(urlAman(u), '', 'harusnya ditolak: ' + u);
    });
  });

  test('kosong dan spasi ditolak', () => {
    assert.strictEqual(urlAman(''), '');
    assert.strictEqual(urlAman('   '), '');
    assert.strictEqual(urlAman('https://ada spasi.test'), '');
  });
});

describe('escapeHtml', () => {
  test('melindungi kelima karakter yang berbahaya di HTML', () => {
    assert.strictEqual(
      escapeHtml('<b>"x" & \'y\'</b>'),
      '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;'
    );
  });

  test('ampersand dilindungi DULUAN supaya tidak dobel', () => {
    // Kalau urutannya terbalik, "&lt;" hasil pelolosan pertama akan
    // dilolos lagi jadi "&amp;lt;" dan penerimanya melihat kode mentah.
    assert.strictEqual(escapeHtml('<'), '&lt;');
    assert.strictEqual(escapeHtml('&lt;'), '&amp;lt;');
  });

  test('null dan undefined jadi teks kosong', () => {
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
  });
});
