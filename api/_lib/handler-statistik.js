const { requireAdmin } = require('./admin-guard');
const { readOverrides, writeOverrides } = require('./global-config-store');
const { hitungStatistik, gabungStatistik } = require('./statistik');
const DEFAULTS = require('./site-defaults');

/**
 * Angka untuk halaman /analitik.
 *
 * Sumbernya sheet yang SAMA PERSIS dengan yang dipakai gerbang login
 * siswa (ROSTER_CSV_URLS), bukan sumber terpisah. Jadi kalau halaman ini
 * menghitung 12 orang, itu benar-benar 12 orang yang bisa masuk /kelas.
 * Tidak ada kemungkinan dua angka yang berbeda untuk hal yang sama.
 *
 * ============================================================
 * BATAS BATCH DICATAT, ANGKANYA TIDAK
 * ============================================================
 * Yang disimpan cuma nama dan rentang waktu tiap batch. Jumlah pendaftar
 * dan pendapatannya dihitung ULANG dari roster tiap kali halaman ini
 * dibuka.
 *
 * Kalau angkanya ikut disimpan waktu batch ditutup, satu baris yang
 * dibetulkan belakangan (salah ketik paket, bukti bayar menyusul) tidak
 * akan pernah tercermin, dan angka batch lama membeku salah selamanya.
 * Menghitung ulang lebih mahal sedikit, tapi selalu jujur.
 */

// Sama dengan cache CSV di verify-access.js: cukup untuk mencegah
// beberapa kali muat halaman menembak Google berturut-turut, tapi cukup
// pendek supaya angka terasa langsung berubah setelah ada pendaftar baru.
const CACHE_MS = 45 * 1000;
let cache = null;

async function ambilSemuaRoster(urls) {
  const teks = [];
  const gagal = [];

  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('status ' + res.status);
        const isi = await res.text();
        // Publikasi yang dicabut membalas halaman HTML dengan status 200,
        // bukan error. Tanpa penjagaan ini, halaman itu diparsing sebagai
        // CSV dan menghasilkan angka nol yang terlihat sah.
        if (/^\s*<(!doctype|html)/i.test(isi)) {
          throw new Error('membalas HTML, bukan CSV (publikasi sheet mungkin dicabut)');
        }
        teks.push(isi);
      } catch (err) {
        gagal.push(url.slice(0, 60) + '... -> ' + err.message);
      }
    })
  );

  return { teks, gagal };
}

function daftarBatch(overrides) {
  const d = overrides && Array.isArray(overrides.batchDaftar) ? overrides.batchDaftar : [];
  return d.map((b, i) => ({
    nama: String((b && b.nama) || '').trim() || 'Batch ' + (i + 1),
    mulai: b && b.mulai ? String(b.mulai) : null,
    selesai: b && b.selesai ? String(b.selesai) : null,
  }));
}

