package com.teumknowledge.app

import android.content.Intent
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import java.io.File
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/** Development smoke test on a fresh learner. No external accounts or mock success provider. */
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
 private fun open() {
   val context=instrumentation.targetContext
   val uri=Uri.parse("exp+teum-knowledge://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081")
   context.startActivity(Intent(Intent.ACTION_VIEW,uri).setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   device.wait(Until.hasObject(By.text("Continue")),5000)
   device.findObject(By.text("Continue"))?.click()
 }
 @Test fun offlineLearningPersistsAfterRelaunch() {
   open()
   assertTrue("Onboarding did not open",device.wait(Until.hasObject(By.textContains("착각하는 앱")),30000));screenshot("onboarding")
   find("다음").click();find("5문제 · 기본")
   find("다음").click();find("잠금 화면에 카드를 놓을까요?")
   find("나중에").click()
   find("네트워크");screenshot("question")
   find("요청한 자원을 서버에서 찾지 못했다").click()
   find("확인").click()
   find("맞았어요");screenshot("answer")
   find("다음").click()
   assertTrue("Daily count did not advance",device.wait(Until.hasObject(By.text("1 / 5")),10000))
   device.pressHome()
   instrumentation.targetContext.packageManager.getLaunchIntentForPackage(instrumentation.targetContext.packageName)!!
     .let { instrumentation.targetContext.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
   assertTrue("Progress lost after relaunch",device.wait(Until.hasObject(By.text("1 / 5")),15000))
   device.findObject(By.descStartsWith("퍼즐 보기")).click()
   find("/ 60 조각");screenshot("puzzle")
 }
}
