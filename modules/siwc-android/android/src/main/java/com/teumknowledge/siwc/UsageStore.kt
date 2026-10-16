package com.teumknowledge.siwc

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException

/** Aggregate-only local history, excluded from Android backups. Corruption is surfaced, never reset. */
class UsageStore(context: Context) {
 private val file=AtomicFile(File(context.noBackupFilesDir,"siwc-usage.json"))
 private var writeFailed=false
 private fun read(): UsageHistory {
   val bytes=try { file.readFully() } catch(_: FileNotFoundException) { return UsageHistory() }
   return UsageHistory(JSONArray(String(bytes,Charsets.UTF_8)))
 }
 @Synchronized fun record(id: String, profile: String, usage: JSONObject?) {
   try {
     val now=System.currentTimeMillis()
     val history=read();history.record(id,profile,now,usage)
     val out=file.startWrite()
     try { out.write(history.retained(now).toString().toByteArray(Charsets.UTF_8));file.finishWrite(out) }
     catch(e:Exception) {file.failWrite(out);throw e}
   } catch(_:Exception) { writeFailed=true } // Accounting failure must not discard a completed AI answer.
 }
 @Synchronized fun summary(profile: String): Map<String,Any> {
   check(!writeFailed) { "usage_recording_failed" }
   return read().summary(profile,System.currentTimeMillis())
 }
 @Synchronized fun erase() {file.delete();writeFailed=false}
}
