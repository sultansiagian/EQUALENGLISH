const verifyAccess = require('./verify-access');
const { panggilAppsScript } = require('./_lib/apps-script');
const { readOverrides, writeOverrides } = require('./_lib/global-config-store');

/**
 * Kiriman testimoni dari siswa di /kelas.
 *
 * Endpoint ini TERBUKA seperti /api/verify-access (tidak pakai login
 * admin), tapi dijaga dengan cara yang sama: token Google diverifikasi,
 * lalu emailnya harus ada di roster. Orang luar tidak bisa mengirim
 * testimoni atas nama siapa pun.
 *
 * Verifikasi token dan pengecekan roster DIPAKAI ULANG dari
 * api/verify-access.js, bukan ditulis ulang di sini. Dua salinan logika
 * "siapa yang boleh masuk" adalah cara paling gampang membuat salah
 * satunya diam-diam jadi lebih longgar dari yang lain.
 *
 * ============================================================
 * ISI TESTIMONI TIDAK DISIMPAN DI KONTEN SITUS
 * ============================================================
 * Yang masuk ke Global Config cuma EMAIL pengirimnya, dipakai menentukan
 * sertifikatnya sudah boleh diunduh atau belum. Isi testimoninya sendiri
 * ditulis ke tab Testimoni di spreadsheet, yang tidak punya batas.
 *
 * Global Config dibatasi 1 MB untuk SELURUH konten situs (teks beranda,
 * harga, susunan formulir, testimoni yang tayang). Kalau kiriman siswa
 * yang jumlahnya bebas ditumpuk di sana, cepat atau lambat penyimpanan
 * itu penuh dan SEMUA penyimpanan berikutnya gagal, bukan cuma testimoni.
 */

// Batas panjang, semata supaya kiriman yang tidak wajar tidak diteruskan
// mentah-mentah ke spreadsheet.
const MAKS_PESAN = 600;
const MAKS_PENDEK = 120;

function potong(nilai, maks) {
  return String(nilai === undefined || nilai === null ? '' : nilai)
    .trim()
    .slice(0, maks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const rosterUrls = (process.env.ROSTER_CSV_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (!clientId || rosterUrls.length === 0) {
    console.error('kelas-testimoni: GOOGLE_CLIENT_ID dan/atau ROSTER_CSV_URLS belum diisi.');
    return res.status(500).json({ ok: false, reason: 'server_not_configured' });
  }

  const idToken = req.body && req.body.credential;
  if (!idToken) return res.status(400).json({ ok: false, reason: 'missing_credential' });

  const kiriman = (req.body && req.body.testimoni) || {};
  const pesan = potong(kiriman.pesan, MAKS_PESAN);
  if (!pesan) {
    return res.status(400).json({
      ok: false,
      reason: 'pesan_kosong',
      pesan: 'Ceritanya masih kosong. Tulis dulu pengalamanmu ikut kelas ini.',
    });
  }

  try {
    const verified = await verifyAccess.verifyGoogleToken(idToken, clientId);
    if (!verified.valid) {
      return res.status(401).json({ ok: false, reason: verified.reason });
    }

    const enrolled = await verifyAccess.fetchEnrolledEmails(rosterUrls, null);
    if (!enrolled.has(verifyAccess.normalisasiEmail(verified.email))) {
      return res.status(403).json({ ok: false, reason: 'not_enrolled' });
    }

    // Ditulis ke spreadsheet DULU. Kalau urutannya dibalik dan penulisan
    // gagal, emailnya sudah tercatat sudah-mengisi dan sertifikatnya
    // terbuka padahal testimoninya tidak pernah sampai ke mana pun.
    await panggilAppsScript('testimoni', {
      isi: {
        email: verified.email,
        nama: potong(kiriman.nama, MAKS_PENDEK) || verified.nama || '',
        fakultas: potong(kiriman.fakultas, MAKS_PENDEK),
        skorEpt: potong(kiriman.skorEpt, 20),
        pesan,
      },
    });

    // Baru sesudah itu emailnya dicatat sebagai syarat sertifikat.
    //
    // Baca-ubah-tulis ini tidak dikunci. Dua siswa yang mengirim pada
    // detik yang sama bisa membuat salah satu emailnya tidak tercatat;
    // akibat terburuknya orang itu perlu mengirim sekali lagi, sementara
    // testimoninya sendiri sudah aman tersimpan di spreadsheet. Mengunci
    // untuk kasus sejarang itu tidak sepadan.
    try {
      const overrides = await readOverrides();
      const daftar = Array.isArray(overrides.testimoniSudahIsi)
        ? overrides.testimoniSudahIsi.slice()
        : [];
      const kunci = verifyAccess.normalisasiEmail(verified.email);
      if (daftar.indexOf(kunci) === -1) {
        daftar.push(kunci);
        await writeOverrides({ testimoniSudahIsi: daftar });
      }
    } catch (err) {
      // Testimoninya sudah tersimpan, jadi ini bukan kegagalan kiriman.
      // Yang hilang cuma pembuka sertifikatnya, dan itu bisa disusulkan
      // manual. Dicatat supaya ketahuan kalau sering terjadi.
      console.error('kelas-testimoni: gagal mencatat email pengisi: ' + err.message);
      return res.status(200).json({
        ok: true,
        sertifikatTerbuka: false,
        pesan:
          'Testimonimu sudah kami terima, terima kasih. Tapi tombol sertifikatnya ' +
          'belum bisa dibuka otomatis. Hubungi kami lewat WhatsApp supaya dibukakan.',
      });
    }

    console.log('kelas-testimoni: testimoni masuk dari ' + verified.email);
    return res.status(200).json({ ok: true, sertifikatTerbuka: true });
  } catch (err) {
    console.error('kelas-testimoni:', err.message);
    return res.status(502).json({
      ok: false,
      reason: 'gagal_simpan',
      pesan: 'Testimoninya gagal terkirim. Coba lagi sebentar lagi.',
    });
  }
};
