/**
 * Halaman /batch: mengelola angkatan peserta.
 *
 * Empat hal yang bisa dilakukan di sini, dan cuma dua di antaranya
 * menyentuh akses orang:
 *
 *   Buka batch     -> menentukan ke mana persetujuan berikutnya jatuh.
 *                     TIDAK mengubah akses siapa pun.
 *   Tutup batch    -> mengunci daftar anggotanya. TIDAK mengubah akses.
 *   Cabut akses    -> menulis "done" di baris yang dipilih. Akses mati.
 *   Pulihkan akses -> membersihkan "done" dari baris itu. Akses hidup.
 *
 * Perbedaan tutup dan cabut sengaja dijaga tegas di seluruh teks
 * halaman ini. Keduanya gampang tertukar, dan tertukarnya mahal: yang
 * satu cuma pembukuan, yang satu mematikan akses ke materi yang sudah
 * dibayar orang.
 *
 * Login ditangani admin-auth.js yang dimuat lebih dulu; file ini cuma
 * menyediakan window.onAdminReady.
 */

// Hasil pengambilan terakhir. Disaring ke layar lewat gambarDaftar();
// daftar ini sendiri tidak ikut berubah waktu mencari.
var semuaAnggota = [];
var semuaBatch = [];
var batchDipilih = null; // id batch, atau '' untuk kelompok tanpa label

// Label kelompok untuk baris yang kolom batch-nya kosong: semua peserta
// yang masuk sebelum fitur ini ada (Google Form lama dan sheet manual).
var TANPA_LABEL = '';

// Pemisah paragraf di dalam dialog confirm/prompt. Ditulis sebagai
// konstanta, bukan escape di tengah kalimat panjang, supaya tidak ada
// lagi yang tidak sengaja jadi baris baru sungguhan waktu berkas ini
// disunting -- itu sempat terjadi dan bikin berkasnya gagal diurai.
var BARIS_BARU = '\n\n';

window.onAdminReady = function () {
  muatBatch();

  document.getElementById('batch-refresh').addEventListener('click', muatBatch);
  document.getElementById('batch-cari').addEventListener('input', gambarDaftar);
};

// ============================================================
// MENGAMBIL DATA
// ============================================================

function statusDaftar(teks, state) {
  const list = document.getElementById('batch-list');
  list.textContent = '';
  const p = document.createElement('p');
  p.className = 'admin-hint admin-pendaftar-kosong';
  if (state) p.dataset.state = state;
  p.textContent = teks;
  list.appendChild(p);
}

