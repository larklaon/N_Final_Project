# V4 마무리 검수

- 검수일: 2026-10-19 (Asia/Seoul)
- 대상: `ea1b25771325e3e299b15b14c9bcbf84415fa549`, `codex/android-mvp`
- 판정: 기본 검사와 Android 빌드는 통과했다. 아래 요청 취소·삭제·종료 경계 4건은 수정이 필요하다.
- 앱 동작 코드는 수정하지 않았다. 추가 재현은 별도 fixture로 보관한다. 이전 V4 검수의 5건과는 다른 경로다.

## 재현된 문제

| ID | 우선순위 | 문제 | 관측 결과 |
| --- | --- | --- | --- |
| FINAL-R1 | P1 | 대기 중 계획 요청이 전송 동의 철회 뒤에도 dispatch됨 | 동의 철회 뒤 `startResponse` 0회 기대, 실제 1회 |
| FINAL-R2 | P2 | 답변 중 대화를 지우면 늦은 답변이 대화에 다시 저장됨 | 삭제 뒤 빈 대화 기대, assistant 1개 생성 |
| FINAL-R3 | P2 | native request ID를 받기 전의 답변 중지 버튼이 작동하지 않음 | 취소 1회·답변 저장 0개 기대, 취소 0회·저장 1개 |
| FINAL-R4 | P2 | native terminal 이벤트가 busy 상태 해제보다 먼저 전달됨 | 완료 이벤트에서 다음 요청 시작 시 `response_busy` |

### FINAL-R1 — 대기 요청에 전송 동의 변경이 전달되지 않음

- 위치: `src/services/ai/plan.ts:32–50`, `src/services/ai/requestCoordinator.ts:127–149`, 설정의 동의 철회는 `app/settings.tsx:466–475`.
- 계획 생성은 큐에 넣기 전과 응답을 받은 뒤에 동의를 확인한다. 대기 중 취소 신호는 학습 scope 변경과 외부 signal만 받는다. 동의 철회는 settings를 바꾸지만 scope를 바꾸거나 대기 중 계획의 controller를 중지하지 않는다.
- 재현: 채팅 슬롯 유지 → 동의가 있는 상태로 `requestPlan` 대기 → `aiConsentAt=null` → 슬롯 해제. 계획 입력이 `startResponse`에 전달된다. 응답 뒤 저장은 거부되지만 전송은 이미 일어났다.
- 영향: 동의를 끈 뒤에도 학습 요약이 전송되고 구독 사용량이 소비될 수 있다.
- 수정 기준: 동의 철회를 계획·채팅·맞춤 학습의 취소 경계로 전달한다. 큐에서 실제 전송을 시작하는 순간에도 동의와 소유권을 검사해야 한다. 저장 후 검사만으로 대신하지 않는다.

### FINAL-R2 — 대화 삭제가 진행 중 요청을 무효화하지 않음

- 위치: `app/ai/[conceptId].tsx:292–294`, 같은 파일 `:120–124`.
- 삭제는 DB와 화면의 메시지만 비운다. `active.current`·진행 중 요청·스트리밍 상태는 유지된다. `completed`는 여전히 같은 learner/scope로 보이므로 assistant 메시지를 INSERT한다.
- 재현: 질문 전송 → 답변 대기 중 ‘대화 지우기’ 확인 → 빈 대화 확인 → 기존 요청의 completed 전달. 대화에 늦은 assistant 메시지 1개가 저장된다.
- 영향: 지운 대화가 화면·로컬 DB에 다시 나타난다. 질문이 없는 답변만 남을 수 있다.
- 수정 기준: 삭제 확인 시 요청을 무효화하고 스트리밍 상태를 정리한다. 이미 발행된 ID는 취소하고, ID가 늦게 돌아와도 그 요청만 취소한다. 삭제 전 요청의 queued/early/completed 이벤트는 저장하지 않아야 한다.

### FINAL-R3 — ID를 기다리는 동안의 ‘답변 멈추기’가 무시됨

- 위치: `app/ai/[conceptId].tsx:211–224`, `:408–414`.
- 중지 버튼은 request ID가 있을 때만 `cancelResponse`를 호출한다. `beginChat()`의 대기나 native start promise가 끝나지 않았을 때는 상태를 무효화하지 않는다. 늦게 ID가 도착해도 계속 정상 요청으로 취급된다.
- 재현: native start promise를 보류 → ‘답변 멈추기’ → request ID 반환 → completed 전달. 취소 호출은 없고 assistant가 저장된다.
- 영향: 화면에 중지 버튼이 보이지만 준비 중에는 눌러도 처리가 계속된다. 배경 전환 listener도 ID가 있을 때만 취소하는 같은 형태이므로 수정 때 함께 점검해야 한다.
- 수정 기준: ID 유무와 관계없이 논리적인 요청을 먼저 중지한다. 늦은 ID는 해당 요청 소유권으로 취소하고, 다음 요청이나 다른 소비자의 ID를 취소하지 않도록 한다.

### FINAL-R4 — 완료 이벤트와 native 유휴 상태의 순서 불일치

