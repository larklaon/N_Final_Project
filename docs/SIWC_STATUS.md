# SIWC 검증 상태

| 항목 | 상태 |
| --- | --- |
| 공식 공개 연동 계약 | 문서 확인 (2026-10-15) |
| Kotlin 구현 | Android debug 컴파일 통과 |
| 프로토콜 fixture 검증 | Kotlin/JUnit 38개 통과 (FINAL.FIX; terminal 뒤 연속 요청·response 소유권 포함) |
| Android 네이티브 실행 | API36 개발 APK 실행 확인. 인증 서비스 수명/복귀의 이번 독립 재검증은 미실행 |
| 실제 OAuth 로그인 | V4.R1 개발 기록에 재연결 후 호출 성공이 있음. 신규 로그인·계정 추가·실기기는 이번 독립 검증에서 미실행 |
| 실제 response.completed | V3.END·V4.R1–Q2 개발 기록에 실제 계정 응답 확인. 이번 V4.FIX는 fixture로 검증했으며 재호출하지 않음 |

토큰은 네이티브 계층 안에서 관리하며 실제 연결 성공을 모의 응답으로 대체하지 않습니다. 위 표는 후속 WORK_LOG/VERIFICATION의 실제 계정 기록과 이번 자동 검증을 구분한 것입니다.

2026-10-19 마무리 검수에서 재현한 native terminal/busy 순서와 전송 동의·채팅 취소 경계 4건을 FINAL.FIX에서 수정했습니다. 완료·SSE 실패·HTTP 실패 이후 연속 요청까지 정상 회귀 검사로 확인했습니다. 상세는 [FINAL_FIXES](FINAL_FIXES.md), 수정 전 기록은 [FINAL_AUDIT](FINAL_AUDIT.md)를 따릅니다.

## 구현 경계

인증 HTTP·토큰 교환·ID 토큰 검증·토큰 저장·refresh·모델 목록·Responses SSE는 Kotlin에 있습니다. JS에는 opaque profile ID와 연결 상태·인증 결과, 모델·응답 텍스트 및 허용 형식의 비민감 오류 진단만 전달합니다. 토큰은 Android Keystore AES-GCM로 보호한 AtomicFile 안에 저장하며 자동 백업을 끕니다.

공식 문서: [등록·로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [세션](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [추론](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

실제 계정 승인·토큰 회전·브라우저 전환 중 서비스 유지·실제 응답은 fixture 성공과 별개입니다. 해당 항목을 자동 검증으로 완료했다고 표시하지 않습니다.

FIX.C1에서 terminal refresh 오류의 credential 폐기/재연결과 명시적 플랜 권한 재동의 경로를 추가했다. 테스트된 URL/fixture 계약과 실제 계정 성공은 구분한다. 상세 내용은 [REVIEW_FIXES](REVIEW_FIXES.md)를 따른다.

FIX.C3에서 네트워크를 Expo 기본 큐에서도 분리하고, 인증 서비스의 시도 ID·timeout·정리 경쟁을 수정했다. HTTP 실패의 status/code/parameter/request ID는 원문 응답·토큰 없이 전달한다. 상세 근거와 실제 계정 미검증 경계는 [재검수·수정 기록](REVIEW_C2_AND_FIXES.md)에 있다.

## SIWC.U1 — 사용량과 복귀 화면 (2026-10-16, 사용량 집계는 U2에서 제거)

공식 [UI/UX 지침](https://developers.openai.com/siwc/ui-ux-guidelines)에 따라 플랜 사용 표시와 ChatGPT 사용량 관리 링크를 둔다. 앱의 `AI 사용량`은 **이 기기에서 이 기능 추가 이후 관측한 완료 응답**의 최근 30일 기록이다. 구독 잔여 한도가 아니며, 미완료 요청에서 소비된 사용량이나 다른 기기/앱 사용량은 포함하지 않는다. `response.completed.response.usage`에 입력·출력 토큰이 있을 때만 합산한다. 수치는 계정별 네이티브 no-backup 파일에 저장하고 전체 데이터 삭제 때 제거한다. 본문/질문/이메일/토큰은 사용 기록에 넣지 않는다.

API36에서 기존 연결의 ready 표시, 모바일 브라우저 정적 미리보기의 앱 복귀 버튼, 사용량 화면을 확인했다. 새 실제 인증·추론 성공을 수행했다는 의미는 아니다. 해당 변경의 SIWC Kotlin 38개/Jest74개 및 APK 빌드 결과는 WORK_LOG에 기록했다.

## SIWC.U2 — 공식 구독 사용량 페이지 (2026-10-17)

사용자 요구는 로컬 토큰 수가 아닌 구독 사용량 확인이다. 설정·AI 채팅·연결 결과의 ‘구독 사용량’은 `expo-web-browser`로 `https://chatgpt.com/settings/usage`를 Android Custom Tab에 바로 연다. 앱과 같은 task에서 열고 닫으면 원래 화면으로 돌아온다. 브라우저 로그인 계정 기준이며, SIWC에서 선택한 계정과 다를 수 있다. 별도 로그인이 필요할 수도 있다. OAuth 자격증명을 URL·헤더·브라우저에 전달하지 않으며, 페이지 수치를 추출하거나 추정하지 않는다.

U1의 완료 횟수·토큰 집계 UI/API/기록 코드는 제거했다. 업데이트 후 네이티브 초기화 시 전용 `siwc-usage.json`과 AtomicFile 백업만 지운다. 학습 DB·대화·인증 정보는 유지한다. 기존 `/usage` 경로는 공식 페이지를 여는 안내로 남겨 이전 링크도 사용할 수 있다. 모바일 인증 콜백의 큰 복귀 버튼은 유지한다.

근거: [SIWC 사용량 안내](https://developers.openai.com/siwc/ui-ux-guidelines), [Expo SDK57 WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/).
