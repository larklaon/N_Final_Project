# Android MVP 독립 검수 — 2026-10-16

후속 수정: Sol6.1이 FIX.C1에서 7건을 수정하고 회귀 검증을 수행했다. [수정 내역](REVIEW_FIXES.md)을 참고한다. 아래는 수정 전 검수 기록이며 독립 재검수 결과로 바꾸지 않는다.

검토 소스: `5970fa7a06bf21056b26a148c6a776c3b34a8e85`, `codex/android-mvp`.

**판정: 수정 후 재검수 필요. P1 2건, P2 5건.** 기본 학습 구현과 빌드는 확인됐지만 삭제·인증 복구·계정 전환·확대 화면의 실패 경로에 결함이 있다. 이번 checkpoint는 검수 기록이며 앱 동작을 수정하지 않았다. P1은 우선 수정, P2는 MVP 완성 전에 수정할 항목이다.

## 1. [P1] 전체 삭제 도중 실행 중인 예약 작업이 이전 알림을 되살림

- 위치: `src/services/notifications/scheduler.ts:60–108`, `app/(tabs)/settings.tsx:99–104`.
- 원인: scheduler가 잡아 둔 learner/snapshot을 여러 OS 비동기 호출 뒤에도 그대로 사용한다. 전체 삭제는 `cancelAllScheduledNotificationsAsync()`만 실행하고 이미 실행 중인 reconcile을 중단하거나 기다리지 않는다.
- 재현: 알림을 켠 learner A의 reconcile을 `getPermissionsAsync()` 응답에서 대기 → OS 예약 전체 취소 → `repo.eraseAll()` → 대기 해제. 실제 SQLite와 모의 OS 예약 API로 확인했다.
- 실제 결과: 삭제된 A의 예약 **7개**가 다시 생성되고, `markNotifications()`에서 삭제된 learner를 참조하여 **FOREIGN KEY constraint failed**가 발생한다. 새 learner의 outbox는 비어 있다. 따라서 새 snapshot에 따른 effect만으로 즉시 청소되지 않으며 다음 foreground 재조정까지 예약이 남을 수 있다. 이전 학습 개념이 알림에 표시되고 탭은 무시되는 상태다.
- 수정 방향: 삭제/프로필 전환과 예약을 같은 직렬화·취소 수명 안에서 처리한다. await 이후 generation/learner를 검증하고, 삭제 완료 전에 이전 작업 종료 및 최종 OS 취소를 보장한다. 새 기본 프로필의 빈 desired 상태도 조정할 수 있어야 한다.
- 완료 기준: 예약 대기 중 전체 삭제를 끼워 넣어도 OS 예약 0개, FK 오류 없음, 이전 learner job/기록 없음.

## 2. [P1] 공식적인 토큰 만료·폐기 오류 5종을 재연결 상태로 처리하지 않음

- 위치: `modules/siwc-android/android/src/main/java/com/teumknowledge/siwc/SiwcManager.kt:130–133,148–156`.
- 원인: `postForm`은 `invalid_grant`와 `invalid_token`만 `reconnect_required`로 변환한다. `access`는 그 문자열일 때만 토큰을 지운다. `state()`는 남아 있는 access token/scope만으로 계속 ready를 반환한다.
- 재현: 실제 `postForm` 메서드에 로컬 MockWebServer의 HTTP400 OAuth 응답을 제공했다. 인증 정보나 외부 계정을 사용하지 않았다.

| 응답 error | 실제 변환 결과 |
| --- | --- |
| invalid_grant | reconnect_required |
| invalid_refresh_token | oauth_http_400 |
| token_expired | oauth_http_400 |
| refresh_token_expired | oauth_http_400 |
| refresh_token_invalidated | oauth_http_400 |
| refresh_token_reused | oauth_http_400 |

