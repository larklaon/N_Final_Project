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
   else if(e is IOException)
     registry.markIssue(lease,"잠시 ChatGPT에 연결할 수 없어요. 네트워크를 확인한 뒤 연결 상태를 다시 확인해 주세요.")
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
       lease=registry.access(id,refresh,allowed,lease)
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
       try { lease=registry.access(id,refresh,permitted,lease) }
       catch(refreshError:Exception) { note(lease,refreshError);throw refreshError }
     }
     note(lease,e);throw e // Explicit user retry is required for every failed POST.
   }
 }
}
