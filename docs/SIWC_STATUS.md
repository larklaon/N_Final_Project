# SIWC 검증 상태

| 항목 | 상태 |
| --- | --- |
| 공식 공개 연동 계약 | 문서 확인 (2026-10-15) |
| Kotlin 구현 | Android debug 컴파일 통과 |
| 프로토콜 fixture 검증 | Kotlin/JUnit 34개 통과 (기존30개 + 서비스 경쟁1개·오류 진단2개·오래된 커밋1개) |
| Android 네이티브 실행 | API36 APK 설치·앱 시작 확인. 인증 서비스 실동작은 미검증 |
| 실제 OAuth 로그인 | 미검증 |
| 실제 response.completed | 미검증 |

토큰은 네이티브 계층 안에서 관리하며 실제 연결 성공을 모의 응답으로 대체하지 않습니다. 사용 가능한 계정이 필요한 확인은 추후 기록합니다.

## 구현 경계

인증 HTTP·토큰 교환·ID 토큰 검증·토큰 저장·refresh·모델 목록·Responses SSE는 Kotlin에 있습니다. JS에는 opaque profile ID와 연결 상태·인증 결과, 모델·응답 텍스트 및 허용 형식의 비민감 오류 진단만 전달합니다. 토큰은 Android Keystore AES-GCM로 보호한 AtomicFile 안에 저장하며 자동 백업을 끕니다.

공식 문서: [등록·로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [세션](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [추론](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

실제 계정 승인·토큰 회전·브라우저 전환 중 서비스 유지·실제 응답은 fixture 성공과 별개입니다. 해당 항목을 자동 검증으로 완료했다고 표시하지 않습니다.

FIX.C1에서 terminal refresh 오류의 credential 폐기/재연결과 명시적 플랜 권한 재동의 경로를 추가했다. 테스트된 URL/fixture 계약과 실제 계정 성공은 구분한다. 상세 내용은 [REVIEW_FIXES](REVIEW_FIXES.md)를 따른다.

FIX.C3에서 네트워크를 Expo 기본 큐에서도 분리하고, 인증 서비스의 시도 ID·timeout·정리 경쟁을 수정했다. HTTP 실패의 status/code/parameter/request ID는 원문 응답·토큰 없이 전달한다. 상세 근거와 실제 계정 미검증 경계는 [재검수·수정 기록](REVIEW_C2_AND_FIXES.md)에 있다.

## SIWC.U1 — 사용량과 복귀 화면 (2026-10-16)

공식 [UI/UX 지침](https://developers.openai.com/siwc/ui-ux-guidelines)에 따라 플랜 사용 표시와 ChatGPT 사용량 관리 링크를 둔다. 앱의 `AI 사용량`은 **이 기기에서 이 기능 추가 이후 관측한 완료 응답**의 최근 30일 기록이다. 구독 잔여 한도가 아니며, 미완료 요청에서 소비된 사용량이나 다른 기기/앱 사용량은 포함하지 않는다. `response.completed.response.usage`에 입력·출력 토큰이 있을 때만 합산한다. 수치는 계정별 네이티브 no-backup 파일에 저장하고 전체 데이터 삭제 때 제거한다. 본문/질문/이메일/토큰은 사용 기록에 넣지 않는다.

API36에서 기존 연결의 ready 표시, 모바일 브라우저 정적 미리보기의 앱 복귀 버튼, 사용량 화면을 확인했다. 새 실제 인증·추론 성공을 수행했다는 의미는 아니다. 해당 변경의 SIWC Kotlin 38개/Jest74개 및 APK 빌드 결과는 WORK_LOG에 기록했다.
