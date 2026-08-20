const { requireAdmin } = require('./admin-guard');
const { readOverrides, writeOverrides } = require('./global-config-store');
const { hitungStatistik, gabungStatistik } = require('./statistik');
const { waktuWibKeEpoch, formatWib } = require('./form-status');
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
 * KENAPA PERIODENYA IKUT JENDELA PENDAFTARAN
 * ============================================================
 * Batch di sini tidak punya penanda sendiri di spreadsheet. Yang ada
 * cuma tanggal buka/tutup pendaftaran yang sudah diatur di /atur-form,
 * dan itu justru definisi batch yang paling tepat: satu batch = satu kali
 * pendaftaran dibuka sampai ditutup. Dengan memakai nilai itu, tidak ada
 * setelan baru yang harus diingat dan diisi ulang tiap batch.
 *
 * Kalau mode formulirnya bukan 'jadwal' (mis. dibiarkan terbuka terus),
 * tidak ada jendela yang bisa dipakai, dan halaman ini menampilkan angka
 * sepanjang waktu sambil mengatakan alasannya.
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

function jendelaBatch(overrides) {
  const mulaiMs = waktuWibKeEpoch(overrides.formBukaPada);
  const selesaiMs = waktuWibKeEpoch(overrides.formTutupPada);
  const mode = overrides.formMode || 'buka';

  if (mulaiMs === null && selesaiMs === null) {
    return {
      aktif: false,
      alasan:
        mode === 'jadwal'
          ? 'Mode jadwal aktif tapi tanggal buka dan tutup masih kosong.'
          : 'Pendaftaran tidak sedang memakai jadwal, jadi belum ada batas batch.',
      mulai: null,
      selesai: null,
    };
  }

  return {
    aktif: true,
    mulai: mulaiMs === null ? null : new Date(mulaiMs),
    selesai: selesaiMs === null ? null : new Date(selesaiMs),
    mulaiTeks: mulaiMs === null ? '' : formatWib(mulaiMs),
    selesaiTeks: selesaiMs === null ? '' : formatWib(selesaiMs),
  };
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

    const jendela = jendelaBatch(overrides);

    // Dihitung DUA KALI dengan sengaja: batch untuk halaman ini, sepanjang
    // waktu untuk angka siswa di beranda. Keduanya membaca teks CSV yang
    // sama yang sudah diambil sekali, jadi tidak ada permintaan tambahan.
    const batch = gabungStatistik(
      teks.map((t) => hitungStatistik(t, overrides, jendela.aktif ? jendela : {}))
    );
    const sepanjangWaktu = gabungStatistik(teks.map((t) => hitungStatistik(t, overrides, {})));

    const dasar = Number(
      overrides.heroSiswaDasar !== undefined ? overrides.heroSiswaDasar : DEFAULTS.heroSiswaDasar
    );
    const angkaDasar = Number.isFinite(dasar) && dasar >= 0 ? Math.floor(dasar) : 0;

    // Angka roster disimpan ke Global Config supaya beranda bisa
    // memakainya TANPA ikut mengambil CSV tiap ada pengunjung (lihat
    // heroSiswaOtomatis di _lib/site-defaults.js). Ditulis cuma kalau
    // nilainya berubah: menulis di tiap muat halaman itu boros dan tidak
    // ada gunanya.
    //
    // Kegagalan menulis sengaja ditelan. Halaman ini tetap berguna walau
    // sinkronisasinya gagal, dan menggagalkan seluruh halaman gara-gara
    // satu angka promosi tidak sebanding.
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
      jendela: {
        aktif: jendela.aktif,
        alasan: jendela.alasan || '',
        mulaiTeks: jendela.mulaiTeks || '',
        selesaiTeks: jendela.selesaiTeks || '',
      },
      batch,
      sepanjangWaktu,
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
