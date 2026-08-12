/* Memberi tahu inline fallback di <head> bahwa layer reveal aktif,
   sehingga .reveal-fallback tidak perlu dipasang. */
window.__equalRevealReady = true;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- navigasi ---------- */

const toggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');
const navLinks = document.querySelectorAll('.main-nav a');

function closeMenu() {
  if (!toggle || !nav) return;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Buka menu');
  nav.classList.remove('is-open');
  document.body.classList.remove('menu-open');
}

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Buka menu' : 'Tutup menu');
    nav.classList.toggle('is-open', !isOpen);
    document.body.classList.toggle('menu-open', !isOpen);
  });

  navLinks.forEach((link) => link.addEventListener('click', closeMenu));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

/* ---------- header menempel setelah scroll ---------- */

const header = document.querySelector('.site-header');

function syncHeader() {
  if (!header) return;
  header.classList.toggle('is-stuck', window.scrollY > 24);
}

window.addEventListener('scroll', syncHeader, { passive: true });
syncHeader();

/* ---------- reveal saat masuk viewport ---------- */

const STAGGER_STEP = 50;

function reveal(element, stagger) {
  element.classList.add('is-visible');
  if (!element.hasAttribute('data-reveal-stagger')) return;

  Array.from(element.children).forEach((child, index) => {
    if (!stagger) {
      child.classList.add('is-visible');
      return;
    }
    window.setTimeout(() => child.classList.add('is-visible'), index * STAGGER_STEP);
  });
}

const revealTargets = document.querySelectorAll(
  '[data-reveal], [data-reveal-soft], [data-reveal-stagger]'
);

if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  revealTargets.forEach((element) => reveal(element, false));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target, true);
        currentObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  revealTargets.forEach((element) => revealObserver.observe(element));
}

/* ---------- angka yang menghitung naik ---------- */

const counters = document.querySelectorAll('[data-target]');

function formatCount(value, decimals, suffix) {
  return (
    value.toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix
  );
}

function animateCount(element) {
  const target = Number(element.dataset.target || 0);
  const decimals = Number(element.dataset.decimals || 0);
  const suffix = element.dataset.suffix || '';
  const duration = 1050;
  const startTime = performance.now();

  function update(now) {
    const elapsed = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - elapsed, 4);

    if (elapsed < 1) {
      element.textContent = formatCount(target * eased, decimals, suffix);
      requestAnimationFrame(update);
    } else {
      element.textContent = formatCount(target, decimals, suffix);
    }
  }

  requestAnimationFrame(update);
}

if (counters.length) {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    counters.forEach((element) => {
      element.textContent = formatCount(
        Number(element.dataset.target || 0),
        Number(element.dataset.decimals || 0),
        element.dataset.suffix || ''
      );
    });
  } else {
    const countObserver = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCount(entry.target);
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.35 }
    );

    counters.forEach((element) => countObserver.observe(element));
  }
}

/* ---------- tahun berjalan di footer ---------- */

const year = document.querySelector('#current-year');
if (year) year.textContent = new Date().getFullYear();
