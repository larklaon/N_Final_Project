package com.teumknowledge.app

import android.app.NotificationManager
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

/**
 * A start intent whose attempt already ended must still satisfy startForegroundService.
 * The instrumentation shares the app process, so a framework kill fails this test.
 */
@RunWith(AndroidJUnit4::class)
class AuthServiceStaleStartTest {
 @Test fun staleStartDoesNotCrashAndLeavesNoNotification() {
   val c=InstrumentationRegistry.getInstrumentation().targetContext
   c.startForegroundService(Intent().setClassName(c.packageName,"com.teumknowledge.siwc.AuthService").putExtra("attemptId","stale-fixture"))
   Thread.sleep(12_000) // Longer than the framework's startForeground deadline.
   val active=c.getSystemService(NotificationManager::class.java).activeNotifications
   assertFalse(active.any { it.id==1455 })
 }
}
