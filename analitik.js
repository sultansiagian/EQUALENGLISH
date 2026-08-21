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
    var res = await fetch('/api/admin-data?bagian=statistik', { headers: authHeaders() });
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

    // Tiga angka besar sengaja dihitung naik SETELAH wadahnya dibuka.
    // Dijalankan sebelum itu, animasinya habis di balik elemen yang
    // masih hidden dan yang terlihat cuma angka akhirnya -- gerak yang
    // dibayar ongkosnya tapi tidak pernah dilihat siapa pun.
    hitungAngkaUtama(data.sepanjangWaktu);
  } catch (err) {
    el('stat-memuat').hidden = true;
    el('stat-gagal').textContent = 'Gagal memuat angka: ' + err.message;
    el('stat-gagal').hidden = false;
  }
}

/* Angka "Sepanjang Waktu" menghitung naik dari nol, sama seperti angka
   statistik di beranda. Cuma tiga angka ini, dan cuma sekali waktu
   halaman selesai memuat: angka yang berubah-ubah kalau dianimasikan
   tiap kali nilainya berganti akan terbaca seperti halaman memuat
   ulang, bukan seperti data yang diperbarui. */
function hitungAngkaUtama(semua) {
  hitungNaik(el('all-pendaftaran'), Number(semua.totalPendaftaran) || 0);
  hitungNaik(el('all-siswa'), Number(semua.totalOrang) || 0);
  hitungNaik(el('all-pendapatan'), Number(semua.totalPendapatan) || 0, rupiah);
}

