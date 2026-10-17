package com.teumknowledge.siwc

import android.content.Context
import android.content.ContextWrapper
import java.io.File
import java.util.concurrent.ExecutorService
import org.junit.Assert.*
import expo.modules.kotlin.exception.CodedException
import org.junit.Test

/** No credentials or network: keep the worker behind its registry lock. */
class ResponseOwnershipTest {
 @Test fun independentRequestsMustNotShareTheActiveResponseId() {
   val context = object : ContextWrapper(null) {
     override fun getNoBackupFilesDir() = File(System.getProperty("java.io.tmpdir")!!)
   }
   val constructor = SiwcManager::class.java.getDeclaredConstructor(Context::class.java).apply { isAccessible = true }
   val manager = constructor.newInstance(context)
   fun field(name: String) = SiwcManager::class.java.getDeclaredField(name).apply { isAccessible = true }.get(manager)
   val registry = field("registry") as SessionRegistry
   synchronized(registry.lock) {
     try {
       val plan = manager.startResponse("""{"profileId":"fixture","model":"fixture","instructions":"Return a plan JSON","input":[]}""")
       val busy = assertThrows(CodedException::class.java) {
         manager.startResponse("""{"profileId":"fixture","model":"fixture","instructions":"Explain this concept","input":[]}""")
       }
       assertEquals("response_busy", busy.code)
       manager.cancelResponse("another-consumer")
       assertEquals("A rejected consumer cannot cancel the owner", plan["requestId"], field("responseId"))
       manager.cancelResponse(plan["requestId"])
       val chat = manager.startResponse("""{"profileId":"fixture","model":"fixture","instructions":"Explain this concept","input":[]}""")
       assertNotEquals(plan["requestId"], chat["requestId"])
       manager.cancelResponse(plan["requestId"])
       assertEquals("A late cancellation cannot stop the new owner", chat["requestId"], field("responseId"))
     } finally {
       manager.cancelResponse()
       (field("io") as ExecutorService).shutdownNow()
     }
   }
 }
}
