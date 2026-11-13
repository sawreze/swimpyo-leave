// Netlify 빌드: dist/ 에 index.html, config.js, _headers 를 만듭니다.
// 비밀 키가 잘못 들어오면 배포를 멈춥니다.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (process.env.SUPABASE_ANON_KEY || '').trim();

function fail(message) {
  console.error(`\n빌드 중단: ${message}\n`);
  process.exit(1);
}
function jwtRole(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part, 'base64url').toString()).role || null; } catch { return null; }
}

if (Boolean(url) !== Boolean(key)) fail('SUPABASE_URL 과 SUPABASE_ANON_KEY 는 함께 설정해야 합니다.');
if (url && !/^https:\/\/[^/]+$/.test(url)) fail('SUPABASE_URL 은 https://xxxx.supabase.co 형식이어야 합니다.');
if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
  fail('비밀 키(service_role / sb_secret)가 설정되어 있습니다. anon 또는 publishable 키로 바꾸고, 노출된 비밀 키는 Supabase 에서 재발급하세요.');
}
if (!url) console.warn('경고: Supabase 값이 없어 테스트 모드로 배포됩니다. 데이터가 각 브라우저에만 저장됩니다.');

const html = readFileSync('index.html', 'utf8');
const hashes = [...html.matchAll(/<script id="[^"]+">([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
if (hashes.length !== 2) fail('index.html 의 인라인 스크립트를 찾지 못했습니다.');

const csp = [
  "default-src 'none'",
  `script-src 'self' ${hashes.join(' ')}`,
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  'img-src data:',
  `connect-src ${url || "'none'"}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
writeFileSync('dist/index.html', html);
writeFileSync('dist/config.js', `window.SWIMPYO_CONFIG = ${JSON.stringify({ supabaseUrl: url, supabaseKey: key })};\n`);
writeFileSync('dist/_headers', `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/config.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n`);
console.log(`dist 생성 완료 (${url ? 'Supabase 연결' : '테스트 모드'})`);
