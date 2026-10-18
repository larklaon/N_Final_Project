# V4 최종 독립 검수

- 검수일: 2026-10-18 (Asia/Seoul)
- 검수 대상: `f3a0a82d4fcca362e93de52d4b8ce5e4836a5669`, `codex/android-mvp`
- 판정: **기본 검사·빌드는 통과하지만, 아래 5건을 수정한 뒤 마무리하는 것을 권장한다.**
> 후속 V4.FIX: 아래 5건의 수정과 회귀 검증을 완료했다. 최신 결과는 [V4_FIXES](V4_FIXES.md)를 따른다. 아래 내용은 수정 전 소스의 검수 기록이다.

- 이번 작업은 검수다. 앱 동작 코드를 수정하지 않았다. 별도 fixture로 결함을 재현했고 정상 테스트 목록과 분리해 보관한다.

## 요약

| ID | 우선순위 | 문제 | 재현 결과 |
| --- | --- | --- | --- |
| R1 | P1 | 삭제한 메모리가 진행 중 AI 추출 결과로 다시 생김 | 삭제 후 0개 기대 → candidate 1개 생성 |
| R2 | P2 | 삭제한 메모리의 미완료 확인 문제가 일반 세션 재개 경로로 다시 열림 | checkSession은 null, openSession은 이전 ai: 문제 반환 |
| R3 | P2 | 채팅 종료 때 대기 요청들이 동시에 시작됨 | terminal 전 startResponse 1회 기대 → 2회 |
| R4 | P2 | 독립 검토가 해설을 보지 않아 모순된 해설도 승인됨 | 잘못된 해설 전달 안 됨, 후보 1개 승인 |
| R5 | P2 | 첫 준비 이후 새로 완료한 대화가 다음 준비를 예약하지 않음 | 새 근거 존재, 60초 후 호출 수 2회 기대 → 1회 |

기존 Jest 141개는 통과했다. 추가 재현 5개는 각각 원하는 동작 단언에서 실패했다. fixture의 잘못된 AI 출력은 의도적으로 만든 입력이며 실제 ChatGPT가 같은 문장을 생성했다고 주장하지 않는다.

## R1 — 삭제와 진행 중 추출 결과의 경계가 없음

- 위치: `src/data/repositories/PersonalizationStore.ts:427`의 applyCandidates, `:521`의 deleteMemory. 실행 측은 `src/services/ai/personalization.ts`와 `usePersonalization.ts`.
- 조건: 메모리가 이미 있고, 새 오답 g3를 담은 추출이 진행 중일 때 사용자가 해당 메모리를 삭제한다.
- 원인: 삭제는 학습 scope를 바꾸거나 해당 개인화 작업의 유효성을 무효화하지 않는다. applyCandidates는 owner/scope와 ignored 근거만 검사한 뒤 메모리가 없으면 새로 INSERT한다. g3는 삭제 전에 추출 입력에 담겼지만 아직 기존 메모리의 evidence가 아니므로 삭제/무시와의 경계를 통과한다.
- 재현: 기존 g1/g2로 메모리 생성 → g3 입력과 owner 캡처 → deleteMemory → 캡처된 추출 결과 applyCandidates. 메모리 0개가 아니라 새로운 ID의 candidate 1개가 생겼다.
- 영향: 사용자가 지운 개인화 해석이 옛 요청으로 부활한다. 다음 생성/계획에도 다시 쓰일 수 있다.
- 수정 완료 기준: 삭제/무시 시점 전에 시작된 해당 메모리·skill의 결과는 저장하지 않는다. 개인화 변경 세대/대상 revision 등을 저장 전 다시 확인하고 작업도 취소한다. 삭제 **이후 새로 발생한 근거**는 정상 처리할 수 있게 구분한다. 진행 중 생성/검토 단계도 같은 경계로 검사한다.

## R2 — checkSession에서 막아도 openSession이 옛 확인을 재개함

