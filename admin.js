/**
 * Logika halaman /admin: konten beranda (teks, harga, foto) dan testimoni.
 *
 * Login-nya TIDAK di sini -- ditangani admin-auth.js yang dimuat lebih
 * dulu dan dipakai bersama halaman /pendaftar. File ini cuma menyediakan
 * window.onAdminReady di bawah, yang dipanggil admin-auth.js setelah
 * login terverifikasi sebagai admin.
 *
 * Daftar pendaftar baru juga TIDAK di sini lagi -- pindah ke
 * pendaftar.js, karena jumlahnya tumbuh terus sementara isi halaman ini
 * tetap.
 */

window.onAdminReady = function (data) {
  fillForm(data.values);
  loadPhotoPreviews(data.values);
  faq = Array.isArray(data.values.faq)
    ? data.values.faq.map(function (f) {
        return { tanya: f.tanya || '', jawab: f.jawab || '' };
      })
    : [];
  renderFaqList();

  testimonials = Array.isArray(data.values.testimonials)
    ? data.values.testimonials.map(function (t) {
        return Object.assign({}, t);
      })
    : [];
  renderTestiList();
  muatKiriman();
};

// ============================================================
// FORM TEKS & HARGA
// ============================================================

function fillForm(values) {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (!(key in values)) return;
    const value = values[key];
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value;
    }
  });
}

function collectFormItems() {
  const items = {};
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (el.type === 'checkbox') {
      items[key] = el.checked;
    } else if (el.type === 'number') {
      items[key] = Number(el.value);
    } else {
      items[key] = el.value;
    }
  });
  return items;
}

function setSaveStatus(state, text) {
  const el = document.getElementById('admin-save-status');
  el.textContent = text;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

async function saveForm() {
  const btn = document.getElementById('admin-save-btn');
  let berhasil = false;
  tombolSibuk(btn, true);
  setSaveStatus(null, 'Menyimpan…');

  try {
    const res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ items: collectFormItems() }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      berhasil = true;
      tandaiAdminTersimpan();
      setSaveStatus('ok', 'Tersimpan. Biasanya tayang di situs dalam ~10 detik.');
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setSaveStatus('error', 'Gagal menyimpan: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setSaveStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    tombolSibuk(btn, false);
    if (berhasil) tombolBerhasil(btn);
  }
}

// ============================================================
// FOTO -- kompresi di browser (canvas) lalu upload sebagai data URL base64
// ============================================================

// width/height = ukuran target akhir. mode 'cover' memotong bagian tengah
// foto supaya pas persis ke rasio target (dipakai untuk foto yang punya
// slot ukuran tetap di index.html/OG banner). mode 'contain' cuma
// mengecilkan kalau lebih besar dari target, tanpa memotong dan tanpa
// memperbesar (dipakai untuk logo, biar tidak ada bagian logo yang hilang).
// ============================================================
// TESTIMONI
//
// Beda dari field lain di halaman ini yang tiap satunya punya elemen
// tetap di admin.html: jumlah testimoni bebas, jadi barisnya dibuat dari
// JavaScript. State-nya disimpan di array testimonials di bawah, dan
// baru dikirim ke server sekaligus waktu tombol "Simpan Testimoni"
// ditekan (beda dari foto logo/komunitas dst yang langsung tayang
// begitu diupload).
// ============================================================

let testimonials = [];

function testiTemplate(index, item) {
  const row = document.createElement('div');
  row.className = 'admin-testi';
  row.dataset.index = index;
  row.innerHTML =
    '<div class="admin-testi-head">' +
    '<h3>Testimoni ' + (index + 1) + '</h3>' +
    '<button type="button" class="admin-testi-remove" aria-label="Hapus testimoni ini">Hapus</button>' +
    '</div>' +
    '<div class="admin-testi-grid">' +
    '<label class="admin-field"><span>Nama</span><input type="text" data-t="nama" /></label>' +
    '<label class="admin-field"><span>Fakultas / angkatan</span><input type="text" data-t="fakultas" /></label>' +
    '<label class="admin-field"><span>Skor EPT</span><input type="text" data-t="skorEpt" placeholder="mis. 620" /></label>' +
    '</div>' +
    '<label class="admin-field"><span>Kesan pesan</span><textarea data-t="pesan" rows="3"></textarea></label>' +
    '<div class="admin-testi-photo">' +
    '<img class="admin-testi-preview" alt="" hidden />' +
    '<div>' +
    '<span class="admin-field-label">Foto (opsional)</span>' +
    '<input type="file" accept="image/*" class="admin-testi-file" />' +
    '<span class="admin-testi-status"></span>' +
    '</div>' +
    '</div>';

  row.querySelector('[data-t="nama"]').value = item.nama || '';
  row.querySelector('[data-t="fakultas"]').value = item.fakultas || '';
  row.querySelector('[data-t="skorEpt"]').value = item.skorEpt || '';
  row.querySelector('[data-t="pesan"]').value = item.pesan || '';
  if (item.fotoUrl) {
    const img = row.querySelector('.admin-testi-preview');
    img.src = item.fotoUrl;
    img.hidden = false;
  }

  // Tiap ketikan langsung disimpan ke array state, supaya menambah/
  // menghapus baris lain tidak menghilangkan yang sudah diketik (daftar
  // ini digambar ulang penuh setiap kali berubah jumlahnya).
  row.querySelectorAll('[data-t]').forEach((input) => {
    input.addEventListener('input', () => {
      testimonials[index][input.dataset.t] = input.value;
    });
  });

  row.querySelector('.admin-testi-remove').addEventListener('click', () => {
    // Sebut namanya, supaya jelas baris mana yang akan hilang -- semua
    // tombol Hapus di daftar ini kelihatan sama persis.
    const nama = String(testimonials[index].nama || '').trim();
    const konfirmasi = window.confirm(
      'Hapus testimoni ' + (nama ? '"' + nama + '"' : 'ini') + '? ' +
        'Belum benar-benar hilang sampai kamu menekan Simpan Testimoni, ' +
        'jadi kalau salah tekan, muat ulang halaman ini.'
    );
    if (!konfirmasi) return;
    testimonials.splice(index, 1);
    tandaiAdminBerubah();
    renderTestiList();
  });

  row.querySelector('.admin-testi-file').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadTestiPhoto(index, row, e.target.files[0]);
  });

  return row;
}

