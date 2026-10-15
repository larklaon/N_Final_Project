package com.teumknowledge.siwc
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import java.util.Date
import org.junit.Assert.*
import org.junit.Test
class IdentityTest {
 private val key=RSAKeyGenerator(2048).keyID("test-only").generate()
 private val now=1_800_000_000_000L
 private fun token(issuer:String=Protocol.ISSUER, audience:String="client", nonce:String="nonce", subject:String="subject", expires:Long=now+60000):String {
   val c=JWTClaimsSet.Builder().issuer(issuer).audience(audience).subject(subject).issueTime(Date(now)).expirationTime(Date(expires)).claim("nonce",nonce).build()
   return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(),c).apply { sign(RSASSASigner(key)) }.serialize()
 }
 @Test fun validatesSignedIdentityAndRejectsChangedClaims() {
   val jwks=JWKSet(key.toPublicJWK()).toString()
   assertEquals("subject",Identity.validate(token(),jwks,"client","nonce","subject",now).subject)
   for(raw in listOf(token(issuer="https://evil.invalid"),token(audience="other"),token(nonce="other"),token(subject="other"),token(expires=now-120000))) {
     assertThrows(IllegalArgumentException::class.java) { Identity.validate(raw,jwks,"client","nonce","subject",now) }
   }
 }
 @Test fun rejectsWrongSigningKey() {
   val other=RSAKeyGenerator(2048).keyID("test-only").generate()
   assertThrows(IllegalArgumentException::class.java) { Identity.validate(token(),JWKSet(other.toPublicJWK()).toString(),"client","nonce",null,now) }
 }
}
