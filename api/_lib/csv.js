/**
 * Pembaca CSV hasil "Publish to web" Google Sheets, plus penebak format
 * tanggal untuk kolom Timestamp.
 *
 * Dipisah ke sini karena sekarang dipakai dua tempat: api/verify-access.js
 * (gerbang login siswa) dan api/_lib/statistik.js (halaman analitik).
 */

/**
 * Parser CSV sederhana yang menangani nilai berkoma di dalam tanda kutip
 * (format standar yang dipakai Google Sheets saat publish).
 */
function csvToRows(csvText) {
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

// "8/20/2026 14:30:00" atau "20/8/2026 14.30" -- pemisah jam boleh titik
// dua maupun titik, dan detik boleh tidak ada.
const POLA_SLASH = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/;
const POLA_ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * ============================================================
 * KENAPA FORMAT TANGGAL HARUS DITEBAK, BUKAN DIPAKU
 * ============================================================
 * Kolom Timestamp di sheet roster bisa berisi dua format sekaligus:
 *
 *   - Baris dari situs ini ditulis api/daftar.js dengan locale en-US,
 *     jadi bentuknya BULAN/TANGGAL/TAHUN ("8/20/2026").
 *   - Baris dari Google Form ditulis Google mengikuti locale
 *     SPREADSHEET-nya. Kalau spreadsheet-nya berlokal Indonesia,
 *     bentuknya TANGGAL/BULAN/TAHUN ("20/8/2026").
 *
 * Untuk tanggal di atas 12 keduanya gampang dibedakan, tapi "5/8/2026"
 * bisa berarti 5 Agustus atau 8 Mei, dan salah tebak akan memasukkan
 * pendaftar ke batch yang salah tanpa gejala apa pun.
 *
 * Jadi formatnya ditentukan dari SELURUH kolom sekaligus, bukan per sel:
 * satu saja nilai yang angka pertamanya di atas 12 sudah membuktikan
 * kolom itu tanggal-dulu, dan sebaliknya. Kalau seluruh kolom ambigu
 * (semua tanggalnya 12 ke bawah), dipakai bulan-dulu, karena itu yang
 * ditulis situs ini sendiri.
 */
function tebakFormatTanggal(nilaiKolom) {
  let buktiTanggalDulu = 0;
  let buktiBulanDulu = 0;

  for (const nilai of nilaiKolom) {
    const m = POLA_SLASH.exec(String(nilai || '').trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) buktiTanggalDulu++;
    if (b > 12) buktiBulanDulu++;
  }

  if (buktiTanggalDulu > 0 && buktiBulanDulu > 0) {
    // Kolomnya campur dua format. Tidak ada tebakan yang benar untuk
    // semua baris; dicatat supaya ketahuan, lalu dipakai format situs.
    console.error(
      'csv: kolom Timestamp berisi dua format tanggal sekaligus (' +
        buktiTanggalDulu + ' baris tanggal-dulu, ' + buktiBulanDulu +
        ' baris bulan-dulu). Sebagian tanggal akan salah dibaca. Samakan ' +
        'format kolomnya di spreadsheet.'
    );
    return 'bulanDulu';
  }
  if (buktiTanggalDulu > 0) return 'tanggalDulu';
  return 'bulanDulu';
}

/**
 * Kembalikan fungsi pembaca tanggal untuk satu kolom, formatnya sudah
 * ditetapkan lebih dulu dari seluruh isi kolom itu.
 *
 * Hasilnya Date atau null. Sengaja null (bukan melempar) karena sel yang
 * kosong atau berisi catatan tangan itu hal yang wajar di sheet manual,
 * bukan kesalahan yang perlu menghentikan apa pun.
 */
function buatPembacaTanggal(nilaiKolom) {
  const format = tebakFormatTanggal(nilaiKolom);

  return function bacaTanggal(nilai) {
    const teks = String(nilai || '').trim();
    if (!teks) return null;

    const iso = POLA_ISO.exec(teks);
    if (iso) {
      const d = new Date(teks);
      return Number.isFinite(d.getTime()) ? d : null;
    }

    const m = POLA_SLASH.exec(teks);
    if (!m) return null;

    const a = Number(m[1]);
    const b = Number(m[2]);
    const tahun = Number(m[3]);
    const tanggal = format === 'tanggalDulu' ? a : b;
    const bulan = format === 'tanggalDulu' ? b : a;

    if (bulan < 1 || bulan > 12 || tanggal < 1 || tanggal > 31) return null;

    const jam = m[4] === undefined ? 0 : Number(m[4]);
    const menit = m[5] === undefined ? 0 : Number(m[5]);
    const detik = m[6] === undefined ? 0 : Number(m[6]);

    // Dibaca sebagai waktu WIB (UTC+7), bukan waktu server. Server Vercel
    // berjalan di UTC, dan tanpa ini pendaftaran sore hari di Indonesia
    // bisa terhitung masuk ke tanggal berikutnya.
    const d = new Date(Date.UTC(tahun, bulan - 1, tanggal, jam - 7, menit, detik));
    return Number.isFinite(d.getTime()) ? d : null;
  };
}

module.exports = { csvToRows, buatPembacaTanggal, tebakFormatTanggal };