function tanggalAtauNull(nilai) {
  if (!nilai) return null;
  const d = new Date(nilai);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Tulis ulang daftar batch, dengan satu aturan yang dijaga di sini:
 * hanya batch TERAKHIR yang boleh punya selesai kosong.
 *
 * Dijaga di server, bukan dipercayakan ke tombol di layar. Dua tab admin
 * yang terbuka bersamaan bisa saja sama-sama menekan tombolnya, dan hasil
 * yang tersisa harus tetap masuk akal.
 */
function rapikanBatch(daftar) {
  return daftar.map((b, i) => ({
    nama: b.nama,
    mulai: b.mulai,
    selesai: i === daftar.length - 1 ? b.selesai : b.selesai || new Date().toISOString(),
  }));
}

async function tanganiPost(req, res, admin) {
  const aksi = (req.body && req.body.aksi) || '';
  const overrides = await readOverrides().catch(() => ({}));
  const daftar = daftarBatch(overrides);
  const sekarang = new Date().toISOString();

  if (aksi === 'mulai') {
    // Batch PERTAMA sengaja dimulai tanpa tanggal awal, artinya menghitung
    // sejak awal. Kalau dimulai dari sekarang, semua pendaftar yang sudah
    // ada jadi tidak masuk batch mana pun dan hilang dari rincian.
    const pertama = daftar.length === 0;
    daftar.push({
      nama: 'Batch ' + (daftar.length + 1),
      mulai: pertama ? null : sekarang,
      selesai: null,
    });
  } else if (aksi === 'tutup') {
    if (daftar.length === 0) {
      return res.status(400).json({
        ok: false,
        reason: 'belum_ada_batch',
        pesan: 'Belum ada batch yang berjalan, jadi tidak ada yang bisa ditutup.',
      });
    }
    const terakhir = daftar[daftar.length - 1];
    if (terakhir.selesai) {
      return res.status(400).json({
        ok: false,
        reason: 'sudah_tertutup',
        pesan: 'Batch terakhir sudah ditutup. Tekan "Mulai batch baru" untuk membuka yang berikutnya.',
      });
    }
    terakhir.selesai = sekarang;
    daftar.push({ nama: 'Batch ' + (daftar.length + 1), mulai: sekarang, selesai: null });
  } else if (aksi === 'ganti-nama') {
    const indeks = Number(req.body && req.body.indeks);
    const nama = String((req.body && req.body.nama) || '').trim().slice(0, 60);
    if (!Number.isInteger(indeks) || indeks < 0 || indeks >= daftar.length || !nama) {
      return res.status(400).json({ ok: false, reason: 'permintaan_tidak_lengkap' });
    }
    daftar[indeks].nama = nama;
  } else {
    return res.status(400).json({ ok: false, reason: 'aksi_tidak_dikenal' });
  }

  await writeOverrides({ batchDaftar: rapikanBatch(daftar) });
  console.log('admin-statistik: ' + admin.email + ' -> batch ' + aksi);
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method === 'POST') return tanganiPost(req, res, admin);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }

  const urls = (process.env.ROSTER_CSV_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return res.status(200).json({
      ok: false,
      reason: 'roster_kosong',
      pesan:
        'ROSTER_CSV_URLS belum diisi di Vercel > Settings > Environment Variables, ' +
        'jadi belum ada data pendaftar yang bisa dihitung.',
    });
  }

  try {
    const overrides = await readOverrides().catch(() => ({}));

    if (!cache || cache.kadaluwarsa < Date.now()) {
      cache = { data: await ambilSemuaRoster(urls), kadaluwarsa: Date.now() + CACHE_MS };
    }
    const { teks, gagal } = cache.data;

    if (teks.length === 0) {
      return res.status(200).json({
        ok: false,
        reason: 'semua_sumber_gagal',
        pesan:
          'Semua sumber daftar siswa gagal diakses, jadi tidak ada yang bisa dihitung. ' +
          'Penyebab tersering: link "Publish to web" sheet-nya sudah tidak berlaku.',
        sumberGagal: gagal,
      });
    }

    const hitung = (jendela) => gabungStatistik(teks.map((t) => hitungStatistik(t, overrides, jendela)));

    const sepanjangWaktu = hitung({});

    // Tiap batch dihitung sendiri dari rentang waktunya. Teks CSV-nya sudah
    // diambil sekali di atas, jadi menambah batch tidak menambah permintaan
    // ke Google, cuma perhitungan di memori.
    const batchList = daftarBatch(overrides).map((b, i, semua) => ({
      nama: b.nama,
      mulai: b.mulai,
      selesai: b.selesai,
      aktif: i === semua.length - 1 && !b.selesai,
      statistik: hitung({
        mulai: tanggalAtauNull(b.mulai),
        selesai: tanggalAtauNull(b.selesai),
      }),
    }));

    const dasar = Number(
      overrides.heroSiswaDasar !== undefined ? overrides.heroSiswaDasar : DEFAULTS.heroSiswaDasar
    );
    const angkaDasar = Number.isFinite(dasar) && dasar >= 0 ? Math.floor(dasar) : 0;

    // Angka roster disimpan ke Global Config supaya beranda bisa memakainya
    // TANPA ikut mengambil CSV tiap ada pengunjung (lihat heroSiswaOtomatis
    // di _lib/site-defaults.js). Ditulis cuma kalau nilainya berubah.
    //
    // Kegagalan menulis sengaja ditelan. Halaman ini tetap berguna walau
    // sinkronisasinya gagal.
    let disinkron = false;
    if (Number(overrides.heroSiswaOtomatis) !== sepanjangWaktu.totalOrang) {
      try {
        await writeOverrides({ heroSiswaOtomatis: sepanjangWaktu.totalOrang });
        disinkron = true;
      } catch (err) {
        console.error('admin-statistik: gagal menyimpan heroSiswaOtomatis: ' + err.message);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      disinkron,
      sepanjangWaktu,
      batchList,
      // Ditampilkan sebagai penjumlahan yang terlihat, bukan satu angka
      // jadi, supaya kalau angka dasarnya ternyata dobel dengan isi roster
      // itu langsung kelihatan dan bisa dibetulkan.
      hero: {
        angkaDasar,
        dariRoster: sepanjangWaktu.totalOrang,
        total: angkaDasar + sepanjangWaktu.totalOrang,
      },
      sumberGagal: gagal,
      jumlahSumber: urls.length,
    });
  } catch (err) {
    console.error('admin-statistik:', err.message);
    return res.status(502).json({ ok: false, reason: 'gagal_hitung', pesan: err.message });
  }
};
