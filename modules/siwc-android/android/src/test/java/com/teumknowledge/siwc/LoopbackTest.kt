package com.teumknowledge.siwc
import org.junit.Assert.*
import org.junit.Test
import java.net.Socket
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
class LoopbackTest {
 private fun request(port:Int,path:String):String = Socket("127.0.0.1",port).use { s ->
   s.soTimeout=2000;s.getOutputStream().write("GET $path HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray())
   s.getInputStream().bufferedReader().readText()
 }
 @Test fun invalidStateAndPathDoNotConsumeTheAttempt() {
   Loopback().use { server ->
     val pool=Executors.newSingleThreadExecutor()
     try {
       val result=pool.submit<Map<String,String>> { server.await("fixture-state") };val port=URI(server.redirect).port
       assertTrue(request(port,"/wrong?state=fixture-state").startsWith("HTTP/1.1 400"))
       assertTrue(request(port,"/auth/callback?state=wrong&code=not-redeemed").startsWith("HTTP/1.1 400"))
       assertTrue(request(port,"/auth/callback?state=fixture-state&code=fixture-code&client_id=fixture-client").startsWith("HTTP/1.1 200"))
       assertEquals("fixture-code",result.get(3,TimeUnit.SECONDS)["code"])
     } finally { pool.shutdownNow() }
   }
 }
 @Test fun concurrentListenersChooseDifferentAvailablePorts() {
   Loopback().use { first ->Loopback().use { second ->assertNotEquals(URI(first.redirect).port,URI(second.redirect).port);assertEquals("127.0.0.1",URI(second.redirect).host) } }
 }
}
