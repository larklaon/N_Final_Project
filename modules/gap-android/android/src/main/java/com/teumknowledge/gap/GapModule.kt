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
    AsyncFunction("readEvents") { GapStore.read(context()) { it.events().toString() } }
    AsyncFunction("ackEvents") { ids: List<String> -> GapStore.update(context()) { it.ack(ids.toSet()) } }
    AsyncFunction("canPinWidget") { AppWidgetManager.getInstance(context()).isRequestPinAppWidgetSupported }
    AsyncFunction("pinWidget") {
      val context = context()
      AppWidgetManager.getInstance(context).requestPinAppWidget(ComponentName(context, GapWidgetProvider::class.java), null, null)
    }
  }
}
