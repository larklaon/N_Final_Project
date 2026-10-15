# Android 빌드

- Expo 57.0.29, React Native 0.86.3, React 19.2.3
- Reanimated 4.5.1 / Worklets 0.10.1: Expo bundledNativeModules에 맞춰 고정
- JDK 17 / Android API 36 / build-tools 36.0.0
- `npm ci`, `npm run check`, `npx expo prebuild --platform android`, `npm run android`
- Java가 PATH에 없으면 설치한 JDK 17의 JAVA_HOME을 설정한다. SDK는 ANDROID_HOME으로 지정한다.

실제 네이티브 빌드와 APK 생성은 아직 확인 전이다. EAS preview는 internal APK 프로필이며 계정·서명 설정이 필요하다.
