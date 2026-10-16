package com.teumknowledge.siwc

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/** Local completed responses, never a representation of the subscription's remaining quota. */
class UsageHistory(private val entries: JSONArray = JSONArray()) {
 fun record(id: String, profile: String, at: Long, usage: JSONObject?) {
   if ((0 until entries.length()).any { entries.getJSONObject(it).getString("id") == id }) return
   val row=JSONObject().put("id",id).put("profile",profile).put("at",at)
   // Missing/invalid usage is unknown, not zero. Do not persist response text or identity details.
   fun count(key: String): Long? = (usage?.opt(key) as? Number)?.toDouble()?.let {
     if (it.isFinite() && it>=0 && it<=1_000_000_000 && it%1.0==0.0) it.toLong() else null
   }
   val input=count("input_tokens"); val output=count("output_tokens")
   if(input!=null && output!=null) row.put("input",input).put("output",output)
   entries.put(row)
 }
 fun summary(profile: String, now: Long, zone: ZoneId = ZoneId.systemDefault()): Map<String,Any> {
   val today=Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
   val start=today.minusDays(29).atStartOfDay(zone).toInstant().toEpochMilli()
   val todayStart=today.atStartOfDay(zone).toInstant().toEpochMilli()
   val rows=(0 until entries.length()).map { entries.getJSONObject(it) }
     .filter { it.getString("profile")==profile && it.getLong("at") in start..now }
   val measured=rows.filter { it.has("input") && it.has("output") }
   return mapOf("todayCompleted" to rows.count { it.getLong("at")>=todayStart },
     "completed" to rows.size, "measured" to measured.size,
     "inputTokens" to measured.sumOf { it.getLong("input") },
     "outputTokens" to measured.sumOf { it.getLong("output") })
 }
 fun retained(now: Long): JSONArray {
   val cutoff=now-35L*24*60*60*1000
   return JSONArray().also { out -> for(i in 0 until entries.length()) {
     val row=entries.getJSONObject(i); if(row.getLong("at")>=cutoff) out.put(row)
   } }
 }
}
