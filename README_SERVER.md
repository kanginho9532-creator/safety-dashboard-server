# 서버 배포 & Notion 연동 가이드

## ⚠️ 가장 먼저 하실 일: Notion 키 재발급
대화창에 입력하신 Notion API 키는 노출된 것으로 간주해야 합니다.
1. https://www.notion.so/my-integrations 접속
2. 사용 중인 통합(Integration) 선택 → "Secret" 재발급(Regenerate)
3. 새 키를 아래 .env 파일에만 입력 (코드에는 절대 직접 넣지 않기)
4. 계약관리 데이터베이스 페이지 우측 상단 "..." → Connections → 방금 만든 통합 연결

## 1. Notion 데이터베이스 ID 찾기
데이터베이스를 브라우저로 열면 URL이 다음과 같습니다.
https://www.notion.so/작업공간/데이터베이스ID?v=...
"데이터베이스ID" 32자리 문자열을 복사해 .env의 NOTION_DATABASE_ID에 입력하세요.

## 2. 로컬 서버 실행
1. server 폴더로 이동
2. `.env.example`을 복사해 `.env`로 이름 변경 후 값 채우기
3. 터미널에서 실행:
   npm install
   npm start
4. http://localhost:3000/api/contracts 접속해 정상적으로 JSON이 나오는지 확인

## 3. 무료로 온라인에 올리기 (Render.com 예시)
1. https://render.com 가입 → New Web Service
2. 이 server 폴더를 GitHub 저장소에 올리고 연결 (또는 zip 업로드)
3. Build Command: npm install / Start Command: npm start
4. Environment Variables에 .env의 4개 값을 그대로 입력 (여기 UI에만 입력, 코드에는 안 넣음)
5. 배포 완료 후 나오는 URL (예: https://safety-server.onrender.com)을 복사

## 4. 프론트엔드에 서버 URL 연결
safety-dashboard.html 상단 script에서
  const API_BASE = "http://localhost:3000";
부분을 Render에서 받은 실제 URL로 교체하세요. 그러면 대시보드가 로컬 Notion 데이터를 실시간으로 불러옵니다.

## 5. 제공되는 API
- GET  /api/contracts       → Notion 전체 계약 목록 조회
- POST /api/update-visit    → { pageId, propertyName, date } 로 방문일자/연락요청일자 갱신
- POST /api/ai-schedule     → DeepSeek로 이번주 방문 스케줄 추천 (v4-flash 모델)

## 6. DeepSeek 키
.env의 DEEPSEEK_API_KEY, DEEPSEEK_MODEL(=deepseek-v4-flash)에 입력하면
/api/ai-schedule 호출 시 실제 AI 추천 결과를 받아옵니다.
