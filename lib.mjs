// 공용 유틸: 사람처럼 움직이는 마우스/스크롤, 스크린샷+OCR, 좌표변환, 입력
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  MouseController, KeyboardController, Button, Coordinate, Direction, Key,
} from '@simular-ai/simulang-js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = () => Math.random();
// const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // (원본) 약한 가속→감속
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // 학습반영: 더 강한 가속→감속(중간 빠름=속도 편차↑)

export const mouse = new MouseController();
export const kb = new KeyboardController();

// --- dry-run(테스트) 모드 ---------------------------------------------------
// setTraceSink(fn) 을 설정하면 실제 마우스를 움직이지 않고, 생성한 각 점을
// fn({x,y,dt,pause}) 로 흘려보낸다. 시작 좌표는 실제 커서 대신 가상 커서로 추적.
let traceSink = null, traceCursor = null;
export function setTraceSink(fn, start = null) { traceSink = fn; traceCursor = start; }
const curPos = () => (traceSink && traceCursor ? traceCursor : mouse.location());

// --- 한 획(stroke): 곡선 + 좌우 흔들림 + 중간 멈칫 ---
async function moveStroke(tx, ty, allowPause) {
  const [sx, sy] = curPos();
  const dist = Math.hypot(tx - sx, ty - sy) || 1;
  // const detour = Math.max(dist * 0.5, 55) * (0.4 + rand() * 0.7);  // (원본) 매번 크게 우회
  // 학습반영: 평소엔 거의 직선(직진도 ~0.96), 25%만 크게 휨(직진도 ~0.5)
  const detour = rand() < 0.25
    ? Math.max(dist * (0.18 + rand() * 0.28), 30)   // 가끔 크게 우회
    : dist * (0.02 + rand() * 0.07);                // 평소 거의 직선
  const side = rand() < 0.5 ? 1 : -1;
  const nx = (-(ty - sy) / dist) * side, ny = ((tx - sx) / dist) * side; // 진행방향 수직
  const cx = (sx + tx) / 2 + nx * detour, cy = (sy + ty) / 2 + ny * detour;
  const steps = Math.round(22 + dist / 5);
  const waveAmp = 2 + rand() * 6, waveFreq = (1 + rand() * 2) * Math.PI * 2, wavePh = rand() * Math.PI * 2;
  const pauseAt = allowPause && rand() < 0.55 ? Math.floor(steps * (0.25 + rand() * 0.45)) : -1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = ease(t);
    let x = (1 - e) ** 2 * sx + 2 * (1 - e) * e * cx + e ** 2 * tx;
    let y = (1 - e) ** 2 * sy + 2 * (1 - e) * e * cy + e ** 2 * ty;
    const w = Math.sin(t * waveFreq + wavePh) * waveAmp * (1 - t); // 좌우 흔들림
    x += nx * w; y += ny * w;
    x += (rand() - 0.5) * 1.6; y += (rand() - 0.5) * 1.6;          // 미세 떨림
    let d = 8 + rand() * 13;
    if (t < 0.15 || t > 0.85) d += 4 + rand() * 9; // 시작/끝 더 느리게
    // 멈칫: 12% 확률 긴 멈칫(~800~1200ms) / 그 외 130~410ms  (원본: 130 + rand*280)
    const pauseMs = (i === pauseAt) ? (rand() < 0.12 ? 800 + rand() * 400 : 130 + rand() * 280) : 0;
    const px = Math.round(x), py = Math.round(y);
    if (traceSink) {
      traceSink({ x: px, y: py, dt: d, pause: pauseMs });   // dry-run: 점만 기록
    } else {
      mouse.moveMouse(px, py, Coordinate.Abs);
      await sleep(d);
      if (pauseMs) await sleep(pauseMs);
    }
  }
  if (traceSink) traceCursor = [tx, ty];   // 가상 커서를 목표로 이동
}

