# 안전관리 통합 대시보드 — 설치 & 노션 연동 가이드

이 폴더는 GitHub에 그대로 올리면 되도록 구조를 맞춰뒀습니다.

```
safety-dashboard/
├── render.yaml          ← Render 배포 설정 (수정 불필요)
├── .gitignore
└── app/                 ← 실제 서버 코드 (render.yaml의 rootDir: app 와 일치해야 함)
    ├── index.js
    ├── package.json
    ├── safety-dashboard.html
    ├── manifest.json
    ├── service-worker.js
    └── .env.example
```

⚠️ **가장 중요한 부분**: `render.yaml`에 `rootDir: app`이라고 지정되어 있어서, GitHub 저장소에 파일을 올릴 때 반드시 `app` 폴더 **안에** `index.js`, `package.json` 등이 들어있어야 합니다. 폴더 구분 없이 평평하게 올리면 Render가 빌드에 실패합니다. 지금까지 노션 연동이 안 됐던 원인 중 하나가 이 폴더 구조 불일치일 가능성이 있습니다.

---

## 1단계. Notion에서 준비하기

1. https://www.notion.so/my-integrations 접속 → **New integration** 클릭
2. 이름 입력(예: "안전대시보드") → 워크스페이스 선택 → 저장
3. 생성된 **Internal Integration Secret**을 복사 (이게 `NOTION_API_KEY`가 됩니다. `secret_`으로 시작)
4. 실제 사용할 노션 데이터베이스(공사현장 목록, 업체 목록) 페이지로 이동
5. 각 데이터베이스 페이지 오른쪽 위 **···** 메뉴 → **연결 추가(Add connections)** → 방금 만든 통합을 검색해서 연결
   - 이 단계를 빼먹으면 API 키가 맞아도 "권한 없음" 오류가 납니다. 가장 흔한 실수입니다.
6. 데이터베이스 페이지 URL에서 ID를 추출:
   `https://www.notion.so/워크스페이스/1a2b3c4d5e6f...?v=...`
   → `1a2b3c4d5e6f...` 32자리 부분이 `NOTION_DATABASE_ID` (또는 `NOTION_COMPANY_DATABASE_ID`)

---

## 2단계. GitHub에 올리기

1. https://github.com 에서 새 저장소(Repository) 생성 (Private 추천)
2. 이 `safety-dashboard` 폴더 전체를 저장소에 업로드
   - GitHub 웹사이트에서 "Add file → Upload files"로 폴더째 드래그해도 되고,
   - 아래처럼 명령어로 올려도 됩니다:
   ```bash
   cd safety-dashboard
   git init
   git add .
   git commit -m "초기 업로드"
   git branch -M main
   git remote add origin https://github.com/내계정/safety-dashboard.git
   git push -u origin main
   ```
3. `.env` 파일은 **절대 올리지 마세요** (`.gitignore`에 이미 제외되어 있습니다). API 키가 깃허브에 노출되면 안 됩니다.

---

## 3단계. Render 대시보드에서 배포하기

1. https://dashboard.render.com/ 접속 → 로그인
2. **New +** → **Blueprint** 선택 (render.yaml을 자동으로 인식해서 배포해줌)
   - Blueprint가 안 보이면 **New +** → **Web Service**로 직접 만들고, GitHub 저장소를 연결한 뒤 아래처럼 수동 설정:
     - Root Directory: `app`
     - Build Command: `npm install`
     - Start Command: `npm start`
3. 방금 만든 GitHub 저장소를 선택하고 연결 승인
4. Render가 `render.yaml`을 읽고 서비스 생성 화면을 보여줍니다 → **Apply** 클릭
5. **★ 반드시 해야 하는 작업**: 배포된 서비스 페이지 → **Environment** 탭 → 아래 4개 환경변수를 직접 입력 (render.yaml에는 `sync: false`로 되어있어서 키 값 자체는 자동으로 채워지지 않습니다):
   - `NOTION_API_KEY` = 1단계에서 복사한 시크릿 값
   - `NOTION_DATABASE_ID` = 공사현장 데이터베이스 ID
   - `NOTION_COMPANY_DATABASE_ID` = 업체 데이터베이스 ID
   - `DEEPSEEK_API_KEY` = 음성 명령 AI 기능용 (선택사항, 없어도 나머지 기능은 작동함)
6. 저장하면 자동으로 재배포됩니다 (2~3분 소요). 배포 로그에서 `Server running on ...` 메시지가 뜨면 성공.
7. 화면 상단의 `https://safety-dashboard-notion.onrender.com` 같은 URL이 실제 대시보드 주소입니다.

---

## 4단계. 연동 확인하기

배포된 주소 뒤에 `/api/debug-schema`를 붙여서 접속해보세요.
예: `https://내주소.onrender.com/api/debug-schema`

- 정상이면 노션 데이터베이스의 속성(컬럼) 이름 목록이 JSON으로 출력됩니다.
- `{"ok":false,"error":"..."}`가 뜨면 오류 메시지를 확인하세요:
  - `Unauthorized` → API 키 오류 또는 데이터베이스에 통합 연결을 안 함 (1단계 5번 다시 확인)
  - `Could not find database` → `NOTION_DATABASE_ID` 값이 틀림
  - `NOTION_DATABASE_ID not set` → Render Environment에 값을 저장 안 함

`/api/debug-schema`가 정상 작동하면, 대시보드 메인 화면(`/`)에 접속했을 때 화면 우측 상단에 "Notion 연동됨 · N건"이라는 초록색 배너가 뜨면서 실제 데이터가 표시됩니다.

---

## 사용 방법 (일반 사용자용)

1. Render에서 받은 주소(예: `https://safety-dashboard-notion.onrender.com`)로 접속
2. 스마트폰이라면 브라우저 메뉴 → "홈 화면에 추가"를 누르면 앱처럼 아이콘이 생깁니다 (manifest.json, service-worker.js 덕분에 PWA로 동작)
3. 접속하면 자동으로 노션 데이터를 불러와 현장 목록/방문 일정/연락 요청 등을 보여줍니다
4. 캘린더에서 날짜를 클릭해 방문일·연락요청일을 추가/삭제하면 실시간으로 노션 데이터베이스에 반영됩니다
5. 음성 명령 버튼(마이크 아이콘)을 누르고 "OO현장 다음주 월요일 방문 추가해줘" 처럼 말하면 AI가 해석해서 자동 반영합니다 (DEEPSEEK_API_KEY가 설정된 경우에만 작동)
6. 업체 카드 화면에서 담당자/연락처를 수정하면 해당 업체의 모든 계약 건과 업체DB에 동시 반영됩니다

### 참고: 무료 플랜(Render Free) 주의사항
Render 무료 플랜은 트래픽이 없으면 서버가 슬립 모드로 들어갑니다. 슬립 상태에서 처음 접속하면 서버가 깨어나는 데 30초~1분 정도 걸릴 수 있습니다 (정상 동작이니 당황하지 않으셔도 됩니다).
