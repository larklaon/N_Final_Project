package com.teumknowledge.siwc

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/** Diagnostics retain structured metadata only, never response bodies or credentials in messages. */
class ResourceFailure(val status:Int,val code:String,val parameter:String?,val requestId:String?,val bodyShape:String) : IOException(
 when(status) {401->"connection_check_required";403->"permission_denied";429->"usage_limit";503->"service_unavailable";else->"resource_http_$status"}
) {
 companion object {
   fun from(response:Response):ResourceFailure {
     return parse(response.code,response.peekBody(65536).string(),response.header("x-request-id"))
   }
   fun parse(status:Int,raw:String,requestId:String?):ResourceFailure {
     val json=runCatching { JSONObject(raw) }.getOrNull();val error=json?.optJSONObject("error")
     return ResourceFailure(status,error?.optString("code") ?: "",error?.optString("param")?.takeIf { it.isNotBlank() },requestId,
       if(error!=null) "error" else if(json?.has("detail")==true) "detail" else "unknown")
   }
 }
}
class ResourceAccess(
 private val registry:SessionRegistry,
 private val http:OkHttpClient,
 private val refresh:(Map<String,String>,CredentialLease)->JSONObject,
 private val allowed:()->Boolean,
 private val resource:String=Protocol.RESOURCE,
 private val streamHttp:OkHttpClient=http,
) {
 private fun <T> perform(client:OkHttpClient,lease:CredentialLease,operation:String,request:Request,valid:()->Boolean,consume:(Response)->T):T {
   val call=client.newCall(request.newBuilder().header("Authorization","Bearer ${lease.accessToken}").build())
   return registry.track(call,operation) { registry.isCurrent(lease) && allowed() && valid() }.use {
     try {
       call.execute().use { res ->
         if(!res.isSuccessful) throw ResourceFailure.from(res)
         consume(res)
       }
     } catch(e:IOException) {
       // Cancellation is a local decision, not a connection problem worth surfacing.
       if(call.isCanceled() && e !is ResourceFailure) throw IllegalStateException("cancelled",e)
       throw e
     }
   }
 }
 private fun note(lease:CredentialLease,e:Exception) {
   if(e is ResourceFailure && e.status==401)
     registry.markIssue(lease,"ChatGPT 계정과 플랜 사용 권한을 확인해 주세요. 연결 상태를 다시 확인하거나 다시 연결할 수 있어요.")
   else if(e is ResourceFailure && e.status==403)
     registry.markIssue(lease,"선택한 계정·워크스페이스 또는 서비스 정책에서 이 요청을 허용하지 않아요. 연결 권한을 확인해 주세요.")
   else if(e is ResourceFailure && e.status==429)
     registry.markIssue(lease,"ChatGPT 사용 한도에 도달했어요. 사용량 관리에서 앱 사용량을 확인해 주세요.")
   else if(e is IOException)
     registry.markIssue(lease,"잠시 ChatGPT에 연결할 수 없어요. 네트워크를 확인한 뒤 연결 상태를 다시 확인해 주세요.")
 }
 private fun recover(id:String,lease:CredentialLease,permitted:()->Boolean,failure:ResourceFailure):CredentialLease =
   try { registry.access(id,refresh,permitted,lease) }
   catch(e:Exception) {
     // Keep admission diagnostics even when refresh itself fails or no refresh grant exists.
     e.addSuppressed(failure);note(lease,if(e is IOException) e else failure);throw e
   }
 fun models(id:String):List<Map<String,String>> {
   val operation="models:${UUID.randomUUID()}"
   var lease=registry.access(id,refresh,allowed)
   fun read():List<Map<String,String>> = perform(http,lease,operation,Request.Builder().url("$resource/models").build(),{true}) { res ->
     val a=JSONObject(res.body?.string() ?: error("empty_body")).getJSONArray("models")
     (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optString("visibility")=="list" && it.optString("slug").isNotBlank() }
       .map { mapOf("slug" to it.getString("slug"),"displayName" to it.optString("display_name",it.getString("slug"))) }
   }
   try {
     val result=try { read() } catch(e:ResourceFailure) {
       if(e.status!=401) throw e
       lease=recover(id,lease,allowed,e)
       read() // One safe GET retry. No generation request is replayed here.
     }
     registry.clearIssue(lease);return result
   } catch(e:Exception) {note(lease,e);throw e}
 }
 fun response(id:String,operation:String,body:RequestBody,valid:()->Boolean,consume:(Response)->Unit) {
   val permitted={allowed() && valid()}
   var lease=registry.access(id,refresh,permitted)
   try {
     perform(streamHttp,lease,operation,Request.Builder().url("$resource/responses").post(body).build(),valid,consume)
     registry.clearIssue(lease)
   } catch(e:Exception) {
     if(e is ResourceFailure && e.status==401) {
       lease=recover(id,lease,permitted,e)
     }
     note(lease,e);throw e // Explicit user retry is required for every failed POST.
   }
 }
}

/** Public diagnostics are allowlisted scalars. Raw bodies, headers and OAuth tokens never cross the bridge. */
fun responseFailureEvent(id:String,error:Exception):Map<String,Any> {
 val result=mutableMapOf<String,Any>("requestId" to id,"type" to "failed",
   "code" to (error.message?.takeIf { it.matches(Regex("[a-z0-9_]{1,128}")) } ?: "network_error"))
 val failure=(error as? ResourceFailure) ?: error.suppressed.filterIsInstance<ResourceFailure>().firstOrNull()
 if(failure!=null) {
   result["httpStatus"]=failure.status;result["bodyShape"]=failure.bodyShape
   if(failure.code.matches(Regex("[a-zA-Z0-9_-]{1,128}"))) result["errorCode"]=failure.code
   failure.parameter?.takeIf { it.matches(Regex("[a-zA-Z0-9_.\\[\\]-]{1,128}")) }?.let { result["parameter"]=it }
   failure.requestId?.takeIf { it.matches(Regex("[a-zA-Z0-9_-]{1,200}")) }?.let { result["serverRequestId"]=it }
 }
 return result
}
