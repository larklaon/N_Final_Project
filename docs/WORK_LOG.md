# 개발 기록

## 2026-10-15 — M0.C1 — Android 프로젝트 시작

- 변경: Expo SDK 57 / RN 0.86 / React 19.2 기반 프로젝트, Router 진입점, 한국어 앱 식별자, 디자인 토큰, 빌드 프로필, 검사 스크립트를 구성했다.
- 디자인: UI UX Pro Max와 Impeccable을 로컬 설치했다. React Native touch 검색의 Pressable·48dp 기준을 적용한다. Impeccable context는 sh 런처로 실행했고 기존 제품 기준을 읽었다. 스키마가 오래되어 플랫폼 자동 감지가 되지 않아 Android reference를 직접 읽었다. 별도의 초기 계획 문서는 업로드하지 않는다.
- 검증: typecheck, ESLint, Jest 4개(오답 10분·단계 상한·중복 날짜·조기/오래된 세션), Expo 의존성 검사와 public config 검사가 통과했다.
- 환경: JDK 17 및 Android 명령행 도구 설치 완료, SDK 플랫폼 설치 확인 중. 실제 OAuth·AI·APK는 미검증.
- 다음: 네이티브 SIWC 모듈, callback / PKCE / 보호 저장 / SSE 처리.
