/**
 * Sidebar navigasi panel admin, satu daftar untuk semua halaman.
 *
 * Sebelumnya tiap halaman menulis daftar link-nya sendiri, dan isinya
 * berbeda-beda: halaman baru tidak muncul di sebagian halaman lama,
 * urutannya tidak sama, dan halaman yang sedang dibuka tetap tampil
 * sebagai link yang bisa diklik. Menambah satu halaman berarti menyunting
 * semua halaman lain dan pasti ada yang terlewat.
 *
 * Sekarang cukup tambahkan satu baris di HALAMAN di bawah, dan seluruh
 * panel admin ikut memuatnya.
 *
 * BENTUKNYA: daftar tegak yang menempel di kiri layar, seperti Google
 * Classroom. Dulu ini deretan link mendatar yang ikut menggulir bersama
 * isi halaman, jadi harus ditulis dua kali (satu di atas, satu di bawah)
 * supaya tidak perlu menggulir balik ke atas cuma untuk pindah halaman.
 * Sidebar yang diam di tempat menghapus masalah itu sekaligus: pindah
 * halaman selalu satu klik, dari posisi gulir mana pun.
 *
 * Cara pakainya: taruh <nav id="admin-sidebar" class="admin-sidebar"
 * data-nav-admin></nav> tepat setelah topbar, lalu muat file ini.
 * Sidebar-nya cuma muncul kalau <body> punya class admin-masuk, yang
 * dipasang admin-auth.js begitu login terverifikasi -- sebelum login
 * tidak ada gunanya menawarkan pindah halaman.
 */

var HALAMAN = [
  { href: '/admin', label: 'Beranda', ikon: 'rumah' },
  { href: '/atur-kelas', label: 'Ruang Kelas', ikon: 'papan' },
  { href: '/atur-form', label: 'Formulir', ikon: 'formulir' },
  { href: '/pendaftar', label: 'Pendaftar', ikon: 'orang' },
  // Tepat di bawah Pendaftar, dan itu disengaja: keduanya mengurus orang
  // yang sama pada dua tahap berbeda hidupnya di sini -- yang satu
  // memberi akses, yang satu mengelompokkan lalu mencabutnya.
  { href: '/batch', label: 'Batch', ikon: 'lapis' },
  { href: '/analitik', label: 'Analitik', ikon: 'grafik' },
];

/* Ikon garis, satu keluarga (kotak 24, tebal garis sama, ujung bulat).
   Sengaja SVG dan bukan emoji: emoji digambar beda-beda di tiap sistem,
   tidak bisa ikut warna teks waktu item-nya aktif, dan ukurannya tidak
   bisa dikunci. */
var IKON = {
  rumah:
    '<path d="M3 10.4a2 2 0 0 1 .73-1.55l7-5.72a2 2 0 0 1 2.54 0l7 5.72A2 2 0 0 1 21 10.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
    '<path d="M9.5 21v-6.5h5V21"/>',
  papan:
    '<path d="M2 3h20"/>' +
    '<path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/>' +
    '<path d="m7 21 5-5 5 5"/>',
  formulir:
    '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<path d="M8.5 12h7"/><path d="M8.5 16.5h4.5"/>',
  orang:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>' +
    '<path d="M16.5 3.3a4 4 0 0 1 0 7.4"/>',
  grafik:
    '<path d="M3 3v16a2 2 0 0 0 2 2h16"/>' +
    '<path d="M18 17V9"/><path d="M13 17V5.5"/><path d="M8 17v-3.5"/>',
  // Tumpukan lempeng: angkatan yang menumpuk satu di atas yang lain.
  lapis:
    '<path d="m12 2.5 9 4.75-9 4.75-9-4.75z"/>' +
    '<path d="m3 12 9 4.75L21 12"/>' +
    '<path d="m3 16.75 9 4.75 9-4.75"/>',
  keluar:
    '<path d="M15 3h6v6"/><path d="M10.5 13.5 21 3"/>' +
    '<path d="M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5"/>',
};

function ikonSVG(nama) {
  return (
    '<svg class="admin-nav-ikon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">' +
    IKON[nama] +
    '</svg>'
  );
}

