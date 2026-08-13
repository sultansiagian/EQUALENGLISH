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
*/

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var PARTICLE_SIZE = 30;
  var SPAWN_INTERVAL_MS = 180;

  function Particle(container, bounds, x, friction, ballColor) {
    this.container = container;
    this.x = x;
    this.friction = friction;
    // steps & siner dihitung dari tinggi/lebar container (lihat catatan
    // di header), bukan dari window.
    this.steps = bounds.height / 2;
    this.siner = (bounds.width / 2.5) * Math.random();
    this.position = bounds.height + PARTICLE_SIZE;
    this.rotationValue = 0;
    this.rotationDirection = Math.random() > 0.5 ? 1 : -1;
    this.scale = 0.4 + Math.random() * 2;

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
    svg.style.transform =
      'translateX(' + this.x + 'px) translateY(' + this.position + 'px)';

    container.appendChild(svg);
    this.element = svg;
  }

  Particle.prototype.move = function () {
    this.position -= this.friction;
    var left = this.x + Math.sin((this.position * Math.PI) / this.steps) * this.siner;
    this.rotationValue += this.friction;
    var rotation = this.rotationDirection * this.rotationValue;

    this.element.style.transform =
      'translateX(' + left + 'px) translateY(' + this.position + 'px) scale(' +
      this.scale + ') rotate(' + rotation + 'deg)';

    if (this.position < -PARTICLE_SIZE) {
      this.destroy();
      return false;
    }
    return true;
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

    function measure() {
      var rect = container.getBoundingClientRect();
      bounds.width = rect.width;
      bounds.height = rect.height;
    }

    function running() {
      return !disposed && visible && !reduceMotion.matches && bounds.height > 0;
    }

    function spawn() {
      if (!running()) return;
      particles.push(
        new Particle(
          container,
          bounds,
          Math.random() * bounds.width,
          1 + Math.random(),
          ballColor
        )
      );
    }

    function frame() {
      var next = [];
      for (var i = 0; i < particles.length; i++) {
        if (particles[i].move()) next.push(particles[i]);
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
