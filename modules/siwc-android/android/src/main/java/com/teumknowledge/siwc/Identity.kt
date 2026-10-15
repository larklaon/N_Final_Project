package com.teumknowledge.siwc

import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.crypto.RSASSAVerifier
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT

object Identity {
 fun validate(raw: String, jwks: String, clientId: String, nonce: String, expectedSubject: String?, now: Long = System.currentTimeMillis()): JWTClaimsSet {
   val jwt = SignedJWT.parse(raw)
   require(jwt.header.algorithm == JWSAlgorithm.RS256) { "invalid_algorithm" }
   require(jwt.header.jwkURL == null && jwt.header.x509CertURL == null && jwt.header.criticalParams.isNullOrEmpty()) { "invalid_header" }
   val key = JWKSet.parse(jwks).keys.filterIsInstance<RSAKey>().firstOrNull { it.keyID == jwt.header.keyID && (it.algorithm == null || it.algorithm == JWSAlgorithm.RS256) } ?: error("missing_key")
   require(jwt.verify(RSASSAVerifier(key.toRSAPublicKey()))) { "invalid_signature" }
   val c = jwt.jwtClaimsSet
   require(c.issuer == Protocol.ISSUER && c.audience.contains(clientId)) { "invalid_identity" }
   require(c.expirationTime != null && c.expirationTime.time > now - 60_000) { "expired_identity" }
   require(c.notBeforeTime == null || c.notBeforeTime.time <= now + 60_000) { "future_identity" }
   require(c.issueTime != null && c.issueTime.time <= now + 60_000) { "invalid_issue_time" }
   val azp = c.getStringClaim("azp")
   require((c.audience.size <= 1 || azp == clientId) && (azp == null || azp == clientId)) { "invalid_azp" }
   require(Protocol.same(c.getStringClaim("nonce") ?: "", nonce) && !c.subject.isNullOrBlank()) { "invalid_nonce" }
   require(expectedSubject == null || c.subject == expectedSubject) { "subject_mismatch" }
   return c
 }
}
