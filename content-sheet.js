/**
 * Konten section "06 / PROGRAM INTENSIF" (judul, deskripsi, 4 poin) dan
 * "07 / PILIHAN PAKET" (nama paket, harga, ketersediaan) bisa ditimpa
 * tanpa commit/push lewat Google Sheet yang dipublish sebagai CSV.
 *
 * Beda dari kelas.html (yang materinya lewat server karena harus login
 * dulu, lihat api/verify-access.js): section ini PUBLIK dan isinya
 * bukan rahasia, jadi cukup di-fetch langsung dari browser pengunjung,
 * tidak perlu endpoint server sendiri.
 *
 * Kalau fetch gagal, sheet-nya kosong, atau sel tertentu tidak diisi,
 * HTML statis yang sudah ada di index.html (hardcode) tetap tampil apa
 * adanya -- sheet cuma MENIMPA, tidak pernah bikin bagian jadi kosong.
 *
 * FORMAT SHEET (3 kolom: Bagian | Field | Isi), satu baris per item:
 *   Bootcamp | Judul      | Bootcamp EPT UI.
 *   Bootcamp | Deskripsi  | Untuk kamu yang sedang mengejar nilai...
 *   Bootcamp | Poin 1     | Listening, structure & reading, setara materi TOEFL
 *   Bootcamp | Poin 2     | Dipandu mentor IELTS 8 dan EPT UI 673
 *   Bootcamp | Poin 3     | Akses rekaman sesi Zoom tanpa batas
 *   Bootcamp | Poin 4     | Latihannya lewat fun quiz...
 *   Paket 1  | Nama       | INDIVIDUAL
 *   Paket 1  | Harga      | 59000
 *   Paket 1  | Tersedia   | Ya
 *   Paket 2  | Nama       | PAIR
 *   Paket 2  | Harga      | 53000
 *   Paket 2  | Tersedia   | Ya
 *   Paket 3  | Nama       | GROUP
 *   Paket 3  | Harga      | 47000
 *   Paket 3  | Tersedia   | Ya
 *
 * "Tersedia" isi "Tidak" (atau "Tidak Tersedia") -> kartu itu ditandai
 * merah "Tidak Tersedia". Kosongkan/isi "Ya" -> tampil normal.
 * Kolom "Harga" boleh ditulis "59000", "59.000", atau "Rp59.000", semua
 * dibaca sama -- yang penting angkanya. Badge "Hemat RpX.000 per
 * orang" di Paket 2 & 3 dihitung OTOMATIS dari selisih harga ke
 * Paket 1, tidak perlu diisi manual.
 */

const CONTENT_SHEET_URL = ''; // TODO: isi link "Publish to web" (CSV) di sini

function contentNormalize(str) {
  return (str || '').trim().toLowerCase();
}

