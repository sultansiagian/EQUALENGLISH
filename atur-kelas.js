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
var kartuTambahan = [];
var kartuMati = [];

// Tiga bagian Final Test. Urutan, id, dan nama kuncinya HARUS sama
// dengan BAGIAN_FINAL di api/_lib/kelas-kartu.js -- di sanalah yang
// membaca nilainya. Dua daftar untuk satu hal cepat atau lambat berbeda
// isinya, dan bedanya tidak akan terlihat sampai ada bagian yang tidak
// mau terbuka.
var BAGIAN_FINAL = [
  { id: 'listening', nama: 'Listening', url: 'kelasFinalListeningUrl', buka: 'kelasFinalListeningBuka', tutup: 'kelasFinalListeningTutup' },
  { id: 'reading', nama: 'Reading', url: 'kelasFinalReadingUrl', buka: 'kelasFinalReadingBuka', tutup: 'kelasFinalReadingTutup' },
  { id: 'writing', nama: 'Writing', url: 'kelasFinalWritingUrl', buka: 'kelasFinalWritingBuka', tutup: 'kelasFinalWritingTutup' },
];

// Tujuh kartu bawaan. `id` harus sama dengan KARTU_BAWAAN di
// api/_lib/kelas-kartu.js DAN dengan data-kartu di kelas.html.
var KARTU_BAWAAN = [
  { id: 'zoom', nama: 'Kelas Zoom', ket: 'Link masuk kelas dan hitung mundur sesi berikutnya' },
  { id: 'rekaman', nama: 'Rekaman & Materi', ket: 'Folder Google Drive' },
  { id: 'komunitas', nama: 'Grup Komunitas', ket: 'Link grup WhatsApp' },
  { id: 'jadwal', nama: 'Jadwal', ket: 'Daftar sesi dan progres batch' },
  { id: 'final', nama: 'Final Test', ket: 'Tiga bagian comprehension, terkunci sampai jadwalnya' },
  { id: 'latihan', nama: 'Latihan Soal', ket: 'Tiga kuis Wayground' },
  { id: 'pengumuman', nama: 'Pengumuman', ket: 'Teks bebas, sembunyi sendiri kalau kosong' },
];

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
]
  // Sembilan kunci Final Test (tiga bagian x url/buka/tutup) ditambahkan
  // dari BAGIAN_FINAL, bukan diketik satu per satu, supaya menambah atau
  // mengganti bagian nanti cuma menyentuh satu daftar.
  .concat(
    BAGIAN_FINAL.reduce(function (kumpul, b) {
      return kumpul.concat([b.url, b.buka, b.tutup]);
    }, [])
  );

