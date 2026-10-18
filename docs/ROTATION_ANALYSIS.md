# V3 가로 회전·네이티브 크래시 원인 분석

- 분석일: 2026-10-18, 기준 앱 소스 `85966bf` (V3.FIX)
- 환경: Expo 57.0.30 / React Native 0.86.3 / **실제 설치 react-native-screens 4.26.2** / Reanimated 4.5.1, Android API36 arm64 에뮬레이터.
- 범위: 기존 크래시 바이너리 대조, 설치된 라이브러리 소스, 공식 이슈/수정, 데이터 보존 일반 실행 및 자동 검사 비교. 앱 동작 코드와 의존성은 변경하지 않았다.

## 결론

1. **네이티브 크래시의 가장 유력한 원인은 react-native-screens의 초기화 경쟁이다.** 실제 크래시 지점과 현재 설치 소스가 공식 수정 대상과 맞는다. 이번 실행에서 두 스레드의 경쟁 순간을 직접 계측하거나 패치 전후 비교까지 하지는 않았으므로 최종 인과 확정과 구분한다.
2. **가로 화면의 선택지 0개 검사 실패는 크래시와 별개다.** 이번 일반 실행에서는 앱 프로세스가 유지된 상태로 세로→가로가 전환됐으며 네 선택지 모두 스크롤로 도달했다. 자동 검사에서 0개로 실패한 순간에도 현재 V3 문제 화면이 살아 있는 것을 새 캡처로 확인했다.

## 크래시 지점: 확인한 사실

이전 크래시(00:22:43)는 `mqt_v_js`의 `SIGSEGV / SEGV_ACCERR`이며, 실행 불가능한 heap 주소를 함수처럼 실행하려고 했다. 다른 날짜의 DevLauncher/시스템 Bluetooth 오류는 이번 크래시 증거에서 제외했다.

- tombstone과 현재 APK에 포함된 `libreactnative.so`의 GNU BuildId가 모두 `e59970ac57f947b8fe2e1ffcdcc218fa16367ed2`다.
- 해당 바이너리를 직접 역어셈블했다. `MountingCoordinator::pullTransaction+524`, 주소 `0x11a5894`의 실제 명령은 `blr x8`(간접 함수 호출)이다.
- 바로 앞 두 명령은 객체의 vtable 포인터와 첫 함수 포인터를 읽는다. RN 소스에서는 `mountingOverrideDelegate->shouldOverridePullTransaction()`에 해당한다.
- 로그의 x8과 fault address는 태그를 제외하면 일치한다. null 참조나 JS 문법 오류가 아니라, 잘못된 네이티브 delegate/함수 포인터가 사용된 증거다.
- 현재 tombstone만으로 그 객체가 어느 라이브러리의 delegate였는지까지 식별할 수는 없다. 다른 메모리 손상 가능성을 완전히 배제하지 않는다.

## 현재 설치 소스와 공식 수정의 대조

`node_modules/react-native-screens/android/src/main/cpp/NativeProxy.cpp:35`는 `if (!screenRemovalListener_)` 다음에 mutex 없이 `shared_ptr`를 생성·대입한다. 같은 파일의 82행에서 그 멤버를 RN mounting coordinator에 넘긴다. 아래쪽 coordinator 목록에 대한 mutex는 이 초기화 영역을 보호하지 않는다.

`ScreensModule.kt:50–61`의 `initialize()`는 lifecycle listener를 등록한 뒤 `setupFabric()`을 호출하며, `onHostResume():141`도 `setupFabric()`을 호출한다. 초기화 스레드와 UI 스레드가 동시에 들어올 수 있는 형태다.

