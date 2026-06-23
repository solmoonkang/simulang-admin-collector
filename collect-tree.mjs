// ① 접근성 트리 방식 — 로그인 후 메뉴를 순회하며 수집.
//   ★ 탭 자동 발견: 메뉴 화면에 탭(role 'tab')이 있으면 사람이 알려주지 않아도
//     스스로 각 탭을 클릭해 들어가 수집한다. 탭이 없으면 그 화면을 바로 수집한다.
//   결과 키:  탭 없으면 "<메뉴>", 탭 있으면 "<메뉴>/<탭>"
import { enableAccessibilityForFrontmostApp, AccessibilityTree, initLogger } from '@simular-ai/simulang-js';
import { humanMove, sleep, activateChrome } from './lib.mjs';
import { loginViaTree } from './login-tree.mjs';
import { MENUS, SKIP_TABS, OUTPUT_DIR } from './config.mjs';
import fs from 'node:fs';
import path from 'node:path';
initLogger(null, 'warn');   // 마우스 이동 info 로그 억제(스크립트 자체 로그만 남김)

const lct = (n) => (n.localizedControlType || '').trim();
function snap() { enableAccessibilityForFrontmostApp(); return AccessibilityTree.fromForeground().snapshot(false); }
const flat = (root) => { const o = []; (function w(n){ o.push(n); for (const c of n.children ?? []) w(c); })(root); return o; };
function findWeb(root) { let w = null; (function f(n){ if (lct(n) === 'HTML 콘텐츠' && !w) w = n; for (const c of n.children ?? []) f(c); })(root); return w; }
function clean(n) {
  const role = lct(n) || ('role' + n.role), name = (n.name || '').trim(), value = (n.value || '').trim();
  const kids = (n.children ?? []).map(clean).filter(Boolean);
  if (!name && !value && !kids.length) return null;
  const o = { role }; if (name) o.name = name; if (value) o.value = value; if (kids.length) o.children = kids; return o;
}
function texts(n, acc = []) { if (n.name) acc.push(n.name); if (n.value) acc.push(n.value); for (const c of n.children ?? []) texts(c, acc); return acc; }
const center = (b) => [Math.round((b.left + b.right) / 2), Math.round((b.top + b.bottom) / 2)];
const linkText = (n) => (n.children ?? []).map((c) => (c.value || c.name || '').trim()).join(' ').trim();

function menuCenters(root) {
  const map = {};
  for (const n of flat(root)) if (lct(n) === '링크' && n.boundingBox) { const t = linkText(n); if (MENUS.includes(t)) map[t] = center(n.boundingBox); }
  return map;
}
// 현재 화면에서 탭(role 'tab'/'탭') 발견 → [{name, pos}]
function findTabs(root) {
  const seen = new Set(), out = [];
  for (const n of flat(root)) {
    if (!['tab', '탭'].includes(lct(n)) || !n.boundingBox) continue;
    const name = (n.name || linkText(n)).trim(); if (!name || seen.has(name)) continue;
    seen.add(name); out.push({ name, pos: center(n.boundingBox) });
  }
  return out;
}
// 현재 화면 1개를 수집해 표준 형태로 반환
function collectCurrent() {
  const r = snap(), web = findWeb(r);
  return {
    textCount: web ? [...new Set(texts(web, []))].length : 0,
    rows: flat(r).filter((n) => lct(n) === '행').length,
    cells: flat(r).filter((n) => lct(n) === '셀').length,
    tree: web ? clean(web) : null,
  };
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
    if (!c) { console.log(`[skip] ${m} (메뉴 좌표 못 찾음)`); continue; }
    await humanMove(c[0], c[1], true);     // 메뉴 진입
    await sleep(2800);

    const tabs = findTabs(snap());         // ★ 탭 자동 발견
    if (!tabs.length) {
      all[m] = collectCurrent();
      console.log(`[ok] ${m} → 행 ${all[m].rows} 셀 ${all[m].cells} 텍스트 ${all[m].textCount}`);
      continue;
    }
    console.log(`[tabs] ${m}: ${tabs.map((t) => t.name).join(', ')}`);
    for (const t of tabs) {
      if (SKIP_TABS.includes(t.name)) { console.log(`   - ${t.name} [건너뜀: SKIP_TABS]`); continue; }
      await humanMove(t.pos[0], t.pos[1], true);
      await sleep(2600);
      const data = collectCurrent();
      all[`${m}/${t.name}`] = data;
      console.log(`   - ${m}/${t.name} → 행 ${data.rows} 셀 ${data.cells} 텍스트 ${data.textCount}`);
    }
  }
  const rawDir = path.join(OUTPUT_DIR, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const out = path.join(rawDir, 'all-menus-tree.json');
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  console.log('✅ 저장:', out);
})().catch((e) => { console.error('에러:', e.message); process.exit(1); });
