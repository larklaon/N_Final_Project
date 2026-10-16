# SIWC 검증 상태

| 항목 | 상태 |
| --- | --- |
| 공식 공개 연동 계약 | 문서 확인 (2026-10-15) |
| Kotlin 구현 | Android debug 컴파일 통과 |
| 프로토콜 fixture 검증 | Kotlin/JUnit 17개 통과 (기존 PKCE/client/JWT/SSE/loopback9개 + refresh/consent8개) |
| Android 네이티브 실행 | API36 APK 설치·앱 시작 확인. 인증 서비스 실동작은 미검증 |
| 실제 OAuth 로그인 | 미검증 |
| 실제 response.completed | 미검증 |

토큰은 네이티브 계층 안에서 관리하며 실제 연결 성공을 모의 응답으로 대체하지 않습니다. 사용 가능한 계정이 필요한 확인은 추후 기록합니다.

## 구현 경계

인증 HTTP·토큰 교환·ID 토큰 검증·토큰 저장·refresh·모델 목록·Responses SSE는 Kotlin에 있습니다. JS에는 opaque profile ID와 연결 상태, 모델·응답 텍스트만 전달합니다. 토큰은 Android Keystore AES-GCM로 보호한 AtomicFile 안에 저장하며 자동 백업을 끕니다.

공식 문서: [등록·로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [세션](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [추론](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

실제 계정 승인·토큰 회전·브라우저 전환 중 서비스 유지·실제 응답은 fixture 성공과 별개입니다. 해당 항목을 자동 검증으로 완료했다고 표시하지 않습니다.

FIX.C1에서 terminal refresh 오류의 credential 폐기/재연결과 명시적 플랜 권한 재동의 경로를 추가했다. 테스트된 URL/fixture 계약과 실제 계정 성공은 구분한다. 상세 내용은 [REVIEW_FIXES](REVIEW_FIXES.md)를 따른다.
