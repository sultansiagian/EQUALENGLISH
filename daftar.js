/**
 * Formulir pendaftaran di /daftar.
 *
 * Pertanyaannya TIDAK ditulis di daftar.html, melainkan digambar di sini
 * dari susunan yang dikirim /api/daftar-schema. Pemilik situs bisa
 * menambah, menghapus, memindah, dan mengganti kalimat pertanyaan kapan
 * saja lewat /admin, jadi form ini harus mengikuti apa pun yang sedang
 * berlaku, bukan susunan yang dipaku waktu file ini ditulis.
 *
 * Foto dikompres di browser SEBELUM dikirim (canvas). Ini bukan sekadar
 * optimasi: Vercel membatasi ukuran body request 4,5 MB, sementara foto
 * bukti transfer dari HP zaman sekarang gampang 3-5 MB PER FILE. Tanpa
 * kompresi, pendaftaran dari HP akan gagal terus tanpa sebab yang jelas
 * bagi pendaftarnya.
 */

var skema = null; // { judul, deskripsi, fields, pilihanPaket }
var unggahan = {}; // { idField: dataUrl hasil kompresi }

// Bukti transfer harus tetap terbaca (nominal, nama, waktu), jadi
// resolusinya tidak dipangkas seagresif foto profil. 1400px sisi
// terpanjang sudah cukup buat membaca struk dari HP mana pun.
var SPEC_UNGGAHAN = { maks: 1400, tipe: 'image/webp', kualitas: 0.82 };

function el(id) {
  return document.getElementById(id);
}

function tampilkanPanel(nama) {
  ['memuat', 'form-panel', 'tutup', 'gagal', 'sukses'].forEach(function (p) {
    var n = el('daftar-' + p);
    if (n) n.hidden = p !== nama;
  });
}

