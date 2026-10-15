# 틈지식

정보처리기사 공부를 시작하기 전, 기초 개념을 짧게 익히고 반복하는 Android 학습 앱입니다. React Native + Expo Development Build로 개발한 로컬 우선 MVP입니다.

## 구현 기능

- 하루 1·3·5개 목표, 오늘·복습·기록·설정 화면
- 6개 영역의 개념 60개와 객관식·OX 120문항. 콘텐츠는 **AI 작성 초안**이며 개별 출처 대조·전문가 검수 완료를 의미하지 않습니다.
- SQLite 학습 기록, 중복 채점 방지, 정답·오답에 따른 복습 일정
- 사용자 선택에 따른 로컬 알림, 7일 예약 조정과 학습 화면 연결
- SIWC Kotlin 인증·토큰 보호·스트리밍 구현, 학습 이력을 활용한 설명 요청과 완료 응답 캐시
- 계정 등록별 학습 기록·캐시 분리, 기록 초기화와 로컬 데이터 삭제

실제 ChatGPT 계정의 OAuth 로그인과 AI 응답은 아직 미검증입니다. 기본 학습에는 ChatGPT 구독이나 AI 연결이 필요하지 않습니다. 전체 시험 범위를 다루는 앱은 아닙니다.

## 실행

Node 24 LTS, JDK 17, Android SDK 36을 준비합니다.

```sh
npm ci
npm run check
npx expo prebuild --platform android
npm run android
```

인증용 로컬 Kotlin 모듈이 있으므로 **Expo Go에서 SIWC를 검증할 수 없습니다.** 개발용 APK에는 Metro 서버가 필요합니다. 빌드 프로필과 도구 설정은 [BUILD](docs/BUILD.md)를 확인하세요.

## AI와 자동화

Long-term Memory는 기기에 보관한 개념별 학습 이력·오답·복습 단계를 실제 AI 입력에 요약해 활용합니다. ChatGPT의 기존 대화나 메모리를 읽는 기능은 없습니다. 인증 토큰은 JS·SQLite로 전달하지 않고 Android Keystore로 보호합니다.

자동화는 `채점 트랜잭션 → outbox → 복습 우선순위 → OS 알림 예약 조정`으로 이어집니다. 백그라운드에서 AI를 계속 실행하지 않습니다. 알림은 기본 off이며 절전·강제 중지 등으로 지연·중단될 수 있습니다.

## 검증과 진행 기록

- [검증 결과와 미검증 항목](docs/VERIFICATION.md)
- [SIWC 구현·검증 상태](docs/SIWC_STATUS.md)
- [구현 아키텍처](docs/ARCHITECTURE.md)
- [개발 기록](docs/WORK_LOG.md)
- [콘텐츠 참고 자료 상태](docs/CONTENT_SOURCES.md)

실사용자 5명 테스트·피드백과 외부 배포 증빙은 추후 과제 조건으로 남겨 두었습니다. 자동 검증을 실제 사용자 테스트로 집계하지 않습니다. 의존성 보안 검사에 남은 항목도 검증 문서에 기록합니다.
