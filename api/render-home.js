const fs = require('fs');
const path = require('path');
const DEFAULTS = require('./_lib/site-defaults');
const { readOverrides } = require('./_lib/global-config-store');

/**
 * Menyajikan halaman utama dari home-template.html, tapi disisipi dulu
 * konten dari Global Config (diisi lewat /admin) SEBELUM dikirim ke
 * browser pengunjung -- bukan ditimpa belakangan oleh JavaScript seperti
 * content-sheet.js yang lama.
 *
 * Kenapa begini, bukan tetap client-side: teks yang disisipkan lewat
 * JavaScript baru ada SETELAH script-nya jalan di browser pengunjung --
 * crawler yang tidak menjalankan JS (banyak dipakai AI search seperti
 * ChatGPT/Perplexity) cuma melihat teks hardcode lama di template.
 * Dengan cara ini, teks yang sudah diedit dari /admin ada di HTML asli
 * yang dikirim server, siapa pun/apa pun yang membaca sumbernya melihat
 * versi yang benar.
 *
 * home-template.html sendiri TIDAK PERNAH diubah oleh fungsi ini --
 * dibaca ulang dari disk tiap request, konten Global Config cuma menimpa
 * hasil bacanya secara sementara di memori sebelum dikirim. Kalau Global
 * Config kosong/gagal diakses, template tampil apa adanya seperti sebelum
 * ada /admin sama sekali (lihat readOverrides()).
 *
 * ====================================================================
 * KENAPA FILENYA BERNAMA home-template.html, BUKAN index.html
 *
 * Vercel mengecek FILE STATIS DULU, baru menerapkan aturan "rewrites".
 * Selama file bernama index.html ada di root, "/" selalu dilayani file
 * itu langsung dan rewrite ke fungsi ini TIDAK PERNAH JALAN -- fungsi
 * ini hidup dan benar, tapi tidak pernah dipanggil, jadi semua editan
 * dari /admin tidak pernah muncul di halaman publik.
 *
 * Ini sempat terjadi beneran dan lolos ke production, karena waktu itu
 * yang diuji cuma OUTPUT fungsi ini secara terpisah, bukan route "/"
 * di deployment sungguhan. Gejalanya menyesatkan: /api/render-home
 * mengembalikan HTML yang benar, tapi "/" mengembalikan versi lama.
 *
 * Jadi: JANGAN pernah mengembalikan nama file ini jadi index.html, dan
 * kalau menambah halaman ber-SSR lain nanti, pastikan tidak ada file
 * statis yang namanya bertabrakan dengan path-nya. Cara cepat mengecek
 * ulang: bandingkan hasil fetch "/" dengan "/api/render-home" di situs
 * yang sudah live; kalau beda, rewrite-nya tidak jalan.
 * ====================================================================
 *
 * "includeFiles": "home-template.html" di vercel.json yang memastikan
 * file template ikut ter-bundle ke fungsi ini saat deploy -- tanpa itu,
 * fs.readFileSync di bawah gagal (ENOENT) di production walau jalan
 * normal waktu dites lokal.
 */

