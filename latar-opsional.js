/**
 * ============================================================
 * LATAR ANIMASI DIMUAT SESUAI KEMAMPUAN PERANGKAT
 * ============================================================
 *
 * shader-background.js (21 KB) dan morphic-background.js (16 KB)
 * sebelumnya dimuat dan dijalankan di SEMUA perangkat. Cadangan WebGL-nya
 * memang sudah dipikirkan, jadi perangkat tanpa WebGL aman. Yang tersisa
 * justru HP kelas menengah: mereka PUNYA WebGL, jadi jalur cadangan itu
 * tidak pernah kena, dan hasilnya animasi berat plus baterai terkuras
 * untuk sesuatu yang tergulir lewat dalam dua detik.
 *
 * Berkas ini yang memutuskan. Kalau tidak dimuat, tidak ada yang rusak:
 * hero jatuh ke .hero-glow berbasis CSS yang memang sudah ada sebagai
 * cadangan, dan kelas.js sudah menjaga __kelasMorphicSync dengan
 * pemeriksaan keberadaan.
 *
 * ------------------------------------------------------------
 * KENAPA SYARATNYA BEGINI
 * ------------------------------------------------------------
 * Tidak ada cara jujur mengukur "HP ini kuat atau tidak" dari browser.
 * Yang tersedia cuma petunjuk kasar, jadi yang dipakai kombinasi
 * beberapa, dengan sikap: kalau ragu, JANGAN dimuat. Halaman tanpa
 * animasi latar tetap utuh dan tetap cantik; halaman yang tersendat
 * tidak.
 */
(function () {
  'use strict';

  function bolehMuat() {
    // 1. Yang meminta gerakan dikurangi: hormati, titik. Ini bukan
    //    optimasi, ini permintaan eksplisit dari pemakainya.
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    } catch (err) {
      /* matchMedia tidak ada: lanjut ke pemeriksaan berikutnya */
    }

    // 2. Layar sempit. Di HP, latar ini nyaris tidak terlihat karena
    //    tertutup konten, sementara ongkosnya sama saja.
    if (window.innerWidth < 900) return false;

    // 3. Mode hemat data, kalau browsernya melaporkannya.
    var koneksi = navigator.connection;
    if (koneksi && koneksi.saveData) return false;

    // 4. Inti prosesor. Angkanya kasar dan bisa dipalsukan browser, tapi
    //    4 ke bawah cukup andal menandai perangkat yang akan tersendat.
    //    Kalau propertinya tidak ada sama sekali (Safari), pemeriksaan
    //    ini DILEWATI, bukan dianggap gagal -- Safari desktop justru
    //    perangkat yang sanggup.
    var inti = navigator.hardwareConcurrency;
    if (typeof inti === 'number' && inti > 0 && inti <= 4) return false;

    // 5. Memori perangkat, kalau dilaporkan. Sama seperti di atas:
    //    tidak dilaporkan berarti dilewati.
    var memori = navigator.deviceMemory;
    if (typeof memori === 'number' && memori > 0 && memori < 4) return false;

    return true;
  }

  function muat(src) {
    var s = document.createElement('script');
    s.src = src;
    // defer supaya urutannya terjaga dan tidak menghalangi parsing,
    // sama seperti waktu masih ditulis sebagai tag di HTML.
    s.defer = true;
    document.head.appendChild(s);
  }

  if (!bolehMuat()) {
    // Dicatat, bukan didiamkan: kalau nanti ada yang bingung kenapa
    // latarnya polos di satu perangkat, jawabannya ada di console.
    if (window.console && console.info) {
      console.info(
        'EQUAL: latar animasi dilewati untuk perangkat ini. Halaman tetap ' +
          'utuh, latar cadangan berbasis CSS yang dipakai.'
      );
    }
    return;
  }

  var daftar = (document.currentScript && document.currentScript.dataset.latar) || '';
  daftar
    .split(',')
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean)
    .forEach(muat);
})();
