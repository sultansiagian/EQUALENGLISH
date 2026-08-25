const { test, describe } = require('node:test');
const assert = require('node:assert');
const { bungkusEmail, linkWhatsApp, asalDari, urlAman, escapeHtml } = require('../api/_lib/email-html');

const ASAL = 'https://equalenglish.vercel.app';

describe('tombol di email tanda terima', () => {
  const terima = bungkusEmail({
    subjek: 'Pendaftaran kamu sudah kami terima',
    teks: 'Halo Sultan,\n\nTerima kasih sudah mendaftar.\n\nEQUAL English',
    statusUrl: ASAL + '/status',
    waUrl: 'https://wa.me/6285888345058',
    logoUrl: '/EDITS/logo-equal-black.png',
    asal: ASAL,
  });

  test('dua tombol muncul', () => {
    assert.ok(terima.includes('Cek Status'));
    assert.ok(terima.includes('Chat WhatsApp'));
  });

  test('keduanya BERSEBELAHAN dalam satu baris tabel', () => {
    // Outlook mengabaikan float dan margin pada tabel, jadi satu-satunya
    // susunan yang benar-benar bersebelahan di semua klien adalah dua
    // <td> dalam satu <tr>. Kalau ini berubah jadi dua tabel terpisah,
    // tombolnya menumpuk dan emailnya terbaca seperti brosur.
    assert.match(
      terima,
      /<tr>\s*<td style="padding:0 6px;">[\s\S]*?<\/td>\s*<td style="padding:0 6px;">[\s\S]*?<\/td>\s*<\/tr>/
    );
  });

  test('logo relatif dilengkapi jadi URL penuh', () => {
    // Di email, jalur relatif tidak berarti apa-apa: tidak ada halaman
    // yang jadi acuannya, jadi logonya muncul sebagai gambar rusak.
    assert.ok(terima.includes(ASAL + '/EDITS/logo-equal-black.png'));
  });
});

describe('email yang isinya sudah punya tautan', () => {
  const akses = bungkusEmail({
    subjek: 'Akses ruang kelas kamu sudah dibuka',
    teks: 'Halo Sultan,\n\nSudah bisa dibuka:\n\n' + ASAL + '/kelas\n\nEQUAL English',
    statusUrl: '',
    waUrl: 'https://wa.me/6285888345058',
    asal: ASAL,
  });

  test('tautan di isinya diangkat jadi tombol', () => {
    assert.ok(akses.includes('Buka Ruang Kelas'));
  });

  test('TIDAK ada tombol tambahan yang bersaing dengannya', () => {
    assert.ok(!akses.includes('Chat WhatsApp'));
    assert.ok(!akses.includes('Cek Status'));
  });
});

describe('urlAman', () => {
  test('http dan https diterima', () => {
    assert.strictEqual(urlAman('https://a.com/x'), 'https://a.com/x');
    assert.strictEqual(urlAman('http://a.com'), 'http://a.com');
  });

  test('skema lain ditolak', () => {
    // Tombol di email diklik orang tanpa berpikir, jadi skema ini tidak
    // punya alasan berada di sana sama sekali.
    assert.strictEqual(urlAman('javascript:alert(1)'), '');
    assert.strictEqual(urlAman('data:text/html,<script>'), '');
    assert.strictEqual(urlAman(''), '');
  });

  test('url berbahaya tidak jadi tombol di email', () => {
    const html = bungkusEmail({ subjek: 'Halo', teks: 'Isi.', statusUrl: 'javascript:alert(1)' });
    assert.ok(!html.includes('javascript:'));
  });
});

describe('linkWhatsApp', () => {
  test('menerima bentuk apa pun yang biasa diketik orang', () => {
    const harapan = 'https://wa.me/6285888345058';
    assert.strictEqual(linkWhatsApp('0858-8834-5058'), harapan);
    assert.strictEqual(linkWhatsApp('+62 858 8834 5058'), harapan);
    assert.strictEqual(linkWhatsApp('62858 8834 5058'), harapan);
  });

  test('nomor yang tidak masuk akal ditolak', () => {
    assert.strictEqual(linkWhatsApp('123'), '');
    assert.strictEqual(linkWhatsApp(''), '');
  });
});

describe('asalDari', () => {
  test('mengambil asal dari URL penuh', () => {
    assert.strictEqual(asalDari(ASAL + '/kelas'), ASAL);
  });

  test('nilai yang bukan URL jadi kosong', () => {
    assert.strictEqual(asalDari('/kelas'), '');
    assert.strictEqual(asalDari(''), '');
  });
});

describe('escapeHtml', () => {
  test('teks dari admin tidak bisa menyuntikkan tag', () => {
    // Isi email disunting admin sebagai teks biasa. Kalau tidak dilolos,
    // satu tanda kurung siku cukup untuk merusak seluruh tampilannya.
    const html = bungkusEmail({ subjek: '<script>x</script>', teks: 'Halo' });
    assert.ok(!html.includes('<script>x</script>'));
    assert.strictEqual(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
  });
});