window.onAdminReady = function (data) {
  // Isian Final Test digambar DULU, sebelum nilainya dipasang: isian itu
  // dibuat JavaScript, jadi kalau urutannya dibalik, KUNCI_TEKS mencari
  // elemen yang belum ada dan sembilan isian Final Test tampil kosong
  // padahal nilainya tersimpan.
  gambarIsianFinal();

  KUNCI_TEKS.forEach(function (k) {
    var el = document.querySelector('[data-key="' + k + '"]');
    if (el) el.value = data.values[k] === undefined || data.values[k] === null ? '' : data.values[k];
  });

  jadwal = Array.isArray(data.values.kelasJadwal)
    ? data.values.kelasJadwal.map(function (s) {
        return { tanggal: s.tanggal || '', jam: s.jam || '', topik: s.topik || '' };
      })
    : [];

  kartuMati = Array.isArray(data.values.kelasKartuMati) ? data.values.kelasKartuMati.slice() : [];
  kartuTambahan = Array.isArray(data.values.kelasKartuTambahan)
    ? data.values.kelasKartuTambahan.map(function (k) {
        return {
          id: k.id || 'kartu-' + Math.random().toString(36).slice(2, 9),
          label: k.label || '',
          judul: k.judul || '',
          deskripsi: k.deskripsi || '',
          ikonUrl: k.ikonUrl || '',
          url: k.url || '',
          bukaPada: k.bukaPada || '',
          lebar: k.lebar || 'auto',
        };
      })
    : [];

  renderJadwal();
  renderKartuBawaan();
  renderKartuTambahan();

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
      // Tanggalnya disebut, bukan cuma nomor barisnya: nomor berubah
      // sendiri tiap kali ada yang dihapus, tanggal tidak.
      var s = jadwal[i];
      var kapan = (s.tanggal || '').trim() || 'yang tanggalnya belum diisi';
      var konfirmasi = window.confirm(
        'Hapus sesi ' + kapan + '? ' +
          'Belum benar-benar hilang sampai kamu menekan Simpan Isi Ruang Kelas, ' +
          'jadi kalau salah tekan, muat ulang halaman ini.'
      );
      if (!konfirmasi) return;
      jadwal.splice(i, 1);
      tandaiAdminBerubah();
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
/**
 * Sembilan isian Final Test: link, jam buka, dan jam tutup untuk tiap
 * bagian. Digambar dari BAGIAN_FINAL, bukan ditulis tetap di HTML,
 * supaya susunannya tetap satu sumber dengan yang dibaca server.
 */
function gambarIsianFinal() {
  var wadah = document.getElementById('final-bagian-atur');
  if (!wadah) return;
  wadah.textContent = '';

  BAGIAN_FINAL.forEach(function (b) {
    var blok = document.createElement('div');
    blok.className = 'final-atur-blok';
    blok.innerHTML =
      '<h3>' + escapeHtml(b.nama) + '</h3>' +
      '<label class="admin-field"><span>Link ujian</span>' +
      '<input type="text" data-key="' + b.url + '" placeholder="https://…" /></label>' +
      '<div class="admin-pkg-grid admin-pkg-grid-2">' +
      '<label class="admin-field"><span>Buka</span>' +
      '<input type="datetime-local" data-key="' + b.buka + '" /></label>' +
      '<label class="admin-field"><span>Tutup</span>' +
      '<input type="datetime-local" data-key="' + b.tutup + '" /></label>' +
      '</div>';
    wadah.appendChild(blok);
  });

  // Satu pendengar untuk seluruh blok, bukan satu per isian. Isian di
  // sini dibuat ulang tiap kali digambar, dan pendengar per isian akan
  // ikut hilang bersamanya tanpa ada yang menyadarinya.
  wadah.addEventListener('input', perbaruiPratinjauFinal);
}

/**
 * Katakan apa yang AKAN terjadi, bukan cuma menerima isian.
 *
 * Jam buka kosong berarti bagian itu TIDAK PERNAH terbuka. Itu kebalikan
 * dari dugaan wajar ("kosong berarti bebas"), jadi harus dikatakan
 * terang-terangan sebelum ditekan Simpan. Jam tutup lebih awal dari jam
 * buka juga ditegur di sini: server mengabaikannya (bagiannya tetap
 * jalan), tapi yang mengisinya jelas bermaksud lain.
 */
function perbaruiPratinjauFinal() {
  var el = document.getElementById('final-pratinjau');
  if (!el) return;

  var nilai = function (k) {
    var i = document.querySelector('[data-key="' + k + '"]');
    return i ? i.value.trim() : '';
  };

  var cadanganUrl = nilai('kelasFinalTestUrl');
  var cadanganBuka = nilai('kelasFinalTestBukaPada');

  var pesan = [];
  var adaMasalah = false;
  var adaSiap = false;

  BAGIAN_FINAL.forEach(function (b) {
    var url = nilai(b.url) || cadanganUrl;
    var buka = nilai(b.buka) || cadanganBuka;
    var tutup = nilai(b.tutup);

    if (!url && !buka && !tutup) return; // belum disentuh, tidak perlu dikomentari

    if (!url) {
      adaMasalah = true;
      pesan.push(b.nama + ': linknya belum diisi, jadi bagian ini tidak akan pernah terbuka.');
      return;
    }
    if (!buka) {
      adaMasalah = true;
      pesan.push(b.nama + ': jam bukanya belum diisi. Bagian ini TIDAK akan terbuka sampai diisi, bukan langsung terbuka.');
      return;
    }
    if (tutup && new Date(tutup).getTime() <= new Date(buka).getTime()) {
      adaMasalah = true;
      pesan.push(b.nama + ': jam tutup lebih awal dari jam buka. Jam tutupnya diabaikan, bagian ini jadi tanpa batas waktu.');
      return;
    }

    adaSiap = true;
    var lewat = new Date(buka).getTime() <= Date.now();
    var sudahTutup = tutup && new Date(tutup).getTime() <= Date.now();

    if (sudahTutup) {
      pesan.push(b.nama + ': sudah ditutup ' + formatWibLokalFinal(tutup) + '.');
    } else if (lewat) {
      pesan.push(
        b.nama + ': SEDANG terbuka' +
        (tutup ? ', sampai ' + formatWibLokalFinal(tutup) : ', tanpa batas waktu') +
        '.'
      );
    } else {
      pesan.push(
        b.nama + ': terbuka ' + formatWibLokalFinal(buka) +
        (tutup ? ', ditutup ' + formatWibLokalFinal(tutup) : ', tanpa batas waktu') +
        '.'
      );
    }
  });

  if (pesan.length === 0) {
    el.dataset.state = 'tutup';
    el.textContent = 'Belum ada bagian yang diisi, jadi kartu Final Test tidak akan terbuka.';
    return;
  }

  el.dataset.state = adaMasalah || !adaSiap ? 'tutup' : 'buka';
  el.textContent = pesan.join(' ') + ' Semuanya cuma untuk siswa yang sudah mengisi testimoni.';
}

// ============================================================
// KARTU BAWAAN: NYALA / MATI
// ============================================================

function renderKartuBawaan() {
  var wadah = document.getElementById('kartu-bawaan-daftar');
  if (!wadah) return;
  wadah.textContent = '';

  KARTU_BAWAAN.forEach(function (k) {
    var mati = kartuMati.indexOf(k.id) !== -1;

    var label = document.createElement('label');
    label.className = 'kartu-sakelar-item';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !mati;
    cb.addEventListener('change', function () {
      var i = kartuMati.indexOf(k.id);
      if (cb.checked && i !== -1) kartuMati.splice(i, 1);
      if (!cb.checked && i === -1) kartuMati.push(k.id);
      label.dataset.mati = cb.checked ? 'tidak' : 'ya';
    });
    label.dataset.mati = mati ? 'ya' : 'tidak';

    var teks = document.createElement('span');
    var nama = document.createElement('strong');
    nama.textContent = k.nama;
    var ket = document.createElement('small');
    ket.textContent = k.ket;
    teks.appendChild(nama);
    teks.appendChild(ket);

    label.appendChild(cb);
    label.appendChild(teks);
    wadah.appendChild(label);
  });
}

// ============================================================
// KARTU BUATAN SENDIRI
// ============================================================

var MAKS_KARTU = 20;

function renderKartuTambahan() {
  var wadah = document.getElementById('kartu-daftar');
  if (!wadah) return;
  wadah.textContent = '';

  var jumlah = document.getElementById('kartu-jumlah');
  if (jumlah) {
    jumlah.textContent = kartuTambahan.length === 0
      ? 'belum ada'
      : kartuTambahan.length + ' kartu';
  }

  var tambah = document.getElementById('kartu-tambah');
  if (tambah) tambah.disabled = kartuTambahan.length >= MAKS_KARTU;

  kartuTambahan.forEach(function (k, i) {
    wadah.appendChild(barisKartu(k, i));
  });
}

function barisKartu(k, i) {
  var blok = document.createElement('div');
  blok.className = 'kartu-item';

  var kepala = document.createElement('div');
  kepala.className = 'kartu-item-kepala';
  var judulKepala = document.createElement('strong');
  judulKepala.textContent = k.judul || 'Kartu tanpa judul';
  kepala.appendChild(judulKepala);

  var aksi = document.createElement('div');
  aksi.className = 'kartu-item-aksi';

  // Naik/turun, bukan seret. Halaman admin ini dibuka dari HP juga, dan
  // seret di layar sentuh yang isinya bisa di-scroll gampang meleset.
  aksi.appendChild(tombolKecil('↑', 'Naikkan', i === 0, function () {
    pindahKartu(i, i - 1);
  }));
  aksi.appendChild(tombolKecil('↓', 'Turunkan', i === kartuTambahan.length - 1, function () {
    pindahKartu(i, i + 1);
  }));
  aksi.appendChild(tombolKecil('Hapus', 'Hapus kartu', false, function () {
    if (!window.confirm('Hapus kartu "' + (k.judul || 'tanpa judul') + '"? Isinya tidak bisa dikembalikan.')) return;
    kartuTambahan.splice(i, 1);
    renderKartuTambahan();
  }));
  kepala.appendChild(aksi);
  blok.appendChild(kepala);

  blok.appendChild(isianKartu('Judul', 'text', k.judul, 'Wajib. Kartu tanpa judul tidak akan disimpan.', function (v) {
    k.judul = v;
    judulKepala.textContent = v || 'Kartu tanpa judul';
  }));
  blok.appendChild(isianKartu('Label kecil', 'text', k.label, 'Tulisan kapital di atas judul, mis. MATERI. Boleh kosong.', function (v) {
    k.label = v;
  }));
  blok.appendChild(isianKartu('Deskripsi', 'textarea', k.deskripsi, 'Satu dua kalimat. Boleh kosong.', function (v) {
    k.deskripsi = v;
    perbaruiKeteranganLebar(blok, k);
  }));
  blok.appendChild(isianKartu('Link', 'text', k.url, 'Boleh kosong kalau kartunya cuma berisi keterangan.', function (v) {
    k.url = v;
    perbaruiKeteranganLebar(blok, k);
  }));
  blok.appendChild(isianKartu('Tampil mulai', 'datetime-local', k.bukaPada, 'Jam WIB. Dikosongkan berarti langsung tampil. Sebelum jam ini, kartunya tidak dikirim ke browser siswa sama sekali.', function (v) {
    k.bukaPada = v;
  }));

  blok.appendChild(isianIkon(k));
  blok.appendChild(isianLebar(blok, k));

  return blok;
}

function tombolKecil(teks, judul, nonaktif, saatKlik) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'admin-btn admin-btn-ghost admin-btn-kecil';
  b.textContent = teks;
  b.title = judul;
  b.setAttribute('aria-label', judul);
  b.disabled = Boolean(nonaktif);
  b.addEventListener('click', saatKlik);
  return b;
}

