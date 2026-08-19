/**
 * Halaman /pendaftar: daftar pendaftar dari form /daftar yang menunggu
 * persetujuan, dengan tombol Setujui / Tolak.
 *
 * Dipisah dari /admin (bukan jadi satu kartu di sana) karena jumlahnya
 * tumbuh terus seiring waktu, sementara isi halaman /admin tetap. Di
 * angka ratusan pendaftar, kartu-kartu ini akan mendominasi halaman dan
 * mengubur bagian konten yang justru jarang berubah.
 *
 * Login ditangani admin-auth.js yang dimuat lebih dulu. File ini cuma
 * menyediakan window.onAdminReady di bawah.
 *
 * SOAL JUMLAH BANYAK: seluruh daftar diambil sekali lalu disaring di
 * browser (bukan per halaman dari server). Ini pilihan sadar untuk
 * skala yang realistis di sini -- 100 pendaftar itu sekitar 100 KB,
 * sekali ambil, dan pencarian jadi instan tanpa bolak-balik ke server.
 * Kalau suatu hari tembus ribuan baris, yang perlu diubah adalah
 * handleList() di apps-script.gs supaya mengirim per potongan.
 */

// Semua pendaftar hasil pengambilan terakhir. Disaring ke layar lewat
// terapkanFilter(); daftar ini sendiri tidak ikut berubah waktu mencari,
// supaya menghapus kata kunci langsung menampilkan semuanya lagi tanpa
// perlu memanggil server ulang.
var semuaPendaftar = [];

window.onAdminReady = function () {
  // Langsung dimuat begitu login berhasil. Halaman ini memang cuma untuk
  // itu, jadi mengharuskan klik tombol dulu cuma menambah satu langkah
  // tanpa alasan.
  muatPendaftar();
};

// ============================================================
// PENDAFTAR BARU (dari form /daftar)
//
// Datanya TIDAK disimpan di Global Config seperti konten lain, melainkan
// di tab "Pendaftar Web" pada spreadsheet pendaftaran. Semua akses ke
// situ lewat /api/admin-pendaftar -> Apps Script (lihat apps-script.gs).
// ============================================================

function pendaftarStatus(teks, state) {
  const list = document.getElementById('admin-pendaftar-list');
  list.textContent = '';
  const p = document.createElement('p');
  p.className = 'admin-hint admin-pendaftar-kosong';
  if (state) p.dataset.state = state;
  p.textContent = teks;
  list.appendChild(p);
}

function barisInfo(label, isi) {
  if (!isi) return '';
  return (
    '<div class="admin-pendaftar-info"><span>' +
    label +
    '</span><strong>' +
    isi +
    '</strong></div>'
  );
}

function linkBukti(label, url) {
  if (!url) return '';
  return (
    '<a class="admin-pendaftar-bukti" href="' +
    encodeURI(url) +
    '" target="_blank" rel="noopener">' +
    label +
    ' <span aria-hidden="true">↗</span></a>'
  );
}

function renderPendaftar(daftar) {
  const list = document.getElementById('admin-pendaftar-list');

  if (!daftar || daftar.length === 0) {
    // Dibedakan supaya tidak menyesatkan: "belum ada pendaftar" waktu kata
    // kunci pencarian sedang aktif itu keliru, yang benar "tidak ada yang
    // cocok".
    var adaKataKunci = (document.getElementById('admin-pendaftar-cari').value || '').trim();
    pendaftarStatus(
      adaKataKunci
        ? 'Tidak ada pendaftar yang cocok dengan "' + adaKataKunci + '".'
        : 'Belum ada pendaftar baru yang menunggu persetujuan.'
    );
    return;
  }

  list.textContent = '';
  daftar.forEach((p) => {
    const kartu = document.createElement('div');
    kartu.className = 'admin-pendaftar';

    // Peserta ditampilkan sebagai satu daftar email, karena email itulah
    // yang menentukan siapa saja yang nanti bisa masuk ruang kelas.
    const peserta = [
      { nama: p.namaDiri || p.nama, email: p.emailDiri },
      { nama: p.p2Nama, email: p.p2Email },
      { nama: p.p3Nama, email: p.p3Email },
    ].filter((x) => x.email);

    kartu.innerHTML =
      '<div class="admin-pendaftar-head">' +
      '<h3>' + (p.nama || '(tanpa nama)') + '</h3>' +
      '<span class="admin-pendaftar-paket">' + (p.paket || '-') + '</span>' +
      '</div>' +
      '<div class="admin-pendaftar-grid">' +
      barisInfo('Fakultas', p.fakultas) +
      barisInfo('No. HP', p.telepon) +
      barisInfo('ID Line', p.idLine) +
      barisInfo('Masuk', p.timestamp) +
      '</div>' +
      '<div class="admin-pendaftar-peserta">' +
      '<span class="admin-pendaftar-subjudul">Email yang akan dapat akses</span>' +
      peserta
        .map((x) => '<div><strong>' + (x.nama || '-') + '</strong> ' + x.email + '</div>')
        .join('') +
      '</div>' +
      '<div class="admin-pendaftar-bukti-baris">' +
      (linkBukti('Bukti bayar', p.buktiBayar) || '<span class="admin-pendaftar-nobukti">Tidak ada bukti bayar</span>') +
      linkBukti('Broadcast', p.buktiBroadcast) +
      linkBukti('Instagram', p.buktiInstagram) +
      '</div>' +
      '<div class="admin-pendaftar-aksi">' +
      '<button type="button" class="admin-btn admin-btn-primary" data-aksi="setujui">Setujui &amp; Beri Akses</button>' +
      '<button type="button" class="admin-pendaftar-tolak" data-aksi="tolak">Tolak</button>' +
      '<span class="admin-pendaftar-status"></span>' +
      '</div>';

    kartu.querySelectorAll('[data-aksi]').forEach((btn) => {
      btn.addEventListener('click', () => prosesPendaftar(kartu, p, btn.dataset.aksi));
    });

    list.appendChild(kartu);
  });
}

