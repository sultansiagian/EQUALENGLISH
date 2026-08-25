/**
 * Halaman /status: "pendaftaran saya sudah masuk belum?"
 *
 * Endpointnya MENUMPANG /api/verify-access dengan mode:'status', bukan
 * rute sendiri. Alasannya ditulis lengkap di sana; ringkasnya, Vercel
 * Hobby membatasi 12 Serverless Function dan melampauinya menggagalkan
 * seluruh build tanpa gejala di situs.
 *
 * Halaman ini sengaja tidak menerima email yang diketik. Kalau siapa pun
 * boleh mengetikkan alamat orang lain, halaman ini berubah jadi cara
 * memeriksa siapa saja yang mendaftar di EQUAL. Login Google memastikan
 * yang bertanya memang pemilik alamatnya.
 */

function el(id) {
  return document.getElementById(id);
}

function tampilkanPanel(nama) {
  ['masuk', 'memuat', 'hasil', 'gagal'].forEach(function (p) {
    var n = el('status-' + p);
    if (n) n.hidden = p !== nama;
  });
}

function lacak(nama, data) {
  try {
    window.va =
      window.va ||
      function () {
        (window.vaq = window.vaq || []).push(arguments);
      };
    window.va('event', { name: nama, data: data || {} });
  } catch (err) {
    /* analytics tidak pernah boleh menggagalkan halaman ini */
  }
}

function tombol(label, href, gaya) {
  var a = document.createElement('a');
  a.className = 'button ' + (gaya || 'button-outline');
  a.href = href;
  if (/^https?:/i.test(href)) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.textContent = label;
  return a;
}

/**
 * Tiga keadaan, tiga kalimat yang benar-benar berbeda.
 *
 * Yang paling penting di sini keadaan "tidak_ditemukan". Godaannya
 * menulis "pendaftaran kamu tidak ada", padahal penyebab tersering
 * bukan itu: orangnya masuk pakai akun Google yang berbeda dari email
 * yang dia isi di formulir. Kalimatnya harus menyebut kemungkinan itu
 * DULU, sebelum menyimpulkan yang lebih menakutkan, karena yang membaca
 * layar ini sudah mentransfer uang.
 */
function gambarHasil(data) {
  var kicker = el('status-kicker');
  var judul = el('status-judul');
  var detail = el('status-detail');
  var aksi = el('status-aksi');
  aksi.textContent = '';

  el('status-email').textContent = data.email || '';
  el('status-rincian').hidden = false;

  if (data.paket) {
    el('status-paket').textContent = data.paket;
    el('status-paket-baris').hidden = false;
  } else {
    el('status-paket-baris').hidden = true;
  }

  if (data.status === 'disetujui') {
    kicker.textContent = 'SUDAH DISETUJUI';
    judul.textContent = 'Akses kamu sudah dibuka.';
    detail.textContent =
      'Pembayaran kamu sudah dikonfirmasi dan kamu sudah terdaftar di ruang ' +
      'kelas. Masuk pakai akun Google yang sama seperti sekarang.';
    if (data.linkRuangKelas) {
      aksi.appendChild(tombol('Buka Ruang Kelas', data.linkRuangKelas, 'button-dark'));
    }
    aksi.appendChild(tombol('Kembali ke beranda', '/'));
    return;
  }

  if (data.status === 'menunggu') {
    kicker.textContent = 'SEDANG DIPERIKSA';
    judul.textContent = 'Pendaftaran kamu sudah masuk.';
    detail.textContent =
      'Datanya sudah kami terima dan bukti pembayarannya sedang dicek. Kalau ' +
      'sudah dikonfirmasi, akses ruang kelas terbuka sendiri dan kamu dapat ' +
      'email pemberitahuan. Biasanya tidak sampai sehari.';
    aksi.appendChild(
      tombol('Tanya lewat WhatsApp', 'https://wa.me/6285888345058', 'button-dark')
    );
    aksi.appendChild(tombol('Kembali ke beranda', '/'));
    return;
  }

  kicker.textContent = 'BELUM KETEMU';
  judul.textContent = 'Belum ada pendaftaran atas email ini.';
  detail.textContent =
    'Admin belum memberikan akses kepadamu, karena ada beberapa prosedur yang ' +
    'harus dilakukan sebelum itu. Pastikan pembayaranmu sudah berhasil. Apabila ' +
    'sudah menunggu cukup lama, hubungi kami via WhatsApp.';
  aksi.appendChild(
    tombol('Tanya lewat WhatsApp', 'https://wa.me/6285888345058', 'button-dark')
  );
  aksi.appendChild(tombol('Buka formulir pendaftaran', '/daftar'));
}

function gagal(pesan) {
  el('status-gagal-detail').textContent = pesan;
  tampilkanPanel('gagal');
}

async function handleCredentialResponse(response) {
  tampilkanPanel('memuat');
  lacak('status_cek_mulai');

  try {
    var res = await fetch('/api/verify-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential, mode: 'status' }),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      gambarHasil(data);
      tampilkanPanel('hasil');
      lacak('status_cek_selesai', { status: data.status });
      return;
    }

    lacak('status_cek_gagal', { reason: data.reason || String(res.status) });

    if (res.status === 429) {
      return gagal(
        data.pesan || 'Terlalu banyak pengecekan dari jaringan ini. Tunggu beberapa menit.'
      );
    }
    if (data.reason === 'antrean_tidak_terbaca') {
      // Dibedakan dari kegagalan lain, karena artinya beda buat orangnya:
      // pendaftarannya kemungkinan besar aman, yang bermasalah sambungan
      // ke spreadsheet. Menyamakannya dengan error umum akan membuat orang
      // mengira datanya hilang.
      return gagal(
        'Data pendaftaran sedang tidak bisa dibaca dari sisi kami. Ini masalah ' +
          'di sistem, bukan di pendaftaran kamu. Coba lagi beberapa menit lagi, ' +
          'atau tanya lewat WhatsApp.'
      );
    }
    if (res.status === 401) {
      return gagal(
        'Login Google-nya tidak bisa diverifikasi. Coba muat ulang halaman ini ' +
          'lalu masuk sekali lagi.'
      );
    }
    gagal('Statusnya belum bisa dibaca sekarang. Coba lagi sebentar lagi.');
  } catch (err) {
    lacak('status_cek_gagal', { reason: 'jaringan' });
    gagal('Tidak bisa menghubungi server. Cek koneksi internet kamu, lalu coba lagi.');
  }
}

// Dipanggil pustaka Google Sign-In lewat nama, jadi harus menempel di
// window dan namanya harus sama persis dengan data-callback di HTML.
window.handleCredentialResponse = handleCredentialResponse;
