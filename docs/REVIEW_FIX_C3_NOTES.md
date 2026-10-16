# FIX.C3 검토 메모

2026-10-16. 대상은 `70063da`(FIX.C3)다. 코드 검토와 기존 검사 재실행만 했고, 아래 위험은 아직 고치지 않았다.

## 재실행 결과

- `npm run check`: TypeScript·ESLint·Jest 40개·콘텐츠 60개/120문항 통과
- Kotlin/JUnit 34개 통과

## 위험 1 — 오래된 인증 intent가 startForeground 없이 서비스를 멈춤 (V2.C3에서 확인·수정)

- 위치: `modules/siwc-android/android/src/main/java/com/teumknowledge/siwc/AuthService.kt` `onStartCommand` 첫 분기
- 내용: `startForegroundService()`로 전달된 intent의 시도 ID가 현재 시도가 아니면, `startForeground()`를 부르지 않고 반환한다. 진행 중인 시도가 없으면 `stopSelf(startId)`까지 부른다.
- 영향: `startForegroundService()`로 시작한 서비스가 `startForeground()` 전에 멈추면 Android가 앱을 강제 종료한다("Context.startForegroundService() did not then call Service.startForeground()"). FIX.C3 이전에는 모든 시작 intent에서 `startForeground()`를 먼저 불렀으므로 이번 수정에서 새로 생긴 경로다.
- 재현 조건(추정): 연결 시작 직후 `onStartCommand`가 실행되기 전에 취소한다. A의 시작 intent가 늦게 도착하면 현재 시도도 없고 A도 현재가 아니므로 위 분기를 탄다. 연결 버튼 연타나 즉시 취소로 생길 수 있다.
- 근거: Android 포그라운드 서비스 동작과 공개 사례. 에뮬레이터 재현은 하지 않았다.
- 제안: 시작 intent(취소 action이 아닌 것)는 시도 ID와 관계없이 먼저 `startForeground()`를 부른다. 오래된 intent면 직후 `stopForeground(STOP_FOREGROUND_REMOVE)`와 `stopSelf(startId)`를 한다. 취소 action은 `startService`로만 오므로 그대로 둔다.
- 완료 기준: 시작 직후 취소, 연타, 오래된 intent 지연 도착에서 강제 종료 없음. 가능하면 instrumented test로 고정한다.

### V2.C3 확인과 수정

- 재현: instrumented test `native-tests/AuthServiceStaleStartTest.kt`가 이미 끝난 시도 ID로 `startForegroundService`를 보낸다. 수정 전 코드에서 `ForegroundServiceDidNotStartInTimeException`으로 프로세스가 종료되는 것을 API36 에뮬레이터에서 확인했다.
- 수정: 취소 action이 아닌 모든 전달에서 먼저 `startForeground`를 부른다. 알림은 현재 진행 중인 시도의 취소 버튼을 유지한다. 오래된 전달이고 진행 중인 시도가 없으면 `stopForeground(STOP_FOREGROUND_REMOVE)` 후 종료한다.
- 결과: 같은 테스트가 수정 후 통과했다(12초 대기, 인증 알림 남지 않음).

## 참고 — 경미

- 오래된 intent가 도착하면 `startId`가 늘어나 `stopSelf(activeStartId)`가 서비스를 멈추지 못할 수 있다. 다만 `cancelAuth`와 `performAuth` 정리에서 `context.stopService()`를 함께 부르므로 실제로 남는 경우는 확인하지 못했다. `onTimeout(startId)`도 `startId`가 다르면 무시하는데, 150초 자체 타임아웃이 먼저 정리하므로 영향은 낮다.

## 근거 자료

- [Pitfalls of a foreground Service lifecycle (ProAndroidDev)](https://proandroiddev.com/pitfalls-of-a-foreground-service-lifecycle-59f014c6a125)
- [VLC Android: Stop with stopService()](https://code.videolan.org/videolan/vlc-android/-/merge_requests/406)
- [포그라운드 서비스 문제 해결 (Android Developers)](https://developer.android.com/develop/background-work/services/fgs/troubleshooting)