- 영향: 재사용 불가능한 refresh token으로 반복 실패하고 UI는 사용 가능 상태를 유지할 수 있다. 실패 뒤 JS auth snapshot도 갱신하도록 연결해야 한다. 만료됐는데 refresh token이 없는 분기도 catch 밖에서 throw하므로 함께 점검한다.
- 수정 방향: refresh grant에 대한 terminal code를 명시적으로 분류하고 해당 자격증명만 무효화한다. host/client mapping은 유지하고 재연결 행동을 제공한다. 네트워크/503에서는 자격증명을 보존한다.
- 완료 기준: 위 terminal code 각각에서 reconnectRequired, transient 실패에서 기존 credential 유지, 상태 변경의 UI 반영.
- 근거: [OpenAI 오류·복구 공식 문서](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery#refresh-errors).

## 3. [P2] 플랜 권한을 거절한 사용자의 명시적 재동의 경로가 없음

- 위치: `SiwcManager.kt:78–86`, `app/(tabs)/settings.tsx:70–82`.
- 조건: 유효한 ID token은 있지만 `chatgpt.tokens.use.direct`가 없어 connectedWithoutPlan인 등록.
- 코드·계약 대조: 화면은 권한이 필요하다고 표시하지만 같은 일반 signIn 호출만 한다. authorize에는 전체 scope는 있어도 권한 재요청을 위한 `prompt=consent` 분기가 없다. 저장된 ID hint까지 보내는 일반 재인증은 공식 문서상 계정 선택/동의를 건너뛸 수 있다.
- 영향: 사용자가 앱 안내대로 다시 연결해도 플랜 사용 권한을 복구할 명확한 흐름이 없다.
- 수정 방향: 사용자가 명시적으로 플랜 사용을 켜는 행동을 일반 재로그인과 구분하고, 해당 경우에만 공식 consent 재요청을 적용한다. 승인 확인 없이 `force_reconsent`로 바꾸지 않는다.
- 완료 기준: 일반 재인증에는 consent 강제 없음, 권한 활성화 행동에는 전체 scope와 지원되는 consent 파라미터, 결과 scope 재검증.
- 증거 수준: 공식 계약과 URL 생성 코드 대조. 실제 계정의 거절→재동의 흐름을 실행했다는 의미는 아니다.
- 근거: [플랜 사용 권한 복구](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery#chatgpt-plan-use-isnt-enabled), [일반 재인증 동작](https://developers.openai.com/siwc/token-sharing-open-source/sign-in#2-start-authorization).

## 4. [P2] 이전 계정의 늦은 모델 목록이 현재 계정 목록을 덮어씀

- 위치: `app/(tabs)/settings.tsx:58–68`.
- 재현: 계정 A 목록 요청을 대기 → B로 전환 → B 응답 완료 → A 응답 완료. 실제 Settings 컴포넌트를 RNTL로 렌더링하고 auth context/네트워크만 fixture로 바꾸었다.
- 결과: active profile은 B인데 화면에는 A 전용 모델이 표시되고 B 목록은 사라진다. 연결 해제나 기본 프로필 전환에서도 기존 models를 비우지 않는다.
- 영향: 계정별 허용 모델과 설정 표시가 어긋나며 현재 프로필에 잘못된 모델 선택을 저장할 수 있다. 실제 AI 화면에서 다시 유효 모델을 고르는 방어는 있지만 설정 화면의 잘못된 선택을 해결하지 않는다.
- 수정 방향: 요청 profile ID/generation을 완료 시점에 확인하고 effect cleanup으로 늦은 결과를 무시한다. 계정 변경 시 목록과 오류를 초기화한다.
- 완료 기준: A/B 응답 순서를 뒤집어도 B 모델만 표시되며 비연결 상태에서 이전 목록을 표시하지 않는다.

## 5. [P2] 200% 글씨에서 하단 탭 라벨이 잘리고 시스템 제스처 영역과 겹침

- 위치: `app/(tabs)/_layout.tsx:18–20`.
- 재현: API36 ARM64, 1080px / density480 = 360dp, `font_scale=2.0`, 오늘·설정 화면.
- 결과: 라벨은 커지지만 tab bar의 높이는 충분히 늘어나지 않아 아래쪽 글자가 잘린다. UI hierarchy에서 라벨 bounds는 y2281–2328인 반면 확대된 실제 글꼴은 더 큰 높이를 요구한다. 버튼 자체를 누를 수 있다는 사실로 가독성 문제를 해결할 수 없다.
- 수정 방향: fontScale과 safe area를 고려한 bar/item 높이·라벨 배치를 적용한다. 글자 확대를 끄는 방식으로 해결하지 않는다.
- 완료 기준: 360dp/412dp, 100%/200%에서 네 탭 이름 전체가 보이고 시스템 영역과 겹치지 않음.
- 증거: [200% 글씨 화면](screenshots/astra-review/font-200.png).

## 6. [P2] 현재 학습 초기화 직후 지웠다는 알림을 다시 예약함

- 위치: `src/data/repositories/LearningRepository.ts:430–442`, `app/(tabs)/settings.tsx:87–105`.
- 재현: notificationsEnabled=true → 현재 학습 기록 초기화 → 다음 reconciliation.
- 결과: resetCurrent는 알림 rows/job을 지우지만 settings의 enabled를 유지하고 `touch()`로 새 job을 만든다. 순수 예약 계산으로 **7개**가 즉시 다시 나온다. 전체 삭제 경쟁 상태와 달리 동시 작업이 없어도 발생한다.
- 영향: 확인창의 “현재 프로필의 … 알림을 지워요”와 실제 결과가 다르다.
- 수정 방향: 확정된 초기화 범위에 맞춰 해당 learner의 알림을 끄고 빈 desired 상태를 반영한다. 인증 연결과 다른 learner의 기록은 유지한다.
- 완료 기준: 초기화 뒤 현재 learner 알림 0개, 앱 재실행 후에도 명시적 재활성화 전까지 재예약되지 않음.

## 7. [P2] 가로 화면의 선택 탭 대비가 1.59:1로 떨어짐

- 위치: `app/(tabs)/_layout.tsx:15–18`, `app/_layout.tsx`의 navigation theme.
- 재현: 동일 API36 기기의 2400×1080 가로 화면, density420, fontScale1.0. width>=840에서 왼쪽 탭이 활성화된다.
- 결과: 선택 배경은 React Navigation 기본 theme의 `#007AFF`, 글자·아이콘은 앱의 `#176B5B`다. 대비는 **1.5887:1**로 문구 4.5:1 및 의미 있는 아이콘 3:1 기준에 미달한다.
- 코드 근거: bundled BottomTabItem은 sidebar/horizontal에서 activeBackgroundColor를 theme.colors.primary로 선택한다. 앱은 activeTintColor만 지정하고 background/theme를 정렬하지 않았다.
- 수정 방향: 사이드바 선택 배경과 전경을 앱 토큰에 맞춰 함께 지정하고 실제 대비를 재확인한다.
- 완료 기준: 가로/넓은 화면 선택 라벨과 아이콘 대비 통과, 세로 탭 유지.
- 증거: [가로 화면](screenshots/astra-review/landscape.png).

## 다시 실행한 검증과 한계

| 항목 | 이번 검수 결과 |
| --- | --- |
| npm run check | TypeScript, ESLint, 기존 Jest17개, 콘텐츠 구조60/120 통과 |
| Expo Doctor | 21/21 통과 |
| Kotlin/JUnit 기존 suite | 9개 통과. 임시 검수 fixture 제거 후 다시 실행 |
| Android debug build | 성공. 이 검수에서 새 배포용 APK를 만들었다는 의미는 아님 |
| notification 재현 | 실제 SQLite + 모의 OS 비동기 응답으로 2개 결함 확인 |
| model race 재현 | 실제 Settings 렌더링 + 모의 계정 응답으로 확인 |
| refresh 오류 재현 | 실제 postForm + 로컬 MockWebServer, 6개 코드 대조 |
| UI | API36 실제 Development Build에서 360dp/200% 및 가로100% 캡처 |
| npm audit | 이전과 동일한64건: moderate15, high49 |

추가 재현 fixture의 “통과”는 결함이 존재함을 확인한 characterization 결과다. 수정 후 정상 동작을 보증하는 테스트로 계산하지 않는다. 검수용 테스트는 `artifacts/astra-review/`에 로컬 보관했고 native test 소스는 원복했다. TS fixture는 일반 typecheck/lint에 섞이지 않도록 `.txt` 확장자로 보관했다. 앱 코드·lockfile은 변경하지 않았다. 에뮬레이터 fontScale/density/rotation 설정도 원복했다.

의존성 audit64건은 독립 취약점64개와 같지 않다. 직접 advisory가 붙은 패키지는 braces, decode-uri-component, node-forge, sprintf-js, uuid이고 전이 상위 패키지가 함께 집계된다. expo-router→query-string→decode-uri-component 경로도 있어 전부 개발 도구 전용이라고 단정할 수 없다. 앱 내 악용 도달성·안전한 패치 조합은 추가 분석 대상이며 강제 major 변경을 적용하지 않았다.

현재 검사 범위에서 실제 credential/key가 tracked JS·SQLite fixture·로그 소스에 하드코딩된 증거는 찾지 못했다. 이는 전체 Git 이력과 모든 운영 환경에 대한 비밀정보 부재 증명이 아니다.

## UI 검수 범위

Impeccable native audit와 UI UX Pro Max의 React Native 기준을 적용했다. 네이티브 Switch/Alert, 네 개 탭, 시스템 back, 의미 역할과 상태, 스크롤 가능한 본문, 재사용 색상 토큰은 유지할 장점이다. 웹 화면으로 대체하지 않고 Android 캡처를 확인했다.

| 영역 | 잠정 점수 /4 | 근거 |
| --- | --- | --- |
| 접근성 | 2 | 기본 role/state/본문 확대 존재, 탭 확대·선택 대비 실패 |
| 성능 | 3 | 현재60개 콘텐츠에서 기본 표시 가능. 장기 기록/프레임 시간 측정은 미실시 |
| 색상·테마 | 3 | 확정된 라이트 테마와 토큰 존재. navigation 기본 선택색 누락 |
| Android 동작 | 3 | 네이티브 컨트롤·화면 전환 존재. 확대 탭 inset 결함 |
| 화면 적응 | 2 | 세로/가로 전환은 되지만 위 두 결함 존재 |
| 합계 | 13/20 | 소스와 제한된 에뮬레이터 화면 기준의 잠정 평가 |

다크 테마는 현재 제품 범위에 없으므로 감점 대상으로 삼지 않았다. TalkBack 전체 탐색·실기기 제스처·전체 화면/키보드 매트릭스는 완료 판정을 하지 않았다. UI 수정은 `impeccable adapt`/`harden` 범위로 수행하고, 마지막에 `polish` 1회로 정리한다.

## 수정 후 재검수 순서

1. 전체 삭제/예약 동시성 및 terminal refresh 오류를 먼저 수정하고 실패 경로 테스트를 정상 기대값으로 추가한다.
2. 명시적 플랜 재동의, 모델 목록의 프로필 격리, 현재 기록 초기화의 알림 범위를 수정한다.
3. 확대 탭과 가로 선택색을 수정하고 같은 기기 조건에서 화면을 확인한다.
4. 관련 자동 검사와 네이티브 빌드를 실행한 뒤 수정 commit을 대상으로 재검수한다.

실제 SIWC OAuth 성공·실제 response.completed, Android 브라우저 인증 중 서비스 수명, 실기기 알림 도착, 키 유실 fault injection, 개별 콘텐츠60개/문항120개의 출처 대조, 서명된 외부 배포는 여전히 미검증/미완료다. 이번 검수에서 거짓 성공으로 채우지 않았다. 사람 모집·실사용자5명·설문·인터뷰는 추후 과제 메모로 유지한다.
