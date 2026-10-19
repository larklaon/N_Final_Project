# Android 실행과 빌드

## 도구

- Node 24 LTS, npm, JDK 17
- Expo 57.0.30 / Expo Router 57.0.28 / React Native 0.86.3 / React 19.2.3
- Android SDK Platform 36, Build-tools, NDK 27.1.12297006 (Gradle이 필요한 버전 설치)
- Reanimated 4.5.1 / Worklets 0.10.1: Expo bundledNativeModules에 맞춤
- OkHttp 4.12.0, Nimbus JOSE JWT 10.9

## 실행

```sh
npm ci
npm run check
npx expo prebuild --platform android
npm run android
```

`npm ci`는 postinstall에서 screens 4.26.2의 공식 Android listener 패치를 적용한다. Git이 필요하며, 설치 스크립트를 끈 환경에서는 빌드 전에 `npm run postinstall`을 실행한다. 버전·소스 해시가 다르면 설치를 실패시킨다. 의존성 변경 시 [패치 관리](../patches/README.md)를 확인한다. 네이티브 변경이므로 Metro 재시작만으로 반영되지 않는다.

JDK 17의 JAVA_HOME과 SDK 위치의 ANDROID_HOME을 지정한다. Android SDK 라이선스 동의가 필요하다. 새 모듈·plugin 변경은 prebuild로 재생성한다. 생성된 android 폴더는 Git에서 제외한다. Expo Go에는 SIWC 모듈이 없으므로 Development Build를 사용한다.

## APK

```sh
cd android
./gradlew :siwc-android:testDebugUnitTest :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

Debug APK는 개발용이며 Metro 연결이 필요하다. 설치 대상 ABI를 확인한다. 과제 시연에는 아래 로컬 release APK를 사용한다. 별도의 EAS 배포 키 설정은 이번 작업에 필요하지 않다. EAS preview·production 프로필은 향후 별도 배포를 선택할 때 사용할 수 있다.

### 시연용 APK

Metro 없이 폰 하나로 실행되는 release APK에 시연 규칙을 켠다. 시연 규칙은 V4 맞춤 학습의 하루 한도와 하루 단위 대기(확인 문제는 카드 응답 1분 뒤·같은 날짜 허용, 확인 슬롯 1분마다, 자리가 없는 AI 카드는 덱 앞쪽)를 줄인 것이며, 기본 학습 규칙(채점·해상도·복습 일정)은 바꾸지 않는다.

```sh
cd android
EXPO_PUBLIC_TEUM_DEMO=1 NODE_ENV=production ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

결과: `android/app/build/outputs/apk/release/app-release.apk`. `EXPO_PUBLIC_TEUM_DEMO` 없이 빌드하면 원래 규칙(카드 응답 24시간 뒤·다른 날짜, 하루 한도)의 release APK가 된다. 값은 JS 번들에 빌드할 때 들어가므로 바꾸면 다시 빌드한다. 개발 빌드는 항상 시연 규칙이고, Jest는 항상 원래 규칙으로 검사한다.

현재 로컬 release APK는 기본 debug key로 서명된다. 따라서 같은 키로 설치된 시연 앱은 데이터 유지 업데이트가 가능하다. 키·비밀번호·APK는 Git에 넣지 않는다. 실제 빌드 결과는 VERIFICATION에 기록한다.

## 재현 제한

네이티브 첫 빌드에서 공식 React Native Maven AAR 다운로드가 매우 느렸다. 공식 CDN을 범위별로 받은 뒤 게시된 SHA-1과 일치함을 확인해 Gradle artifact cache에 보관했다. 저장소의 앱 소스나 의존성 버전을 바꾸는 우회는 하지 않았다. 네트워크 상황에 따라 첫 빌드가 오래 걸릴 수 있다.

## 데이터 보존 재실행 검사

온보딩된 `teum-api36` 에뮬레이터, 위 APK 설치, Metro8081 실행 후:

```sh
python3 scripts/native-startup-check.py --runs 20
```

`ANDROID_HOME`이 필요하다. 매번 앱을 force-stop 후 deep link로 열고 실제 문제 화면·동일 PID·크래시 로그를 확인한다. 5회마다 설정/퍼즐 push·back과 가로 회전 요청 후에도 세로가 유지되는지 확인한다. 정답 제출·계정 인증·DB 삭제는 하지 않고 종료 시 회전 설정을 복원한다. 로그는 ignored `artifacts/screens-fix/startup`에 남는다. 소수 회차 통과를 장시간·모든 기기의 안정성 보증으로 해석하지 않는다.

화면 방향은 [Expo orientation 설정](https://docs.expo.dev/versions/v57.0.0/config/app/#orientation)에 따라 app.json에서 portrait로 지정한다. 변경 후 prebuild와 APK 재빌드·재설치가 필요하다. `native-layout-check.py`의 마지막 rotation-lock 검사는 가로 방향을 요청한 상태에서 세로 화면과 보기/버튼 도달을 확인한다.
