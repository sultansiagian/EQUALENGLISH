// Modul bawaan Node, bukan dependency tambahan -- verifikasi signature JWT
// secara lokal, sama persis pendekatannya dengan verifyGoogleTokenLocal() di
// api/verify-access.js.
const crypto = require('crypto');

/**
 * Verifikasi ID token dari Google Sign-In, DIPISAH dari api/verify-access.js
 * supaya file itu (yang sudah jalan dan melindungi akses siswa ke kelas.html)
 * tidak ikut disentuh sama sekali waktu nambah fitur admin ini. Isinya sama
 * persis logikanya (disalin, bukan diimpor dari sana) -- kalau nanti ada bug
 * yang ditemukan di salah satu, cek juga yang satunya.
 *
 * Dipakai oleh api/_lib/admin-guard.js untuk melindungi /api/admin-content
 * dan /api/admin-upload.
 */

const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // kunci publik Google jarang rotasi
let jwksCache = null; // { promise, expiresAt }

function cachedJwksFetch(fetcher) {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.promise;
  const promise = fetcher().catch((err) => {
    jwksCache = null;
    throw err;
  });
  jwksCache = { promise, expiresAt: now + JWKS_CACHE_TTL_MS };
  return promise;
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(withPadding, 'base64');
}

async function getGoogleJwks() {
  const text = await cachedJwksFetch(async () => {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!res.ok) throw new Error('status ' + res.status);
    return res.text();
  });
  const data = JSON.parse(text);
  return Array.isArray(data.keys) ? data.keys : [];
}

async function verifyLocal(idToken, expectedClientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'token_invalid' };
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));

  if (header.alg !== 'RS256' || !header.kid) {
    return { valid: false, reason: 'token_invalid' };
  }

  let keys = await getGoogleJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    jwksCache = null; // mungkin Google baru rotasi kunci, ambil ulang sekali
    keys = await getGoogleJwks();
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return { valid: false, reason: 'token_invalid' };

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signedData = Buffer.from(headerB64 + '.' + payloadB64);
  const signature = base64UrlDecode(sigB64);
  const signatureValid = crypto.verify('RSA-SHA256', signedData, publicKey, signature);
  if (!signatureValid) return { valid: false, reason: 'token_invalid' };

  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    return { valid: false, reason: 'token_invalid' };
  }
  if (payload.aud !== expectedClientId) {
    return { valid: false, reason: 'wrong_audience' };
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    return { valid: false, reason: 'email_unverified' };
  }
  const expiresAt = Number(payload.exp) * 1000;
  if (!expiresAt || Date.now() > expiresAt) {
    return { valid: false, reason: 'token_expired' };
  }

  return { valid: true, email: String(payload.email || '').toLowerCase() };
}

// Cadangan kalau verifikasi lokal gagal karena sebab TEKNIS (bukan karena
// tokennya memang tidak valid) -- sama seperti verifyGoogleTokenRemote di
// api/verify-access.js.
async function verifyRemote(idToken, expectedClientId) {
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
  );
  if (!res.ok) return { valid: false, reason: 'token_invalid' };

  const payload = await res.json();
  if (payload.aud !== expectedClientId) return { valid: false, reason: 'wrong_audience' };
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    return { valid: false, reason: 'email_unverified' };
  }
  const expiresAt = Number(payload.exp) * 1000;
  if (!expiresAt || Date.now() > expiresAt) return { valid: false, reason: 'token_expired' };

  return { valid: true, email: String(payload.email || '').toLowerCase() };
}

async function verifyGoogleIdToken(idToken, expectedClientId) {
  try {
    return await verifyLocal(idToken, expectedClientId);
  } catch (err) {
    console.error(
      'admin: verifikasi token lokal gagal (' + err.message + '), fallback ke tokeninfo Google.'
    );
    try {
      return await verifyRemote(idToken, expectedClientId);
    } catch (err2) {
      console.error('admin: verifikasi token via fallback juga gagal: ' + err2.message);
      return { valid: false, reason: 'token_invalid' };
    }
  }
}

module.exports = { verifyGoogleIdToken };
