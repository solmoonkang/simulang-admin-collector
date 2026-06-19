// ③ 비전(스크린샷+OCR) 방식 — 트리/API가 없는 화면용 폴백
// 표 페이지를 스크롤하며 캡처 → tesseract OCR → 행 식별자(ROW_ANCHOR)로 중복제거 → Qwen(로컬)으로 구조화
// 칼럼/행식별 패턴/데이터 경로는 .env 에서 사이트별로 지정한다. 정확도는 트리/개발자도구보다 낮다.
import { ocr, sleep, mouse, gotoUrl } from './lib.mjs';
import { screenshotFull, Screen } from '@simular-ai/simulang-js';
import { loginViaTree } from './login-tree.mjs';
import { BASE_URL, DATA_PATH, COLUMNS, ROW_ANCHOR, OUTPUT_DIR } from './config.mjs';
import { execSync } from 'node:child_process';
import { createWorker } from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';

const cy = (b) => (b.y0 + b.y1) / 2, cx = (b) => (b.x0 + b.x1) / 2;
const cap = (p) => screenshotFull(false, Screen.mainScreen()).save(p);
const anchorOf = (l) => { const m = l.replace(/[\s,]/g, '').match(ROW_ANCHOR); return m ? m[0] : null; };

function dataLines(d) {
  const words = d.words.filter((x) => cx(x.bbox) > 280 && x.text.trim().length > 0 && x.conf > 35).sort((a, b) => cy(a.bbox) - cy(b.bbox));
  const rows = []; let cur = [], lastY = null;
  for (const x of words) {
    const y = cy(x.bbox);
    if (lastY === null || Math.abs(y - lastY) < 22) { cur.push(x); lastY = lastY === null ? y : lastY * 0.6 + y * 0.4; }
    else { rows.push(cur); cur = [x]; lastY = y; }
  }
  if (cur.length) rows.push(cur);
  return rows.map((r) => r.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter((l) => ROW_ANCHOR.test(l.replace(/[\s,]/g, '')));
}

// Qwen 구조화 — curl 사용(undici fetch 헤더 타임아웃 회피)
function qwenStructure(lines) {
  const schema = JSON.stringify(Object.fromEntries(COLUMNS.map((c) => [c, ''])));
  const prompt = `다음 각 줄은 표의 한 행이다(OCR이라 띄어쓰기가 깨질 수 있음). 줄마다 아래 칼럼으로 분해해 JSON 배열로만 출력. 다른 말 금지.
${schema}
줄:
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
  fs.writeFileSync('/tmp/_collector_q.json', JSON.stringify({ model: 'qwen2.5:3b', prompt, stream: false, options: { temperature: 0, num_predict: 3000 } }));
  const out = execSync('curl -s --max-time 600 http://localhost:11434/api/generate -d @/tmp/_collector_q.json', { maxBuffer: 1 << 24 }).toString();
  const resp = JSON.parse(out).response; const m = resp.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : [];
}

(async () => {
  if (!COLUMNS.length) throw new Error('COLUMNS 가 비어있습니다. (.env 에 표 칼럼명을 콤마로 지정)');
  await loginViaTree();
  gotoUrl(BASE_URL + DATA_PATH);
  await sleep(5000);
  // OCR 가독성 위해 페이지 확대
  execSync(`osascript -e 'tell application "System Events" to keystroke "0" using {command down}'`); await sleep(300);
  for (let i = 0; i < 2; i++) { execSync(`osascript -e 'tell application "System Events" to keystroke "+" using {command down}'`); await sleep(300); }
  await sleep(800);

  const w = await createWorker('kor');
  mouse.moveMouse(700, 500, 0); await sleep(200);
  for (let i = 0; i < 12; i++) { mouse.scroll(0, -500); await sleep(80); } await sleep(800); // 맨 위로

  const seen = new Set(), lines = []; let dry = 0;
  for (let s = 0; s < 14 && dry < 2; s++) {
    cap('/tmp/_collector_svc.png');
    const ls = dataLines(await ocr(w, '/tmp/_collector_svc.png'));
    let added = 0;
    for (const l of ls) { const k = anchorOf(l); if (k && !seen.has(k)) { seen.add(k); lines.push(l); added++; } }
    console.log(`scroll ${s}: +${added} (누적 ${lines.length})`);
    if (added === 0) dry++; else dry = 0;
    mouse.scroll(0, 520); await sleep(900);
  }
  await w.terminate();

  const rows = qwenStructure(lines);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const out = path.join(OUTPUT_DIR, 'table-vision.json');
  fs.writeFileSync(out, JSON.stringify({ source: '스크린샷→OCR→Qwen', count: rows.length, rows }, null, 2));
  console.log(`✅ ${rows.length}행 → ${out}`);
})().catch((e) => { console.error('에러:', e.message); process.exit(1); });
