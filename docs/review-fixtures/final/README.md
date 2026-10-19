# V4 마무리 검수 재현

기준 커밋: `ea1b25771325e3e299b15b14c9bcbf84415fa549`. 수정 전 결함을 재현하는 자료다. 이 커밋에서는 Jest 3개와 Kotlin 1개가 기대 동작 단언에서 실패했다. [검수 보고서](../../FINAL_AUDIT.md)의 FINAL-R1–R4에 대응한다.

후속 FINAL.FIX에서 수정했다. 현재 정상 회귀 검사는 `src/services/ai/__tests__/FinalBoundaryFixes.test.tsx`와 `modules/siwc-android/android/src/test/java/com/teumknowledge/siwc/FinalTerminalAuditTest.kt`다. [수정 기록](../../FINAL_FIXES.md)을 따른다. 아래 복사 명령은 **수정 전 커밋의 별도 체크아웃**에서 재현할 때만 사용하고 현재 정상 테스트를 덮어쓰지 않는다.

기본 테스트에 실패 fixture를 섞지 않도록 `.fixture`로 보관한다. 아래 명령은 저장소 루트 기준이다. 같은 이름의 파일이 이미 있으면 덮어쓰지 말고 확인한다.

## Jest 3개

```sh
cp -n docs/review-fixtures/final/FinalBoundaryAudit.test.tsx.fixture src/services/ai/__tests__/FinalBoundaryAudit.test.tsx
npx jest --runInBand --runTestsByPath src/services/ai/__tests__/FinalBoundaryAudit.test.tsx
rm src/services/ai/__tests__/FinalBoundaryAudit.test.tsx
```

- FINAL-R1: 전송 동의 철회 뒤 대기 계획 dispatch 1회.
- FINAL-R2: 대화 삭제 뒤 assistant 메시지 1개 재생성.
- FINAL-R3: ID 반환 전 중지 뒤 취소 0회·assistant 1개 저장.

실제 repository·in-memory SQLite·AI 화면과 계획 함수를 쓰며 SIWC만 모의 구현한다. 기기 DB나 외부 계정을 사용하지 않는다.

## Kotlin 1개

```sh
cp -n docs/review-fixtures/final/FinalTerminalAuditTest.kt.fixture modules/siwc-android/android/src/test/java/com/teumknowledge/siwc/FinalTerminalAuditTest.kt
cd android
./gradlew :siwc-android:testDebugUnitTest --tests 'com.teumknowledge.siwc.FinalTerminalAuditTest'
cd ..
rm modules/siwc-android/android/src/test/java/com/teumknowledge/siwc/FinalTerminalAuditTest.kt
```

BUILD의 JDK17·Android SDK 환경이 필요하다. 실제 `SiwcManager`·`ResourceAccess`와 로컬 MockWebServer를 사용한다. completed 이벤트에서 다음 요청을 시작하면 `response_busy`가 반환된다. fixture 자격증명만 메모리에 두고 외부 인증 서버에는 접속하지 않는다.

실행 뒤 임시 `.test.tsx`·`.kt`가 제거됐는지 확인하고, 수정 검증은 해당 fixture를 정상 테스트로 옮긴 뒤 `npm run check`와 기본 Kotlin 검사로 마무리한다.
