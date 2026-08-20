const { requireAdmin } = require('./_lib/admin-guard');
const { writeOverrides } = require('./_lib/global-config-store');

// Slot yang boleh diupload dari /admin -> kunci Global Config yang ditulis
// begitu upload sukses. Sama dengan daftar image di site-defaults.js.
const SLOT_KEYS = {
  logo: 'logoUrl',
  photoKomunitas: 'photoKomunitasUrl',
  photoKelasZoom: 'photoKelasZoomUrl',
  ogBanner: 'ogBannerUrl',
  // Tanda tangan di sertifikat kelulusan. Tidak pernah tampil di
  // halaman publik, cuma digambar ke canvas sertifikat di kelas.js.
  tandaTangan: 'sertifikatTandaTanganUrl',
};

// Foto testimoni ditangani BEDA dari empat slot di atas: fotonya bukan
// satu nilai tetap dengan kunci sendiri, melainkan salah satu field di
// dalam array "testimonials" yang panjangnya bebas. Jadi endpoint ini
// cuma mengunggah dan MENGEMBALIKAN URL-nya; yang menaruh URL itu ke
// item yang benar adalah admin.js, dan baru benar-benar tersimpan waktu
// admin menekan "Simpan Testimoni" (satu tulisan untuk seluruh array).
//
// Konsekuensi yang disengaja: foto yang diupload lalu tidak jadi disimpan
// tetap tertinggal di Blob sebagai file yatim. Dibiarkan begitu daripada
// membangun mekanisme pembersihan -- ukurannya kecil (foto profil ~40 KB
// setelah dikompres) dan kuota Blob 1 GB, jadi butuh puluhan ribu kali
// batal-upload sebelum jadi masalah.
const TESTIMONIAL_SLOT = 'testimonialPhoto';

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
  const isTestimonial = slot === TESTIMONIAL_SLOT;
  const key = SLOT_KEYS[slot];
  if ((!key && !isTestimonial) || !dataUrl) {
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
    const folder = isTestimonial ? 'testimoni/' : 'site/';
    const blob = await put(folder + slot + '.' + ext, buffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });

    // Foto testimoni cuma dikembalikan URL-nya (lihat TESTIMONIAL_SLOT di
    // atas) -- admin.js yang menaruhnya ke item yang benar, lalu tersimpan
    // bareng seluruh array waktu tombol "Simpan Testimoni" ditekan.
    if (!isTestimonial) {
      await writeOverrides({ [key]: blob.url });
    }

    return res.status(200).json({ ok: true, url: blob.url });
  } catch (err) {
    console.error('admin-upload error:', err.message);
    return res.status(502).json({ ok: false, reason: 'upload_failed', message: err.message });
  }
};