function pindahKartu(dari, ke) {
  if (ke < 0 || ke >= kartuTambahan.length) return;
  var item = kartuTambahan.splice(dari, 1)[0];
  kartuTambahan.splice(ke, 0, item);
  renderKartuTambahan();
}

function isianKartu(label, tipe, nilai, bantuan, saatUbah) {
  var l = document.createElement('label');
  l.className = 'admin-field';
  var s = document.createElement('span');
  s.textContent = label;
  l.appendChild(s);

  var input = document.createElement(tipe === 'textarea' ? 'textarea' : 'input');
  if (tipe === 'textarea') input.rows = 2;
  else input.type = tipe;
  input.value = nilai || '';
  input.addEventListener('input', function () { saatUbah(input.value); });
  l.appendChild(input);

  if (bantuan) {
    var b = document.createElement('small');
    b.className = 'admin-field-bantuan';
    b.textContent = bantuan;
    l.appendChild(b);
  }
  return l;
}

function isianLebar(blok, k) {
  var l = document.createElement('label');
  l.className = 'admin-field';
  var s = document.createElement('span');
  s.textContent = 'Lebar kartu';
  l.appendChild(s);

  var sel = document.createElement('select');
  [
    ['auto', 'Otomatis'],
    ['sempit', 'Sempit (setengah baris)'],
    ['lebar', 'Lebar (satu baris penuh)'],
  ].forEach(function (o) {
    var opt = document.createElement('option');
    opt.value = o[0];
    opt.textContent = o[1];
    sel.appendChild(opt);
  });
  sel.value = k.lebar || 'auto';
  l.appendChild(sel);

  var ket = document.createElement('small');
  ket.className = 'admin-field-bantuan';
  ket.dataset.lebarKet = '1';
  l.appendChild(ket);

  sel.addEventListener('change', function () {
    k.lebar = sel.value;
    perbaruiKeteranganLebar(blok, k);
  });

  tulisKeteranganLebar(ket, k);
  return l;
}

