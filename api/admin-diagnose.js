const { requireAdmin } = require('./_lib/admin-guard');
const { getGlobalConfigId } = require('./_lib/global-config-store');
const { panggilAppsScript, konfigurasi: konfigAppsScript } = require('./_lib/apps-script');

/**
 * Endpoint diagnosa: melaporkan apa yang SERVER benar-benar lihat soal
 * konfigurasi Global Config, lalu menguji koneksinya langsung ke Vercel API.
 *
 * Dibuat setelah error "Edge Config Item not found" gagal didiagnosis dua
 * kali lewat tebakan (dugaan VERCEL_API_TOKEN, lalu dugaan VERCEL_TEAM_ID),
 * yang dua-duanya memakan satu siklus redeploy user tanpa hasil. Menebak
 * penyebab dari pesan error pihak ketiga itu mahal; jauh lebih murah
 * menanyakan langsung ke server apa yang dia baca.
 *
 * KEAMANAN: dilindungi requireAdmin sama seperti endpoint admin lain, jadi
 * cuma email di ADMIN_EMAILS yang bisa memanggil. Token TIDAK PERNAH
 * dikembalikan utuh -- connection string disensor bagian token-nya, dan
 * VERCEL_API_TOKEN cuma dilaporkan panjang + 4 karakter awalnya (cukup buat
 * memastikan "terisi dan bentuknya masuk akal" tanpa membocorkan nilainya).
 * Config ID dan Team ID bukan kredensial (tidak bisa dipakai apa-apa tanpa
 * token), jadi ditampilkan utuh supaya bisa dicocokkan dengan dashboard.
 */

/**
 * ============================================================
 * PEMERIKSAAN APPS SCRIPT
 * ============================================================
 *
 * Endpoint ini dulu cuma memeriksa Global Config, padahal jalur yang
 * paling sering rusak justru Apps Script: dia hidup di luar Vercel,
 * URL-nya berubah tiap kali deployment BARU dibuat (bukan versi baru),
 * dan kegagalannya membalas HTTP 200 berisi halaman Google, bukan error.
 *
 * Diperiksa dengan action 'ping' yang sudah ada di skripnya, jadi tidak
 * ada baris yang ditulis ke spreadsheet hanya karena diagnosa dijalankan.
 */
async function periksaAppsScript() {
  const { url, secret, siap } = konfigAppsScript();

  if (!siap) {
    return {
      berhasil: false,
      pesan:
        'APPS_SCRIPT_URL dan/atau APPS_SCRIPT_SECRET belum diisi di Vercel. ' +
        'Selama itu, pendaftaran tidak bisa tersimpan dan email tidak bisa terkirim.',
      urlTerisi: Boolean(url),
      secretTerisi: Boolean(secret),
    };
  }

  // Dicek sebelum memanggil: URL /dev tidak akan pernah bisa dipanggil
  // server, dan ini ketahuan tanpa perlu satu permintaan jaringan pun.
  if (/\/dev\/?$/.test(url)) {
    return {
      berhasil: false,
      pesan:
        'APPS_SCRIPT_URL berakhiran "/dev". URL itu cuma bisa dibuka pemilik skrip ' +
        'lewat peramban dan tidak pernah bisa dipanggil server. Yang dibutuhkan URL ' +
        'berakhiran "/exec" dari Deploy > New deployment.',
    };
  }

  try {
    await panggilAppsScript('ping');
    return { berhasil: true, pesan: 'Apps Script menjawab. Pendaftaran dan email aman.' };
  } catch (err) {
    return { berhasil: false, pesan: err.message };
  }
}

function maskConnectionString(conn) {
  if (!conn) return '(kosong)';
  return conn.replace(/token=[^&]*/i, 'token=***DISENSOR***');
}

