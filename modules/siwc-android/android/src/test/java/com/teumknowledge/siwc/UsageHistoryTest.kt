package com.teumknowledge.siwc

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class UsageHistoryTest {
 private val now=Instant.parse("2026-10-16T12:00:00Z").toEpochMilli()
 private val zone=ZoneId.of("Asia/Seoul")
 @Test fun duplicateCompletionAndOtherProfilesDoNotInflateUsage() {
   val h=UsageHistory()
   val tokens=JSONObject().put("input_tokens",100).put("output_tokens",25)
   h.record("r1","a",now,tokens);h.record("r1","a",now,tokens);h.record("r2","b",now,tokens)
   assertEquals(1,h.summary("a",now,zone)["completed"])
   assertEquals(100L,h.summary("a",now,zone)["inputTokens"])
   assertEquals(0,h.summary("c",now,zone)["completed"])
 }
 @Test fun absentAndMalformedCountsRemainUnknown() {
   val h=UsageHistory()
   h.record("a","p",now,null)
   h.record("b","p",now,JSONObject().put("input_tokens",-1).put("output_tokens",2))
   h.record("c","p",now,JSONObject().put("input_tokens",0).put("output_tokens",0))
   assertEquals(3,h.summary("p",now,zone)["completed"])
   assertEquals(1,h.summary("p",now,zone)["measured"])
 }
 @Test fun calendarWindowSurvivesPersistenceAndExcludesFutureEntries() {
   val h=UsageHistory();val day=86_400_000L
   h.record("old","p",now-31*day,null);h.record("yesterday","p",now-day,null)
   h.record("today","p",now,null);h.record("future","p",now+day,null)
   val restored=UsageHistory(h.retained(now)).summary("p",now,zone)
   assertEquals(2,restored["completed"]);assertEquals(1,restored["todayCompleted"])
 }
 @Test fun onlyCompletedStreamsRecordUsageOnce() {
   var calls=0
   val acc=ResponseAccumulator(onUsage={ u -> calls++;assertEquals(12,u!!.getInt("input_tokens")) }) { _,_-> }
   acc.frame("""{"type":"response.output_text.delta","delta":"hello"}""")
   assertEquals(0,calls)
   val end="""{"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":2}}}"""
   acc.frame(end);acc.frame(end);assertEquals(1,calls)
   val failed=ResponseAccumulator(onUsage={calls++}) { _,_-> }
   failed.frame("""{"type":"response.failed","response":{"error":{"code":"usage_limit"}}}""")
   assertEquals(1,calls)
 }
}