- 위치: `src/data/repositories/LearningRepository.ts:591`의 기존 세션 선택.
- 원인: openSession은 동일 occurrence의 미완료 세션이면 checkMemoryId가 있는 세션도 반환한다. 이 경로에는 메모리 존재/상태·개인화 활성 여부·생성 문제의 신규 출제 적격성 검사가 없다. hidden 문제 조회를 과거 기록용으로 허용하는 것과 새 세션 재개 허용이 섞였다.
- 재현: active 메모리 → 생성 카드 응답 → 25시간 뒤 확인 문제 배정 → 메모리 삭제 → checkSession은 null → openSession('ds-queue')은 삭제 전에 배정된 ai: 확인 문제를 반환한다.
- 영향: 해당 개념이 다시 선택되면 지운 헷갈림의 확인 문제를 계속 보게 된다. 개인화 끄기·무시 후의 재개 경로도 함께 점검해야 한다.
- 수정 완료 기준: 미완료 확인 재개는 같은 적격성 검사로 통일한다. 부적격 확인을 건너뛰고 일반 문제로 복귀하되 이미 답한 문제의 원본·이력은 보존한다. 세션 ID를 통한 중복 채점 방지도 유지한다.

## R3 — 대기 해제와 실제 슬롯 점유가 원자적이지 않음

- 위치: `src/services/ai/requestCoordinator.ts:120`, 특히 `:167`.
- 원인: acquire는 슬롯이 비어 있음을 확인하고 return하지만 실제 running 설정은 별도 `.then(() => start(...))`에서 한다. wake가 대기자를 전부 깨우면 두 acquire가 모두 빈 슬롯을 본 뒤 start가 두 번 실행될 수 있다.
- 재현: beginChat으로 슬롯 유지 → background와 plan 요청을 각각 대기 → release → microtask 진행. 첫 요청의 terminal 전 startResponse가 2회 호출됐다.
- 영향: native의 response_busy 보호 때문에 동시에 두 추론을 허용하지는 않는다. 대신 정상 대기하던 계획/개인화 요청이 실패하고, running 추적과 실제 소유 요청이 어긋날 수 있다. 우선순위대로 계획이 먼저 실행된다는 보장도 깨진다.
- 수정 완료 기준: dequeue·선택·running 예약을 하나의 동기적 단계로 처리한다. 우선순위 큐/명시적 슬롯 예약을 사용하고, 대기 중 취소도 제거한다. 채팅 선점·늦은 native ID의 자기 요청 취소 규칙은 유지한다. 대기 요청 2개 이상에서 첫 terminal 전 start 1회, 이후 다음 실행을 검증한다.

## R4 — 정답 검토에서 해설의 일관성을 검사하지 않음

- 위치: `src/domain/personalization.ts:415`의 reviewInput과 `:437`의 approvedByReview.
- 재현 입력: 문제 “큐는 먼저 넣은 것을 먼저 꺼낸다.”, 정답 O, 해설 “큐는 후입선출이라 마지막에 넣은 것부터 꺼내요.”. 구조 검사를 통과한다.
- 원인: 검토 요청에는 문제·보기·기준 사실만 있고 explanation은 없다. 검토자가 문제의 정답 O와 supported를 돌려주면, 정답과 모순된 생성 해설까지 그대로 승인·저장된다.
- 영향: 채점은 맞으면서 알림 피드백·앱 해설은 틀릴 수 있다. 추가 검토를 했다는 것만으로 해설 일관성이 보장되지 않는다.
- 수정 완료 기준: 생성자 답을 가린 독립 풀이를 유지하면서 표시할 해설도 기준 자료와 대조한다. 추가 검토 단계를 두거나, V4 범위에서는 승인 fact를 바탕으로 앱이 정형 해설을 구성하는 방법도 가능하다. 정답·해설이 충돌하는 fixture를 승인/표시하지 않아야 한다. 호출 수를 늘리면 일일 예산과 계획에도 반영한다.

## R5 — 완료 대화가 준비 작업의 변경 신호에 반영되지 않음

