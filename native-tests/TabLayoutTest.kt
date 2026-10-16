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

/** Run with the emulator density/font/rotation already set; never changes learning data. */
@RunWith(AndroidJUnit4::class)
class TabLayoutTest {
 @Test fun labelsFitAtConfiguredFontAndOrientation() {
   val ins=InstrumentationRegistry.getInstrumentation();val c=ins.targetContext
   val d=UiDevice.getInstance(ins)
   val uri=Uri.parse("exp+teum-knowledge://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081")
   c.startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   d.wait(Until.hasObject(By.text("Continue")),1500);d.findObject(By.text("Continue"))?.click()
   check(d.wait(Until.hasObject(By.text("오늘의 틈지식")),30000)) { "Learning app did not open" }
   val name=InstrumentationRegistry.getArguments().getString("captureName","tabs").replace(Regex("[^a-zA-Z0-9_-]"),"")
   val landscape=name.startsWith("landscape")
   try {
   if(landscape) d.setOrientationLeft() else d.setOrientationNatural()
   d.waitForIdle(1500)
   assertEquals("Wrong capture orientation",landscape,d.displayWidth>d.displayHeight)
   val font=c.resources.configuration.fontScale
   val density=c.resources.displayMetrics.density
   val minimum=ceil(14 * minOf(font,1.5f) * density).toInt()
   for(label in listOf("오늘","복습","기록","설정")) {
     val matches=d.findObjects(By.text(label).clazz("android.widget.TextView"))
     assertTrue("Missing tab $label",matches.isNotEmpty())
     val b=matches.last().visibleBounds
     assertTrue("Clipped $label: $b, font=$font min=$minimum",b.height()>=minimum)
     assertTrue("Offscreen tab $label: $b",b.left>=0 && b.right<=d.displayWidth && b.bottom<=d.displayHeight)
   }
   d.takeScreenshot(File(c.getExternalFilesDir(null),"$name.png"))
   d.dumpWindowHierarchy(File(c.getExternalFilesDir(null),"$name.xml"))
   } finally { d.unfreezeRotation() }
 }
}
