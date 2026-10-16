package com.teumknowledge.siwc

import okhttp3.Call
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

interface CredentialStore {
 fun load(): JSONObject
 fun save(record: JSONObject)
 fun erase()
}
data class CredentialLease(val profileId: String, val revision: Long, val accessToken: String)

/** This lock protects local state only. Network work always runs outside it. */
class SessionRegistry(private val store: CredentialStore, private val clock: ()->Long = System::currentTimeMillis) {
 val lock=Any()
 private var revision=0L
 private val refreshLocks=ConcurrentHashMap<String,ReentrantLock>()
 private val calls=mutableMapOf<Call,String>()
 private val issues=mutableMapOf<String,String>()
 fun <T> read(block:(JSONObject)->T):T = synchronized(lock) { block(store.load()) }
 /** Credential or active-profile changes invalidate leases; bookkeeping writes (host, pending client) do not. */
 fun update(invalidating:Boolean=true, block:(JSONObject)->Unit) = synchronized(lock) {
   val record=store.load();block(record)
   // A rejected stale auth commit must not invalidate another live operation.
   if(invalidating) invalidate()
   store.save(record)
 }
 fun invalidate() = synchronized(lock) { revision++;calls.keys.toList().forEach { it.cancel() };issues.clear() }
 fun erase() = synchronized(lock) { invalidate();store.erase() }
 /** Removes tokens locally first and returns the previous credential for best-effort revocation outside the lock. */
 fun clear(id:String):JSONObject = synchronized(lock) {
   val record=store.load();val c=record.optJSONObject("profiles")?.optJSONObject(id) ?: error("unknown_profile")
   val retained=JSONObject(c.toString());invalidate();SessionTokens.clear(c);store.save(record);retained
 }
 fun isCurrent(lease:CredentialLease):Boolean = synchronized(lock) {
   revision==lease.revision && store.load().optString("active")==lease.profileId
 }
 fun track(call:Call, operation:String, valid:()->Boolean):AutoCloseable = synchronized(lock) {
   require(valid()) { "stale_session" };calls[call]=operation
   AutoCloseable { synchronized(lock) { calls.remove(call) };Unit }
 }
 fun cancelCalls(operation:String) = synchronized(lock) { calls.filterValues { it==operation }.keys.toList().forEach { it.cancel() } }
 fun issue(id:String):String? = synchronized(lock) { issues[id] }
 fun markIssue(lease:CredentialLease,message:String) = synchronized(lock) { if(isCurrent(lease)) issues[lease.profileId]=message;Unit }
 fun clearIssue(lease:CredentialLease) = synchronized(lock) { if(isCurrent(lease)) issues.remove(lease.profileId);Unit }
 fun access(
   id:String,
   request:(Map<String,String>,CredentialLease)->JSONObject,
   allowed:()->Boolean = {true},
   rejected:CredentialLease? = null,
 ):CredentialLease = refreshLocks.getOrPut(id) { ReentrantLock() }.withLock {
   val (original,working)=synchronized(lock) {
     require(allowed()) { "cancelled" }
     val record=store.load();require(record.optString("active")==id) { "inactive_profile" }
     val copy=JSONObject(record.getJSONObject("profiles").getJSONObject(id).toString())
     CredentialLease(id,revision,copy.optString("access_token")) to copy
   }
   val baseRefresh=working.optString("refresh_token")
   if(rejected!=null) {
     require(rejected.revision==original.revision) { "stale_session" }
     if(original.accessToken==rejected.accessToken) {
       // A bare 401 does not prove revocation. Without a refresh grant, retain it for explicit recovery.
       require(baseRefresh.isNotBlank()) { "connection_check_required" }
       working.put("expires_at",0)
     }
   }
   val token=SessionTokens.access(working,{fields -> request(fields,original)}, {
     // A sent refresh may already have rotated the grant server-side, so the result is kept even if the
     // lease went stale meanwhile. It is dropped only when the stored grant changed (sign-out, erase, re-auth).
     synchronized(lock) {
       val latest=store.load();val stored=latest.optJSONObject("profiles")?.optJSONObject(id)
       if(stored!=null && stored.optString("refresh_token")==baseRefresh && stored.optString("access_token")==original.accessToken) {
         latest.getJSONObject("profiles").put(id,JSONObject(working.toString()));store.save(latest)
       }
     }
   },clock())
   synchronized(lock) {
     require(isCurrent(original) && allowed()) { "stale_session" }
     CredentialLease(id,original.revision,token)
   }
 }
}

/** Identity and cleanup are checked atomically, so old attempts cannot stop a replacement. */
class AttemptSlot<T>(private val lock:Any) {
 private var id:String?=null
 private var value:T?=null
 private var started=false
 fun current():T? = synchronized(lock) { value }
 fun isCurrent(expected:String):Boolean = synchronized(lock) { id==expected }
 fun start(next:String,attempt:T):Boolean = synchronized(lock) {
   if(id!=null) false else {id=next;value=attempt;started=false;true}
 }
 fun claim(expected:String):T? = synchronized(lock) {
   if(id!=expected || started) null else {started=true;value}
 }
 fun finish(expected:String,cleanup:(T)->Unit):Boolean = synchronized(lock) {
   val current=value
   if(id!=expected || current==null) false else {
     cleanup(current);id=null;value=null;started=false;true
   }
 }
}
