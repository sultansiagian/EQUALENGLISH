/**
 * Lapisan gerak panel admin: kartu muncul waktu tergulir masuk, angka
 * menghitung naik, tombol punya keadaan sibuk.
 *
 * SENGAJA MEMAKAI ULANG ATURAN CSS BERANDA, bukan menulis yang baru.
 * styles.css sudah punya `.js [data-reveal]` dan `.js [data-reveal-stagger]`
 * lengkap dengan durasi, easing, dan penanganan prefers-reduced-motion-nya,
 * dan halaman admin sudah memuat styles.css untuk token warna/font. Jadi
 * yang perlu ditambah di sini cuma mesin pengamatnya. Hasilnya satu bahasa
 * gerak untuk seluruh situs: kalau ritme di beranda diubah, admin ikut
 * berubah sendiri tanpa ada yang perlu disamakan manual.
 *
 * YANG SENGAJA TIDAK ADA DI SINI: latar bergerak. Pernah dicoba di /admin
 * (SVG 36 path, cuma opacity, dipilih justru karena dianggap murah) dan
 * user melaporkan lag nyata di HP-nya lalu minta dicabut. Penonton situs
 * ini banyak memakai Android kelas menengah ke bawah, dan "harusnya
 * murah" bukan pengganti mencobanya di perangkat asli. Gerak di file ini
 * semuanya menempel pada elemen yang sedang dilihat atau disentuh, jalan
 * sekali, lalu berhenti.
 */

// Memberi tahu fallback di <head> bahwa lapisan reveal aktif, jadi
// .reveal-fallback tidak perlu dipasang. Sama seperti script.js.
window.__equalRevealReady = true;

var kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)');

// Angka yang sama dengan script.js. Kalau salah satunya diubah, ubah
// dua-duanya, kalau tidak beranda dan admin terasa beda ritme.
var LANGKAH_STAGGER = 50;

function tampilkan(elemen, pakaiJeda) {
  elemen.classList.add('is-visible');
  if (!elemen.hasAttribute('data-reveal-stagger')) return;

  Array.prototype.forEach.call(elemen.children, function (anak, urutan) {
    if (!pakaiJeda) {
      anak.classList.add('is-visible');
      return;
    }
    window.setTimeout(function () {
      anak.classList.add('is-visible');
    }, urutan * LANGKAH_STAGGER);
  });
}

function semuaTarget() {
  return document.querySelectorAll('[data-reveal], [data-reveal-stagger]');
}

var pengamat = null;

/**
 * Dipanggil sekali waktu file ini dimuat, DAN lagi tiap kali dashboard
 * ditampilkan.
 *
 * Pemanggilan kedua itu yang penting: seluruh isi panel admin duduk di
 * dalam elemen ber-atribut hidden sampai login berhasil, dan
 * IntersectionObserver tidak pernah melaporkan elemen display:none
 * sebagai terlihat. Tanpa penyegaran setelah login, semua kartu berhenti
 * di opacity 0 dan halamannya terlihat kosong melompong.
 */
