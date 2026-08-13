/* MorphicBackground: port vanilla dari komponen React "morphic-background"
   (partikel bulat naik ke atas + SVG goo filter, sehingga bola-bolanya
   saling meleleh waktu berdekatan).

   Sama seperti shader-background.js, yang diterjemahkan cuma lapisan
   lifecycle-nya (useEffect/useRef -> fungsi biasa) karena proyek ini
   vanilla HTML/CSS/JS tanpa build step. Logika partikelnya (posisi,
   friction, siner, rotasi, scale) dipertahankan apa adanya dari sumber.

   Beda dari sumber aslinya, disesuaikan ke kebutuhan halaman ini:
   - Ukuran/posisi partikel dihitung dari KOTAK CONTAINER-nya, bukan dari
     window. Di sumber aslinya container-nya memang selalu selebar layar;
     di sini zona fungsional punya lebar sendiri (.kelas-shell 720px di
     tengah), jadi pakai window.innerWidth bikin partikel lahir di luar
     kotak dan tidak pernah kelihatan.
   - prefers-reduced-motion dihormati: partikel tidak pernah dibuat sama
     sekali (bukan cuma dilambatkan), sesuai perlakuan animasi lain di
     situs ini.
   - Animasi berhenti waktu tab tidak terlihat (visibilitychange) DAN
     waktu container-nya ter-scroll keluar layar (IntersectionObserver),
     supaya tidak membakar CPU/baterai di halaman yang memang dibuka
     lama-lama ("simpan halaman ini" di kartu Zoom).
   - Interaksi kursor (dorongan menjauh, "mental") ditambah di luar
     component React sumbernya -- lihat REPEL_RADIUS/STRENGTH/DECAY dan
     Particle.prototype.repel().
   - Dimatikan total di layar sempit (IS_NARROW, <=640px): sempat dicoba
     diringankan (batas partikel, blur lebih tipis), tapi tetap patah-
     patah di HP. Solusinya dibikin biner, bukan bertingkat.
*/

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PARTICLE_SIZE = 30;

  // Layar sempit (HP) dimatikan TOTAL -- sudah dicoba diringankan (batas
  // partikel, blur lebih tipis) tapi tetap patah-patah. Filter goo
  // (feGaussianBlur) diproses ulang tiap partikel bergerak, dan itu
  // ternyata masih terlalu berat buat GPU HP kebanyakan, jadi solusinya
  // dibikin biner: nyala penuh di layar biasa, kosong (cuma warna hitam
  // polos dari .kelas-functional) di layar sempit.
  //
  // SENGAJA fungsi, bukan konstanta yang dihitung sekali di-cache ke var --
  // dicek live setiap running() dipanggil (murah, matchMedia native).
  // Kalau di-cache sekali di sini, nilainya kebeku permanen sepanjang umur
  // halaman berdasarkan kondisi viewport TEPAT SAAT script ini pertama
  // jalan; efek sampingnya kalau ada momen viewport belum "settle" pas
  // script diparse (mis. sebagian browser/embed yang layout awalnya
  // telat), matchMedia bisa kebaca salah dan tidak akan pernah dicek
  // ulang lagi selamanya. Dicek live juga otomatis jadi reaktif kalau
  // layar diputar/di-resize di tengah sesi -- bonus, bukan tujuan utama.
  function isNarrowViewport() {
    return window.matchMedia('(max-width: 640px)').matches;
  }
  var SPAWN_INTERVAL_MS = 180;
  var MAX_PARTICLES = 34;

  // Kursor "memental" partikel: begitu jaraknya di bawah REPEL_RADIUS,
  // partikel didorong menjauh -- makin dekat, makin kuat dorongannya.
  // REPEL_DECAY < 1 bikin dorongan itu luruh tiap frame (pegas balik ke
  // jalur alaminya), bukan nempel permanen di posisi baru. Radius dibuat
  // cukup besar supaya efeknya gampang "kesenggol" lewat gerakan kursor
  // biasa, bukan cuma kalau presisi nempel ke satu partikel.
  var REPEL_RADIUS = 150;
  var REPEL_STRENGTH = 34;
  var REPEL_DECAY = 0.88;
  // Touch device (HP/tablet) tidak punya kursor yang benar-benar hover --
  // pointermove cuma muncul pas jari lagi diseret, bukan sekadar "di atas"
  // elemen. Fitur kursor dimatikan total di situ: bukan cuma percuma,
  // tapi listener pointermove yang jalan terus-menerus juga menambah beban
  // di perangkat yang justru paling butuh dihemat.
  var SUPPORTS_HOVER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Partikel bisa lahir dari tiga sisi: 'up' (dari bawah, naik -- perilaku
  // asli), 'right' (dari kiri, geser ke kanan), 'left' (dari kanan, geser
  // ke kiri). Ketiganya pakai rumus yang sama, cuma sumbu utama (arah
  // jalan) dan sumbu sekunder (arah goyang sinus) ditukar posisinya.
  function Particle(container, bounds, direction, origin, friction, ballColor) {
    this.container = container;
    this.direction = direction;
    this.friction = friction;
    this.rotationValue = 0;
    this.rotationDirection = Math.random() > 0.5 ? 1 : -1;
    this.scale = 0.4 + Math.random() * 2;
    // Dorongan dari kursor (lihat repel()) -- diluruhkan tiap frame, jadi
    // ini offset SEMENTARA di atas jalur alaminya, bukan posisi baru yang
    // permanen.
    this.offsetX = 0;
    this.offsetY = 0;
    this.naturalX = 0;
    this.naturalY = 0;

    if (direction === 'right') {
      // Lahir di tepi kiri, jalan ke kanan; goyang naik-turun sepanjang
      // tinggi container.
      this.secondary = origin; // posisi vertikal awal (tetap, cuma digoyang sinus)
      this.steps = bounds.width / 2;
      this.siner = (bounds.height / 2.5) * Math.random();
      this.position = -PARTICLE_SIZE;
    } else if (direction === 'left') {
      // Lahir di tepi kanan, jalan ke kiri; goyang naik-turun.
      this.secondary = origin;
      this.steps = bounds.width / 2;
      this.siner = (bounds.height / 2.5) * Math.random();
      this.position = bounds.width + PARTICLE_SIZE;
    } else {
      // 'up' (default): lahir di bawah, naik; goyang kiri-kanan.
      this.secondary = origin;
      this.steps = bounds.height / 2;
      this.siner = (bounds.width / 2.5) * Math.random();
      this.position = bounds.height + PARTICLE_SIZE;
    }

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 67.4 67.4');
    svg.setAttribute('aria-hidden', 'true');

    var circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '33.7');
    circle.setAttribute('cy', '33.7');
    circle.setAttribute('r', '33.7');
    circle.setAttribute('fill', ballColor);
    svg.appendChild(circle);

    svg.style.position = 'absolute';
    svg.style.width = PARTICLE_SIZE + 'px';
    svg.style.height = PARTICLE_SIZE + 'px';
    svg.style.top = '0';
    svg.style.left = '0';

    container.appendChild(svg);
    this.element = svg;
    this.applyTransform();
  }

  Particle.prototype.applyTransform = function () {
    var sway = this.secondary + Math.sin((this.position * Math.PI) / this.steps) * this.siner;
    if (this.direction === 'right' || this.direction === 'left') {
      this.naturalX = this.position;
      this.naturalY = sway;
    } else {
      this.naturalX = sway;
      this.naturalY = this.position;
    }
    var rotation = this.rotationDirection * this.rotationValue;
    this.element.style.transform =
      'translateX(' + (this.naturalX + this.offsetX) + 'px) translateY(' +
      (this.naturalY + this.offsetY) + 'px) scale(' + this.scale +
      ') rotate(' + rotation + 'deg)';
  };

  // Didorong menjauh dari kursor kalau jaraknya (dari posisi ALAMI, bukan
  // posisi yang sudah ke-offset -- supaya beberapa frame dorongan
  // berturut-turut tidak saling melipatgandakan) di bawah REPEL_RADIUS.
  // pointer null/tidak aktif -- cuma luruh, tidak ada dorongan baru.
  Particle.prototype.repel = function (pointer) {
    this.offsetX *= REPEL_DECAY;
    this.offsetY *= REPEL_DECAY;
    if (!pointer || !pointer.active) return;

    var dx = this.naturalX + PARTICLE_SIZE / 2 - pointer.x;
    var dy = this.naturalY + PARTICLE_SIZE / 2 - pointer.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= REPEL_RADIUS || dist === 0) return;

    var force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH;
    this.offsetX += (dx / dist) * force;
    this.offsetY += (dy / dist) * force;
  };

  Particle.prototype.move = function (pointer) {
    if (this.direction === 'right') {
      this.position += this.friction;
    } else {
      // 'left' dan 'up' dua-duanya berkurang menuju sisi seberang.
      this.position -= this.friction;
    }
    this.rotationValue += this.friction;
    this.applyTransform();
    // repel() dipanggil SETELAH applyTransform: butuh naturalX/Y hasil
    // posisi frame ini, lalu hasil offset barunya baru kepakai di
    // applyTransform() pemanggilan BERIKUTNYA -- satu frame telat, tidak
    // kelihatan bedanya di mata tapi bikin urutannya jelas/tidak sirkular.
    this.repel(pointer);

    var offScreen =
      this.direction === 'right'
        ? this.position > this._maxPosition()
        : this.position < -PARTICLE_SIZE;
    if (offScreen) {
      this.destroy();
      return false;
    }
    return true;
  };

  // Batas jalan buat arah 'right' disimpan lewat siner/steps saja (tidak
  // ada field width tersendiri di instance), jadi dihitung balik dari
  // steps (steps = bounds.width / 2 khusus arah horizontal).
  Particle.prototype._maxPosition = function () {
    return this.steps * 2 + PARTICLE_SIZE;
  };

  Particle.prototype.destroy = function () {
    this.element.remove();
  };

  function initMorphicBackground(container, options) {
    if (!container) return null;
    var opts = options || {};
    var ballColor = opts.ballColor || '#ffacdf';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var particles = [];
    var raf = 0;
    var spawnTimer = 0;
    var visible = true;
    var disposed = false;
    var bounds = { width: 0, height: 0 };
    // Posisi kursor, relatif ke pojok kiri-atas container (sistem
    // koordinat yang sama dipakai partikel). .kelas-morphic-particles
    // sengaja pointer-events:none (supaya tidak pernah mencuri klik dari
    // kartu di atasnya) -- makanya pointermove-nya didengarkan di
    // document, bukan di container/partikelnya sendiri.
    var pointer = { x: 0, y: 0, active: false };

    function measure() {
      var rect = container.getBoundingClientRect();
      bounds.width = rect.width;
      bounds.height = rect.height;
    }

    function running() {
      return (
        !disposed && !isNarrowViewport() && visible && !reduceMotion.matches && bounds.height > 0
      );
    }

    // Tiga arah lahir dengan peluang sama: dari bawah (naik), dari kiri
    // (geser kanan), dari kanan (geser kiri) -- origin-nya masing-masing
    // posisi di sumbu SEKUNDER (acak di lebar container buat 'up', acak
    // di tinggi container buat 'left'/'right').
    var DIRECTIONS = ['up', 'right', 'left'];

    function spawn() {
      // Batas partikel hidup bersamaan -- lihat catatan MAX_PARTICLES di
      // atas soal kenapa ini yang paling menentukan performa, bukan
      // interval spawn-nya sendiri.
      if (!running() || particles.length >= MAX_PARTICLES) return;
      var direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      var origin =
        direction === 'up' ? Math.random() * bounds.width : Math.random() * bounds.height;
      particles.push(
        new Particle(container, bounds, direction, origin, 1 + Math.random(), ballColor)
      );
    }

    function frame() {
      var next = [];
      for (var i = 0; i < particles.length; i++) {
        if (particles[i].move(pointer)) next.push(particles[i]);
      }
      particles = next;
      // Terus jalan selama masih ada partikel di layar, walau spawner
      // sudah berhenti -- biar yang sudah terlanjur ada selesai naik
      // dengan mulus, bukan membeku di tempat.
      if (!disposed && (running() || particles.length > 0)) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
      }
    }

    function start() {
      if (disposed || spawnTimer) return;
      measure();
      spawnTimer = window.setInterval(spawn, SPAWN_INTERVAL_MS);
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function stop() {
      if (spawnTimer) {
        window.clearInterval(spawnTimer);
        spawnTimer = 0;
      }
    }

    // measure() dipanggil di sini, BUKAN cuma di start(): zona fungsional
    // ini hidden (display:none, jadi kotaknya 0x0) sampai login berhasil,
    // dan running() ikut memeriksa bounds.height. Tanpa mengukur ulang
    // lebih dulu, sync() yang terpicu saat zona baru muncul masih membaca
    // ukuran basi 0x0 dan animasinya tidak pernah start.
    function sync() {
      measure();
      if (running()) start();
      else stop();
    }

    var resizeObserver = null;
    if (typeof ResizeObserver === 'function') {
      // sync(), bukan cuma measure(): transisi display:none -> tampil
      // (saat showState('welcome') di kelas.js) muncul di sini sebagai
      // perubahan ukuran 0x0 -> ukuran asli, dan itulah sinyal paling
      // andal bahwa zona ini sekarang benar-benar terlihat.
      resizeObserver = new ResizeObserver(function () {
        sync();
      });
      resizeObserver.observe(container);
    } else {
      window.addEventListener('resize', sync);
    }

    // Berhenti waktu container-nya tidak kelihatan (ter-scroll jauh ke
    // atas/bawah), bukan cuma waktu tab-nya ditinggal.
    var intersectionObserver = null;
    if (typeof IntersectionObserver === 'function') {
      intersectionObserver = new IntersectionObserver(function (entries) {
        visible = entries.some(function (entry) {
          return entry.isIntersecting;
        });
        sync();
      });
      intersectionObserver.observe(container);
    }

    function onVisibilityChange() {
      visible = !document.hidden;
      sync();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    function onMotionPreferenceChange() {
      sync();
    }
    reduceMotion.addEventListener('change', onMotionPreferenceChange);

    // pointerleave di document (bukan container) supaya kursor yang
    // keluar lewat tepi manapun -- termasuk keluar dari window sama
    // sekali -- tetap membuat partikel berhenti didorong. blur jaga-jaga
    // kalau tab/window kehilangan fokus tanpa event pointerleave (mis.
    // Alt-Tab dengan kursor masih di atas halaman).
    function onPointerMove(event) {
      var rect = container.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }
    function onPointerGone() {
      pointer.active = false;
    }
    // Cuma dipasang di perangkat yang benar-benar punya kursor hover
    // (lihat SUPPORTS_HOVER) -- di HP/tablet listener ini tidak berguna
    // (pointermove nyaris tidak pernah muncul tanpa jari diseret) dan
    // cuma nambah kerjaan di perangkat yang paling butuh dihemat.
    if (SUPPORTS_HOVER) {
      document.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerleave', onPointerGone);
      window.addEventListener('blur', onPointerGone);
    }

    sync();

    var dispose = function () {
      disposed = true;
      stop();
      if (raf) cancelAnimationFrame(raf);
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', sync);
      if (intersectionObserver) intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reduceMotion.removeEventListener('change', onMotionPreferenceChange);
      if (SUPPORTS_HOVER) {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerleave', onPointerGone);
        window.removeEventListener('blur', onPointerGone);
      }
      for (var i = 0; i < particles.length; i++) particles[i].destroy();
      particles = [];
    };
    // Diekspos supaya pemanggil bisa memaksa re-ukur kotaknya secara
    // eksplisit (lihat window.__kelasMorphicSync di bawah) -- tidak
    // digantungkan sepenuhnya ke ResizeObserver, yang di beberapa
    // browser/embed tidak selalu memicu tepat waktu saat parent-nya
    // baru saja pindah dari display:none ke terlihat.
    dispose.sync = sync;
    return dispose;
  }

  var host = document.querySelector('.kelas-morphic-particles');
  if (host) {
    var instance = initMorphicBackground(host, {
      ballColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--pink')
        .trim() || '#ffacdf',
    });
    // kelas.js memanggil ini eksplisit di showState('welcome') --
    // ResizeObserver tetap jalan sebagai jaring pengaman kedua, bukan
    // satu-satunya sinyal, untuk transisi hidden -> tampil.
    window.__kelasMorphicSync = instance && instance.sync;
  }

  window.initMorphicBackground = initMorphicBackground;
})();