function contentCsvToRows(csvText) {
  // Parser CSV sederhana, sama persis logikanya dengan csvToRows() di
  // api/verify-access.js -- disalin, bukan di-share, karena file ini
  // jalan di browser dan file itu di server (dua environment beda,
  // tidak ada cara gampang buat pakai satu modul bersama tanpa build
  // step, dan proyek ini sengaja zero build step).
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (char === '\r' && next === '\n') i++;
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function extractContent(csvText) {
  const rows = contentCsvToRows(csvText);
  const content = { bootcampPoints: {}, packages: { 1: {}, 2: {}, 3: {} } };

  rows.forEach((row) => {
    const bagian = contentNormalize(row[0]);
    const field = contentNormalize(row[1]);
    const isi = (row[2] || '').trim();
    if (!bagian || !field || !isi) return;

    if (bagian.includes('bootcamp')) {
      if (field.includes('judul')) {
        content.bootcampTitle = isi;
      } else if (field.includes('deskripsi')) {
        content.bootcampDesc = isi;
      } else if (field.includes('poin')) {
        const m = field.match(/(\d)/);
        if (m) content.bootcampPoints[m[1]] = isi;
      }
    } else if (bagian.includes('paket')) {
      const m = bagian.match(/(\d)/);
      if (!m || !content.packages[m[1]]) return;
      const pkg = content.packages[m[1]];
      if (field.includes('nama')) pkg.name = isi;
      else if (field.includes('harga')) pkg.price = isi;
      else if (field.includes('tersedia')) pkg.available = isi;
    }
  });

  return content;
}

function parseRupiah(str) {
  const digits = (str || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function formatRupiah(n) {
  return 'Rp' + n.toLocaleString('id-ID');
}

function isMarkedUnavailable(value) {
  const v = contentNormalize(value);
  return v.startsWith('tidak') || v === 'no' || v === 'tutup' || v === 'penuh' || v === '0';
}

function applyContent(content) {
  const titleEl = document.getElementById('bootcamp-title');
  if (content.bootcampTitle && titleEl) titleEl.textContent = content.bootcampTitle;

  const descEl = document.getElementById('bootcamp-desc');
  if (content.bootcampDesc && descEl) descEl.textContent = content.bootcampDesc;

  [1, 2, 3, 4].forEach((n) => {
    const text = content.bootcampPoints[n];
    const el = document.getElementById('bootcamp-point-' + n);
    if (text && el) el.textContent = text;
  });

  // Harga Paket 1 (dari sheet kalau ada, kalau tidak dari HTML default)
  // jadi acuan hitung badge "Hemat RpX.000 per orang" di Paket 2 & 3.
  const price1El = document.getElementById('plan-price-1');
  const sheetPrice1 = parseRupiah(content.packages[1] && content.packages[1].price);
  const basePrice = sheetPrice1 != null ? sheetPrice1 : price1El ? parseRupiah(price1El.textContent) : null;

  [1, 2, 3].forEach((n) => {
    const pkg = content.packages[n] || {};
    const cardEl = document.getElementById('plan-card-' + n);
    const nameEl = document.getElementById('plan-name-' + n);
    const priceEl = document.getElementById('plan-price-' + n);
    const saveEl = document.getElementById('plan-save-' + n);
    if (!cardEl || !priceEl || !saveEl) return;

    if (pkg.name && nameEl) nameEl.textContent = pkg.name;

    const sheetPrice = parseRupiah(pkg.price);
    if (sheetPrice != null) priceEl.textContent = formatRupiah(sheetPrice);
    const currentPrice = sheetPrice != null ? sheetPrice : parseRupiah(priceEl.textContent);

    const unavailable = pkg.available !== undefined && isMarkedUnavailable(pkg.available);
    cardEl.classList.toggle('plan-card-unavailable', unavailable);
    saveEl.classList.remove('plan-save-base', 'plan-save-unavailable');

    if (unavailable) {
      saveEl.textContent = 'Tidak Tersedia';
      saveEl.classList.add('plan-save-unavailable');
    } else if (n === 1) {
      saveEl.textContent = 'Harga dasar';
      saveEl.classList.add('plan-save-base');
    } else if (basePrice != null && currentPrice != null && basePrice > currentPrice) {
      saveEl.textContent = 'Hemat ' + formatRupiah(basePrice - currentPrice) + ' per orang';
    }
    // Kalau bukan unavailable, bukan Paket 1, dan harganya tidak lebih
    // murah dari basePrice (mis. basePrice belum kebaca), teks lama di
    // HTML dibiarkan apa adanya daripada ditampilkan salah.
  });
}

if (CONTENT_SHEET_URL) {
  fetch(CONTENT_SHEET_URL)
    .then((res) => {
      if (!res.ok) throw new Error('status ' + res.status);
      return res.text();
    })
    .then((text) => applyContent(extractContent(text)))
    .catch((err) => {
      // Gagal diam-diam -- halaman tetap tampil normal pakai isi
      // hardcode yang sudah ada di index.html, cuma tidak dapat update
      // dari sheet sampai masalahnya (jaringan, link salah, dll) hilang
      // sendiri di percobaan berikutnya (tiap kali halaman dimuat ulang).
      console.error('Gagal memuat konten dari Google Sheet:', err.message);
    });
}
