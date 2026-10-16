package com.teumknowledge.siwc

/** Static only: never interpolate callback parameters, account data, or credentials. */
object CallbackPage {
 const val csp = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
 fun html(valid: Boolean, denied: Boolean = false): String {
   val title = when {
     !valid -> "연결을 다시 시작해 주세요"
     denied -> "앱으로 돌아갈까요?"
     else -> "이제 틈지식으로<br>돌아오세요."
   }
   val message = when {
     !valid -> "이 연결 요청을 확인할 수 없어요. 앱 설정에서 ChatGPT 연결을 다시 시작해 주세요."
     denied -> "브라우저에서 연결을 마치지 않았어요. 앱에서 다시 연결하거나 학습을 계속할 수 있어요."
     else -> "인증 결과를 받았어요.<br>앱에서 최종 연결 상태를 확인할게요."
   }
   return """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
<title>틈지식 · ChatGPT 연결</title>
<style>
*{box-sizing:border-box}html{background:#E8F0EA;color:#121513;font-family:system-ui,sans-serif}
body{margin:0}main{max-width:480px;min-height:100svh;margin:auto;padding:32px 28px max(28px,env(safe-area-inset-bottom));display:flex;flex-direction:column}
header{font-size:18px;font-weight:700;letter-spacing:-.02em;padding-top:env(safe-area-inset-top)}
.message{flex:1;display:flex;flex-direction:column;justify-content:center;padding:64px 0 48px}
.mark{width:52px;height:40px;background:#121513;clip-path:polygon(0 14%,100% 0,100% 86%,0 100%);margin-bottom:32px}
h1{font-family:serif;font-size:clamp(28px,8vw,36px);line-height:1.4;letter-spacing:-.03em;margin:0 0 24px;word-break:keep-all;overflow-wrap:anywhere}
p{font-size:17px;line-height:1.7;color:#4B5F55;margin:0;word-break:keep-all;overflow-wrap:anywhere}
a{display:flex;align-items:center;justify-content:center;min-height:64px;padding:18px 20px;background:#121513;color:#E8F0EA;border-radius:4px;text-decoration:none;font-size:18px;font-weight:600;text-align:center}
a:active{background:#3F5A4C}a:focus-visible{outline:3px solid #3F5A4C;outline-offset:5px}
footer p{font-size:14px;text-align:center;margin:16px 0 0}::selection{background:#121513;color:#E8F0EA}
@media(max-height:500px){.message{padding:32px 0}.mark{display:none}}
</style></head><body><main><header>틈지식</header><section class="message">
<div class="mark" aria-hidden="true"></div><h1>$title</h1><p>$message</p></section>
<footer><a href="teumknowledge://auth/return">틈지식으로 돌아가기</a>
<p>열리지 않으면 최근 앱에서 틈지식을 선택해 주세요.</p></footer></main></body></html>"""
 }
}