function escapeHtml(t) {
  return String(t === undefined || t === null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// MENGGAMBAR FORM
// ============================================================

function tandaWajib(wajib) {
  return wajib ? ' <em>*</em>' : '';
}

function bantuanHtml(teks) {
  return teks ? '<small>' + escapeHtml(teks) + '</small>' : '';
}

function gambarField(f) {
  var wrap = document.createElement('div');
  var label = escapeHtml(f.label);

  if (f.tipe === 'paket') {
    wrap.className = 'daftar-group daftar-group-paket';
    wrap.innerHTML =
      '<span class="daftar-legend">' + label + tandaWajib(f.wajib) + '</span>' +
      bantuanHtml(f.bantuan) +
      '<div class="daftar-plans">' +
      skema.pilihanPaket
        .map(function (p) {
          // Nilai yang dikirim adalah ID slotnya ("pair"), bukan teks yang
          // terbaca. Nama paket bisa diganti admin kapan saja, sedangkan
          // id-nya tetap, jadi arti pilihannya tidak ikut berubah waktu
          // namanya diganti. Server yang menerjemahkan id itu jadi teks
          // baku yang ditulis ke spreadsheet.
          return (
            '<label class="daftar-plan">' +
            '<input type="radio" name="paket" value="' + escapeHtml(p.id) + '" />' +
            '<span class="daftar-plan-box"><strong>' + escapeHtml(p.nama) + '</strong>' +
            '<small>' + escapeHtml(p.jumlah) + '</small></span>' +
            '</label>'
          );
        })
        .join('') +
      '</div>';
    return wrap;
  }

  if (f.tipe === 'peserta') {
    wrap.className = 'daftar-group';
    wrap.id = 'daftar-teman';
    wrap.hidden = true;
    wrap.innerHTML =
      '<span class="daftar-legend">' + label + '</span>' +
      bantuanHtml(f.bantuan) +
      [2, 3]
        .map(function (n) {
          return (
            '<div class="daftar-person" id="daftar-person-' + n + '"' + (n === 3 ? ' hidden' : '') + '>' +
            '<h3>Peserta ' + n + '</h3>' +
            '<label class="daftar-field"><span>Nama <em>*</em></span>' +
            '<input type="text" name="p' + n + 'Nama" /></label>' +
            '<div class="daftar-row">' +
            '<label class="daftar-field"><span>Nomor HP</span>' +
            '<input type="tel" name="p' + n + 'Telepon" /></label>' +
            '<label class="daftar-field"><span>Email <em>*</em></span>' +
            '<input type="email" name="p' + n + 'Email" /></label>' +
            '</div></div>'
          );
        })
        .join('');
    return wrap;
  }

  if (f.tipe === 'upload') {
    wrap.className = 'daftar-upload';
    wrap.dataset.upload = f.id;
    wrap.innerHTML =
      '<span class="daftar-upload-label">' + label + tandaWajib(f.wajib) + '</span>' +
      bantuanHtml(f.bantuan) +
      '<input type="file" accept="image/*" />' +
      '<img class="daftar-upload-preview" alt="" hidden />' +
      '<span class="daftar-upload-status"></span>';
    return wrap;
  }

  if (f.tipe === 'pilihan') {
    wrap.className = 'daftar-field';
    wrap.innerHTML =
      '<span>' + label + tandaWajib(f.wajib) + '</span>' +
      '<select name="' + escapeHtml(f.id) + '">' +
      '<option value="">Pilih…</option>' +
      (f.pilihan || [])
        .map(function (p) {
          return '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>';
        })
        .join('') +
      '</select>' +
      bantuanHtml(f.bantuan);
    return wrap;
  }

  if (f.tipe === 'teksPanjang') {
    wrap.className = 'daftar-field';
    wrap.innerHTML =
      '<span>' + label + tandaWajib(f.wajib) + '</span>' +
      '<textarea name="' + escapeHtml(f.id) + '" rows="3"></textarea>' +
      bantuanHtml(f.bantuan);
    return wrap;
  }

  // teks / email / telepon
  var tipeInput = f.tipe === 'email' ? 'email' : f.tipe === 'telepon' ? 'tel' : 'text';
  var autocomplete =
    f.tipe === 'email' ? 'email' : f.tipe === 'telepon' ? 'tel' : f.id === 'nama' ? 'name' : 'off';
  wrap.className = 'daftar-field';
  wrap.innerHTML =
    '<span>' + label + tandaWajib(f.wajib) + '</span>' +
    '<input type="' + tipeInput + '" name="' + escapeHtml(f.id) + '" autocomplete="' + autocomplete + '" />' +
    bantuanHtml(f.bantuan);
  return wrap;
}

function gambarForm() {
  el('daftar-judul').textContent = skema.judul;
  el('daftar-deskripsi').textContent = skema.deskripsi;

  var wadah = el('daftar-pertanyaan');
  wadah.textContent = '';

  // Field teks berurutan dikelompokkan ke satu kotak supaya tidak jadi
  // deretan kotak tipis satu-satu. Field yang punya bingkai sendiri
  // (paket, peserta, upload) memutus kelompok itu.
  var grup = null;
  skema.fields.forEach(function (f) {
    var berdiriSendiri = f.tipe === 'paket' || f.tipe === 'peserta' || f.tipe === 'upload';
    if (berdiriSendiri) {
      grup = null;
      wadah.appendChild(gambarField(f));
      return;
    }
    if (!grup) {
      grup = document.createElement('div');
      grup.className = 'daftar-group';
      wadah.appendChild(grup);
    }
    grup.appendChild(gambarField(f));
  });

  document.querySelectorAll('input[name="paket"]').forEach(function (r) {
    r.addEventListener('change', perbaruiPaket);
  });
  document.querySelectorAll('.daftar-upload').forEach(function (kotak) {
    var input = kotak.querySelector('input[type="file"]');
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) tanganiUpload(kotak, input.files[0]);
    });
  });

  perbaruiPaket();
}

