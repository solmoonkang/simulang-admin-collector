# simulang-admin-collector

[Simulang](https://www.npmjs.com/package/@simular-ai/simulang-js)으로 GUI를 직접 조작해
로그인 기반 관리자 콘솔에서 데이터를 수집하는 도구. **macOS 전용.**

브라우저를 사람처럼 조작(곡선 마우스·가변 스크롤)해 로그인하고, 세 가지 경로
— **접근성 트리 / 개발자도구 / 비전(OCR)** — 로 데이터를 JSON으로 뽑는다.
대상 사이트 정보(주소·셀렉터·메뉴 등)는 코드가 아니라 **`.env`** 로만 주입한다.

## 기술 스택

- **Simulang (`@simular-ai/simulang-js`)** — macOS 네이티브 GUI 자동화(마우스·키보드·스크린샷·접근성 트리)
- **접근성 트리(Accessibility Tree)** — OS 레벨 UI 트리를 읽어 텍스트를 바로 JSON으로
- **tesseract.js** — 트리가 없는 화면(캔버스/이미지)용 OCR 폴백
- **Ollama + Qwen2.5:3b (로컬)** — OCR 결과를 구조화(③ 비전 방식에만 사용)

## 코드 구조

```
lib.mjs              공용 유틸 — 사람형 마우스/스크롤, 캡처, OCR, 입력, URL 이동
config.mjs           .env 에서 사이트 설정/계정 로드, 출력경로 정의
login-tree.mjs       접근성 트리로 로그인 (setValue/activate)
collect-tree.mjs     ① 접근성 트리로 지정 메뉴 수집
collect-vision.mjs   ③ 스크린샷 + OCR + Qwen 으로 표 수집
collect-devtools.mjs ② 개발자도구 셋업 자동화 + 클립보드 저장 helper
```

## 사전 준비

- macOS + Google Chrome + Node.js 20+
- 터미널/Node에 **화면 기록 + 손쉬운 사용(접근성)** 권한 부여
- (③ 비전 방식만) 로컬 Ollama + `qwen2.5:3b`
- 로그인 폼 셀렉터는 macOS **손쉬운 사용 검사기(Accessibility Inspector)** 로 확인해 `.env` 에 입력

## 사용

```bash
npm install
cp .env.example .env        # 대상 사이트·계정·셀렉터 입력 (.env 는 커밋 안 됨)

npm run login               # 로그인 테스트
npm run tree                # ① 트리   → <OUTPUT_DIR>/all-menus-tree.json
npm run vision              # ③ 비전   → <OUTPUT_DIR>/table-vision.json
npm run devtools            # ② 개발자도구 (셋업 자동 후 안내)
```