async function muatBatch() {
  statusDaftar('Memuat…');
  try {
    const res = await fetch('/api/admin-data?bagian=batch', { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.pesan || data.reason || 'gagal');

    semuaBatch = Array.isArray(data.batch) ? data.batch : [];
    semuaAnggota = Array.isArray(data.anggota) ? data.anggota : [];

    // Pilihan sebelumnya dipertahankan kalau batch-nya masih ada, supaya
    // menekan "Muat Ulang" atau mencabut satu orang tidak melemparkan
    // kamu balik ke batch lain di tengah pekerjaan.
    const masihAda =
      batchDipilih === TANPA_LABEL || semuaBatch.some((b) => b.id === batchDipilih);
    if (!masihAda) batchDipilih = null;
    if (batchDipilih === null) batchDipilih = pilihanAwal();

    gambarBatchAktif();
    gambarPemilih();
    gambarDaftar();
  } catch (err) {
    // Diterjemahkan lewat peta yang sama dengan tombol-tombolnya. Server
    // meneruskan alasan dari Apps Script apa adanya, dan kode mentah
    // seperti "action_tidak_dikenal" tidak memberi tahu siapa pun apa
    // yang harus dikerjakan -- padahal justru itu kegagalan yang paling
    // mungkin terjadi waktu halaman ini pertama kali dibuka.
    statusDaftar('Gagal memuat daftar batch. ' + pesanGagal({ reason: err.message }), 'error');
  }
}

/**
 * Batch mana yang ditampilkan pertama kali.
 *
 * Yang aktif kalau ada, karena itu yang paling sering dibuka. Kalau
 * tidak ada yang aktif, yang paling baru -- bukan yang paling lama,
 * karena angkatan lama justru yang paling jarang disentuh.
 */
function pilihanAwal() {
  const aktif = semuaBatch.find((b) => !b.selesai);
  if (aktif) return aktif.id;
  if (semuaBatch.length > 0) return semuaBatch[semuaBatch.length - 1].id;
  return TANPA_LABEL;
}

// ============================================================
// BATCH AKTIF
// ============================================================

function gambarBatchAktif() {
  const nama = document.getElementById('batch-aktif-nama');
  const hint = document.getElementById('batch-aktif-hint');
  const aksi = document.getElementById('batch-aktif-aksi');
  const aktif = semuaBatch.find((b) => !b.selesai);

  aksi.textContent = '';

  if (aktif) {
    nama.textContent = '· ' + aktif.nama;
    hint.textContent =
      'Semua yang kamu setujui di /pendaftar masuk ke ' + aktif.nama + '.' +
      (aktif.aksesBerakhir
        ? ' Aksesnya berlaku sampai ' + tanggalTerbaca(aktif.aksesBerakhir) + '.'
        : ' Batch ini belum punya tanggal berakhir, jadi aksesnya tidak dibatasi waktu.');

    aksi.appendChild(
      tombol('Tutup ' + aktif.nama, 'admin-btn-ghost', () => tutupBatch(aktif))
    );
    aksi.appendChild(
      tombol('Buka batch baru', 'admin-btn-ghost', bukaBatchBaru)
    );
    aksi.appendChild(
      tombol('Ganti nama', 'admin-btn-ghost', () => gantiNama(aktif))
    );
    return;
  }

  nama.textContent = '';
  hint.textContent = semuaBatch.length
    ? 'Tidak ada batch yang menerima anggota. Tombol Setujui di /pendaftar akan menolak sampai kamu membuka batch baru.'
    : 'Belum ada batch sama sekali. Buka batch pertama supaya peserta yang kamu setujui mulai punya angkatan.';
  aksi.appendChild(tombol('Buka batch baru', 'admin-btn', bukaBatchBaru));
}

function tombol(teks, kelas, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'admin-btn ' + (kelas || '');
  b.textContent = teks;
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Tombol untuk tindakan yang mematikan akses.
 *
 * Memakai .admin-pendaftar-tolak yang sudah ada di admin.css, bukan
 * kelas merah baru: di /pendaftar kelas itu dipakai untuk "Tolak", dan
 * di sini untuk "Cabut akses". Keduanya tindakan merugikan yang tidak
 * boleh terlihat seperti tombol biasa, jadi memang pantas satu gaya.
 */
function tombolTolak(teks, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'admin-pendaftar-tolak';
  b.textContent = teks;
  b.addEventListener('click', onClick);
  return b;
}

async function bukaBatchBaru() {
  const nama = window.prompt(
    'Nama batch baru?\n\nKosongkan untuk memakai nomor berikutnya secara otomatis.',
    ''
  );
  // prompt() mengembalikan null kalau dibatalkan, dan string kosong kalau
  // dikosongkan lalu OK. Keduanya berbeda: yang pertama batal, yang kedua
  // "pakai nama otomatis".
  if (nama === null) return;

  const tanggal = window.prompt(
    'Akses batch ini berlaku sampai kapan?\n\n' +
      'Tulis YYYY-MM-DD, misalnya 2027-03-31.\n' +
      'Kosongkan kalau tidak mau dibatasi waktu.',
    ''
  );
  if (tanggal === null) return;

  const bersih = String(tanggal).trim();
  if (bersih && !/^\d{4}-\d{2}-\d{2}$/.test(bersih)) {
    window.alert(
      'Tanggalnya harus ditulis YYYY-MM-DD, misalnya 2027-03-31.\n\n' +
        'Batch tidak jadi dibuka. Coba lagi.'
    );
    return;
  }

  await kirimAksi({ aksi: 'buka', nama: String(nama).trim(), aksesBerakhir: bersih });
}

async function tutupBatch(batch) {
  const jumlah = anggotaBatch(batch.nama).length;
  const setuju = window.confirm(
    'Tutup ' + batch.nama + '?\n\n' +
      'Yang terjadi: batch ini berhenti menerima anggota baru, dan kamu perlu ' +
      'membuka batch baru sebelum bisa menyetujui pendaftar lagi.\n\n' +
      'Yang TIDAK terjadi: akses ' + jumlah + ' peserta di dalamnya tidak berubah ' +
      'sama sekali. Mereka tetap bisa membuka ruang kelas sampai kamu mencabutnya ' +
      'atau tanggalnya lewat.'
  );
  if (!setuju) return;
  await kirimAksi({ aksi: 'tutup', id: batch.id });
}

/**
 * Ganti nama batch.
 *
 * Pindah ke sini dari /analitik, yang dulu punya tombolnya sendiri.
 *
 * Namanya dipakai dua kali: di layar, DAN sebagai isi kolom BS tiap
 * baris anggotanya. Yang sudah terlanjur berlabel nama lama tidak ikut
 * ditulis ulang, jadi mereka akan pindah ke kelompok bernama lama.
 * Dikatakan terus terang sebelum tombolnya ditekan, bukan dibiarkan
 * jadi kejutan waktu daftarnya mendadak kosong.
 */
async function gantiNama(batch) {
  const jumlah = anggotaBatch(batch.nama).length;
  const nama = window.prompt('Nama baru untuk ' + batch.nama + ':', batch.nama);
  if (nama === null) return;
  if (!nama.trim()) return;

  if (jumlah > 0) {
    const setuju = window.confirm(
      batch.nama + ' punya ' + jumlah + ' baris anggota yang sudah berlabel nama lama ' +
        'di spreadsheet.' + BARIS_BARU +
        'Label mereka TIDAK ikut diganti, jadi setelah ini mereka muncul sebagai ' +
        'kelompok "' + batch.nama + '" yang terpisah dari "' + nama.trim() + '".' + BARIS_BARU +
        'Kalau mau tetap satu kelompok, ganti juga kolom BS baris-baris itu di ' +
        'spreadsheet. Lanjutkan?'
    );
    if (!setuju) return;
  }

  await kirimAksi({ aksi: 'ganti-nama', id: batch.id, nama: nama.trim() });
}

async function kirimAksi(muatan) {
  try {
    const res = await fetch('/api/admin-data', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      // "bagian" memberi tahu router di api/admin-data.js handler mana
      // yang dituju. Halaman ini tidak punya rutenya sendiri -- lihat
      // catatan batas 12 Serverless Function di berkas itu.
      body: JSON.stringify(Object.assign({ bagian: 'batch' }, muatan)),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      window.alert('Gagal: ' + pesanGagal(data));
      return null;
    }
    await muatBatch();
    return data;
  } catch (err) {
    window.alert('Gagal menghubungi server: ' + err.message);
    return null;
  }
}

var PESAN_GAGAL = {
  nama_sudah_dipakai: 'Sudah ada batch dengan nama itu. Pakai nama lain.',
  batch_tidak_ketemu: 'Batch itu tidak ditemukan. Coba muat ulang halaman.',
  batch_sudah_tertutup: 'Batch itu memang sudah tertutup.',
  nama_kosong: 'Nama batch tidak boleh kosong.',
  terlalu_banyak_batch: 'Jumlah batch sudah mencapai batas.',
  terlalu_banyak_baris: 'Terlalu banyak baris sekaligus. Cabut per batch yang lebih kecil.',
  baris_tidak_lengkap: 'Tidak ada baris yang dipilih.',
  tab_roster_tidak_ketemu:
    'Apps Script tidak menemukan tab roster di spreadsheet. Pesan lengkap dari Apps Script menyebut nama tab yang benar-benar ada di sana — tambahkan nama itu ke TAB_ROSTER_KANDIDAT di skripnya.',

  /* KEGAGALAN YANG PALING MUNGKIN TERJADI, dan yang paling menyesatkan
     kalau dibiarkan tampil sebagai kode mentah.

     "action_tidak_dikenal" berarti skrip yang SEDANG BERJALAN di
     spreadsheet belum mengenal aksi rosterList/rosterTandai, yaitu versi
     lama. Penyebabnya hampir selalu satu: isinya sudah ditempel dan
     disimpan, tapi belum di-Deploy sebagai versi baru.

     Menyimpan saja tidak mengubah apa pun yang dipanggil dari luar, dan
     itulah yang bikin susah disadari -- semua fungsi lama tetap jalan
     normal, termasuk tombol "Cek Koneksi" di /admin yang cuma mengirim
     ping. Yang berhenti cuma yang baru. */
  action_tidak_dikenal:
    'Apps Script di spreadsheet masih versi lama. Isinya mungkin sudah kamu tempel, tapi belum di-Deploy ulang: buka Extensions > Apps Script, lalu Deploy > Manage deployments > ikon pensil > Version: New version. Jangan "New deployment" — itu membuat URL baru.',
};

function pesanGagal(data) {
  const kode = (data && (data.reason || data.pesan)) || 'tidak diketahui';
  return PESAN_GAGAL[kode] || kode;
}

// ============================================================
// PEMILIH BATCH
// ============================================================

function anggotaBatch(namaBatch) {
  return semuaAnggota.filter((a) => a.batch === namaBatch);
}

function namaBatchDipilih() {
  if (batchDipilih === TANPA_LABEL) return TANPA_LABEL;
  const b = semuaBatch.find((x) => x.id === batchDipilih);
  return b ? b.nama : TANPA_LABEL;
}

function gambarPemilih() {
  const wrap = document.getElementById('batch-pilih');
  wrap.textContent = '';

  const daftar = semuaBatch.map((b) => ({
    id: b.id,
    nama: b.nama,
    jumlah: anggotaBatch(b.nama).length,
    tertutup: Boolean(b.selesai),
  }));

  // Kelompok tanpa label cuma ditampilkan kalau memang ada isinya.
  // Menampilkan tab kosong permanen di sebelah batch asli cuma bikin
  // orang mengira ada yang salah.
  const tanpaLabel = semuaAnggota.filter((a) => !a.batch).length;
  if (tanpaLabel > 0) {
    daftar.unshift({ id: TANPA_LABEL, nama: 'Tanpa batch', jumlah: tanpaLabel, tertutup: true });
  }

  if (daftar.length === 0) return;

  daftar.forEach((b) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'batch-tab' + (b.id === batchDipilih ? ' is-aktif' : '');
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', b.id === batchDipilih ? 'true' : 'false');
    t.innerHTML =
      '<span class="batch-tab-nama"></span><span class="batch-tab-jumlah"></span>';
    t.querySelector('.batch-tab-nama').textContent = b.nama;
    t.querySelector('.batch-tab-jumlah').textContent = b.jumlah;
    if (!b.tertutup) t.title = 'Batch ini sedang menerima anggota baru';
    t.addEventListener('click', () => {
      batchDipilih = b.id;
      gambarPemilih();
      gambarDaftar();
    });
    wrap.appendChild(t);
  });
}

// ============================================================
// DAFTAR ANGGOTA
// ============================================================

function tanggalTerbaca(iso) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!cocok) return String(iso || '');
  const BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return Number(cocok[3]) + ' ' + BULAN[Number(cocok[2]) - 1] + ' ' + cocok[1];
}

