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
  // Ikut disimpan dari sini karena panel sertifikatnya sekarang ada di
  // halaman ini, bukan lagi di /admin.
  'sertifikatMentorNama',
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

  // Pratinjau foto (tanda tangan & templat) dan pengatur posisi nama
  // ikut disiapkan di sini karena panelnya ada di halaman ini.
  loadPhotoPreviews(data.values);
  siapkanPratinjauSertifikat(data.values.sertifikatTemplateUrl);
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
 * sesi yang sudah lewat, karena angka itu yang membuka sertifikat.
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
      : 'Semua sesi sudah lewat, jadi sertifikat sudah boleh diambil siswa yang mengisi testimoni.');
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
});

// ============================================================
// TEMPLAT SERTIFIKAT
// ============================================================
// Pemilik situs mengunggah desain sertifikat utuh, lalu mengatur di mana
// nama siswa dituliskan. Pratinjau di bawah HARUS memakai perhitungan
// yang sama persis dengan gambarNamaDiTemplat() di kelas.js -- kalau
// salah satunya berubah sendiri, pratinjaunya berbohong dan posisi yang
// terlihat pas di sini akan meleset di sertifikat sungguhan.

var TMPL_KUNCI = [
  'sertifikatNamaX',
  'sertifikatNamaY',
  'sertifikatNamaUkuran',
  'sertifikatNamaWarna',
  'sertifikatNamaFont',
];

var tmplGambar = null;

function tmplNilai(kunci) {
  var el = document.querySelector('[data-key="' + kunci + '"]');
  return el ? el.value : '';
}

/**
 * Muat templat lalu gambar pratinjaunya. Dipanggil waktu halaman siap
 * dan tiap kali fotonya baru diunggah.
 */
function siapkanPratinjauSertifikat(url) {
  var kotak = document.getElementById('tmpl-atur');
  if (!kotak) return;

  if (!url) {
    kotak.hidden = true;
    tmplGambar = null;
    return;
  }

  var img = new Image();
  // Templat disimpan di Vercel Blob (domain lain). Tanpa ini, canvas
  // pratinjau jadi tercemar -- di sini belum terasa karena tidak diekspor,
  // tapi kelas.js memakai aturan yang sama dan di sana toBlob akan
  // ditolak. Disamakan supaya tidak ada kejutan.
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    tmplGambar = img;
    kotak.hidden = false;
    gambarPratinjauSertifikat();
  };
  img.onerror = function () {
    kotak.hidden = true;
    tmplGambar = null;
  };
  img.src = url;
}

function gambarPratinjauSertifikat() {
  var canvas = document.getElementById('tmpl-pratinjau');
  if (!canvas || !tmplGambar) return;

  // Pratinjau digambar pada ukuran yang diperkecil, tapi seluruh posisi
  // dihitung dalam PERSEN, jadi hasilnya sebangun dengan yang sungguhan.
  var maksLebar = 760;
  var skala = Math.min(maksLebar / tmplGambar.width, 1);
  canvas.width = Math.round(tmplGambar.width * skala);
  canvas.height = Math.round(tmplGambar.height * skala);

  var ctx = canvas.getContext('2d');
  ctx.drawImage(tmplGambar, 0, 0, canvas.width, canvas.height);

  var nama = document.getElementById('tmpl-nama-contoh').value.trim() || 'Nama Siswa';
  var font = tmplNilai('sertifikatNamaFont') === 'DM Sans' ? '"DM Sans", sans-serif' : '"Syne", sans-serif';

  var px = (Number(tmplNilai('sertifikatNamaUkuran')) / 100) * canvas.width;
  if (!Number.isFinite(px) || px <= 0) px = canvas.width * 0.06;
  ctx.font = '700 ' + px + 'px ' + font;

  var maks = canvas.width * 0.84;
  while (ctx.measureText(nama).width > maks && px > 10) {
    px -= Math.max(1, px * 0.04);
    ctx.font = '700 ' + px + 'px ' + font;
  }

  ctx.fillStyle = tmplNilai('sertifikatNamaWarna') || '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    nama,
    (Number(tmplNilai('sertifikatNamaX')) / 100) * canvas.width,
    (Number(tmplNilai('sertifikatNamaY')) / 100) * canvas.height
  );

  // Angka di sebelah label ikut berubah, supaya nilainya bisa dicatat dan
  // diketik ulang persis kalau nanti perlu.
  var el;
  el = document.getElementById('tmpl-x-nilai');
  if (el) el.textContent = tmplNilai('sertifikatNamaX') + '%';
  el = document.getElementById('tmpl-y-nilai');
  if (el) el.textContent = tmplNilai('sertifikatNamaY') + '%';
  el = document.getElementById('tmpl-ukuran-nilai');
  if (el) el.textContent = tmplNilai('sertifikatNamaUkuran') + '%';
}

async function simpanPosisiNama() {
  var btn = document.getElementById('tmpl-simpan');
  var status = document.getElementById('tmpl-status');

  btn.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Menyimpan…';

  var items = {};
  TMPL_KUNCI.forEach(function (k) {
    var v = tmplNilai(k);
    items[k] = k === 'sertifikatNamaWarna' || k === 'sertifikatNamaFont' ? v : Number(v);
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
      status.textContent = 'Tersimpan. Sertifikat berikutnya memakai posisi ini.';
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

(function pasangTemplat() {
  var kontrol = document.querySelector('.tmpl-kontrol');
  if (!kontrol) return;

  // 'input' bukan 'change': pratinjau harus ikut bergerak selagi slider
  // digeser, bukan baru setelah dilepas.
  kontrol.addEventListener('input', gambarPratinjauSertifikat);

  var simpan = document.getElementById('tmpl-simpan');
  if (simpan) simpan.addEventListener('click', simpanPosisiNama);
})();
