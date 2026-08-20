/**
 * Halaman /atur-kelas: seluruh isi yang dilihat siswa di ruang kelas.
 *
 * Login ditangani admin-auth.js yang dimuat lebih dulu; file ini cuma
 * menyediakan window.onAdminReady.
 *
 * Link, pengumuman, dan tanggal buka kuis memakai [data-key] biasa, jadi
 * pemuatan dan pengumpulannya sama dengan halaman admin lain. Yang butuh
 * penanganan sendiri cuma jadwal sesi, karena bentuknya daftar yang bisa
 * ditambah dan dihapus.
 */

var jadwal = [];

var KUNCI_TEKS = [
  'kelasZoomUrl',
  'kelasDriveUrl',
  'kelasCommunityUrl',
  'kelasPengumuman',
  'kelasPracticeReadingUrl',
  'kelasPracticeListeningUrl',
  'kelasPracticeWritingUrl',
  'kelasKuisReadingBuka',
  'kelasKuisListeningBuka',
  'kelasKuisWritingBuka',
  'kelasJamBawaan',
  'kelasFinalTestUrl',
  'kelasFinalTestBukaPada',
];

window.onAdminReady = function (data) {
  KUNCI_TEKS.forEach(function (k) {
    var el = document.querySelector('[data-key="' + k + '"]');
    if (el) el.value = data.values[k] === undefined || data.values[k] === null ? '' : data.values[k];
  });

  jadwal = Array.isArray(data.values.kelasJadwal)
    ? data.values.kelasJadwal.map(function (s) {
        return { tanggal: s.tanggal || '', jam: s.jam || '', topik: s.topik || '' };
      })
    : [];

  renderJadwal();

  perbaruiPratinjauFinal();
};

function escapeHtml(t) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// JADWAL SESI
// ============================================================

function renderJadwal() {
  var list = document.getElementById('jadwal-list');
  list.textContent = '';

  if (jadwal.length === 0) {
    var kosong = document.createElement('p');
    kosong.className = 'admin-hint';
    kosong.textContent =
      'Belum ada sesi. Selama kosong, jadwal diambil dari spreadsheet seperti dulu.';
    list.appendChild(kosong);
  }

  jadwal.forEach(function (s, i) {
    var baris = document.createElement('div');
    baris.className = 'jadwal-item';
    baris.innerHTML =
      '<span class="jadwal-nomor">' + (i + 1) + '</span>' +
      '<label class="admin-field"><span>Tanggal</span>' +
      '<input type="date" data-j="tanggal" value="' + escapeHtml(s.tanggal) + '" /></label>' +
      '<label class="admin-field"><span>Jam (WIB)</span>' +
      '<input type="time" data-j="jam" value="' + escapeHtml(s.jam) + '" /></label>' +
      '<label class="admin-field jadwal-topik"><span>Topik (opsional)</span>' +
      '<input type="text" data-j="topik" maxlength="120" value="' + escapeHtml(s.topik) + '" /></label>' +
      '<button type="button" class="jadwal-hapus" aria-label="Hapus sesi ' + (i + 1) + '">Hapus</button>';

    // Tiap ketikan langsung masuk ke state, supaya menambah atau menghapus
    // baris lain tidak menghilangkan yang sudah diketik: daftar ini
    // digambar ulang penuh setiap kali berubah.
    baris.querySelectorAll('[data-j]').forEach(function (input) {
      input.addEventListener('input', function () {
        jadwal[i][input.dataset.j] = input.value;
        perbaruiPratinjauJadwal();
      });
    });

    baris.querySelector('.jadwal-hapus').addEventListener('click', function () {
      jadwal.splice(i, 1);
      renderJadwal();
    });

    list.appendChild(baris);
  });

  document.getElementById('jadwal-jumlah').textContent =
    jadwal.length === 0 ? '' : jadwal.length + ' sesi';
  perbaruiPratinjauJadwal();
}

function tambahSesi() {
  var jamBawaan = document.querySelector('[data-key="kelasJamBawaan"]').value || '20:00';

  // Sesi baru ditaruh sehari setelah sesi terakhir, bukan kosong. Jadwal
  // bootcamp biasanya berurutan rapat, jadi menebak begitu lebih sering
  // benar daripada salah, dan tetap gampang diubah.
  var tanggal = '';
  var terakhir = jadwal[jadwal.length - 1];
  if (terakhir && terakhir.tanggal) {
    var d = new Date(terakhir.tanggal + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    tanggal = d.toISOString().slice(0, 10);
  }

  jadwal.push({ tanggal: tanggal, jam: jamBawaan, topik: '' });
  renderJadwal();

  var baris = document.querySelectorAll('.jadwal-item');
  var baru = baris[baris.length - 1];
  if (baru) {
    baru.scrollIntoView({ block: 'center' });
    baru.querySelector('[data-j="tanggal"]').focus();
  }
}

/**
 * Kalimat ringkas soal akibat jadwal yang sedang diketik.
 *
 * Dihitung ulang di browser, bukan meminta ke server, supaya akibatnya
 * terlihat SEBELUM menekan Simpan. Yang paling perlu terlihat: berapa
 * sesi yang sudah lewat, karena itu yang menggerakkan bar progres siswa.
 */
function perbaruiPratinjauJadwal() {
  var el = document.getElementById('jadwal-pratinjau');
  var sah = jadwal.filter(function (s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s.tanggal);
  });

  if (sah.length === 0) {
    el.removeAttribute('data-state');
    el.textContent =
      jadwal.length === 0
        ? 'Belum ada sesi, jadi jadwal masih diambil dari spreadsheet.'
        : 'Belum ada sesi yang tanggalnya terisi, jadi belum ada yang berlaku.';
    return;
  }

  var sekarang = Date.now();
  var waktu = sah
    .map(function (s) {
      var jam = /^(\d{1,2}):(\d{2})$/.exec(s.jam || '20:00') || [0, 20, 0];
      var p = s.tanggal.split('-');
      // Jam ditulis WIB, jadi dikurangi 7 untuk jadi UTC. Sama dengan
      // perhitungan di server (jadwalDariConfig di api/verify-access.js).
      return Date.UTC(+p[0], +p[1] - 1, +p[2], +jam[1] - 7, +jam[2]);
    })
    .sort(function (a, b) { return a - b; });

  // Sesi dihitung selesai setelah jam mulainya lewat DITAMBAH satu jam,
  // sama dengan aturan di server.
  var selesai = waktu.filter(function (t) { return t + 3600000 <= sekarang; }).length;
  var berikut = waktu.find(function (t) { return t > sekarang; });

  el.dataset.state = selesai >= waktu.length ? 'tutup' : 'buka';
  el.textContent =
    selesai + ' dari ' + waktu.length + ' sesi sudah selesai. ' +
    (berikut
      ? 'Sesi berikutnya ' + new Date(berikut).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        }) + ' WIB.'
      : 'Semua sesi sudah lewat.');
}

