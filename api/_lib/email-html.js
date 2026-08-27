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
  // Teks DI ATAS pink. Pink tetap warna terang di mode gelap, jadi nilai
  // ini sengaja satu-satunya yang TIDAK punya pasangan gelap di bawah.
  teksDiPink: '#1a1016',
};

/**
 * Pasangan gelap dari WARNA di atas.
 *
 * Nilainya sengaja sama persis dengan token mode gelap di tokens.css
 * (--surface, --surface-2, --ink, --ink-muted, --pink), supaya email dan
 * situs tidak pelan-pelan berpisah jadi dua "mode gelap" yang beda.
 *
 * --line di situs berupa rgba, dan rgba tidak bisa diandalkan sebagai
 * warna border di email, jadi di sini dipakai hasil datarnya di atas
 * kartu: rgba(242,239,236,0.16) di atas #201e24 = #423f44.
 */
const GELAP = {
  latar: '#17161a',
  kartu: '#201e24',
  teks: '#f2efec',
  teksRedup: '#a5a1aa',
  garis: '#423f44',
  pink: '#e79bc7',
};

/**
 * ============================================================
 * MODE GELAP DI EMAIL
 * ============================================================
 * Masalahnya bukan teori: logo email adalah wordmark HITAM di atas latar
 * tembus pandang, dan kartunya putih. Begitu kotak masuknya gelap,
 * kartu putih itu ikut digelapkan sementara gambarnya tidak pernah ikut
 * dibalik, jadi yang tersisa cuma balok pink kecil di kiri atas. Logonya
 * hilang, dan itu persis yang dilaporkan.
 *
 * Ada dua jenis klien, dan keduanya butuh jawaban yang berbeda:
 *
 *   1. Yang MENGHORMATI prefers-color-scheme (Apple Mail, iOS Mail,
 *      Outlook.com, sebagian Gmail). Untuk mereka email ini membawa
 *      paletnya sendiri lewat <style> di bawah, dan logonya ditukar ke
 *      versi terang. Hasilnya email gelap yang memang dirancang, bukan
 *      hasil pembalikan mesin.
 *
 *   2. Yang MEMBALIK WARNA sendiri tanpa menanyakan apa pun (Gmail di
 *      Android/iOS, Outlook untuk Windows). Mereka tidak membaca media
 *      query, jadi satu-satunya pegangan adalah dua meta di bawah:
 *      color-scheme dan supported-color-schemes memberi tahu klien bahwa
 *      email ini sudah mengurus mode gelapnya sendiri, dan sebagian
 *      besar berhenti membalik begitu melihatnya.
 *
 * Selain itu ada selector [data-ogsc]/[data-ogsb]. Outlook.com dan Gmail
 * menempelkan atribut itu ke elemen waktu mereka membalik warna, jadi ia
 * satu-satunya kail yang tersedia di jalur pembalikan otomatis.
 *
 * SEMUA gaya inline tetap versi TERANG. Itu disengaja: klien yang
 * membuang <style> sama sekali (sebagian Gmail lama, banyak webmail
 * korporat) tetap menerima email terang yang utuh dan benar, bukan email
 * setengah jadi. Blok di bawah cuma menambah, tidak pernah jadi syarat.
 */
