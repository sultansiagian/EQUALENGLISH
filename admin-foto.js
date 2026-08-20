/**
 * Unggah foto untuk panel admin, dipakai bersama /admin dan /atur-kelas.
 *
 * Cara pakainya di HTML:
 *   <div class="admin-photo" data-slot="logo">
 *     <span class="admin-photo-label">Logo</span>
 *     <img class="admin-photo-preview" alt="" hidden />
 *     <input type="file" accept="image/*" class="admin-photo-input" />
 *     <span class="admin-photo-status"></span>
 *   </div>
 *
 * Slot baru cukup didaftarkan di PHOTO_SLOT_SPECS dan SLOT_TO_KEY di
 * bawah, plus di SLOT_KEYS pada api/admin-upload.js. Tidak ada kode
 * tambahan yang perlu ditulis di halamannya.
 *
 * Foto TIDAK punya tombol simpan terpisah: selesai diunggah berarti
 * sudah tayang. Halaman yang memuat file ini cuma perlu memanggil
 * loadPhotoPreviews(values) waktu datanya siap.
 */
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
  // Templat sertifikat. Dibatasi 2000px supaya tetap di bawah batas body
  // request Vercel, tapi 'contain' cuma MENGECILKAN kalau lebih besar,
  // tidak pernah membesarkan dan tidak pernah memotong. PNG, bukan JPEG:
  // sertifikat isinya bidang warna rata dan teks tajam, dan justru di
  // situ artefak JPEG paling kelihatan sebagai bayangan di tepi huruf.
  sertifikatTemplate: { width: 2000, height: 2000, mode: 'contain', type: 'image/png', quality: 1 },
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
  sertifikatTemplate: 'sertifikatTemplateUrl',
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
      // Templat sertifikat punya pengatur posisi nama yang menempel
      // padanya, jadi begitu gambarnya berganti, pratinjaunya harus
      // ikut digambar ulang dengan gambar yang baru.
      if (slot === 'sertifikatTemplate') siapkanPratinjauSertifikat(data.url);
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

// Dipasang sendiri begitu file ini dimuat, jadi halaman yang memakainya
// tidak perlu mengingat memasang listener-nya.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.admin-photo').forEach(function (container) {
    var input = container.querySelector('.admin-photo-input');
    if (!input) return;
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) handlePhotoUpload(container, input.files[0]);
    });
  });
});
