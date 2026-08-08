# 안전관리 대시보드 모바일 v2 (수정본)

제공해주신 Notion 데이터베이스와 API 키를 적용하여 정상적으로 작동하도록 수정한 버전입니다.

## 주요 수정 사항
1. **환경 변수 적용**: `.env` 파일에 제공해주신 `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `DEEPSEEK_API_KEY`를 적용했습니다.
2. **데이터베이스 스키마 대응**: 
   - `계약금액(VAT자동 계산)` 속성명의 공백 문제 해결
   - `작업 여부` 속성 타입(Select) 대응
   - 기타 누락된 속성 맵핑 최적화
3. **AI 모델 설정**: DeepSeek 모델을 `deepseek-chat`으로 설정하여 안정적인 응답을 보장합니다.

## 실행 방법

### 1. 서버 실행
서버가 실행되어 있어야 대시보드에 데이터가 표시됩니다.
```bash
cd server
npm install
node index.js
```
*서버는 기본적으로 3000번 포트에서 실행됩니다.*

### 2. 대시보드 열기
`safety-dashboard.html` 파일을 웹 브라우저(Chrome 권장)로 엽니다.

### 3. Notion 동기화
대시보드 왼쪽 하단의 **🔄 Notion 동기화** 버튼을 누르면 실시간으로 데이터를 가져옵니다.

## 참고 사항
- 로컬에서 실행 시 `API_BASE`는 `http://localhost:3000`으로 설정되어 있습니다.
- 만약 서버를 다른 곳에 배포하신다면 `safety-dashboard.html` 파일 내의 `API_BASE` 주소를 해당 서버 주소로 변경해야 합니다.
