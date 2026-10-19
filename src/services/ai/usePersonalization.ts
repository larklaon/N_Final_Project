import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useApp } from "../../platform/AppProvider";
import { LIMITS } from "../../domain/personalization";
import { runPersonalization } from "./personalization";
import { useProfileModels } from "./useProfileModels";

/** Foreground-only work, rearmed by completed conversation turns and learning changes. */
export function usePersonalization() {
  const { repo, snapshot, auth, refresh, refreshAuth } = useApp();
  const { models } = useProfileModels(auth, refreshAuth);
  const running = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const [activity, setActivity] = useState(0);
  const enabled = snapshot.settings.personalizationEnabled && !!snapshot.settings.personalizationConsentAt;
  const ready = auth.status === "ready" && models.length > 0;
  const revision = snapshot.memoryRevision;

  useEffect(() => {
    mounted.current = true;
    const rearm = () => { pending.current = true; setActivity((n) => n + 1); };
    const stop = () => { running.current?.abort(); };
    const app = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
      else rearm();
    });
    const scope = repo.onScopeChange(() => { stop(); rearm(); });
    const consent = repo.onAiConsentChange(() => { stop(); rearm(); });
    const invalidation = repo.personal.onInvalidated(() => { stop(); rearm(); });
    const input = repo.onPersonalizationInput(rearm);
    return () => {
      mounted.current = false;
      app.remove(); scope(); consent(); invalidation(); input(); stop();
    };
  }, [repo]);

  useEffect(() => {
    if (!enabled || !ready) { running.current?.abort(); return; }
    const timer = setTimeout(() => {
      if (AppState.currentState !== "active") return;
      if (running.current) { pending.current = true; return; }
      pending.current = false;
      const controller = new AbortController();
      running.current = controller;
      void runPersonalization(repo, auth, models, controller.signal)
        .then((r) => {
          if (__DEV__) console.log("[V4] pass", JSON.stringify(r));
          // A later stage can fail after memory extraction committed successfully.
          if (!controller.signal.aborted && (r.approvedGap || r.approvedCheck || r.memoriesChanged)) refresh();
        })
        .catch(() => {})
        .finally(() => {
          if (running.current === controller) running.current = null;
          if (mounted.current && pending.current) setActivity((n) => n + 1);
        });
    }, LIMITS.idleBeforeWorkMs);
    return () => clearTimeout(timer);
  }, [repo, auth, models, enabled, ready, revision, refresh, activity]);
}

export function PersonalizationRunner() {
  usePersonalization();
  return null;
}
