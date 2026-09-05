const { requireAdmin } = require('./admin-guard');
const { panggilAppsScript } = require('./apps-script');
const { readOverrides, writeOverrides } = require('./global-config-store');
const { bacaBaris, KOLOM_BATCH, KOLOM_BERLAKU_SAMPAI } = require('./form-schema');
const { daftarTersimpan, bukaBatch, tutupBatch, gantiNamaBatch, labelBatchBaris } = require('./batch');
const { kirimAksesBerakhir } = require('./kirim-email');
const { kerjakanDiLatar } = require('./kerja-latar');

/**
 * Halaman /batch: melihat anggota tiap angkatan, menutup angkatan yang
 * sudah selesai, membuka yang baru, dan mencabut/memulihkan akses.
 *
 * BUKAN rute sendiri. Dipasang lewat api/admin-data.js sebagai
 * bagian "batch", karena Vercel Hobby membatasi 12 Serverless Function
 * per deployment dan tiap berkas langsung di dalam api/ dihitung satu.
 * Berkas di api/_lib/ tidak dihitung. Lihat catatan panjang di
 * admin-data.js soal build yang gagal seluruhnya waktu batasnya
 * terlampaui -- gejalanya "sudah di-push tapi situsnya tidak berubah",
 * tanpa error yang terlihat.
 *
 * GET            -> daftar batch + seluruh baris roster, sudah dikelompokkan
 * POST buka      -> batch baru jadi satu-satunya yang menerima anggota
 * POST tutup     -> batch berhenti menerima anggota (akses TIDAK berubah)
 * POST cabut     -> tulis "done" di baris yang dipilih, kirim pemberitahuan
 * POST pulihkan  -> bersihkan "done" dari baris yang dipilih
 *
 * Dilindungi requireAdmin seperti endpoint admin lain, dan di sini
 * taruhannya sama besar dengan /pendaftar: "cabut" mematikan akses ke
 * materi yang sudah dibayar orang, "pulihkan" menghidupkannya lagi.
 */

const MAKS_CABUT_SEKALIGUS = 200;

/** Baris roster mentah -> bentuk yang dipakai halaman admin. */
function ringkasBaris(fields, baris) {
  const isi = Array.isArray(baris.isi) ? baris.isi : [];
  const data = bacaBaris(fields, isi);

  // Semua email di baris ini. Satu baris paket Pair/Group memang berisi
  // dua sampai tiga orang, dan pencabutan berlaku SEBARIS -- jadi
  // daftarnya dibawa utuh supaya halaman admin bisa menyebut terus
  // terang siapa saja yang ikut terkena.
  const email = [data.emailDiri, data.p2Email, data.p3Email]
    .map((e) => String(e || '').trim())
    .filter(Boolean);

  const anggota = [data.nama || data.namaDiri, data.p2Nama, data.p3Nama]
    .map((n) => String(n || '').trim())
    .filter(Boolean);

  return {
    nomorBaris: baris.nomorBaris,
    nama: data.nama || data.namaDiri || '(tanpa nama)',
    anggota,
    email,
    fakultas: data.fakultas || '',
    paket: data.paket || '',
    timestamp: data.timestamp || '',
    berlakuSampai: String(isi[KOLOM_BERLAKU_SAMPAI] || '').trim(),
    batch: labelBatchBaris(isi, KOLOM_BATCH),
    dicabut: baris.dicabut === true,
  };
}

