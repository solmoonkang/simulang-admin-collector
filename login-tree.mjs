// 접근성 트리로 로그인 (setValue/activate) — 가장 안정적
// 로그인 폼의 셀렉터(SEL_*)는 .env 에서 사이트별로 지정한다.
import { enableAccessibilityForFrontmostApp, AccessibilityTree } from '@simular-ai/simulang-js';
import { execSync } from 'node:child_process';
import { sleep, activateChrome } from './lib.mjs';
import { BASE_URL, LOGIN_ID, LOGIN_PW, SEL } from './config.mjs';

const lct = (n) => (n.localizedControlType || '').trim();
function findAll(root, pred) {
  const out = [];
  (function w(n) { if (pred(n)) out.push(n); for (const c of n.children ?? []) w(c); })(root);
  return out;
}

export async function loginViaTree() {
  execSync(`open ${JSON.stringify(BASE_URL + '/login')}`);
  activateChrome();
  await sleep(5000);
  enableAccessibilityForFrontmostApp();
  await sleep(2000);

  const tree = AccessibilityTree.fromForeground();
  const root = tree.snapshot(false);
  const idField  = findAll(root, (n) => n.refId != null && n.name === SEL.idName && lct(n) !== '텍스트')[0];
  const pwField  = findAll(root, (n) => n.refId != null && lct(n) === SEL.pwType)[0];
  const loginBtn = findAll(root, (n) => n.refId != null && n.name === SEL.btnName)[0];
  if (!(idField && pwField && loginBtn)) throw new Error('로그인 폼 요소를 트리에서 찾지 못함 (.env 의 SEL_* 확인)');

  tree.setValue(idField.refId, LOGIN_ID); await sleep(600);
  tree.setValue(pwField.refId, LOGIN_PW); await sleep(600);
  tree.activate(loginBtn.refId);
  await sleep(5500);

  // 성공 검증: 로그인 버튼이 사라졌는지
  let still = false;
  (function w(n) { if (n.name === SEL.btnName) still = true; for (const c of n.children ?? []) w(c); })(
    AccessibilityTree.fromForeground().snapshot(false));
  if (still) throw new Error('로그인 실패(폼 잔존 — 자격증명 또는 CAPTCHA/2FA 확인)');
  console.log('✅ 로그인 성공');
}

if (import.meta.url === `file://${process.argv[1]}`) loginViaTree().catch((e) => { console.error('에러:', e.message); process.exit(1); });
