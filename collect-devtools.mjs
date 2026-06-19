// ② 개발자도구 방식 — API의 원본 JSON을 가장 완전하게 수집
//
// ※ 자동/수동 혼합: DevTools UI(작은 다크 텍스트)는 OCR 자동화가 불안정해서,
//   '셋업'까지만 자동화하고 마지막 복사는 사람이 한다(가장 신뢰성 높음).
//   - 자동: 로그인 → 데이터 페이지 → DevTools 열기 → 라이트 테마 전환
//   - 수동: Network에서 데이터 API 클릭 → Response 탭 → Cmd+A → Cmd+C → 'node collect-devtools.mjs save'
import { sleep, gotoUrl, activateChrome } from './lib.mjs';
import { loginViaTree } from './login-tree.mjs';
import { BASE_URL, DATA_PATH, OUTPUT_DIR } from './config.mjs';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const key = (s) => execSync(`osascript -e 'tell application "System Events" to ${s}'`);

(async () => {
  // 'save': 클립보드(Response 복사본)를 레포 바깥 OUTPUT_DIR 에 저장만 하고 종료
  if (process.argv[2] === 'save') {
    const raw = execSync('pbpaste').toString();
    const m = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!m) { console.error('❌ 클립보드에 JSON이 없습니다. Response 탭에서 Cmd+A→Cmd+C 했는지 확인하세요.'); process.exit(1); }
    const data = JSON.parse(m[0]);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const out = path.join(OUTPUT_DIR, 'table-devtools.json');
    fs.writeFileSync(out, JSON.stringify(data, null, 2));
    console.log(`✅ ${Array.isArray(data) ? data.length + '건' : '객체'} → ${out}`);
    return;
  }

  // 셋업 자동화
  await loginViaTree();
  gotoUrl(BASE_URL + DATA_PATH);   // 데이터 API 호출 유발
  await sleep(5000);
  activateChrome(); await sleep(400);
  key('keystroke "i" using {command down, option down}'); await sleep(2500);   // DevTools 열기
  key('keystroke "p" using {command down, shift down}'); await sleep(1000);    // 명령 메뉴
  key('keystroke "light theme"'); await sleep(1000);
  key('key code 36'); await sleep(1500);                                        // Enter → 라이트 테마

  console.log(`
────────────────────────────────────────────────────────
DevTools가 라이트 테마로 열렸습니다. 이제 (수동):
  1) Network 탭 → 'Fetch/XHR' 필터 → 데이터를 담은 요청 클릭
  2) Response 탭 클릭 → JSON 본문 클릭 → Cmd+A → Cmd+C
  3) 터미널에서:  node --env-file=.env collect-devtools.mjs save
  ※ 아이콘/글자가 작으면 DevTools에 포커스 후 Cmd++ 로 확대
────────────────────────────────────────────────────────`);
})().catch((e) => { console.error('에러:', e.message); process.exit(1); });
