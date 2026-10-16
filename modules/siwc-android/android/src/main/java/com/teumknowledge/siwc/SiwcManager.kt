package com.teumknowledge.siwc

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class SiwcManager private constructor(private val context: Context) {
 companion object {
   @Volatile private var instance: SiwcManager?=null
   fun get(context: Context): SiwcManager = instance ?: synchronized(this) { instance ?: SiwcManager(context.applicationContext).also { instance=it } }
 }
 private val registry=SessionRegistry(Vault(context))
 private val io=Executors.newCachedThreadPool()
 private val http=OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).callTimeout(25,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
 @Volatile var emit: ((Map<String,Any>)->Unit)?=null
 @Volatile private var authMessage: String?=null
 private data class Attempt(val id: String, val profile: String?, val state: String, val nonce: String, val verifier: String, val loop: Loopback, val requestPlanConsent: Boolean)
 private val attempt=AttemptSlot<Attempt>(registry.lock)
 private val resources=ResourceAccess(registry,http,{ fields,_ -> OAuthTokenClient(http).request(fields) },{ attempt.current()==null },
   streamHttp=http.newBuilder().callTimeout(90,TimeUnit.SECONDS).build())
 @Volatile private var responseId: String?=null
 private fun profiles(r: JSONObject): JSONObject=r.optJSONObject("profiles") ?: JSONObject().also { r.put("profiles",it) }
 private fun credential(r: JSONObject, id: String): JSONObject=profiles(r).optJSONObject(id) ?: error("unknown_profile")
 private fun active(r: JSONObject): String?=r.optString("active").takeIf { it.isNotEmpty() }
 private fun host(): String {
   registry.read { it.optString("host").takeIf { h -> h.isNotEmpty() } }?.let { return it }
   registry.update(invalidating=false) { r -> if(!r.has("host")) r.put("host","urn:uuid:${UUID.randomUUID()}") }
   return registry.read { it.getString("host") }
 }
 fun state(): Map<String,Any> = synchronized(registry.lock) {
   try {
     val r=registry.read { it }; val id=active(r); val c=id?.let { profiles(r).optJSONObject(it) }
     val status=when {
       attempt.current()!=null -> "authorizing"
       c==null -> "disconnected"
       SessionTokens.requiresReconnect(c) -> "reconnectRequired"
       !c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct") -> "connectedWithoutPlan"
       else -> "ready"
     }
     // Resource issues stay advisory: the profile remains usable so an explicit retry can recover it.
     val message=authMessage ?: id?.let { registry.issue(it) }
     mutableMapOf<String,Any>("status" to status).apply { if(id!=null) put("profileId",id); message?.let { put("message",it) } }
   } catch (_: Exception) { mapOf("status" to "reconnectRequired", "message" to "보호된 인증 정보를 읽지 못했어요. 다시 연결해 주세요.") }
 }
 fun listProfiles(): List<Map<String,Any>> = registry.read { r ->
   val p=profiles(r); p.keys().asSequence().map { id -> val c=p.getJSONObject(id)
     mapOf("profileId" to id,"label" to c.optString("label","저장된 계정"),"connected" to c.has("access_token")) }.toList()
 }
 fun begin(profileId: String?, requestPlanConsent: Boolean = false): Map<String,Any> {
   if(attempt.current()!=null) return state()
   cancelResponse()
   if(profileId!=null) registry.read { credential(it,profileId) }
   host()
   val a=Attempt(UUID.randomUUID().toString(),profileId,Protocol.random(),Protocol.random(),Protocol.random(),Loopback(),requestPlanConsent)
   if(!attempt.start(a.id,a)) { a.loop.close();return state() }
   authMessage=null
   try { context.startForegroundService(Intent(context,AuthService::class.java)) }
   catch(e: Exception) { attempt.finish(a.id) { it.loop.close() };throw e }
   return state()
 }
 /** Runs at most once per attempt, even if the service receives repeated start commands. */
 fun performAuth() {
   val a=attempt.current()?.let { attempt.claim(it.id) } ?: return
   io.execute {
     try {
       val saved=registry.read { r -> a.profile?.let { JSONObject(credential(r,it).toString()) } }
       val retained=registry.read { it.optString("pending_client").takeIf { c -> c.isNotEmpty() } }
       val client=saved?.getString("client_id") ?: retained
       val url=Protocol.authorizationUrl(client,host(),a.loop.redirect,a.state,a.nonce,a.verifier,saved?.optString("id_token"),a.requestPlanConsent)
       require(attempt.isCurrent(a.id)) { "cancelled" }
       // This URI is never logged: it can contain a retained ID-token hint.
       context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
       val params=a.loop.await(a.state)
       require(params["error"]==null) { "access_denied" }
       val issued=Protocol.callbackClient(client,params["client_id"])
       registry.update(invalidating=false) { r ->
         require(attempt.isCurrent(a.id)) { "cancelled" }
         if(saved==null) r.put("pending_client",issued)
       }
       val code=params["code"]?.takeIf { it.isNotEmpty() } ?: error("missing_code")
       val token=OAuthTokenClient(http).request(mapOf("grant_type" to "authorization_code","client_id" to issued,"code" to code,"code_verifier" to a.verifier,"redirect_uri" to a.loop.redirect,"resource" to Protocol.RESOURCE))
       val keys=getJson(Protocol.JWKS).toString()
       val identity=Identity.validate(token.getString("id_token"),keys,issued,a.nonce,saved?.getString("subject"))
       require(token.optString("token_type").equals("Bearer",true) && token.optString("access_token").isNotBlank() && token.optLong("expires_in")>0) { "invalid_token_response" }
       registry.update { r ->
         require(attempt.isCurrent(a.id)) { "cancelled" }
         val p=profiles(r)
         val id=a.profile ?: p.keys().asSequence().firstOrNull { p.getJSONObject(it).let { c -> c.optString("issuer")==identity.issuer && c.optString("subject")==identity.subject && c.optString("client_id")==issued } } ?: UUID.randomUUID().toString()
         val c=JSONObject().put("issuer",identity.issuer).put("subject",identity.subject).put("client_id",issued)
           .put("label","ChatGPT · ${id.take(6)}")
         SessionTokens.save(c,token);p.put(id,c);r.put("active",id);r.remove("pending_client")
         authMessage=null
       }
     } catch(e: Exception) {
       if(attempt.isCurrent(a.id)) authMessage=if(e.message=="access_denied") "연결을 취소했어요." else "연결하지 못했어요. 다시 시도해 주세요."
     } finally {
       a.loop.close()
       if(attempt.finish(a.id) {}) context.stopService(Intent(context,AuthService::class.java))
     }
   }
 }
 fun cancelAuth() {
   val a=attempt.current()
   if(a!=null && attempt.finish(a.id) { it.loop.close() }) authMessage="연결을 취소했어요."
   context.stopService(Intent(context,AuthService::class.java))
 }
 private fun getJson(url: String): JSONObject =
   http.newCall(Request.Builder().url(url).build()).execute().use { res -> require(res.isSuccessful) { "http_${res.code}" };JSONObject(res.body?.string() ?: error("empty_body")) }
 fun select(id: String?): Map<String,Any> {
   cancelResponse();cancelAuth()
   registry.update { r -> if(id==null) r.remove("active") else { credential(r,id);r.put("active",id) } }
   return state()
 }
 /** Tokens are removed locally before any network call; revocation is best effort. */
 fun signOut(id: String): Map<String,Boolean> {
   cancelResponse();cancelAuth()
   val c=registry.clear(id)
   val revoked=try {
     val discovery=getJson(Protocol.DISCOVERY)
     require(discovery.getString("issuer")==Protocol.ISSUER && discovery.getString("revocation_endpoint")=="${Protocol.ISSUER}/api/accounts/oauth/revoke")
     if(c.has("refresh_token")) {
       val body=FormBody.Builder().add("token",c.getString("refresh_token")).add("token_type_hint","refresh_token").add("client_id",c.getString("client_id")).build()
       http.newCall(Request.Builder().url(discovery.getString("revocation_endpoint")).post(body).build()).execute().use { it.code==200 }
     } else true
   } catch(_: Exception) { false }
   return mapOf("revoked" to revoked)
 }
 fun models(id: String): List<Map<String,String>> = resources.models(id)
 @Synchronized fun startResponse(raw: String): Map<String,String> {
   responseId?.let { return mapOf("requestId" to it) }
   val q=JSONObject(raw);require(q.getString("instructions").length<=16000 && q.getJSONArray("input").toString().length<=24000)
   val id=UUID.randomUUID().toString();responseId=id
   io.execute {
     try {
       val body=JSONObject().put("model",q.getString("model")).put("instructions",q.getString("instructions"))
         .put("input",q.getJSONArray("input")).put("store",false).put("stream",true)
       resources.response(q.getString("profileId"),id,body.toString().toRequestBody("application/json".toMediaType()),{ responseId==id }) { res ->
         val acc=ResponseAccumulator { kind,text -> if(responseId==id) emit?.invoke(mapOf("requestId" to id,"type" to kind,(if(kind=="failed") "code" else "text") to text)) }
         val reader=res.body?.source() ?: error("empty_body");val data=StringBuilder()
         while(!reader.exhausted() && !acc.terminal) {
           val line=reader.readUtf8LineStrict(65536)
           if(line.isEmpty()) { if(data.isNotEmpty()) { acc.frame(data.toString().removeSuffix("\n"));data.setLength(0) } }
           else if(line.startsWith("data:")) { data.append(line.substring(5).removePrefix(" ")).append('\n');require(data.length<=131072) { "frame_limit" } }
         }
         acc.end()
       }
     } catch(e: Exception) {
       if(responseId==id) emit?.invoke(mapOf("requestId" to id,"type" to "failed","code" to (e.message?.takeIf { it.matches(Regex("[a-z0-9_]+")) } ?: "network_error")))
     } finally { synchronized(this) { if(responseId==id) responseId=null } }
   }
   return mapOf("requestId" to id)
 }
 @Synchronized fun cancelResponse(id: String?=null) {
   val current=responseId ?: return
   if(id!=null && current!=id) return
   responseId=null;registry.cancelCalls(current)
   emit?.invoke(mapOf("requestId" to current,"type" to "cancelled"))
 }
 fun eraseAll() { cancelResponse();cancelAuth();registry.erase();authMessage=null }
}
