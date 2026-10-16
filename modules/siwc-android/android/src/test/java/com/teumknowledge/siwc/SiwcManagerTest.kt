package com.teumknowledge.siwc

import android.content.ComponentName
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Invokes the production manager with isolated memory credentials and a fake Android service boundary. */
class SiwcManagerTest {
 @Test fun oldAuthCleanupMustNotStopReplacementService() {
   val stopping=CountDownLatch(1);val release=CountDownLatch(1);val stopped=CountDownLatch(1)
   val running=AtomicBoolean(false)
   val context=object:ContextWrapper(null) {
     override fun getNoBackupFilesDir()=File(System.getProperty("java.io.tmpdir")!!)
     override fun startForegroundService(intent:Intent):ComponentName? { running.set(true);return null }
     override fun startActivity(intent:Intent) { error("fixture_browser_failure") }
     override fun stopService(intent:Intent):Boolean {
       stopping.countDown();release.await(5,TimeUnit.SECONDS)
       running.set(false);stopped.countDown();return true
     }
   }
   val constructor=SiwcManager::class.java.getDeclaredConstructor(Context::class.java).apply { isAccessible=true }
   val manager=constructor.newInstance(context)
   val registry=SessionRegistry(MemoryStore(JSONObject().put("host","urn:uuid:fixture").put("profiles",JSONObject())))
   fun replace(name:String,value:Any) { SiwcManager::class.java.getDeclaredField(name).apply { isAccessible=true }.set(manager,value) }
   replace("registry",registry);replace("attempt",AttemptSlot<Any>(registry.lock))
   try {
     manager.begin(null);manager.performAuth(manager.currentAttemptId()!!)
     assertTrue("Old cleanup not reached",stopping.await(5,TimeUnit.SECONDS))
     // While A closes its service, B must wait for that local cleanup to finish.
     val pool=java.util.concurrent.Executors.newSingleThreadExecutor()
     try {
       val entered=CountDownLatch(1)
       val replacement=pool.submit<Map<String,Any>> { entered.countDown();manager.begin(null) }
       assertTrue(entered.await(5,TimeUnit.SECONDS))
       assertThrows(java.util.concurrent.TimeoutException::class.java) { replacement.get(100,TimeUnit.MILLISECONDS) }
       release.countDown();assertTrue(stopped.await(5,TimeUnit.SECONDS))
       assertEquals("authorizing",replacement.get(5,TimeUnit.SECONDS)["status"])
       // A stale notification or timeout must not cancel B either.
       assertFalse(manager.cancelAuth("old-attempt"))
     } finally { pool.shutdownNow() }
     assertEquals("authorizing",manager.state()["status"])
     assertTrue("Old auth cleanup stopped the replacement foreground service",running.get())
   } finally {
     release.countDown();manager.cancelAuth()
     val pool=SiwcManager::class.java.getDeclaredField("io").apply { isAccessible=true }.get(manager) as java.util.concurrent.ExecutorService
     pool.shutdownNow()
   }
 }
}