/**
 * Katakan lebar mana yang benar-benar dipakai kalau pilihannya
 * "Otomatis". Aturannya disalin dari lebarDipakai() di
 * api/_lib/kelas-kartu.js -- yang MEMUTUSKAN tetap server, ini cuma
 * menjelaskan supaya hasilnya tidak jadi kejutan setelah disimpan.
 */
function tulisKeteranganLebar(el, k) {
  if (!el) return;
  if (k.lebar && k.lebar !== 'auto') {
    el.textContent = 'Lebarnya kamu tentukan sendiri.';
    return;
  }
  var lebar = !k.url || (k.deskripsi || '').length > 120;
  el.textContent = lebar
    ? 'Otomatis: jadi LEBAR, karena kartunya tanpa link atau deskripsinya panjang.'
    : 'Otomatis: jadi SEMPIT, berbaris berdua dengan kartu lain.';
}

// Dipanggil dari isian judul/deskripsi/link yang mengubah hasil
// "Otomatis". Blok kartunya dicari lagi di sini karena isian-isian itu
// dibuat sebelum keterangannya ada.
function perbaruiKeteranganLebar(blok, k) {
  tulisKeteranganLebar(blok.querySelector('[data-lebar-ket]'), k);
}

function isianIkon(k) {
  var bungkus = document.createElement('div');
  bungkus.className = 'admin-field kartu-ikon';

  var s = document.createElement('span');
  s.textContent = 'Ikon';
  bungkus.appendChild(s);

  var baris = document.createElement('div');
  baris.className = 'kartu-ikon-baris';

  var pratinjau = document.createElement('img');
  pratinjau.className = 'kartu-ikon-pratinjau';
  pratinjau.alt = '';
  pratinjau.hidden = !k.ikonUrl;
  if (k.ikonUrl) pratinjau.src = k.ikonUrl;
  baris.appendChild(pratinjau);

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  var status = document.createElement('small');
  status.className = 'admin-field-bantuan';
  status.textContent = k.ikonUrl ? 'Ikon terpasang.' : 'Boleh kosong. Kartu tanpa ikon tetap rapi.';

  input.addEventListener('change', async function () {
    var file = input.files && input.files[0];
    if (!file) return;
    status.textContent = 'Mengunggah…';
    try {
      var dataUrl = await bacaSebagaiDataUrl(file);
      var res = await fetch('/api/admin-upload', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ slot: 'kartuIkon', dataUrl: dataUrl }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || data.reason || res.status);
      k.ikonUrl = data.url;
      pratinjau.src = data.url;
      pratinjau.hidden = false;
      // Belum tersimpan sampai tombol Simpan ditekan. Dikatakan supaya
      // tidak ada yang menutup halaman mengira ikonnya sudah aman.
      status.textContent = 'Terunggah. Tekan Simpan di bawah supaya menempel ke kartu ini.';
    } catch (err) {
      status.textContent = 'Gagal mengunggah: ' + err.message;
    } finally {
      input.value = '';
    }
  });

  baris.appendChild(input);
  bungkus.appendChild(baris);
  bungkus.appendChild(status);

  if (k.ikonUrl) {
    var hapus = tombolKecil('Hapus ikon', 'Hapus ikon', false, function () {
      k.ikonUrl = '';
      pratinjau.hidden = true;
      pratinjau.removeAttribute('src');
      hapus.remove();
      status.textContent = 'Ikon dilepas. Tekan Simpan supaya berlaku.';
    });
    baris.appendChild(hapus);
  }

  return bungkus;
}

function bacaSebagaiDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(new Error('berkasnya tidak terbaca')); };
    r.readAsDataURL(file);
  });
}

function tambahKartu() {
  if (kartuTambahan.length >= MAKS_KARTU) return;
  kartuTambahan.push({
    id: 'kartu-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    label: '', judul: '', deskripsi: '', ikonUrl: '', url: '', bukaPada: '', lebar: 'auto',
  });
  renderKartuTambahan();
  // Fokus langsung ke judul kartu baru: itu satu-satunya isian yang
  // wajib, dan kartu tanpa judul akan dibuang server tanpa suara. Judul
  // itu isian pertama di dalam blok kartunya, jadi dicari lewat blok
  // terakhir, bukan lewat hitungan mundur dari seluruh isian halaman.
  var blok = document.querySelectorAll('#kartu-daftar .kartu-item');
  var terakhir = blok[blok.length - 1];
  var judul = terakhir && terakhir.querySelector('input[type="text"]');
  if (judul) judul.focus();
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

  // Kartu tanpa judul akan dibuang server. Sama seperti sesi tanpa
  // tanggal di atas: dikatakan di sini supaya tidak terlihat seperti
  // data yang hilang tanpa sebab setelah halaman dimuat ulang.
  var tanpaJudul = kartuTambahan.filter(function (k) { return !String(k.judul || '').trim(); }).length;
  if (tanpaJudul > 0) {
    status.dataset.state = 'error';
    status.textContent =
      'Ada ' + tanpaJudul + ' kartu tambahan yang judulnya belum diisi. Isi dulu atau hapus kartunya.';
    return;
  }

  var berhasil = false;
  tombolSibuk(btn, true);
  status.removeAttribute('data-state');
  status.textContent = 'Menyimpan…';

  var items = {
    kelasJadwal: jadwal,
    kelasKartuMati: kartuMati,
    kelasKartuTambahan: kartuTambahan,
  };
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
      berhasil = true;
      tandaiAdminTersimpan();
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
    tombolSibuk(btn, false);
    if (berhasil) tombolBerhasil(btn);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('jadwal-tambah-btn').addEventListener('click', tambahSesi);
  document.getElementById('kelas-simpan').addEventListener('click', simpanKelas);
  document.getElementById('kartu-tambah').addEventListener('click', tambahKartu);
  // Isian cadangan Final Test ikut memicu pratinjau: nilainya dipakai
  // bagian yang belum diisi sendiri, jadi mengubahnya memang mengubah
  // apa yang akan terjadi.
  ['kelasFinalTestUrl', 'kelasFinalTestBukaPada'].forEach(function (k) {
    var el = document.querySelector('[data-key="' + k + '"]');
    if (el) el.addEventListener('input', perbaruiPratinjauFinal);
  });
});
