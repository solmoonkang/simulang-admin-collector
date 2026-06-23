// OCR/스크린샷 보조 유틸 — 접근성 트리가 없는 화면(이미지·빈 캔버스)일 때만 쓰는 '보조' 경로.
// 주 수집(GUI 조작 + 접근성 트리)은 ../collect-tree.mjs 가 담당한다.
import { screenshotFull, Screen, ScreenshotCoordinateType } from '@simular-ai/simulang-js';

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