function gayaGelap() {
  return (
    '<style type="text/css">' +
    ':root{color-scheme:light dark;supported-color-schemes:light dark;}' +
    '@media (prefers-color-scheme: dark){' +
    '.eq-latar{background:' + GELAP.latar + ' !important;}' +
    '.eq-kartu{background:' + GELAP.kartu + ' !important;}' +
    '.eq-judul{color:' + GELAP.teks + ' !important;}' +
    '.eq-teks{color:' + GELAP.teksRedup + ' !important;}' +
    '.eq-kaki{color:' + GELAP.teksRedup + ' !important;border-top-color:' + GELAP.garis + ' !important;}' +
    '.eq-tombol-utama{background:' + GELAP.pink + ' !important;}' +
    '.eq-tombol-kedua{background:' + GELAP.kartu + ' !important;border-color:' + GELAP.garis + ' !important;}' +
    '.eq-tombol-kedua a{color:' + GELAP.teks + ' !important;}' +
    // Penukaran logo. Yang terang disembunyikan dengan display:none DAN
    // max-height:0 -- sebagian klien mengabaikan salah satunya, dan yang
    // lolos akan menyisakan celah kosong setinggi logo di atas judul.
    '.eq-logo-terang{display:none !important;max-height:0 !important;overflow:hidden !important;mso-hide:all;}' +
    '.eq-logo-gelap{display:block !important;max-height:none !important;overflow:visible !important;}' +
    '}' +
    // Jalur pembalikan otomatis Outlook.com/Gmail.
    '[data-ogsc] .eq-judul{color:' + GELAP.teks + ' !important;}' +
    '[data-ogsc] .eq-teks{color:' + GELAP.teksRedup + ' !important;}' +
    '[data-ogsc] .eq-kaki{color:' + GELAP.teksRedup + ' !important;}' +
    '[data-ogsc] .eq-logo-terang{display:none !important;max-height:0 !important;overflow:hidden !important;}' +
    '[data-ogsc] .eq-logo-gelap{display:block !important;max-height:none !important;overflow:visible !important;}' +
    '[data-ogsb] .eq-kartu{background:' + GELAP.kartu + ' !important;}' +
    '[data-ogsb] .eq-latar{background:' + GELAP.latar + ' !important;}' +
    '</style>'
  );
}

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

/**
 * Dua tombol bersebelahan dalam SATU baris tabel.
 *
 * Catatan di bawah (di tombolBawah) menjelaskan kenapa dulu dibatasi satu
 * tombol per email: dua tombol besar bertumpuk membuat email terbaca
 * seperti brosur. Yang dihindari itu tumpukannya, bukan jumlahnya. Satu
 * baris berisi dua tombol berukuran sedang adalah bentuk yang lazim di
 * email transaksi ("lihat pesanan" / "hubungi kami"), dan tetap terbaca
 * sebagai tindak lanjut, bukan iklan.
 *
 * Ditulis sebagai <td> bersebelahan, bukan dua tabel yang di-float:
 * Outlook mengabaikan float, dan tombolnya akan menumpuk di sana persis
 * seperti bentuk yang mau dihindari.
 */
function barisTombolGanda(utama, kedua) {
  return (
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" ' +
    'style="margin:0 auto;"><tr>' +
    '<td style="padding:0 6px;">' + utama + '</td>' +
    '<td style="padding:0 6px;">' + kedua + '</td>' +
    '</tr></table>'
  );
}

/**
 * @param {string} url
 * @param {string} label
 * @param {boolean} sekunder  Tombol kedua: latar putih bergaris, supaya
 *                            yang pink tetap terbaca sebagai tindakan
 *                            utama waktu keduanya bersebelahan.
 */
function tombol(url, label, sekunder) {
  if (sekunder) {
    return (
      '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" ' +
      'style="margin:0 auto;">' +
      '<tr><td align="center" bgcolor="' + WARNA.kartu + '" class="eq-tombol-kedua" ' +
      'style="border-radius:999px;border:1px solid ' + WARNA.garis + ';">' +
      '<a href="' + escapeHtml(url) + '" ' +
      'style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;' +
      'font-size:14px;font-weight:bold;color:' + WARNA.teks + ';text-decoration:none;' +
      'border-radius:999px;">' +
      escapeHtml(label) +
      '</a></td></tr></table>'
    );
  }
  return tombolUtama(url, label);
}