function segarkanGerakAdmin() {
  var target = semuaTarget();
  if (target.length === 0) return;

  // Gerak dimatikan: tampilkan semuanya sekaligus, tanpa jeda, tanpa
  // pengamat. Ini bukan versi yang lebih miskin, cuma versi yang tidak
  // bergerak -- isinya persis sama.
  if (kurangiGerak.matches || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(target, function (el) {
      tampilkan(el, false);
    });
    return;
  }

  if (!pengamat) {
    pengamat = new IntersectionObserver(
      function (entri, pengamatIni) {
        entri.forEach(function (e) {
          if (!e.isIntersecting) return;
          tampilkan(e.target, true);
          pengamatIni.unobserve(e.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
  }

  Array.prototype.forEach.call(target, function (el) {
    if (!el.classList.contains('is-visible')) pengamat.observe(el);
  });

  // Jaring pengaman. Kalau karena satu dan lain hal pengamatnya tidak
  // pernah melapor, kartu yang sudah jelas ada di layar tetap ditampilkan
  // daripada dibiarkan tak terlihat selamanya. Halaman ini alat kerja:
  // lebih baik muncul tanpa animasi daripada tidak muncul.
  window.setTimeout(function () {
    Array.prototype.forEach.call(semuaTarget(), function (el) {
      if (el.classList.contains('is-visible')) return;
      var kotak = el.getBoundingClientRect();
      if (kotak.top < window.innerHeight && kotak.bottom > 0) tampilkan(el, false);
    });
  }, 1200);
}
window.segarkanGerakAdmin = segarkanGerakAdmin;

segarkanGerakAdmin();

/* =====================================================================
   ANGKA MENGHITUNG NAIK
   =====================================================================
   Sama seperti angka statistik di beranda. Dipakai untuk angka yang
   BARU MUNCUL sekali setelah data selesai dimuat, bukan untuk angka yang
   sering berubah -- menghitung ulang dari nol tiap kali nilainya
   berganti akan terbaca seperti halaman memuat ulang.

   Formatnya diserahkan ke pemanggil lewat fungsi `format`, supaya aturan
   rupiah dan pemisah ribuan tetap tinggal di file halamannya sendiri dan
   tidak tercecer ke sini. */
function hitungNaik(elemen, nilai, format) {
  if (!elemen) return;
  var tulis = format || String;

  if (kurangiGerak.matches || !nilai || nilai < 0) {
    elemen.textContent = tulis(nilai);
    return;
  }

  var DURASI = 900;
  var mulai = performance.now();
  var sudahSelesai = false;

  function langkah(sekarang) {
    var lewat = Math.min((sekarang - mulai) / DURASI, 1);
    // Melambat di ujung, sama seperti animateCount() di script.js.
    var halus = 1 - Math.pow(1 - lewat, 4);

    if (lewat < 1) {
      elemen.textContent = tulis(Math.round(nilai * halus));
      requestAnimationFrame(langkah);
    } else {
      // Nilai akhir ditulis dari angka aslinya, bukan dari hasil
      // perkalian pecahan, supaya tidak pernah meleset satu rupiah.
      elemen.textContent = tulis(nilai);
      sudahSelesai = true;
    }
  }

  requestAnimationFrame(langkah);

  /* Jaring pengaman, dan ini BUKAN teoretis.
   *
   * requestAnimationFrame tidak jalan sama sekali selama tab-nya ada di
   * latar belakang. Kalau /analitik dibuka di tab yang tidak aktif,
   * seluruh animasi ini tidak pernah menulis apa-apa, dan yang tertinggal
   * di layar adalah isi bawaan HTML-nya: angka 0. Untuk halaman
   * pendapatan, "0" bukan sekadar kosong -- itu angka salah yang
   * terlihat masuk akal, dan itu jauh lebih buruk daripada tidak ada
   * angka sama sekali.
   *
   * setTimeout ikut diperlambat di latar belakang tapi tetap dijalankan,
   * jadi angkanya pasti sampai. Kalau animasinya memang jalan normal,
   * bagian ini tidak melakukan apa-apa. */
  window.setTimeout(function () {
    if (!sudahSelesai) elemen.textContent = tulis(nilai);
  }, DURASI + 400);
}
window.hitungNaik = hitungNaik;

/* =====================================================================
   TOMBOL YANG SEDANG BEKERJA
   =====================================================================
   Sebelumnya tombol Simpan cuma di-disable dan keterangannya muncul di
   teks kecil sebelahnya. Di layar sempit teks itu jatuh ke baris lain,
   dan yang terlihat cuma tombol yang tiba-tiba mati tanpa sebab.

   Sekarang tombolnya sendiri yang mengaku sedang bekerja: labelnya
   berganti, spinner masuk, dan aria-busy dipasang supaya pembaca layar
   ikut tahu. Lebarnya dikunci selama sibuk (lihat .admin-btn[data-sibuk]
   di admin.css) supaya pergantian label tidak menggeser tombol di
   sebelahnya. */
function tombolSibuk(tombol, sibuk, labelSibuk) {
  if (!tombol) return;

  if (sibuk) {
    if (!tombol.dataset.labelAsli) tombol.dataset.labelAsli = tombol.textContent.trim();
    // Lebar dikunci SEBELUM isinya diganti, selagi masih menampilkan
    // label aslinya. Angkanya disimpan karena keadaan "Tersimpan"
    // setelah ini membutuhkannya lagi, dan waktu itu tiba tombolnya
    // sudah tidak menampilkan label asli untuk diukur.
    if (!tombol.dataset.lebarAsli) {
      tombol.dataset.lebarAsli = Math.ceil(tombol.getBoundingClientRect().width) + 'px';
    }
    tombol.style.minWidth = tombol.dataset.lebarAsli;
    tombol.disabled = true;
    tombol.dataset.sibuk = 'ya';
    tombol.setAttribute('aria-busy', 'true');
    tombol.innerHTML =
      '<span class="admin-spinner admin-spinner-tombol" aria-hidden="true"></span>' +
      (labelSibuk || 'Menyimpan…');
    return;
  }

  tombol.disabled = false;
  delete tombol.dataset.sibuk;
  tombol.removeAttribute('aria-busy');
  if (tombol.dataset.labelAsli) tombol.textContent = tombol.dataset.labelAsli;
  tombol.style.minWidth = '';
}
window.tombolSibuk = tombolSibuk;

/**
 * Tombol berubah jadi "Tersimpan" bercentang sebentar, lalu kembali.
 *
 * Teks hasil di sebelah tombol sudah ada dan tetap ada -- warna dan ikon
 * saja tidak boleh jadi satu-satunya cara menyampaikan hasil. Tapi teks
 * kecil itu gampang terlewat kalau mata sedang di kolom yang barusan
 * disunting, sedangkan tombol adalah benda yang barusan ditekan dan
 * karena itu satu-satunya tempat yang pasti sedang dilihat.
 */
var jedaBerhasil = new WeakMap();

function tombolBerhasil(tombol, label) {
  if (!tombol) return;

  var asli = tombol.dataset.labelAsli || tombol.textContent.trim();
  tombol.dataset.labelAsli = asli;

  // Simpan ditekan dua kali beruntun: hitungan mundur yang lama harus
  // dibatalkan, kalau tidak dia akan memulangkan label di tengah-tengah
  // keadaan berhasil yang baru.
  window.clearTimeout(jedaBerhasil.get(tombol));

  tombol.dataset.berhasil = 'ya';
  // Lebar tetap dikunci sepanjang keadaan ini. Tanpa itu tombolnya
  // menyusut ke lebar kata "Tersimpan" lalu melar lagi waktu labelnya
  // pulih, dan tombol di sebelahnya ikut bergeser dua kali.
  if (tombol.dataset.lebarAsli) tombol.style.minWidth = tombol.dataset.lebarAsli;
  tombol.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ' +
    'class="admin-btn-ikon"><path d="m4.5 12.5 5 5 10-11"/></svg>' +
    (label || 'Tersimpan');

  jedaBerhasil.set(
    tombol,
    window.setTimeout(function () {
      delete tombol.dataset.berhasil;
      tombol.textContent = asli;
      tombol.style.minWidth = '';
    }, 1900)
  );
}
window.tombolBerhasil = tombolBerhasil;
