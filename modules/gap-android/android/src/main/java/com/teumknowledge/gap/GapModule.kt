package com.teumknowledge.gap

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class GapModule : Module() {
  private fun context() = appContext.reactContext ?: error("no_context")
  override fun definition() = ModuleDefinition {
    Name("GapAndroid")
    AsyncFunction("configure") { raw: String ->
      val context = context()
      val config = JSONObject(raw)
      val (interval, active) = GapStore.update(context) {
        it.configure(config, System.currentTimeMillis()); it.intervalMinutes to (it.current() != null)
      }
      GapSurfaces.schedule(context, interval, active)
      GapSurfaces.render(context)
    }
    // What the lock-screen card shows right now, so settings can preview it.
    AsyncFunction("current") {
      val context = context()
      GapStore.read(context) { state ->
        val card = state.current() ?: return@read "null"
        val minute = java.util.Calendar.getInstance().let { it.get(java.util.Calendar.HOUR_OF_DAY) * 60 + it.get(java.util.Calendar.MINUTE) }
        val options = org.json.JSONArray().apply { card.options.forEach { put(JSONObject().put("id", it.id).put("text", it.text)) } }
        JSONObject().put("prompt", card.prompt).put("short", card.short).put("area", card.area).put("type", card.type).put("options", options)
          .put("onLockScreen", state.view(forNotification = true, minute) !is GapView.Hidden).toString()
      }
    }
    AsyncFunction("readEvents") { GapStore.read(context()) { it.events().toString() } }
    AsyncFunction("ackEvents") { ids: List<String> -> GapStore.update(context()) { it.ack(ids.toSet()) } }
    AsyncFunction("canPinWidget") { AppWidgetManager.getInstance(context()).isRequestPinAppWidgetSupported }
    AsyncFunction("pinWidget") {
      val context = context()
      AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, GapWidgetProvider::class.java), null, null)
    }
  }
}
