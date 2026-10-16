package com.teumknowledge.siwc

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

class ResourceAccessTest {
 private val server=MockWebServer()
 private val refreshes=AtomicInteger()
 private lateinit var store: MemoryStore
 private lateinit var registry: SessionRegistry
 private lateinit var access: ResourceAccess
 private val models="{\"models\":[{\"slug\":\"fixture-model\",\"display_name\":\"Fixture\",\"visibility\":\"list\"}]}"
 @Before fun setUp() {
   server.start()
   val c=JSONObject().put("client_id","issued-fixture").put("access_token","fixture-old-access").put("refresh_token","fixture-old-refresh")
     .put("scope",Protocol.SCOPES).put("expires_at",System.currentTimeMillis()+3_600_000)
   store=MemoryStore(JSONObject().put("active","a").put("profiles",JSONObject().put("a",c)))
   registry=SessionRegistry(store)
   access=ResourceAccess(registry,OkHttpClient(),{ _,_ ->
     JSONObject().put("access_token","fixture-access-${refreshes.incrementAndGet()}").put("refresh_token","fixture-refresh-${refreshes.get()}").put("expires_in",3600)
   },{ true },server.url("/v1").toString().removeSuffix("/"))
 }
 @After fun tearDown() { server.shutdown() }
 private fun body()="{}".toRequestBody("application/json".toMediaType())

 @Test fun modelsRetriesOnceWithRefreshedToken() {
   server.enqueue(MockResponse().setResponseCode(401).setBody("{\"error\":{\"code\":\"invalid_token\"}}"))
   server.enqueue(MockResponse().setBody(models))
   assertEquals("fixture-model",access.models("a").single()["slug"])
   assertEquals("Bearer fixture-old-access",server.takeRequest().getHeader("Authorization"))
   assertEquals("Bearer fixture-access-1",server.takeRequest().getHeader("Authorization"))
   assertEquals(1,refreshes.get());assertNull(registry.issue("a"))
 }
 @Test fun failedResponseIsNeverReplayed() {
   server.enqueue(MockResponse().setResponseCode(401).setBody("{\"error\":{\"code\":\"invalid_token\"}}"))
   val error=assertThrows(ResourceFailure::class.java) { access.response("a","op",body(),{ true }) { fail("must_not_consume") } }
   assertEquals("connection_check_required",error.message)
   assertEquals(1,server.requestCount);assertEquals(1,refreshes.get())
   // The refreshed grant is stored so an explicit user retry can succeed.
   assertEquals("fixture-access-1",store.record.getJSONObject("profiles").getJSONObject("a").getString("access_token"))
   assertNotNull(registry.issue("a"))
 }
 @Test fun usageLimitKeepsCredentialAndReportsCode() {
   server.enqueue(MockResponse().setResponseCode(429).setBody("{\"error\":{\"code\":\"rate_limit_exceeded\"}}").setHeader("x-request-id","req-fixture"))
   val error=assertThrows(ResourceFailure::class.java) { access.response("a","op",body(),{ true }) {} }
   assertEquals("usage_limit",error.message);assertEquals("req-fixture",error.requestId)
   assertEquals(0,refreshes.get());assertEquals(1,server.requestCount)
 }
 @Test fun userCancellationIsNotReportedAsConnectionIssue() {
   server.enqueue(MockResponse().setHeadersDelay(5,TimeUnit.SECONDS).setBody("data: {}\n\n"))
   val canceller=thread { Thread.sleep(300);registry.cancelCalls("op") }
   val error=assertThrows(IllegalStateException::class.java) { access.response("a","op",body(),{ true }) {} }
   canceller.join()
   assertEquals("cancelled",error.message);assertNull(registry.issue("a"))
 }
 @Test fun networkFailureIsReported() {
   server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
   assertThrows(java.io.IOException::class.java) { access.models("a") }
   assertNotNull(registry.issue("a"))
 }
 @Test fun staleOperationNeverSendsRequest() {
   val error=assertThrows(IllegalArgumentException::class.java) { access.response("a","op",body(),{ false }) {} }
   assertEquals("cancelled",error.message);assertEquals(0,server.requestCount)
 }
 @Test fun rejectedCredentialWithoutRefreshKeepsAdmissionDiagnostics() {
   store.record.getJSONObject("profiles").getJSONObject("a").remove("refresh_token")
   server.enqueue(MockResponse().setResponseCode(401).setBody("{\"detail\":\"fixture permission rejection\"}").setHeader("x-request-id","req-fixture"))
   val error=assertThrows(IllegalArgumentException::class.java) { access.response("a","op",body(),{ true }) {} }
   assertNotNull(registry.issue("a"))
   assertEquals("fixture-old-access",store.record.getJSONObject("profiles").getJSONObject("a").getString("access_token"))
   val event=responseFailureEvent("op",error)
   assertEquals(401,event["httpStatus"]);assertEquals("detail",event["bodyShape"]);assertEquals("req-fixture",event["serverRequestId"])
   assertEquals(0,refreshes.get());assertEquals(1,server.requestCount)
 }
 @Test fun permissionErrorPreservesSafeStructuredFieldsWithoutRawBody() {
   val failure=ResourceFailure.parse(403,"{\"error\":{\"code\":\"subscription_sharing_user_not_eligible\",\"param\":\"model\",\"message\":\"sensitive-fixture-text\"}}","req-safe")
   val event=responseFailureEvent("op",failure)
   assertEquals("subscription_sharing_user_not_eligible",event["errorCode"])
   assertEquals("model",event["parameter"]);assertEquals("req-safe",event["serverRequestId"])
   assertFalse(event.toString().contains("sensitive-fixture-text"))
   val unsafe=responseFailureEvent("op",ResourceFailure(403,"bad secret text","malicious\nparam","unsafe header value","detail"))
   assertFalse(unsafe.containsKey("errorCode"));assertFalse(unsafe.containsKey("parameter"));assertFalse(unsafe.containsKey("serverRequestId"))
 }

}
