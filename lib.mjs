// 공용 유틸: 사람처럼 움직이는 마우스/스크롤, 스크린샷+OCR, 좌표변환, 입력
import { execSync } from 'node:child_process';
import {
  MouseController, KeyboardController, Screen, screenshotFull,
  ScreenshotCoordinateType, Button, Coordinate, Direction, Key,
} from '@simular-ai/simulang-js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = () => Math.random();
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // 가속→감속

export const mouse = new MouseController();
export const kb = new KeyboardController();

// --- 한 획(stroke): 곡선 + 좌우 흔들림 + 중간 멈칫 ---
async function moveStroke(tx, ty, allowPause) {
  const [sx, sy] = mouse.location();
  const dist = Math.hypot(tx - sx, ty - sy) || 1;
  const detour = Math.max(dist * 0.5, 55) * (0.4 + rand() * 0.7);  // 우회 곡률
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
    mouse.moveMouse(Math.round(x), Math.round(y), Coordinate.Abs);
    let d = 8 + rand() * 13;
    if (t < 0.15 || t > 0.85) d += 4 + rand() * 9; // 시작/끝 더 느리게
    await sleep(d);
    if (i === pauseAt) await sleep(130 + rand() * 280); // 가다가 한 번 멈칫
  }
}

// 사람처럼: 곡선 + 흔들림 + 멈칫 + 가끔 목표를 지나쳤다 되돌아오는 보정
export async function humanMove(tx, ty, doClick = true) {
  const wps = [];
  if (rand() < 0.5) { // overshoot 후 보정
    const [sx, sy] = mouse.location();
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    wps.push([Math.round(tx + ((tx - sx) / d) * (8 + rand() * 18)),
              Math.round(ty + ((ty - sy) / d) * (8 + rand() * 18))]);
  }
  wps.push([tx, ty]);
  for (let i = 0; i < wps.length; i++) {
    await moveStroke(wps[i][0], wps[i][1], i === 0);
    if (i < wps.length - 1) await sleep(70 + rand() * 150);
  }
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

// 전체 화면 캡처 → PNG 저장. {shot, path, w, h}
export function capture(path) {
  const shot = screenshotFull(false, Screen.mainScreen());
  shot.save(path);
  const [w, h] = shot.dimensions;
  return { shot, path, w, h };
}

// OCR: PNG 경로 → tesseract worker로 단어+bbox 추출 (v7은 blocks:true 필요)
export async function ocr(worker, path) {
  const { data } = await worker.recognize(path, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? [])
        for (const w of l.words ?? [])
          words.push({ text: w.text, bbox: w.bbox, conf: w.confidence });
  return { text: data.text, words };
}

// 이미지 픽셀좌표 → 마우스 전역좌표 [gx,gy]
export function toMouse(shot, ix, iy) {
  return shot.toGlobalDesktopCoordinates(ix, iy, ScreenshotCoordinateType.absolute());
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