function tombolUtama(url, label) {
  // Tombol "antipeluru": warnanya dipasang di <td>, bukan di <a>. Outlook
  // mengabaikan background pada <a>, dan tanpa cara ini tombolnya muncul
  // sebagai tautan biru polos di sana.
  // align="center" ditulis sebagai ATRIBUT, bukan margin:0 auto.
  // Outlook mengabaikan margin pada tabel, dan tombolnya akan menempel
  // ke kiri di sana sementara di tempat lain terlihat di tengah.
  return (
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" ' +
    'style="margin:0 auto;">' +
    // Teksnya SENGAJA tidak diberi kelas eq-*: latarnya pink, dan pink
    // tetap warna terang di mode gelap, jadi teks di atasnya harus tetap
    // gelap di dua-duanya. Ikut dibalikkan berarti teks terang di atas
    // pink terang -- persis jebakan yang dicatat di tokens.css.
    '<tr><td align="center" bgcolor="' + WARNA.pink + '" class="eq-tombol-utama" ' +
    'style="border-radius:999px;">' +
    '<a href="' + escapeHtml(url) + '" ' +
    'style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;' +
    'font-size:15px;font-weight:bold;color:' + WARNA.teksDiPink + ';text-decoration:none;' +
    'border-radius:999px;">' +
    escapeHtml(label) +
    '</a></td></tr></table>'
  );
}

