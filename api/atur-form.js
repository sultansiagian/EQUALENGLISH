const { requireAdmin } = require('./_lib/admin-guard');
const { readOverrides } = require('./_lib/global-config-store');
const { normalisasiFields } = require('./_lib/form-schema');

/**
 * Susunan LENGKAP pertanyaan form untuk halaman /atur-form.
 *
 * Beda dari /api/daftar-schema yang terbuka untuk umum: yang ini
 * dilindungi login admin dan mengirim SEMUA field, termasuk yang sedang
 * dimatikan, plus penanda `inti` (mana yang tidak boleh dihapus).
 * Endpoint publik sengaja tidak mengirim itu -- pengunjung tidak perlu
 * tahu ada pertanyaan yang sedang disembunyikan.
 */
module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const overrides = await readOverrides();
    // Dikirim lewat normalisasiFields, bukan apa adanya dari Global
    // Config, supaya yang admin lihat sama persis dengan yang nanti
    // dipakai server -- termasuk field inti yang dikembalikan otomatis
    // dan kolom yang dipaksa balik ke nilai aslinya.
    const fields = normalisasiFields(overrides.formFields).map((f) => ({
      id: f.id,
      label: f.label,
      tipe: f.tipe,
      bantuan: f.bantuan,
      wajib: f.wajib,
      aktif: f.aktif,
      inti: f.inti,
      pilihan: f.pilihan,
      urutan: f.urutan,
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, fields });
  } catch (err) {
    console.error('atur-form error:', err.message);
    return res.status(502).json({ ok: false, reason: 'gagal_baca', pesan: err.message });
  }
};
