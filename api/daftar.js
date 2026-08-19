const { panggilAppsScript } = require('./_lib/apps-script');

/**
 * Endpoint form pendaftaran di /daftar. INI SATU-SATUNYA endpoint di
 * proyek ini yang terbuka untuk umum tanpa login, jadi penjagaannya
 * beda dari endpoint /admin.
 *
 * Yang membuat ini tidak berbahaya walau terbuka: pendaftaran masuk ke
 * tab "Pendaftar Web", yang TIDAK terdaftar di ROSTER_CSV_URLS. Jadi
 * mengirim form ini tidak pernah memberi akses ruang kelas ke siapa pun.
 * Akses baru terbuka setelah admin menekan Setujui di /admin, yang
 * memindahkan barisnya ke Form_Responses. Skenario terburuk dari
 * penyalahgunaan endpoint ini cuma baris sampah yang bisa dihapus, bukan
 * orang asing masuk ke kelas berbayar.
 */

// Batas ukuran total body. Vercel sendiri membatasi 4,5 MB; angka di
// sini lebih kecil supaya penolakannya datang dari kode ini dengan pesan
// yang jelas, bukan dari platform dengan error mentah. Ketiga foto sudah
// dikompres di browser (lihat daftar.js), jadi normalnya jauh di bawah ini.
const MAKS_BODY_BYTES = 3.5 * 1024 * 1024;

const PAKET_SAH = ['Individual (1 student)', 'Pair (2 students)', 'Group (3 students)'];

function bersihkan(nilai, maks) {
  return String(nilai === undefined || nilai === null ? '' : nilai)
    .trim()
    .slice(0, maks || 200);
}

function emailSah(nilai) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(nilai || '').trim());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const body = req.body || {};

  // Perangkap bot: field tersembunyi yang tidak pernah diisi manusia
  // (disembunyikan lewat CSS, bukan type=hidden, supaya bot pengisi-semua
  // tetap mengisinya). Kalau terisi, pura-pura berhasil supaya bot tidak
  // tahu perangkapnya ketahuan dan mencoba cara lain.
  if (bersihkan(body.website)) {
    console.log('daftar: submission ditolak karena perangkap bot terisi.');
    return res.status(200).json({ ok: true });
  }

  const perkiraanUkuran = JSON.stringify(body).length;
  if (perkiraanUkuran > MAKS_BODY_BYTES) {
    return res.status(413).json({
      ok: false,
      reason: 'terlalu_besar',
      pesan: 'Total ukuran foto yang diunggah terlalu besar. Coba unggah foto yang lebih kecil.',
    });
  }

  const data = {
    nama: bersihkan(body.nama, 120),
    fakultas: bersihkan(body.fakultas, 120),
    telepon: bersihkan(body.telepon, 40),
    idLine: bersihkan(body.idLine, 80),
    paket: bersihkan(body.paket, 60),
    namaDiri: bersihkan(body.namaDiri, 120),
    teleponDiri: bersihkan(body.teleponDiri, 40),
    emailDiri: bersihkan(body.emailDiri, 120),
    p1Nama: bersihkan(body.p1Nama, 120),
    p1Telepon: bersihkan(body.p1Telepon, 40),
    p1Email: bersihkan(body.p1Email, 120),
    p2Nama: bersihkan(body.p2Nama, 120),
    p2Telepon: bersihkan(body.p2Telepon, 40),
    p2Email: bersihkan(body.p2Email, 120),
    p3Nama: bersihkan(body.p3Nama, 120),
    p3Telepon: bersihkan(body.p3Telepon, 40),
    p3Email: bersihkan(body.p3Email, 120),
    buktiBayar: body.buktiBayar || '',
    buktiBroadcast: body.buktiBroadcast || '',
    buktiInstagram: body.buktiInstagram || '',
  };

  // Validasi ulang di server, bukan cuma di browser. Validasi browser
  // gampang dilewati (matikan JS, kirim request langsung), jadi tidak
  // pernah boleh jadi satu-satunya penjaga.
  const kurang = [];
  if (!data.nama) kurang.push('nama');
  if (!data.fakultas) kurang.push('fakultas');
  if (!data.telepon) kurang.push('nomor HP');
  if (!PAKET_SAH.includes(data.paket)) kurang.push('pilihan paket');
  if (!emailSah(data.emailDiri)) kurang.push('email yang benar');

  // Email tiap peserta wajib, karena EMAIL ITU YANG jadi kunci masuk
  // ruang kelas nanti (api/verify-access.js mencocokkan email akun Google
  // yang dipakai login dengan email di sheet). Peserta tanpa email yang
  // benar akan gagal masuk walau sudah bayar.
  if (data.paket === 'Pair (2 students)' && !emailSah(data.p2Email)) {
    kurang.push('email peserta kedua');
  }
  if (data.paket === 'Group (3 students)') {
    if (!emailSah(data.p2Email)) kurang.push('email peserta kedua');
    if (!emailSah(data.p3Email)) kurang.push('email peserta ketiga');
  }

  if (kurang.length > 0) {
    return res.status(400).json({
      ok: false,
      reason: 'data_kurang',
      pesan: 'Masih ada yang belum diisi: ' + kurang.join(', ') + '.',
    });
  }

  // Peserta pertama = pendaftar itu sendiri. Disalin ke kolom Person 1
  // supaya susunan di Form_Responses konsisten dengan baris lama, di mana
  // paket Pair/Group selalu punya Person 1 terisi.
  if (data.paket !== 'Individual (1 student)') {
    data.p1Nama = data.p1Nama || data.namaDiri || data.nama;
    data.p1Telepon = data.p1Telepon || data.teleponDiri || data.telepon;
    data.p1Email = data.p1Email || data.emailDiri;
  } else {
    data.namaDiri = data.namaDiri || data.nama;
    data.teleponDiri = data.teleponDiri || data.telepon;
  }

  try {
    const hasil = await panggilAppsScript('submit', { data });
    return res.status(200).json({ ok: true, id: hasil.id });
  } catch (err) {
    console.error('daftar: gagal mengirim ke Apps Script:', err.message);
    return res.status(502).json({
      ok: false,
      reason: 'gagal_simpan',
      pesan:
        'Pendaftaran gagal tersimpan. Coba lagi sebentar lagi, atau hubungi kami lewat ' +
        'WhatsApp supaya didaftarkan manual.',
    });
  }
};