공식 [수정 PR #4413](https://github.com/software-mansion/react-native-screens/pull/4413)은 이 동시 초기화에서 객체 포인터와 참조 카운트 관리 객체가 서로 어긋나, 해제된 listener를 유효한 것으로 취급하는 문제를 설명한다. singleton의 안전한 초기화, 동기화된 callback과 소유권 토큰으로 수정했다. 설치된 4.26.2 소스에는 해당 변경이 없다.

공식 [동일 증상 이슈 #4654](https://github.com/software-mansion/react-native-screens/issues/4654)에는 Expo Dev Client의 반복 시작 중 같은 가상 함수 호출에서 heap으로 점프하는 사례가 있다. maintainer도 #4413을 안내한다. 이는 강한 보강 근거지만, 다른 프로젝트의 재현 횟수를 이 앱의 검증 횟수로 쓰지 않는다.

따라서 회전이 유일한 발생 조건이라고 볼 수 없다. 이번 자동 검사는 매번 cold start와 dev-client deep link 실행을 포함한다. 가로 회전 테스트 중 발견됐다는 사실만으로 회전 레이아웃을 크래시의 원인으로 단정하면 안 된다.

## 일반 실행과 자동 검사 비교

- AndroidTest 없이 기존 개발용 APK를 시작했다. `wm user-rotation lock 0/1`로 방향을 명시하고 XML의 rotation 0/1을 확인했다.
- 동일 PID 19864가 세로→가로 전환 및 스크롤 동안 유지됐다. 세로라고 이름 붙인 초기 파일은 실제로 가로였기 때문에 회전 증거에 쓰지 않고 `normal-portrait.xml`, `normal-landscape.xml`을 사용했다.
- 가로 화면에서 실제 vertical ScrollView bounds 안에 `adb input swipe`를 4회 수행했다. 누적해서 네 선택지 모두 48dp 이상의 노출 높이에 도달했고 확인 버튼도 화면 안에 있었다. 답을 제출하거나 학습 DB를 초기화하지 않았다.
- 기존 LayoutTest는 재실행에서도 0/4로 실패했다. 이때 새로 저장한 화면은 V3 문제 화면이며 크래시하지 않았다. 구버전 이미지 재사용 방지 절차를 거쳤다.
- 가로 화면 전체 접근성·장시간 안정성 통과를 의미하지 않는다.

## 선택지 0개 실패의 직접 원인 — 확정

진단 로그를 추가하니 첫 선택 대상은 세로 목록이 아니라 `android.widget.HorizontalScrollView`였고, bounds는 `Rect(439, 693 - 2098, 644)`로 화면 아래 잘린 영역이었다. `scrollMore=false` 직후 검사가 끝났다.

`By.scrollable(true)`가 코드 예제의 가로 스크롤도 허용했던 것이 원인이다. `scroll(Direction.DOWN)`으로 이 뷰를 움직이려다 실패하고 `break`하므로 본문의 선택지에 도달하지 못했다. 앱 데이터나 실제 문제 부족과는 무관한 검사 대상 선택 오류다.

검사 선택자를 `By.clazz("android.widget.ScrollView").scrollable(true)`로 제한하고 회전 후 대상 출현을 기다리도록 바꿨다. 클래스·bounds·스크롤 반환값 진단도 남겨 같은 실패를 구분할 수 있게 했다. 앱 UI나 라이브러리 바이너리는 이 변경에 포함하지 않았다.

**수정 후 같은 가로/100% LayoutTest가 50.251초에 `OK (1 test)`로 통과했다.** 네 선택지의 노출 높이와 기본 버튼·설정 노출 단언을 유지했다. 이전 선택자의 HorizontalScrollView/false와 변경 후 vertical ScrollView/true 로그를 따로 보존했다. 타입·린트·AndroidTest APK 빌드도 통과했다.

## 권장 수정 순서

1. Expo SDK57이 `react-native-screens ~4.26.0`을 지정하므로 무조건 최신 패키지로 올리기보다, **공식 #4413의 Android 수정만 재현 가능한 패치로 적용하는 방안**을 우선 검토한다. 설치 때마다 유지되도록 패치·버전·해시를 기록해야 한다. 단순히 가로 회전을 금지하는 것은 초기화 경쟁의 해결책이 아니다.
2. 빌드 후 반복 cold start에서 실제 React 화면 시작을 확인하고, 크래시 로그를 실행별로 분리한다. 패치 전후 비교 및 화면 push/pop·back·재시작도 포함한다. 드문 경쟁이므로 소수 회차에서 0건이라고 결함 부재를 증명했다고 표현하지 않는다.
3. 이번에 바로잡은 세로 스크롤 선택자를 유지한다. 기존 0개 실패를 크래시 재현 횟수로 세지 않는다.

## 증거와 미검증

로컬 ignored `artifacts/rotation-analysis/`: BuildId, 역어셈블, 일반 실행 XML/캡처, 선택지 도달 결과, 자동 검사 로그/캡처. 크래시 원본은 `artifacts/v3-review-fixes/layout-confirm/crash.log`에 있다. 계정·토큰·사용자 학습 데이터는 보고서에 포함하지 않는다.

이번에는 공식 패치 적용, 경쟁 순간 직접 계측, 장시간 반복 시작, release APK/물리 기기 확인을 하지 않았다. 분석 결과와 수정 완료를 구분한다.

## 수정 적용 (2026-10-18, V3.NATIVE_FIX)

위의 미적용 표시는 V3.RCA 당시 상태다. 이후 공식 PR #4413의 네 파일 전체를 설치된 screens 4.26.2에 backport했다. 변경은 `cpp/legacy/` 경로를 4.26.2의 `cpp/`로 맞춘 것뿐이다. singleton 초기화, callback 동기화, JNI 참조의 값 캡처, 소유권 토큰 및 invalidate 직렬화를 포함한다.

- `patches/`에 패치와 버전·수정 전후 SHA-256 manifest를 보관한다. postinstall에서 자동 적용하며 재실행은 무변경, 다른 버전/수정된 원본/부분 적용은 명시적으로 실패한다. Expo57의 라이브러리 버전 관계는 유지했다.
- 별도 fixture 검사 3개: 원본 적용 및 재적용, 버전 불일치 거절, 원본 변형 거절. 이 검사는 설치 재현성을 검증하며 native 경쟁 재현 검사는 아니다.
- Android debug/AndroidTest APK 빌드 및 데이터 유지 설치 통과. APK에서 직접 추출한 `librnscreens.so`에 `setListener`/`clearListener` 심볼이 포함된 것도 확인했다.
- 실제 React 문제 화면까지 진입하는 cold start **20/20** 통과, 앱 crash **0건**. 5·10·15·20회차에는 설정/퍼즐 화면 push·back과 세로→가로→세로 회전 후 같은 PID 유지도 확인했다.
- 반복 검사 스크립트는 `scripts/native-startup-check.py`, 실행별 XML·crash 로그와 JSON은 로컬 ignored `artifacts/screens-fix/startup/`에 있다. 학습 답 제출·데이터 초기화·새 로그인은 하지 않았다.

네이티브 수정 구현과 제한된 반복 검증을 완료했다. 희귀 경쟁 순간 직접 계측, 동일 조건의 무패치 대조군, 장시간 실행, release 및 물리 기기는 이번에 검증하지 않았다. 기존 크래시가 모든 상황에서 재발하지 않는다는 보증과 구분한다.

가로 레이아웃 회귀 검사는 최초 빠른 스크롤에서 2/4로 실패했다. 같은 세로 ScrollView에서 중간 선택지를 지나치는 문제라 검사 속도를 90dp/s·거리 35%로 바꾸고 최대 관찰 횟수를 늘렸다. 앱 코드는 바꾸지 않았으며 기존 4개/48dp/버튼 단언을 유지해 **31.421초 OK(1 test)**를 확인했다. 실패와 수정 후 캡처를 각각 보존했다.
