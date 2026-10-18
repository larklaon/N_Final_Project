package com.teumknowledge.gap

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GapStateTest {
  private val now = 1_800_000_000_000L
  private fun card(i: Int, type: String = "ox") = JSONObject().put("cardId", "c$i").put("learnerId", "learner")
    .put("questionId", "q$i").put("conceptTitle", "개념$i").put("area", "영역").put("type", type).put("prompt", "문제$i")
    .put("options", JSONArray().put(JSONObject().put("id", "o").put("text", "맞아요 (O)")).put(JSONObject().put("id", "x").put("text", "아니에요 (X)")))
    .put("correctOptionId", "o").put("feedback", "한 줄 해설")
  private fun config(n: Int, enabled: Boolean = true) = JSONObject().put("enabled", enabled).put("learnerId", "learner")
    .put("intervalMinutes", 30).put("start", "07:00").put("end", "22:00")
    .put("deck", JSONArray().apply { (0 until n).forEach { put(card(it)) } })
  private fun state(n: Int = 3, enabled: Boolean = true) = GapState().apply { configure(config(n, enabled), now) }
  private var ids = 0
  private val newId = { "event-${++ids}" }

  @Test fun showsFirstCardOnlyInsideWindowAndWhenEnabled() {
    val s = state()
    assertTrue(s.view(true, 9 * 60) is GapView.Question)
    assertEquals(GapView.Hidden, s.view(true, 22 * 60))
    assertEquals(GapView.Hidden, s.view(true, 6 * 60 + 59))
    // The widget is user-placed: it ignores the toggle and the window.
    assertTrue(state(enabled = false).view(false, 23 * 60) is GapView.Question)
    assertEquals(GapView.Hidden, state(enabled = false).view(true, 9 * 60))
  }

  @Test fun answeringRecordsOneEventAndShowsResult() {
    val s = state()
    assertEquals(GapAnswer("x", false), s.answer("c0", "x", now, newId))
    // Double taps and stale buttons from an older card are ignored.
    assertNull(s.answer("c0", "o", now, newId))
    assertNull(s.answer("c1", "o", now, newId))
    assertNull(s.answer("c0", "nope", now, newId))
    assertEquals(1, s.events().length())
    val e = s.events().getJSONObject(0)
    assertEquals(listOf("event-1", "learner", "q0", "x", now), listOf(e.get("id"), e.get("learnerId"), e.get("questionId"), e.get("selectedOptionId"), e.get("answeredAt")))
    val v = s.view(true, 9 * 60) as GapView.Result
    assertFalse(v.answer.correct)
    assertEquals("정답은 O", GapSurfaces.resultTitle(v.card, v.answer))
  }

  @Test fun advanceSkipsCardsAnsweredCorrectlyAndWrapsWhenAllDone() {
    val s = state(3)
    s.answer("c0", "o", now, newId); s.advance(now)
    s.answer("c1", "o", now, newId); s.advance(now)
    assertEquals("c2", s.current()!!.cardId)
    s.answer("c2", "x", now, newId); s.advance(now)
    // c0 and c1 were right; only c2 (wrong) remains in this pass.
    assertEquals("c2", s.current()!!.cardId)
    s.answer("c2", "o", now, newId); s.advance(now)
    assertEquals("c0", s.current()!!.cardId)
  }

  @Test fun rotationWaitsForTheInterval() {
    val s = state(3)
    assertFalse(s.rotateIfDue(now + 29 * 60_000L))
    assertTrue(s.rotateIfDue(now + 30 * 60_000L))
    assertEquals("c1", s.current()!!.cardId)
  }

  @Test fun dismissedCardStaysAwayUntilNextCardButWidgetKeepsIt() {
    val s = state(3)
    s.dismiss("c0")
    assertEquals(GapView.Hidden, s.view(true, 9 * 60))
    assertTrue(s.view(false, 9 * 60) is GapView.Question)
    s.advance(now)
    assertTrue(s.view(true, 9 * 60) is GapView.Question)
  }

  @Test fun reconfigureKeepsPendingEventsAndAckRemovesOnlyAcknowledged() {
    val s = state(2)
    s.answer("c0", "o", now, newId); s.advance(now); s.answer("c1", "x", now, newId)
    s.configure(config(5), now)
    assertEquals(2, s.events().length())
    assertEquals("c0", s.current()!!.cardId)
    // c1's result was on screen, so it stays until "다음"; then the new deck starts.
    assertEquals("c1", (s.view(true, 9 * 60) as GapView.Result).card.cardId)
    s.advance(now)
    assertTrue(s.view(true, 9 * 60) is GapView.Question)
    s.ack(setOf("event-1", "unknown"))
    assertEquals(listOf("event-2"), (0 until s.events().length()).map { s.events().getJSONObject(it).getString("id") })
  }

  @Test fun emptyOrMalformedDeckShowsNothing() {
    assertEquals(GapView.Hidden, state(0).view(false, 9 * 60))
    val bad = GapState().apply {
      configure(config(0).put("deck", JSONArray().put(JSONObject().put("cardId", "broken"))), now)
    }
    assertNull(bad.current())
    bad.advance(now)
    assertNull(bad.answer("broken", "o", now, newId))
  }

  @Test fun persistedStateRoundTrips() {
    val s = state(2)
    s.answer("c0", "o", now, newId)
    val restored = GapState(JSONObject(s.root.toString()))
    assertTrue(restored.view(true, 9 * 60) is GapView.Result)
    assertEquals(1, restored.events().length())
  }

  @Test fun widgetVariantAnswerRecordsItsOwnQuestionAndShowsOnBothSurfaces() {
    val term = JSONObject().put("questionId", "q0~term").put("type", "choice").put("prompt", "이것은 …")
      .put("options", JSONArray().apply { listOf("a", "b", "c", "d").forEach { put(JSONObject().put("id", it).put("text", "용어$it")) } })
      .put("correctOptionId", "c").put("feedback", "용어 해설")
    val deck = JSONArray().put(card(0).put("variants", JSONObject().put("term", term))).put(card(1))
    val s = GapState().apply { configure(config(0).put("deck", deck), now) }
    val c = s.current()!!
    assertEquals(4, c.variant("term").options.size)
    assertEquals("c0", c.variant("term").cardId)
    assertSame(c, c.variant("ox"))
    // An option id from the term question is not valid for the O/X card, and vice versa.
    assertNull(s.answer("c0", "c", now, newId))
    assertEquals(GapAnswer("a", false), s.answer("c0", "a", now, newId, "q0~term"))
    assertEquals("q0~term", s.events().getJSONObject(0).getString("questionId"))
    val v = s.view(true, 9 * 60) as GapView.Result
    assertEquals("q0~term", v.shown.questionId)
    assertEquals("정답은 용어c", GapSurfaces.resultTitle(v.shown, v.answer))
    // Survives a round trip through the stored JSON.
    val again = GapState(JSONObject(s.root.toString())).view(false, 9 * 60) as GapView.Result
    assertEquals("용어 해설", again.shown.feedback)
  }

  @Test fun questionCarriesItsDeckPositionForWidgetRotation() {
    val s = state(3)
    assertEquals(0, (s.view(false, 9 * 60) as GapView.Question).position)
    s.advance(now)
    assertEquals(1, (s.view(false, 9 * 60) as GapView.Question).position)
  }

  @Test fun aResultOnScreenSurvivesANewDeckUntilNext() {
    val s = state(3)
    s.answer("c0", "o", now, newId)
    // The app syncs while the learner is still reading the result.
    s.configure(config(2).put("deck", JSONArray().put(card(7)).put(card(8))), now)
    val v = s.view(true, 9 * 60) as GapView.Result
    assertEquals("c0", v.card.cardId)
    assertEquals("c0", s.showingId())
    s.advance(now)
    assertEquals("c7", (s.view(true, 9 * 60) as GapView.Question).card.cardId)
    // A different learner's deck does not inherit the result.
    s.answer("c7", "o", now, newId)
    s.configure(config(1).put("learnerId", "other"), now)
    assertTrue(s.view(true, 9 * 60) is GapView.Question)
  }

  @Test fun dismissingAHeldResultKeepsTheCardAwayUntilRotation() {
    val s = state(2)
    s.answer("c0", "x", now, newId)
    s.configure(config(2), now)
    s.dismiss("c0")
    assertEquals(GapView.Hidden, s.view(true, 9 * 60))
    assertTrue(s.view(false, 9 * 60) is GapView.Question)
  }

  @Test fun collapsedCardUsesTheShortWordingWhenThereIsOne() {
    val deck = JSONArray().put(card(0).put("short", "짧은 문장")).put(card(1))
    val s = GapState().apply { configure(config(0).put("deck", deck), now) }
    assertEquals("짧은 문장", s.current()!!.collapsedPrompt)
    assertEquals("문제0", s.current()!!.prompt)
    s.advance(now)
    assertEquals("문제1", s.current()!!.collapsedPrompt)
  }

  @Test fun collapsedResultFallsBackToThePieceNameWhenTheNoteIsLong() {
    val c = GapState.parseCard(card(0).put("conceptTitle", "SQL 인젝션"))
    assertEquals("한 줄 해설", GapSurfaces.collapsedNote("맞았어요", c))
    val long = GapState.parseCard(card(0).put("conceptTitle", "SQL 인젝션")
      .put("feedback", "SQL 인젝션은 입력이 SQL 명령의 일부로 해석되어 의도와 다른 쿼리가 실행되는 문제예요."))
    assertEquals("SQL 인젝션", GapSurfaces.collapsedNote("맞았어요", long))
  }

  @Test fun aiCardsKeepTheirOriginAndExpiredOnesGiveWay() {
    val ai = card(0).put("origin", "ai").put("expiresAt", now + 60_000).put("questionId", "ai:g1")
    val deck = JSONArray().put(ai).put(card(1)).put(card(2))
    val s = GapState().apply { configure(config(0).put("deck", deck), now) }
    val c = s.current()!!
    assertTrue(c.isAi)
    assertEquals(now + 60_000, c.expiresAt)
    assertEquals("영역 · AI", GapSurfaces.areaLabel(c))
    assertFalse(s.skipExpired(now))
    // Survives the stored JSON round trip.
    assertTrue(GapState(JSONObject(s.root.toString())).current()!!.isAi)
    // Once expired and unanswered, the next live card takes its place.
    assertTrue(s.skipExpired(now + 60_000))
    assertEquals("c1", s.current()!!.cardId)
    // advance never lands on an expired card.
    s.advance(now + 61_000); s.advance(now + 62_000)
    assertEquals("c1", s.current()!!.cardId)
  }

  @Test fun anAnsweredExpiredAiCardKeepsItsResult() {
    val ai = card(0).put("origin", "ai").put("expiresAt", now + 1_000).put("questionId", "ai:g1")
    val s = GapState().apply { configure(config(0).put("deck", JSONArray().put(ai).put(card(1))), now) }
    s.answer("c0", "o", now, newId)
    assertFalse(s.skipExpired(now + 5_000))
    assertTrue(s.view(false, 9 * 60) is GapView.Result)
    assertEquals("ai:g1", s.events().getJSONObject(0).getString("questionId"))
  }
}
