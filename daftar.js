/**
 * Formulir pendaftaran di /daftar.
 *
 * Foto dikompres di browser SEBELUM dikirim (canvas), pola yang sama
 * dengan upload foto di /admin. Ini bukan sekadar optimasi: Vercel
 * membatasi ukuran body request 4,5 MB, sementara foto bukti transfer
 * dari HP zaman sekarang gampang 3-5 MB PER FILE, dan form ini mengirim
 * tiga sekaligus. Tanpa kompresi, pendaftaran dari HP akan gagal terus
 * tanpa sebab yang jelas bagi pendaftarnya.
 */

var terkompres = {
  buktiBayar: '',
  buktiBroadcast: '',
  buktiInstagram: '',
};

// Bukti transfer harus tetap terbaca (nominal, nama, waktu), jadi
// resolusinya tidak dipangkas seagresif foto profil. 1400px sisi
// terpanjang sudah cukup buat membaca struk dari HP mana pun.
var SPEC_BUKTI = { maks: 1400, tipe: 'image/webp', kualitas: 0.82 };

function el(id) {
  return document.getElementById(id);
}

function bacaGambar(file) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error('File itu sepertinya bukan gambar'));
    };
    img.src = URL.createObjectURL(file);
  });
}

async function kompres(file) {
  var img = await bacaGambar(file);
  var skala = Math.min(SPEC_BUKTI.maks / Math.max(img.width, img.height), 1);
  var canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * skala);
  canvas.height = Math.round(img.height * skala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  var blob = await new Promise(function (resolve, reject) {
    canvas.toBlob(
      function (b) {
        b ? resolve(b) : reject(new Error('Gagal memproses gambar'));
      },
      SPEC_BUKTI.tipe,
      SPEC_BUKTI.kualitas
    );
  });

  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function setStatusUpload(kotak, state, teks) {
  var s = kotak.querySelector('.daftar-upload-status');
  s.textContent = teks;
  if (state) s.dataset.state = state;
  else s.removeAttribute('data-state');
}

async function tanganiUpload(kotak, file) {
  var slot = kotak.dataset.upload;
  var input = kotak.querySelector('input[type="file"]');
  input.disabled = true;
  setStatusUpload(kotak, null, 'Memproses…');

  try {
    var dataUrl = await kompres(file);
    terkompres[slot] = dataUrl;

    var pratinjau = kotak.querySelector('.daftar-upload-preview');
    pratinjau.src = dataUrl;
    pratinjau.hidden = false;

    var kb = Math.round((dataUrl.length * 0.75) / 1024);
    setStatusUpload(kotak, 'ok', 'Siap dikirim (' + kb + ' KB)');
  } catch (err) {
    terkompres[slot] = '';
    setStatusUpload(kotak, 'error', err.message);
  } finally {
    input.disabled = false;
  }
}

// Kolom Peserta 2 & 3 cuma muncul sesuai paket yang dipilih. Field yang
// tersembunyi juga DIKOSONGKAN, supaya orang yang tadinya pilih Group
// lalu ganti ke Individual tidak diam-diam ikut mengirim data teman yang
// sudah terlanjur diketik.
function perbaruiPaket() {
  var dipilih = document.querySelector('input[name="paket"]:checked');
  var paket = dipilih ? dipilih.value : '';
  var butuhTeman = paket === 'Pair (2 students)' || paket === 'Group (3 students)';
  var butuhTiga = paket === 'Group (3 students)';

  el('daftar-teman').hidden = !butuhTeman;
  el('daftar-person-3').hidden = !butuhTiga;

  if (!butuhTeman) kosongkan(['p2Nama', 'p2Telepon', 'p2Email']);
  if (!butuhTiga) kosongkan(['p3Nama', 'p3Telepon', 'p3Email']);
}

function kosongkan(namaField) {
  namaField.forEach(function (n) {
    var input = document.querySelector('[name="' + n + '"]');
    if (input) {
      input.value = '';
      input.removeAttribute('aria-invalid');
    }
  });
}

function emailSah(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function nilai(n) {
  var input = document.querySelector('[name="' + n + '"]');
  return input ? input.value.trim() : '';
}

function tandaiSalah(n, salah) {
  var input = document.querySelector('[name="' + n + '"]');
  if (!input) return;
  if (salah) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function validasi() {
  var kurang = [];
  var dipilih = document.querySelector('input[name="paket"]:checked');
  var paket = dipilih ? dipilih.value : '';

  [
    { n: 'nama', label: 'nama lengkap' },
    { n: 'fakultas', label: 'fakultas' },
    { n: 'telepon', label: 'nomor HP' },
  ].forEach(function (f) {
    var kosong = !nilai(f.n);
    tandaiSalah(f.n, kosong);
    if (kosong) kurang.push(f.label);
  });

  var emailSalah = !emailSah(nilai('emailDiri'));
  tandaiSalah('emailDiri', emailSalah);
  if (emailSalah) kurang.push('email yang benar');

  if (!paket) kurang.push('pilihan paket');

  if (paket === 'Pair (2 students)' || paket === 'Group (3 students)') {
    var n2 = !nilai('p2Nama');
    var e2 = !emailSah(nilai('p2Email'));
    tandaiSalah('p2Nama', n2);
    tandaiSalah('p2Email', e2);
    if (n2) kurang.push('nama peserta 2');
    if (e2) kurang.push('email peserta 2');
  }
  if (paket === 'Group (3 students)') {
    var n3 = !nilai('p3Nama');
    var e3 = !emailSah(nilai('p3Email'));
    tandaiSalah('p3Nama', n3);
    tandaiSalah('p3Email', e3);
    if (n3) kurang.push('nama peserta 3');
    if (e3) kurang.push('email peserta 3');
  }

  if (!terkompres.buktiBayar) kurang.push('bukti pembayaran');

  return kurang;
}

function tampilkanError(pesan) {
  var box = el('daftar-error');
  box.textContent = pesan;
  box.hidden = false;
  box.scrollIntoView({ block: 'center' });
}

async function kirim(e) {
  e.preventDefault();
  var tombol = el('daftar-submit');
  el('daftar-error').hidden = true;

  var kurang = validasi();
  if (kurang.length > 0) {
    tampilkanError('Masih ada yang belum diisi: ' + kurang.join(', ') + '.');
    return;
  }

  tombol.disabled = true;
  tombol.textContent = 'Mengirim…';

  var dipilih = document.querySelector('input[name="paket"]:checked');
  var payload = {
    nama: nilai('nama'),
    fakultas: nilai('fakultas'),
    telepon: nilai('telepon'),
    idLine: nilai('idLine'),
    paket: dipilih ? dipilih.value : '',
    namaDiri: nilai('nama'),
    teleponDiri: nilai('telepon'),
    emailDiri: nilai('emailDiri'),
    p2Nama: nilai('p2Nama'),
    p2Telepon: nilai('p2Telepon'),
    p2Email: nilai('p2Email'),
    p3Nama: nilai('p3Nama'),
    p3Telepon: nilai('p3Telepon'),
    p3Email: nilai('p3Email'),
    website: nilai('website'),
    buktiBayar: terkompres.buktiBayar,
    buktiBroadcast: terkompres.buktiBroadcast,
    buktiInstagram: terkompres.buktiInstagram,
  };

  try {
    var res = await fetch('/api/daftar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      el('daftar-form-panel').hidden = true;
      el('daftar-sukses').hidden = false;
      window.scrollTo(0, 0);
      return;
    }

    tampilkanError(data.pesan || 'Pendaftaran gagal terkirim. Coba lagi sebentar lagi.');
  } catch (err) {
    tampilkanError(
      'Tidak bisa menghubungi server. Cek koneksi internet kamu, lalu coba lagi.'
    );
  } finally {
    tombol.disabled = false;
    tombol.textContent = 'Kirim Pendaftaran';
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('input[name="paket"]').forEach(function (r) {
    r.addEventListener('change', perbaruiPaket);
  });
  perbaruiPaket();

  document.querySelectorAll('.daftar-upload').forEach(function (kotak) {
    var input = kotak.querySelector('input[type="file"]');
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) tanganiUpload(kotak, input.files[0]);
    });
  });

  el('daftar-form').addEventListener('submit', kirim);
});
