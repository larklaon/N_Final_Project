package com.teumknowledge.siwc
import org.junit.Assert.*
import org.junit.Test
class ProtocolTest {
 @Test fun pkceUsesRfc7636Vector() { assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",Protocol.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")) }
 @Test fun returningClientCannotBeReplaced() {
   assertEquals("issued",Protocol.callbackClient("issued",null))
   assertThrows(IllegalArgumentException::class.java) { Protocol.callbackClient("issued","another") }
   assertThrows(IllegalArgumentException::class.java) { Protocol.callbackClient(null,"dynamic_agent_client") }
 }
 @Test fun partialAndFailedResponsesNeverComplete() {
   val events=mutableListOf<String>();val a=ResponseAccumulator { kind,_->events.add(kind) }
   a.frame("""{"type":"response.output_text.delta","delta":"한글"}""")
   assertThrows(IllegalArgumentException::class.java) { a.end() }
   a.frame("""{"type":"response.failed","response":{"error":{"code":"usage_limit"}}}""")
   a.end();assertEquals(listOf("delta","failed"),events)
 }
 @Test fun completedResponseIsTerminal() {
   val events=mutableListOf<String>();val a=ResponseAccumulator { kind,_->events.add(kind) }
   a.frame("""{"type":"response.output_text.delta","delta":"설명"}""")
   a.frame("""{"type":"response.completed"}""");a.frame("""{"type":"response.output_text.delta","delta":"late"}""")
   a.end();assertEquals(listOf("delta","completed"),events)
 }
 @Test fun emptyAndOversizedOutputsFail() {
   assertThrows(IllegalArgumentException::class.java) { ResponseAccumulator { _,_-> }.frame("""{"type":"response.completed"}""") }
   assertThrows(IllegalArgumentException::class.java) { ResponseAccumulator { _,_-> }.frame("""{"type":"response.output_text.delta","delta":"${"x".repeat(8001)}"}""") }
 }
}
