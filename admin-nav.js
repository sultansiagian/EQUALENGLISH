/**
 * Navigasi antar halaman panel admin, satu daftar untuk semua halaman.
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
 * Cara pakainya: taruh <nav class="admin-nav" data-nav-admin></nav> di
 * mana pun (biasanya satu di atas dan satu di bawah), lalu muat file ini.
 */

var HALAMAN = [
  { href: '/admin', label: 'Beranda' },
  { href: '/atur-kelas', label: 'Ruang Kelas' },
  { href: '/atur-form', label: 'Formulir' },
  { href: '/pendaftar', label: 'Pendaftar' },
  { href: '/analitik', label: 'Analitik' },
];

(function pasangNavAdmin() {
  var wadah = document.querySelectorAll('[data-nav-admin]');
  if (wadah.length === 0) return;

  // "/atur-form" dan "/atur-form.html" harus dianggap halaman yang sama,
  // karena cleanUrls membuat keduanya bisa muncul di bilah alamat.
  var sekarang = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

  wadah.forEach(function (nav) {
    nav.textContent = '';

    HALAMAN.forEach(function (h) {
      var aktif = h.href === sekarang;

      // Halaman yang sedang dibuka jadi <span>, bukan <a>. Link yang
      // mengarah ke halaman itu sendiri tidak melakukan apa-apa waktu
      // diklik, dan itu terbaca seperti tombol rusak.
      var el = document.createElement(aktif ? 'span' : 'a');
      if (!aktif) el.href = h.href;
      else el.setAttribute('aria-current', 'page');
      el.className = aktif ? 'admin-nav-aktif' : '';
      el.textContent = h.label;
      nav.appendChild(el);
    });

    // Formulir publik dibuka di tab baru: itu halaman yang dilihat calon
    // pendaftar, bukan bagian dari panel admin.
    var lihat = document.createElement('a');
    lihat.href = '/daftar';
    lihat.target = '_blank';
    lihat.rel = 'noopener';
    lihat.className = 'admin-nav-luar';
    lihat.textContent = 'Lihat formulir ↗';
    nav.appendChild(lihat);
  });
})();
