/**
 * Baca/tulis konten yang bisa diedit dari /admin, disimpan di Vercel Global
 * Config (dulu namanya Edge Config).
 *
 * BACA lewat SDK resmi (@vercel/global-config) yang membaca endpoint
 * global-config.vercel.com -- ini yang dioptimalkan Vercel, tidak ada rate
 * limit, dan inilah yang dipakai api/render-home.js tiap ada pengunjung
 * buka index.html. Endpoint ini TIDAK BOLEH dipakai buat baca kalau
 * frekuensinya tinggi (lihat dokumentasi Global Config: "kami sangat
 * menyarankan untuk tidak pernah" baca lewat REST API api.vercel.com untuk
 * kasus seperti ini).
 *
 * TULIS lewat Vercel REST API (api.vercel.com) langsung pakai fetch, BUKAN
 * lewat SDK -- SDK-nya memang tidak menyediakan fungsi tulis, cuma baca.
 * Butuh Personal Access Token Vercel (VERCEL_API_TOKEN, dibuat manual di
 * vercel.com/account/tokens) karena ini beda dari token baca yang otomatis
 * didapat waktu Global Config di-connect ke project.
 *
 * import() dipakai (bukan require()) buat kedua modul npm ini karena tidak
 * ada kepastian keduanya mendukung CommonJS require() secara langsung --
 * import() dinamis selalu jalan baik modulnya CommonJS maupun ESM.
 */

async function readOverrides() {
  try {
    const { getAll } = await import('@vercel/global-config');
    const all = await getAll();
    return all || {};
  } catch (err) {
    // Gagal diam-diam, sama filosofinya dengan content-sheet.js yang lama:
    // GLOBAL_CONFIG belum di-connect, package belum ke-install waktu
    // deploy pertama, dll -- semua fallback ke DEFAULTS di pemanggil,
    // bukan bikin index.html error/kosong.
    console.error('Gagal membaca Global Config, pakai semua nilai default:', err.message);
    return {};
  }
}

function getGlobalConfigId() {
  // GLOBAL_CONFIG adalah nama env var default sejak Edge Config berganti
  // nama. EDGE_CONFIG tetap dicoba sebagai cadangan kalau project ini
  // ternyata masih pakai connection string versi lama (lihat catatan
  // "migrasi" di dokumentasi Vercel -- connection string lama tetap
  // berlaku selamanya, tidak ada tenggat waktu penghapusan).
  const conn = process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG || '';
  const match =
    conn.match(/global-config\.vercel\.com\/([^/?]+)/) ||
    conn.match(/edge-config\.vercel\.com\/([^/?]+)/);
  return match ? match[1] : null;
}

async function writeOverrides(itemsObj) {
  const configId = getGlobalConfigId();
  const apiToken = process.env.VERCEL_API_TOKEN;

  if (!configId) {
    throw new Error(
      'Global Config belum terhubung ke project ini (env var GLOBAL_CONFIG kosong di ' +
        'Vercel Project Settings > Environment Variables).'
    );
  }
  if (!apiToken) {
    throw new Error(
      'VERCEL_API_TOKEN belum diisi. Buat di vercel.com/account/tokens, lalu tambahkan ' +
        'sebagai Environment Variable di project ini.'
    );
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  let url = 'https://api.vercel.com/v1/global-config/' + configId + '/items';
  if (teamId) url += '?teamId=' + encodeURIComponent(teamId);

  const items = Object.keys(itemsObj).map((key) => ({
    operation: 'upsert',
    key,
    value: itemsObj[key],
  }));

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data && data.error && data.error.message) || 'status ' + res.status;
    throw new Error('Gagal menyimpan ke Global Config: ' + detail);
  }
  return data;
}

module.exports = { readOverrides, writeOverrides, getGlobalConfigId };
