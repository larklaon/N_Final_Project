# 개발 검증 결과

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
- 실제 계정으로 동시 AI 요청·새 OAuth, 물리 기기·다른 런처·TalkBack·콘텐츠 정확성·배포 서명은 이번에 검증하지 않았다.

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
| 외부 배포 서명·EAS | 미설정 |

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
| 외부 배포 서명·EAS | 미설정 |

## 검증 범위

Jest의 저장 테스트는 Node SQLite 실제 DB에 schema와 트랜잭션을 실행합니다. 앱 재시작과 동일한 repository reopen, 중복 제출, 실패 trigger 롤백, 프로필 분리와 v1→v2 마이그레이션을 검사합니다. Kotlin은 실제 RSA 서명을 생성해 신원을 검사하고 loopback 소켓에서 경로/state 거부와 포트 대체를 검증합니다. 외부 인증 서버를 fixture 테스트에서 호출하지 않습니다.

## 의존성

`npm audit`는 현재 64건(15 moderate,49 high)을 보고합니다. `npm audit fix`를 시도했으나 해결되지 않았고, 제안에 SDK58 전환이나 Expo44/RN0.72 등 호환되지 않는 변경이 포함되어 강제 적용하지 않았습니다. 많은 항목이 Expo/Metro/Jest 등의 전이 개발 도구에 연결되지만, 실제 도달 가능성과 대응 여부는 출시 전에 별도 검토해야 합니다. 통과한 타입·빌드 검사로 보안 검토를 대체하지 않습니다.

## 추후 메모

실사용자 5명·피드백, 실제 계정·기기 검증, 외부 배포 증빙과 발표는 별도 과제 조건입니다. 자동 테스트를 실제 사용자 테스트 인원으로 세지 않습니다.

## 화면 증거

API36 ARM64 Development Build의 합성 학습 기록입니다. 개발 도구 버튼이 보이는 개발용 화면이며 실사용자 테스트 결과가 아닙니다.

![오늘 화면](screenshots/today.png)
![정답 확인](screenshots/quiz-result.png)
![기록 화면](screenshots/history.png)

## UI smoke 재현

Metro를 8081에서 실행하고, BUILD 절차에 더해 `:app:assembleDebugAndroidTest`를 빌드하여 앱과 테스트 APK를 설치합니다. `TEUM_RESET_FIXTURES=1 bash scripts/native-smoke.sh`는 이름이 teum-api36인 에뮬레이터에서만 합성 학습 DB를 초기화하고 실행합니다. 개인 기기나 실사용자 데이터에 실행하지 않습니다. 개발용 첫 안내와 스크롤 제스처 안정화를 테스트에서 처리합니다.

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
