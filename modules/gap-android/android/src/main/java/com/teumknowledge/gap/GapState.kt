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
  /** Same piece in other shapes ("ox", "choice", "term"); the widget picks one by its size. */
  val variants: Map<String, GapCard> = emptyMap(),
  /** Wording that fits the collapsed lock-screen card; empty when the prompt already fits. */
  val short: String = "",
  /** V4: "ai" for an AI-made card; it is labelled and skipped once [expiresAt] passes. */
  val origin: String = "",
  val expiresAt: Long = 0,
) {
  val isAi get() = origin == "ai"
  fun expired(now: Long) = expiresAt > 0 && now >= expiresAt
  val collapsedPrompt get() = short.ifEmpty { prompt }
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
  /** [position] is the card's place in the deck; the widget rotates shapes with it. */
  data class Question(val card: GapCard, val position: Int = 0) : GapView()
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

  /**
   * An unanswered expired AI card gives way to the next live card. Answered ones keep their
   * result until "다음". If nothing live is left the deck shows nothing until the app rebuilds it.
   */
  fun skipExpired(now: Long): Boolean {
    val cards = deck
    val card = cards.getOrNull(index) ?: return false
    if (!card.expired(now) || root.has("answer") || root.has("held")) return false
    for (step in 1..cards.size) {
      val i = (index + step) % cards.size
      if (!cards[i].expired(now)) {
        root.put("index", i); root.remove("dismissed"); root.put("shownAt", now)
        return true
      }
    }
    root.put("deck", JSONArray()); root.put("index", 0)
    return true
  }

  /** A result the learner was reading when a new deck arrived. It stays until "다음". */
  private val held: Pair<GapCard, JSONObject>? get() = root.optJSONObject("held")?.let { h ->
    runCatching { parseCard(h.getJSONObject("card")) to h.getJSONObject("answer") }.getOrNull()
  }

  /** The card on screen: a held result, otherwise the deck's current card. */
  fun showingId(): String? = held?.first?.cardId ?: current()?.cardId

  /** The widget follows the deck whenever it has cards; the lock-screen card also needs `enabled` and the window. */
  fun view(forNotification: Boolean, minuteOfDay: Int): GapView {
    val card = held?.first ?: current() ?: return GapView.Hidden
    if (forNotification && (!enabled || !inWindow(minuteOfDay) || root.optString("dismissed") == card.cardId))
      return GapView.Hidden
    held?.let { (_, a) ->
      return GapView.Result(card, GapAnswer(a.getString("selected"), a.getBoolean("correct")), card.shape(a.optString("questionId")) ?: card)
    }
    val answered = root.optJSONObject("answer")?.optString("questionId")
    return answer?.let { GapView.Result(card, it, card.shape(answered) ?: card) } ?: GapView.Question(card, index)
  }

  /**
   * Replace config from JS. Pending events survive; display restarts at the new deck's first card,
   * except that a result on screen for the same learner is held until the learner moves on.
   */
  fun configure(config: JSONObject, now: Long) {
    val sameLearner = { o: JSONObject -> o.optString("learnerId") == config.optString("learnerId") }
    val keep = root.optJSONObject("answer")?.let { a ->
      root.optJSONArray("deck")?.optJSONObject(index)?.takeIf(sameLearner)?.let { c ->
        JSONObject().put("card", c).put("answer", a)
      }
    } ?: root.optJSONObject("held")?.takeIf { h -> h.optJSONObject("card")?.let(sameLearner) == true }
    for (key in listOf("enabled", "learnerId", "intervalMinutes", "start", "end", "deck"))
      root.put(key, config.opt(key) ?: JSONObject.NULL)
    root.put("index", 0)
    root.remove("answer")
    root.remove("dismissed")
    if (keep != null) root.put("held", keep) else root.remove("held")
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
    if (root.has("held")) {
      // Leaving a held result shows the new deck from its start.
      root.remove("held"); root.remove("dismissed"); root.put("shownAt", now)
      return
    }
    if (deck.isEmpty()) return
    val done = correctIds().let { a -> (0 until a.length()).map { a.getString(it) }.toSet() }
    var next = index
    for (step in 1..deck.size) {
      val i = (index + step) % deck.size
      if (deck[i].questionId !in done && !deck[i].expired(now)) { next = i; break }
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
  fun dismiss(cardId: String) {
    if (held?.first?.cardId == cardId) {
      root.remove("held")
      current()?.let { root.put("dismissed", it.cardId) }
    } else if (current()?.cardId == cardId) root.put("dismissed", cardId)
  }

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
      val meta = card.copy(short = o.optString("short"), origin = o.optString("origin"), expiresAt = o.optLong("expiresAt", 0))
      val v = o.optJSONObject("variants") ?: return meta
      val variants = v.keys().asSequence().mapNotNull { key ->
        v.optJSONObject(key)?.let { x -> runCatching { key to parseShape(x, o) }.getOrNull() }
      }.toMap()
      return meta.copy(variants = variants)
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
