const { requireAdmin } = require('./admin-guard');
const { readOverrides } = require('./global-config-store');
const { kirimUji } = require('./kirim-email');

/**
 * Tombol "kirim email uji" di /atur-form.
 *
 * ============================================================
 * KENAPA ENDPOINT INI ADA
 * ============================================================
 * Semua email otomatis di proyek ini sengaja gagal DIAM-DIAM: pendaftaran
 * orang yang sudah mentransfer uang tidak boleh batal cuma karena Gmail
 * sedang bermasalah (lihat _lib/kirim-email.js). Konsekuensinya, kalau
 * pengiriman email mati total, tidak ada satu pun gejala yang terlihat --
 * pendaftar melihat "berhasil", admin melihat "Disetujui", dan emailnya
 * cuma tidak pernah datang.
 *
 * Endpoint ini yang menutup lubang itu: satu tombol yang menempuh jalur
 * yang sama persis dan MELAPORKAN hasilnya, jadi kegagalan bisa ketahuan
 * kapan saja tanpa menunggu ada pendaftar asli yang jadi korbannya.
 *
 * Tiga hal yang paling sering mematikannya, dan semuanya ketahuan dari
 * sini:
 *   1. apps-script.gs sudah diubah tapi belum di-Deploy ulang sebagai
 *      versi baru (paling sering, dan akibatnya 100% email gagal)
 *   2. kuota Gmail harian habis (100/hari untuk akun Gmail biasa)
 *   3. emailnya terkirim tapi mendarat di folder Spam
 */

/**
 * Terjemahkan kegagalan jadi kalimat yang bisa langsung dikerjakan.
 *
 * Pesan mentahnya sudah cukup jelas untuk yang menulis kodenya, tapi yang
 * membaca layar ini adalah pemilik situs. "action_tidak_dikenal" tidak
 * memberi tahu siapa pun bahwa yang perlu dilakukan adalah menekan Deploy.
 */
function terjemahkan(alasan) {
  const t = String(alasan || '');

  if (t.includes('action_tidak_dikenal')) {
    return (
      'Skrip di Google Sheet belum mengenal perintah kirim email, jadi versi yang ' +
      'sedang jalan di sana masih versi lama. Buka spreadsheet pendaftaran > ' +
      'Extensions > Apps Script, tempel ulang seluruh isi apps-script.gs, lalu ' +
      'Deploy > Manage deployments > edit > Version: New version. Menyimpan saja ' +
      'tidak cukup, harus di-deploy ulang.'
    );
  }
  if (/too many times|quota|limit exceeded/i.test(t)) {
    return (
      'Kuota email Gmail hari ini sudah habis (akun Gmail biasa 100 penerima per ' +
      'hari, akun Workspace 1500). Semua email otomatis berhenti terkirim sampai ' +
      'kuotanya kembali besok. Untuk sekarang, kirim manual dari Gmail.'
    );
  }
  if (t.includes('teks_kosong')) {
    return 'Judul atau isi emailnya masih kosong. Isi dulu di atas, tekan Simpan, baru diuji lagi.';
  }
  if (t.includes('alamat_tidak_sah')) {
    return 'Alamat tujuannya tidak terbaca sebagai email yang sah.';
  }
  if (t.includes('jenis_tidak_dikenal')) {
    return 'Jenis email yang diminta tidak dikenal.';
  }

  // Sisanya sudah ditulis sebagai kalimat utuh oleh _lib/apps-script.js
  // (URL belum diisi, secret ditolak, balasan bukan JSON), jadi diteruskan
  // apa adanya daripada diringkas jadi lebih kabur.
  return t || 'Gagal mengirim, tanpa keterangan.';
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const body = req.body || {};
  const jenis = body.jenis === 'emailSetuju' ? 'emailSetuju' : 'emailTerima';

  // Kosong berarti dikirim ke alamat admin yang sedang login -- alamat itu
  // sudah diverifikasi Google di requireAdmin, jadi tidak bisa dikarang.
  //
  // Alamat lain tetap boleh diisi, dan itu memang gunanya: mendarat atau
  // tidaknya email di folder Spam beda-beda per penyedia, jadi menguji ke
  // Outlook atau email kampus memberi jawaban yang tidak bisa didapat dari
  // menguji sesama Gmail. Tidak dijaga lebih jauh karena seluruh endpoint
  // ini sudah di balik login admin.
  const ke = String(body.ke || '').trim() || admin.email;

  try {
    const overrides = await readOverrides();
    const hasil = await kirimUji(overrides, jenis, ke);

    if (!hasil.ok) {
      console.error('admin-email-uji: ' + admin.email + ' -> gagal: ' + hasil.alasan);
      return res.status(200).json({
        ok: false,
        reason: hasil.alasan,
        pesan: terjemahkan(hasil.alasan),
        ke,
      });
    }

    console.log('admin-email-uji: ' + admin.email + ' -> ' + jenis + ' terkirim ke ' + ke);
    return res.status(200).json({ ok: true, ke, sisaKuota: hasil.sisaKuota });
  } catch (err) {
    console.error('admin-email-uji:', err.message);
    return res.status(502).json({ ok: false, reason: 'gagal_kirim', pesan: err.message });
  }
};
