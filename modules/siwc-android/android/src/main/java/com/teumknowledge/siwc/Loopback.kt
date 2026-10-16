package com.teumknowledge.siwc

import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.net.URLDecoder

class Loopback : AutoCloseable {
 private val server = try { ServerSocket(1455, 4, InetAddress.getByName("127.0.0.1")) } catch (_: java.net.BindException) { ServerSocket(0,4,InetAddress.getByName("127.0.0.1")) }
 val redirect = "http://127.0.0.1:${server.localPort}/auth/callback"
 @Volatile private var closed = false
 fun await(state: String): Map<String,String> {
   val deadline = System.currentTimeMillis()+120_000
   server.soTimeout = 1000
   while (!closed && System.currentTimeMillis()<deadline) {
     val socket = try { server.accept() } catch (_: SocketTimeoutException) { continue }
     socket.use { s ->
       s.soTimeout = 2000
       try {
         val bytes=ArrayList<Byte>(); val input=s.getInputStream()
         while (bytes.size<8192) {
           val b=input.read(); if(b<0) break; bytes.add(b.toByte())
           if(bytes.size>=4 && bytes.takeLast(4)==listOf(13.toByte(),10.toByte(),13.toByte(),10.toByte())) break
         }
         val header=bytes.toByteArray().toString(Charsets.US_ASCII)
         val parts=header.substringBefore("\r\n").split(' ')
         val validHeader=header.endsWith("\r\n\r\n") && parts.size==3 && parts[0]=="GET" && parts[1].substringBefore('?')=="/auth/callback"
         val query=if(validHeader) parts[1].substringAfter('?',"").split('&').filter { it.isNotEmpty() }.map { it.split('=',limit=2) } else emptyList()
         val pairs=query.map { URLDecoder.decode(it[0],"UTF-8") to URLDecoder.decode(it.getOrElse(1){""},"UTF-8") }
         val params=pairs.toMap()
         val valid=validHeader && pairs.size==params.size && Protocol.same(params["state"] ?: "", state)
         val body=CallbackPage.html(valid, params.containsKey("error"))
         val data=body.toByteArray(Charsets.UTF_8)
         s.getOutputStream().write(("HTTP/1.1 ${if(valid) "200 OK" else "400 Bad Request"}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: ${CallbackPage.csp}\r\nConnection: close\r\nContent-Length: ${data.size}\r\n\r\n").toByteArray(Charsets.US_ASCII)+data)
         if(valid) return params
       } catch (_: java.io.IOException) { /* Bad requests do not consume the pending attempt. */ }
         catch (_: IllegalArgumentException) { /* Malformed percent encoding. */ }
     }
   }
   error(if(closed) "cancelled" else "auth_timeout")
 }
 override fun close() { closed=true; server.close() }
}