// ============================================================
// PAKET -> munculkan isian peserta
// ============================================================

function perbaruiPaket() {
  var blok = el('daftar-teman');
  if (!blok) return;

  var dipilih = document.querySelector('input[name="paket"]:checked');
  var paket = dipilih ? dipilih.value : '';
  var butuhTeman = /pair|group/i.test(paket);
  var butuhTiga = /group/i.test(paket);

  blok.hidden = !butuhTeman;
  var p3 = el('daftar-person-3');
  if (p3) p3.hidden = !butuhTiga;

  // Field yang tersembunyi juga DIKOSONGKAN, supaya orang yang tadinya
  // pilih Group lalu ganti ke Individual tidak diam-diam ikut mengirim
  // data teman yang sudah terlanjur diketik.
  if (!butuhTeman) kosongkan(['p2Nama', 'p2Telepon', 'p2Email']);
  if (!butuhTiga) kosongkan(['p3Nama', 'p3Telepon', 'p3Email']);
}

function kosongkan(nama) {
  nama.forEach(function (n) {
    var input = document.querySelector('[name="' + n + '"]');
    if (input) {
      input.value = '';
      input.removeAttribute('aria-invalid');
    }
  });
}

// ============================================================
// UNGGAHAN
// ============================================================

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
  var skala = Math.min(SPEC_UNGGAHAN.maks / Math.max(img.width, img.height), 1);
  var canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * skala);
  canvas.height = Math.round(img.height * skala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

  var blob = await new Promise(function (resolve, reject) {
    canvas.toBlob(
      function (b) {
        b ? resolve(b) : reject(new Error('Gagal memproses gambar'));
      },
      SPEC_UNGGAHAN.tipe,
      SPEC_UNGGAHAN.kualitas
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
  var id = kotak.dataset.upload;
  var input = kotak.querySelector('input[type="file"]');
  input.disabled = true;
  setStatusUpload(kotak, null, 'Memproses…');

  try {
    var dataUrl = await kompres(file);
    unggahan[id] = dataUrl;

    var pratinjau = kotak.querySelector('.daftar-upload-preview');
    pratinjau.src = dataUrl;
    pratinjau.hidden = false;

    setStatusUpload(kotak, 'ok', 'Siap dikirim (' + Math.round((dataUrl.length * 0.75) / 1024) + ' KB)');
  } catch (err) {
    unggahan[id] = '';
    setStatusUpload(kotak, 'error', err.message);
  } finally {
    input.disabled = false;
  }
}

// ============================================================
// ANALYTICS
// ============================================================

/**
 * Pageview sudah dicatat skrip Vercel di daftar.html. Yang ditambah di
 * sini kejadian di DALAM halaman, karena selisih antara "membuka
 * formulir" dan "mengirimnya" itulah angka yang paling berguna, dan
 * pageview saja tidak bisa menunjukkannya.
 *
 * Shim window.va di bawah adalah cara resmi memanggil custom event tanpa
 * bundler: panggilan ditumpuk di antrean sampai skripnya selesai dimuat.
 * Catatan: custom event butuh paket Vercel berbayar. Di paket Hobby,
 * panggilan ini aman-aman saja, cuma tidak muncul di dashboard.
 *
 * Dibungkus try/catch karena analytics TIDAK PERNAH boleh jadi alasan
 * sebuah formulir pendaftaran gagal jalan.
 */
function lacak(nama, data) {
  try {
    window.va =
      window.va ||
      function () {
        (window.vaq = window.vaq || []).push(arguments);
      };
    window.va('event', { name: nama, data: data || {} });
  } catch (err) {
    /* diam saja, memang tidak penting */
  }
}

// ============================================================
// DRAF: menyimpan isian yang belum selesai
// ============================================================

/**
 * Formulir ini panjang. Pada paket Group, satu orang mengisi datanya
 * sendiri, data tiga teman, lalu mengunggah tiga foto. Sebagian besar
 * mengerjakannya di HP, dan HP membuang tab di latar belakang begitu
 * memorinya sempit. Sebelum ini, satu telepon masuk cukup untuk
 * menghapus semuanya tanpa jejak.
 *
 * FOTO SENGAJA TIDAK IKUT DISIMPAN. Satu bukti transfer hasil kompresi
 * masih ratusan KB, dan localStorage cuma sekitar 5 MB untuk seluruh
 * domain. Menyimpan tiga foto berisiko membuat penyimpanan penuh, dan
 * waktu itu terjadi, yang gagal tersimpan justru jawaban teksnya juga.
 * Jadi teksnya saja yang disimpan, dan pemakainya diberi tahu dengan
 * jelas bahwa fotonya perlu diunggah ulang.
 */
var KUNCI_DRAF = 'equal:draf-daftar';

// Lebih tua dari sehari, isinya kemungkinan besar sudah tidak relevan
// (harga bisa berubah, batch bisa berganti), dan menawarkannya malah
// membingungkan.
var UMUR_DRAF_MS = 24 * 60 * 60 * 1000;

var jedaSimpan = null;
var sudahLacakMulai = false;

// Dinyalakan sekali saja, setelah pendaftaran benar-benar terkirim.
// Sesudah titik itu tidak ada lagi isian yang layak disimpan, dan
// menyimpannya justru berbahaya: draf yang bangkit lagi akan menawarkan
// "lanjutkan isian" untuk pendaftaran yang sudah selesai, dan sebagian
// orang akan menurutinya lalu mendaftar dua kali.
var drafDimatikan = false;

function kumpulkanDraf() {
  var data = {};
  document.querySelectorAll('#daftar-form [name]').forEach(function (input) {
    // Perangkap bot tidak pernah ikut disimpan. Kalau ikut, isian
    // kosongnya akan dipulihkan sebagai string kosong, yang tidak
    // berbahaya, tapi menyimpan nilai perangkap ke penyimpanan pemakai
    // itu tetap tidak ada gunanya.
    if (input.name === 'website') return;
    if (input.type === 'file') return;
    if (input.type === 'radio') {
      if (input.checked) data[input.name] = input.value;
      return;
    }
    if (String(input.value || '').trim()) data[input.name] = input.value;
  });
  return data;
}

function simpanDraf() {
  if (drafDimatikan) return;
  try {
    var jawaban = kumpulkanDraf();
    // Form yang dikosongkan lagi berarti draf lamanya sudah tidak
    // diinginkan. Menyimpan objek kosong akan memunculkan tawaran
    // "lanjutkan" yang isinya tidak ada apa-apa.
    if (Object.keys(jawaban).length === 0) {
      hapusDraf();
      return;
    }
    localStorage.setItem(KUNCI_DRAF, JSON.stringify({ waktu: Date.now(), jawaban: jawaban }));
  } catch (err) {
    // Mode penyamaran, penyimpanan penuh, atau localStorage dimatikan.
    // Draf memang jadi tidak tersimpan, dan itu tidak boleh menghentikan
    // apa pun. Formulirnya tetap bisa diisi dan dikirim seperti biasa.
  }
}

function hapusDraf() {
  // Simpanan yang masih menunggu jedanya DIBATALKAN lebih dulu, dan
  // urutan ini bukan formalitas.
  //
  // Pola paling lumrah di formulir ini: mengetik isian terakhir, lalu
  // langsung menekan Kirim. Ketikan itu menjadwalkan simpanan 400 ms ke
  // depan; pengirimannya selesai lebih cepat, drafnya dihapus, dan
  // jadwal tadi baru jalan sesudahnya lalu MENULIS ULANG draf yang baru
  // saja dihapus dari isian yang masih terpampang di layar. Akibatnya
  // pendaftar yang sudah selesai tetap ditawari "lanjutkan isian" waktu
  // membuka /daftar lagi.
  clearTimeout(jedaSimpan);
  try {
    localStorage.removeItem(KUNCI_DRAF);
  } catch (err) {
    /* lihat alasan di simpanDraf */
  }
}

/**
 * Dipakai setelah pendaftaran terkirim. Beda dari hapusDraf biasa: ini
 * juga menutup pintunya, supaya pendengar visibilitychange dan pagehide
 * yang masih terpasang tidak menyimpan apa pun waktu pemakainya menutup
 * tab dari layar "Pendaftaran kamu masuk".
 */
function matikanDraf() {
  drafDimatikan = true;
  hapusDraf();
}

function bacaDraf() {
  try {
    var mentah = localStorage.getItem(KUNCI_DRAF);
    if (!mentah) return null;
    var draf = JSON.parse(mentah);
    if (!draf || !draf.jawaban || typeof draf.jawaban !== 'object') return null;
    if (!draf.waktu || Date.now() - draf.waktu > UMUR_DRAF_MS) {
      hapusDraf();
      return null;
    }
    if (Object.keys(draf.jawaban).length === 0) {
      hapusDraf();
      return null;
    }
    return draf;
  } catch (err) {
    // Isi yang rusak (mis. sisa versi lama) tidak boleh membuat formulir
    // gagal dimuat. Dibuang diam-diam, lalu lanjut seperti tidak ada draf.
    hapusDraf();
    return null;
  }
}

/**
 * Nilai dipasang dengan MENELUSURI elemen yang ada, bukan dengan mencari
 * lewat selector yang memuat nilainya. Nilai draf datang dari isian yang
 * diketik orang, dan menyusunnya jadi selector akan pecah begitu ada
 * tanda kutip di dalamnya.
 *
 * Kunci draf yang tidak punya pasangan elemen (mis. pertanyaan yang
 * dihapus admin sejak draf dibuat) diabaikan sendirinya, karena yang
 * ditelusuri adalah elemennya, bukan kuncinya.
 */
function terapkanDraf(draf) {
  document.querySelectorAll('#daftar-form [name]').forEach(function (input) {
    if (input.type === 'file') return;
    var nilaiDraf = draf.jawaban[input.name];
    if (nilaiDraf === undefined) return;
    if (input.type === 'radio') {
      input.checked = input.value === nilaiDraf;
      return;
    }
    input.value = nilaiDraf;
  });

  // Wajib dipanggil setelah nilai terpasang: blok data teman muncul atau
  // tersembunyi mengikuti paket yang barusan dipulihkan. Kalau paketnya
  // ternyata Individual, fungsi ini juga yang membersihkan data teman
  // yang mungkin tertinggal di draf.
  perbaruiPaket();
}

function usiaTeks(waktu) {
  var menit = Math.round((Date.now() - waktu) / 60000);
  if (menit < 1) return 'Disimpan barusan';
  if (menit < 60) return 'Disimpan ' + menit + ' menit lalu';
  var jam = Math.round(menit / 60);
  if (jam < 24) return 'Disimpan ' + jam + ' jam lalu';
  return 'Disimpan kemarin';
}

function tawarkanDraf() {
  var draf = bacaDraf();
  if (!draf) return;

  var kotak = el('daftar-draf');
  if (!kotak) return;

  el('daftar-draf-usia').textContent = usiaTeks(draf.waktu);
  kotak.hidden = false;
  lacak('daftar_draf_ditawarkan');

  el('daftar-draf-lanjut').addEventListener('click', function () {
    terapkanDraf(draf);
    kotak.hidden = true;
    lacak('daftar_draf_dilanjutkan');
  });

  el('daftar-draf-baru').addEventListener('click', function () {
    hapusDraf();
    kotak.hidden = true;
    lacak('daftar_draf_dibuang');
  });
}

function pasangAutosave() {
  var form = el('daftar-form');
  if (!form) return;

  // Didengarkan di form-nya, bukan di tiap isian. Pertanyaan digambar
  // ulang dari skema dan bisa berubah kapan saja, jadi pendengar yang
  // dipasang per elemen akan ketinggalan setiap kali susunannya berubah.
  function tandai() {
    if (!sudahLacakMulai) {
      sudahLacakMulai = true;
      lacak('daftar_mulai_isi');
    }
    // Diberi jeda supaya mengetik satu kalimat tidak berarti puluhan kali
    // menulis ke penyimpanan.
    clearTimeout(jedaSimpan);
    jedaSimpan = setTimeout(simpanDraf, 400);
  }

  form.addEventListener('input', tandai);
  form.addEventListener('change', tandai);

  // Inilah yang paling penting di HP. Waktu tab ditinggalkan, sistem
  // boleh membuangnya kapan saja tanpa memberi kesempatan apa pun
  // sesudahnya, jadi jeda 400 ms di atas tidak boleh ditunggu di sini.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      clearTimeout(jedaSimpan);
      simpanDraf();
    }
  });

  // pagehide menangkap yang tidak tertangkap visibilitychange, terutama
  // waktu halaman ditinggalkan lewat tombol back di Safari iOS.
  window.addEventListener('pagehide', function () {
    clearTimeout(jedaSimpan);
    simpanDraf();
  });
}

