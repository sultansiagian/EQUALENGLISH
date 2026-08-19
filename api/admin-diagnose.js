const { requireAdmin } = require('./_lib/admin-guard');
const { getGlobalConfigId } = require('./_lib/global-config-store');

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
  } else if (denganTeam && denganTeam.berhasil && !tanpaTeam.berhasil) {
    report.catatan.push(
      'KESIMPULAN: koneksi berhasil DENGAN teamId, jadi VERCEL_TEAM_ID sudah benar. ' +
        'Kalau menyimpan masih gagal, masalahnya bukan di sini.'
    );
  } else if (!tanpaTeam.berhasil && (!denganTeam || !denganTeam.berhasil)) {
    report.catatan.push(
      'KESIMPULAN: dua-duanya gagal. Berarti VERCEL_API_TOKEN tidak punya akses ke ' +
        'Global Config store ini. Penyebab paling umum: token dibuat di akun/scope ' +
        'yang berbeda dari pemilik store. Buat ulang token di vercel.com/account/tokens ' +
        'dan pastikan bagian Scope-nya menunjuk ke akun/tim yang sama dengan yang ' +
        'memiliki project EQUALENGLISH.'
    );
  } else {
    report.catatan.push('KESIMPULAN: dua-duanya berhasil, koneksi baik-baik saja.');
  }

  return res.status(200).json({ ok: true, report });
};
