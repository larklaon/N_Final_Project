package com.teumknowledge.siwc

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class AuthService : Service() {
 private val handler=Handler(Looper.getMainLooper())
 private var timeout:Runnable?=null
 private var activeAttempt:String?=null
 private var activeStartId=0
 override fun onBind(intent: Intent?): IBinder?=null
 override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
   val manager=SiwcManager.get(this)
   val id=intent?.getStringExtra("attemptId")
   if(id==null || !manager.isCurrentAttempt(id)) {
     // A queued start/cancel from A must never stop B.
     if(manager.currentAttemptId()==null) stopSelf(startId)
     return START_NOT_STICKY
   }
   if(intent.action=="cancel") {
     if(manager.cancelAuth(id)) stopSelf(startId)
     return START_NOT_STICKY
   }
   activeAttempt=id;activeStartId=startId
   val nm=getSystemService(NotificationManager::class.java)
   nm.createNotificationChannel(NotificationChannel("siwc-auth","ChatGPT 연결",NotificationManager.IMPORTANCE_LOW))
   val cancelIntent=Intent(this,AuthService::class.java).setAction("cancel")
     .setData(Uri.parse("teumknowledge://auth/cancel/$id")).putExtra("attemptId",id)
   val cancel=PendingIntent.getService(this,0,cancelIntent,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
   val notification=Notification.Builder(this,"siwc-auth").setContentTitle("ChatGPT 연결 중")
     .setContentText("브라우저에서 연결을 마쳐 주세요.").setSmallIcon(android.R.drawable.ic_lock_lock).setOngoing(true)
     .addAction(Notification.Action.Builder(null,"취소",cancel).build()).build()
   if(Build.VERSION.SDK_INT>=34) startForeground(1455,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE) else startForeground(1455,notification)
   timeout?.let { handler.removeCallbacks(it) }
   timeout=Runnable { expire(startId,id) }.also { handler.postDelayed(it,150_000) }
   manager.performAuth(id)
   return START_NOT_STICKY
 }
 private fun expire(startId:Int,id:String) {
   if(startId!=activeStartId || id!=activeAttempt) return
   if(SiwcManager.get(this).cancelAuth(id,timedOut=true)) stopSelf(startId)
 }
 override fun onTimeout(startId:Int) { activeAttempt?.let { expire(startId,it) } }
 override fun onTimeout(startId:Int,fgsType:Int) { activeAttempt?.let { expire(startId,it) } }
 override fun onDestroy() { timeout?.let { handler.removeCallbacks(it) };super.onDestroy() }
}
