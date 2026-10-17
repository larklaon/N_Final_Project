package com.teumknowledge.gap

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.UUID

/** Card buttons, swipe-away and the rotation alarm. Not exported: only our PendingIntents reach it. */
class GapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val now = System.currentTimeMillis()
    val cardId = intent.getStringExtra("cardId")
    when (intent.action) {
      GapSurfaces.ACTION_ANSWER -> {
        val option = intent.getStringExtra("optionId") ?: return
        val question = intent.getStringExtra("questionId")
        GapStore.update(context) { it.answer(cardId ?: return@update, option, now, { UUID.randomUUID().toString() }, question) }
      }
      GapSurfaces.ACTION_NEXT -> GapStore.update(context) { if (it.showingId() == cardId) it.advance(now) }
      GapSurfaces.ACTION_DISMISS -> { GapStore.update(context) { it.dismiss(cardId ?: return@update) }; return }
      GapSurfaces.ACTION_TICK -> GapStore.update(context) { it.rotateIfDue(now) }
      else -> return
    }
    GapSurfaces.render(context)
  }
}

/** Notifications and alarms do not survive a reboot or an app update; put the card back. */
class GapBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val (interval, active) = GapStore.read(context) { it.intervalMinutes to (it.current() != null) }
    GapSurfaces.schedule(context, interval, active)
    GapSurfaces.render(context)
  }
}

class GapWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = GapSurfaces.render(context)
  // Before Android 12 the layout is chosen by size here; from 12 the launcher switches by itself.
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: android.os.Bundle) =
    GapSurfaces.render(context)
}
