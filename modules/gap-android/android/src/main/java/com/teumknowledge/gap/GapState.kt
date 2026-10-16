package com.teumknowledge.gap

import org.json.JSONArray
import org.json.JSONObject

data class GapOption(val id: String, val text: String)
data class GapCard(
  val cardId: String,
  val learnerId: String,
  val questionId: String,
  val conceptTitle: String,
  val area: String,
  val type: String,
  val prompt: String,
  val options: List<GapOption>,
  val correctOptionId: String,
  val feedback: String,
  /** Same piece in other shapes ("ox", "term"); the widget picks one by its size. */
  val variants: Map<String, GapCard> = emptyMap(),
) {
  val isOx get() = type == "ox"
  fun option(id: String) = options.firstOrNull { it.id == id }
  fun variant(key: String) = variants[key] ?: this
  /** The card itself or the variant with this question id. */
  fun shape(questionId: String?) =
    if (questionId.isNullOrEmpty() || questionId == this.questionId) this
    else variants.values.firstOrNull { it.questionId == questionId }
}
data class GapAnswer(val selected: String, val correct: Boolean)

/** What a surface should draw right now. */
sealed class GapView {
  object Hidden : GapView()
  data class Question(val card: GapCard) : GapView()
  /** [shown] is the shape that was answered: the card, or a widget variant of it. */
  data class Result(val card: GapCard, val answer: GapAnswer, val shown: GapCard = card) : GapView()
}

/**
 * The whole native card state as one JSON record: the config JS last sent, which card is
 * showing, and answers waiting for the app to ingest. Pure logic, no Android types.
 */
class GapState(val root: JSONObject = JSONObject()) {
  private val deck: List<GapCard> get() {
    val a = root.optJSONArray("deck") ?: JSONArray()
    return (0 until a.length()).mapNotNull { runCatching { parseCard(a.getJSONObject(it)) }.getOrNull() }
  }
  val enabled get() = root.optBoolean("enabled", false)
  val learnerId get() = root.optString("learnerId")
  val intervalMinutes get() = root.optInt("intervalMinutes", 30).coerceIn(15, 24 * 60)
  private val index get() = root.optInt("index", 0)
  private val answer: GapAnswer? get() = root.optJSONObject("answer")?.let {
    GapAnswer(it.getString("selected"), it.getBoolean("correct"))
  }

  fun inWindow(minuteOfDay: Int): Boolean {
    fun parse(s: String, fallback: Int) = Regex("^(\\d{2}):(\\d{2})$").find(s)?.destructured
      ?.let { (h, m) -> h.toInt() * 60 + m.toInt() } ?: fallback
    val start = parse(root.optString("start"), 7 * 60)
    val end = parse(root.optString("end"), 22 * 60)
    return minuteOfDay in start until end
  }

  fun current(): GapCard? = deck.getOrNull(index)

  /** The widget follows the deck whenever it has cards; the lock-screen card also needs `enabled` and the window. */
  fun view(forNotification: Boolean, minuteOfDay: Int): GapView {
    val card = current() ?: return GapView.Hidden
    if (forNotification && (!enabled || !inWindow(minuteOfDay) || root.optString("dismissed") == card.cardId))
      return GapView.Hidden
    val answered = root.optJSONObject("answer")?.optString("questionId")
    return answer?.let { GapView.Result(card, it, card.shape(answered) ?: card) } ?: GapView.Question(card)
  }

  /** Replace config from JS. Pending events survive; display restarts at the new deck's first card. */
  fun configure(config: JSONObject, now: Long) {
    for (key in listOf("enabled", "learnerId", "intervalMinutes", "start", "end", "deck"))
      root.put(key, config.opt(key) ?: JSONObject.NULL)
    root.put("index", 0)
    root.remove("answer")
    root.remove("dismissed")
    root.put("correctIds", JSONArray())
    root.put("shownAt", now)
  }

  /**
   * Record one answer for the showing card, in whichever shape it was asked ([questionId]
   * names a widget variant). Repeated taps and stale buttons are ignored.
   */
  fun answer(cardId: String, optionId: String, now: Long, newId: () -> String, questionId: String? = null): GapAnswer? {
    val card = current() ?: return null
    if (card.cardId != cardId || answer != null) return null
    val shape = card.shape(questionId) ?: return null
    shape.option(optionId) ?: return null
    val result = GapAnswer(optionId, optionId == shape.correctOptionId)
    root.put("answer", JSONObject().put("selected", optionId).put("correct", result.correct).put("questionId", shape.questionId))
    // The card is done for this pass whichever shape was answered.
    if (result.correct) root.put("correctIds", correctIds().put(card.questionId))
    events().put(
      JSONObject().put("id", newId()).put("learnerId", card.learnerId)
        .put("questionId", shape.questionId).put("selectedOptionId", optionId).put("answeredAt", now),
    )
    return result
  }

  /** Next card, skipping ones already answered correctly since the deck arrived. */
  fun advance(now: Long) {
    if (deck.isEmpty()) return
    val done = correctIds().let { a -> (0 until a.length()).map { a.getString(it) }.toSet() }
    var next = index
    for (step in 1..deck.size) {
      val i = (index + step) % deck.size
      if (deck[i].questionId !in done) { next = i; break }
      if (step == deck.size) { root.put("correctIds", JSONArray()); next = (index + 1) % deck.size }
    }
    root.put("index", next)
    root.remove("answer")
    root.remove("dismissed")
    root.put("shownAt", now)
  }

  /** Called by the periodic alarm: rotate once the interval has passed. */
  fun rotateIfDue(now: Long): Boolean {
    if (now - root.optLong("shownAt", 0) < intervalMinutes * 60_000L) return false
    advance(now)
    return true
  }

  /** A swiped-away card stays away until the next rotation; the widget is unaffected. */
  fun dismiss(cardId: String) { if (current()?.cardId == cardId) root.put("dismissed", cardId) }

  fun events(): JSONArray = root.optJSONArray("events") ?: JSONArray().also { root.put("events", it) }

  fun ack(ids: Set<String>) {
    val kept = JSONArray()
    val all = events()
    for (i in 0 until all.length()) if (all.getJSONObject(i).optString("id") !in ids) kept.put(all.getJSONObject(i))
    root.put("events", kept)
  }

  private fun correctIds(): JSONArray = root.optJSONArray("correctIds") ?: JSONArray().also { root.put("correctIds", it) }

  companion object {
    fun parseCard(o: JSONObject): GapCard {
      val card = parseShape(o, o)
      val v = o.optJSONObject("variants") ?: return card
      val variants = v.keys().asSequence().mapNotNull { key ->
        v.optJSONObject(key)?.let { x -> runCatching { key to parseShape(x, o) }.getOrNull() }
      }.toMap()
      return card.copy(variants = variants)
    }
    /** A variant shares the card's identity and piece; only the question differs. */
    private fun parseShape(o: JSONObject, card: JSONObject): GapCard {
      val opts = o.getJSONArray("options")
      val options = (0 until opts.length()).map { opts.getJSONObject(it).let { x -> GapOption(x.getString("id"), x.getString("text")) } }
      require(options.size in 2..4)
      return GapCard(
        card.getString("cardId"), card.getString("learnerId"), o.getString("questionId"), card.optString("conceptTitle"),
        card.optString("area"), o.optString("type", "choice"), o.getString("prompt"), options,
        o.getString("correctOptionId"), o.optString("feedback"),
      )
    }
  }
}
