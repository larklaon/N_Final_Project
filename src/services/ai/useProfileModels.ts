import { useEffect, useState } from "react";
import {
  getSiwc,
  type AuthSnapshot,
  type ModelChoice,
} from "../../../modules/siwc-android";

export function useProfileModels(
  auth: AuthSnapshot,
  refreshAuth: () => Promise<void>,
) {
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{
    profileId: string;
    models: ModelChoice[];
    error: string;
  } | null>(null);
  useEffect(() => {
    let current = true;
    const profileId = auth.status === "ready" ? auth.profileId : undefined;
    if (profileId) {
      void getSiwc()
        .listModels(profileId)
        .then(
          (models) => {
            if (current) {
              setResult({ profileId, models, error: "" });
              void refreshAuth();
            }
          },
          () => {
            if (!current) return;
            setResult({
              profileId,
              models: [],
              error:
                "모델 목록을 불러오지 못했어요. 다시 불러오거나 ChatGPT 연결을 확인해 주세요.",
            });
            void refreshAuth();
          },
        );
    }
    return () => {
      current = false;
    };
  }, [auth.status, auth.profileId, reload, refreshAuth]);
  const visible =
    auth.status === "ready" && result?.profileId === auth.profileId
      ? result
      : null;
  return {
    models: visible?.models ?? [],
    error: visible?.error ?? "",
    retry: () => {
      setResult(null);
      setReload((n) => n + 1);
    },
  };
}
