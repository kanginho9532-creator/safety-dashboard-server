# 안전관리 통합 대시보드 - GitHub 전용 버전

## 1. 이 버전의 동작 방식
- 이 버전은 **Render 서버 없이 GitHub만으로 구동**되도록 바꾼 버전입니다.
- **GitHub Pages**에서 화면을 띄우고, **GitHub Actions**가 Notion 데이터를 읽어 `data/notion-data.json` 파일로 저장합니다.
- 대시보드의 일정 추가/이동/삭제는 **브라우저 localStorage**에 저장됩니다.
- 즉, **Notion → 대시보드 동기화는 가능**하지만, **대시보드에서 수정한 일정을 Notion으로 바로 다시 쓰는 기능은 GitHub 단독 구조에서는 지원되지 않습니다.**

## 2. 바로 사용할 때
1. 이 압축을 풀어서 GitHub 저장소에 그대로 업로드합니다.
2. GitHub 저장소의 `Settings → Secrets and variables → Actions`로 이동합니다.
3. 아래 2개 시크릿을 추가합니다.
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
4. `Actions` 탭에서 **Notion Sync** 워크플로를 수동 실행합니다.
5. 실행이 끝나면 `data/notion-data.json`에 최신 현장 데이터가 저장됩니다.
6. `Settings → Pages`에서 배포를 켭니다.
   - Source: `Deploy from a branch`
   - Branch: `main` / `/root`
7. 발급된 GitHub Pages 주소를 열면 사용 가능합니다.

## 3. 이후 사용 방법
- 대시보드에서 `🔄 GitHub 동기화` 버튼을 누르면, GitHub에 저장된 최신 JSON을 다시 불러옵니다.
- Notion 쪽 데이터가 바뀌면 `Actions → Notion Sync → Run workflow`를 다시 실행한 뒤 대시보드에서 새로고침하면 됩니다.
- 워크플로는 기본으로 **2시간마다 자동 실행**되도록 넣어두었습니다. 필요하면 `.github/workflows/notion-sync.yml`에서 주기를 바꾸면 됩니다.

## 4. 중요한 제한 사항
- GitHub Pages는 정적 호스팅이라 **브라우저에서 Notion API 키를 숨긴 채 직접 Notion에 쓰기**가 불가능합니다.
- 그래서 이 버전은 **읽기 동기화 전용**입니다.
- 일정 추가/삭제/이동 자체는 정상 사용 가능하지만, 그 변경사항은 현재 기기 브라우저에 저장됩니다.

## 5. 파일 구성
- `index.html` : GitHub Pages 기본 진입 파일
- `safety-dashboard.html` : 동일 대시보드 원본 파일
- `data/notion-data.json` : GitHub Actions가 생성하는 최신 Notion 데이터
- `scripts/fetch-notion.mjs` : Notion 데이터를 JSON으로 내려받는 스크립트
- `.github/workflows/notion-sync.yml` : 자동 동기화 워크플로

## 6. 로컬에서 수동 동기화 테스트
1. Node.js 설치
2. 프로젝트 폴더에서 아래 실행
   - `npm install`
   - `.env` 파일 생성 후 `NOTION_API_KEY`, `NOTION_DATABASE_ID` 입력
   - `npm run sync:notion`
3. 그러면 `data/notion-data.json`이 갱신됩니다.

## 7. 권장 운영 방식
- 현장 데이터 원본 관리: Notion
- 배포/공유: GitHub Pages
- 자동 동기화: GitHub Actions
- 일정 수정의 실시간 Notion 반영까지 꼭 필요하면, 그때만 별도 서버 버전을 사용하는 방식이 가장 안전합니다.
