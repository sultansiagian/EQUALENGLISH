const DEFAULTS = require('./_lib/site-defaults');
const { requireAdmin } = require('./_lib/admin-guard');
const { readOverrides, writeOverrides } = require('./_lib/global-config-store');
const { normalisasiFields } = require('./_lib/form-schema');
const { panggilAppsScript } = require('./_lib/apps-script');
const { kerjakanDiLatar } = require('./_lib/kerja-latar');
// Batas jumlah catatan batch (satu batch kira-kira sebulan, jadi 60 sudah
// lima tahun ke depan). DIAMBIL dari batch.js, bukan diketik ulang:
// sempat ada dua konstanta bernama sama dengan nilai sama di dua berkas,
// dan dua angka untuk satu batasan cepat atau lambat dinaikkan sendirian
// sehingga batasnya bergantung pada pintu mana yang dilewati.
const { MAKS_BATCH } = require('./_lib/batch');

// Batas jumlah testimoni & panjang tiap field. Angkanya dipilih longgar
// (jauh di atas kebutuhan wajar) tapi tetap terbatas, semata supaya satu
// kesalahan tidak bisa menghabiskan kuota 1 MB Global Config yang dipakai
// bersama SELURUH konten situs.
const MAX_TESTIMONIALS = 24;

// Batas jumlah tanya-jawab FAQ. Halaman FAQ yang lebih panjang dari ini
// sudah bukan FAQ lagi, dan alasan batasnya sama dengan testimoni:
// Global Config dipakai bersama SELURUH konten situs dengan jatah 1 MB.
const MAKS_FAQ = 30;

// Batas jumlah sesi jadwal kelas. Jauh di atas kebutuhan wajar
// (bootcamp 10 hari), alasannya sama dengan batas testimoni di atas.
const MAKS_SESI = 60;

// Batas jumlah catatan perubahan harga. Harga jarang berubah, jadi 40
// entri sudah sangat longgar.
const MAKS_RIWAYAT_HARGA = 40;

/**
 * Ubah nilai apa pun jadi teks untuk dicatat di riwayat.
 *
 * Array dan objek (susunan formulir, daftar testimoni, jadwal) di-JSON-kan
 * supaya perbandingan "berubah atau tidak" bisa dilakukan dengan satu
 * perbandingan teks, bukan penelusuran isi. Perbandingan itulah yang
 * menentukan baris mana yang layak dicatat: /admin selalu mengirim SEMUA
 * field yang ada di halamannya, jadi tanpa penyaringan ini satu klik
 * Simpan akan menghasilkan puluhan baris riwayat yang isinya sama semua.
 */
function ringkasNilai(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch (err) {
      return '(tidak bisa dibaca)';
    }
  }
  return String(v);
}

function trimTo(value, maxLen) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, maxLen);
}

/**
 * GET  -> nilai yang SEDANG AKTIF di halaman publik (override Global Config
 *         kalau ada, kalau tidak nilai default index.html) -- ini yang
 *         dipakai admin.js mengisi form waktu halaman /admin dibuka,
 *         supaya form-nya tidak pernah tampil kosong.
 * POST -> simpan field yang diedit. Selalu upsert (menulis nilai persis
 *         yang dikirim, termasuk kalau kebetulan sama dengan default) --
 *         TIDAK ada logika "hapus override kalau sama dengan default".
 *         Sengaja simpel: kalau admin mau balik ke teks semula, tinggal
 *         ketik ulang teks itu dan Simpan lagi, hasilnya sama persis dari
 *         sisi tampilan.
 */
