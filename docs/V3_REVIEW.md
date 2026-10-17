# V3 종료 검수

- 검수일: 2026-10-18 (Asia/Seoul)
- 검수 소스: `d4e0cc00472baf9f3171c8c289d1b70ccf98636d` (`V3.END`)
- 범위: 코드·저장소 트랜잭션·AI 요청 상태·과목 전환·Android 빌드·에뮬레이터 레이아웃. 앱 동작 수정은 하지 않았다.
- 판정: 기본 검사와 빌드는 통과한다. **P1 2건, P2 2건**을 수정한 뒤 해당 경로를 재검증해야 한다. 검수 통과 또는 출시 승인으로 표시하지 않는다.

## 수정 후 상태 — V3.FIX (2026-10-18)

아래 발견 사항과 실패 fixture는 수정 전 검수 기록이다. R1–R4는 수정했고 현재 회귀 검사는 `ResponseOwnershipTest.kt`, `QuestionBoundaries.test.tsx`, 저장소/AI plan/screen 테스트로 정식 편입했다. `npm run check`의 Jest97, Kotlin49와 debug/AndroidTest 빌드가 통과한다. 정답 글자 대비는 4.966:1이다. 기존 fixture의 실행 안내는 수정 전 재현용으로 남긴다.

세로 360dp/기본·200% 글씨의 스크롤 도달 검사는 통과했다. **가로 회전 자동 검사는 실패했고 재검사에서 native Fabric 크래시를 관찰했다.** 원인은 확정하지 않았으며 후속 분석이 필요하다. 전체 검수/출시 승인으로 표시하지 않는다. 상세 수정·미검증 범위는 `WORK_LOG.md` V3.FIX와 `VERIFICATION.md`를 따른다.

## 발견 사항

### R1 · P1 · 자동 계획과 채팅이 같은 응답을 받는다

- 위치: `modules/siwc-android/android/src/main/java/com/teumknowledge/siwc/SiwcManager.kt:166–169`.
- `startResponse()`는 진행 중인 요청이 있으면 새 요청의 내용을 처리하지 않고 기존 `requestId`를 반환한다. 자동 계획(`src/services/ai/plan.ts`)과 채팅(`app/ai/[conceptId].tsx`)은 각자 이벤트를 구독하고 반환받은 ID를 자신의 요청으로 취급한다.
- 재현: 7일 계획이 진행 중일 때 힌트 채팅을 시작한다. 두 호출의 instructions/input은 서로 다른데 같은 ID가 반환된다. 계획의 JSON이 질문에 대한 AI 답변으로 저장될 수 있고, 채팅에서 중단하면 계획도 취소된다. 반대로 진행 중인 채팅에 계획 요청이 붙으면 채팅 답변을 계획 JSON으로 해석하게 된다.
- 증거: 실제 `SiwcManager`를 실행한 격리 JUnit에서 서로 다른 두 요청에 동일한 ID가 반환됨을 확인했다. 작업 스레드는 registry lock으로 보류하고 종료했으며 실제 계정·네트워크를 사용하지 않았다. 계획/채팅의 오표시 결과는 두 소비자의 이벤트 처리 코드에 따른 영향이며 실제 계정으로 경쟁 요청을 보내지는 않았다.
- 수정 방향: 다른 요청에는 명시적인 busy 오류를 반환하거나 요청별 ID·취소 소유권을 유지하는 큐를 사용한다. 자동 계획과 대화가 같은 실행을 자신의 것으로 채택하지 않도록 한다.
- 완료 기준: 두 소비자가 동시에 요청해도 응답·취소가 섞이지 않고, 계획 JSON이 대화에 저장되지 않는다.

### R2 · P1 · 답을 확인한 뒤 과목을 바꾸면 새 과목 학습이 막힌다