// ============================================================
// PRATINJAU FINAL TEST
// ============================================================

/**
 * Kalimat ringkas soal akibat setelan Final Test yang sedang diketik.
 *
 * Yang paling perlu terlihat: kalau tanggalnya dikosongkan, kartunya
 * TIDAK PERNAH terbuka. Itu kebalikan dari dugaan wajar ("kosong berarti
 * bebas"), jadi harus dikatakan terang-terangan sebelum ditekan Simpan.
 */
function perbaruiPratinjauFinal() {
  var el = document.getElementById('final-pratinjau');
  if (!el) return;

  var link = document.querySelector('[data-key="kelasFinalTestUrl"]').value.trim();
  var waktu = document.querySelector('[data-key="kelasFinalTestBukaPada"]').value.trim();

  if (!link) {
    el.dataset.state = 'tutup';
    el.textContent = 'Link ujian belum diisi, jadi kartunya tidak akan pernah terbuka.';
    return;
  }
  if (!waktu) {
    el.dataset.state = 'tutup';
    el.textContent =
      'Tanggal belum diisi. Kartunya TIDAK akan terbuka sampai ini diisi, bukan langsung terbuka.';
    return;
  }

  var t = formatWibLokalFinal(waktu);
  var lewat = new Date(waktu).getTime() <= Date.now();
  el.dataset.state = 'buka';
  el.textContent = lewat
    ? 'Waktunya SUDAH lewat (' + t + '), jadi siswa yang sudah mengisi testimoni bisa langsung masuk.'
    : 'Terbuka ' + t + ', dan cuma untuk siswa yang sudah mengisi testimoni.';
}

// Terjemahan "2026-09-09T19:00" jadi kalimat Indonesia. Dihitung di sini,
// bukan diminta ke server, supaya akibatnya langsung terlihat.
function formatWibLokalFinal(teks) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(teks);
  if (!m) return teks;
  var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return Number(m[3]) + ' ' + bulan[Number(m[2]) - 1] + ' ' + m[1] + ' pukul ' + m[4] + '.' + m[5] + ' WIB';
}

// ============================================================
// SIMPAN
// ============================================================

async function simpanKelas() {
  var btn = document.getElementById('kelas-simpan');
  var status = document.getElementById('kelas-simpan-status');

  // Sesi tanpa tanggal akan dibuang server. Dikatakan di sini supaya
  // tidak terlihat seperti data yang hilang tanpa sebab.
  var tanpaTanggal = jadwal.filter(function (s) {
    return !/^\d{4}-\d{2}-\d{2}$/.test(s.tanggal);
  }).length;
  if (tanpaTanggal > 0) {
    status.dataset.state = 'error';
    status.textContent =
      'Ada ' + tanpaTanggal + ' sesi yang tanggalnya belum diisi. Isi dulu atau hapus barisnya.';
    return;
  }

  btn.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Menyimpan…';

  var items = { kelasJadwal: jadwal };
  KUNCI_TEKS.forEach(function (k) {
    var el = document.querySelector('[data-key="' + k + '"]');
    if (el) items[k] = el.value;
  });

  try {
    var res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ items: items }),
    });
    var data = await res.json();

    if (res.status === 401) return handleUnauthorized(data.reason);

    if (res.ok && data.ok) {
      status.dataset.state = 'ok';
      status.textContent = 'Tersimpan. Siswa yang masuk setelah ini langsung melihat isi baru.';
    } else {
      status.dataset.state = 'error';
      status.textContent =
        'Gagal menyimpan: ' + (data.message || data.pesan || data.reason || res.status);
    }
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal menyimpan: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('jadwal-tambah-btn').addEventListener('click', tambahSesi);
  document.getElementById('kelas-simpan').addEventListener('click', simpanKelas);
  ['kelasFinalTestUrl', 'kelasFinalTestBukaPada'].forEach(function (k) {
    var el = document.querySelector('[data-key="' + k + '"]');
    if (el) el.addEventListener('input', perbaruiPratinjauFinal);
  });
});
