/**
 * ============================================================
 * MEMERIKSA BERKAS UNGGAHAN DARI ISINYA, BUKAN DARI LABELNYA
 * ============================================================
 *
 * Sebelum ini, satu-satunya pemeriksaan di /api/daftar adalah pola
 * `^data:(image/...);base64,`. Masalahnya: bagian "image/..." itu
 * DIKETIK PENGIRIM. Siapa pun bisa mengirim apa saja lalu menuliskan
 * "image/png" di depannya, dan berkas itu tetap mendarat di Drive milik
 * pemilik sheet.
 *
 * Yang diperiksa di sini beberapa byte PERTAMA dari isi berkasnya
 * setelah di-decode. Byte itu tidak bisa dikarang tanpa benar-benar
 * membuat gambar, karena format gambarnya sendiri yang menuntutnya.
 *
 * ============================================================
 * YANG INI *BUKAN* JAMINAN
 * ============================================================
 * Berkas yang byte awalnya benar tetap bisa berisi apa saja
 * sesudahnya. Ini menyaring berkas yang jelas bukan gambar, bukan
 * menjamin isinya aman. Yang membuat itu tidak jadi masalah di sini:
 * berkasnya mendarat di folder Drive privat dan cuma dibuka pemiliknya
 * sendiri lewat Drive, tidak pernah dieksekusi atau ditayangkan situs.
 */

// Byte pengenal tiap format. Sengaja cuma format yang benar-benar bisa
// dihasilkan kompresor di browser (lihat SPEC_UNGGAHAN di daftar.js)
// plus dua format kamera yang paling lazim, kalau nanti kompresinya
// dilewati karena satu dan lain hal.
const TANDA = [
  { nama: 'image/jpeg', byte: [0xff, 0xd8, 0xff] },
  { nama: 'image/png', byte: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { nama: 'image/gif', byte: [0x47, 0x49, 0x46, 0x38] },
];

function cocok(buf, byte, mulai) {
  const awal = mulai || 0;
  if (buf.length < awal + byte.length) return false;
  for (let i = 0; i < byte.length; i++) {
    if (buf[awal + i] !== byte[i]) return false;
  }
  return true;
}

/**
 * WebP tidak punya satu deretan byte di awal seperti yang lain: bentuknya
 * "RIFF" + empat byte panjang + "WEBP". Empat byte panjang di tengah itu
 * yang membuatnya tidak bisa ikut daftar TANDA di atas.
 *
 * Ini format yang PALING sering datang, karena kompresor di browser
 * menghasilkannya (SPEC_UNGGAHAN tipe 'image/webp').
 */
function webp(buf) {
  return cocok(buf, [0x52, 0x49, 0x46, 0x46]) && cocok(buf, [0x57, 0x45, 0x42, 0x50], 8);
}

/**
 * @param {string} dataUrl  Data URL lengkap dari browser.
 * @param {number} maksKb   Batas ukuran berkas setelah decode.
 * @returns {{ok: boolean, alasan?: string, tipe?: string, kb?: number}}
 */
function periksaGambar(dataUrl, maksKb) {
  const cocokPola = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!cocokPola) return { ok: false, alasan: 'bukan_data_url' };

  let buf;
  try {
    buf = Buffer.from(cocokPola[2], 'base64');
  } catch (err) {
    return { ok: false, alasan: 'base64_rusak' };
  }
  if (buf.length === 0) return { ok: false, alasan: 'kosong' };

  const kb = Math.round(buf.length / 1024);
  // Batas PER BERKAS, terpisah dari batas total badan permintaan. Batas
  // total saja tidak cukup: satu berkas raksasa bisa menyingkirkan dua
  // lainnya, dan yang ditolak jadi seluruh pendaftarannya.
  if (maksKb && kb > maksKb) return { ok: false, alasan: 'terlalu_besar', kb: kb };

  const ketemu = TANDA.find((t) => cocok(buf, t.byte));
  if (ketemu) return { ok: true, tipe: ketemu.nama, kb: kb };
  if (webp(buf)) return { ok: true, tipe: 'image/webp', kb: kb };

  return { ok: false, alasan: 'bukan_gambar', kb: kb };
}

module.exports = { periksaGambar };
