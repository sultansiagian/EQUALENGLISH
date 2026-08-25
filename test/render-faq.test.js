const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderFaq } = require('../api/render-home');

const TEMPLATE = fs.readFileSync(
  path.join(__dirname, '..', 'home-template.html'),
  'utf8'
);

/**
 * Yang paling penting diuji di sini bukan tampilannya, melainkan
 * KAPAN section ini TIDAK tampil. Jawaban soal pengembalian dana dan
 * syarat peserta cuma boleh datang dari pemiliknya; sampai itu diisi,
 * halaman harus berperilaku seolah section ini tidak pernah ada.
 */
describe('renderFaq: kapan tidak tampil', () => {
  test('belum diisi sama sekali', () => {
    assert.strictEqual(renderFaq({}), '');
    assert.strictEqual(renderFaq({ faq: [] }), '');
  });

  test('bukan array', () => {
    assert.strictEqual(renderFaq({ faq: 'apa saja' }), '');
    assert.strictEqual(renderFaq({ faq: null }), '');
  });

  test('pertanyaan tanpa jawaban TIDAK ditampilkan', () => {
    // Lebih buruk daripada tidak ada: orangnya menemukan pertanyaannya
    // sendiri, lalu tidak menemukan jawabannya.
    assert.strictEqual(renderFaq({ faq: [{ tanya: 'Uangnya bisa balik?', jawab: '' }] }), '');
    assert.strictEqual(renderFaq({ faq: [{ tanya: '  ', jawab: '   ' }] }), '');
  });

  test('jawaban tanpa pertanyaan juga tidak ditampilkan', () => {
    assert.strictEqual(renderFaq({ faq: [{ tanya: '', jawab: 'Bisa.' }] }), '');
  });

  test('yang setengah isi disaring, yang lengkap tetap tayang', () => {
    const html = renderFaq({
      faq: [
        { tanya: 'Lengkap?', jawab: 'Iya.' },
        { tanya: 'Setengah', jawab: '' },
      ],
    });
    assert.ok(html.includes('Lengkap?'));
    assert.ok(!html.includes('Setengah'));
  });
});

describe('renderFaq: isi yang tayang', () => {
  const html = renderFaq({
    faq: [
      { tanya: 'Rekamannya bisa dibuka berapa lama?', jawab: 'Selama masa aksesmu berlaku.' },
      { tanya: 'Kalau bolos satu sesi?', jawab: 'Rekamannya tetap bisa\nkamu buka.' },
    ],
  });

  test('memakai details/summary, bukan akordeon buatan sendiri', () => {
    // Bisa dibuka lewat keyboard, dibacakan pembaca layar, dan ditemukan
    // Ctrl+F browser tanpa satu baris JavaScript pun.
    assert.ok(html.includes('<details'));
    assert.ok(html.includes('<summary>'));
  });

  test('baris baru di jawaban jadi <br>', () => {
    assert.ok(html.includes('kamu buka'));
    assert.ok(html.includes('<br />'));
  });

  test('structured data FAQPage ikut dipasang', () => {
    assert.ok(html.includes('application/ld+json'));
    assert.ok(html.includes('FAQPage'));
    assert.ok(html.includes('acceptedAnswer'));
  });

  test('punya id=faq supaya /faq bisa mengarah ke sini', () => {
    assert.ok(html.includes('id="faq"'));
  });
});

describe('renderFaq: isi yang berbahaya', () => {
  test('tag di pertanyaan dan jawaban dilolos', () => {
    const html = renderFaq({
      faq: [{ tanya: '<img src=x onerror=alert(1)>', jawab: '<b>tebal</b>' }],
    });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<b>tebal</b>'));
    assert.ok(html.includes('&lt;'));
  });

  test('penutup tag script di jawaban tidak bisa mengakhiri blok JSON-LD', () => {
    // Kalau ini lolos, isi jawaban bisa menyuntikkan skrip ke beranda
    // lewat panel admin.
    const html = renderFaq({
      faq: [{ tanya: 'Tanya', jawab: '</script><script>alert(1)</script>' }],
    });
    const antara = html.slice(html.indexOf('application/ld+json'));
    const penutupPertama = antara.indexOf('</script>');
    const adaScriptJahat = antara.slice(0, penutupPertama).includes('<script>alert');
    assert.ok(!adaScriptJahat, 'blok JSON-LD bisa diakhiri lebih awal oleh isi jawaban');
  });
});

describe('penanda di home-template.html', () => {
  test('penanda section dan nav dua-duanya ada', () => {
    // Kalau penandanya hilang atau namanya berubah, renderFaq tetap
    // jalan tapi hasilnya tidak pernah masuk ke halaman, dan tidak ada
    // error di mana pun.
    assert.ok(TEMPLATE.includes('<!--FAQ:MULAI--><!--FAQ:SELESAI-->'));
    assert.ok(TEMPLATE.includes('<!--FAQNAV:MULAI--><!--FAQNAV:SELESAI-->'));
  });

  test('FAQ diletakkan sebelum section CTA', () => {
    // Keraguan yang belum terjawab harus habis dulu, baru tombol
    // daftarnya disodorkan.
    assert.ok(TEMPLATE.indexOf('<!--FAQ:MULAI-->') < TEMPLATE.indexOf('id="mulai"'));
  });
});
