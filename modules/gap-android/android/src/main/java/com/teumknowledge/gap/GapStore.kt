package com.teumknowledge.gap

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File

/** One process-wide record, replaced atomically. Card text and answers are not secrets but stay out of backups. */
object GapStore {
  private val lock = Any()
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "gap-state.json"))

  private fun load(context: Context): GapState = runCatching {
    GapState(JSONObject(String(file(context).readFully(), Charsets.UTF_8)))
  }.getOrElse { GapState() }

  private fun save(context: Context, state: GapState) {
    val f = file(context)
    val out = f.startWrite()
    try { out.write(state.root.toString().toByteArray(Charsets.UTF_8)); f.finishWrite(out) }
    catch (e: Exception) { f.failWrite(out); throw e }
  }

  fun <T> read(context: Context, block: (GapState) -> T): T = synchronized(lock) { block(load(context)) }

  fun <T> update(context: Context, block: (GapState) -> T): T = synchronized(lock) {
    val state = load(context)
    val result = block(state)
    save(context, state)
    result
  }
}
