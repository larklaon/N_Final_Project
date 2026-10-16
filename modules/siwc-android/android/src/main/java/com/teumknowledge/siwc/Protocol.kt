package com.teumknowledge.siwc

import okhttp3.HttpUrl.Companion.toHttpUrl
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import org.json.JSONObject

object Protocol {
 const val ISSUER = "https://auth.openai.com"
 const val AUTHORIZE = "$ISSUER/api/accounts/authorize"
 const val TOKEN = "$ISSUER/api/accounts/oauth/token"
 const val JWKS = "$ISSUER/.well-known/jwks.json"
 const val DISCOVERY = "$ISSUER/.well-known/openid-configuration"
 const val RESOURCE = "https://api.openai.com/v1"
 const val SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
 fun authorizationUrl(client: String?, host: String, redirect: String, state: String, nonce: String, verifier: String, idTokenHint: String?, requestPlanConsent: Boolean): String {
   val url=AUTHORIZE.toHttpUrl().newBuilder()
     .addQueryParameter("client_id",client ?: "dynamic_agent_client")
     .addQueryParameter("ext_agent_host_id",host).addQueryParameter("response_type","code")
     .addQueryParameter("redirect_uri",redirect).addQueryParameter("scope",SCOPES)
     .addQueryParameter("resource",RESOURCE).addQueryParameter("state",state)
     .addQueryParameter("nonce",nonce).addQueryParameter("code_challenge_method","S256")
     .addQueryParameter("code_challenge",challenge(verifier))
   if(client==null) url.addQueryParameter("agent_name_hint","틈지식")
   idTokenHint?.takeIf { it.isNotBlank() }?.let { url.addQueryParameter("id_token_hint",it) }
   if(requestPlanConsent) url.addQueryParameter("prompt","consent")
   return url.build().toString()
 }
 fun random(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
 fun challenge(verifier: String): String = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))
 fun same(a: String, b: String): Boolean = MessageDigest.isEqual(a.toByteArray(Charsets.UTF_8), b.toByteArray(Charsets.UTF_8))
 fun callbackClient(expected: String?, returned: String?): String {
   if (expected != null) { require(returned.isNullOrBlank() || returned == expected) { "client_mismatch" }; return expected }
   require(!returned.isNullOrBlank() && returned != "dynamic_agent_client" && returned.length <= 256) { "missing_client" }
   return returned
 }
}

/** Only a completed terminal event can commit output. EOF, [DONE] and partial text are not success. */
class ResponseAccumulator(private val onUsage: (JSONObject?) -> Unit = {}, private val emit: (String, String) -> Unit) {
 private val output = StringBuilder()
 var terminal = false; private set
 fun frame(data: String) {
   if (terminal || data == "[DONE]") return
   val json = JSONObject(data)
   when (json.optString("type")) {
     "response.output_text.delta" -> {
       val text = json.optString("delta")
       require(output.length + text.length <= 8000) { "output_limit" }
       output.append(text); emit("delta", text)
     }
     "response.completed" -> {
       require(output.isNotBlank()) { "empty_response" }
       terminal = true; onUsage(json.optJSONObject("response")?.optJSONObject("usage")); emit("completed", output.toString())
     }
     "response.failed", "response.incomplete", "error" -> {
       terminal = true
       val code = json.optJSONObject("response")?.optJSONObject("error")?.optString("code")
         ?: json.optJSONObject("error")?.optString("code") ?: "incomplete_response"
       emit("failed", code)
     }
   }
 }
 fun end() { require(terminal) { "incomplete_stream" } }
}