// ============================================================
// FAQ
// ============================================================
//
// Pola persis sama dengan testimoni di atas, dan itu disengaja: dua-duanya
// daftar yang panjangnya bebas, dua-duanya disimpan sebagai array di
// Global Config, dan dua-duanya TIDAK tampil di beranda selama kosong.
// Menyamakan bentuknya berarti siapa pun yang sudah paham satu, otomatis
// paham yang lain.
//
// Bedanya cuma satu: tidak ada foto, jadi tidak ada jalur unggah.
let faq = [];

function faqTemplate(index, item) {
  const row = document.createElement('div');
  row.className = 'admin-testi';
  row.innerHTML =
    '<div class="admin-testi-head">' +
    '<span class="admin-testi-no">' + (index + 1) + '</span>' +
    '<button type="button" class="admin-faq-remove" aria-label="Hapus pertanyaan ini">Hapus</button>' +
    '</div>' +
    '<label class="admin-field"><span>Pertanyaan</span>' +
    '<input type="text" data-f="tanya" /></label>' +
    '<label class="admin-field"><span>Jawaban</span>' +
    '<textarea data-f="jawab" rows="4"></textarea></label>';

  row.querySelectorAll('[data-f]').forEach((input) => {
    input.value = item[input.dataset.f] || '';
    input.addEventListener('input', () => {
      faq[index][input.dataset.f] = input.value;
      // Menyalakan peringatan sebelum meninggalkan halaman, sama seperti
      // isian lain di /admin. Tanpa ini, jawaban FAQ yang panjang bisa
      // hilang tanpa peringatan apa pun.
      tandaiAdminBerubah();
    });
  });

  row.querySelector('.admin-faq-remove').addEventListener('click', () => {
    // Konfirmasi sebelum menghapus, sama seperti testimoni. Jawaban yang
    // sudah ditulis panjang tidak boleh hilang karena satu klik meleset.
    const tanya = String(faq[index].tanya || '').trim();
    const pesan =
      'Hapus pertanyaan ' + (tanya ? '"' + tanya + '"' : 'ini') + '? ' +
      'Perubahan baru berlaku setelah kamu tekan Simpan FAQ.';
    if (!window.confirm(pesan)) return;
    faq.splice(index, 1);
    tandaiAdminBerubah();
    renderFaqList();
  });

  return row;
}