// ============================================================
// VALIDASI & KIRIM
// ============================================================

function emailSah(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function nilai(n) {
  var input = document.querySelector('[name="' + n + '"]');
  return input ? String(input.value || '').trim() : '';
}

function tandaiSalah(n, salah) {
  var input = document.querySelector('[name="' + n + '"]');
  if (!input) return;
  if (salah) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

// Validasi di browser SELALU diulang di server (api/daftar.js) memakai
// susunan yang sama. Yang di sini cuma supaya pendaftar dapat koreksi
// cepat tanpa menunggu bolak-balik ke server.
function validasi() {
  var kurang = [];
  var dipilih = document.querySelector('input[name="paket"]:checked');
  var paket = dipilih ? dipilih.value : '';

  skema.fields.forEach(function (f) {
    if (f.tipe === 'paket') {
      if (!paket) kurang.push(f.label.toLowerCase());
      return;
    }

    if (f.tipe === 'peserta') {
      if (/pair|group/i.test(paket)) {
        var n2 = !nilai('p2Nama');
        var e2 = !emailSah(nilai('p2Email'));
        tandaiSalah('p2Nama', n2);
        tandaiSalah('p2Email', e2);
        if (n2) kurang.push('nama peserta 2');
        if (e2) kurang.push('email peserta 2');
      }
      if (/group/i.test(paket)) {
        var n3 = !nilai('p3Nama');
        var e3 = !emailSah(nilai('p3Email'));
        tandaiSalah('p3Nama', n3);
        tandaiSalah('p3Email', e3);
        if (n3) kurang.push('nama peserta 3');
        if (e3) kurang.push('email peserta 3');
      }
      return;
    }

    if (f.tipe === 'upload') {
      if (f.wajib && !unggahan[f.id]) kurang.push(f.label.toLowerCase());
      return;
    }

    var v = nilai(f.id);
    if (f.tipe === 'email') {
      var salah = f.wajib ? !emailSah(v) : Boolean(v) && !emailSah(v);
      tandaiSalah(f.id, salah);
      if (salah) kurang.push(f.label.toLowerCase());
      return;
    }

    var kosong = f.wajib && !v;
    tandaiSalah(f.id, kosong);
    if (kosong) kurang.push(f.label.toLowerCase());
  });

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

  var jawaban = {};
  skema.fields.forEach(function (f) {
    if (f.tipe === 'upload') {
      jawaban[f.id] = unggahan[f.id] || '';
    } else if (f.tipe === 'paket') {
      var d = document.querySelector('input[name="paket"]:checked');
      jawaban.paket = d ? d.value : '';
    } else if (f.tipe === 'peserta') {
      ['p2Nama', 'p2Telepon', 'p2Email', 'p3Nama', 'p3Telepon', 'p3Email'].forEach(function (n) {
        jawaban[n] = nilai(n);
      });
    } else {
      jawaban[f.id] = nilai(f.id);
    }
  });

  try {
    var res = await fetch('/api/daftar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jawaban: jawaban, website: nilai('website') }),
    });
    var data = await res.json();

    if (res.ok && data.ok) {
      // Draf dihapus HANYA di sini, setelah server benar-benar
      // mengonfirmasi barisnya tersimpan. Menghapusnya lebih awal (mis.
      // begitu tombol ditekan) berarti isian hilang justru pada saat
      // pengirimannya gagal, yaitu saat draf itu paling dibutuhkan.
      matikanDraf();
      tampilkanPanel('sukses');
      lacak('daftar_terkirim');
      window.scrollTo(0, 0);
      return;
    }
    lacak('daftar_ditolak', { reason: data.reason || 'tidak_diketahui' });
    tampilkanError(data.pesan || 'Pendaftaran gagal terkirim. Coba lagi sebentar lagi.');
  } catch (err) {
    lacak('daftar_gagal_jaringan');
    tampilkanError('Tidak bisa menghubungi server. Cek koneksi internet kamu, lalu coba lagi.');
  } finally {
    tombol.disabled = false;
    tombol.textContent = 'Kirim Pendaftaran';
  }
}

// ============================================================
// MULAI
// ============================================================

async function muatSkema() {
  try {
    var res = await fetch('/api/daftar-schema');
    var data = await res.json();
    if (!res.ok || !data.ok || !Array.isArray(data.fields) || data.fields.length === 0) {
      throw new Error('Susunan formulir tidak terbaca');
    }
    skema = data;

    // Formulir tutup -> jangan digambar sama sekali. Menggambarnya lalu
    // menonaktifkan tombol menyisakan harapan palsu bahwa isian itu masih
    // ada gunanya diisi.
    if (data.status && data.status.terbuka === false) {
      document.getElementById('daftar-tutup-judul').textContent =
        data.status.pesan || 'Pendaftaran sedang ditutup.';
      document.getElementById('daftar-tutup-detail').textContent =
        data.status.pesanTambahan || 'Hubungi kami untuk tahu kapan batch berikutnya dibuka.';
      tampilkanPanel('tutup');
      return;
    }

    gambarForm();

    // Urutannya penting. Autosave dipasang DULU supaya isian apa pun
    // sesudah titik ini ikut tersimpan, lalu draf lama ditawarkan.
    // Dibalik pun tetap jalan, tapi ada celah beberapa milidetik tempat
    // ketikan pertama tidak terekam.
    pasangAutosave();
    tawarkanDraf();
    lacak('daftar_form_tampil');

    // Kalau ada tanggal tutupnya, disebut di pengantar supaya calon
    // pendaftar tahu batasnya dan tidak menunda.
    if (data.status && data.status.tutupPadaTeks) {
      var d = document.getElementById('daftar-deskripsi');
      d.textContent = d.textContent + ' Pendaftaran ditutup ' + data.status.tutupPadaTeks + '.';
    }

    tampilkanPanel('form-panel');
  } catch (err) {
    // Gagal di sini berarti calon pendaftar tidak bisa mendaftar sama
    // sekali, jadi panel gagalnya menyediakan jalan lain (WhatsApp),
    // bukan cuma memberi tahu ada error.
    el('daftar-gagal-detail').textContent =
      'Coba muat ulang halaman ini. Kalau tetap begini, daftar lewat WhatsApp saja ' +
      'supaya tidak tertunda. (' + err.message + ')';
    tampilkanPanel('gagal');
  }
}

document.addEventListener('DOMContentLoaded', function () {
  el('daftar-form').addEventListener('submit', kirim);
  muatSkema();
});
