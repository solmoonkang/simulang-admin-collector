// 사이트별 설정은 전부 .env 에서 로드한다 (코드에는 특정 사이트 정보를 두지 않는다)
// 실행:  node --env-file=.env collect-tree.mjs
import os from 'node:os';
import path from 'node:path';

// ── 접속/계정 (필수) ──
export const BASE_URL = process.env.SITE_URL;   // 대상 사이트 주소
export const LOGIN_ID = process.env.LOGIN_ID;
export const LOGIN_PW = process.env.LOGIN_PW;

// ── 로그인 폼 셀렉터 (접근성 트리 기준; 사이트마다 다름) ──
export const SEL = {
  idName:  process.env.SEL_ID_NAME   || '',                // ID 입력칸의 접근성 name
  pwType:  process.env.SEL_PW_TYPE   || '보안 텍스트 필드', // PW 입력칸의 localizedControlType
  btnName: process.env.SEL_LOGIN_BTN || '',                // 로그인 버튼 name
};

// ── 수집 대상 (사이트마다 다름) ──
export const MENUS     = (process.env.MENUS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const DATA_PATH = process.env.DATA_PATH || '/';     // 표 데이터가 있는 경로
// 수집에서 제외할 탭 이름 (예: 시크릿/연동키가 노출되는 '설정' 탭)
export const SKIP_TABS = (process.env.SKIP_TABS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ── 비전(표 OCR) 방식 설정 ──
export const COLUMNS    = (process.env.COLUMNS || '').split(',').map((s) => s.trim()).filter(Boolean);
export const ROW_ANCHOR = new RegExp(process.env.ROW_ANCHOR_REGEX || '\\d{10}'); // 행 식별용 패턴

// ── 출력: 레포 '바깥'에 저장한다 → 수집 데이터 파일이 레포 안에 아예 존재하지 않으므로
//    깃에 올라갈 수가 없다(.gitignore에 의존하지 않는 구조적 차단). 기본값: ~/collector-output ──
export const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(os.homedir(), 'collector-output');

if (!BASE_URL || !LOGIN_ID || !LOGIN_PW) {
  console.error('❌ SITE_URL / LOGIN_ID / LOGIN_PW 환경변수가 필요합니다.');
  console.error('   .env.example 을 .env 로 복사해 채운 뒤,  node --env-file=.env <script>  로 실행하세요.');
  process.exit(1);
}
