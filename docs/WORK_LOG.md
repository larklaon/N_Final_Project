# 개발 기록

## 2026-10-16 — FIX.C1 — 검수7건 수정

- 상태: 보고된7건 구현 수정·관련 회귀 검증 완료. Astra 독립 재검수 대기.
- 변경: 삭제/예약/프로필 작업 직렬화 및 stale OS 예약 취소, 초기화 알림 off, terminal refresh 복구, 명시적 플랜 재동의, 모델 응답 격리/재시도, 확대 탭 높이·가로 대비.
- 검증: TypeScript·ESLint·Jest26개·Kotlin17개·콘텐츠60/120·Doctor21/21·Android debug/AndroidTest 빌드 통과. API36 360/412dp×100/200%와 가로100%에서 탭 확인. 상세 완료 기준과 증거는 REVIEW_FIXES.
- APK: arm64 개발용 파일 갱신. Metro가 필요하며 checksum/크기는 REVIEW_FIXES에 기록. 의존성/lockfile 변경 없음.
- 제한: 실제 OAuth/AI·실기기 알림·전체 콘텐츠 출처·의존성 대응·배포 서명 미완료. 사람 모집은 추후 조건.
- 다음: 수정 checkpoint를 대상으로 Astra 독립 재검수.

## 2026-10-16 — REVIEW.C1 — 독립 검수

- 대상: `5970fa7` Android MVP. 앱 구현은 변경하지 않고 ASTRA_REVIEW에 재현·수정 기준을 기록했다.
- 결과: P1 2건(전체 삭제/예약 경쟁 상태, terminal refresh 오류 분류 누락), P2 5건(재동의 경로, 모델 목록 경쟁 상태, 확대 탭, 초기화 후 알림 재생성, 가로 탭 대비).
- 검증: typecheck·lint·Jest17개·Kotlin9개·콘텐츠60/120·Doctor21/21·debug build 통과. 추가 SQLite/RNTL/MockWebServer 재현과 API36 화면 캡처로 실패 경로 확인.
- 한계: 실제 계정 OAuth/AI·실기기 알림·전체 콘텐츠 출처 검증·의존성 패치 대응은 완료하지 않았다. 실사용자 모집은 현재 범위 밖이다.
- 다음: Sol6.1이 ASTRA_REVIEW의 우선순위대로 수정하고 관련 자동 검증을 추가한 뒤 변경 부분 재검수.

## 2026-10-16 — M7.C2 — 개발용 APK와 인계

- 상태: 개발용 MVP 구현·기본 개발 검증 완료. 독립 최종 검토·실제 계정·외부 배포는 별도.
- 검증: TypeScript·ESLint·Jest17개·콘텐츠 구조60/120·Expo Doctor21/21 통과. Kotlin/JUnit9개, Android debug build, 에뮬레이터 UI 통합 흐름1개 통과.
- 실제 경로: 온보딩→개념→객관식 선택·정답→오늘 진행1개→기록1개 확인. 프로세스 강제 종료 후 재실행에서도 학습 진도를 읽었다. 자정을 지난 뒤 오늘 진행은0으로 바뀌고 다음 개념은 기본키로 유지되어 날짜별 집계와 누적 진도를 구별했다.
- APK: arm64-v8a 개발용, 92,447,876 bytes, checksum·경로는 VERIFICATION. Metro 서버가 필요하며 서명 배포용으로 보고하지 않는다.
- 패치: 개발 도중 공식 권장 패치가 바뀌어 Expo57.0.30 / Router57.0.28로 맞추고 최종 빌드를 통과했다.
- 디자인: UI UX Pro Max의 네이티브 터치·상태·접근성 지침, Impeccable Android/audit/adapt 지침을 소스와 실제 기본 화면에 적용했다. 전체 기기·큰 글씨·TalkBack 검증을 완료했다고 주장하지 않는다.
- 제한: 실제 OAuth/AI completed·실기기 알림·개별 콘텐츠 출처 대조·의존성 보안 대응·외부 서명 배포는 남았다. 인간 모집·설문·피드백은 추후 과제 메모다.
- 다음: Astra의 독립 코드·보안·화면 검토. 발견된 문제는 Sol6.1이 수정한 뒤 관련 검증을 반복한다.

## 2026-10-15 — M7.C1 — 네이티브 빌드·개발 검증

- 상태: Android debug APK 생성·설치·앱 시작 확인. UI smoke test 1개 통합 흐름 통과.
- 검증: Kotlin/JUnit 9개 통과 (PKCE RFC 벡터, client ID 교체 거부, RSA JWT 신원 검증, SSE terminal/상한, loopback 경로·state 거부·포트 충돌).
- 변경: 온보딩 safe area, 개념→퀴즈 스크롤 초기화, 큰 화면 tab 위치, 네이티브 키 유실 시 비민감 등록 mapping 보존. UI Automator smoke test를 CNG로 재현 가능하게 추가.
- 제한: 개발용 APK는 Metro가 필요하다. 실제 OAuth·AI·실기기 알림, 서명된 외부 배포, 전체 콘텐츠 출처 대조는 미검증.
- 다음: 최신 Expo 패치 정렬 후 개발용 APK checksum과 최종 원격 백업을 기록.

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