function gambarDaftar() {
  const list = document.getElementById('batch-list');
  const info = document.getElementById('batch-info');
  const jumlahEl = document.getElementById('batch-jumlah');
  const nama = namaBatchDipilih();
  const anggota = anggotaBatch(nama);

  jumlahEl.textContent = anggota.length ? '· ' + anggota.length + ' baris' : '';

  // Panel keterangan + tombol untuk seluruh batch.
  info.textContent = '';
  info.hidden = true;
  if (anggota.length > 0) {
    info.hidden = false;
    const aktifSemua = anggota.filter((a) => !a.dicabut);
    const dicabutSemua = anggota.filter((a) => a.dicabut);

    const p = document.createElement('p');
    p.className = 'admin-hint';
    p.textContent =
      (nama ? nama : 'Peserta tanpa label batch') + ': ' +
      aktifSemua.length + ' baris masih punya akses, ' +
      dicabutSemua.length + ' sudah dicabut.';
    info.appendChild(p);

    const aksi = document.createElement('div');
    aksi.className = 'batch-aksi';
    if (aktifSemua.length > 0) {
      aksi.appendChild(
        tombolTolak('Cabut akses ' + (nama || 'kelompok ini'), () =>
          cabutBanyak(aktifSemua, nama)
        )
      );
    }
    if (dicabutSemua.length > 0) {
      aksi.appendChild(
        tombol(
          'Pulihkan ' + dicabutSemua.length + ' baris',
          'admin-btn-ghost',
          () => pulihkanBanyak(dicabutSemua, nama)
        )
      );
    }
    info.appendChild(aksi);
  }

  // Pencarian disaring di browser: seluruh daftar sudah diambil sekali.
  const cari = document.getElementById('batch-cari').value.trim().toLowerCase();
  const tampil = cari
    ? anggota.filter((a) =>
        [a.nama, a.fakultas, a.paket, a.email.join(' '), a.anggota.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(cari)
      )
    : anggota;

  list.textContent = '';

  if (anggota.length === 0) {
    statusDaftar(
      semuaBatch.length === 0 && semuaAnggota.length === 0
        ? 'Belum ada peserta di roster.'
        : 'Belum ada peserta di batch ini.'
    );
    return;
  }
  if (tampil.length === 0) {
    statusDaftar('Tidak ada yang cocok dengan pencarian itu.');
    return;
  }

  tampil.forEach((a) => list.appendChild(kartuAnggota(a, nama)));
}

function kartuAnggota(a, namaBatch) {
  // Kelas kartu, kepala, dan grid-nya sengaja MEMAKAI ULANG milik
  // /pendaftar. Dua halaman ini menampilkan benda yang sama (satu baris
  // pendaftaran) pada tahap hidup yang berbeda, jadi bentuk kartunya
  // memang harus sama; membuat kembarannya sendiri berarti dua tampilan
  // yang pelan-pelan berbeda tanpa ada yang memutuskan begitu.
  const kartu = document.createElement('article');
  kartu.className = 'admin-pendaftar' + (a.dicabut ? ' is-dicabut' : '');

  const kepala = document.createElement('div');
  kepala.className = 'admin-pendaftar-head';

  const judul = document.createElement('h3');
  judul.textContent = a.nama;
  kepala.appendChild(judul);

  const lencana = document.createElement('span');
  lencana.className = 'batch-lencana ' + (a.dicabut ? 'batch-lencana-mati' : 'batch-lencana-hidup');
  lencana.textContent = a.dicabut ? 'Akses dicabut' : 'Akses aktif';
  kepala.appendChild(lencana);

  kartu.appendChild(kepala);

  const info = document.createElement('div');
  info.className = 'admin-pendaftar-grid';
  [
    ['Paket', a.paket],
    ['Fakultas', a.fakultas],
    ['Email', a.email.join(', ')],
    ['Berlaku sampai', a.berlakuSampai ? tanggalTerbaca(a.berlakuSampai) : 'Tanpa batas waktu'],
  ].forEach(([label, isi]) => {
    if (!isi) return;
    const baris = document.createElement('div');
    baris.className = 'admin-pendaftar-info';
    const s = document.createElement('span');
    s.textContent = label;
    const st = document.createElement('strong');
    st.textContent = isi;
    baris.appendChild(s);
    baris.appendChild(st);
    info.appendChild(baris);
  });
  kartu.appendChild(info);

  // Satu baris bisa berisi beberapa orang. Disebut terang-terangan di
  // kartunya, bukan cuma di tombol, supaya jelas sebelum tombolnya
  // ditekan siapa saja yang ikut terkena.
  if (a.anggota.length > 1) {
    const catatan = document.createElement('p');
    catatan.className = 'admin-hint batch-catatan';
    catatan.textContent =
      'Satu baris berisi ' + a.anggota.length + ' orang: ' + a.anggota.join(', ') +
      '. Mencabut atau memulihkan berlaku untuk mereka semua.';
    kartu.appendChild(catatan);
  }

  const aksi = document.createElement('div');
  aksi.className = 'admin-pendaftar-aksi';
  if (a.dicabut) {
    aksi.appendChild(tombol('Pulihkan akses', 'admin-btn-ghost', () => pulihkanBanyak([a], namaBatch)));
  } else {
    aksi.appendChild(
      tombolTolak(
        a.anggota.length > 1 ? 'Cabut akses (' + a.anggota.length + ' orang)' : 'Cabut akses',
        () => cabutBanyak([a], namaBatch)
      )
    );
  }
  kartu.appendChild(aksi);

  return kartu;
}

// ============================================================
// CABUT / PULIHKAN
// ============================================================

function jumlahOrang(daftar) {
  return daftar.reduce((n, a) => n + Math.max(a.email.length, 1), 0);
}

async function cabutBanyak(daftar, namaBatch) {
  const orang = jumlahOrang(daftar);
  const sebutan =
    daftar.length === 1
      ? daftar[0].nama + (daftar[0].anggota.length > 1 ? ' dan ' + (daftar[0].anggota.length - 1) + ' temannya' : '')
      : daftar.length + ' baris (' + orang + ' orang) di ' + (namaBatch || 'kelompok tanpa batch');

  const setuju = window.confirm(
    'Cabut akses ' + sebutan + '?\n\n' +
      'Mereka langsung tidak bisa membuka ruang kelas lagi.\n\n' +
      'Bisa dibatalkan: datanya tetap utuh, dan tombol Pulihkan mengembalikan aksesnya.'
  );
  if (!setuju) return;

  const kirimEmail = window.confirm(
    'Kirim email pemberitahuan ke ' + orang + ' orang?\n\n' +
      'OK = cabut dan kirim email.\n' +
      'Batal = cabut diam-diam tanpa email.'
  );

  const hasil = await kirimAksi({
    aksi: 'cabut',
    nomorBaris: daftar.map((a) => a.nomorBaris),
    kirimEmail,
    penerima: daftar.map((a) => ({ nomorBaris: a.nomorBaris, email: a.email, nama: a.nama })),
  });

  laporkan(hasil, 'dicabut');
}

async function pulihkanBanyak(daftar, namaBatch) {
  // Peringatan yang paling gampang terlewat: memulihkan tidak ada
  // gunanya kalau tanggal di kolom W sudah lewat, karena roster.js
  // menolak baris kedaluwarsa TANPA melihat ada tidaknya "done".
  // Tombolnya akan terlihat berhasil sementara orangnya tetap terkunci.
  const kedaluwarsa = daftar.filter((a) => a.berlakuSampai && sudahLewat(a.berlakuSampai));
  let peringatan = '';
  if (kedaluwarsa.length > 0) {
    peringatan =
      '\n\nPERHATIAN: ' + kedaluwarsa.length + ' baris punya tanggal berakhir yang SUDAH LEWAT ' +
      '(kolom W di spreadsheet). Memulihkan saja tidak cukup untuk mereka — aksesnya tetap ' +
      'tertolak karena tanggalnya. Perpanjang dulu tanggalnya di spreadsheet, atau kosongkan ' +
      'selnya supaya tidak dibatasi waktu.';
  }

  const setuju = window.confirm(
    'Pulihkan akses ' +
      (daftar.length === 1 ? daftar[0].nama : daftar.length + ' baris di ' + (namaBatch || 'kelompok tanpa batch')) +
      '?\n\nMereka bisa membuka ruang kelas lagi.' +
      peringatan
  );
  if (!setuju) return;

  const hasil = await kirimAksi({
    aksi: 'pulihkan',
    nomorBaris: daftar.map((a) => a.nomorBaris),
  });

  laporkan(hasil, 'dipulihkan');
}

/** Tanggal "YYYY-MM-DD" sudah lewat akhir hari WIB? */
function sudahLewat(iso) {
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!cocok) return false;
  // Akhir hari WIB = 16:59:59 UTC di hari yang sama. Sama persis dengan
  // aturan di api/_lib/roster.js -- kalau yang satu diubah, yang lain
  // ikut, atau peringatan di atas jadi bohong.
  const batas = Date.UTC(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3]), 16, 59, 59, 999);
  return Date.now() > batas;
}

function laporkan(hasil, kata) {
  if (!hasil) return;
  if (hasil.gagal && hasil.gagal.length > 0) {
    window.alert(
      hasil.berhasil + ' baris ' + kata + ', tapi ' + hasil.gagal.length + ' gagal.\n\n' +
        'Yang gagal: baris ' + hasil.gagal.map((g) => g.nomorBaris).join(', ') + '.\n' +
        'Daftarnya sudah dimuat ulang, jadi yang masih perlu diulang kelihatan dari lencananya.'
    );
  }
}
