const fs = require('fs');
const path = require('path');
const DEFAULTS = require('./_lib/site-defaults');
const { readOverrides } = require('./_lib/global-config-store');

/**
 * Menyajikan index.html, tapi disisipi dulu konten dari Global Config
 * (diisi lewat /admin) SEBELUM dikirim ke browser pengunjung -- bukan
 * ditimpa belakangan oleh JavaScript seperti content-sheet.js yang lama.
 *
 * Kenapa begini, bukan tetap client-side: teks yang disisipkan lewat
 * JavaScript baru ada SETELAH script-nya jalan di browser pengunjung --
 * crawler yang tidak menjalankan JS (banyak dipakai AI search seperti
 * ChatGPT/Perplexity) cuma melihat teks HARDCODE lama di index.html.
 * Dengan cara ini, teks yang sudah diedit dari /admin ada di HTML asli
 * yang dikirim server, siapa pun/apa pun yang membaca sumbernya melihat
 * versi yang benar.
 *
 * File index.html sendiri TIDAK PERNAH diubah oleh fungsi ini -- dibaca
 * ulang dari disk tiap request, konten Global Config cuma menimpa hasil
 * bacanya secara sementara di memori sebelum dikirim. Kalau Global Config
 * kosong/gagal diakses, index.html tampil apa adanya seperti sebelum ada
 * /admin sama sekali (lihat readOverrides()).
 *
 * vercel.json men-rewrite "/" ke fungsi ini (bukan langsung serve
 * index.html sebagai file statis), dan "includeFiles": "index.html" di
 * situ yang memastikan index.html ikut ter-bundle ke fungsi ini saat
 * deploy -- tanpa itu, fs.readFileSync di bawah akan gagal (ENOENT) di
 * production walau jalan normal kalau dites lokal.
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

  return html;
}

module.exports = async function handler(req, res) {
  const htmlPath = path.join(process.cwd(), 'index.html');

  let raw;
  try {
    raw = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    console.error('render-home: gagal membaca index.html dari disk:', err.message);
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
    // lebih baik kirim index.html APA ADANYA daripada halaman utama situs
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