- 위치: `src/screens/QuestionScreen.tsx:150–165`.
- 화면의 `pinned` 세션을 learner ID가 바뀔 때만 무효화한다. 과목 변경과 현재 기록 초기화는 learner ID를 유지한다.
- 재현: 정보처리기사 문제에 답하고 결과 화면에서 설정 → 과목 → SQLD로 바꾼 뒤 돌아온다. 이전 과목의 pinned 세션이 남아 `target`은 null인데 현재 과목에서 concept를 찾지 못해, 새 문제가 남아 있어도 **“지금은 쉬어 가요.”**가 나온다. 이 상태에는 pinned를 지우는 “다음”이 없어 앱을 다시 시작하거나 원래 과목으로 되돌아가야 한다.
- 같은 원인의 추가 재현: 결과 화면에서 현재 학습 기록을 초기화하고 돌아오면 DB에서 삭제한 세션의 답과 “다음”이 화면에 남는다.
- 증거: 실제 인메모리 SQLite repository와 실제 `QuestionScreen`을 사용한 RNTL 검사 2개에서 각각 새 문제 표시·초기화 상태 표시 단언이 실패했다. 네이티브 UI 부품과 외부 연결만 대체했다.
- 수정 방향: 화면 상태의 소유 범위에 과목과 초기화 세대를 포함한다. 현재 repository에 없는 세션을 pinned로 유지하지 않는다. learner만으로 초기화 여부를 판단하지 않는다.
- 완료 기준: 결과 표시 중 과목 변경·초기화·프로필 전환을 해도 즉시 현재 범위의 유효한 문제와 기록을 보여 준다.

### R3 · P2 · 초기화 전에 요청한 AI 계획이 삭제 후 다시 저장된다

- 위치: `src/services/ai/plan.ts:58–74`, `src/data/repositories/LearningRepository.ts:311–324`.
- 계획 요청은 시작 시점의 학습 이력을 캡처한다. `savePlan()`은 learner와 과목만 확인하며, 같은 learner의 기록 초기화 이후인지 확인하지 않는다. `resetCurrent()`도 진행 중인 계획을 취소하거나 세대를 바꾸지 않는다.
- 재현: `requestPlan()`을 시작하고 응답을 보류 → `resetCurrent()` → 이전 이력으로 생성된 completed 응답 전달. 삭제됐던 `plans` 행이 다시 만들어진다.
- 증거: 실제 repository에 지연된 모의 completed 이벤트를 전달해 `repo.plan()`이 null이어야 한다는 단언이 실패했다. 반환값은 초기화 전 요청에서 생성된 계획이다.
- 수정 방향: 초기화/프로필/과목 변경에 대한 작업 세대를 캡처하고 저장 직전에 검사한다. 무효화된 요청을 취소하고, `savePlan()`의 거부 결과도 hook에서 완료로 채택하지 않게 한다. 일반 학습 답변마다 바뀌는 revision과 초기화 경계를 구분한다.
- 완료 기준: 초기화 전 요청은 계획을 복구하거나 화면에 다시 채택하지 않는다. 초기화 후 새로 시작한 요청은 정상 저장된다.

### R4 · P2 · 정답 표시의 민트 글자 대비가 부족하다

- 위치: `src/theme/tokens.ts:22`, `src/screens/QuestionScreen.tsx:416–417`, `app/revisit/[conceptId].tsx:143–147`; 네이티브 카드의 RIGHT 색도 동일하다.
- `mintDeep #2E9E77`와 띠 바탕 `#E8F0EA`의 sRGB 상대휘도 대비는 **2.883:1**이다. 14 크기의 “맞았어요” 등 의미 있는 작은 글자에 적용된다. 체크 표시와 문구가 함께 있어 색만으로 판정을 전달하지는 않지만 글자를 읽기 어렵다.
- 기준: [WCAG 대비 안내](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)의 일반 글자 4.5:1 기준을 가독성 검수 기준으로 사용했다. 큰 글자 3:1 기준에도 못 미친다.
- 수정 방향: 민트 강조색은 유지하되 작은 글자용 전경색을 더 어둡게 분리한다. 앱·카드·위젯의 동일 색상 사용처를 함께 확인한다.
- 완료 기준: 실제 배경에 대한 텍스트 대비를 계산하고 정답·오답 문구와 아이콘을 확인한다.

## 직접 실행한 검증

| 항목 | 이번 결과 |
| --- | --- |
| `npm run check` | 타입·린트·기존 Jest 80개·콘텐츠 구조 통과 |
| Kotlin 기존 검사 | SIWC 34개 + Gap 14개, 실패 0 |
| Android | debug APK + AndroidTest APK 빌드 성공, API36에 기존 데이터 유지 설치 |
| 추가 경계 검사 | RNTL/SQLite 3개 실패: 과목 변경, 초기화 후 화면, 늦은 계획 저장 |
| 추가 네이티브 검사 | JUnit 1개 실패: 요청 ID 소유권 |
| 대비 계산 | 민트 정답 글자/밝은 띠 2.883:1 |

