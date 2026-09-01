const { requireAdmin } = require('./admin-guard');
const { readOverrides, writeOverrides } = require('./global-config-store');
const { daftarTersimpan } = require('./batch');
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

/**
 * Rentang tiap batch. Dibaca dari daftar batch yang SATU, yang ditulis
 * halaman /batch.
 *
 * Dulu halaman ini punya daftarnya sendiri di `batchDaftar`, lengkap
 * dengan tombol mulai/tutup/ganti-nama miliknya. Akibatnya ada dua
 * daftar angkatan yang hidup berdampingan tanpa saling tahu: yang satu
 * menentukan pengelompokan pendapatan di sini, yang satu menentukan
 * label peserta dan kapan aksesnya dicabut di /batch. Keduanya sama-sama
 * disebut "batch" di layar, jadi menutup batch di satu halaman
 * meninggalkan halaman lain mengira batch itu masih berjalan.
 *
 * Sekarang halaman ini CUMA MEMBACA. Semua tombol pengelolaan pindah ke
 * /batch, dan daftarTersimpan() yang mengurus migrasi dari `batchDaftar`
 * lama supaya angka pendapatan yang sudah tercatat tidak berubah.
 */
function tanggalAtauNull(nilai) {
  if (!nilai) return null;
  const d = new Date(nilai);
  return Number.isFinite(d.getTime()) ? d : null;
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  // POST sengaja TIDAK dilayani lagi. Tombol mulai/tutup/ganti-nama
  // batch pindah ke /batch supaya cuma ada satu tempat yang menulis
  // daftar angkatan. Yang masih memanggilnya diberi tahu ke mana
  // perginya, bukan dibiarkan menebak dari 405 polos.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok: false,
      reason: 'pindah_ke_batch',
      pesan: 'Pengelolaan batch sekarang ada di halaman /batch, bukan di /analitik.',
    });
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
    const batchList = daftarTersimpan(overrides).map((b, i, semua) => ({
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
