import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Text, View, ActivityIndicator, Modal } from "react-native";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { LearningRepository } from "../data/repositories/LearningRepository";
import type { LearningSnapshot } from "../domain/types";
import {
  getSiwc,
  type AuthSnapshot,
  type PublicProfile,
} from "../../modules/siwc-android";
import { syncGap, withGapLock } from "../services/gap/sync";
import { Button, Body, Title, Surface } from "../components/ui";
import { colors } from "../theme/tokens";
type AppContextValue = {
  repo: LearningRepository;
  snapshot: LearningSnapshot;
  refresh: () => void;
  auth: AuthSnapshot;
  profiles: PublicProfile[];
  refreshAuth: () => Promise<void>;
  gapError: string | null;
  now: number;
};
const Context = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = useState<LearningRepository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LearningSnapshot | null>(null);
  const [now, setNow] = useState(Date.now);
  const [auth, setAuth] = useState<AuthSnapshot>({ status: "disconnected" });
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [gapError, setGapError] = useState<string | null>(null);
  const gapRun = useRef(0);
  const reconcile = useCallback(async () => {
    if (!repo) return;
    const run = ++gapRun.current;
    try {
      await syncGap(repo);
      if (run === gapRun.current) setGapError(null);
    } catch {
      if (run === gapRun.current)
        setGapError(
          "잠금 화면 카드를 준비하지 못했어요. 앱을 다시 열면 다시 시도해요.",
        );
    }
    // Answers given outside the app may have changed the snapshot.
    if (run === gapRun.current) setSnapshot(repo.snapshot());
  }, [repo]);
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
      const read = async () => {
        const state = await gateway.getState();
        const list = await gateway.listProfiles();
        if (repo) {
          const learner = repo.activeLearner;
          repo.selectProfile(state.profileId ?? null);
          if (repo.activeLearner !== learner) refresh();
        }
        setAuth(state);
        setProfiles(list);
      };
      if (repo) {
        await withGapLock(repo, read);
        void reconcile();
      } else await read();
    } catch {
      setAuth({
        status: "disconnected",
        message: "ChatGPT 연결에는 Android Development Build가 필요해요.",
      });
    }
  }, [repo, refresh, reconcile]);
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
    const queueAndReconcile = () => {
      repo.queueNotifications();
      void reconcile();
    };
    queueAndReconcile();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
        void refreshAuth();
        queueAndReconcile();
      }
    });
    return () => sub.remove();
  }, [repo, refresh, refreshAuth, reconcile]);
  const revision = snapshot?.memoryRevision;
  const learner = snapshot?.learnerId;
  useEffect(() => {
    if (revision !== undefined && learner) void Promise.resolve().then(reconcile);
  }, [revision, learner, reconcile]);

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
        gapError,
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
