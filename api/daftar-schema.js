const DEFAULTS = require('./_lib/site-defaults');
const { readOverrides } = require('./_lib/global-config-store');
const { fieldAktif, PILIHAN_PAKET } = require('./_lib/form-schema');
const { statusForm } = require('./_lib/form-status');

/**
 * Susunan pertanyaan form /daftar, dibaca browser pengunjung buat
 * menggambar formnya.
 *
 * TERBUKA UNTUK UMUM tanpa login, dan itu memang seharusnya: isinya cuma
 * "pertanyaan apa saja yang ada di formulir pendaftaran", persis yang
 * dilihat siapa pun yang membuka /daftar. Tidak ada data pendaftar, tidak
 * ada kredensial, tidak ada apa pun yang tidak sudah tampil di halaman.
 *
 * Yang dikirim cuma field AKTIF -- pertanyaan yang dimatikan admin tidak
 * ikut, jadi tidak ada cara menebak-nebak pertanyaan tersembunyi dari
 * balasan ini.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  try {
    const overrides = await readOverrides();
    const fields = fieldAktif(overrides.formFields).map((f) => ({
      // `kolom` SENGAJA tidak ikut dikirim. Browser tidak perlu tahu
      // pemetaan kolom spreadsheet, dan server tidak mempercayainya dari
      // sana -- susunBaris() di api/daftar.js selalu memakai susunan dari
      // Global Config, bukan yang dikirim browser.
      id: f.id,
      label: f.label,
      tipe: f.tipe,
      wajib: f.wajib,
      bantuan: f.bantuan,
      pilihan: f.pilihan,
    }));

    const status = statusForm(overrides);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      status: status,
      judul: overrides.daftarTitle !== undefined ? overrides.daftarTitle : DEFAULTS.daftarTitle,
      deskripsi: overrides.daftarDesc !== undefined ? overrides.daftarDesc : DEFAULTS.daftarDesc,
      fields: fields,
      pilihanPaket: PILIHAN_PAKET,
    });
  } catch (err) {
    console.error('daftar-schema error:', err.message);
    return res.status(502).json({ ok: false, reason: 'gagal_baca' });
  }
};