추가 검사는 정상 동작을 기대하는 단언을 두었으며 위 결함 때문에 실패한 것이다. 기존 80개 통과와 구분한다. 실패 재현 fixture는 `docs/review-fixtures/`에 텍스트로 보존하여 기본 테스트 검색에 섞이지 않게 했다. 앱 소스는 수정하지 않았다.

### 재현 fixture 실행

JS 경계 검사:

```sh
mkdir -p artifacts/v3-review/__tests__
cp docs/review-fixtures/V3Boundaries.test.tsx.txt artifacts/v3-review/__tests__/boundaries.test.tsx
./node_modules/.bin/jest --runInBand --runTestsByPath artifacts/v3-review/__tests__/boundaries.test.tsx
# 확인 후 이 임시 .tsx를 제거하거나 .txt로 바꾸면 기본 80개 검사와 분리된다.
```

네이티브 소유권 검사:

```sh
cp docs/review-fixtures/ResponseOwnershipReviewTest.kt.txt modules/siwc-android/android/src/test/java/com/teumknowledge/siwc/ResponseOwnershipReviewTest.kt
./android/gradlew -p android :siwc-android:testDebugUnitTest --tests '*ResponseOwnershipReviewTest' --console=plain
# 확인 후 복사한 임시 .kt를 제거한다. JDK/SDK 환경은 BUILD.md 기준이다.
```

## UI 검수 범위와 제한

UI UX Pro Max의 React Native 기준과 Impeccable native audit를 적용했다. 컨텍스트 로더는 실행 권한 오류로 실패해 기존 로컬 제품·디자인 기준과 현재 코드를 직접 읽었다. 원래 계획의 4개 탭이나 이전 색상 규칙을 현재 V3에 다시 강제하지 않았다.

- 기존 `LayoutTest`: 360dp·100% 글씨에서 통과했다.
- 360dp·200%에서는 `Option too small: Rect(72, 2060 - 1008, 2062)`로 실패했다. 이 검사는 스크롤 화면의 일부만 보이는 선택지에도 최소 보이는 높이를 요구한다. **실패만으로 앱의 선택지/스크롤이 고장났다고 확정하지 않는다.** 해당 조건의 전체 선택지 도달과 기본 버튼 조작은 통과로 기록할 수 없다.
- 412dp 기준 가로·100% 검사도 `No answer options`로 실패했다. 해당 검사는 스크롤 전 현재 노출된 선택지만 찾으므로, 스크롤로 도달 가능한지 별도 확인이 필요하다. 가로 화면 지원 통과로 기록하지 않는다.
- 실패 후 보조 캡처는 앱이 아닌 런처를 담았다. 그 이미지를 앱 레이아웃 결함의 증거로 사용하지 않는다.
- 글씨 크기·밀도·회전 설정은 검사 종료 시 원복한다. 온보딩/MainFlow의 데이터 삭제 스크립트는 실행하지 않았다.

| UI 검수 차원 | 판정 |
| --- | --- |
| 접근성 | 부분 확인: 판정 문구 대비 부족(R4), 버튼·선택지 역할과 라벨 존재. TalkBack 실조작 미확인 |
| 성능 | 동기 SQLite·제한된 콘텐츠 규모 검토. 프레임/실기기 성능 계측 미실행 |
| 외형·테마 | V3의 어두운 문제/밝은 읽기 화면과 민트 정체성 유지. 작은 판정 글자 개선 필요 |
| 플랫폼 동작 | SafeArea·Router back·네이티브 알림/위젯 사용. 전체 시스템 제스처 미확인 |
| 화면 적응 | 기본 폭 일부 확인, 확대 글씨 자동 검사 실패. 종합 점수 미산정 |

## 유지할 구현과 후속 순서

- SQLite의 중복 이벤트 멱등 수집·트랜잭션과 계정별 기록 분리, 토큰의 Keystore 경계, 실패/미완료 응답과 completed 구분은 유지한다.
- R1 → R2 → R3 순서로 상태 소유권을 수정하고, 실패 재현을 회귀 검사로 옮긴다. UI는 R4를 수정한 뒤 확대 글씨에서 실제 스크롤 조작을 확인하고 마지막 polish를 수행한다.
- 새 OAuth 로그인·계정 추가/로그아웃·실제 AI 경쟁 호출은 실행하지 않았다. 이전에 기록된 실제 힌트/계획 성공을 이번 검수 결과로 재사용하지 않는다.
- 삼성 등 다른 런처·물리 기기·개별 콘텐츠 출처 대조·배포 서명은 이번에 검증하지 않았다. 실사용자 모집과 피드백은 추후 과제 메모다.