const TEXT_ID_MAP = {
  bootcampTitle: 'bootcamp-title',
  bootcampDesc: 'bootcamp-desc',
  bootcampPoint1: 'bootcamp-point-1',
  bootcampPoint2: 'bootcamp-point-2',
  bootcampPoint3: 'bootcamp-point-3',
  bootcampPoint4: 'bootcamp-point-4',
  mentorTitle: 'mentor-title',
  mentorDesc: 'mentor-desc',
  mentorNote: 'mentor-note',
  mentorIeltsMax: 'mentor-ielts-max',
  mentorEptMax: 'mentor-ept-max',
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Format ribuan gaya Indonesia ("59.000") ditulis manual, TIDAK pakai
// toLocaleString('id-ID') -- runtime Node di Vercel Functions kadang cuma
// bawa data locale "small-icu" (Inggris saja), jadi toLocaleString('id-ID')
// bisa diam-diam salah format tanpa error. Regex ini tidak bergantung
// locale sama sekali.
function formatRupiah(n) {
  const num = Math.round(Number(n) || 0);
  return 'Rp' + String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Ganti isi di ANTARA tag pembuka yang punya id="..." dan tag penutup
// terdekat setelahnya. Aman dipakai untuk semua target di sini karena
// semuanya elemen "daun" (cuma berisi teks, tidak ada elemen anak) --
// dicek manual satu per satu waktu file ini ditulis.
function replaceById(html, id, newInnerHtml) {
  const re = new RegExp('(id="' + id + '"[^>]*>)([\\s\\S]*?)(</)');
  if (!re.test(html)) return html;
  return html.replace(re, function (m, open, _inner, closeStart) {
    return open + newInnerHtml + closeStart;
  });
}

// Sama seperti replaceById, tapi juga menimpa atribut data-target="N" --
// dipakai untuk skor IELTS/EPT UI yang dianimasikan hitung naik oleh
// script.js begitu kartunya discroll ke layar.
function replaceCounter(html, id, rawValue) {
  const num = Math.round(Number(rawValue));
  if (!Number.isFinite(num)) return html;
  let out = html.replace(
    new RegExp('(id="' + id + '"[^>]*data-target=")\\d+(")'),
    '$1' + num + '$2'
  );
  return replaceById(out, id, String(num));
}

function applyPackages(html, overrides) {
  const pkgs = [1, 2, 3].map((n) => ({
    n,
    name: overrides['pkg' + n + 'Name'] !== undefined ? overrides['pkg' + n + 'Name'] : DEFAULTS['pkg' + n + 'Name'],
    price: Number(
      overrides['pkg' + n + 'Price'] !== undefined ? overrides['pkg' + n + 'Price'] : DEFAULTS['pkg' + n + 'Price']
    ),
    available:
      overrides['pkg' + n + 'Available'] !== undefined
        ? overrides['pkg' + n + 'Available']
        : DEFAULTS['pkg' + n + 'Available'],
  }));
  const basePrice = pkgs[0].price;

  let out = html;
  pkgs.forEach((pkg) => {
    out = replaceById(out, 'plan-name-' + pkg.n, escapeHtml(pkg.name));
    out = replaceById(out, 'plan-price-' + pkg.n, formatRupiah(pkg.price));

    // Toggle class plan-card-unavailable di tag <article id="plan-card-N">
    // tanpa merusak class lain yang sudah ada (mis. plan-card-best di kartu 3).
    out = out.replace(
      new RegExp('(id="plan-card-' + pkg.n + '"\\s+class=")([^"]*)(")'),
      function (m, pre, classes, post) {
        let cls = classes.replace(/\s*plan-card-unavailable\s*/, ' ').trim();
        if (!pkg.available) cls += ' plan-card-unavailable';
        return pre + cls + post;
      }
    );

    // Logika badge "Hemat/Harga dasar/Tidak Tersedia" -- port persis dari
    // applyContent() di content-sheet.js (versi lama, client-side).
    let saveText = null;
    let saveClass = 'plan-save';
    if (!pkg.available) {
      saveText = 'Tidak Tersedia';
      saveClass = 'plan-save plan-save-unavailable';
    } else if (pkg.n === 1) {
      saveText = 'Harga dasar';
      saveClass = 'plan-save plan-save-base';
    } else if (basePrice > pkg.price) {
      saveText = 'Hemat ' + formatRupiah(basePrice - pkg.price) + ' per orang';
    }

    if (saveText !== null) {
      out = out.replace(
        new RegExp('(id="plan-save-' + pkg.n + '"\\s+class=")([^"]*)("[^>]*>)([\\s\\S]*?)(</p>)'),
        function (m, pre, _oldClass, mid, _oldText, close) {
          return pre + saveClass + mid + escapeHtml(saveText) + close;
        }
      );
    }
  });
  return out;
}

// Ganti URL foto/logo. Path lama dicari sebagai string literal (split/join,
// bukan regex) supaya titik di nama file (".jpg", ".webp") tidak perlu
// di-escape. Foto komunitas & foto kelas Zoom masing-masing punya DUA
// referensi di HTML (<source srcset> WebP dan <img src> JPEG di dalam
// <picture> yang sama) -- begitu admin upload foto baru, KEDUANYA diarahkan
// ke satu URL upload yang sama (uploadnya cuma satu file), jadi source WebP
// lama sengaja tidak dipertahankan untuk foto yang sudah diganti.
function applyImages(html, overrides) {
  let out = html;

  if (overrides.logoUrl && overrides.logoUrl !== DEFAULTS.logoUrl) {
    out = out.split(DEFAULTS.logoUrl).join(overrides.logoUrl);
  }
  if (overrides.photoKomunitasUrl && overrides.photoKomunitasUrl !== DEFAULTS.photoKomunitasUrl) {
    out = out.split('/EDITS/foto-komunitas.webp').join(overrides.photoKomunitasUrl);
    out = out.split('/EDITS/foto-komunitas.jpg').join(overrides.photoKomunitasUrl);
  }
  if (overrides.photoKelasZoomUrl && overrides.photoKelasZoomUrl !== DEFAULTS.photoKelasZoomUrl) {
    out = out.split('/EDITS/foto-kelas-zoom.webp').join(overrides.photoKelasZoomUrl);
    out = out.split('/EDITS/foto-kelas-zoom.jpg').join(overrides.photoKelasZoomUrl);
  }
  if (overrides.ogBannerUrl && overrides.ogBannerUrl !== DEFAULTS.ogBannerUrl) {
    out = out.split(DEFAULTS.ogBannerUrl).join(overrides.ogBannerUrl);
  }

  return out;
}

// Ambil huruf pertama nama buat avatar cadangan kalau testimoni itu tidak
// punya foto. Dibatasi 2 huruf ("Sultan Siagian" -> "SS", "Rina" -> "R").
function initials(nama) {
  return String(nama || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/**
 * Bikin HTML seluruh section testimoni dari array. Beda dari field lain
 * yang cuma menimpa teks di elemen yang sudah ada, section ini DIBUAT
 * UTUH di sini karena jumlah kartunya tidak tetap.
 *
 * Array kosong (atau semua itemnya tidak valid) -> balik string kosong,
 * sehingga tidak ada section apa pun yang tampil di beranda. Itu keadaan
 * default yang dikirim; lihat catatan panjang di site-defaults.js soal
 * kenapa testimoni tidak boleh diisi contoh karangan.
 */
function renderTestimonials(overrides) {
  const list = Array.isArray(overrides.testimonials) ? overrides.testimonials : [];

  // Item wajib punya pesan DAN nama supaya tidak ada kartu setengah jadi
  // yang tampil di halaman publik kalau admin baru mengisi sebagian.
  const valid = list.filter(
    (t) => t && String(t.pesan || '').trim() && String(t.nama || '').trim()
  );
  if (valid.length === 0) return '';

  const title = overrides.testiTitle !== undefined ? overrides.testiTitle : DEFAULTS.testiTitle;
  const desc = overrides.testiDesc !== undefined ? overrides.testiDesc : DEFAULTS.testiDesc;

  const cards = valid
    .map((t, i) => {
      const nama = escapeHtml(String(t.nama).trim());
      const pesan = escapeHtml(String(t.pesan).trim());
      const fakultas = String(t.fakultas || '').trim();
      const skor = String(t.skorEpt || '').trim();
      const foto = String(t.fotoUrl || '').trim();

      // Avatar: foto kalau ada, kalau tidak inisial nama. Sengaja selalu
      // ada sesuatu -- kartu tanpa wajah/inisial terlihat seperti gagal
      // memuat gambar, bukan seperti pilihan desain.
      const avatar = foto
        ? '<img class="testi-avatar" src="' + escapeHtml(foto) + '" alt="" width="52" height="52" loading="lazy" />'
        : '<span class="testi-avatar testi-avatar-initial" aria-hidden="true">' + escapeHtml(initials(nama)) + '</span>';

      const meta = [];
      if (fakultas) meta.push('<span class="testi-faculty">' + escapeHtml(fakultas) + '</span>');
      // Label "EPT" dan angkanya dipisah spannya supaya bisa dikasih font
      // berbeda: mono kecil buat labelnya, Syne buat angkanya. Ini pola
      // yang sudah dipakai section Mentor buat skor IELTS/EPT UI (lihat
      // .proof-score di styles.css), jadi skor di halaman ini tampil
      // konsisten di mana pun muncul.
      const skorHtml = skor
        ? '<span class="testi-score"><span class="testi-score-label">EPT</span>' +
          escapeHtml(skor) +
          '</span>'
        : '';

      // data-testi-variant dipakai CSS buat memilih pasangan warna
      // gradien tiap kartu (5 varian, berulang) supaya kartunya tidak
      // seragam, tanpa perlu menulis warna di sini.
      return (
        '<article class="testi-card" data-testi-variant="' + (i % 5) + '">' +
        '<div class="testi-card-glow" aria-hidden="true"></div>' +
        '<div class="testi-card-inner">' +
        '<blockquote class="testi-quote"><p>' + pesan + '</p></blockquote>' +
        '<figcaption class="testi-person">' +
        avatar +
        '<span class="testi-identity">' +
        '<cite class="testi-name">' + nama + '</cite>' +
        (meta.length ? meta.join('') : '') +
        '</span>' +
        skorHtml +
        '</figcaption>' +
        '</div>' +
        '</article>'
      );
    })
    .join('');

  return (
    '<section class="testi-section" id="testimoni" aria-labelledby="testi-title">' +
    '<div class="testi-head">' +
    '<p class="section-kicker" data-reveal>05B / KATA MEREKA</p>' +
    '<h2 id="testi-title" data-reveal>' + escapeHtml(title) + '</h2>' +
    (String(desc || '').trim()
      ? '<p class="testi-lede" data-reveal>' + escapeHtml(desc) + '</p>'
      : '') +
    '</div>' +
    '<div class="testi-grid" data-reveal-stagger>' + cards + '</div>' +
    '</section>'
  );
}

// Ganti seluruh isi di antara dua penanda komentar HTML. Dipakai untuk
// blok yang isinya PUNYA ELEMEN BERSARANG (section testimoni) -- di
// situ replaceById tidak bisa dipakai, karena regex-nya berhenti di
// "</" pertama yang ketemu, yang buat elemen bersarang itu tag anaknya,
// bukan tag penutup yang benar.
function replaceBetweenMarkers(html, startMark, endMark, replacement) {
  const start = html.indexOf(startMark);
  if (start === -1) return html;
  const end = html.indexOf(endMark, start);
  if (end === -1) return html;
  return html.slice(0, start + startMark.length) + replacement + html.slice(end);
}

function renderHtml(raw, overrides) {
  let html = raw;

  Object.keys(TEXT_ID_MAP).forEach((key) => {
    if (overrides[key] !== undefined) {
      html = replaceById(html, TEXT_ID_MAP[key], escapeHtml(overrides[key]));
    }
  });
  if (overrides.mentorIeltsScore !== undefined) {
    html = replaceCounter(html, 'mentor-ielts-score', overrides.mentorIeltsScore);
  }
  if (overrides.mentorEptScore !== undefined) {
    html = replaceCounter(html, 'mentor-ept-score', overrides.mentorEptScore);
  }

  html = applyPackages(html, overrides);
  html = applyImages(html, overrides);
  html = replaceBetweenMarkers(
    html,
    '<!--TESTIMONI:MULAI-->',
    '<!--TESTIMONI:SELESAI-->',
    renderTestimonials(overrides)
  );

  return html;
}

module.exports = async function handler(req, res) {
  const htmlPath = path.join(process.cwd(), 'home-template.html');

  let raw;
  try {
    raw = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    // Tidak ada lagi file statis yang bisa jadi jaring pengaman di "/"
    // (itu justru inti perbaikannya, lihat catatan panjang di atas), jadi
    // kalau ini gagal halaman utama benar-benar mati. Penyebab yang paling
    // mungkin cuma satu: "includeFiles" di vercel.json tidak lagi cocok
    // dengan nama file ini.
    console.error(
      'render-home: GAGAL membaca home-template.html dari disk (' + err.message +
        '). Cek "includeFiles" di vercel.json masih menunjuk nama file yang benar.'
    );
    return res.status(500).send('Internal Server Error');
  }

  try {
    const overrides = await readOverrides();
    const html = renderHtml(raw, overrides);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (err) {
    // Kalau proses templating-nya sendiri gagal (bukan cuma Global Config-nya
    // yang gagal diakses -- itu sudah ditangani gracefully di readOverrides),
    // lebih baik kirim template APA ADANYA daripada halaman utama situs
    // jadi error total.
    console.error('render-home: gagal menyisipkan konten, kirim versi default:', err.message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(raw);
  }
};

// Diekspor tambahan cuma buat ditest langsung (lihat scratchpad test
// script) tanpa perlu mock req/res/Global Config -- tidak dipakai Vercel
// sama sekali, Vercel cuma memanggil module.exports sebagai fungsi.
module.exports.renderHtml = renderHtml;
module.exports.applyPackages = applyPackages;
module.exports.applyImages = applyImages;
module.exports.replaceById = replaceById;
module.exports.formatRupiah = formatRupiah;
module.exports.escapeHtml = escapeHtml;
module.exports.renderTestimonials = renderTestimonials;
