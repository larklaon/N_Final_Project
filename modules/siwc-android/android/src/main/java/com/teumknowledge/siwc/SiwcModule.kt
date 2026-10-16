package com.teumknowledge.siwc

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
   AsyncFunction("signOut") { id: String->manager().signOut(id) }
   AsyncFunction("listModels") { id: String->manager().models(id) }
   AsyncFunction("startResponse") { request: String->manager().startResponse(request) }
   AsyncFunction("cancelResponse") { id: String->manager().cancelResponse(id) }
   AsyncFunction("eraseAll") { manager().eraseAll() }
 }
}
