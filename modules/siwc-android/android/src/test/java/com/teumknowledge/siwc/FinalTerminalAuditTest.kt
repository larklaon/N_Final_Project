package com.teumknowledge.siwc

import android.content.Context
import android.content.ContextWrapper
import expo.modules.kotlin.exception.CodedException
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Production manager + local SSE server only. No account credentials or external network. */
class FinalTerminalAuditTest {
 private fun success()=MockResponse().setHeader("Content-Type","text/event-stream").setBody(
   "data: {\"type\":\"response.output_text.delta\",\"delta\":\"fixture\"}\n\ndata: {\"type\":\"response.completed\"}\n\n")

 @Test fun completedEventPermitsTheNextRequest() = assertChain(success(),"completed")
 @Test fun failedSseEventPermitsTheNextRequest() = assertChain(
   MockResponse().setHeader("Content-Type","text/event-stream").setBody(
     "data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"server_error\"}}}\n\n"),"failed")
 @Test fun httpFailurePermitsTheNextRequest() = assertChain(
   MockResponse().setResponseCode(400).setBody("{\"error\":{\"code\":\"invalid_request_error\"}}"),"failed")

 private fun assertChain(first:MockResponse,expected:String) {
   val server=MockWebServer()
   server.start()
   val context=object:ContextWrapper(null) {
     override fun getNoBackupFilesDir()=File(System.getProperty("java.io.tmpdir")!!)
   }
   val constructor=SiwcManager::class.java.getDeclaredConstructor(Context::class.java).apply { isAccessible=true }
   val manager=constructor.newInstance(context)
   fun field(name:String)=SiwcManager::class.java.getDeclaredField(name).apply { isAccessible=true }
   val credential=JSONObject().put("client_id","fixture").put("access_token","fixture-access")
     .put("scope",Protocol.SCOPES).put("expires_at",System.currentTimeMillis()+3_600_000)
   val registry=SessionRegistry(MemoryStore(JSONObject().put("active","p").put("profiles",JSONObject().put("p",credential))))
   val access=ResourceAccess(registry,OkHttpClient(),{_,_->error("no_refresh_expected")},{true},server.url("/v1").toString().removeSuffix("/"))
   field("registry").set(manager,registry)
   field("resources").set(manager,access)
   val event=CountDownLatch(2)
   val terminals=AtomicInteger()
   val rejection=AtomicReference<String?>(null)
   val request="""{"profileId":"p","model":"fixture","instructions":"Return text","input":[]}"""
   manager.emit={ e ->
     if(e["type"]=="completed" || e["type"]=="failed") {
       // The JS coordinator treats this event as idle and dispatches the next stage.
       try {
         if(terminals.incrementAndGet()==1) {
           if(e["type"]!=expected) rejection.set("unexpected_terminal_${e["type"]}")
           manager.startResponse(request)
         } else if(e["type"]!="completed") rejection.set("next_request_failed")
       }
       catch(error:CodedException) { rejection.set(error.code);event.countDown() }
       finally { event.countDown() }
     }
   }
   try {
     server.enqueue(first)
     server.enqueue(success())
     manager.startResponse(request)
     assertTrue("Both terminal events must arrive",event.await(5,TimeUnit.SECONDS))
     assertNull("Terminal must release ownership before the consumer starts the next request",rejection.get())
     assertEquals(2,server.requestCount)
   } finally {
     manager.emit=null
     manager.cancelResponse()
     (field("io").get(manager) as ExecutorService).shutdownNow()
     server.shutdown()
   }
 }
}
