import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState, Text, View, ActivityIndicator, Modal } from "react-native";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { LearningRepository } from "../data/repositories/LearningRepository";
import type { LearningSnapshot } from "../domain/types";
import {
  getSiwc,
  type AuthSnapshot,
  type PublicProfile,
} from "../../modules/siwc-android";
import { reconcileNotifications } from "../services/notifications/scheduler";
import { Button, Body, Title, Surface } from "../components/ui";
import { colors } from "../theme/tokens";
type AppContextValue = {
  repo: LearningRepository;
  snapshot: LearningSnapshot;
  refresh: () => void;
  auth: AuthSnapshot;
  profiles: PublicProfile[];
  refreshAuth: () => Promise<void>;
  notificationError: string | null;
  now: number;
};
const Context = createContext<AppContextValue | null>(null);
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<LearningRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [now, setNow] = useState(Date.now);
  const [auth, setAuth] = useState<AuthSnapshot>({ status: "disconnected" });
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const router = useRouter();
  const refresh = useCallback(() => {
    if (repo) setSnapshot(repo.snapshot());
    setNow(Date.now());
  }, [repo]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const next = new LearningRepository(
          SQLite.openDatabaseSync("teum.db"),
          Crypto.randomUUID,
        );
        setRepo(next);
        setSnapshot(next.snapshot());
      } catch {
        setError(
          "학습 기록을 열지 못했어요. 데이터는 보존되어 있어요. 앱을 다시 실행해 주세요.",
        );
      }
    });
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const refreshAuth = useCallback(async () => {
    try {
      const gateway = getSiwc();
      const state = await gateway.getState();
      const list = await gateway.listProfiles();
      if (repo && state.profileId) {
        const learner = repo.activeLearner;
        repo.selectProfile(state.profileId);
        if (repo.activeLearner !== learner) refresh();
      }
      setAuth(state);
      setProfiles(list);
    } catch {
      setAuth({
        status: "disconnected",
        message: "ChatGPT 연결에는 Android Development Build가 필요해요.",
      });
    }
  }, [repo, refresh]);
  useEffect(() => {
    if (repo) void Promise.resolve().then(refreshAuth);
  }, [repo, refreshAuth]);
  useEffect(() => {
    if (auth.status !== "authorizing") return;
    const id = setInterval(() => void refreshAuth(), 1000);
    return () => clearInterval(id);
  }, [auth.status, refreshAuth]);
  useEffect(() => {
    if (!repo) return;
    const reconcile = () => {
      repo.queueNotifications();
      void reconcileNotifications(repo)
        .then(() => setNotificationError(null))
        .catch(() =>
          setNotificationError(
            "알림 일정을 저장하지 못했어요. 앱을 다시 열면 재시도해요.",
          ),
        );
    };
    reconcile();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
        void refreshAuth();
        reconcile();
      }
    });
    return () => sub.remove();
  }, [repo, refresh, refreshAuth]);
  useEffect(() => {
    if (repo)
      void reconcileNotifications(repo).catch(() =>
        setNotificationError(
          "알림 일정을 준비하지 못했어요. 다음 실행 때 다시 시도해요.",
        ),
      );
  }, [repo, snapshot]);

  useEffect(() => {
    if (!repo || !snapshot?.settings.onboarded) return;
    const handle = (response: Notifications.NotificationResponse) => {
      const d = response.notification.request.content.data ?? {};
      const id = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (
        d.type !== "learning" ||
        d.learnerId !== repo.activeLearner ||
        typeof d.conceptId !== "string" ||
        !repo.snapshot().concepts.some((c) => c.id === d.conceptId) ||
        !repo.consumeEvent(id)
      )
        return;
      router.push({
        pathname: "/learn/[conceptId]",
        params: { conceptId: d.conceptId },
      });
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) handle(r);
    });
    return () => sub.remove();
  }, [repo, router, snapshot?.settings.onboarded]);
  if (error)
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ color: colors.error }}>{error}</Text>
      </View>
    );
  if (!repo || !snapshot)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return (
    <Context.Provider
      value={{
        repo,
        snapshot,
        refresh,
        auth,
        profiles,
        refreshAuth,
        notificationError,
        now,
      }}
    >
      {children}
      <Modal
        transparent
        visible={
          auth.status === "ready" && !snapshot.settings.planWelcomeDismissed
        }
        onRequestClose={() => {
          repo.updateSettings({ planWelcomeDismissed: true });
          refresh();
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#172D2A99",
          }}
        >
          <Surface>
            <Title>ChatGPT 플랜을 사용해요</Title>
            <Body>
              이 앱의 AI 설명은 연결한 ChatGPT 플랜 사용량을 사용해요. ChatGPT
              설정에서 앱별 사용량을 관리할 수 있어요.
            </Body>
            <Button
              label="알겠어요"
              onPress={() => {
                repo.updateSettings({ planWelcomeDismissed: true });
                refresh();
              }}
            />
          </Surface>
        </View>
      </Modal>
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw Error("AppProvider missing");
  return value;
}
