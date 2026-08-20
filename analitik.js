/**
 * Halaman /analitik: jumlah pendaftar, komposisi paket, dan pendapatan
 * per batch.
 *
 * Login ditangani admin-auth.js yang dimuat lebih dulu; file ini cuma
 * menyediakan window.onAdminReady.
 *
 * Seluruh angkanya dihitung SERVER (api/admin-statistik.js), bukan di
 * sini. File ini murni menggambar. Itu disengaja: perhitungan yang sama
 * juga dipakai untuk angka siswa di beranda, dan dua tempat yang
 * menghitung hal yang sama dengan cara sendiri-sendiri cepat atau lambat
 * akan berselisih.
 */

// Hitam, pink, abu tua. Ketiganya sengaja beda TERANGNYA, bukan cuma
// beda rona, jadi irisan tetap bisa dibedakan waktu dicetak hitam putih
// atau oleh mata yang sulit membedakan warna.
//
// Pink muda (--pink-light) sempat dipakai sebagai warna ketiga dan
// dibatalkan: kontrasnya cuma 1,29 terhadap kartu putih dan 1,33
// terhadap pink biasa, jadi irisannya nyaris lenyap di tepi donat dan
// tidak bisa dibedakan dari irisan sebelahnya. Abu tua (--ink-muted)
// mencapai 5,9 terhadap putih dan jelas berbeda dari keduanya.
var WARNA_PAKET = ['#000000', '#ffacdf', '#5c5b5b'];

// Celah putih tipis antar irisan, supaya batas antar irisan tetap
// terbaca walau dua warna kebetulan berdampingan.
var CELAH_IRISAN = 1;

var dataTerakhir = null;

window.onAdminReady = function (data) {
  var input = document.querySelector('[data-key="heroSiswaDasar"]');
  if (input) {
    input.value =
      data.values.heroSiswaDasar === undefined || data.values.heroSiswaDasar === null
        ? ''
        : data.values.heroSiswaDasar;
  }
  muatStatistik();
};

