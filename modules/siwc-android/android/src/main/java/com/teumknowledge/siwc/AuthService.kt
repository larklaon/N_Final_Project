package com.teumknowledge.siwc

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class AuthService : Service() {
 private val handler=Handler(Looper.getMainLooper())
 private val timeout=Runnable { SiwcManager.get(this).cancelAuth();stopSelf() }
 override fun onBind(intent: Intent?): IBinder?=null
 override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
   if(intent?.action=="cancel") { SiwcManager.get(this).cancelAuth();stopSelf();return START_NOT_STICKY }
   val nm=getSystemService(NotificationManager::class.java)
   nm.createNotificationChannel(NotificationChannel("siwc-auth","ChatGPT 연결",NotificationManager.IMPORTANCE_LOW))
   val cancel=PendingIntent.getService(this,0,Intent(this,AuthService::class.java).setAction("cancel"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
   val notification=Notification.Builder(this,"siwc-auth").setContentTitle("ChatGPT 연결 중")
     .setContentText("브라우저에서 연결을 마쳐 주세요.").setSmallIcon(android.R.drawable.ic_lock_lock).setOngoing(true)
     .addAction(Notification.Action.Builder(null,"취소",cancel).build()).build()
   if(Build.VERSION.SDK_INT>=34) startForeground(1455,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE) else startForeground(1455,notification)
   handler.removeCallbacks(timeout);handler.postDelayed(timeout,150_000)
   SiwcManager.get(this).performAuth()
   return START_NOT_STICKY
 }
 override fun onTimeout(startId: Int) { SiwcManager.get(this).cancelAuth();stopSelf() }
 override fun onTimeout(startId: Int, fgsType: Int) { SiwcManager.get(this).cancelAuth();stopSelf() }
 override fun onDestroy() { handler.removeCallbacks(timeout);super.onDestroy() }
}
