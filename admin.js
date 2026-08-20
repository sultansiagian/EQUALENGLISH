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
  btn.disabled = true;
  setSaveStatus(null, 'Menyimpan…');

  try {
    const res = await fetch('/api/admin-content', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ items: collectFormItems() }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      setSaveStatus('ok', 'Tersimpan. Biasanya tayang di situs dalam ~10 detik.');
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setSaveStatus('error', 'Gagal menyimpan: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setSaveStatus('error', 'Gagal menyimpan: ' + err.message);
  } finally {
    btn.disabled = false;
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
const PHOTO_SLOT_SPECS = {
  logo: { width: 400, height: 400, mode: 'contain', type: 'image/webp', quality: 0.9 },
  photoKomunitas: { width: 1600, height: 1064, mode: 'cover', type: 'image/webp', quality: 0.82 },
  photoKelasZoom: { width: 1600, height: 1200, mode: 'cover', type: 'image/webp', quality: 0.82 },
  // JPEG, bukan WebP -- beberapa platform share link (WhatsApp/Instagram)
  // kadang tidak konsisten menampilkan preview WebP untuk og:image.
  ogBanner: { width: 1200, height: 630, mode: 'cover', type: 'image/jpeg', quality: 0.85 },
  // Tanda tangan sertifikat. Mendatar dan lebar, jadi rasionya beda
  // sendiri. 'contain' supaya coretannya tidak terpotong berapa pun
  // bentuk foto aslinya, dan PNG supaya garis tipis tidak berbayang
  // seperti pada JPEG.
  tandaTangan: { width: 600, height: 200, mode: 'contain', type: 'image/png', quality: 1 },
};

// Foto testimoni: kecil dan bulat di halaman (52px, lihat .testi-avatar di
// styles.css), tapi disimpan 200x200 supaya tetap tajam di layar
// beresolusi tinggi. 'cover' supaya wajah tidak gepeng berapa pun rasio
// foto aslinya.
const TESTI_PHOTO_SPEC = {
  width: 200,
  height: 200,
  mode: 'cover',
  type: 'image/webp',
  quality: 0.85,
};

const SLOT_TO_KEY = {
  logo: 'logoUrl',
  photoKomunitas: 'photoKomunitasUrl',
  photoKelasZoom: 'photoKelasZoomUrl',
  ogBanner: 'ogBannerUrl',
  tandaTangan: 'sertifikatTandaTanganUrl',
};

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File bukan gambar yang valid'));
    img.src = URL.createObjectURL(file);
  });
}

async function compressImage(file, spec) {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (spec.mode === 'cover') {
    canvas.width = spec.width;
    canvas.height = spec.height;
    const scale = Math.max(spec.width / img.width, spec.height / img.height);
    const sw = spec.width / scale;
    const sh = spec.height / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, spec.width, spec.height);
  } else {
    const scale = Math.min(spec.width / img.width, spec.height / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal mengompres gambar'))),
      spec.type,
      spec.quality
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function setPhotoStatus(container, state, text) {
  const el = container.querySelector('.admin-photo-status');
  el.textContent = text;
  if (state) el.dataset.state = state;
  else el.removeAttribute('data-state');
}

function showPhotoPreview(container, url) {
  const img = container.querySelector('.admin-photo-preview');
  img.src = url;
  img.hidden = false;
}

function loadPhotoPreviews(values) {
  document.querySelectorAll('.admin-photo').forEach((container) => {
    const slot = container.dataset.slot;
    const key = SLOT_TO_KEY[slot];
    if (values[key]) showPhotoPreview(container, values[key]);
  });
}

async function handlePhotoUpload(container, file) {
  const slot = container.dataset.slot;
  const spec = PHOTO_SLOT_SPECS[slot];
  const input = container.querySelector('.admin-photo-input');

  input.disabled = true;
  setPhotoStatus(container, null, 'Mengompres…');

  try {
    const compressed = await compressImage(file, spec);
    setPhotoStatus(container, null, 'Mengupload…');
    const dataUrl = await blobToDataUrl(compressed);

    const res = await fetch('/api/admin-upload', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({ slot, dataUrl }),
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      showPhotoPreview(container, data.url);
      setPhotoStatus(container, 'ok', 'Tersimpan dan langsung tayang.');
    } else if (res.status === 401) {
      handleUnauthorized(data.reason);
    } else {
      setPhotoStatus(container, 'error', 'Gagal upload: ' + (data.message || data.reason || res.status));
    }
  } catch (err) {
    setPhotoStatus(container, 'error', 'Gagal upload: ' + err.message);
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

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
    testimonials.splice(index, 1);
    renderTestiList();
  });

  row.querySelector('.admin-testi-file').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) uploadTestiPhoto(index, row, e.target.files[0]);
  });

  return row;
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
  btn.disabled = true;
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
    btn.disabled = false;
  }
}

// ============================================================
// CEK KONEKSI -- lihat api/admin-diagnose.js
// ============================================================

async function runDiagnose() {
  const btn = document.getElementById('admin-diagnose-btn');
  const out = document.getElementById('admin-diagnose-output');

  btn.disabled = true;
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
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('admin-save-btn').addEventListener('click', saveForm);
  document.getElementById('admin-diagnose-btn').addEventListener('click', runDiagnose);
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

  document.querySelectorAll('.admin-photo').forEach((container) => {
    const input = container.querySelector('.admin-photo-input');
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handlePhotoUpload(container, input.files[0]);
    });
  });
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
