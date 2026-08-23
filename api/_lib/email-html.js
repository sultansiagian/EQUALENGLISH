/**
 * Membungkus teks email biasa jadi HTML berlogo.
 *
 * KENAPA PEMBUNGKUSNYA DI SINI, BUKAN DI TEKS YANG DISUNTING ADMIN
 * ------------------------------------------------------------------
 * Isi email disunting dari /atur-form sebagai teks biasa, dan itu tidak
 * berubah. Kalau yang disunting adalah HTML, mengganti satu kalimat di
 * email berubah jadi pekerjaan programmer, dan cepat atau lambat ada tag
 * yang tidak tertutup lalu emailnya berantakan di kotak masuk orang.
 *
 * Jadi pembagiannya: admin menulis kalimat, file ini yang mengurus
 * tampilannya.
 *
 * KENAPA TABEL DAN GAYA INLINE, BUKAN CSS BIASA
 * ------------------------------------------------------------------
 * Email bukan halaman web. Outlook menggambar HTML memakai mesin Word,
 * Gmail membuang <style> di banyak keadaan, dan flexbox maupun grid
 * tidak bisa diandalkan di mana pun. Tabel dengan gaya inline adalah
 * satu-satunya susunan yang berperilaku sama di semua tempat. Ini bukan
 * gaya penulisan yang ketinggalan zaman, ini memang batas medianya.
 *
 * Font situs juga sengaja tidak dicoba dipasang: Gmail membuang
 * @font-face, jadi Syne dan DM Sans tidak akan pernah muncul di email.
 * Yang dipakai Arial, dan itu memang hasil akhirnya di hampir semua
 * kotak masuk.
 */

// Lebar amplop email yang sudah jadi kebiasaan lintas aplikasi. Lebih
// dari ini mulai terpotong di sebagian klien desktop.
const LEBAR = 600;

const WARNA = {
  latar: '#f7f5f2',
  kartu: '#ffffff',
  teks: '#1a1a1a',
  teksRedup: '#5c5b5b',
  garis: '#e8e4e0',
  pink: '#ffacdf',
};

function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Hanya http/https yang boleh jadi alamat tombol.
 *
 * Nilai yang masuk ke sini berasal dari pengaturan situs, tapi tombol di
 * email adalah benda yang diklik orang tanpa berpikir. Skema lain
 * (javascript:, data:) tidak punya alasan berada di sini sama sekali,
 * jadi ditolak di depan daripada diandalkan tidak akan pernah terjadi.
 */
function urlAman(url) {
  const bersih = String(url || '').trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(bersih) ? bersih : '';
}

/**
 * Nomor WhatsApp jadi alamat wa.me.
 *
 * Menerima bentuk apa pun yang biasa ditulis orang ("0858-8834-5058",
 * "+62 858 8834 5058", "62858..."), karena yang mengisinya di /atur-form
 * mengetik seperti biasa, bukan mengikuti format tertentu.
 */
function linkWhatsApp(nomor) {
  let angka = String(nomor || '').replace(/\D/g, '');
  if (!angka) return '';
  if (angka.indexOf('0') === 0) angka = '62' + angka.slice(1);
  // Nomor Indonesia terpendek sekitar 10 digit setelah kode negara.
  if (angka.length < 10 || angka.length > 15) return '';
  return 'https://wa.me/' + angka;
}

/**
 * Logo boleh berupa jalur relatif dari pengaturan bawaan
 * ("/EDITS/Vector.png") atau URL Blob yang sudah lengkap kalau admin
 * pernah menggantinya lewat /admin. Di email, jalur relatif tidak berarti
 * apa-apa: tidak ada halaman yang jadi acuannya.
 */
function logoAbsolut(logoUrl, asal) {
  const nilai = String(logoUrl || '').trim();
  if (!nilai) return '';
  if (/^https?:\/\//i.test(nilai)) return nilai;
  if (!asal) return '';
  return asal.replace(/\/+$/, '') + '/' + nilai.replace(/^\/+/, '');
}

/**
 * Ambil asal situs ("https://contoh.vercel.app") dari sebuah URL penuh.
 * Dipakai untuk membuat alamat logo, dengan menumpang linkRuangKelas yang
 * memang sudah harus berupa URL lengkap.
 */
function asalDari(url) {
  const cocok = /^(https?:\/\/[^/]+)/i.exec(String(url || '').trim());
  return cocok ? cocok[1] : '';
}

function tombol(url, label) {
  // Tombol "antipeluru": warnanya dipasang di <td>, bukan di <a>. Outlook
  // mengabaikan background pada <a>, dan tanpa cara ini tombolnya muncul
  // sebagai tautan biru polos di sana.
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td align="center" bgcolor="' + WARNA.pink + '" ' +
    'style="border-radius:999px;">' +
    '<a href="' + escapeHtml(url) + '" ' +
    'style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;' +
    'font-size:15px;font-weight:bold;color:' + WARNA.teks + ';text-decoration:none;' +
    'border-radius:999px;">' +
    escapeHtml(label) +
    '</a></td></tr></table>'
  );
}

