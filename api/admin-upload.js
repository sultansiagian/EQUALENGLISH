const { requireAdmin } = require('./_lib/admin-guard');
const { writeOverrides } = require('./_lib/global-config-store');

// Slot yang boleh diupload dari /admin -> kunci Global Config yang ditulis
// begitu upload sukses. Sama dengan daftar image di site-defaults.js.
const SLOT_KEYS = {
  logo: 'logoUrl',
  photoKomunitas: 'photoKomunitasUrl',
  photoKelasZoom: 'photoKelasZoomUrl',
  ogBanner: 'ogBannerUrl',
};

// Vercel Function punya batas body request 4.5 MB. admin.js mengompres
// foto di browser dulu (lihat processImage() di sana) sebelum dikirim,
// jadi dalam praktiknya jauh di bawah ini -- angka ini cuma jaring
// pengaman kalau kompresinya karena sesuatu hal tidak jalan.
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload SATU foto: decode base64 dari body, simpan ke Vercel Blob (Public,
 * nama file selalu dapat suffix acak lewat addRandomSuffix supaya URL-nya
 * baru tiap upload -- pengunjung situs langsung lihat foto baru tanpa
 * nunggu cache blob lama expire), lalu simpan URL barunya ke Global Config
 * dalam SATU request yang sama. Dari sisi admin.js: upload = langsung
 * tayang, tidak ada tombol "Simpan" terpisah untuk foto.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  const body = req.body || {};
  const slot = body.slot;
  const dataUrl = body.dataUrl;
  const key = SLOT_KEYS[slot];
  if (!key || !dataUrl) {
    return res.status(400).json({ ok: false, reason: 'invalid_request' });
  }

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return res.status(400).json({ ok: false, reason: 'invalid_data_url' });

  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, reason: 'file_too_large' });
  }

  try {
    const { put } = await import('@vercel/blob');
    const ext = contentType.split('/')[1] || 'jpg';
    const blob = await put('site/' + slot + '.' + ext, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    await writeOverrides({ [key]: blob.url });

    return res.status(200).json({ ok: true, url: blob.url });
  } catch (err) {
    console.error('admin-upload error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upload_failed', message: err.message });
  }
};
