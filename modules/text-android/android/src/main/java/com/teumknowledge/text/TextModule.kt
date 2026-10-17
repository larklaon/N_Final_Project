package com.teumknowledge.text

import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.widget.EditText
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Turns a React Native TextInput into reading text: selecting keeps working, but the
 * menu offers "AI에게 물어보기" and copy instead of cut and paste.
 */
class TextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextAndroid")
    Events("onAsk")

    AsyncFunction("readOnly") { tag: Int, label: String ->
      val view = appContext.findView<EditText>(tag) ?: return@AsyncFunction false
      view.customSelectionActionModeCallback = object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
          menu.add(Menu.NONE, ASK, 0, label).setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
          return true
        }
        // The editor adds its items after creation; drop the editing ones every time.
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
          for (id in editing) menu.removeItem(id)
          return true
        }
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
          if (item.itemId != ASK) return false
          val start = minOf(view.selectionStart, view.selectionEnd).coerceAtLeast(0)
          val end = maxOf(view.selectionStart, view.selectionEnd).coerceAtLeast(0)
          sendEvent("onAsk", mapOf("tag" to tag, "text" to view.text.substring(start, end).trim()))
          mode.finish()
          return true
        }
        override fun onDestroyActionMode(mode: ActionMode) = Unit
      }
      // A tap places a caret; read-only text has nothing to paste there.
      view.customInsertionActionModeCallback = object : ActionMode.Callback {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu) = false
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu) = false
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem) = false
        override fun onDestroyActionMode(mode: ActionMode) = Unit
      }
      true
    }.runOnQueue(Queues.MAIN)
  }

  companion object {
    private const val ASK = 0x7e57
    private val editing = intArrayOf(
      android.R.id.cut, android.R.id.paste, android.R.id.pasteAsPlainText,
      android.R.id.replaceText, android.R.id.autofill,
    )
  }
}