function paragraf(teks) {
  return (
    '<p class="eq-teks" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;' +
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
 * @param {string} opsi.logoGelapUrl  Versi terang dari logo, dipakai di
 *                               kotak masuk bermode gelap. Boleh kosong:
 *                               emailnya cuma kembali memakai satu logo.
 * @param {string} opsi.asal     Asal situs, untuk melengkapi logo relatif.
 * @param {string} opsi.waUrl    Alamat WhatsApp, dipakai HANYA kalau isi
 *                               emailnya tidak punya tautan sendiri.
 */
function bungkusEmail(opsi) {
  const o = opsi || {};
  const teks = String(o.teks || '');
  const asal = String(o.asal || '');
  const logo = logoAbsolut(o.logoUrl, asal);
  const logoGelap = logoAbsolut(o.logoGelapUrl, asal);

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
      isiHtml +=
        '<div style="padding:4px 0 22px;text-align:center;">' +
        tombol(sendiri, 'Buka Ruang Kelas') +
        '</div>';
      adaTombol = true;
      return;
    }
    isiHtml += paragraf(p);
  });

  // Kalau isi emailnya SUDAH punya tautan sendiri (mis. templat akses
  // yang berisi {link}), tidak ada tombol tambahan sama sekali. Aturan itu
  // tidak berubah: email yang sudah punya satu ajakan jelas tidak boleh
  // dibebani ajakan kedua yang bersaing dengannya.
  //
  // Yang berubah: kalau BELUM ada tautan di isinya (yaitu email tanda
  // terima), tombol bawahnya boleh dua dan bersebelahan. "Cek status"
  // jadi yang utama karena itu yang paling dibutuhkan orang setelah
  // mengirim formulir, dan ia menjawab sendiri tanpa perlu ada yang
  // membalas chat. WhatsApp jadi tombol kedua.
  //
  // Tombol bawah memang ditaruh di bawah, dan itu benar: keduanya bukan
  // lanjutan dari kalimat mana pun, melainkan tawaran bantuan setelah
  // seluruh isinya dibaca.
  const waUrl = urlAman(o.waUrl);
  const statusUrl = urlAman(o.statusUrl);
  let tombolBawah = '';
  if (!adaTombol) {
    if (statusUrl && waUrl) {
      tombolBawah = barisTombolGanda(
        tombol(statusUrl, 'Cek Status'),
        tombol(waUrl, 'Chat WhatsApp', true)
      );
    } else if (statusUrl) {
      tombolBawah = tombol(statusUrl, 'Cek Status');
    } else if (waUrl) {
      tombolBawah = tombol(waUrl, 'Chat WhatsApp');
    }
  }

  // 120x56 mengikuti rasio berkasnya (562x262). Kalau logonya diganti
  // dengan berkas berasio lain, angka ini ikut diubah -- ukuran yang
  // tidak sesuai membuat logonya gepeng, dan email tidak punya
  // object-fit untuk menyelamatkannya.
  //
  // width/height ditulis sebagai atribut DAN di gaya inline: sebagian
  // klien mengabaikan salah satunya, dan tanpa ukuran yang pasti logonya
  // melar sepenuh amplop sebelum gambarnya selesai dimuat.
  function gambarLogo(src) {
    return (
      '<img src="' + escapeHtml(src) + '" alt="EQUAL English" width="120" ' +
      'height="56" style="display:block;width:120px;height:56px;border:0;" />'
    );
  }

  // Logo versi terang untuk kotak masuk yang gelap. Dua <img>, bukan satu
  // yang ditukar src-nya lewat CSS: penukaran src cuma jalan di WebKit,
  // sedangkan menyembunyikan salah satu dari dua elemen adalah satu-
  // satunya cara yang dimengerti Outlook.com dan Gmail juga.
  //
  // Kalau versi gelapnya tidak disetel, seluruh mekanisme ini dilewati
  // dan emailnya kembali persis seperti sebelumnya: satu logo, tanpa
  // pembungkus tambahan. Lebih baik begitu daripada menampilkan dua logo
  // bertumpuk di klien yang tidak paham penyembunyiannya.
  const barisLogo = logo
    ? '<tr><td style="padding:32px 32px 0;">' +
      (logoGelap
        ? '<div class="eq-logo-terang">' + gambarLogo(logo) + '</div>' +
          // Dibungkus komentar kondisional supaya Outlook untuk Windows
          // (yang tidak mengenal display:none di sini) tidak pernah
          // melihatnya sama sekali, jadi tidak mungkin tampil dobel.
          '<!--[if !mso]><!-->' +
          '<div class="eq-logo-gelap" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">' +
          gambarLogo(logoGelap) +
          '</div>' +
          '<!--<![endif]-->'
        : gambarLogo(logo)) +
      '</td></tr>'
    : '';

  const barisTombol = tombolBawah
    ? '<tr><td align="center" style="padding:8px 32px 0;text-align:center;">' + tombolBawah + '</td></tr>'
    : '';

  return (
    '<!doctype html><html lang="id"><head>' +
    '<meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    // Dua meta ini yang membuat sebagian besar klien BERHENTI membalik
    // warna sendiri dan menyerahkannya ke <style> di bawah. Tanpa
    // keduanya, media query di sana tidak pernah kebagian giliran.
    '<meta name="color-scheme" content="light dark" />' +
    '<meta name="supported-color-schemes" content="light dark" />' +
    '<title>' + escapeHtml(o.subjek || '') + '</title>' +
    gayaGelap() +
    '</head>' +
    '<body class="eq-latar" style="margin:0;padding:0;background:' + WARNA.latar + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'class="eq-latar" style="background:' + WARNA.latar + ';padding:24px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="' + LEBAR + '" cellpadding="0" cellspacing="0" border="0" ' +
    'class="eq-kartu" ' +
    'style="width:100%;max-width:' + LEBAR + 'px;background:' + WARNA.kartu + ';border-radius:16px;">' +
    barisLogo +
    '<tr><td style="padding:24px 32px 0;">' +
    '<h1 class="eq-judul" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;' +
    'line-height:1.25;color:' + WARNA.teks + ';">' +
    escapeHtml(o.subjek || '') +
    '</h1></td></tr>' +
    '<tr><td style="padding:20px 32px 0;">' + isiHtml + '</td></tr>' +
    barisTombol +
    '<tr><td style="padding:28px 32px 32px;">' +
    '<div class="eq-kaki" style="border-top:1px solid ' + WARNA.garis + ';padding-top:16px;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:' +
    WARNA.teksRedup + ';">' +
    'Email ini dikirim otomatis karena kamu mendaftar di EQUAL English. ' +
    'Balas email ini kalau ada yang mau ditanyakan.' +
    '</div></td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

module.exports = { bungkusEmail, linkWhatsApp, asalDari, escapeHtml, urlAman };