async function probe(label, url, apiToken) {
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + apiToken } });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // Biarkan null, teks mentahnya dilaporkan apa adanya di bawah.
    }

    return {
      label,
      url: url.replace(/token=[^&]*/i, 'token=***'),
      status: res.status,
      berhasil: res.ok,
      pesanError:
        parsed && parsed.error
          ? parsed.error.code + ': ' + parsed.error.message
          : res.ok
            ? null
            : text.slice(0, 200),
      // Kalau berhasil, tampilkan info storenya buat memastikan ini store
      // yang benar (nama/slug-nya bisa dicocokkan dengan dashboard).
      store:
        res.ok && parsed
          ? { slug: parsed.slug, id: parsed.id, itemCount: parsed.itemCount }
          : null,
    };
  } catch (err) {
    return { label, status: null, berhasil: false, pesanError: 'fetch gagal: ' + err.message };
  }
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return res.status(admin.status).json({ ok: false, reason: admin.reason });

  const conn = process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG || '';
  const configId = getGlobalConfigId();
  const apiToken = process.env.VERCEL_API_TOKEN || '';
  const teamId = (process.env.VERCEL_TEAM_ID || '').trim();

  const report = {
    envVar: {
      GLOBAL_CONFIG: process.env.GLOBAL_CONFIG ? 'terisi' : 'KOSONG',
      EDGE_CONFIG: process.env.EDGE_CONFIG ? 'terisi (versi lama)' : 'kosong (wajar)',
      VERCEL_API_TOKEN: apiToken
        ? 'terisi, ' + apiToken.length + ' karakter, diawali "' + apiToken.slice(0, 4) + '..."'
        : 'KOSONG',
      VERCEL_TEAM_ID: teamId || 'kosong',
    },
    connectionString: maskConnectionString(conn),
    configIdTerbaca: configId || 'GAGAL DIBACA dari connection string',
    catatan: [],
  };

  if (!configId) {
    report.catatan.push(
      'Config ID tidak berhasil dibaca dari connection string. Bentuk yang ' +
        'diharapkan: https://global-config.vercel.com/ecfg_xxx?token=yyy'
    );
    report.appsScript = await periksaAppsScript();
    return res.status(200).json({ ok: true, report });
  }

  if (!configId.startsWith('ecfg_')) {
    report.catatan.push(
      'PENYEBAB KEMUNGKINAN BESAR: Config ID yang terbaca ("' + configId + '") tidak ' +
        'diawali "ecfg_" seperti yang diminta Vercel. Berarti bentuk connection ' +
        'string-nya beda dari yang diperkirakan kode ini, dan ID-nya salah potong.'
    );
  }

  if (!apiToken) {
    report.catatan.push('VERCEL_API_TOKEN kosong, tes koneksi di bawah dilewati.');
    report.appsScript = await periksaAppsScript();
    return res.status(200).json({ ok: true, report });
  }

  // Dua tes berpasangan: DENGAN dan TANPA teamId. Ini yang menjawab
  // pertanyaan "apakah masalahnya soal scope Team" secara definitif,
  // bukan lewat tebakan -- kalau yang satu berhasil dan satunya tidak,
  // langsung ketahuan mana yang benar.
  const base = 'https://api.vercel.com/v1/global-config/' + configId;
  report.tesKoneksi = [
    await probe('TANPA teamId', base, apiToken),
    await probe(
      'DENGAN teamId' + (teamId ? ' (' + teamId + ')' : ' -- dilewati, VERCEL_TEAM_ID kosong'),
      base + '?teamId=' + encodeURIComponent(teamId),
      apiToken
    ),
  ];

  const tanpaTeam = report.tesKoneksi[0];
  const denganTeam = teamId ? report.tesKoneksi[1] : null;

  if (tanpaTeam.berhasil && (!denganTeam || !denganTeam.berhasil)) {
    report.catatan.push(
      'KESIMPULAN: koneksi berhasil TANPA teamId. Hapus env var VERCEL_TEAM_ID ' +
        'dari project (atau kosongkan), lalu redeploy.'
    );
    report.appsScript = await periksaAppsScript();
    return res.status(200).json({ ok: true, report });
  }
  if (denganTeam && denganTeam.berhasil && !tanpaTeam.berhasil) {
    report.catatan.push(
      'KESIMPULAN: koneksi berhasil DENGAN teamId, jadi VERCEL_TEAM_ID sudah benar. ' +
        'Kalau menyimpan masih gagal, masalahnya bukan di sini.'
    );
    report.appsScript = await periksaAppsScript();
    return res.status(200).json({ ok: true, report });
  }
  if (tanpaTeam.berhasil && denganTeam && denganTeam.berhasil) {
    report.catatan.push('KESIMPULAN: dua-duanya berhasil, koneksi baik-baik saja.');
    report.appsScript = await periksaAppsScript();
    return res.status(200).json({ ok: true, report });
  }

  // ============================================================
  // Dua-duanya gagal. JANGAN langsung menyimpulkan "token salah scope" --
  // itu tebakan. Tanya langsung ke Vercel: token ini milik siapa, dan
  // store apa saja yang sebenarnya bisa dia lihat. Kalau ternyata dia
  // bisa melihat store lain (atau store yang SAMA di scope berbeda),
  // penyebabnya langsung kelihatan tanpa perlu user coba-coba setting.
  // ============================================================
  report.catatan.push(
    'Dua-duanya gagal. Mendaftar semua store yang bisa dilihat token ini, ' +
      'supaya ketahuan store-nya sebenarnya ada di scope mana.'
  );

  async function listConfigs(label, url) {
    try {
      const res2 = await fetch(url, { headers: { Authorization: 'Bearer ' + apiToken } });
      const text = await res2.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        /* dibiarkan null */
      }

      if (!res2.ok) {
        return {
          label,
          status: res2.status,
          error: parsed && parsed.error ? parsed.error.code + ': ' + parsed.error.message : text.slice(0, 200),
        };
      }
      const arr = Array.isArray(parsed) ? parsed : [];
      return {
        label,
        status: res2.status,
        jumlahStore: arr.length,
        store: arr.map((c) => ({ id: c.id, slug: c.slug, itemCount: c.itemCount })),
      };
    } catch (err) {
      return { label, status: null, error: 'fetch gagal: ' + err.message };
    }
  }

  const listUrl = 'https://api.vercel.com/v1/global-config';
  report.daftarStoreTerlihat = [
    await listConfigs('scope personal (tanpa teamId)', listUrl),
    teamId
      ? await listConfigs(
          'scope team (' + teamId + ')',
          listUrl + '?teamId=' + encodeURIComponent(teamId)
        )
      : { label: 'scope team -- dilewati, VERCEL_TEAM_ID kosong' },
  ];

  // Siapa pemilik token ini. Dipakai buat memastikan token dibuat di akun
  // yang sama dengan yang dipakai login ke dashboard.
  try {
    const who = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: 'Bearer ' + apiToken },
    });
    const whoData = await who.json().catch(() => null);
    report.pemilikToken = who.ok
      ? {
          username: whoData && whoData.user ? whoData.user.username : null,
          email: whoData && whoData.user ? whoData.user.email : null,
        }
      : { error: 'status ' + who.status + ' -- token kemungkinan tidak valid/kedaluwarsa' };
  } catch (err) {
    report.pemilikToken = { error: 'fetch gagal: ' + err.message };
  }

  // Kesimpulan otomatis dari hasil pendaftaran di atas.
  const semuaStore = [];
  report.daftarStoreTerlihat.forEach((d) => {
    if (d.store) d.store.forEach((s) => semuaStore.push({ scope: d.label, id: s.id, slug: s.slug }));
  });

  if (semuaStore.length === 0) {
    report.catatan.push(
      'HASIL: token ini tidak bisa melihat SATU PUN Global Config store, baik di scope ' +
        'personal maupun team. Artinya store-nya dibuat di akun/tim yang BERBEDA dari ' +
        'pemilik token (lihat "pemilikToken" di atas), atau tokennya sudah dicabut. ' +
        'Solusi: buat token baru sambil login sebagai akun yang sama dengan yang kamu ' +
        'pakai membuat store-nya.'
    );
  } else {
    const cocok = semuaStore.find((s) => s.id === configId);
    if (cocok) {
      report.catatan.push(
        'HASIL: store yang dicari TERNYATA TERLIHAT di "' + cocok.scope + '". ' +
          'Berarti pemanggilan tadi cuma salah scope. Ini bug di kode, bukan salah setting kamu.'
      );
    } else {
      report.catatan.push(
        'HASIL: token bisa melihat ' + semuaStore.length + ' store, tapi TIDAK ADA yang ' +
          'ID-nya cocok dengan ' + configId + ' (lihat daftar di atas). Berarti env var ' +
          'GLOBAL_CONFIG di project ini menunjuk ke store yang beda dari yang dimiliki ' +
          'akun token. Paling gampang: pakai salah satu store di daftar itu, atau ' +
          'connect ulang store yang benar ke project.'
      );
    }
  }

  report.appsScript = await periksaAppsScript();
  return res.status(200).json({ ok: true, report });
};
