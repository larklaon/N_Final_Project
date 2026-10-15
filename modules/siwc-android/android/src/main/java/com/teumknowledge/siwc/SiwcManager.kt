package com.teumknowledge.siwc

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.Call
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class SiwcManager private constructor(private val context: Context) {
 companion object {
   @Volatile private var instance: SiwcManager?=null
   fun get(context: Context): SiwcManager = instance ?: synchronized(this) { instance ?: SiwcManager(context.applicationContext).also { instance=it } }
 }
 private val vault=Vault(context)
 private val lock=Any()
 private val io=Executors.newCachedThreadPool()
 private val http=OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).callTimeout(25,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
 @Volatile var emit: ((Map<String,Any>)->Unit)?=null
 @Volatile private var authStatus: String?=null
 @Volatile private var authMessage: String?=null
 private data class Attempt(val id: String, val profile: String?, val state: String, val nonce: String, val verifier: String, val loop: Loopback)
 @Volatile private var pending: Attempt?=null
 @Volatile private var responseCall: Call?=null
 @Volatile private var responseId: String?=null
 private fun record(): JSONObject=vault.load()
 private fun profiles(r: JSONObject): JSONObject=r.optJSONObject("profiles") ?: JSONObject().also { r.put("profiles",it) }
 private fun credential(r: JSONObject, id: String): JSONObject=profiles(r).optJSONObject(id) ?: error("unknown_profile")
 private fun active(r: JSONObject): String?=r.optString("active").takeIf { it.isNotEmpty() }
 private fun host(): String = synchronized(lock) {
   val r=record()
   if (!r.has("host")) { r.put("host","urn:uuid:${UUID.randomUUID()}"); vault.save(r) }
   r.getString("host")
 }
 fun state(): Map<String,Any> = synchronized(lock) {
   try {
     val r=record(); val id=active(r); val c=id?.let { profiles(r).optJSONObject(it) }
     val status=authStatus ?: when {
       c==null -> "disconnected"
       !c.has("access_token") -> "reconnectRequired"
       !c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct") -> "connectedWithoutPlan"
       else -> "ready"
     }
     mutableMapOf<String,Any>("status" to status).apply { if(id!=null) put("profileId",id); authMessage?.let { put("message",it) } }
   } catch (_: Exception) { mapOf("status" to "reconnectRequired", "message" to "보호된 인증 정보를 읽지 못했어요. 다시 연결해 주세요.") }
 }
 fun listProfiles(): List<Map<String,Any>> = synchronized(lock) {
   val p=profiles(record()); p.keys().asSequence().map { id -> val c=p.getJSONObject(id)
     mapOf("profileId" to id,"label" to c.optString("label","저장된 계정"),"connected" to c.has("access_token")) }.toList()
 }
 fun begin(profileId: String?): Map<String,Any> = synchronized(lock) {
   if(pending!=null) return state()
   cancelResponse()
   if(profileId!=null) credential(record(),profileId)
   host()
   val a=Attempt(UUID.randomUUID().toString(),profileId,Protocol.random(),Protocol.random(),Protocol.random(),Loopback())
   pending=a; authStatus="authorizing"; authMessage=null
   try { context.startForegroundService(Intent(context,AuthService::class.java)) }
   catch(e: Exception) { pending=null; a.loop.close(); authStatus=null; throw e }
   state()
 }
 fun performAuth() {
   val a=pending ?: return
   io.execute {
     try {
       val saved=synchronized(lock) { a.profile?.let { credential(record(),it) } }
       val retained=synchronized(lock) { record().optString("pending_client").takeIf { it.isNotEmpty() } }
       val client=saved?.getString("client_id") ?: retained
       val url=Protocol.AUTHORIZE.toHttpUrl().newBuilder()
         .addQueryParameter("client_id",client ?: "dynamic_agent_client")
         .addQueryParameter("ext_agent_host_id",host()).addQueryParameter("response_type","code")
         .addQueryParameter("redirect_uri",a.loop.redirect).addQueryParameter("scope",Protocol.SCOPES)
         .addQueryParameter("resource",Protocol.RESOURCE).addQueryParameter("state",a.state)
         .addQueryParameter("nonce",a.nonce).addQueryParameter("code_challenge_method","S256")
         .addQueryParameter("code_challenge",Protocol.challenge(a.verifier))
       if(client==null) url.addQueryParameter("agent_name_hint","틈지식")
       saved?.optString("id_token")?.takeIf { it.isNotBlank() }?.let { url.addQueryParameter("id_token_hint",it) }
       require(pending===a) { "cancelled" }
       // This URI is never logged: it can contain a retained ID-token hint.
       context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url.build().toString())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
       val params=a.loop.await(a.state)
       require(params["error"]==null) { "access_denied" }
       val issued=Protocol.callbackClient(client,params["client_id"])
       synchronized(lock) {
         require(pending===a) { "cancelled" }
         if(saved==null) { val r=record(); r.put("pending_client",issued);vault.save(r) }
       }
       val code=params["code"]?.takeIf { it.isNotEmpty() } ?: error("missing_code")
       val token=postForm(Protocol.TOKEN,mapOf("grant_type" to "authorization_code","client_id" to issued,"code" to code,"code_verifier" to a.verifier,"redirect_uri" to a.loop.redirect,"resource" to Protocol.RESOURCE))
       val keys=getJson(Protocol.JWKS).toString()
       val identity=Identity.validate(token.getString("id_token"),keys,issued,a.nonce,saved?.getString("subject"))
       require(token.optString("token_type").equals("Bearer",true) && token.optString("access_token").isNotBlank() && token.optLong("expires_in")>0) { "invalid_token_response" }
       synchronized(lock) {
         require(pending===a) { "cancelled" }
         val r=record(); val p=profiles(r)
         val id=a.profile ?: p.keys().asSequence().firstOrNull { p.getJSONObject(it).let { c -> c.optString("issuer")==identity.issuer && c.optString("subject")==identity.subject && c.optString("client_id")==issued } } ?: UUID.randomUUID().toString()
         val c=JSONObject().put("issuer",identity.issuer).put("subject",identity.subject).put("client_id",issued)
           .put("label","ChatGPT · ${id.take(6)}")
         saveToken(c,token);p.put(id,c);r.put("active",id);r.remove("pending_client");vault.save(r)
         authStatus=null;authMessage=null
       }
     } catch(e: Exception) {
       if(pending===a) { authStatus=null; authMessage=if(e.message=="access_denied") "연결을 취소했어요." else "연결하지 못했어요. 다시 시도해 주세요." }
     } finally {
       a.loop.close()
       if(pending===a) { pending=null; context.stopService(Intent(context,AuthService::class.java)) }
     }
   }
 }
 fun cancelAuth() { synchronized(lock) { val a=pending;pending=null;authStatus=null;authMessage="연결을 취소했어요.";a?.loop?.close() };context.stopService(Intent(context,AuthService::class.java)) }
 private fun saveToken(c: JSONObject, t: JSONObject) {
   c.put("access_token",t.getString("access_token"))
   if(t.has("refresh_token")) c.put("refresh_token",t.getString("refresh_token"))
   if(t.has("id_token")) c.put("id_token",t.getString("id_token"))
   if(t.has("scope")) c.put("scope",t.getString("scope"))
   c.put("expires_at",System.currentTimeMillis()+t.getLong("expires_in")*1000)
 }
 private fun postForm(url: String, fields: Map<String,String>): JSONObject {
   val body=FormBody.Builder().apply { fields.forEach { (k,v)->add(k,v) } }.build()
   return http.newCall(Request.Builder().url(url).post(body).build()).execute().use { res ->
     if(!res.isSuccessful) {
       val code=runCatching { JSONObject(res.body?.string() ?: "{}").optString("error") }.getOrDefault("")
       if(code=="invalid_grant" || code=="invalid_token") error("reconnect_required")
       error("oauth_http_${res.code}")
     }
     JSONObject(res.body?.string() ?: error("empty_body"))
   }
 }
 private fun getJson(url: String, access: String?=null): JSONObject {
   val request=Request.Builder().url(url).apply { access?.let { header("Authorization","Bearer $it") } }.build()
   return http.newCall(request).execute().use { res -> require(res.isSuccessful) { "http_${res.code}" };JSONObject(res.body?.string() ?: error("empty_body")) }
 }
 /** Refresh is serialized with credential mutations so rotated tokens are never mixed. */
 private fun access(id: String): String = synchronized(lock) {
   require(pending==null) { "authorizing" }
   val r=record();require(active(r)==id) { "inactive_profile" };val c=credential(r,id)
   require(c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct")) { "plan_permission_missing" }
   require(c.has("access_token")) { "reconnect_required" }
   if(c.optLong("expires_at")<System.currentTimeMillis()+60_000) {
     require(c.has("refresh_token")) { "reconnect_required" }
     try {
       val t=postForm(Protocol.TOKEN,mapOf("grant_type" to "refresh_token","client_id" to c.getString("client_id"),"refresh_token" to c.getString("refresh_token"),"resource" to Protocol.RESOURCE))
       require(t.optString("access_token").isNotBlank() && t.optLong("expires_in")>0) { "invalid_token_response" }
       saveToken(c,t);vault.save(r)
     } catch(e: Exception) {
       if(e.message=="reconnect_required") { c.remove("access_token");c.remove("refresh_token");c.remove("id_token");vault.save(r) }
       throw e
     }
   }
   require(c.optString("scope").split(' ').contains("chatgpt.tokens.use.direct")) { "plan_permission_missing" }
   c.getString("access_token")
 }
 fun select(id: String?): Map<String,Any> { cancelResponse();cancelAuth();synchronized(lock) { val r=record();if(id==null) r.remove("active") else { credential(r,id);r.put("active",id) };vault.save(r);authStatus=null };return state() }
 fun signOut(id: String): Map<String,Boolean> {
   cancelResponse();cancelAuth()
   val revoked=synchronized(lock) {
     val r=record();val c=credential(r,id)
     val result=try {
       val discovery=getJson(Protocol.DISCOVERY)
       require(discovery.getString("issuer")==Protocol.ISSUER && discovery.getString("revocation_endpoint")=="${Protocol.ISSUER}/api/accounts/oauth/revoke")
       if(c.has("refresh_token")) {
         val body=FormBody.Builder().add("token",c.getString("refresh_token")).add("token_type_hint","refresh_token").add("client_id",c.getString("client_id")).build()
         http.newCall(Request.Builder().url(discovery.getString("revocation_endpoint")).post(body).build()).execute().use { it.code==200 }
       } else true
     } catch(_: Exception) { false }
     c.remove("access_token");c.remove("refresh_token");c.remove("id_token");c.remove("expires_at");vault.save(r);authStatus=null;result
   }
   return mapOf("revoked" to revoked)
 }
 fun models(id: String): List<Map<String,String>> {
   val token=access(id);val a=getJson("${Protocol.RESOURCE}/models",token).getJSONArray("models")
   return (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optString("visibility")=="list" && it.optString("slug").isNotBlank() }.map { mapOf("slug" to it.getString("slug"),"displayName" to it.optString("display_name",it.getString("slug"))) }
 }
 @Synchronized fun startResponse(raw: String): Map<String,String> {
   responseId?.let { return mapOf("requestId" to it) }
   val q=JSONObject(raw);require(q.getString("instructions").length<=16000 && q.getJSONArray("input").toString().length<=24000)
   val id=UUID.randomUUID().toString();responseId=id
   io.execute {
     try {
       val token=access(q.getString("profileId"))
       val body=JSONObject().put("model",q.getString("model")).put("instructions",q.getString("instructions"))
         .put("input",q.getJSONArray("input")).put("store",false).put("stream",true)
       val call=http.newBuilder().callTimeout(90,TimeUnit.SECONDS).build().newCall(Request.Builder().url("${Protocol.RESOURCE}/responses").header("Authorization","Bearer $token").post(body.toString().toRequestBody("application/json".toMediaType())).build())
       synchronized(this) { require(responseId==id) { "cancelled" };responseCall=call }
       call.execute().use { res ->
         require(res.isSuccessful) { if(res.code==429) "usage_limit" else "http_${res.code}" }
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
     } finally { synchronized(this) { if(responseId==id) { responseId=null;responseCall=null } } }
   }
   return mapOf("requestId" to id)
 }
 @Synchronized fun cancelResponse(id: String?=null) {
   val current=responseId ?: return
   if(id!=null && current!=id) return
   responseId=null;responseCall?.cancel();responseCall=null
   emit?.invoke(mapOf("requestId" to current,"type" to "cancelled"))
 }
 fun eraseAll() { cancelResponse();cancelAuth();synchronized(lock) { vault.erase();authStatus=null;authMessage=null } }
}
