package com.teumknowledge.app

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Development smoke test. No external accounts or mock success provider. */
@RunWith(AndroidJUnit4::class)
class MainFlowTest {
 private val instrumentation=InstrumentationRegistry.getInstrumentation()
 private val device=UiDevice.getInstance(instrumentation)
 private fun find(text:String,timeout:Long=15000):UiObject2 {
   val end=System.currentTimeMillis()+timeout
   while(System.currentTimeMillis()<end){
     (device.findObject(By.desc(text)) ?: device.findObject(By.text(text)))?.let{return it}
     device.waitForIdle(200)
   }
   error("Missing screen text: $text")
 }
 private fun screenshot(name:String) { device.takeScreenshot(File(instrumentation.targetContext.getExternalFilesDir(null),"$name.png")) }
 private fun scrollTo(text:String):UiObject2 {
   for(i in 0..8) {
     (device.findObject(By.desc(text)) ?: device.findObject(By.text(text)))?.let{if(it.visibleBounds.height()>48){device.waitForIdle(1200);return it}}
     device.findObject(By.scrollable(true))?.scroll(Direction.DOWN,0.6f,600)
     device.waitForIdle(1200)
   }
   return find(text,3000)
 }
 @Test fun offlineLearningPersistsAfterRelaunch() {
   val context=instrumentation.targetContext
   val uri=Uri.parse("exp+teum-knowledge://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081")
   context.startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   device.wait(Until.hasObject(By.text("Continue")),10000)
   device.findObject(By.text("Continue"))?.click()
   screenshot("launch-state")
   device.dumpWindowHierarchy(File(instrumentation.targetContext.getExternalFilesDir(null),"launch.xml"))
   device.wait(Until.hasObject(By.descContains("짧게 익히고")),15000)
   if(device.hasObject(By.textContains("짧게 익히고")) || device.hasObject(By.descContains("짧게 익히고"))) { screenshot("onboarding");scrollTo("기본 학습으로 시작").click() }
   find("오늘의 틈지식");screenshot("today")
   find("한 개 익히기").click();find("HTTP 요청과 응답");screenshot("concept")
   scrollTo("퀴즈 풀기").click(100)
   if(!device.wait(Until.hasObject(By.text("짧은 퀴즈")),2000)) scrollTo("퀴즈 풀기").click(100)
   device.waitForIdle(1500);screenshot("quiz-open");device.dumpWindowHierarchy(File(context.getExternalFilesDir(null),"quiz.xml"));find("상태 코드").click();scrollTo("정답 확인").click();find("정답이에요.");screenshot("quiz-result")
   scrollTo("오늘 학습으로").click(100)
   if(!device.wait(Until.hasObject(By.text("오늘의 틈지식")),2000)) scrollTo("오늘 학습으로").click(100)
   find("오늘의 틈지식")
   assertTrue(device.wait(Until.hasObject(By.textContains("1 / 3개")),10000))
   screenshot("today-after")
   device.pressHome()
   context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("teumknowledge://history")).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   find("차곡차곡 쌓인 기록");assertTrue(device.wait(Until.hasObject(By.textContains("만난 개념 1 / 60개")),10000));screenshot("history")
 }
}
