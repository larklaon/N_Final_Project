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

JDK 17의 JAVA_HOME과 SDK 위치의 ANDROID_HOME을 지정한다. Android SDK 라이선스 동의가 필요하다. 새 모듈·plugin 변경은 prebuild로 재생성한다. 생성된 android 폴더는 Git에서 제외한다. Expo Go에는 SIWC 모듈이 없으므로 Development Build를 사용한다.

## APK

```sh
cd android
./gradlew :siwc-android:testDebugUnitTest :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

Debug APK는 개발용이며 Metro 연결이 필요하다. 설치 대상 ABI를 확인한다. 배포용 서명 APK는 `npx eas-cli@latest build --platform android --profile preview`로 만들 수 있도록 설정했다. EAS 계정·프로젝트·서명은 아직 연결하지 않았다. production 프로필은 추후 AAB용이다.

로컬 release variant가 debug key로 서명되면 외부 배포용 서명 완료로 표시하지 않는다. 키·비밀번호·APK는 Git에 넣지 않는다. 실제 빌드 결과는 VERIFICATION에 기록한다.

## 재현 제한

네이티브 첫 빌드에서 공식 React Native Maven AAR 다운로드가 매우 느렸다. 공식 CDN을 범위별로 받은 뒤 게시된 SHA-1과 일치함을 확인해 Gradle artifact cache에 보관했다. 저장소의 앱 소스나 의존성 버전을 바꾸는 우회는 하지 않았다. 네트워크 상황에 따라 첫 빌드가 오래 걸릴 수 있다.