- 위치: `modules/siwc-android/android/src/main/java/com/teumknowledge/siwc/SiwcManager.kt:176–188`, JS 소비자는 `src/services/ai/requestCoordinator.ts:90–100`의 terminal 처리와 `:150–156`의 다음 요청 실행.
- manager는 SSE completed/failed를 `emit`한 뒤 HTTP 응답 정리·진단 정리를 마치고 finally에서 `responseId=null`로 바꾼다. JS coordinator는 terminal 이벤트를 받으면 즉시 idle로 처리한다.
- 재현: 실제 manager와 `ResourceAccess`에 로컬 MockWebServer SSE를 연결하고 completed 이벤트 소비자가 곧바로 다음 `startResponse`를 호출했다. 이전 ID가 남아 `response_busy`로 거절됐다.
- 영향: 추출 → 생성 → 검토처럼 이어지는 요청이 타이밍에 따라 실패하고, 맞춤 준비가 실패 상태나 재시도 대기로 넘어갈 수 있다.
- 수정 기준: terminal 이벤트를 전달할 때 다음 요청을 수용할 수 있도록 정리·소유권 해제 순서를 보장한다. JS 쪽 임의 지연으로 경쟁을 숨기지 않는다. 이전 worker의 finally가 새 요청의 ID를 지우지 않는 보호는 유지한다.
- 이 fixture는 이벤트 전달과 정리의 경쟁을 결정적으로 만든다. 실제 Expo bridge에서의 발생 빈도는 측정하지 않았다.

## 실행한 검증

- `npm run check`: 타입 검사·ESLint·Jest **158/158 (25 suites)**·72개념/144틈새 카드/72앱 문제 구조·네이티브 패치 3개 통과.
- Gradle: SIWC **35/35**·Gap **17/17** Kotlin/JUnit, debug APK와 AndroidTest APK 빌드 통과. 재현 fixture를 제거한 상태에서 기본 Kotlin 검사를 `--rerun`으로 다시 실행했다.
- 추가 Jest 경계 재현 3개: 모두 원하는 동작 단언에서 실패. 실제 repository와 in-memory SQLite, 실제 AI 화면·계획 함수에 모의 SIWC gateway를 사용했다.
- 추가 native 재현 1개: 실제 manager와 로컬 SSE 서버를 사용했고 `response_busy` 기대 불일치를 확인했다. 외부 AI 계정이나 실제 인증 정보는 사용하지 않았다.
- UI·시작 검사의 상세 결과는 아래에 기록한다. 기본 계정의 DB 초기화·로그인/로그아웃·정답 제출 절차는 수행하지 않았다.

## 화면 검사

- API36 ARM64 에뮬레이터에 기존 데이터 유지 설치했다. 360dp·글씨 100%의 LayoutTest는 네 보기와 기본 버튼 도달·세로 고정을 통과했다.
- 자동 스크립트의 360dp·200% 검사는 ‘선택지 존재’ 사전 조건에서 멈췄다. 현재 문제의 긴 지문이 화면을 채워 스크롤 전에는 보기의 접근성 노드가 없기 때문이다. 캡처 후 실제 세로 스크롤 2회로 네 보기에 모두 도달했고 각 보기의 가시 높이 48dp 이상을 확인했다. 이 사전 조건 실패는 앱 결함 수에 넣지 않는다. 412dp 조합까지 이번 자동 스크립트가 완료됐다고 표시하지 않는다.
- 작은 화면·큰 글씨를 확인한 뒤 font 1.0과 기본 밀도로 복구했다. 이번 UI 캡처·로그는 ignored `artifacts/final-audit-200/`, `final-audit-200-manual.log`, `final-audit-layout.log`에 남겼다.
- 개발 APK의 재실행 5/5회에서 문제 화면 진입·PID 유지·앱 크래시 없음 확인. 5번째에는 설정·퍼즐 push/back과 가로 방향 요청 뒤 세로 유지도 통과했다. 로그는 `artifacts/final-audit-startup/`에 있다.
- 로컬 시연 APK는 48,024,181 bytes, SHA256 `ca0dfcbe9be317e49a524aff4497d9f91919348bb93b3f29afd1a94943d0e4b7`이다. 이를 데이터 유지 설치하고 Metro reverse 없이 2/2회 문제 화면 진입·PID 유지·앱 크래시 없음 확인. 캡처·로그는 `artifacts/final-audit-demo/`와 `final-audit-demo.log`에 있다. 전체 맞춤 학습 생성·24시간 일정까지 다시 실행한 것은 아니다.
- 검사 뒤 시작 때의 debug APK·8081 reverse·회전 설정으로 복구했다. font 1.0, 밀도 override 없음. 이번 검수에서 앱 소스·시연 APK를 수정하지 않았다.

## 재현 자료

- [별도 fixture와 실행 안내](review-fixtures/final/README.md)
- ignored 로컬 로그: `artifacts/final-audit-check.log`, `final-audit-build.log`, `final-audit-native-baseline.log`, `final-audit-boundaries.log`, `final-audit-terminal.log`.
- 실패 fixture는 정상 테스트 목록에 넣지 않았다. 앱 코드와 기존 정상 검증 소스는 보존했다.

## 수정 순서

FINAL-R1 → FINAL-R2·R3의 채팅 취소 경계 → FINAL-R4의 native 종료 순서. 각 fixture를 정상 회귀 검사로 전환해 통과시킨 뒤 기존 검사를 유지한다.
