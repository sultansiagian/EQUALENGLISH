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
    var x, y;
    if (this.direction === 'right' || this.direction === 'left') {
      x = this.position;
      y = sway;
    } else {
      x = sway;
      y = this.position;
    }
    var rotation = this.rotationDirection * this.rotationValue;
    this.element.style.transform =
      'translateX(' + x + 'px) translateY(' + y + 'px) scale(' +
      this.scale + ') rotate(' + rotation + 'deg)';
  };

  Particle.prototype.move = function () {
    if (this.direction === 'right') {
      this.position += this.friction;
    } else {
      // 'left' dan 'up' dua-duanya berkurang menuju sisi seberang.
      this.position -= this.friction;
    }
    this.rotationValue += this.friction;
    this.applyTransform();

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

    function measure() {
      var rect = container.getBoundingClientRect();
      bounds.width = rect.width;
      bounds.height = rect.height;
    }

    function running() {
      return !disposed && visible && !reduceMotion.matches && bounds.height > 0;
    }

    // Tiga arah lahir dengan peluang sama: dari bawah (naik), dari kiri
    // (geser kanan), dari kanan (geser kiri) -- origin-nya masing-masing
    // posisi di sumbu SEKUNDER (acak di lebar container buat 'up', acak
    // di tinggi container buat 'left'/'right').
    var DIRECTIONS = ['up', 'right', 'left'];

    function spawn() {
      if (!running()) return;
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