function rupiah(n) {
  var angka = Number(n);
  if (!Number.isFinite(angka)) angka = 0;
  return 'Rp' + String(Math.round(angka)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function el(id) {
  return document.getElementById(id);
}

async function muatStatistik() {
  try {
    var res = await fetch('/api/admin-statistik', { headers: authHeaders() });
    var data = await res.json();
    if (res.status === 401) return handleUnauthorized(data.reason);

    el('stat-memuat').hidden = true;

    if (!data.ok) {
      var pesan = data.pesan || data.reason || 'Gagal memuat angka.';
      if (data.sumberGagal && data.sumberGagal.length) {
        pesan += ' Rincian: ' + data.sumberGagal.join('; ');
      }
      el('stat-gagal').textContent = pesan;
      el('stat-gagal').hidden = false;
      return;
    }

    dataTerakhir = data;
    render(data);
    el('stat-isi').hidden = false;
  } catch (err) {
    el('stat-memuat').hidden = true;
    el('stat-gagal').textContent = 'Gagal memuat angka: ' + err.message;
    el('stat-gagal').hidden = false;
  }
}

function render(data) {
  var b = data.batch;

  el('stat-pendaftaran').textContent = b.totalPendaftaran;
  el('stat-siswa').textContent = b.totalOrang;
  el('stat-pendapatan').textContent = rupiah(b.totalPendapatan);

  // Periode ditulis terang-terangan. Angka pendapatan tanpa keterangan
  // "ini periode apa" gampang disalahartikan sebagai total sepanjang
  // waktu, dan itu selisih yang besar.
  if (data.jendela.aktif) {
    el('stat-periode').textContent =
      (data.jendela.mulaiTeks || 'sejak awal') + ' sampai ' + (data.jendela.selesaiTeks || 'sekarang');
    el('stat-periode-catatan').textContent =
      'Periode ini mengikuti tanggal buka dan tutup pendaftaran yang kamu setel di Atur Formulir.';
  } else {
    el('stat-periode').textContent = 'sepanjang waktu';
    el('stat-periode-catatan').textContent =
      data.jendela.alasan +
      ' Jadi yang ditampilkan di bawah adalah seluruh pendaftar, bukan satu batch. ' +
      'Setel mode Sesuai jadwal di Atur Formulir kalau mau angkanya per batch.';
  }

  gambarDonut(b.perPaket);
  gambarBar(b.perPaket);
  gambarTabel(b);
  gambarHero(data.hero);
  gambarCatatan(data);
}

/**
 * Donat pakai stroke-dasharray pada satu lingkaran per irisan.
 *
 * Jari-jarinya 15.9155 supaya kelilingnya persis 100, jadi panjang tiap
 * irisan bisa ditulis langsung sebagai persen tanpa dikonversi lagi.
 */
function gambarDonut(perPaket) {
  var svg = el('stat-donut');
  var kosong = el('stat-donut-kosong');
  var legenda = el('stat-legenda');
  var total = perPaket.reduce(function (a, p) { return a + p.orang; }, 0);

  svg.textContent = '';
  legenda.textContent = '';

  if (total === 0) {
    svg.hidden = true;
    kosong.hidden = false;
    el('stat-donut-desc').textContent = 'Belum ada pendaftar di periode ini.';
    return;
  }
  svg.hidden = false;
  kosong.hidden = true;

  var ns = 'http://www.w3.org/2000/svg';
  var mulai = 25; // offset supaya irisan pertama dimulai dari atas
  var uraian = [];

  perPaket.forEach(function (p, i) {
    if (p.orang === 0) return;
    var persen = (p.orang / total) * 100;

    var c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '21');
    c.setAttribute('cy', '21');
    c.setAttribute('r', '15.9155');
    c.setAttribute('fill', 'transparent');
    c.setAttribute('stroke', WARNA_PAKET[i % WARNA_PAKET.length]);
    c.setAttribute('stroke-width', '6');
    // Irisan dipendekkan sedikit supaya ada celah putih di antaranya.
    // Irisan yang lebih kecil dari celahnya sendiri tidak dipendekkan,
    // kalau tidak ia malah hilang sama sekali.
    var panjang = persen > CELAH_IRISAN * 2 ? persen - CELAH_IRISAN : persen;
    c.setAttribute('stroke-dasharray', panjang + ' ' + (100 - panjang));
    c.setAttribute('stroke-dashoffset', String(mulai));
    svg.appendChild(c);

    mulai -= persen;
    uraian.push(p.nama + ' ' + p.orang + ' siswa (' + Math.round(persen) + '%)');

    var li = document.createElement('li');
    var titik = document.createElement('span');
    titik.className = 'stat-legenda-titik';
    titik.style.background = WARNA_PAKET[i % WARNA_PAKET.length];
    li.appendChild(titik);
    li.appendChild(
      document.createTextNode(p.nama + ' · ' + p.orang + ' siswa (' + Math.round(persen) + '%)')
    );
    legenda.appendChild(li);
  });

  // Angka total di tengah donat.
  var teks = document.createElementNS(ns, 'text');
  teks.setAttribute('x', '21');
  teks.setAttribute('y', '21');
  teks.setAttribute('class', 'stat-donut-angka');
  teks.setAttribute('text-anchor', 'middle');
  teks.setAttribute('dominant-baseline', 'central');
  teks.textContent = String(total);
  svg.appendChild(teks);

  // Pembaca layar tidak bisa membaca irisan donat, jadi isinya ditulis
  // sebagai kalimat di elemen yang ditunjuk aria-labelledby.
  el('stat-donut-desc').textContent = 'Komposisi siswa per paket: ' + uraian.join(', ') + '.';
}

function gambarBar(perPaket) {
  var wrap = el('stat-bars');
  wrap.textContent = '';

  var maks = perPaket.reduce(function (a, p) { return Math.max(a, p.pendapatan); }, 0);

  perPaket.forEach(function (p, i) {
    var baris = document.createElement('div');
    baris.className = 'stat-bar-baris';

    var label = document.createElement('span');
    label.className = 'stat-bar-label';
    label.textContent = p.nama;

    var rel = document.createElement('span');
    rel.className = 'stat-bar-rel';
    var isi = document.createElement('span');
    isi.className = 'stat-bar-isi';
    // Lebar 0 kalau belum ada pendapatan, bukan bar kosong selebar penuh.
    isi.style.width = maks > 0 ? (p.pendapatan / maks) * 100 + '%' : '0%';
    isi.style.background = WARNA_PAKET[i % WARNA_PAKET.length];
    rel.appendChild(isi);

    var nilai = document.createElement('span');
    nilai.className = 'stat-bar-nilai';
    nilai.textContent = rupiah(p.pendapatan);

    baris.appendChild(label);
    baris.appendChild(rel);
    baris.appendChild(nilai);
    wrap.appendChild(baris);
  });
}

function gambarTabel(b) {
  var tbody = el('stat-tabel-isi');
  tbody.textContent = '';

  b.perPaket.forEach(function (p) {
    var tr = document.createElement('tr');
    [
      p.nama,
      rupiah(p.harga),
      String(p.pendaftaran),
      String(p.orang),
      rupiah(p.pendapatan),
    ].forEach(function (nilai, i) {
      var sel = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) sel.setAttribute('scope', 'row');
      sel.textContent = nilai;
      tr.appendChild(sel);
    });
    tbody.appendChild(tr);
  });

  var tfoot = el('stat-tabel-total');
  tfoot.textContent = '';
  var tr = document.createElement('tr');
  ['Total', '', String(b.totalPendaftaran), String(b.totalOrang), rupiah(b.totalPendapatan)].forEach(
    function (nilai, i) {
      var sel = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) sel.setAttribute('scope', 'row');
      sel.textContent = nilai;
      tr.appendChild(sel);
    }
  );
  tfoot.appendChild(tr);
}