function render(data) {
  var semua = data.sepanjangWaktu;

  gambarBatch(data);

  // Komposisi paket mengikuti batch yang SEDANG BERJALAN, karena itu
  // yang sedang bisa dipengaruhi. Kalau belum ada batch sama sekali,
  // yang ditampilkan komposisi sepanjang waktu.
  var aktif = (data.batchList || []).filter(function (x) { return x.aktif; })[0];
  var dipakai = aktif ? aktif.statistik : semua;
  el('komposisi-periode').textContent = aktif ? aktif.nama : 'sepanjang waktu';

  gambarDonut(dipakai.perPaket);
  gambarBar(dipakai.perPaket);
  gambarTabel(dipakai);
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

  // Paket yang sebagian pendaftarnya membayar dengan harga lain diberi
  // tanda bintang. Tanpa itu, baris "Rp59.000 x 18" terlihat seperti
  // salah hitung waktu tidak cocok dengan kolom pendapatannya.
  var adaBeragam = b.perPaket.some(function (p) { return p.hargaBeragam; });

  b.perPaket.forEach(function (p) {
    var tr = document.createElement('tr');
    [
      p.nama,
      rupiah(p.harga) + (p.hargaBeragam ? ' *' : ''),
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

  var catatan = el('stat-harga-catatan');
  catatan.hidden = !adaBeragam;
  if (adaBeragam) {
    catatan.textContent =
      'Tanda * berarti sebagian pendaftar di periode ini membayar dengan harga yang berbeda, karena harganya pernah diubah. Kolom Pendapatan sudah memakai harga yang benar-benar berlaku saat mereka mendaftar, jadi harga dikali pendaftaran di baris itu memang tidak akan cocok dengan kolom pendapatannya.';
  }
}

function gambarHero(hero) {
  el('stat-hero-dasar').textContent = hero.angkaDasar;
  el('stat-hero-roster').textContent = hero.dariRoster;
  el('stat-hero-total').textContent = hero.total;
}

function gambarCatatan(data) {
  var ul = el('stat-catatan');
  ul.textContent = '';

  var b = data.sepanjangWaktu;
  var baris = [];

  if (b.tanpaTanggal > 0) {
    baris.push(
      b.tanpaTanggal +
        ' baris tidak punya tanggal yang terbaca, jadi tidak bisa dipastikan masuk batch mana dan tidak ikut dihitung di rincian batch.'
    );
  }
  if (b.takDikenal > 0) {
    baris.push(
      b.takDikenal +
        ' baris paketnya kosong atau tidak dikenali, jadi ikut dihitung sebagai pendaftaran tapi tidak masuk pendapatan.'
    );
  }
  // Selisih antara total sepanjang waktu dan jumlah seluruh batch.
  //
  // Ini bisa terjadi dan bukan bug: baris yang kolom Timestamp-nya tidak
  // terbaca tetap masuk hitungan sepanjang waktu (di sana tanggalnya
  // memang tidak dipakai), tapi tidak bisa ditempatkan ke batch mana pun.
  // Tanpa dikatakan, dua angka yang tidak cocok di satu layar terlihat
  // seperti salah hitung.
  var daftarBatch = data.batchList || [];
  if (daftarBatch.length > 0) {
    var jumlahBatch = daftarBatch.reduce(function (a, x) {
      return {
        pendaftaran: a.pendaftaran + x.statistik.totalPendaftaran,
        pendapatan: a.pendapatan + x.statistik.totalPendapatan,
      };
    }, { pendaftaran: 0, pendapatan: 0 });

    var selisihPendaftaran = b.totalPendaftaran - jumlahBatch.pendaftaran;
    if (selisihPendaftaran > 0) {
      baris.push(
        selisihPendaftaran +
          " baris tidak masuk batch mana pun karena tanggalnya tidak terbaca, senilai " +
          rupiah(b.totalPendapatan - jumlahBatch.pendapatan) +
          ". Itu sebabnya jumlah semua batch lebih kecil dari total sepanjang waktu. Perbaiki kolom Timestamp barisnya di spreadsheet supaya ikut terhitung."
      );
    }
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

  var berhasil = false;
  tombolSibuk(btn, true);
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
      berhasil = true;
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
    tombolSibuk(btn, false);
    if (berhasil) tombolBerhasil(btn);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  el('stat-simpan').addEventListener('click', simpanDasar);
  pasangTombolBatch();
});

// ============================================================
// CATATAN BATCH
// ============================================================
// Yang disimpan server cuma rentang waktu tiap batch; angkanya dihitung
// ulang dari roster tiap halaman ini dibuka. Lihat alasannya di
// api/_lib/handler-statistik.js.

// Warna per batch, berputar. Sengaja beda TERANGNYA, bukan cuma beda
// rona, jadi bar-nya tetap bisa dibedakan waktu dicetak hitam putih.
var WARNA_BATCH = ['#000000', '#ffacdf', '#5c5b5b', '#ffd7ef', '#8a8888'];

function tanggalSingkat(iso) {
  if (!iso) return null;
  var d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function periodeBatch(b) {
  var mulai = tanggalSingkat(b.mulai);
  var selesai = tanggalSingkat(b.selesai);
  if (!mulai && !selesai) return 'sejak awal sampai sekarang';
  if (!mulai) return 'sejak awal sampai ' + selesai;
  if (!selesai) return mulai + ' sampai sekarang';
  return mulai + ' sampai ' + selesai;
}

function gambarBatch(data) {
  var daftar = data.batchList || [];
  var wrap = el('batch-list');
  var chartWrap = el('batch-chart-wrap');
  wrap.textContent = '';

  el('batch-jumlah').textContent = daftar.length === 0 ? '' : daftar.length + ' batch';
  el('batch-kosong').hidden = daftar.length > 0;
  chartWrap.hidden = daftar.length < 2;

  // Tombolnya saling menggantikan, bukan dua-duanya tampil: sebelum ada
  // batch cuma "mulai" yang masuk akal, sesudahnya cuma "tutup".
  var adaAktif = daftar.some(function (b) { return b.aktif; });
  el('batch-mulai').hidden = daftar.length > 0;
  el('batch-tutup').hidden = !adaAktif;

  // Terbaru di atas: batch yang sedang berjalan yang paling sering dilihat.
  var urut = daftar.slice().reverse();

  urut.forEach(function (b) {
    var asli = daftar.indexOf(b);
    var kartu = document.createElement('div');
    kartu.className = 'batch-item' + (b.aktif ? ' batch-item-aktif' : '');

    var kepala = document.createElement('div');
    kepala.className = 'batch-kepala';

    var titik = document.createElement('span');
    titik.className = 'batch-titik';
    titik.style.background = WARNA_BATCH[asli % WARNA_BATCH.length];
    kepala.appendChild(titik);

    var nama = document.createElement('strong');
    nama.textContent = b.nama;
    kepala.appendChild(nama);

    if (b.aktif) {
      var badge = document.createElement('span');
      badge.className = 'batch-badge';
      badge.textContent = 'sedang berjalan';
      kepala.appendChild(badge);
    }

    var periode = document.createElement('span');
    periode.className = 'batch-periode';
    periode.textContent = periodeBatch(b);
    kepala.appendChild(periode);

    var ganti = document.createElement('button');
    ganti.type = 'button';
    ganti.className = 'batch-ganti-nama';
    ganti.textContent = 'Ganti nama';
    ganti.addEventListener('click', function () { gantiNamaBatch(asli, b.nama); });
    kepala.appendChild(ganti);

    var angka = document.createElement('div');
    angka.className = 'batch-angka';
    var s = b.statistik;
    [
      ['Pendaftaran', String(s.totalPendaftaran)],
      ['Siswa', String(s.totalOrang)],
      ['Pendapatan', rupiah(s.totalPendapatan)],
    ].forEach(function (pasang) {
      var kotak = document.createElement('div');
      kotak.innerHTML =
        '<span class="batch-angka-label"></span><strong class="batch-angka-nilai"></strong>';
      kotak.querySelector('.batch-angka-label').textContent = pasang[0];
      kotak.querySelector('.batch-angka-nilai').textContent = pasang[1];
      angka.appendChild(kotak);
    });

    // Rincian paket per batch, supaya tidak perlu menebak dari mana
    // pendapatannya datang.
    var rinci = document.createElement('p');
    rinci.className = 'batch-rinci';
    rinci.textContent = s.perPaket
      .map(function (p) { return p.nama + ' ' + p.pendaftaran; })
      .join(' · ');

    kartu.appendChild(kepala);
    kartu.appendChild(angka);
    kartu.appendChild(rinci);
    wrap.appendChild(kartu);
  });

  gambarBatchBars(daftar);
}

function gambarBatchBars(daftar) {
  var wrap = el('batch-bars');
  wrap.textContent = '';
  var maks = daftar.reduce(function (a, b) { return Math.max(a, b.statistik.totalPendapatan); }, 0);

  daftar.forEach(function (b, i) {
    var baris = document.createElement('div');
    baris.className = 'stat-bar-baris';

    var label = document.createElement('span');
    label.className = 'stat-bar-label';
    label.textContent = b.nama;

    var rel = document.createElement('span');
    rel.className = 'stat-bar-rel';
    var isi = document.createElement('span');
    isi.className = 'stat-bar-isi';
    isi.style.width = maks > 0 ? (b.statistik.totalPendapatan / maks) * 100 + '%' : '0%';
    isi.style.background = WARNA_BATCH[i % WARNA_BATCH.length];
    rel.appendChild(isi);

    var nilai = document.createElement('span');
    nilai.className = 'stat-bar-nilai';
    nilai.textContent = rupiah(b.statistik.totalPendapatan);

    baris.appendChild(label);
    baris.appendChild(rel);
    baris.appendChild(nilai);
    wrap.appendChild(baris);
  });
}

async function aksiBatch(aksi, isi) {
  var status = el('batch-status');
  var tombol = [el('batch-mulai'), el('batch-tutup')];

  tombol.forEach(function (t) { t.disabled = true; });
  status.removeAttribute('data-state');
  status.textContent = 'Menyimpan…';

  try {
    var res = await fetch('/api/admin-data', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify(Object.assign({ bagian: 'statistik', aksi: aksi }, isi || {})),
    });
    var data = await res.json();

    if (res.status === 401) return handleUnauthorized(data.reason);

    if (res.ok && data.ok) {
      status.dataset.state = 'ok';
      status.textContent = 'Tersimpan. Menghitung ulang…';
      // Angkanya dihitung ulang server, jadi halaman ini memuat ulang
      // datanya daripada menebak sendiri hasilnya.
      await muatStatistik();
      return;
    }

    status.dataset.state = 'error';
    status.textContent = data.pesan || data.reason || 'Gagal (' + res.status + ').';
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal: ' + err.message;
  } finally {
    tombol.forEach(function (t) { t.disabled = false; });
  }
}

function gantiNamaBatch(indeks, namaSekarang) {
  var nama = window.prompt('Nama batch ini:', namaSekarang);
  if (nama === null) return;
  nama = nama.trim();
  if (!nama) return;
  aksiBatch('ganti-nama', { indeks: indeks, nama: nama });
}

function pasangTombolBatch() {
  el('batch-mulai').addEventListener('click', function () {
    aksiBatch('mulai');
  });
  el('batch-tutup').addEventListener('click', function () {
    if (
      !window.confirm(
        'Tutup batch yang sedang berjalan dan mulai batch baru?\n\n' +
          'Pendaftar setelah ini masuk ke batch baru. Angka batch lama tidak berubah.'
      )
    ) {
      return;
    }
    aksiBatch('tutup');
  });
}
