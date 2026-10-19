# V4 마무리 검수 수정

2026-10-19, FINAL.FIX. [FINAL_AUDIT](FINAL_AUDIT.md)의 요청 취소·삭제·종료 경계 4건을 수정했다. 수정 전 보고서와 fixture는 당시 재현 자료로 보존한다.

## 변경과 회귀 검증

| 항목 | 변경 | 검증 |
| --- | --- | --- |
| FINAL-R1 동의 철회 뒤 전송 | repository가 동의 변경을 커밋한 뒤 AI 취소 이벤트를 전달한다. 계획·채팅·개인화는 진행 중 작업을 취소하고 큐에서 실제 dispatch할 때도 동의와 소유권을 다시 확인한다. | 대기 계획 전송 0회, 실행 중 계획 취소, 동의를 다시 켜도 이전 결과 저장 거부. 이벤트가 없어도 dispatch guard가 전송을 막음. |
| FINAL-R2 대화 삭제 뒤 답변 부활 | 삭제 확인 시 현재 turn을 먼저 무효화·취소하고 메시지를 삭제한다. 늦은 delta/completed는 저장하지 않는다. | 요청 ID가 이미 있거나 늦게 반환되는 경우 모두 삭제 뒤 대화가 비어 있음. |
| FINAL-R3 준비 중 중지 무시 | 채팅도 공통 우선순위 큐와 AbortController를 사용한다. ID가 없어도 중지·삭제·배경 전환·동의 변경·scope 변경·unmount를 즉시 처리한다. | 각 취소 경계에서 늦은 ID만 취소, 이전 답변 저장 0개. 중지 직후 새 질문은 이전 native 작업이 정리될 때까지 대기하고 새 소유자를 취소하지 않음. |
| FINAL-R4 완료와 busy 해제 순서 | delta만 즉시 전달하고 terminal은 보관한다. HTTP/registry 정리를 마친 뒤 lock 안에서 해당 response ID를 해제하고 terminal을 전달한다. | completed·SSE failed·HTTP 실패 각각에서 이벤트 소비자가 다음 요청을 즉시 시작해도 정상 완료. 기존 요청의 finally가 새 ID를 지우지 않음. |

`onAiConsentChange`는 학습 scope를 바꾸지 않아 동의 변경 때문에 문제 화면과 선택이 초기화되지 않는다. 실제 데이터 저장이 실패하면 이벤트도 전달되지 않는다. 동의 철회 이전에 서버로 이미 전송된 데이터까지 회수한다는 의미는 아니다.

채팅의 오류 진단은 `AiResponseError`에 허용된 native 이벤트 필드를 보존해 기존 권한·사용량 안내를 유지한다. 취소된 요청의 native ID가 늦게 오면 공통 coordinator가 그 ID만 취소한다. 다음 요청은 native terminal 또는 기존 취소 fallback에 따른 유휴 판정을 기다린다.

## 실행한 검사

- `npm run check`: TypeScript·ESLint·Jest **169/169 (26 suites)**·콘텐츠 72개념/144틈새 카드/72앱 문제·네이티브 패치 3개 통과.
- Kotlin/JUnit: SIWC **38/38**, Gap **17/17**, 총 **55개** 통과. 원래 검수의 재현을 정상 테스트로 옮기고 오류 terminal과 다음 소유권까지 검사했다.
- Android debug·AndroidTest APK 빌드 및 시연용 release APK 빌드 통과.
- 정상 회귀 검사: `src/services/ai/__tests__/FinalBoundaryFixes.test.tsx`, `modules/siwc-android/android/src/test/java/com/teumknowledge/siwc/FinalTerminalAuditTest.kt`. 기존 채팅 검증도 실제 scope 변경 통지와 비동기 취소 응답에 맞췄다.
- 로컬 로그: ignored `artifacts/final-fix-check.log`, `final-fix-build.log`, `final-fix-release-build.log`.

## 갱신한 APK

- 시연용: `artifacts/teum-knowledge-0.1.0-demo-arm64.apk`, **48,025,841 bytes**, SHA256 `20254fc38ce902a324d39b5fae687fa87194b954e571a64b72e155911b768cfb`.
- 개발용: `artifacts/teum-knowledge-0.1.0-dev-arm64.apk`, **98,531,656 bytes**, SHA256 `07ebe4600a046163a5f7b2dae212486ee3f9a05a8562428fe191b63d24b72d68`.
- 시연용 빌드 값 `EXPO_PUBLIC_TEUM_DEMO=1`을 유지해 release APK를 다시 빌드했다. API36에 기존 데이터 유지 설치 후 Metro reverse를 제거하고 2회 실행해 문제 화면·같은 PID 유지·앱 크래시 없음을 확인했다.
- 검사 뒤 최신 debug APK와 8081 reverse를 복구했다. DB 초기화·계정 로그인/로그아웃·정답 제출은 하지 않았다. 이전 APK는 ignored `artifacts/final-fix/previous-*.apk`로 보존했다. APK는 Git에 넣지 않는다.
- 패키징·실행 로그와 캡처: ignored `artifacts/final-fix-apk.log`, `artifacts/final-fix/`.

## 구현 경계

동의 철회·늦은 native ID·삭제 후 completed·연속 terminal 처리는 모의 gateway, 실제 in-memory SQLite, 로컬 SSE 서버로 검증했다. 실제 계정의 새 OAuth나 AI 호출을 다시 수행한 것은 아니다. 학습 DB 마이그레이션·정답 판정·복습 계산·화면 배치는 변경하지 않았다.

API 사용은 [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/)과 [React Native 0.86 AppState](https://reactnative.dev/docs/0.86/appstate)의 버전별 문서를 확인했다. AppState change에서 배경 전환을 취소 경계로 사용하며, 화면 상태와 관계없는 전송 동의·소유권은 repository 이벤트와 dispatch guard로 확인한다.
