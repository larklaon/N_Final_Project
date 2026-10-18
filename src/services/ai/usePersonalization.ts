import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useApp } from "../../platform/AppProvider";
import { LIMITS } from "../../domain/personalization";
import { runPersonalization } from "./personalization";
import { useProfileModels } from "./useProfileModels";

/**
 * Runs the personalization pass in the foreground only: 30 seconds after the last learning
 * change, never on every render. Backgrounding, a scope change (reset, profile, subject) or
 * turning it off cancels it. Results reach the deck through the usual revision sync.
 */
export function usePersonalization() {
  const { repo, snapshot, auth, refresh, refreshAuth } = useApp();
  const { models } = useProfileModels(auth, refreshAuth);
  const running = useRef<AbortController | null>(null);
  const enabled = snapshot.settings.personalizationEnabled && !!snapshot.settings.personalizationConsentAt;
  const ready = auth.status === "ready" && models.length > 0;
  const revision = snapshot.memoryRevision;

  useEffect(() => {
    const stop = () => {
      running.current?.abort();
      running.current = null;
    };
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    const scope = repo.onScopeChange(stop);
    return () => {
      app.remove();
      scope();
      stop();
    };
  }, [repo]);

  useEffect(() => {
    if (!enabled) running.current?.abort();
    if (!enabled || !ready) return;
    const timer = setTimeout(() => {
      if (running.current || AppState.currentState !== "active") return;
      const controller = new AbortController();
      running.current = controller;
      void runPersonalization(repo, auth, models, controller.signal)
        .then((r) => {
          if (r.status === "succeeded" && (r.approvedGap || r.approvedCheck || r.memoriesChanged)) refresh();
        })
        .catch(() => {})
        .finally(() => {
          if (running.current === controller) running.current = null;
        });
    }, LIMITS.idleBeforeWorkMs);
    return () => clearTimeout(timer);
  }, [repo, auth, models, enabled, ready, revision, refresh]);
}

/** Mounted once inside the app provider. */
export function PersonalizationRunner() {
  usePersonalization();
  return null;
}
