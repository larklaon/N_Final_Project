package com.teumknowledge.gap

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/** Draws the current card on the lock-screen notification and every placed widget. */
object GapSurfaces {
  private const val CHANNEL = "gap-card"
  private const val NOTIFICATION_ID = 7300
  const val ACTION_ANSWER = "com.teumknowledge.gap.ANSWER"
  const val ACTION_NEXT = "com.teumknowledge.gap.NEXT"
  const val ACTION_DISMISS = "com.teumknowledge.gap.DISMISS"
  const val ACTION_TICK = "com.teumknowledge.gap.TICK"
  private const val ACCENT = 0xFF3F5A4C.toInt()

  private fun minuteOfDay() = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }

  fun render(context: Context) {
    val (notification, widget) = GapStore.read(context) { s ->
      s.view(forNotification = true, minuteOfDay()) to s.view(forNotification = false, minuteOfDay())
    }
    renderNotification(context, notification)
    renderWidgets(context, widget)
  }

  private fun action(context: Context, action: String, path: String, extras: Intent.() -> Unit = {}): PendingIntent {
    // Distinct data URIs keep one PendingIntent per card and option.
    val intent = Intent(context, GapReceiver::class.java).setAction(action)
      .setData(Uri.parse("teum-gap://$path")).apply(extras)
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
  private fun answer(context: Context, card: GapCard, option: GapOption) =
    action(context, ACTION_ANSWER, "answer/${Uri.encode(card.cardId)}/${Uri.encode(card.questionId)}/${Uri.encode(option.id)}") {
      putExtra("cardId", card.cardId); putExtra("optionId", option.id); putExtra("questionId", card.questionId)
    }
  private fun next(context: Context, card: GapCard) =
    action(context, ACTION_NEXT, "next/${Uri.encode(card.cardId)}") { putExtra("cardId", card.cardId) }
  private fun openApp(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
    }

  private fun shortLabel(card: GapCard, option: GapOption) = if (card.isOx) option.id.uppercase() else option.text
  fun resultTitle(card: GapCard, answer: GapAnswer): String {
    if (answer.correct) return "맞았어요"
    val right = card.option(card.correctOptionId) ?: return "다시 볼 조각이에요"
    return "정답은 ${shortLabel(card, right)}"
  }

  private fun ensureChannel(context: Context) {
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    // Default importance keeps the card on the lock screen; no sound or vibration, ever.
    nm.createNotificationChannel(NotificationChannel(CHANNEL, "잠금 화면 카드", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "소리·진동 없이 잠금 화면에 놓이는 짧은 문제"
      setSound(null, null); enableVibration(false); setShowBadge(false)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    })
  }

  private fun renderNotification(context: Context, view: GapView) {
    val manager = NotificationManagerCompat.from(context)
    if (view is GapView.Hidden || !manager.areNotificationsEnabled()) { manager.cancel(NOTIFICATION_ID); return }
    ensureChannel(context)
    val pkg = context.packageName
    val card = when (view) { is GapView.Question -> view.card; is GapView.Result -> view.card; else -> return }
    val collapsed: RemoteViews
    val expanded: RemoteViews
    when (view) {
      is GapView.Question -> {
        collapsed = RemoteViews(pkg, R.layout.gap_notif_question).also { bindQuestion(context, it, card, compact = true) }
        expanded = RemoteViews(pkg, R.layout.gap_notif_question).also { bindQuestion(context, it, card, compact = false) }
      }
      is GapView.Result -> {
        collapsed = RemoteViews(pkg, R.layout.gap_notif_result).also { bindResult(context, it, view.shown, view.answer, compact = true) }
        expanded = RemoteViews(pkg, R.layout.gap_notif_result).also { bindResult(context, it, view.shown, view.answer, compact = false) }
      }
      else -> return
    }
    val n = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_gap_card).setColor(ACCENT)
      .setSubText(card.area)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(collapsed).setCustomBigContentView(expanded)
      .setContentTitle(card.prompt)
      .setOnlyAlertOnce(true).setSilent(true).setShowWhen(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
      .setContentIntent(openApp(context))
      .setDeleteIntent(action(context, ACTION_DISMISS, "dismiss/${Uri.encode(card.cardId)}") { putExtra("cardId", card.cardId) })
      .build()
    try { manager.notify(NOTIFICATION_ID, n) } catch (_: SecurityException) { /* Permission revoked meanwhile. */ }
  }

  private val optionIds = intArrayOf(R.id.gap_option_1, R.id.gap_option_2, R.id.gap_option_3, R.id.gap_option_4)
  private val oxIds = intArrayOf(R.id.gap_ox_1, R.id.gap_ox_2)

  private fun bindQuestion(context: Context, v: RemoteViews, card: GapCard, compact: Boolean) {
    v.setTextViewText(R.id.gap_prompt, card.prompt)
    v.setInt(R.id.gap_prompt, "setMaxLines", if (!compact) 5 else if (card.isOx) 2 else 1)
    // O/X fits beside the prompt even when collapsed; multiple choice needs the expanded card.
    val inlineOx = card.isOx
    v.setViewVisibility(R.id.gap_ox_row, if (inlineOx) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_options, if (!inlineOx && !compact) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_expand_hint, if (!inlineOx && compact) View.VISIBLE else View.GONE)
    oxIds.forEachIndexed { i, id ->
      val option = card.options.getOrNull(i)
      v.setViewVisibility(id, if (inlineOx && option != null) View.VISIBLE else View.GONE)
      if (option != null && inlineOx) {
        v.setTextViewText(id, shortLabel(card, option)); v.setOnClickPendingIntent(id, answer(context, card, option))
        v.setContentDescription(id, option.text)
      }
    }
    optionIds.forEachIndexed { i, id ->
      val option = card.options.getOrNull(i)
      v.setViewVisibility(id, if (!inlineOx && option != null) View.VISIBLE else View.GONE)
      if (option != null && !inlineOx) { v.setTextViewText(id, option.text); v.setOnClickPendingIntent(id, answer(context, card, option)) }
    }
  }

  private fun bindResult(context: Context, v: RemoteViews, card: GapCard, a: GapAnswer, compact: Boolean) {
    v.setTextViewText(R.id.gap_result_title, resultTitle(card, a))
    v.setTextViewText(R.id.gap_result_feedback, card.feedback)
    v.setInt(R.id.gap_result_feedback, "setMaxLines", if (compact) 1 else 4)
    v.setOnClickPendingIntent(R.id.gap_next, next(context, card))
  }

  /**
   * The widget changes its question with its size: small asks the piece as O/X beside the band,
   * the default size asks "which term is this?" in a 2x2 grid, large lists the four terms.
   */
  private enum class WidgetSize { SMALL, MEDIUM, LARGE }
  private val cellIds = intArrayOf(R.id.gap_widget_cell_1, R.id.gap_widget_cell_2, R.id.gap_widget_cell_3, R.id.gap_widget_cell_4)
  private val rowIds = intArrayOf(R.id.gap_widget_row_1, R.id.gap_widget_row_2, R.id.gap_widget_row_3, R.id.gap_widget_row_4)

  private fun renderWidgets(context: Context, view: GapView) {
    val wm = AppWidgetManager.getInstance(context)
    val ids = wm.getAppWidgetIds(ComponentName(context, GapWidgetProvider::class.java))
    if (ids.isEmpty()) return
    val build = { size: WidgetSize -> widgetViews(context, view, size) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // The launcher picks the largest layout that fits, live while the user resizes.
      wm.updateAppWidget(ids, RemoteViews(mapOf(
        SizeF(180f, 60f) to build(WidgetSize.SMALL),
        SizeF(180f, 250f) to build(WidgetSize.MEDIUM),
        SizeF(180f, 380f) to build(WidgetSize.LARGE),
      )))
    } else for (id in ids) wm.updateAppWidget(id, build(sizeOf(wm.getAppWidgetOptions(id))))
  }

  private fun sizeOf(options: Bundle): WidgetSize {
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 250)
    return when { height < 250 -> WidgetSize.SMALL; height < 380 -> WidgetSize.MEDIUM; else -> WidgetSize.LARGE }
  }

  private fun widgetViews(context: Context, view: GapView, size: WidgetSize): RemoteViews {
    val small = size == WidgetSize.SMALL
    val v = RemoteViews(context.packageName, if (small) R.layout.gap_widget_small else R.layout.gap_widget)
    v.setOnClickPendingIntent(R.id.gap_widget_root, openApp(context))
    // Only touch ids the chosen layout has; a missing id breaks the whole widget.
    val answers = if (small) listOf(R.id.gap_widget_ox) else listOf(R.id.gap_widget_ox, R.id.gap_widget_grid, R.id.gap_widget_list)
    fun showOnly(id: Int?) = answers.forEach { v.setViewVisibility(it, if (it == id) View.VISIBLE else View.GONE) }
    val promptLines = when (size) { WidgetSize.SMALL -> 2; WidgetSize.MEDIUM -> 3; WidgetSize.LARGE -> 5 }
    v.setInt(R.id.gap_widget_prompt, "setMaxLines", promptLines)
    if (size == WidgetSize.LARGE) v.setTextViewTextSize(R.id.gap_widget_prompt, TypedValue.COMPLEX_UNIT_SP, 21f)
    v.setViewVisibility(R.id.gap_widget_next, View.GONE)
    v.setViewVisibility(R.id.gap_widget_feedback, View.GONE)
    when (view) {
      is GapView.Hidden -> {
        if (!small) v.setTextViewText(R.id.gap_widget_area, "틈지식")
        v.setTextViewText(R.id.gap_widget_prompt, "앱을 한 번 열면 여기에 문제가 놓여요.")
        showOnly(null)
      }
      is GapView.Question -> {
        val shape = view.card.variant(if (small) "ox" else "term")
        if (!small) v.setTextViewText(R.id.gap_widget_area, view.card.area)
        v.setTextViewText(R.id.gap_widget_prompt, shape.prompt)
        val buttons = when {
          shape.isOx -> { showOnly(R.id.gap_widget_ox); intArrayOf(R.id.gap_widget_o, R.id.gap_widget_x) }
          small -> { showOnly(null); intArrayOf() } // No O/X variant: tapping opens the app.
          size == WidgetSize.MEDIUM && shape.options.size == 4 -> { showOnly(R.id.gap_widget_grid); cellIds }
          else -> { showOnly(R.id.gap_widget_list); rowIds }
        }
        buttons.forEachIndexed { i, id ->
          val option = shape.options.getOrNull(i)
          v.setViewVisibility(id, if (option != null) View.VISIBLE else View.GONE)
          if (option != null) {
            if (!shape.isOx) v.setTextViewText(id, option.text)
            v.setContentDescription(id, option.text)
            v.setOnClickPendingIntent(id, answer(context, shape, option))
          }
        }
      }
      is GapView.Result -> {
        if (!small) v.setTextViewText(R.id.gap_widget_area, view.card.area)
        v.setTextViewText(R.id.gap_widget_prompt, resultTitle(view.shown, view.answer))
        v.setTextViewText(R.id.gap_widget_feedback, view.shown.feedback)
        v.setInt(R.id.gap_widget_feedback, "setMaxLines", when (size) { WidgetSize.SMALL -> 1; WidgetSize.MEDIUM -> 4; WidgetSize.LARGE -> 8 })
        v.setViewVisibility(R.id.gap_widget_feedback, View.VISIBLE)
        showOnly(null)
        v.setViewVisibility(R.id.gap_widget_next, View.VISIBLE)
        v.setOnClickPendingIntent(R.id.gap_widget_next, next(context, view.card))
      }
    }
    return v
  }

  /** Inexact on purpose: rotation every few minutes late costs nothing and saves battery. */
  fun schedule(context: Context, intervalMinutes: Int, active: Boolean) {
    val am = context.getSystemService(AlarmManager::class.java)
    val pi = PendingIntent.getBroadcast(context, 1, Intent(context, GapReceiver::class.java).setAction(ACTION_TICK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    am.cancel(pi)
    if (!active) return
    val interval = intervalMinutes.coerceAtLeast(15) * 60_000L
    am.setInexactRepeating(AlarmManager.RTC, System.currentTimeMillis() + interval, interval, pi)
  }
}
