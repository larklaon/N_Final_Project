# 개발 기록

## 2026-10-15 — M2–M6.C1 — 학습 앱 기능 연결

- 상태: TypeScript 기능 구현·자동 검사 완료, Android 실행 확인 진행 중.
- 변경: 온보딩과 오늘·복습·기록·설정, 개념·퀴즈, SQLite migration v2, 중복 채점 방지, 학습 이력 개인화 입력, 프로필 분리, 완료 응답 캐시, 알림 outbox·7일 예약·탭 연결을 구현했다.
- 콘텐츠: 6개 영역 60개 개념·120문항의 AI 초안. 개별 출처 대조는 아직 미완료로 표시한다.
- 검증: typecheck·ESLint·Jest 17개·콘텐츠 구조 검사 통과. Metro Android 번들 성공. 에뮬레이터 API36 부팅 성공.
- 보완: 초기에 중간 빌드 출력이 Git 추적에 들어간 것을 후속 M1.C2에서 제거하고 재발 방지 ignore를 추가했다.
- 제한: Kotlin 컴파일·APK 설치·화면 점검은 진행 중이다. 실제 OAuth·AI 응답·실기기 알림은 미검증.
- 다음: 네이티브 빌드, 에뮬레이터 기능 경로, 콘텐츠 출처·접근성 확인.

## 2026-10-15 — M1.C1 — SIWC 네이티브 구현 checkpoint

- 상태: 네이티브 소스 구현, Android 컴파일·JUnit 검증 진행 중. 실제 계정 로그인·AI 응답은 미검증.
- 변경: Kotlin Expo Module, 127.0.0.1 고정 경로 콜백, state·PKCE·nonce 검증, Nimbus RSA ID 토큰 검증, Keystore AES-GCM AtomicFile 저장, 계정 분리·refresh·로그아웃, short foreground service, Responses SSE terminal 처리.
- 검사: Expo autolinking에서 SiwcAndroid 등록 확인, prebuild 성공. PKCE RFC 벡터·변경 client ID·JWT 변조·SSE 부분/실패/상한 fixture를 작성했고 Gradle 실행 중.
- 환경: 사용자 SDK 라이선스 동의 후 SDK 36·build-tools·ARM64 에뮬레이터 설치 및 부팅 완료. 첫 Gradle 의존성 다운로드가 진행 중.
- 제한: 실제 OAuth 승인과 response.completed는 확인 전이며 성공으로 표시하지 않는다.
- 다음: 네이티브 컴파일 오류 처리, 로컬 학습·AI 화면과 연결 후 APK 실행.

## 2026-10-15 — M0.C1 — Android 프로젝트 시작

- 변경: Expo SDK 57 / RN 0.86 / React 19.2 기반 프로젝트, Router 진입점, 한국어 앱 식별자, 디자인 토큰, 빌드 프로필, 검사 스크립트를 구성했다.
- 디자인: UI UX Pro Max와 Impeccable을 로컬 설치했다. React Native touch 검색의 Pressable·48dp 기준을 적용한다. Impeccable context는 sh 런처로 실행했고 기존 제품 기준을 읽었다. 스키마가 오래되어 플랫폼 자동 감지가 되지 않아 Android reference를 직접 읽었다. 별도의 초기 계획 문서는 업로드하지 않는다.
- 검증: typecheck, ESLint, Jest 4개(오답 10분·단계 상한·중복 날짜·조기/오래된 세션), Expo 의존성 검사와 public config 검사가 통과했다.
- 환경: JDK 17 및 Android 명령행 도구 설치 완료, SDK 플랫폼 설치 확인 중. 실제 OAuth·AI·APK는 미검증.
- 다음: 네이티브 SIWC 모듈, callback / PKCE / 보호 저장 / SSE 처리.
