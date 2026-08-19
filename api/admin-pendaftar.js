const { requireAdmin } = require('./_lib/admin-guard');
const { panggilAppsScript } = require('./_lib/apps-script');

/**
 * Daftar pendaftar yang menunggu persetujuan, plus tombol Setujui/Tolak.
 * Semuanya diteruskan ke Apps Script di spreadsheet (lihat apps-script.gs).
 *
 * GET           -> daftar semua baris di tab "Pendaftar Web"
 * POST setujui  -> pindahkan barisnya ke Form_Responses (= akses terbuka)
 * POST tolak    -> hapus barisnya (= tidak jadi peserta)
 *
 * Dilindungi requireAdmin sama seperti endpoint admin lain. Ini penting:
 * "setujui" di sini setara memberi orang akses ke seluruh materi kelas
 * berbayar, jadi tidak boleh bisa dipanggil siapa pun selain admin.
 */
module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'GET') {
    try {
      const hasil = await panggilAppsScript('list');
      return res.status(200).json({ ok: true, pendaftar: hasil.pendaftar || [] });
    } catch (err) {
      console.error('admin-pendaftar GET:', err.message);
      return res.status(502).json({ ok: false, reason: 'gagal_baca', pesan: err.message });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const id = String(body.id || '').trim();
    const aksi = body.aksi === 'tolak' ? 'reject' : body.aksi === 'setujui' ? 'approve' : null;

    if (!id || !aksi) {
      return res.status(400).json({ ok: false, reason: 'permintaan_tidak_lengkap' });
    }

    try {
      await panggilAppsScript(aksi, { id });
      // Dicatat karena ini keputusan yang memberi/menolak akses berbayar --
      // berguna kalau nanti perlu ditelusuri siapa menyetujui apa.
      console.log('admin-pendaftar: ' + admin.email + ' -> ' + aksi + ' ' + id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('admin-pendaftar POST:', err.message);
      return res.status(502).json({ ok: false, reason: 'gagal_proses', pesan: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
};