// 사람처럼: 곡선 + 흔들림 + 멈칫 + 가끔 목표를 지나쳤다 되돌아오는 보정
export async function humanMove(tx, ty, doClick = true) {
  const wps = [];
  if (rand() < 0.5) { // overshoot 후 보정
    const [sx, sy] = curPos();
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    wps.push([Math.round(tx + ((tx - sx) / d) * (8 + rand() * 18)),
              Math.round(ty + ((ty - sy) / d) * (8 + rand() * 18))]);
  }
  wps.push([tx, ty]);
  for (let i = 0; i < wps.length; i++) {
    await moveStroke(wps[i][0], wps[i][1], i === 0);
    if (i < wps.length - 1 && !traceSink) await sleep(70 + rand() * 150);
  }
  if (traceSink) return;                 // dry-run: 클릭/망설임 생략
  await sleep(90 + rand() * 170); // 클릭 전 망설임
  if (doClick) mouse.button(Button.Left, Direction.Click);
}

// 사람처럼 스크롤: 작은 양을 여러 번(틱) + 버스트 사이 쉼 + 가변 속도 + 가끔 반대보정
export async function humanScroll(totalY) {
  const dir = Math.sign(totalY) || 1;
  let remaining = Math.abs(totalY);
  while (remaining > 0) {
    const burst = Math.min(remaining, 40 + Math.floor(rand() * 90));
    const tick = 9 + Math.floor(rand() * 12);
    let done = 0;
    while (done < burst) {
      const step = Math.min(tick, burst - done);
      mouse.scroll(0, dir * step);
      done += step;
      await sleep(55 + rand() * 110);
    }
    remaining -= burst;
    let rest = 350 + rand() * 600;
    if (rand() < 0.25) rest += 600 + rand() * 1100;
    await sleep(rest);
    if (rand() < 0.15) { mouse.scroll(0, -dir * (14 + Math.floor(rand() * 22))); await sleep(180 + rand() * 280); }
  }
}

// 클립보드 경유 붙여넣기(한글/React 입력 안정성)
export function pasteText(text) {
  execSync('pbcopy', { input: text });
  kb.key(Key.Meta, Direction.Press);
  kb.key(Key.V, Direction.Click);
  kb.key(Key.Meta, Direction.Release);
}
export function pressEnter() { kb.key(Key.Return, Direction.Click); }
export function activateChrome() { execSync(`osascript -e 'tell application "Google Chrome" to activate'`); }

// 크롬 active 탭 URL 이동(키보드 네비게이션보다 안정적)
export function gotoUrl(url) {
  execSync(`osascript -e 'tell application "Google Chrome" to set URL of active tab of front window to ${JSON.stringify(url)}'`);
}

const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };

// 대상 사이트 탭을 '1개'만 남기고 정리한 뒤 그 탭을 재사용해 이동한다.
// (같은 호스트의 중복 탭만 닫으므로 노션 등 다른 탭은 보존된다 → 새 탭 누적 방지)
export function focusSiteTab(url) {
  const host = hostOf(url);
  const script = `tell application "Google Chrome"
  if (count of windows) = 0 then make new window
  set theWin to front window
  set keepIdx to 0
  set toClose to {}
  repeat with i from 1 to (count of tabs of theWin)
    if (URL of tab i of theWin) contains "${host}" then
      if keepIdx = 0 then
        set keepIdx to i
      else
        set end of toClose to i
      end if
    end if
  end repeat
  repeat with k from (count of toClose) to 1 by -1
    close tab (item k of toClose) of theWin
  end repeat
  if keepIdx = 0 then
    make new tab at end of tabs of theWin with properties {URL:"${url}"}
    set active tab index of theWin to (count of tabs of theWin)
  else
    set active tab index of theWin to keepIdx
    set URL of active tab of theWin to "${url}"
  end if
  activate
end tell`;
  const f = `/tmp/focus-tab-${process.pid}.scpt`;
  fs.writeFileSync(f, script);
  try { execSync(`osascript ${f}`); } finally { fs.unlinkSync(f); }
}