async function ambilRoster(overrides) {
  const hasil = await panggilAppsScript('rosterList');
  const baris = Array.isArray(hasil.baris) ? hasil.baris : [];
  return {
    anggota: baris.map((b) => ringkasBaris(overrides.formFields, b)),
    // Apps Script cuma membaca sebagian baris terakhir kalau sheet-nya
    // panjang (lihat MAKS_BARIS di apps-script.gs). Angka aslinya dibawa
    // sampai ke layar supaya halaman admin bisa menyebutnya terus terang;
    // menampilkan sebagian tanpa memberi tahu adalah cara paling halus
    // untuk membuat orang salah mengira satu angkatan sudah kosong.
    total: Number.isFinite(hasil.total) ? hasil.total : baris.length,
    terpotong: hasil.terpotong === true,
  };
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'GET') {
    try {
      const overrides = await readOverrides().catch(() => ({}));
      const daftarBatch = daftarTersimpan(overrides);
      const roster = await ambilRoster(overrides);

      return res.status(200).json({
        ok: true,
        batch: daftarBatch,
        anggota: roster.anggota,
        total: roster.total,
        terpotong: roster.terpotong,
      });
    } catch (err) {
      console.error('admin-batch GET:', err.message);
      return res.status(502).json({ ok: false, reason: 'gagal_baca', pesan: err.message });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const body = req.body || {};
  const aksi = String(body.aksi || '').trim();

  try {
    const overrides = await readOverrides().catch(() => ({}));
    const daftarSekarang = daftarTersimpan(overrides);

    if (aksi === 'buka') {
      const hasil = bukaBatch(daftarSekarang, {
        nama: body.nama,
        aksesBerakhir: body.aksesBerakhir,
      });
      if (!hasil.ok) return res.status(400).json({ ok: false, reason: hasil.reason });

      await writeOverrides({ batchList: hasil.daftar });
      console.log('admin-batch: ' + admin.email + ' -> buka ' + hasil.batch.nama);
      return res.status(200).json({ ok: true, batch: hasil.batch, daftar: hasil.daftar });
    }

    if (aksi === 'tutup') {
      const hasil = tutupBatch(daftarSekarang, body.id);
      if (!hasil.ok) return res.status(400).json({ ok: false, reason: hasil.reason });

      await writeOverrides({ batchList: hasil.daftar });
      console.log('admin-batch: ' + admin.email + ' -> tutup ' + body.id);
      return res.status(200).json({ ok: true, daftar: hasil.daftar });
    }

    if (aksi === 'ganti-nama') {
      const hasil = gantiNamaBatch(daftarSekarang, body.id, body.nama);
      if (!hasil.ok) return res.status(400).json({ ok: false, reason: hasil.reason });

      await writeOverrides({ batchList: hasil.daftar });
      console.log(
        'admin-batch: ' + admin.email + ' -> ganti-nama ' + hasil.namaLama + ' jadi ' + body.nama
      );
      // Anggota yang sudah terlanjur berlabel nama LAMA di kolom BS tidak
      // ikut ditulis ulang -- lihat alasannya di gantiNamaBatch(). Jumlah
      // yang terdampak dilaporkan supaya halaman admin bisa mengatakannya
      // terus terang, bukan membiarkan mereka menghilang diam-diam dari
      // daftar batch yang baru berganti nama.
      let terdampak = 0;
      try {
        const roster = await ambilRoster(overrides);
        terdampak = roster.anggota.filter((a) => a.batch === hasil.namaLama).length;
      } catch (err) {
        terdampak = -1; // tidak terbaca; halaman admin yang menjelaskan
      }
      return res.status(200).json({ ok: true, daftar: hasil.daftar, terdampak });
    }

    if (aksi === 'cabut' || aksi === 'pulihkan') {
      const cabut = aksi === 'cabut';

      // Nomor baris dikirim dari halaman admin, dan halaman itu baru saja
      // membacanya lewat GET. Tetap disaring di sini: yang menentukan
      // baris mana yang kehilangan akses tidak boleh cuma dipercayakan
      // pada apa yang dikirim peramban.
      const nomor = (Array.isArray(body.nomorBaris) ? body.nomorBaris : [body.nomorBaris])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 2);

      if (nomor.length === 0) {
        return res.status(400).json({ ok: false, reason: 'baris_tidak_lengkap' });
      }
      if (nomor.length > MAKS_CABUT_SEKALIGUS) {
        return res.status(400).json({ ok: false, reason: 'terlalu_banyak_baris' });
      }

      // Dikerjakan BERURUTAN, bukan Promise.all. Apps Script punya kunci
      // tulis per spreadsheet, dan menembakkan dua ratus permintaan tulis
      // sekaligus membuat sebagian ditolak karena bentrok -- yang
      // hasilnya justru sebagian orang tercabut dan sebagian tidak, tanpa
      // ada yang tahu yang mana.
      const gagal = [];
      const berhasil = [];
      for (const n of nomor) {
        try {
          const hasil = await panggilAppsScript('rosterTandai', { nomorBaris: n, cabut });
          if (hasil && hasil.ok === false) gagal.push({ nomorBaris: n, reason: hasil.reason });
          else berhasil.push(n);
        } catch (err) {
          gagal.push({ nomorBaris: n, reason: err.message });
        }
      }

      // Email pemberitahuan HANYA untuk yang benar-benar berhasil
      // dicabut, dan hanya waktu mencabut. Memberi tahu orang bahwa
      // aksesnya berakhir padahal penulisannya gagal berarti dia akan
      // tetap bisa masuk sambil memegang email yang bilang sebaliknya.
      if (cabut && berhasil.length > 0 && body.kirimEmail !== false) {
        const target = Array.isArray(body.penerima) ? body.penerima : [];
        const perluDikirim = target.filter((t) => berhasil.includes(Number(t && t.nomorBaris)));
        if (perluDikirim.length > 0) {
          await kerjakanDiLatar(async () => {
            for (const t of perluDikirim) {
              await kirimAksesBerakhir(overrides, t.email, t.nama);
            }
          }, 'email akses berakhir');
        }
      }

      console.log(
        'admin-batch: ' + admin.email + ' -> ' + aksi + ' ' + berhasil.length + ' baris' +
          (gagal.length ? ', ' + gagal.length + ' gagal' : '')
      );

      // Sebagian gagal TETAP dilaporkan sebagai ok:true dengan rinciannya,
      // bukan 502 polos. Yang menekan tombol perlu tahu bahwa sebagian
      // sudah terlanjur berubah -- balasan gagal total akan membuatnya
      // menekan ulang dan mencabut yang sama dua kali.
      return res.status(200).json({
        ok: true,
        berhasil: berhasil.length,
        gagal,
      });
    }

    return res.status(400).json({ ok: false, reason: 'aksi_tidak_dikenal' });
  } catch (err) {
    console.error('admin-batch POST:', err.message);
    return res.status(502).json({ ok: false, reason: 'gagal_proses', pesan: err.message });
  }
};
