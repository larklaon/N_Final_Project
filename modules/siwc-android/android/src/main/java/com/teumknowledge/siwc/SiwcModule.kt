package com.teumknowledge.siwc

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SiwcModule : Module() {
 private fun manager(): SiwcManager=SiwcManager.get(appContext.reactContext ?: error("no_context"))
 override fun definition()=ModuleDefinition {
   Name("SiwcAndroid")
   Events("onResponse")
   OnCreate { manager().emit={ event->sendEvent("onResponse",event) } }
   OnDestroy { manager().cancelResponse();manager().emit=null }
   OnActivityEntersBackground { manager().cancelResponse() }
   AsyncFunction("getState") { manager().state() }
   AsyncFunction("listProfiles") { manager().listProfiles() }
   AsyncFunction("signIn") { profileId: String?, requestPlanConsent: Boolean -> manager().begin(profileId,requestPlanConsent) }
   AsyncFunction("cancelSignIn") { manager().cancelAuth() }
   AsyncFunction("selectProfile") { id: String?->manager().select(id) }
   AsyncFunction("signOut") Coroutine { id: String ->
     withContext(Dispatchers.IO) { manager().signOut(id) }
   }
   AsyncFunction("listModels") Coroutine { id: String ->
     withContext(Dispatchers.IO) { manager().models(id) }
   }
   AsyncFunction("getUsage") Coroutine { id: String ->
     withContext(Dispatchers.IO) { manager().usageSummary(id) }
   }
   AsyncFunction("startResponse") { request: String->manager().startResponse(request) }
   AsyncFunction("cancelResponse") { id: String->manager().cancelResponse(id) }
   AsyncFunction("eraseAll") { manager().eraseAll() }
 }
}
