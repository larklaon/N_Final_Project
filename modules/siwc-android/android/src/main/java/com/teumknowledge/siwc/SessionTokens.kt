package com.teumknowledge.siwc

import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.IOException

class OAuthTokenError(val code: String, val status: Int) : IOException("oauth_http_$status")
class OAuthTokenClient(private val http: OkHttpClient, private val endpoint: String = Protocol.TOKEN) {
 fun request(fields: Map<String,String>): JSONObject {
   val body=FormBody.Builder().apply { fields.forEach { (k,v)->add(k,v) } }.build()
   return http.newCall(Request.Builder().url(endpoint).post(body).build()).execute().use { res ->
     val raw=res.body?.string() ?: ""
     if(!res.isSuccessful) {
       val code=runCatching { val error=JSONObject(raw).opt("error"); if(error is JSONObject) error.optString("code") else error as? String ?: "" }.getOrDefault("")
       throw OAuthTokenError(code,res.code)
     }
     JSONObject(raw)
   }
 }
}

/** Operates on an isolated copy; persist performs the guarded atomic commit. Never expose this record to JS. */
object SessionTokens {
 private val terminalRefreshCodes=setOf("invalid_grant","invalid_token","invalid_refresh_token","token_expired","refresh_token_expired","refresh_token_invalidated","refresh_token_reused")
 fun clear(c: JSONObject) { listOf("access_token","refresh_token","id_token","expires_at").forEach { c.remove(it) } }
 fun save(c: JSONObject, t: JSONObject, now: Long=System.currentTimeMillis()) {
   c.put("access_token",t.getString("access_token"))
   if(t.has("refresh_token")) c.put("refresh_token",t.getString("refresh_token"))
   if(t.has("id_token")) c.put("id_token",t.getString("id_token"))
   if(t.has("scope")) c.put("scope",t.getString("scope"))
   c.put("expires_at",now+t.getLong("expires_in")*1000)
 }
 fun requiresReconnect(c: JSONObject, now: Long=System.currentTimeMillis()): Boolean =
   c.optString("access_token").isBlank() || (c.optLong("expires_at")<now+60_000 && c.optString("refresh_token").isBlank())
 fun access(c: JSONObject, request: (Map<String,String>)->JSONObject, persist: ()->Unit, now: Long=System.currentTimeMillis()): String {
   if(requiresReconnect(c,now)) { clear(c);persist();error("reconnect_required") }
   require(c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct")) { "plan_permission_missing" }
   if(c.optLong("expires_at")<now+60_000) {
     val token=try {
       request(mapOf("grant_type" to "refresh_token","client_id" to c.getString("client_id"),"refresh_token" to c.getString("refresh_token"),"resource" to Protocol.RESOURCE))
     } catch(e: OAuthTokenError) {
       if(e.code in terminalRefreshCodes) { clear(c);persist();error("reconnect_required") }
       throw e
     }
     require(token.optString("access_token").isNotBlank() && token.optLong("expires_in")>0 && (!token.has("token_type") || token.optString("token_type").equals("Bearer",true))) { "invalid_token_response" }
     // Build the full replacement before changing the live record.
     val replacement=JSONObject(c.toString());save(replacement,token,now)
     replacement.keys().forEach { c.put(it,replacement.get(it)) };persist()
   }
   require(c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct")) { "plan_permission_missing" }
   return c.getString("access_token")
 }
}
