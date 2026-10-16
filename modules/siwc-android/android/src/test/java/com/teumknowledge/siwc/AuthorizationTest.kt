package com.teumknowledge.siwc

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class AuthorizationTest {
 private fun url(client:String?,consent:Boolean)=Protocol.authorizationUrl(client,"urn:uuid:fixture","http://127.0.0.1:1455/auth/callback","fixture-state","fixture-nonce","fixture-verifier","fixture-id-hint",consent).toHttpUrl()
 @Test fun ordinaryReturningSignInDoesNotForceConsent() {
   val u=url("issued-fixture",false)
   assertNull(u.queryParameter("prompt"));assertNull(u.queryParameter("force_reconsent"));assertNull(u.queryParameter("agent_name_hint"))
   assertEquals("issued-fixture",u.queryParameter("client_id"));assertEquals("fixture-id-hint",u.queryParameter("id_token_hint"))
 }
 @Test fun explicitPlanEnableRequestsConsentWithFullScopeAndSameClient() {
   val u=url("issued-fixture",true)
   assertEquals("consent",u.queryParameter("prompt"));assertEquals(Protocol.SCOPES,u.queryParameter("scope"))
   assertEquals("issued-fixture",u.queryParameter("client_id"));assertNull(u.queryParameter("force_reconsent"))
   assertEquals("S256",u.queryParameter("code_challenge_method"));assertEquals(Protocol.RESOURCE,u.queryParameter("resource"))
 }
 @Test fun newRegistrationKeepsInitialClientAndApplicationName() {
   val u=url(null,false)
   assertEquals("dynamic_agent_client",u.queryParameter("client_id"));assertEquals("틈지식",u.queryParameter("agent_name_hint"))
 }
}
