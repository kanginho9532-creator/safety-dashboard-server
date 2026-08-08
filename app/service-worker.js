// 이 서비스워커는 아무것도 캐시하지 않습니다.
// 목적은 딱 하나: 예전 버전(캐싱 로직 포함)이 설치되어 있던 브라우저에서
// 새 배포가 올라오는 즉시 새 서비스워커로 강제 교체하고,
// 예전 서비스워커가 만들어둔 캐시를 전부 지우는 것입니다.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// fetch 이벤트를 가로채지 않습니다 (respondWith 호출 없음).
// 즉 모든 요청은 브라우저가 평소대로 네트워크에서 그대로 처리하며,
// 대시보드는 항상 최신 파일과 최신 노션 데이터를 받아옵니다.
self.addEventListener('fetch', () => {});