function paragraf(teks) {
  return (
    '<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
    'line-height:1.65;color:' + WARNA.teksRedup + ';">' +
    escapeHtml(teks).replace(/\n/g, '<br />') +
    '</p>'
  );
}

/**
 * @param {object} opsi
 * @param {string} opsi.subjek   Dipakai juga sebagai judul besar di dalam
 *                               email, seperti kebiasaan email transaksi.
 * @param {string} opsi.teks     Isi email yang penandanya SUDAH diisi.
 * @param {string} opsi.logoUrl  Boleh relatif, boleh URL penuh.
 * @param {string} opsi.asal     Asal situs, untuk melengkapi logo relatif.
 * @param {string} opsi.waUrl    Alamat WhatsApp, dipakai HANYA kalau isi
 *                               emailnya tidak punya tautan sendiri.
 */
function bungkusEmail(opsi) {
  const o = opsi || {};
  const teks = String(o.teks || '');
  const asal = String(o.asal || '');
  const logo = logoAbsolut(o.logoUrl, asal);

  // Satu baris kosong memisahkan paragraf, sama seperti yang terlihat
  // admin waktu mengetik di /atur-form.
  const bagian = teks.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  let isiHtml = '';
  let adaTombol = false;

  bagian.forEach((p) => {
    // Paragraf yang isinya cuma sebuah tautan diangkat jadi tombol, bukan
    // ditulis sebagai URL panjang di tengah kalimat. Templat email akses
    // memang berbentuk begitu: satu baris berisi {link} saja.
    const sendiri = urlAman(p);
    if (sendiri && !adaTombol) {
      // DI POSISI ASLINYA, bukan dikumpulkan di bawah. Kalimat sebelumnya
      // ditulis untuk memperkenalkan tautan itu ("...sudah bisa dibuka
      // sekarang:"), jadi memindahkan tombolnya ke bawah tanda tangan
      // membuat kalimat itu menunjuk ke tempat kosong dan tombolnya
      // muncul entah dari mana. Ketahuan waktu hasilnya dirender.
      isiHtml += '<div style="padding:4px 0 22px;">' + tombol(sendiri, 'Buka Ruang Kelas') + '</div>';
      adaTombol = true;
      return;
    }
    isiHtml += paragraf(p);
  });

  // Cuma satu tombol per email. Kalau isinya sudah punya tautan sendiri,
  // WhatsApp tidak ikut ditawarkan: dua tombol besar membuat email
  // terbaca seperti brosur, dan itu yang paling gampang disaring spam.
  //
  // Tombol WhatsApp memang ditaruh di bawah, dan itu benar: dia bukan
  // lanjutan dari kalimat mana pun, melainkan tawaran bantuan setelah
  // seluruh isinya dibaca.
  const tombolBawah = !adaTombol && urlAman(o.waUrl) ? tombol(o.waUrl, 'Chat WhatsApp') : '';

  const barisLogo = logo
    ? '<tr><td style="padding:32px 32px 0;">' +
      '<img src="' + escapeHtml(logo) + '" alt="EQUAL English" width="140" ' +
      // width/height ditulis sebagai atribut DAN di gaya inline: sebagian
      // klien mengabaikan salah satunya, dan tanpa ukuran yang pasti
      // logonya melar sepenuh amplop sebelum gambarnya selesai dimuat.
      'height="39" style="display:block;width:140px;height:39px;border:0;" />' +
      '</td></tr>'
    : '';

  const barisTombol = tombolBawah
    ? '<tr><td style="padding:8px 32px 0;">' + tombolBawah + '</td></tr>'
    : '';

  return (
    '<!doctype html><html lang="id"><head>' +
    '<meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<title>' + escapeHtml(o.subjek || '') + '</title>' +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + WARNA.latar + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="background:' + WARNA.latar + ';padding:24px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="' + LEBAR + '" cellpadding="0" cellspacing="0" border="0" ' +
    'style="width:100%;max-width:' + LEBAR + 'px;background:' + WARNA.kartu + ';border-radius:16px;">' +
    barisLogo +
    '<tr><td style="padding:24px 32px 0;">' +
    '<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;' +
    'line-height:1.25;color:' + WARNA.teks + ';">' +
    escapeHtml(o.subjek || '') +
    '</h1></td></tr>' +
    '<tr><td style="padding:20px 32px 0;">' + isiHtml + '</td></tr>' +
    barisTombol +
    '<tr><td style="padding:28px 32px 32px;">' +
    '<div style="border-top:1px solid ' + WARNA.garis + ';padding-top:16px;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:' +
    WARNA.teksRedup + ';">' +
    'Email ini dikirim otomatis karena kamu mendaftar di EQUAL English. ' +
    'Balas email ini kalau ada yang mau ditanyakan.' +
    '</div></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

module.exports = { bungkusEmail, linkWhatsApp, asalDari, escapeHtml, urlAman };
