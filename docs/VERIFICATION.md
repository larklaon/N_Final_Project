# 개발 검증 결과

## APK 다운로드 경로 (2026-10-19, DOC.DISTRIBUTION)

- 사용자가 업로드한 [시연용 APK · Google Drive](https://drive.google.com/file/d/17EUrKKdw9NOm-5nluntDH5FhYkvwNrCk/view?usp=drive_link)를 README·설치 가이드·기획서·아키텍처에 연결했다.
- Drive 메타데이터에서 파일명 `teum-knowledge-0.1.0-demo-arm64.apk`, Android APK MIME, 48,025,841bytes와 `anyone/reader`(링크를 가진 사용자 보기, 검색 노출 꺼짐) 권한을 확인했다. 원본 파일 스트리밍도 성공했다. 공유 설정은 변경하지 않았다.
- 파일명·크기는 FINAL.FIX의 로컬 시연용 APK와 일치한다. 공유 파일의 SHA256 동일성은 이번에 확인하지 않았다. 앱 재빌드·재설치·새 OAuth·AI 호출은 수행하지 않았다.

## V4 마무리 검수 수정 (2026-10-19, FINAL.FIX)

- FINAL-R1–R4 수정: 동의 변경의 동기 취소·dispatch 재확인, 채팅의 공통 큐와 ID 이전 취소, 삭제 뒤 늦은 응답 거부, native 정리·소유권 해제 후 terminal 전달. 상세는 [FINAL_FIXES](FINAL_FIXES.md).
- `npm run check`: 타입·ESLint·Jest **169/169 (26 suites)**·콘텐츠72/144/72·네이티브 패치3 통과. SIWC JUnit **38/38**·Gap **17/17**, debug·AndroidTest·시연용 release APK 빌드 통과.
- 수정 전 재현을 정상 회귀 검사로 전환했다. 동의 재허용·배경 전환·unmount·늦은 ID·중지 직후 새 요청·completed/SSE 실패/HTTP 실패 후 다음 요청까지 확인했다.
- 새 시연 APK: **48,025,841 bytes**, SHA256 `20254fc38ce902a324d39b5fae687fa87194b954e571a64b72e155911b768cfb`. 데이터 유지 설치, Metro 없는 문제 화면 실행 2/2·PID 유지·앱 크래시 없음. 새 OAuth·실제 AI 호출은 이번에 다시 실행하지 않았다.
- 검사 뒤 최신 debug APK와 8081 reverse 복구. DB 초기화·계정 변경·정답 제출 없음. 이전 검수 보고서는 당시 기록으로 보존한다.

## V4 마무리 검수 (2026-10-19, FINAL.AUDIT)

아래는 수정 전 기록이며, 4건의 후속 수정·최신 검증은 위 FINAL.FIX를 따른다.

- 대상 `ea1b257`. 기본 `npm run check`(Jest158·타입·린트·콘텐츠·패치3)와 SIWC35/Gap17 Kotlin/JUnit 재실행, debug·AndroidTest APK 빌드 통과.
- 추가 경계 재현에서 4건 확인: 동의 철회 뒤 대기 계획 전송, 대화 삭제 뒤 늦은 답변 저장, ID 반환 전 중지 무시, native 완료 이벤트와 busy 해제의 순서 불일치. Jest3·Kotlin1 fixture는 기대 동작 단언에서 실패했다.
- 정상 검사 통과로 위 4건이 해소됐다고 해석하지 않는다. 앱 동작 코드는 수정하지 않았다. 상세 원인·위치·재현·수정 기준은 [FINAL_AUDIT](FINAL_AUDIT.md), 별도 [재현 자료](review-fixtures/final/README.md)를 따른다.
- UI: 360dp/100% LayoutTest 통과. 200%는 긴 지문 뒤의 선택지를 스크롤 전에 찾는 사전 조건에서 자동 검사가 중단됐지만, 직접 스크롤 후 네 보기 모두 48dp 이상으로 도달함을 확인했다. 표시 설정은 복구했다.
- 개발 APK 재실행 5/5(설정·퍼즐 왕복·세로 고정 포함), 현재 시연 APK의 Metro 없는 실행 2/2 통과. 실제 APK checksum·검사 경계·캡처 위치는 FINAL_AUDIT에 기록했다. 검사 뒤 기존 debug APK·8081 reverse·표시/회전 설정으로 복구했다.

## 제출 문서 정리 (2026-10-19, DOC.FINAL1)

- 현재 소스를 대상으로 `npm run check`를 다시 실행했다. TypeScript·ESLint·Jest 158/158(25 suites)·콘텐츠 72개념/144틈새/72앱 문제·native patch fixture 3개가 통과했다. 문서·PPTX만 수정했으며 Android 앱과 APK는 다시 빌드하지 않았다.
- 8장 발표용 PPTX는 편집 가능한 텍스트와 실제 개발 화면 이미지를 넣고 패키지 무결성·슬라이드 배치 검사 및 재가져오기 검사를 통과했다. 이것은 PowerPoint 실기기 실행이나 외부 배포 검증이 아니다.

## V4 온보딩·화면 후속 수정과 시연 APK (2026-10-19, V4.UX1)

- 온보딩의 ChatGPT 연결 버튼은 동의 뒤 바로 로그인으로 이어진다. 소개 문구와 띠 가장자리 표시도 수정했다. Jest 158개, lint·타입 검사가 당시 통과했다. 상세는 WORK_LOG의 V4.UX1.
- 시연용 arm64 APK를 다시 빌드해 데이터 유지 설치 후 Metro 없이 실행했다. 크기 48,023,985 bytes, SHA256 `efdfbf0acade6fab8f13ca4e1e1ab5bda0632c625bc563976f587df8b3c3597f`. 로컬 release variant는 기본 debug key 서명이다.
- 이 결과는 신규 계정 로그인이나 물리 기기별 동작의 검증으로 확대하지 않는다.

## V4 최종 검수 수정 (2026-10-18, V4.FIX)

- 최종 검수5건 수정: 개인화 삭제 경계, 확인 재개/제출, 요청 큐, 기준 사실 해설, 완료 대화의 준비 신호. 상세는 V4_FIXES.
- npm check(타입·린트·Jest155/24 suites·콘텐츠·patch3), SIWC35/Gap17, debug/AndroidTest 빌드 및 데이터 유지 설치 통과.
- 360dp/200% 22.279초, 가로 요청 후 세로 유지19.007초 UI 검사 통과. 완료 화면 진입 전제/중첩 스크롤 제스처를 보완했고 실제4보기/48dp/버튼 단언 유지. 표시 설정 원복.
- 실제 AI·OAuth·물리 기기·release 서명은 이번 재검증하지 않음. 아래 검수/실패 항목은 해당 수정 전의 기록이다.

## V4 최종 독립 검수 (2026-10-18, V4.FINAL_REVIEW)

- 대상 f3a0a82. 기존 타입·린트·Jest141·패치3·콘텐츠, SIWC35/Gap17 및 debug/AndroidTest 빌드 통과.
- 별도 재현5개는 기대 단언 실패: 삭제 메모리 부활(P1), 확인 재개·동시 요청·해설 미검토·대화 준비 누락(P2). 상세/재현은 V4_FINAL_REVIEW와 review-fixtures/v4.
- 360dp/200% 자동 검사는 완료 화면0/4, 연습 진입 후1/4(scroll false)로 실패. 큰 글씨 보기 도달/회전 재검사는 미완료이며 원인을 앱 결함으로 확정하지 않았다. 임시 검사 소스·표시 설정 복원.
- 실제 계정 재호출·물리 기기·release는 이번 미검증. 앱 코드는 수정하지 않았다. 아래 기존 검증은 해당 시점 결과로 유지한다.

## V4 AI 맞춤 학습 (2026-10-18, V4.C1–C6)

**구현됨:** 근거 기반 헷갈림 메모리(추출·상태 규칙), 기준 자료(basis) 안에서만 만드는 O/X 카드와 확인 문제, 생성자 답을 숨긴 별도 검토 승인, 하루 한도(카드 3·확인 승인 1·출제 1·작업 2회·요청 6회), 앱 단위 요청 조정기(채팅 > 계획 > 준비), 덱 편입(원래 자리 교체·floor(N/5)·연속 없음·14일), 네이티브 만료·AI 표시, 확인 문제 일일 슬롯과 메모리 갱신, 7일 계획 연결, 설정 스위치·AI 표시·기준 자료·숨기기·무시/삭제.

**자동 검증됨:** Jest 141(V4 신규 44), lint·타입·콘텐츠 구조, Gap Kotlin 16, debug APK 빌드. fixture 응답으로 검사한 것: 추출 ref 검사·상태 전이, 생성 출력 거절(길이·두 줄·이중 부정·URL 등), 검토 불일치/애매/깨짐에서 승인 0, 같은 입력 재실행 없음, 취소·초기화·과목 변경 중 저장 0, 채팅 선점(자기 id만 취소), 덱 N=1/4/5/10/30, 다른 학습자 응답 거부, 숨김·만료 뒤 이력, 확인 24시간·다른 날짜·하루 1회·이어 풀기·목표 뒤 없음, 두 번 확인으로 resolved, 계획 입력에 요약만.

**인계 시나리오(fixture, `Check.test.ts`):** 틈새 오답 이벤트 `g1`(ds-queue-ox)→메모리 candidate, `g2`(ds-stack-ox)→active → AI 카드 `ai:<id>` 승인·덱 편입 → 카드 응답 이벤트 `card-1` → 25시간 뒤 확인 세션(`checkMemoryId`) 배정, 출제 수 1 → 정답 → `check-right` 근거, improving → 다음 날 새 확인 정답 → resolved, 카드 덱에서 제외.

**기기 확인:** API36 에뮬레이터에 데이터 유지 설치, v6 migration 뒤 기존 기록 유지, 설정 스위치 표시와 켜기/끄기(원복). 

**실제 계정(V4.R1–R2):** 실제 추출 → 메모리(active)·개념 화면 표시, 실제 생성 → 별도 검토 승인 카드 1장, 네이티브 덱 편입(origin·만료), 홈 위젯 "· AI" 표시와 응답 → 앱 기록·gap 진행도, 다시 풀기의 AI 표시·기준 자료·숨기기 → 덱 제외까지 확인. 첫 생성은 길이 기준 불일치로 0개였고 고쳤다.

**실제 계정(V4.Q2, 개발 빌드 테스트 규칙):** 확인 문제 출제 → improving → 두 번째 확인 → resolved·카드 덱 제외, 잠금 화면 AI 카드 표시·응답 기록, 방해 금지 켜짐/꺼짐, 헷갈린 점 삭제·무시, 7일 계획의 헷갈림 반영까지 확인. 시간·한도 규칙은 개발 빌드에서만 줄였고 배포 빌드 값은 자동 테스트로 검증한다.

**화면 크기·큰 글씨(V4.A1):** 411·360dp × 100·200%에서 V4 화면 전부 확인. 이 과정에서 글씨/화면 크기 변경 시 DB 연결이 깨지던 버그, 설정 행 세로 접힘, 문제 화면 닫기 버튼 잘림, 위젯 200% 넘침, 알림 머리글의 AI 표시 잘림을 고쳤다. 접힌 잠금 화면 알림은 200%에서 말줄임(펼치면 전체).

**시연 APK(V4.DEMO):** 시연 규칙을 켠 release APK(arm64, debug key 서명)를 Metro 없이 API36에서 실행, 데이터·연결 유지, 시연 규칙 동작 확인. 원래 규칙 release는 같은 명령에서 빌드 값만 빼면 된다(이번에 따로 설치하지 않음).

**미검증:** 물리 기기(갤럭시 A36 잠금 화면 표시 외).

## 세로 고정 (2026-10-18, V3.PORTRAIT)

- app.json portrait → Expo prebuild로 Android MainActivity portrait 생성 확인. debug/AndroidTest 재빌드와 데이터 유지 설치 성공, 타입·린트 통과.
- API36에서 가로 회전 요청 후에도 세로 유지 검사(6.242초)와 360dp/글씨200% 보기·버튼 도달 검사(8.044초) 통과. 캡처 XML 모두 rotation=0. 표시 설정 원복.
- 이전 가로 지원 검증은 당시 결과로 보존한다. 현재 제품 정책은 휴대폰 세로 고정이며 기존 네이티브 크래시 수정은 유지한다. 물리 기기·태블릿은 미검증.

## Android 네이티브 수정 (2026-10-18, V3.NATIVE_FIX)

- screens4.26.2에 공식 #4413 패치를 적용하고 postinstall 버전/해시 검증으로 설치 재현성을 확보했다. SDK57 버전 관계는 유지한다.
- 타입·린트·Jest97·패치 fixture3개·콘텐츠 구조, SIWC35/Gap14 Gradle 검사, debug/AndroidTest 빌드 통과. APK 내부 새 네이티브 함수도 확인했다.
- API36 cold start 20/20, 앱 crash 0건. 이 중 4회 설정/퍼즐 왕복과 가로/세로 회전 후 같은 PID 유지. 기존 데이터/계정은 보존했다.
- 가로 선택지 검사는 최초 빠른 scroll에서 2/4 실패. 앱이 살아 있는 캡처를 확보하고, 검사 속도를 낮춘 뒤 4개·48dp·확인 버튼 단언을 그대로 유지하여 31.421초 통과했다.
- 세부 근거는 ROTATION_ANALYSIS/WORK_LOG 및 patches/README를 따른다. 장시간·물리 기기·release 및 경쟁 직접 계측은 미검증. 아래 미적용/미해결 기록은 이 수정 전의 상태다.

## 회전 문제 분석 후 정정 (2026-10-18, V3.RCA)

- 가로 화면 0/4 실패는 테스트가 코드 블록의 HorizontalScrollView를 선택한 오류로 확정했다. vertical ScrollView로 대상을 고친 뒤 같은 가로100% LayoutTest가 50.251초에 통과했다. 일반 실행에서도 동일 PID로 회전·네 선택지 스크롤 도달을 확인했다.
- 실제 native 크래시는 별개다. exact BuildId 역어셈블 및 설치된 screens4.26.2 코드를 공식 #4413 수정과 대조하여 초기화 경쟁을 가장 유력한 원인으로 좁혔다. 패치 A/B 검증 전이므로 크래시 해결 완료로 표시하지 않는다.
- 타입·린트·AndroidTest APK 빌드 통과. 자세한 증거와 권장 수정은 `ROTATION_ANALYSIS.md`를 따른다. 아래 V3.FIX의 가로 실패는 이 분석 전의 역사적 기록이다.

## V3 검수 수정 (2026-10-18, V3.FIX)

- R1–R4(요청 ID 공유, 과목/초기화 후 이전 답 잔류, 늦은 계획 재저장, 정답 글자 대비)를 수정했다. 구현과 검사 상세는 `WORK_LOG.md`의 V3.FIX 항목을 따른다.
- 타입·린트·Jest 97개·콘텐츠 구조, Kotlin 49개(SIWC35/Gap14), Android debug·AndroidTest 빌드 통과. APK는 API36 에뮬레이터에 기존 데이터 유지 설치했다.
- 360dp/100%·200% 글씨에서 네 선택지 스크롤 도달과 기본 버튼 노출 검사 통과. 가로/100%는 실패, 재검사 중 native Fabric 크래시 관찰. 원인 미확정으로 **가로 회전 검증은 미완료**다.
- 정답 글자 #207354 / band #E8F0EA 대비 4.966:1, 오답 5.797:1. 기존 강조색은 보존했다.
- 실제 계정으로 동시 AI 요청·새 OAuth, 물리 기기·다른 런처·TalkBack·콘텐츠 정확성은 이번에 검증하지 않았다.

## V3 마무리 (2026-10-17, V3.END)

- **자동 검사:** typecheck·ESLint·Jest 80개·콘텐츠 2묶음(잠금 화면 두 줄 맞춤 포함)·expo-doctor 21개, Gap Kotlin 14개, debug·androidTest 빌드.
- **에뮬레이터(API36)에서 확인:** 실제 ChatGPT 계정으로 힌트·왜 그런지·본문 인용 대화와 AI 7일 계획 생성(정보처리기사·SQLD), 구독 사용량 공식 페이지 열기/닫기, 과목 받기·전환과 과목별 하루 수, 잠금 화면 카드(접힘/펼침·결과 유지·짧은 문장), 위젯 세 크기와 정답/오답 색, 스친 조각 다시 풀기와 기록 반영, 퍼즐 ⓘ 시트, 카드 시간 휠, 앱 아이콘·시작 화면.
- **확인하지 못한 것:** 새 로그인·계정 추가·로그아웃(연결된 계정 보호), 채팅창 한국어 직접 입력(자동 입력 한계), 온보딩·UI 스모크 재실행(데이터 초기화), MainFlowTest 실행(빌드만), 객관식 잠금 화면 카드 펼침, 어두운 테마, 삼성 등 다른 런처·좁은 화면·큰 글꼴, 화면 낭독기로 휠 조작.
- **알아 둘 것:** 잠금 화면 두 줄 기준은 411dp 폭 기준 추정치다. 새로 쓴 잠금 화면용 짧은 문장 59개는 사람 검토가 필요하다.

## V2 (2026-10-16, V2.C1–C5)

| 항목 | 결과 |
| --- | --- |
| TypeScript strict · ESLint | 통과 |
| Jest | 53개 통과 (저장소·마이그레이션 v3·틈새 반영·카드 묶음·퍼즐·동기화 경쟁·AI 화면·설정) |
| 콘텐츠 구조 | 개념 60, 틈새 카드 120, 앱 문제 60 통과 |
| Expo Doctor | 21/21 통과 |
| Kotlin/JUnit | 42개 통과 (GapState 8 추가) |
| Android debug · AndroidTest build | 성공 |
| Instrumented (API36 ARM64) | MainFlowTest(온보딩→문제→맞음→재실행 후 진도 유지→퍼즐), LayoutTest(현재 표시 설정), AuthServiceStaleStartTest(수정 전 강제 종료 재현, 수정 후 통과) |
| 틈새 카드 | 알림창에서 게시(무음·공개·Silent 그룹 위)·O 응답→결과→다음·앱 재실행 시 반영 확인. 에뮬레이터에 잠금 화면 보안이 없어 잠금 화면 자체 표시는 미확인 |
| 홈 위젯 | 배치 요청·표시·응답·알림과 상태 공유 확인 |
| 글씨 200%·밀도·가로 조합 | 이번에는 미실행 (`scripts/native-layout-check.py`, 에뮬레이터 표시 설정 변경 필요) |
| 실제 OAuth / AI response.completed | 미검증 |
| 실기기(삼성 One UI 등) 카드·위젯 렌더링 | 미검증 |
| 콘텐츠 개별 출처 대조 | 미완료·AI 초안 표시 |

아래는 이전 checkpoint 기록이다.

기준: 2026-10-15. 자동 검사, 실제 Android 실행, 외부 계정 검증을 구분합니다.

| 항목 | 결과 |
| --- | --- |
| TypeScript strict | 통과 |
| ESLint | 통과 |
| Jest | 17개 통과 (복습·SQLite 트랜잭션·격리·마이그레이션·AI 맥락·알림 계산) |
| 콘텐츠 구조 | 60개/120문항 통과 |
| Expo Doctor | 21/21 통과 |
| Metro Android export | 성공 |
| Kotlin/JUnit | 9개 통과 |
| Android debug build | 성공 |
| API36 ARM64 설치·앱 실행 | 성공. 프로세스 강제 종료 후 재실행에서 진도 유지 확인 |
| UI Automator 학습 경로 | API36 ARM64에서 1개 통합 흐름 통과 (온보딩→개념→정답→오늘 목표→기록) |
| 실제 OAuth / AI response.completed | 미검증 |
| 실제 기기 알림 도착 | 미검증 |
| 콘텐츠 개별 출처 대조 | 미완료·AI 초안 표시 |

## 검증 범위

Jest의 저장 테스트는 Node SQLite 실제 DB에 schema와 트랜잭션을 실행합니다. 앱 재시작과 동일한 repository reopen, 중복 제출, 실패 trigger 롤백, 프로필 분리와 v1→v2 마이그레이션을 검사합니다. Kotlin은 실제 RSA 서명을 생성해 신원을 검사하고 loopback 소켓에서 경로/state 거부와 포트 대체를 검증합니다. 외부 인증 서버를 fixture 테스트에서 호출하지 않습니다.

## 의존성

`npm audit`는 현재 64건(15 moderate,49 high)을 보고합니다. `npm audit fix`를 시도했으나 해결되지 않았고, 제안에 SDK58 전환이나 Expo44/RN0.72 등 호환되지 않는 변경이 포함되어 강제 적용하지 않았습니다. 많은 항목이 Expo/Metro/Jest 등의 전이 개발 도구에 연결되지만, 실제 도달 가능성과 대응 여부는 출시 전에 별도 검토해야 합니다. 통과한 타입·빌드 검사로 보안 검토를 대체하지 않습니다.

## 추후 메모

신규 계정 인증, 다른 물리 기기에서의 동작과 콘텐츠 정확성은 현재 자동 검증 범위 밖입니다. 시연용 APK는 [Google Drive](https://drive.google.com/file/d/17EUrKKdw9NOm-5nluntDH5FhYkvwNrCk/view?usp=drive_link)에서 제공합니다. 공유 파일·권한 확인 결과는 위 DOC.DISTRIBUTION 항목을 따릅니다.

## 화면 증거

API36 ARM64 Development Build의 합성 학습 기록입니다. 개발 도구 버튼이 보이는 개발용 화면입니다.

![오늘 화면](screenshots/today.png)
![정답 확인](screenshots/quiz-result.png)
![기록 화면](screenshots/history.png)

## UI smoke 재현

Metro를 8081에서 실행하고, BUILD 절차에 더해 `:app:assembleDebugAndroidTest`를 빌드하여 앱과 테스트 APK를 설치합니다. `TEUM_RESET_FIXTURES=1 bash scripts/native-smoke.sh`는 이름이 teum-api36인 에뮬레이터에서만 합성 학습 DB를 초기화하고 실행합니다. 다른 기기나 실제 학습 데이터에 실행하지 않습니다. 개발용 첫 안내와 스크롤 제스처 안정화를 테스트에서 처리합니다.

큰 글씨·가로 탭은 API36 에뮬레이터에서 FIX.C1 이후 재확인했다. 실기기 제스처·실제 계정 흐름은 미검증이다.

## 2026-10-16 — M7.C2 APK

- 종류: Android debug / Development Build, Metro 서버 필요
- ABI: arm64-v8a
- 파일: `artifacts/teum-knowledge-0.1.0-dev-arm64.apk` (Git 제외)
- 크기: 92447876 bytes
- SHA-256: `569735d2256854b4d52d7baf22d741df4da10795ab29ccfc899d25f0140bf2d9`
- 소스 checkpoint: M7.C2. 실제 커밋 SHA와 push 결과는 로컬 상태에 기록
- Expo 57.0.30 / Expo Router 57.0.28로 권장 패치 정렬 후 Gradle debug build와 Expo Doctor21/21 통과

## 2026-10-16 — FIX.C1 최신 상태

Jest26개·Kotlin17개·typecheck/lint·콘텐츠 구조·Doctor21/21·Android debug build 통과. API36의 360/412dp×100/200% 및 가로100% 탭 확인을 마쳤다. 최신 APK 크기·checksum·화면과 검수7건 대응은 REVIEW_FIXES에 기록했다. 위 M7.C2 APK 정보는 이전 산출물 기록이다. 실제 OAuth/AI·실기기 알림·보안/출처 대조 미완료 상태는 유지한다.