(function pasangNavAdmin() {
  var wadah = document.querySelectorAll('[data-nav-admin]');

  // "/atur-form" dan "/atur-form.html" harus dianggap halaman yang sama,
  // karena cleanUrls membuat keduanya bisa muncul di bilah alamat.
  var sekarang = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  wadah.forEach(function (nav) {
    var html = '<ul class="admin-nav-list">';

    HALAMAN.forEach(function (h) {
      var aktif = h.href === sekarang;

      // Halaman yang sedang dibuka jadi <span>, bukan <a>. Link yang
      // mengarah ke halaman itu sendiri tidak melakukan apa-apa waktu
      // diklik, dan itu terbaca seperti tombol rusak.
      html +=
        '<li>' +
        (aktif
          ? '<span class="admin-nav-item admin-nav-aktif" aria-current="page">'
          : '<a class="admin-nav-item" href="' + h.href + '">') +
        ikonSVG(h.ikon) +
        '<span class="admin-nav-teks">' +
        h.label +
        '</span>' +
        (aktif ? '</span>' : '</a>') +
        '</li>';
    });

    html += '</ul>';

    // Formulir publik dibuka di tab baru: itu halaman yang dilihat calon
    // pendaftar, bukan bagian dari panel admin. Dipisah garis supaya
    // terbaca sebagai kelompok lain, bukan halaman admin keenam.
    html +=
      '<hr class="admin-nav-pisah" />' +
      '<ul class="admin-nav-list">' +
      '<li><a class="admin-nav-item admin-nav-luar" href="/daftar" target="_blank" rel="noopener">' +
      ikonSVG('keluar') +
      '<span class="admin-nav-teks">Lihat formulir</span>' +
      '</a></li>' +
      '</ul>';

    nav.innerHTML = html;
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Halaman admin');
  });
})();

/* =====================================================================
   LACI DI LAYAR SEMPIT
   =====================================================================
   Di layar lebar sidebar selalu kelihatan. Di bawah 1024px tidak ada
   ruang untuk itu tanpa memeras isi halaman, jadi sidebar-nya jadi laci
   yang digeser masuk lewat tombol di topbar.

   Laci yang terbuka menutupi isi halaman, jadi harus selalu ada jalan
   keluar yang jelas: tombolnya sendiri, ketuk area gelap di sampingnya,
   atau tekan Escape. */
(function pasangLaciAdmin() {
  var tombol = document.getElementById('admin-menu');
  var scrim = document.getElementById('admin-scrim');
  if (!tombol) return;

  var CLASS_BUKA = 'admin-laci-buka';

  function terbuka() {
    return document.body.classList.contains(CLASS_BUKA);
  }

  function setLaci(buka, kembalikanFokus) {
    // Menyalakan transisi geser, sengaja baru di sini. Selama class ini
    // belum ada, laci berpindah tempat tanpa animasi -- itu yang kita
    // mau waktu sidebar-nya baru muncul setelah login, karena browser
    // menganggap kemunculan itu sendiri sebagai geseran yang layak
    // dianimasikan dan lacinya jadi berkelebat terbuka dulu. Lihat
    // .admin-laci-siap di admin.css.
    document.body.classList.add('admin-laci-siap');
    document.body.classList.toggle(CLASS_BUKA, buka);
    tombol.setAttribute('aria-expanded', buka ? 'true' : 'false');
    tombol.setAttribute('aria-label', buka ? 'Tutup menu' : 'Buka menu');

    if (buka) {
      // Fokus keyboard harus ikut pindah ke dalam laci, kalau tidak
      // pengguna keyboard menekan tombolnya lalu tidak tahu apa-apa
      // terjadi -- lacinya terbuka di layar tapi fokusnya masih di luar.
      var pertama = document.querySelector('.admin-sidebar a.admin-nav-item');
      if (pertama) pertama.focus();
    } else if (kembalikanFokus) {
      tombol.focus();
    }
  }
  window.tutupLaciAdmin = function () {
    setLaci(false, false);
  };

  tombol.addEventListener('click', function () {
    setLaci(!terbuka(), true);
  });

  if (scrim) {
    scrim.addEventListener('click', function () {
      setLaci(false, true);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && terbuka()) setLaci(false, true);
  });

  // Layar diputar atau jendela dilebarkan sampai sidebar permanen muncul
  // lagi: laci dan scrim-nya harus ikut hilang, kalau tidak scrim gelapnya
  // tertinggal menutupi halaman yang sudah tidak butuh laci.
  window.addEventListener('resize', function () {
    if (window.innerWidth >= 1024 && terbuka()) setLaci(false, false);
  });
})();

