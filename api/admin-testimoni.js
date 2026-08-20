const { requireAdmin } = require('./_lib/admin-guard');
const { panggilAppsScript } = require('./_lib/apps-script');
const { readOverrides, writeOverrides } = require('./_lib/global-config-store');

/**
 * Moderasi testimoni yang dikirim siswa dari /kelas.
 *
 * GET             -> semua kiriman dari tab Testimoni di spreadsheet
 * POST tayangkan  -> salin satu kiriman ke konten beranda
 * POST turunkan   -> cabut lagi dari beranda
 *
 * ============================================================
 * KENAPA HARUS DISALIN, BUKAN LANGSUNG DIBACA BERANDA
 * ============================================================
 * Beranda membaca array "testimonials" di Global Config (lihat
 * renderTestimonials di api/render-home.js). Kiriman siswa TIDAK pernah
 * masuk ke sana sendiri, dua alasan:
 *
 *   1. Tidak ada yang boleh tayang di halaman publik sebelum kamu baca.
 *      Kiriman siswa bisa saja salah ketik, curhat panjang, atau berisi
 *      hal yang tidak pantas.
 *   2. Global Config dibatasi 1 MB untuk SELURUH konten situs. Beranda
 *      juga cuma menampilkan sebagian kecil testimoni. Menyalin yang
 *      terpilih saja menjaga penyimpanan itu tetap kecil.
 */

// Sama dengan batas di api/admin-content.js -- beranda tidak dirancang
// menampilkan lebih dari ini, dan angkanya menjaga ukuran Global Config.
const MAKS_TESTIMONIAL = 24;

function potong(nilai, maks) {
  return String(nilai === undefined || nilai === null ? '' : nilai)
    .trim()
    .slice(0, maks);
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'GET') {
    try {
      const [hasil, overrides] = await Promise.all([
        panggilAppsScript('listTestimoni'),
        readOverrides().catch(() => ({})),
      ]);

      const tayang = Array.isArray(overrides.testimonials) ? overrides.testimonials : [];

      // Ditandai mana yang isinya sudah ada di beranda. Dicocokkan lewat
      // pesannya, bukan id: array di Global Config sengaja tidak menyimpan
      // id kiriman (bentuknya sudah dipakai lebih dulu oleh testimoni yang
      // kamu ketik sendiri dari /admin, yang memang tidak punya id).
      const pesanTayang = tayang.map((t) => String(t.pesan || '').trim());
      const testimoni = (hasil.testimoni || []).map((t) =>
        Object.assign({}, t, { sudahTayang: pesanTayang.indexOf(String(t.pesan || '').trim()) !== -1 })
      );

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, testimoni, jumlahTayang: tayang.length });
    } catch (err) {
      console.error('admin-testimoni GET:', err.message);
      return res.status(502).json({ ok: false, reason: 'gagal_baca', pesan: err.message });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const aksi = body.aksi === 'turunkan' ? 'turunkan' : body.aksi === 'tayangkan' ? 'tayangkan' : null;
    const id = String(body.id || '').trim();

    if (!aksi || !id) {
      return res.status(400).json({ ok: false, reason: 'permintaan_tidak_lengkap' });
    }

    try {
      const overrides = await readOverrides().catch(() => ({}));
      const daftar = Array.isArray(overrides.testimonials) ? overrides.testimonials.slice() : [];
      const pesan = potong(body.pesan, 600);

      if (aksi === 'tayangkan') {
        if (!pesan) {
          return res.status(400).json({ ok: false, reason: 'pesan_kosong' });
        }
        if (daftar.length >= MAKS_TESTIMONIAL) {
          return res.status(400).json({
            ok: false,
            reason: 'penuh',
            pesan:
              'Beranda sudah memuat ' + MAKS_TESTIMONIAL + ' testimoni, batas maksimalnya. ' +
              'Turunkan salah satu dulu di Konten Beranda sebelum menayangkan yang ini.',
          });
        }
        // Dicek supaya menekan tombol dua kali tidak membuat testimoni
        // yang sama tampil dobel di beranda.
        if (daftar.some((t) => String(t.pesan || '').trim() === pesan)) {
          return res.status(200).json({ ok: true, sudahAda: true });
        }

        daftar.push({
          nama: potong(body.nama, 80),
          fakultas: potong(body.fakultas, 120),
          skorEpt: potong(body.skorEpt, 20),
          pesan,
          // Foto tidak ikut dari kiriman siswa; beranda otomatis memakai
          // inisial nama kalau fotonya kosong. Kamu bisa menambahkan foto
          // belakangan dari Konten Beranda.
          fotoUrl: '',
        });
      } else {
        const sebelum = daftar.length;
        for (let i = daftar.length - 1; i >= 0; i--) {
          if (String(daftar[i].pesan || '').trim() === pesan) daftar.splice(i, 1);
        }
        if (daftar.length === sebelum) {
          return res.status(200).json({ ok: true, tidakAda: true });
        }
      }

      await writeOverrides({ testimonials: daftar });

      // Penanda di spreadsheet diperbarui juga supaya statusnya terlihat
      // langsung dari sana, bukan cuma dari halaman ini. Kegagalannya
      // tidak menggagalkan apa pun: yang menentukan tayang atau tidak
      // adalah Global Config, kolom ini cuma catatan buat manusia.
      panggilAppsScript('tayangkanTestimoni', { id, tayang: aksi === 'tayangkan' }).catch((err) =>
        console.error('admin-testimoni: penanda di sheet gagal diperbarui: ' + err.message)
      );

      console.log('admin-testimoni: ' + admin.email + ' -> ' + aksi + ' ' + id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('admin-testimoni POST:', err.message);
      return res.status(502).json({ ok: false, reason: 'gagal_proses', pesan: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
};
