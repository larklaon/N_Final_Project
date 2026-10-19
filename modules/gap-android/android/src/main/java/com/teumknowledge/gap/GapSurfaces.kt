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
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
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
  /** Same as the app's mintText / danger: right answers deepen to mint, wrong ones are red. */
  private const val RIGHT = 0xFF207354.toInt()
  private const val WRONG = 0xFFA53332.toInt()
  private const val INK = 0xFF121513.toInt()
  private fun verdictColor(a: GapAnswer) = if (a.correct) RIGHT else WRONG

  /** The small text label beside the area; never inside the two-line question space. */
  fun areaLabel(card: GapCard) = if (card.isAi) "${card.area} · AI" else card.area
  /** The system header truncates from the end on narrow phones with large text: AI goes first. */
  private fun notificationLabel(card: GapCard) = if (card.isAi) "AI · ${card.area}" else card.area

  private fun minuteOfDay() = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }

  fun render(context: Context) {
    GapStore.update(context) { it.skipExpired(System.currentTimeMillis()) }
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

  /** The note if verdict and note fit two collapsed lines; otherwise just the piece's name. */
  fun collapsedNote(verdict: String, card: GapCard): String =
    if (ems("$verdict  ${card.feedback}") <= 2 * LOCK_LINE_EMS) card.feedback else card.conceptTitle.ifEmpty { card.feedback }

  /** Same rough measure as src/domain/fit.ts. */
  fun ems(text: String): Double = text.sumOf { ch ->
    when {
      ch in '\u1100'..'\u11ff' || ch in '\u3130'..'\u318f' || ch in '\uac00'..'\ud7af' || ch in '\u4e00'..'\u9fff' -> 1.0
      ch == ' ' -> 0.3
      ch in 'A'..'Z' -> 0.68
      ch in 'a'..'z' || ch in '0'..'9' -> 0.56
      else -> 0.36
    }
  }
  private const val LOCK_LINE_EMS = 9.8

  private fun verdictLine(verdict: String, note: String, color: Int): CharSequence =
    SpannableStringBuilder(verdict).apply {
      setSpan(StyleSpan(Typeface.BOLD), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      setSpan(ForegroundColorSpan(color), 0, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      append(" · ").append(note)
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
      .setSubText(notificationLabel(card))
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
  private val wideOxIds = intArrayOf(R.id.gap_ox_wide_1, R.id.gap_ox_wide_2)

  private fun bindQuestion(context: Context, v: RemoteViews, card: GapCard, compact: Boolean) {
    // Collapsed shows the short lock-screen wording; expanded shows the full prompt.
    val description = if (card.isAi) "AI가 만든 카드. ${card.prompt}" else card.prompt
    // Collapsed O/X: a self-shrinking two-line copy so the sentence is never cut on a narrow band.
    val shrink = compact && card.isOx
    v.setViewVisibility(R.id.gap_prompt, if (shrink) View.GONE else View.VISIBLE)
    v.setViewVisibility(R.id.gap_prompt_compact, if (shrink) View.VISIBLE else View.GONE)
    if (shrink) {
      v.setTextViewText(R.id.gap_prompt_compact, card.collapsedPrompt)
      v.setContentDescription(R.id.gap_prompt_compact, description)
    } else {
      v.setTextViewText(R.id.gap_prompt, if (compact) card.collapsedPrompt else card.prompt)
      v.setContentDescription(R.id.gap_prompt, description)
      v.setInt(R.id.gap_prompt, "setMaxLines", if (!compact) 5 else 1)
      v.setTextViewTextSize(R.id.gap_prompt, TypedValue.COMPLEX_UNIT_SP, if (compact) 14f else 16f)
    }
    // Collapsed: O/X keys beside the band. Expanded: wide O/X keys, or the choices, below it.
    val inlineOx = card.isOx && compact
    val wideOx = card.isOx && !compact
    v.setViewVisibility(R.id.gap_ox_row, if (inlineOx) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_ox_wide, if (wideOx) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_options, if (!card.isOx && !compact) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_expand_hint, if (!card.isOx && compact) View.VISIBLE else View.GONE)
    for ((ids, shown) in listOf(oxIds to inlineOx, wideOxIds to wideOx)) ids.forEachIndexed { i, id ->
      val option = card.options.getOrNull(i)
      v.setViewVisibility(id, if (shown && option != null) View.VISIBLE else View.GONE)
      if (option != null && shown) {
        v.setTextViewText(id, shortLabel(card, option)); v.setOnClickPendingIntent(id, answer(context, card, option))
        v.setContentDescription(id, option.text)
      }
    }
    optionIds.forEachIndexed { i, id ->
      val option = card.options.getOrNull(i)
      v.setViewVisibility(id, if (!card.isOx && option != null) View.VISIBLE else View.GONE)
      if (option != null && !card.isOx) { v.setTextViewText(id, option.text); v.setOnClickPendingIntent(id, answer(context, card, option)) }
    }
  }

  private fun bindResult(context: Context, v: RemoteViews, card: GapCard, a: GapAnswer, compact: Boolean) {
    v.setTextViewText(R.id.gap_result_title, resultTitle(card, a))
    v.setTextColor(R.id.gap_result_title, verdictColor(a))
    // Collapsed: verdict and note share two lines; expanded: verdict above, note below.
    v.setViewVisibility(R.id.gap_result_title, if (compact) View.GONE else View.VISIBLE)
    v.setTextViewText(
      R.id.gap_result_feedback,
      if (compact) verdictLine(resultTitle(card, a), collapsedNote(resultTitle(card, a), card), verdictColor(a)) else card.feedback,
    )
    v.setInt(R.id.gap_result_feedback, "setMaxLines", if (compact) 2 else 4)
    v.setTextViewTextSize(R.id.gap_result_feedback, TypedValue.COMPLEX_UNIT_SP, if (compact) 13f else 15f)
    v.setViewVisibility(R.id.gap_next, if (compact) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.gap_next_wide, if (compact) View.GONE else View.VISIBLE)
    v.setOnClickPendingIntent(if (compact) R.id.gap_next else R.id.gap_next_wide, next(context, card))
  }

  /**
   * A bigger widget can ask every shape a smaller one can, plus its own, and rotates through
   * them card by card: small O/X; default adds "which term is this?" in a 2x2 grid; large adds
   * the longer authored choice and lists options in rows.
   */
  private enum class WidgetSize(val shapes: List<String>) {
    SMALL(listOf("ox")), MEDIUM(listOf("term", "ox")), LARGE(listOf("term", "choice", "ox"))
  }
  private fun shapeFor(card: GapCard, size: WidgetSize, position: Int): GapCard {
    val keys = size.shapes.filter { it in card.variants }
    return if (keys.isEmpty()) card else card.variant(keys[position % keys.size])
  }
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
    // Widget text follows the system font size but the cell does not grow. With large text the
    // layout stays, the question shapes step down one size (O/X in a medium widget) and the
    // explanation gets fewer lines, so the question and its buttons stay inside.
    val big = context.resources.configuration.fontScale >= 1.3f
    val shapeSize = if (!big) size else when (size) { WidgetSize.LARGE -> WidgetSize.MEDIUM; else -> WidgetSize.SMALL }
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
    // Launchers reapply onto the same views; reset what the result state recolours.
    v.setTextColor(R.id.gap_widget_prompt, INK)
    v.setContentDescription(R.id.gap_widget_prompt, null)
    when (view) {
      is GapView.Hidden -> {
        if (!small) v.setTextViewText(R.id.gap_widget_area, "틈지식")
        v.setTextViewText(R.id.gap_widget_prompt, "앱을 한 번 열면 여기에 문제가 놓여요.")
        showOnly(null)
      }
      is GapView.Question -> {
        val shape = shapeFor(view.card, shapeSize, view.position)
        if (!small) v.setTextViewText(R.id.gap_widget_area, areaLabel(view.card))
        v.setTextViewText(R.id.gap_widget_prompt, shape.prompt)
        v.setContentDescription(R.id.gap_widget_prompt, if (view.card.isAi) "AI가 만든 카드. ${shape.prompt}" else shape.prompt)
        val buttons = when {
          shape.isOx -> { showOnly(R.id.gap_widget_ox); intArrayOf(R.id.gap_widget_o, R.id.gap_widget_x) }
          small -> { showOnly(null); intArrayOf() } // No O/X variant: tapping opens the app.
          shapeSize == WidgetSize.MEDIUM && shape.options.size == 4 -> { showOnly(R.id.gap_widget_grid); cellIds }
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
        if (!small) v.setTextViewText(R.id.gap_widget_area, areaLabel(view.card))
        v.setTextViewText(R.id.gap_widget_prompt, resultTitle(view.shown, view.answer))
        v.setTextColor(R.id.gap_widget_prompt, verdictColor(view.answer))
        v.setTextViewText(R.id.gap_widget_feedback, view.shown.feedback)
        val feedbackLines = when (size) { WidgetSize.SMALL -> 1; WidgetSize.MEDIUM -> if (big) 1 else 4; WidgetSize.LARGE -> if (big) 3 else 8 }
        v.setInt(R.id.gap_widget_feedback, "setMaxLines", feedbackLines)
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
