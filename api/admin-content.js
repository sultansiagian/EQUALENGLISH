const DEFAULTS = require('./_lib/site-defaults');
const { requireAdmin } = require('./_lib/admin-guard');
const { readOverrides, writeOverrides } = require('./_lib/global-config-store');
const { normalisasiFields } = require('./_lib/form-schema');

// Batas jumlah testimoni & panjang tiap field. Angkanya dipilih longgar
// (jauh di atas kebutuhan wajar) tapi tetap terbatas, semata supaya satu
// kesalahan tidak bisa menghabiskan kuota 1 MB Global Config yang dipakai
// bersama SELURUH konten situs.
const MAX_TESTIMONIALS = 24;

function trimTo(value, maxLen) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, maxLen);
}

/**
 * GET  -> nilai yang SEDANG AKTIF di halaman publik (override Global Config
 *         kalau ada, kalau tidak nilai default index.html) -- ini yang
 *         dipakai admin.js mengisi form waktu halaman /admin dibuka,
 *         supaya form-nya tidak pernah tampil kosong.
 * POST -> simpan field yang diedit. Selalu upsert (menulis nilai persis
 *         yang dikirim, termasuk kalau kebetulan sama dengan default) --
 *         TIDAK ada logika "hapus override kalau sama dengan default".
 *         Sengaja simpel: kalau admin mau balik ke teks semula, tinggal
 *         ketik ulang teks itu dan Simpan lagi, hasilnya sama persis dari
 *         sisi tampilan.
 */
module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'GET') {
    try {
      const overrides = await readOverrides();
      const values = Object.assign({}, DEFAULTS, overrides);
      return res.status(200).json({ ok: true, values, email: admin.email });
    } catch (err) {
      console.error('admin-content GET error:', err.message);
      return res.status(500).json({ ok: false, reason: 'read_failed' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const items = req.body && req.body.items;
    if (!items || typeof items !== 'object') {
      return res.status(400).json({ ok: false, reason: 'missing_items' });
    }

    // Allowlist dari kunci yang dikenal (site-defaults.js) -- endpoint ini
    // tidak boleh dipakai untuk menulis kunci Global Config sembarangan.
    const allowedKeys = Object.keys(DEFAULTS);
    const filtered = {};
    Object.keys(items).forEach((k) => {
      if (allowedKeys.indexOf(k) !== -1) filtered[k] = items[k];
    });
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ ok: false, reason: 'no_valid_keys' });
    }

    // "testimonials" satu-satunya kunci yang isinya ARRAY, bukan nilai
    // tunggal, jadi allowlist di atas belum cukup -- bentuk dalamnya masih
    // bebas. Dinormalkan di sini supaya Global Config tidak bisa terisi
    // struktur aneh atau kebablasan besar (batas store-nya 1 MB untuk
    // SELURUH konten situs; array yang tidak dibatasi bisa menghabiskannya
    // dan bikin semua penyimpanan berikutnya gagal).
    if (filtered.testimonials !== undefined) {
      if (!Array.isArray(filtered.testimonials)) {
        return res.status(400).json({ ok: false, reason: 'testimonials_bukan_array' });
      }
      filtered.testimonials = filtered.testimonials
        .slice(0, MAX_TESTIMONIALS)
        .map((t) => ({
          nama: trimTo(t && t.nama, 80),
          fakultas: trimTo(t && t.fakultas, 120),
          skorEpt: trimTo(t && t.skorEpt, 20),
          pesan: trimTo(t && t.pesan, 600),
          fotoUrl: trimTo(t && t.fotoUrl, 400),
        }))
        // Item yang benar-benar kosong dibuang, tapi item setengah isi
        // TETAP disimpan -- admin mungkin sedang menyicil mengisi. Yang
        // memutuskan item mana yang layak tampil di halaman publik adalah
        // renderTestimonials() di api/render-home.js, bukan di sini.
        .filter((t) => t.nama || t.pesan || t.fakultas || t.skorEpt || t.fotoUrl);
    }

    // formFields juga array bebas seperti testimonials, tapi taruhannya
    // jauh lebih tinggi: susunan yang salah bisa menghapus pertanyaan
    // email (kunci akses ruang kelas) atau menulis jawaban ke kolom
    // spreadsheet yang keliru. Semua penjagaannya ada di
    // normalisasiFields() -- lihat komentar panjang di form-schema.js.
    if (filtered.formFields !== undefined) {
      filtered.formFields = normalisasiFields(filtered.formFields);
    }

    try {
      await writeOverrides(filtered);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('admin-content POST error:', err.message);
      return res.status(502).json({ ok: false, reason: 'write_failed', message: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
};
