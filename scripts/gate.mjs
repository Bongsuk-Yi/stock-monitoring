// 비밀번호 게이트 (trend-signal 과 같은 방식)
// HTML/JSON 을 gzip → AES-256-GCM 으로 암호화하고, 브라우저가 비밀번호로 복호화한다.
//   키 유도: PBKDF2-HMAC-SHA256 310,000회, 16바이트 salt / 암호화: AES-256-GCM, 12바이트 IV
// 비밀번호는 저장소에 넣지 않고 환경변수 SITE_PASSWORD(GitHub Secret)로만 받는다.
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const ITER = 310000;

export function sitePassword() {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) { console.error('SITE_PASSWORD 환경변수가 없습니다. 암호 없이 배포하지 않도록 빌드를 멈춥니다.'); process.exit(1); }
  return pw;
}

// 같은 빌드 안의 여러 파일은 salt·키를 공유해 브라우저가 키를 한 번만 만들게 한다
export function makeKey(password, salt = randomBytes(16)) { return { salt, key: pbkdf2Sync(Buffer.from(password, 'utf8'), salt, ITER, 32, 'sha256') }; }
export function encrypt(plain, password, K = makeKey(password)) {
  const { salt, key } = K, iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(gzipSync(Buffer.from(plain), { level: 9 })), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: ITER, cipher: 'AES-256-GCM', compression: 'gzip', salt: salt.toString('base64'), iv: iv.toString('base64'), data: ct.toString('base64') };
}

// 브라우저 쪽 복호화 함수(문자열로 페이지에 넣는다)
export const DECRYPT_JS = `
async function __decrypt(env, pw) {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(env.salt), iterations: env.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, key, b64(env.data)));
  if (env.compression === 'gzip') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return new TextDecoder().decode(bytes);
}`;

// 잠금 버튼: 복호화된 페이지 안에 넣는다
export const LOCK_SNIPPET = (storeKey) => `<button type="button" id="__lock" title="저장된 비밀번호를 지우고 잠급니다" onclick="try{localStorage.removeItem('${storeKey}');sessionStorage.removeItem('${storeKey}')}catch(e){};location.reload()" style="position:fixed;right:14px;bottom:14px;z-index:9999;border:1px solid rgba(128,128,128,.4);background:rgba(20,20,20,.72);color:#fff;border-radius:99px;padding:6px 12px;font:600 12px system-ui,sans-serif;cursor:pointer;opacity:.75">🔒 잠금</button>`;

// 페이지 전체를 암호화한 게이트 HTML
export function gatePage({ title, mark, storeKey, envelope, theme = 'dark' }) {
  const dark = theme === 'dark';
  const C = dark
    ? { bg: '#0b0e11', box: '#161a1e', line: '#2b3139', fg: '#eaecef', dim: '#848e9c', acc: '#f0b90b', accInk: '#181a20' }
    : { bg: '#f4f5f7', box: '#ffffff', line: '#dfe3e8', fg: '#1b1f24', dim: '#6b7280', acc: '#008254', accInk: '#ffffff' };
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">
<title>${title}</title><meta name="theme-color" content="${C.bg}">
<style>
html,body{margin:0;height:100%;background:${C.bg};color:${C.fg};font-family:system-ui,-apple-system,'Noto Sans KR','Apple SD Gothic Neo',sans-serif}
.gate{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.gate-box{width:100%;max-width:360px;background:${C.box};border:1px solid ${C.line};border-radius:14px;padding:32px 28px;text-align:center;box-sizing:border-box}
.gate-mark{font-size:34px;line-height:1}
.gate-box h1{font-size:19px;margin:12px 0 6px}
.gate-sub{color:${C.dim};font-size:13px;margin:0 0 20px}
.gate-box input[type=password]{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid ${C.line};background:${C.bg};color:${C.fg};font-size:15px;outline:none}
.gate-box input[type=password]:focus{border-color:${C.acc}}
.gate-remember{display:flex;align-items:center;gap:6px;justify-content:center;font-size:13px;color:${C.dim};margin:12px 0 16px}
.gate-box button{width:100%;padding:11px;border:0;border-radius:9px;background:${C.acc};color:${C.accInk};font-weight:700;font-size:15px;cursor:pointer}
.gate-box button:disabled{opacity:.5;cursor:default}
.gate-err{color:#e5484d;font-size:13px;margin:14px 0 0}
.gate-note{color:${C.dim};font-size:11.5px;margin:18px 0 0;line-height:1.5;opacity:.8}
</style></head><body>
<div class="gate"><form class="gate-box" id="gate-form" autocomplete="on">
  <div class="gate-mark">${mark}</div><h1>${title}</h1>
  <p class="gate-sub">이 페이지는 암호화되어 있습니다. 비밀번호를 입력하세요.</p>
  <input type="text" name="username" value="${storeKey}" autocomplete="username" hidden>
  <input type="password" id="pw" placeholder="비밀번호" autocomplete="current-password" required>
  <label class="gate-remember"><input type="checkbox" id="remember" checked> 이 브라우저에 기억</label>
  <button type="submit" id="unlock">열기</button>
  <p class="gate-err" id="gate-err" hidden></p>
  <p class="gate-note">복호화는 브라우저에서만 이루어집니다. 비밀번호는 어디로도 전송되지 않습니다.</p>
</form></div>
<script id="__env" type="application/json">${JSON.stringify(envelope)}</script>
<script>
${DECRYPT_JS}
(() => {
  const KEY = ${JSON.stringify(storeKey)}, $ = (id) => document.getElementById(id);
  const env = JSON.parse($('__env').textContent);
  const get = () => { try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch (_) { return null; } };
  async function unlock(pw, remember, silent) {
    const btn = $('unlock'), err = $('gate-err'); err.hidden = true; btn.disabled = true; btn.textContent = '복호화 중…';
    try {
      const html = await __decrypt(env, pw);
      try { if (remember) localStorage.setItem(KEY, pw); else { localStorage.removeItem(KEY); sessionStorage.setItem(KEY, pw); } } catch (_) {}
      document.open(); document.write(html); document.close();
    } catch (e) {
      try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (_) {}
      if (!silent) { err.textContent = '비밀번호가 올바르지 않습니다.'; err.hidden = false; }
      $('pw').value = ''; $('pw').focus(); btn.disabled = false; btn.textContent = '열기';
    }
  }
  $('gate-form').addEventListener('submit', (e) => { e.preventDefault(); unlock($('pw').value, $('remember').checked); });
  const saved = get(); if (saved) unlock(saved, !!localStorage.getItem(KEY), true); else $('pw').focus();
})();
</script></body></html>`;
}

export function decryptNode(env, password) {
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(env.salt, 'base64'), env.iterations, 32, 'sha256');
  const buf = Buffer.from(env.data, 'base64'), tag = buf.subarray(buf.length - 16), ct = buf.subarray(0, buf.length - 16);
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64')); d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(ct), d.final()]);
  return (env.compression === 'gzip' ? gunzipSync(plain) : plain).toString('utf8');
}