async function muatPendaftar() {
  const btn = document.getElementById('admin-pendaftar-refresh');
  btn.disabled = true;
  pendaftarStatus('Memuat…');

  try {
    const res = await fetch('/api/admin-pendaftar', { headers: authHeaders() });
    const data = await res.json();

    if (res.status === 401) {
      handleUnauthorized(data.reason);
      return;
    }
    if (!res.ok || !data.ok) {
      pendaftarStatus('Gagal memuat: ' + (data.pesan || data.reason || res.status), 'error');
      return;
    }
    semuaPendaftar = data.pendaftar || [];
    // Lewat terapkanFilter, bukan renderPendaftar langsung, supaya kata
    // kunci yang sedang diketik tetap berlaku setelah Muat Ulang.
    terapkanFilter();
  } catch (err) {
    pendaftarStatus('Gagal memuat: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function prosesPendaftar(kartu, p, aksi) {
  // Menyetujui berarti membuka akses ke seluruh materi kelas berbayar, dan
  // menolak berarti menghapus barisnya. Dua-duanya tidak bisa dibatalkan
  // dari sini, jadi dikonfirmasi dulu.
  const nama = p.nama || 'pendaftar ini';
  const pesan =
    aksi === 'setujui'
      ? 'Setujui ' + nama + '? Semua email di kartu ini langsung bisa masuk ruang kelas.'
      : 'Tolak dan hapus pendaftaran ' + nama + '? Datanya hilang dari daftar ini.';
  if (!window.confirm(pesan)) return;

  const tombol = kartu.querySelectorAll('[data-aksi]');
  const status = kartu.querySelector('.admin-pendaftar-status');
  tombol.forEach((b) => (b.disabled = true));
  status.removeAttribute('data-state');
  status.textContent = 'Memproses…';

  try {
    const res = await fetch('/api/admin-pendaftar', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ id: p.id, aksi }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      status.dataset.state = 'ok';
      status.textContent = aksi === 'setujui' ? 'Disetujui.' : 'Ditolak.';
      // Kartunya dibuang dari layar supaya daftar yang tersisa persis sama
      // dengan isi tab Pendaftar Web (barisnya sudah tidak ada di sana).
      // Dibuang juga dari daftar di memori, bukan cuma dari layar. Kalau
      // cuma kartunya yang dihapus, baris ini muncul lagi begitu kata
      // kunci pencarian diubah, padahal di spreadsheet sudah tidak ada.
      semuaPendaftar = semuaPendaftar.filter(function (x) {
        return x.id !== p.id;
      });
      setTimeout(() => {
        kartu.remove();
        perbaruiJumlah(
          document.querySelectorAll('.admin-pendaftar').length,
          semuaPendaftar.length
        );
        if (document.querySelectorAll('.admin-pendaftar').length === 0) {
          pendaftarStatus(
            semuaPendaftar.length === 0
              ? 'Belum ada pendaftar baru yang menunggu persetujuan.'
              : 'Tidak ada yang cocok dengan pencarian kamu.'
          );
        }
      }, 900);
      return;
    }

    if (res.status === 401) {
      handleUnauthorized(data.reason);
      return;
    }
    status.dataset.state = 'error';
    status.textContent = 'Gagal: ' + (data.pesan || data.reason || res.status);
    tombol.forEach((b) => (b.disabled = false));
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal: ' + err.message;
    tombol.forEach((b) => (b.disabled = false));
  }
}

// ============================================================
// PENCARIAN & PENYARINGAN
// ============================================================

function terapkanFilter() {
  var kotak = document.getElementById('admin-pendaftar-cari');
  var kata = (kotak.value || '').trim().toLowerCase();

  if (!kata) {
    renderPendaftar(semuaPendaftar);
    perbaruiJumlah(semuaPendaftar.length, semuaPendaftar.length);
    return;
  }

  // Dicocokkan ke seluruh isi baris (nama, email semua peserta, fakultas,
  // paket, tanggal) supaya satu kotak cukup, tidak perlu memilih mau cari
  // berdasarkan apa.
  var hasil = semuaPendaftar.filter(function (p) {
    return Object.keys(p)
      .map(function (k) {
        return p[k];
      })
      .join(' ')
      .toLowerCase()
      .indexOf(kata) !== -1;
  });

  renderPendaftar(hasil);
  perbaruiJumlah(hasil.length, semuaPendaftar.length);
}

function perbaruiJumlah(tampil, total) {
  var el = document.getElementById('admin-pendaftar-jumlah');
  if (!el) return;
  if (total === 0) {
    el.textContent = '';
  } else if (tampil === total) {
    el.textContent = total + ' menunggu';
  } else {
    el.textContent = tampil + ' dari ' + total;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('admin-pendaftar-refresh').addEventListener('click', muatPendaftar);
  document.getElementById('admin-pendaftar-cari').addEventListener('input', terapkanFilter);
});
