package com.teumknowledge.siwc

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class MemoryStore(var record: JSONObject = JSONObject()) : CredentialStore {
 override fun load() = JSONObject(record.toString())
 override fun save(record: JSONObject) { this.record=JSONObject(record.toString()) }
 override fun erase() { record=JSONObject() }
}

class SessionRegistryTest {
 private val now=1_800_000_000_000L
 private fun store(expiresAt: Long=now+30_000, refresh: String?="fixture-old-refresh"): MemoryStore {
   val c=JSONObject().put("client_id","issued-fixture").put("subject","subject-fixture").put("access_token","fixture-old-access")
     .put("id_token","fixture-id").put("scope",Protocol.SCOPES).put("expires_at",expiresAt)
   refresh?.let { c.put("refresh_token",it) }
   return MemoryStore(JSONObject().put("active","a").put("profiles",JSONObject().put("a",c)))
 }
 private fun rotated(n: Int)=JSONObject().put("access_token","fixture-access-$n").put("refresh_token","fixture-refresh-$n").put("expires_in",3600)
 private fun stored(s: MemoryStore)=s.record.getJSONObject("profiles").getJSONObject("a")

 @Test fun concurrentAccessRefreshesOnce() {
   val s=store();val registry=SessionRegistry(s) { now };val requests=AtomicInteger();val entered=CountDownLatch(1);val release=CountDownLatch(1)
   val pool=Executors.newFixedThreadPool(2)
   try {
     val first=pool.submit<CredentialLease> { registry.access("a",{ _,_ -> entered.countDown();release.await(5,TimeUnit.SECONDS);rotated(requests.incrementAndGet()) }) }
     assertTrue(entered.await(5,TimeUnit.SECONDS))
     val second=pool.submit<CredentialLease> { registry.access("a",{ _,_ -> rotated(requests.incrementAndGet()) }) }
     release.countDown()
     assertEquals("fixture-access-1",first.get(5,TimeUnit.SECONDS).accessToken)
     assertEquals("fixture-access-1",second.get(5,TimeUnit.SECONDS).accessToken)
     assertEquals(1,requests.get());assertEquals("fixture-refresh-1",stored(s).getString("refresh_token"))
   } finally { pool.shutdownNow() }
 }
 @Test fun rotatedGrantSurvivesInvalidationDuringRefresh() {
   val s=store();val registry=SessionRegistry(s) { now }
   val error=assertThrows(IllegalArgumentException::class.java) {
     registry.access("a",{ _,_ -> registry.invalidate();rotated(1) })
   }
   assertEquals("stale_session",error.message)
   // The server already rotated the grant; losing it would force refresh_token_reused next time.
   assertEquals("fixture-refresh-1",stored(s).getString("refresh_token"))
 }
 @Test fun refreshResultIsDroppedAfterSignOut() {
   val s=store();val registry=SessionRegistry(s) { now }
   assertThrows(IllegalArgumentException::class.java) { registry.access("a",{ _,_ -> registry.clear("a");rotated(1) }) }
   assertFalse(stored(s).has("access_token"));assertFalse(stored(s).has("refresh_token"))
   assertEquals("issued-fixture",stored(s).getString("client_id"))
 }
 @Test fun rejectedLeaseForcesRefreshButNotWhenAlreadyRotated() {
   val s=store(expiresAt=now+3_600_000);val registry=SessionRegistry(s) { now };val requests=AtomicInteger()
   val lease=registry.access("a",{ _,_ -> error("must_not_request") })
   val renewed=registry.access("a",{ _,_ -> rotated(requests.incrementAndGet()) },rejected=lease)
   assertEquals("fixture-access-1",renewed.accessToken)
   // A second caller rejected with the old token reuses the already rotated one.
   assertEquals("fixture-access-1",registry.access("a",{ _,_ -> error("must_not_request") },rejected=lease).accessToken)
   assertEquals(1,requests.get())
 }
 @Test fun rejectedLeaseWithoutRefreshGrantKeepsCredential() {
   val s=store(expiresAt=now+3_600_000,refresh=null);val registry=SessionRegistry(s) { now };val before=s.record.toString()
   val lease=registry.access("a",{ _,_ -> error("must_not_request") })
   val error=assertThrows(IllegalArgumentException::class.java) { registry.access("a",{ _,_ -> error("must_not_request") },rejected=lease) }
   assertEquals("connection_check_required",error.message);assertEquals(before,s.record.toString())
 }
 @Test fun bookkeepingUpdateKeepsLeasesValid() {
   val registry=SessionRegistry(store(expiresAt=now+3_600_000)) { now }
   val lease=registry.access("a",{ _,_ -> error("must_not_request") })
   registry.update(invalidating=false) { it.put("host","urn:uuid:fixture") }
   assertTrue(registry.isCurrent(lease))
   registry.update { it.put("active","a") }
   assertFalse(registry.isCurrent(lease))
 }
 @Test fun attemptRunsOnceAndStaleFinishCannotStopReplacement() {
   val slot=AttemptSlot<String>(Any())
   assertTrue(slot.start("one","first"));assertFalse(slot.start("two","second"))
   assertEquals("first",slot.claim("one"));assertNull(slot.claim("one"))
   assertTrue(slot.finish("one") {});assertTrue(slot.start("two","second"))
   assertFalse(slot.finish("one") { fail("stale cleanup") })
   assertTrue(slot.isCurrent("two"))
 }
}
