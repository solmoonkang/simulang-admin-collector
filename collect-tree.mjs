// ① 접근성 트리 방식 — 로그인 후 지정한 메뉴들을 마우스로 순회하며 트리 스냅샷 → JSON
// 가장 빠르고 깨끗(OCR 불필요). 수집할 메뉴 목록은 .env 의 MENUS 에서 지정한다.
import { enableAccessibilityForFrontmostApp, AccessibilityTree } from '@simular-ai/simulang-js';
import { humanMove, sleep, activateChrome } from './lib.mjs';
import { loginViaTree } from './login-tree.mjs';
import { MENUS, OUTPUT_DIR } from './config.mjs';
import fs from 'node:fs';
import path from 'node:path';

const lct = (n) => (n.localizedControlType || '').trim();
function snap() { enableAccessibilityForFrontmostApp(); return AccessibilityTree.fromForeground().snapshot(false); }
function findWeb(root) { let w = null; (function f(n) { if (lct(n) === 'HTML 콘텐츠' && !w) w = n; for (const c of n.children ?? []) f(c); })(root); return w; }
function clean(n) {
  const role = lct(n) || ('role' + n.role), name = (n.name || '').trim(), value = (n.value || '').trim();
  const kids = (n.children ?? []).map(clean).filter(Boolean);
  if (!name && !value && !kids.length) return null;
  const o = { role }; if (name) o.name = name; if (value) o.value = value; if (kids.length) o.children = kids; return o;
}
function texts(n, acc) { if (n.name) acc.push(n.name); if (n.value) acc.push(n.value); for (const c of n.children ?? []) texts(c, acc); return acc; }
function menuCenters(root) {
  const map = {};
  (function w(n) {
    if (lct(n) === '링크') {
      const t = (n.children ?? []).map((c) => (c.value || c.name || '').trim()).join(' ').trim();
      const hit = MENUS.find((m) => t === m);
      if (hit && n.boundingBox) { const b = n.boundingBox; map[hit] = [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)]; }
    }
    for (const c of n.children ?? []) w(c);
  })(root);
  return map;
}

(async () => {
  if (!MENUS.length) throw new Error('MENUS 가 비어있습니다. (.env 에 수집할 메뉴 이름을 콤마로 지정)');
  await loginViaTree();
  await sleep(1500);
  activateChrome();
  const centers = menuCenters(snap());

  const all = {};
  for (const m of MENUS) {
    const c = centers[m];
    if (!c) { console.log(`[skip] ${m} (좌표 못 찾음)`); continue; }
    await humanMove(c[0], c[1], true);   // GUI 마우스 클릭
    await sleep(2800);                   // 로드 대기
    const web = findWeb(snap());
    all[m] = { textCount: web ? [...new Set(texts(web, []))].length : 0, tree: web ? clean(web) : null };
    console.log(`[ok] ${m} → 텍스트노드 ${all[m].textCount}개`);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const out = path.join(OUTPUT_DIR, 'all-menus-tree.json');
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  console.log('✅ 저장:', out);
})().catch((e) => { console.error('에러:', e.message); process.exit(1); });
