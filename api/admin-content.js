const DEFAULTS = require('./_lib/site-defaults');
const { requireAdmin } = require('./_lib/admin-guard');
const { readOverrides, writeOverrides } = require('./_lib/global-config-store');

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