- 위치: `src/data/repositories/LearningRepository.ts:833`의 addChatMessage, `src/services/ai/usePersonalization.ts:37`의 예약 effect.
- 조건: 연결/모델이 안정된 상태로 화면을 계속 사용하며 최초 idle 준비가 끝난 뒤 새 대화를 완료한 경우.
- 원인: 대화 INSERT는 memoryRevision이나 별도 대화 변경 신호를 갱신하지 않는다. 채팅 화면도 completed 때 로컬 messages만 갱신한다. Runner의 effect는 auth/models/enabled/revision 등이 바뀔 때 한 번만 timer를 만들기 때문에 새 근거를 알지 못한다.
- 재현: 첫 30초 후 nothing_new 1회 → 완료된 user/assistant 대화 저장 → extractionInput에 새 근거 1개 존재 확인 → snapshot 갱신/rerender → 60초 경과. 준비 호출은 여전히 1회였다.
- 영향: 같은 화면에서 이어 나눈 대화가 개인화로 연결되지 않고 앱 재진입·다른 학습 상태 변경 때까지 미뤄질 수 있다. 모든 대화가 항상 누락된다는 뜻은 아니다. 앱 복귀의 auth 갱신 등은 우연히 재예약을 유발할 수 있다.
- 수정 완료 기준: 완료 대화/새 오답의 명시적 준비 revision 또는 이벤트를 두고 마지막 활동 이후 idle을 다시 계산한다. streaming/assistant-only 변경을 중복 근거로 보내지 않고, 재시도·한도·채팅 우선순위를 유지한다. 새로운 대화 1개가 추가 준비 1회로 이어지는 hook 검증을 추가한다.

## 실행한 검증과 제한

- `npm run check`: 타입·ESLint·Jest **141/141 (22 suites)**·콘텐츠 구조·네이티브 패치 설치 검사 3개 통과.
- Gradle: SIWC JUnit **35**, Gap JUnit **17**, debug APK 및 AndroidTest APK 빌드 성공. 기존 데이터 유지 설치.
- 추가 독립 재현: repository/순수 함수/조정기 4개 + 실제 Runner hook 1개. 현재 소스에서 **5개 모두 원하는 동작 단언 실패**. 메모리·DB는 테스트용 in-memory SQLite, SIWC는 모의 gateway를 사용했다. 실제 계정 호출·인증 변경은 하지 않았다.
- UI 재검사: 최초 360dp/200% 검사는 현재 계정이 오늘 목표 5/5를 완료한 상태여서 0/4 실패. 새 캡처에서 정상 “오늘 몫은 끝.” 화면임을 확인했다. 이 실패는 결함 수에 넣지 않는다. 임시 테스트에서 “조금 더 풀기”로 진입한 두 번째 검사는 1/4로 실패했다. 새 캡처에는 코드 예제와 첫 선택지가 보이고, 세로 ScrollView의 scroll 반환값은 false였다. 실제 모든 보기의 수동 도달 여부 및 검사 제스처와 중첩 코드 스크롤의 관계는 확정하지 않았다. **360dp/200% 보기 도달 재검사는 미완료**로 남기며 앱 결함 5건에 더하지 않는다. 회전 검사는 앞선 실패 때문에 실행되지 않았다. UI 변경/반복 보정은 수행하지 않았고 임시 LayoutTest 소스와 표시 설정을 복원했다.
- UI 검토는 기존 PRODUCT/DESIGN 및 UI UX Pro Max·Impeccable 네이티브 지침을 참고했다. Impeccable context 런처는 권한 오류로 실행되지 않아 로컬 문서를 직접 읽었다. 전체 UI 품질 점수나 모든 V4 화면의 검수 완료를 주장하지 않는다.
- 이번 검수에서 TalkBack 실제 낭독·사람 모집·설문은 제외했다. 물리 기기·release/외부 서명 APK·장시간 안정성·생성 문장 전체의 전문가 검수는 확인하지 않았다.
- 기존 개발 기록에는 실제 ChatGPT의 V4 흐름 확인이 있다. 이번 독립 fixture 성공/실패와 구분한다. SIWC_STATUS 상단의 미검증 표기는 후속 WORK_LOG/VERIFICATION과 시점 차이가 있으므로 인계 전에 최신 증거에 맞춰 정리할 필요가 있다.

## 재현 산출물과 다음 작업

- `docs/review-fixtures/v4/`: 수정자에게 전달하는 재현 코드와 실행 안내. 기본 테스트에 실패 fixture를 섞지 않도록 `.fixture` 확장자로 보관한다.
- 로컬 ignored artifacts: `v4-review-check.log`, `v4-review-build.log`, `v4-review-repros.log`, `v4-review-runner.log`, `v4-review-layout.log`, `v4-review/` 캡처.
- 수정 순서 권장: R1 삭제 경계 → R2 세션 재개 → R3 요청 큐 → R5 완료 대화 신호 → R4 해설 검사. 각 수정 후 해당 재현을 정상 회귀 테스트로 옮겨 통과시킨다.
- 자동 테스트·모의 응답을 실제 사용자 수/학습 효과/외부 배포 증빙으로 계산하지 않는다.