module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'GET') {
    try {
      const overrides = await readOverrides();
      const values = Object.assign({}, DEFAULTS, overrides);
      return res.status(200).json({ ok: true, values, email: admin.email });
    } catch (err) {
      console.error('admin-content GET error:', err.message);
      return res.status(500).json({ ok: false, reason: 'read_failed' });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const items = req.body && req.body.items;
    if (!items || typeof items !== 'object') {
      return res.status(400).json({ ok: false, reason: 'missing_items' });
    }

    // Allowlist dari kunci yang dikenal (site-defaults.js) -- endpoint ini
    // tidak boleh dipakai untuk menulis kunci Global Config sembarangan.
    const allowedKeys = Object.keys(DEFAULTS);
    const filtered = {};
    Object.keys(items).forEach((k) => {
      if (allowedKeys.indexOf(k) !== -1) filtered[k] = items[k];
    });
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ ok: false, reason: 'no_valid_keys' });
    }

    // "testimonials" satu-satunya kunci yang isinya ARRAY, bukan nilai
    // tunggal, jadi allowlist di atas belum cukup -- bentuk dalamnya masih
    // bebas. Dinormalkan di sini supaya Global Config tidak bisa terisi
    // struktur aneh atau kebablasan besar (batas store-nya 1 MB untuk
    // SELURUH konten situs; array yang tidak dibatasi bisa menghabiskannya
    // dan bikin semua penyimpanan berikutnya gagal).
    if (filtered.testimonials !== undefined) {
      if (!Array.isArray(filtered.testimonials)) {
        return res.status(400).json({ ok: false, reason: 'testimonials_bukan_array' });
      }
      filtered.testimonials = filtered.testimonials
        .slice(0, MAX_TESTIMONIALS)
        .map((t) => ({
          nama: trimTo(t && t.nama, 80),
          fakultas: trimTo(t && t.fakultas, 120),
          skorEpt: trimTo(t && t.skorEpt, 20),
          pesan: trimTo(t && t.pesan, 600),
          fotoUrl: trimTo(t && t.fotoUrl, 400),
        }))
        // Item yang benar-benar kosong dibuang, tapi item setengah isi
        // TETAP disimpan -- admin mungkin sedang menyicil mengisi. Yang
        // memutuskan item mana yang layak tampil di halaman publik adalah
        // renderTestimonials() di api/render-home.js, bukan di sini.
        .filter((t) => t.nama || t.pesan || t.fakultas || t.skorEpt || t.fotoUrl);
    }

    // FAQ, sama seperti testimonials: isinya array, jadi allowlist kunci
    // saja belum cukup untuk menjaga bentuk dalamnya.
    if (filtered.faq !== undefined) {
      if (!Array.isArray(filtered.faq)) {
        return res.status(400).json({ ok: false, reason: 'faq_bukan_array' });
      }
      filtered.faq = filtered.faq
        .slice(0, MAKS_FAQ)
        .map((f) => ({
          tanya: trimTo(f && f.tanya, 200),
          jawab: trimTo(f && f.jawab, 1200),
        }))
        // Yang benar-benar kosong dibuang; yang setengah isi TETAP
        // disimpan karena admin mungkin sedang menyicil. Yang memutuskan
        // mana yang layak tayang adalah renderFaq() di render-home.js,
        // dan itu menuntut tanya DAN jawab dua-duanya terisi.
        .filter((f) => f.tanya || f.jawab);
    }

    // ============================================================
    // PERUBAHAN HARGA DICATAT, BUKAN CUMA DITIMPA
    // ============================================================
    // Kalau harga paket berubah, harga LAMA dicatat dulu beserta waktu
    // berlakunya. Halaman /analitik memakai catatan ini untuk menghargai
    // tiap pendaftar menurut tanggal dia mendaftar, bukan menurut harga
    // yang kebetulan berlaku hari ini.
    //
    // Kalau riwayatnya masih kosong, harga lama disimpan lebih dulu
    // dengan berlakuSejak null (artinya sejak awal). Tanpa langkah itu,
    // harga lama hilang selamanya begitu diganti sekali.
    const KUNCI_HARGA = ['pkg1Price', 'pkg2Price', 'pkg3Price'];
    const adaHargaBaru = KUNCI_HARGA.some((k) => filtered[k] !== undefined);

    if (adaHargaBaru) {
      const lama = await readOverrides().catch(() => ({}));
      const nilaiLama = KUNCI_HARGA.map((k) =>
        Number(lama[k] !== undefined ? lama[k] : DEFAULTS[k])
      );
      const nilaiBaru = KUNCI_HARGA.map((k, i) =>
        filtered[k] !== undefined ? Number(filtered[k]) : nilaiLama[i]
      );

      if (nilaiLama.join() !== nilaiBaru.join()) {
        const riwayat = Array.isArray(lama.hargaRiwayat) ? lama.hargaRiwayat.slice(0, MAKS_RIWAYAT_HARGA) : [];

        if (riwayat.length === 0) {
          riwayat.push({
            berlakuSejak: null,
            pkg1Price: nilaiLama[0],
            pkg2Price: nilaiLama[1],
            pkg3Price: nilaiLama[2],
          });
        }

        riwayat.push({
          berlakuSejak: new Date().toISOString(),
          pkg1Price: nilaiBaru[0],
          pkg2Price: nilaiBaru[1],
          pkg3Price: nilaiBaru[2],
        });

        filtered.hargaRiwayat = riwayat.slice(-MAKS_RIWAYAT_HARGA);
        console.log(
          'admin-content: harga berubah ' + nilaiLama.join('/') + ' -> ' + nilaiBaru.join('/') +
            ', dicatat ke riwayat (' + filtered.hargaRiwayat.length + ' entri).'
        );
      }
    }

    // Catatan batch. Dinormalkan dan dibatasi dengan alasan yang sama
    // seperti dua array di atas.
    //
    // WARISAN. Sejak pengelolaan batch dipindah ke /batch, tidak ada lagi
    // yang mengirim `batchDaftar` ke sini; yang ditulis sekarang
    // `batchList` lewat api/_lib/handler-batch.js. Penjagaan ini
    // dibiarkan hidup supaya tab admin lama yang masih terbuka tidak bisa
    // menyimpan bentuk yang rusak, TAPI nilainya cuma dibaca sebagai asal
    // migrasi (lihat daftarTersimpan() di api/_lib/batch.js) dan berhenti
    // dipakai begitu `batchList` terisi. Menulis ke sini tidak akan
    // mengubah apa pun di /batch.
    if (filtered.batchDaftar !== undefined) {
      if (!Array.isArray(filtered.batchDaftar)) {
        return res.status(400).json({ ok: false, reason: 'batch_bukan_array' });
      }
      filtered.batchDaftar = filtered.batchDaftar.slice(0, MAKS_BATCH).map((b, i) => ({
        nama: trimTo(b && b.nama, 60) || 'Batch ' + (i + 1),
        // null dipertahankan apa adanya: itu penanda sejak-awal untuk
        // mulai, dan masih-berjalan untuk selesai.
        mulai: b && b.mulai ? trimTo(b.mulai, 30) : null,
        selesai: b && b.selesai ? trimTo(b.selesai, 30) : null,
      }));
    }

    // Jadwal sesi kelas: array bebas juga, jadi perlu dinormalkan dan
    // dibatasi dengan alasan yang sama seperti testimonials di atas.
    // 60 sesi jauh di atas kebutuhan wajar (bootcamp 10 hari), tapi tetap
    // ada batasnya supaya satu kesalahan tidak menghabiskan kuota 1 MB
    // yang dipakai bersama SELURUH konten situs.
    if (filtered.kelasJadwal !== undefined) {
      if (!Array.isArray(filtered.kelasJadwal)) {
        return res.status(400).json({ ok: false, reason: 'jadwal_bukan_array' });
      }
      filtered.kelasJadwal = filtered.kelasJadwal
        .slice(0, MAKS_SESI)
        .map((s) => ({
          tanggal: trimTo(s && s.tanggal, 10),
          jam: trimTo(s && s.jam, 5),
          topik: trimTo(s && s.topik, 120),
        }))
        // Sesi tanpa tanggal tidak berarti apa-apa: jadwal, timer, progres,
        // dan bar progres semuanya bergantung pada tanggalnya.
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.tanggal))
        // Diurutkan di sini, bukan dipercayakan ke urutan pengetikan admin.
        // Sesi berikutnya, progres, dan kunci Zoom semuanya menganggap
        // daftar ini urut waktu.
        .sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
    }

    // formFields juga array bebas seperti testimonials, tapi taruhannya
    // jauh lebih tinggi: susunan yang salah bisa menghapus pertanyaan
    // email (kunci akses ruang kelas) atau menulis jawaban ke kolom
    // spreadsheet yang keliru. Semua penjagaannya ada di
    // normalisasiFields() -- lihat komentar panjang di form-schema.js.
    if (filtered.formFields !== undefined) {
      filtered.formFields = normalisasiFields(filtered.formFields);
    }

    try {
      // Nilai LAMA dibaca sebelum ditimpa, supaya bisa dicatat berikut
      // nilai barunya. Ini juga yang membuat tombol "Kembalikan" di
      // /admin bisa ada tanpa menyimpan salinan penuh di mana pun.
      const sebelum = await readOverrides().catch(() => ({}));

      await writeOverrides(filtered);

      // Dicatat SETELAH penyimpanan berhasil, dan TIDAK ditunggu.
      // Gagal mencatat riwayat tidak boleh membuat penyimpanan yang sudah
      // berhasil terlihat gagal di layar admin.
      const perubahan = Object.keys(filtered)
        .map((k) => ({
          kunci: k,
          lama: ringkasNilai(sebelum[k] !== undefined ? sebelum[k] : DEFAULTS[k]),
          baru: ringkasNilai(filtered[k]),
        }))
        .filter((p) => p.lama !== p.baru);

      if (perubahan.length > 0) {
        await kerjakanDiLatar(
          () => panggilAppsScript('riwayat', { perubahan, oleh: admin.email }),
          'catat riwayat /admin'
        ).catch(() => {});
      }

      return res.status(200).json({ ok: true, tercatat: perubahan.length });
    } catch (err) {
      console.error('admin-content POST error:', err.message);
      return res.status(502).json({ ok: false, reason: 'write_failed', message: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
};

// Diekspor untuk diuji. Vercel tetap memanggil module.exports sebagai
// fungsi handler; properti tambahan di atasnya tidak mengganggu -- pola
// yang sama dipakai api/verify-access.js.
module.exports.ringkasNilai = ringkasNilai;
