const { requireAdmin } = require('./_lib/admin-guard');
const { panggilAppsScript } = require('./_lib/apps-script');
const { readOverrides } = require('./_lib/global-config-store');
const { bacaBaris, KOLOM_BERLAKU_SAMPAI, KOLOM_BATCH } = require('./_lib/form-schema');
const { daftarTersimpan, batchAktif } = require('./_lib/batch');
const DEFAULTS = require('./_lib/site-defaults');
const { kirimAksesDibuka } = require('./_lib/kirim-email');
const { kerjakanDiLatar } = require('./_lib/kerja-latar');

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
      // Apps Script sengaja tidak tahu apa-apa soal isi formulir, jadi
      // yang dikirimnya baris mentah per kolom. Diterjemahkan di sini
      // memakai susunan field yang sedang berlaku -- lihat bacaBaris()
      // di form-schema.js, pasangan dari susunBaris() yang menulisnya.
      const [hasil, overrides] = await Promise.all([
        panggilAppsScript('list'),
        readOverrides().catch(() => ({})),
      ]);

      const pendaftar = (hasil.pendaftar || []).map((p) =>
        Object.assign({ id: p.id }, bacaBaris(overrides.formFields, p.baris))
      );

      return res.status(200).json({ ok: true, pendaftar });
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
      // Waktu MENYETUJUI, tanggal berakhirnya akses disalin ke kolom W
      // barisnya. Dihitung di sini (bukan waktu orangnya mendaftar) supaya
      // yang berlaku adalah tanggal yang sedang disetel saat kamu memberi
      // akses, bukan yang kebetulan tersimpan berminggu-minggu lalu.
      //
      // Kalau tanggalnya belum disetel, kolomnya dibiarkan kosong dan
      // orang itu tidak punya batas waktu -- sama persis dengan peserta
      // lama dari Google Form.
      let isiTambahan;
      let overridesSetuju = null;
      if (aksi === 'approve') {
        const overrides = await readOverrides().catch(() => ({}));
        overridesSetuju = overrides;

        /* BATCH.
           Selama daftar batch masih kosong, fitur ini dianggap belum
           dipakai dan seluruh blok ini tidak melakukan apa-apa: tanggal
           tetap diambil dari setelan global, tidak ada label yang
           ditulis, dan persetujuan berperilaku persis seperti sebelum
           fitur batch ada.

           Begitu ada MINIMAL SATU batch, persetujuan menuntut ada batch
           yang terbuka. Sengaja menolak, bukan menyetujui tanpa label:
           baris tanpa label tidak akan pernah ikut tercabut waktu
           batch-nya dibersihkan, dan itu baru ketahuan berbulan-bulan
           kemudian sebagai orang yang masih bisa masuk padahal
           angkatannya sudah lama selesai. */
        const daftarBatch = daftarTersimpan(overrides);
        const aktif = daftarBatch.length > 0 ? batchAktif(daftarBatch) : null;

        if (daftarBatch.length > 0 && !aktif) {
          return res.status(409).json({ ok: false, reason: 'batch_belum_dibuka' });
        }

        // Tanggal milik batch menang atas setelan global. Setelan global
        // tetap jadi cadangan supaya batch yang dibuka tanpa tanggal
        // tidak diam-diam menghapus batas waktu yang selama ini berlaku.
        const tanggal = String(
          (aktif && aktif.aksesBerakhir) ||
            (overrides.aksesBerakhirPada !== undefined
              ? overrides.aksesBerakhirPada
              : DEFAULTS.aksesBerakhirPada)
        ).trim();

        if (aktif) {
          isiTambahan = Object.assign({}, isiTambahan, { [KOLOM_BATCH]: aktif.nama });
        }

        // Cuma format yang benar-benar dikenali yang ditulis. Nilai
        // setengah jadi di kolom itu lebih berbahaya daripada kolom
        // kosong: verify-access mengabaikan yang tidak terbaca, jadi
        // hasilnya akan terlihat seperti batas waktu terpasang padahal
        // tidak pernah berlaku.
        //
        // MENGGABUNG, bukan menimpa. Sempat ditulis sebagai penugasan
        // biasa di sini, dan akibatnya label batch yang baru saja disetel
        // di atas terhapus tanpa jejak -- barisnya masuk roster dengan
        // tanggal yang benar tapi tanpa batch, jadi tidak akan pernah
        // ikut tercabut waktu angkatannya dibersihkan.
        if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
          isiTambahan = Object.assign({}, isiTambahan, { [KOLOM_BERLAKU_SAMPAI]: tanggal });
        }
      }

      await panggilAppsScript(aksi, { id, isiTambahan });

      // Pemberitahuan "akses sudah dibuka" dikirim SETELAH barisnya benar-
      // benar pindah ke roster. Kalau dikirim lebih dulu lalu pemindahannya
      // gagal, orangnya akan mencoba masuk dan ditolak, yang jauh lebih
      // membingungkan daripada telat dapat email.
      //
      // Tidak ditunggu hasilnya: kegagalan kirim tidak boleh membuat
      // persetujuan yang sudah berhasil terlihat gagal di layar admin.
      // Dititipkan lewat kerjakanDiLatar supaya tetap benar-benar berangkat
      // walau balasannya sudah dikirim duluan (lihat _lib/kerja-latar.js).
      // Paket Pair dan Group mengirim sampai tiga email berurutan, jadi di
      // sinilah pola lepas-begitu-saja paling gampang kehilangan email.
      if (aksi === 'approve') {
        const p = req.body && req.body.pendaftar ? req.body.pendaftar : {};
        await kerjakanDiLatar(
          () =>
            kirimAksesDibuka(
              overridesSetuju || {},
              [p.emailDiri, p.p2Email, p.p3Email],
              p.nama
            ),
          'email akses dibuka'
        );
      }
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
