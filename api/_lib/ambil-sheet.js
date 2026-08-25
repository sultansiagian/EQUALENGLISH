/**
 * Pengambil berkas CSV dari Google, dipakai bersama oleh roster,
 * jadwal, dan materi.
 *
 * Dipisah dari verify-access.js pada 2026-08-25. Isinya tidak diketik
 * ulang, dipindah apa adanya.
 */

const CSV_CACHE_TTL_MS = 45 * 1000; // roster: sependek jeda "Setujui" -> bisa masuk
const ISI_KELAS_CACHE_TTL_MS = 10 * 60 * 1000; // jadwal & materi: berubah per batch
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // kunci publik Google jarang rotasi
const fetchCache = new Map(); // key -> { promise, expiresAt }

function cachedFetch(key, ttlMs, fetcher) {
  const now = Date.now();
  const cached = fetchCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetcher().catch((err) => {
    fetchCache.delete(key);
    throw err;
  });
  fetchCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Batas waktu SATU percobaan pengambilan. fetch() bawaan tidak punya
// batas waktu sama sekali: satu sumber yang menggantung (mis. link
// publish sheet yang sudah dicabut lalu tidak pernah membalas) akan
// menahan SELURUH login sampai fungsinya sendiri dimatikan Vercel,
// sementara sumber lain sudah lama selesai.
//
// 3,5 detik dipilih supaya dua percobaan plus jedanya (7,3 detik)
// masih di bawah batas waktu fungsi Vercel, jadi yang gagal tetap
// gagal dengan pesan, bukan mati tanpa keterangan.
const BATAS_FETCH_MS = 3500;

async function fetchDenganBatas(url) {
  const pembatal = new AbortController();
  let kehabisanWaktu = false;
  const jam = setTimeout(() => {
    kehabisanWaktu = true;
    pembatal.abort();
  }, BATAS_FETCH_MS);

  try {
    return await fetch(url, { signal: pembatal.signal });
  } catch (err) {
    // Ditandai dari sini, bukan ditebak dari nama errornya. Runtime yang
    // berbeda menamai pembatalan berbeda-beda (AbortError, TimeoutError,
    // atau error biasa), dan yang benar-benar tahu apakah ini kehabisan
    // waktu atau kegagalan lain cuma fungsi yang memasang jamnya.
    if (kehabisanWaktu) {
      const e = new Error('kehabisan waktu setelah ' + BATAS_FETCH_MS + 'ms');
      e.kehabisanWaktu = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(jam);
  }
}

async function fetchTextWithRetry(url, attempts = 2) {
  // Sengaja cuma diulang SEKALI (attempts=2 -> 1 percobaan awal + 1
  // percobaan ulang), bukan berkali-kali -- momen paling rawan gagal
  // (banyak siswa login bersamaan) juga momen paling penting buat dapat
  // jawaban cepat, jadi retry bertubi-tubi cuma bikin orang nunggu lebih
  // lama tanpa manfaat tambahan yang berarti.
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchDenganBatas(url);
      if (!res.ok) throw new Error('status ' + res.status);
      return await res.text();
    } catch (err) {
      lastErr = err;
      // Percobaan yang dibatalkan karena kehabisan waktu TIDAK diulang.
      // Habis waktu artinya sumbernya memang tidak menjawab, bukan
      // gangguan sesaat, dan mengulanginya cuma menggandakan lama
      // tunggu setiap siswa yang login.
      if (err && err.kehabisanWaktu) break;
      if (i < attempts - 1) await sleep(300);
    }
  }
  throw lastErr;
}

// Cocok untuk "nama@domain.tld" secara umum: tidak boleh ada spasi atau
// "@" ganda, dan domainnya harus punya titik. Cukup ketat untuk tidak
// salah menganggap nomor telepon atau nama sebagai email.

module.exports = { cachedFetch, sleep, fetchDenganBatas, fetchTextWithRetry, CSV_CACHE_TTL_MS, ISI_KELAS_CACHE_TTL_MS, JWKS_CACHE_TTL_MS };