function gambarHero(hero) {
  el('stat-hero-dasar').textContent = hero.angkaDasar;
  el('stat-hero-roster').textContent = hero.dariRoster;
  el('stat-hero-total').textContent = hero.total;
}

function gambarCatatan(data) {
  var ul = el('stat-catatan');
  ul.textContent = '';

  var b = data.batch;
  var baris = [];

  if (b.tanpaTanggal > 0) {
    baris.push(
      b.tanpaTanggal +
        ' baris tidak punya tanggal yang terbaca, jadi tidak bisa dipastikan masuk batch ini dan tidak ikut dihitung.'
    );
  }
  if (b.takDikenal > 0) {
    baris.push(
      b.takDikenal +
        ' baris paketnya kosong atau tidak dikenali, jadi ikut dihitung sebagai pendaftaran tapi tidak masuk pendapatan.'
    );
  }
  if (data.sumberGagal && data.sumberGagal.length > 0) {
    baris.push(
      data.sumberGagal.length +
        ' dari ' +
        data.jumlahSumber +
        ' sumber roster gagal diakses, jadi angkanya kurang: ' +
        data.sumberGagal.join('; ')
    );
  }
  if (baris.length === 0) {
    baris.push('Semua baris terbaca rapi, tidak ada yang perlu dirapikan.');
  }

  baris.forEach(function (t) {
    var li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
}

async function simpanDasar() {
  var input = document.querySelector('[data-key="heroSiswaDasar"]');
  var status = el('stat-simpan-status');
  var btn = el('stat-simpan');

  var angka = Number(input.value);
  if (!Number.isFinite(angka) || angka < 0) {
    status.dataset.state = 'error';
    status.textContent = 'Angka dasar harus bilangan nol atau lebih.';
    return;
  }

  btn.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Menyimpan…';

  try {
    var res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ items: { heroSiswaDasar: Math.floor(angka) } }),
    });
    var data = await res.json();

    if (res.status === 401) return handleUnauthorized(data.reason);

    if (res.ok && data.ok) {
      status.dataset.state = 'ok';
      status.textContent = 'Tersimpan. Beranda akan memakai angka baru ini.';
      // Penjumlahan di layar ikut diperbarui supaya yang terlihat sama
      // dengan yang barusan disimpan, tanpa perlu muat ulang halaman.
      if (dataTerakhir) {
        dataTerakhir.hero.angkaDasar = Math.floor(angka);
        dataTerakhir.hero.total = Math.floor(angka) + dataTerakhir.hero.dariRoster;
        gambarHero(dataTerakhir.hero);
      }
    } else {
      status.dataset.state = 'error';
      status.textContent =
        'Gagal menyimpan: ' + (data.message || data.pesan || data.reason || res.status);
    }
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal menyimpan: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', function () {
  el('stat-simpan').addEventListener('click', simpanDasar);
});