/* =====================================================================
   PENJAGA ISIAN YANG BELUM DISIMPAN
   =====================================================================
   Sebelum ada sidebar, pindah halaman berarti menggulir sampai bawah
   dulu -- cukup jauh sampai tidak pernah terjadi tanpa sengaja. Sekarang
   satu klik, dan satu klik itu membuang seluruh isian /atur-kelas yang
   belum ditekan Simpan, tanpa bilang apa-apa. Kemudahan yang dibawa
   sidebar itu yang bikin penjaga ini jadi perlu.

   Dua jalan keluar yang dijaga:
   1. Klik tautan di sidebar (pindah halaman di tab yang sama).
   2. Tutup tab atau muat ulang, lewat beforeunload.

   "Lihat formulir" sengaja TIDAK dijaga: dia membuka tab baru, jadi
   halaman ini tidak ditinggalkan dan tidak ada yang hilang. */

var adaPerubahan = false;

/* CATATAN YANG PERLU DIINGAT kalau nanti ada yang menyempurnakan ini:
   penandanya satu untuk seluruh halaman, bukan satu per kartu. Di
   /admin ada DUA tombol simpan yang berdiri sendiri (Teks & Harga, dan
   Testimoni). Menyimpan salah satunya membersihkan penanda untuk
   dua-duanya, jadi kalau kamu menyunting keduanya lalu menyimpan satu
   saja, yang satunya bisa lolos tanpa peringatan.

   Dibiarkan begitu dengan sadar: alternatifnya melacak per kelompok
   isian, dan itu jauh lebih rumit demi kasus yang jarang. Keadaan
   sekarang tetap lebih baik daripada sebelumnya, yang tidak pernah
   memperingatkan apa pun sama sekali. */
window.tandaiAdminBerubah = function () {
  adaPerubahan = true;
};
window.tandaiAdminTersimpan = function () {
  adaPerubahan = false;
};

(function pasangPenjagaAdmin() {
  var panel = document.getElementById('admin-panel-dashboard');
  if (!panel) return;

  /* Kolom yang isinya tidak pernah disimpan ke mana-mana. Mengetik di
     kotak pencarian /pendaftar tidak boleh dianggap kerjaan yang bisa
     hilang -- peringatan palsu adalah cara tercepat membuat orang
     berhenti membaca peringatan. */
  function diabaikan(el) {
    if (!el || !el.tagName) return true;
    if (el.type === 'search' || el.type === 'file') return true;
    return !!el.closest('[data-tanpa-jaga]');
  }

  /* Didengarkan di tingkat panel, bukan dipasang satu per satu ke tiap
     kolom: baris jadwal, testimoni, dan pertanyaan formulir dibuat
     belakangan oleh JavaScript, dan pendengar yang dipasang di awal
     tidak akan pernah mengenal mereka.

     Pengisian formulir dari server TIDAK ikut terhitung, karena
     menetapkan .value lewat JavaScript memang tidak memicu event input
     maupun change. Jadi penanda ini hanya menyala oleh ketikan orang. */
  ['input', 'change'].forEach(function (jenis) {
    panel.addEventListener(
      jenis,
      function (e) {
        if (!diabaikan(e.target)) window.tandaiAdminBerubah();
      },
      true
    );
  });

  var sidebar = document.getElementById('admin-sidebar');
  if (sidebar) {
    sidebar.addEventListener('click', function (e) {
      if (!adaPerubahan) return;

      var tautan = e.target.closest('a.admin-nav-item');
      // Tautan yang membuka tab baru meninggalkan halaman ini tetap utuh.
      if (!tautan || tautan.target === '_blank') return;

      var lanjut = window.confirm(
        'Ada isian di halaman ini yang belum disimpan. Kalau pindah sekarang, ' +
          'isian itu hilang.\n\nTetap pindah?'
      );
      if (!lanjut) e.preventDefault();
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (!adaPerubahan) return;
    // Browser modern mengabaikan teks buatan sendiri dan memakai
    // kalimatnya sendiri; yang penting dialognya muncul.
    e.preventDefault();
    e.returnValue = '';
  });
})();
