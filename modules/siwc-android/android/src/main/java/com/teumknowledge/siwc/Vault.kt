package com.teumknowledge.siwc

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** All OAuth credentials stay in one encrypted, atomically replaced native record. */
class Vault(context: Context) {
 private val file = AtomicFile(File(context.noBackupFilesDir, "siwc.enc"))
 private val alias = "teum.siwc.v1"
 private fun key(): SecretKey {
   val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
   (store.getKey(alias, null) as? SecretKey)?.let { return it }
   return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
     init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
       .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
   }.generateKey()
 }
 @Synchronized fun load(): JSONObject {
   if (!file.baseFile.exists()) return JSONObject().put("profiles", JSONObject())
   val bytes = file.readFully()
   require(bytes.size > 28) { "vault_corrupt" }
   val cipher = Cipher.getInstance("AES/GCM/NoPadding")
   cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0,12)))
   return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)), Charsets.UTF_8))
 }
 @Synchronized fun save(record: JSONObject) {
   val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
   val out = file.startWrite()
   try { out.write(cipher.iv); out.write(cipher.doFinal(record.toString().toByteArray(Charsets.UTF_8))); file.finishWrite(out) }
   catch (e: Exception) { file.failWrite(out); throw e }
 }
 @Synchronized fun erase() {
   file.delete()
   KeyStore.getInstance("AndroidKeyStore").apply { load(null); if (containsAlias(alias)) deleteEntry(alias) }
 }
}
