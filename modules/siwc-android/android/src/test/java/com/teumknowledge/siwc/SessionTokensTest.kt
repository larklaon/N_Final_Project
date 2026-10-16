package com.teumknowledge.siwc

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SessionTokensTest {
 private val now=1_800_000_000_000L
 private fun credential()=JSONObject().put("client_id","issued-fixture").put("subject","subject-fixture")
   .put("access_token","fixture-old-access").put("refresh_token","fixture-old-refresh").put("id_token","fixture-id")
   .put("scope",Protocol.SCOPES).put("expires_at",now+30_000)
 @Test fun terminalRefreshErrorsClearOnlySelectedTokens() {
   val server=MockWebServer();server.start()
   try {
     val client=OAuthTokenClient(OkHttpClient(),server.url("/token").toString())
     for(code in listOf("invalid_grant","invalid_refresh_token","token_expired","refresh_token_expired","refresh_token_invalidated","refresh_token_reused")) {
       val selected=credential();val other=credential();val untouched=other.toString();var writes=0
       server.enqueue(MockResponse().setResponseCode(400).setBody("{\"error\":\"$code\"}"))
       val error=assertThrows(IllegalStateException::class.java) { SessionTokens.access(selected,client::request,{writes++},now) }
       assertEquals("reconnect_required",error.message);assertEquals(1,writes)
       assertTrue(SessionTokens.requiresReconnect(selected,now))
       assertFalse(selected.has("access_token"));assertFalse(selected.has("refresh_token"));assertFalse(selected.has("id_token"))
       assertEquals("issued-fixture",selected.getString("client_id"));assertEquals("subject-fixture",selected.getString("subject"))
       assertEquals(untouched,other.toString())
       val fields=server.takeRequest().body.readUtf8();assertTrue(fields.contains("grant_type=refresh_token"));assertFalse(fields.contains("scope="))
     }
   } finally {server.shutdown()}
 }
 @Test fun transientAndInvalidClientErrorsKeepCredentials() {
   for(failure in listOf<Exception>(OAuthTokenError("temporarily_unavailable",503),OAuthTokenError("invalid_client",400),java.io.IOException("offline"))) {
     val c=credential();val before=c.toString();var writes=0
     assertThrows(Exception::class.java) {SessionTokens.access(c,{throw failure},{writes++},now)}
     assertEquals(before,c.toString());assertEquals(0,writes)
   }
 }
 @Test fun expiredWithoutRefreshRequiresReconnectWithoutNetwork() {
   val c=credential().apply {remove("refresh_token")};var writes=0
   assertTrue(SessionTokens.requiresReconnect(c,now))
   assertThrows(IllegalStateException::class.java) {SessionTokens.access(c,{error("must_not_request")},{writes++},now)}
   assertEquals(1,writes);assertFalse(c.has("access_token"));assertFalse(c.has("id_token"))
 }
 @Test fun rotatedTokensArePersistedTogetherAndOmittedScopeRetainsGrant() {
   val c=credential();var saved:JSONObject?=null
   val access=SessionTokens.access(c,{JSONObject().put("access_token","fixture-new-access").put("refresh_token","fixture-new-refresh").put("expires_in",3600)},{saved=JSONObject(c.toString())},now)
   assertEquals("fixture-new-access",access);assertEquals("fixture-new-refresh",saved!!.getString("refresh_token"))
   assertEquals(Protocol.SCOPES,saved!!.getString("scope"));assertEquals(now+3_600_000,saved!!.getLong("expires_at"))
 }
 @Test fun missingPlanPermissionNeverStartsRefresh() {
   val c=credential().put("scope","openid profile email").put("expires_at",now+120_000)
   val error=assertThrows(IllegalArgumentException::class.java) {SessionTokens.access(c,{error("must_not_request")},{error("must_not_write")},now)}
   assertEquals("plan_permission_missing",error.message)
 }
}