function renderFaqList() {
  const list = document.getElementById('admin-faq-list');
  if (!list) return;
  list.textContent = '';
  if (faq.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-hint admin-testi-empty';
    empty.textContent =
      'Belum ada pertanyaan. Section FAQ dan tautannya di menu tidak tampil di ' +
      'beranda sampai kamu tambah minimal satu yang lengkap.';
    list.appendChild(empty);
    return;
  }
  faq.forEach((item, i) => list.appendChild(faqTemplate(i, item)));
}

function setFaqStatus(state, teks) {
  const el = document.getElementById('admin-faq-status');
  if (!el) return;
  el.textContent = teks;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

async function saveFaq() {
  const btn = document.getElementById('admin-faq-save');
  tombolSibuk(btn, true);
  setFaqStatus(null, 'Menyimpan…');

  try {
    const res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        items: {
          faq: faq,
          faqTitle: document.querySelector('[data-key="faqTitle"]').value,
          faqDesc: document.querySelector('[data-key="faqDesc"]').value,
        },
      }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      tandaiAdminTersimpan();
      const lengkap = faq.filter(
        (f) => String(f.tanya || '').trim() && String(f.jawab || '').trim()
      ).length;
      setFaqStatus(
        'ok',
        lengkap === 0
          ? 'Tersimpan. Section FAQ belum tampil karena belum ada yang lengkap.'
          : 'Tersimpan. ' + lengkap + ' pertanyaan tayang di beranda.'
      );
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setFaqStatus('error', 'Gagal menyimpan: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setFaqStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    tombolSibuk(btn, false);
  }
}

function renderTestiList() {
  const list = document.getElementById('admin-testi-list');
  list.textContent = '';
  if (testimonials.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-hint admin-testi-empty';
    empty.textContent =
      'Belum ada testimoni. Section ini tidak tampil di beranda sampai kamu tambah minimal satu.';
    list.appendChild(empty);
    return;
  }
  testimonials.forEach((item, i) => list.appendChild(testiTemplate(i, item)));
}

async function uploadTestiPhoto(index, row, file) {
  const input = row.querySelector('.admin-testi-file');
  const status = row.querySelector('.admin-testi-status');
  input.disabled = true;
  status.removeAttribute('data-state');
  status.textContent = 'Mengompres…';

  try {
    const compressed = await compressImage(file, TESTI_PHOTO_SPEC);
    status.textContent = 'Mengupload…';
    const dataUrl = await blobToDataUrl(compressed);

    const res = await fetch('/api/admin-upload', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ slot: 'testimonialPhoto', dataUrl }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      testimonials[index].fotoUrl = data.url;
      const img = row.querySelector('.admin-testi-preview');
      img.src = data.url;
      img.hidden = false;
      status.dataset.state = 'ok';
      status.textContent = 'Foto siap. Klik Simpan Testimoni.';
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      status.dataset.state = 'error';
      status.textContent = 'Gagal upload: ' + (data.message || data.reason || res.status);
    }
  } catch (err) {
    status.dataset.state = 'error';
    status.textContent = 'Gagal upload: ' + err.message;
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

function setTestiStatus(state, text) {
  const el = document.getElementById('admin-testi-status');
  el.textContent = text;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

async function saveTestimonials() {
  const btn = document.getElementById('admin-testi-save');
  let berhasil = false;
  tombolSibuk(btn, true);
  setTestiStatus(null, 'Menyimpan…');

  try {
    const res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        items: {
          testimonials: testimonials,
          testiTitle: document.querySelector('[data-key="testiTitle"]').value,
          testiDesc: document.querySelector('[data-key="testiDesc"]').value,
        },
      }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      berhasil = true;
      tandaiAdminTersimpan();
      const tampil = testimonials.filter(
        (t) => String(t.nama || '').trim() && String(t.pesan || '').trim()
      ).length;
      setTestiStatus(
        'ok',
        tampil === 0
          ? 'Tersimpan, tapi belum ada yang tampil di beranda (butuh nama + kesan pesan).'
          : 'Tersimpan. ' + tampil + ' testimoni tampil di beranda dalam ~10 detik.'
      );
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setTestiStatus('error', 'Gagal menyimpan: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setTestiStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    tombolSibuk(btn, false);
    if (berhasil) tombolBerhasil(btn);
  }
}

// ============================================================
// CEK KONEKSI -- lihat api/admin-diagnose.js
// ============================================================

async function runDiagnose() {
  const btn = document.getElementById('admin-diagnose-btn');
  const out = document.getElementById('admin-diagnose-output');

  // Tanpa label "Tersimpan" di akhir: hasil cek koneksi keluar di kotak
  // hitam di bawahnya, dan "berhasil dijalankan" belum tentu berarti
  // hasilnya bagus.
  tombolSibuk(btn, true, 'Mengecek…');
  out.hidden = false;
  out.textContent = 'Mengecek…';

  try {
    const res = await fetch('/api/admin-diagnose', { headers: authHeaders() });
    const data = await res.json();

    if (res.status === 401) {
      handleUnauthorized(data.reason);
      return;
    }
    if (!res.ok || !data.ok) {
      out.textContent = 'Cek koneksi gagal dijalankan: ' + (data.reason || res.status);
      return;
    }
    out.textContent = JSON.stringify(data.report, null, 2);
  } catch (err) {
    out.textContent = 'Cek koneksi gagal dijalankan: ' + err.message;
  } finally {
    tombolSibuk(btn, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-save-btn').addEventListener('click', saveForm);
  document.getElementById('admin-diagnose-btn').addEventListener('click', runDiagnose);
  const faqSave = document.getElementById('admin-faq-save');
  if (faqSave) faqSave.addEventListener('click', saveFaq);
  const faqAdd = document.getElementById('admin-faq-add');
  if (faqAdd) {
    faqAdd.addEventListener('click', () => {
      faq.push({ tanya: '', jawab: '' });
      renderFaqList();
      // Fokus ke kolom Pertanyaan baris baru, sama seperti testimoni.
      const rows = document.querySelectorAll('#admin-faq-list .admin-testi');
      const last = rows[rows.length - 1];
      if (last) last.querySelector('[data-f="tanya"]').focus();
    });
  }

  document.getElementById('admin-testi-save').addEventListener('click', saveTestimonials);
  document.getElementById('admin-testi-add').addEventListener('click', () => {
    testimonials.push({ nama: '', fakultas: '', skorEpt: '', pesan: '', fotoUrl: '' });
    renderTestiList();
    // Fokus ke kolom Nama baris yang baru dibuat, supaya bisa langsung
    // mengetik tanpa harus mengarahkan kursor sendiri.
    const rows = document.querySelectorAll('.admin-testi');
    const last = rows[rows.length - 1];
    if (last) last.querySelector('[data-t="nama"]').focus();
  });

  // Listener foto dipasang admin-foto.js.
});

// ============================================================
// KIRIMAN TESTIMONI DARI SISWA
// ============================================================
// Kiriman siswa tersimpan di tab Testimoni di spreadsheet, TIDAK di
// konten situs. Yang tayang di beranda cuma yang disalin ke array
// "testimonials" lewat tombol Tayangkan di sini. Alasan pemisahannya ada
// di api/admin-testimoni.js.

var kirimanTerakhir = [];

async function muatKiriman() {
  var status = document.getElementById('kiriman-status');
  if (!status) return;

  try {
    var res = await fetch('/api/admin-data?bagian=testimoni', { headers: authHeaders() });
    var data = await res.json();
    if (res.status === 401) return handleUnauthorized(data.reason);

    if (!res.ok || !data.ok) {
      status.textContent = 'Gagal memuat kiriman: ' + (data.pesan || data.reason || res.status);
      status.dataset.state = 'error';
      return;
    }

    kirimanTerakhir = data.testimoni || [];
    status.hidden = true;
    renderKiriman();
  } catch (err) {
    status.textContent = 'Gagal memuat kiriman: ' + err.message;
    status.dataset.state = 'error';
  }
}

function renderKiriman() {
  var wrap = document.getElementById('kiriman-list');
  wrap.textContent = '';

  if (kirimanTerakhir.length === 0) {
    var kosong = document.createElement('p');
    kosong.className = 'admin-hint';
    kosong.textContent =
      'Belum ada kiriman. Siswa baru bisa mengisi ini setelah seluruh sesi kelasnya selesai.';
    wrap.appendChild(kosong);
    return;
  }

  kirimanTerakhir.forEach(function (t, i) {
    var kartu = document.createElement('div');
    kartu.className = 'kiriman-item' + (t.sudahTayang ? ' kiriman-item-tayang' : '');

    var kepala = document.createElement('div');
    kepala.className = 'kiriman-kepala';

    var nama = document.createElement('strong');
    nama.textContent = t.nama || '(tanpa nama)';
    kepala.appendChild(nama);

    // Fakultas dan skor cuma ditampilkan kalau ada. Baris meta yang
    // isinya tanda hubung kosong lebih berisik daripada tidak ada.
    var metaTeks = [t.fakultas, t.skorEpt ? 'EPT ' + t.skorEpt : '', t.waktu]
      .filter(Boolean)
      .join(' · ');
    if (metaTeks) {
      var meta = document.createElement('span');
      meta.className = 'kiriman-meta';
      meta.textContent = metaTeks;
      kepala.appendChild(meta);
    }

    // Dua penanda yang berbeda artinya, jadi sengaja tidak digabung:
    // izin datang dari SISWA, tayang adalah keputusan admin.
    var badgeIzin = document.createElement('span');
    badgeIzin.className = 'kiriman-badge' + (t.izinTayang ? ' kiriman-badge-izin' : ' kiriman-badge-privat');
    badgeIzin.textContent = t.izinTayang ? 'boleh ditayangkan' : 'khusus admin';
    kepala.appendChild(badgeIzin);

    if (t.sudahTayang) {
      var badge = document.createElement('span');
      badge.className = 'kiriman-badge';
      badge.textContent = 'tayang di beranda';
      kepala.appendChild(badge);
    }

    var pesan = document.createElement('p');
    pesan.className = 'kiriman-pesan';
    pesan.textContent = t.pesan;

    var aksi = document.createElement('div');
    aksi.className = 'kiriman-aksi';

    // Tanpa izin siswa, tombol tayangkan tidak ditawarkan sama sekali.
    // Server juga menolaknya (lihat api/admin-testimoni.js) -- yang di
    // sini semata supaya tidak ada tombol yang kelihatan bisa ditekan
    // padahal pasti gagal.
    //
    // Yang SUDAH terlanjur tayang tetap diberi tombol turunkan, apa pun
    // izinnya. Mencabut sesuatu dari halaman publik tidak boleh pernah
    // terhalang.
    if (t.izinTayang || t.sudahTayang) {
      var tombol = document.createElement('button');
      tombol.type = 'button';
      tombol.className = 'admin-btn ' + (t.sudahTayang ? 'admin-btn-ghost' : 'admin-btn-primary');
      tombol.textContent = t.sudahTayang ? 'Turunkan dari beranda' : 'Tayangkan di beranda';
      tombol.addEventListener('click', function () {
        prosesKiriman(i, t.sudahTayang ? 'turunkan' : 'tayangkan', tombol);
      });
      aksi.appendChild(tombol);
    } else {
      var catatan = document.createElement('span');
      catatan.className = 'kiriman-catatan';
      catatan.textContent =
        'Siswa ini tidak mengizinkan ceritanya ditampilkan di halaman publik. ' +
        'Isinya cuma untuk kamu baca.';
      aksi.appendChild(catatan);
    }

    var statusAksi = document.createElement('span');
    statusAksi.className = 'admin-save-status kiriman-status';
    aksi.appendChild(statusAksi);

    kartu.appendChild(kepala);
    kartu.appendChild(pesan);
    kartu.appendChild(aksi);
    wrap.appendChild(kartu);
  });
}

async function prosesKiriman(indeks, aksi, tombol) {
  var t = kirimanTerakhir[indeks];
  var statusEl = tombol.parentNode.querySelector('.kiriman-status');

  tombol.disabled = true;
  statusEl.removeAttribute('data-state');
  statusEl.textContent = aksi === 'tayangkan' ? 'Menayangkan…' : 'Menurunkan…';

  try {
    var res = await fetch('/api/admin-data', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        bagian: 'testimoni',
        aksi: aksi,
        id: t.id,
        nama: t.nama,
        fakultas: t.fakultas,
        skorEpt: t.skorEpt,
        pesan: t.pesan,
      }),
    });
    var data = await res.json();

    if (res.status === 401) return handleUnauthorized(data.reason);

    if (res.ok && data.ok) {
      kirimanTerakhir[indeks].sudahTayang = aksi === 'tayangkan';
      renderKiriman();
      // Daftar testimoni beranda di atas TIDAK ikut disegarkan di sini.
      // Isinya baru dibaca ulang waktu halaman dimuat berikutnya, dan
      // menyegarkannya sekarang berisiko menimpa suntingan yang sedang
      // diketik admin di daftar itu tapi belum ditekan Simpan.
      return;
    }

    statusEl.dataset.state = 'error';
    statusEl.textContent = data.pesan || data.reason || 'Gagal (' + res.status + ').';
  } catch (err) {
    statusEl.dataset.state = 'error';
    statusEl.textContent = 'Gagal: ' + err.message;
  } finally {
    tombol.disabled = false;
  }
}
