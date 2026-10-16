package com.teumknowledge.app

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import kotlin.math.ceil
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Question screen fits at the configured font, density and orientation. Never changes learning data. */
@RunWith(AndroidJUnit4::class)
class LayoutTest {
 @Test fun labelsFitAtConfiguredFontAndOrientation() {
   val ins=InstrumentationRegistry.getInstrumentation();val c=ins.targetContext
   val d=UiDevice.getInstance(ins)
   val uri=Uri.parse("exp+teum-knowledge://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081")
   c.startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   d.wait(Until.hasObject(By.text("Continue")),1500);d.findObject(By.text("Continue"))?.click()
   check(d.wait(Until.hasObject(By.descStartsWith("퍼즐 보기")),30000)) { "Question screen did not open (needs an onboarded learner)" }
   val name=InstrumentationRegistry.getArguments().getString("captureName","question").replace(Regex("[^a-zA-Z0-9_-]"),"")
   val landscape=name.startsWith("landscape")
   try {
   if(landscape) d.setOrientationLeft() else d.setOrientationNatural()
   d.waitForIdle(1500)
   assertEquals("Wrong capture orientation",landscape,d.displayWidth>d.displayHeight)
   val font=c.resources.configuration.fontScale
   val density=c.resources.displayMetrics.density
   val minimum=ceil(17 * minOf(font,1.5f) * density).toInt()
   val options=d.findObjects(By.descContains("번, "))
   assertTrue("No answer options",options.isNotEmpty())
   for(o in options) { val b=o.visibleBounds; assertTrue("Option too small: $b",b.height()>=minimum) }
   // The confirm button must be reachable inside the screen, above the gesture area.
   val confirm=d.findObject(By.text("확인")) ?: d.findObject(By.text("다음"))
   assertNotNull("Missing primary action",confirm)
   val b=confirm!!.visibleBounds
   assertTrue("Primary action offscreen: $b",b.left>=0 && b.right<=d.displayWidth && b.bottom<=d.displayHeight && b.height()>=minimum)
   assertNotNull("Missing settings",d.findObject(By.desc("설정")))
   d.takeScreenshot(File(c.getExternalFilesDir(null),"$name.png"))
   d.dumpWindowHierarchy(File(c.getExternalFilesDir(null),"$name.xml"))
   } finally { d.unfreezeRotation() }
 }
}
