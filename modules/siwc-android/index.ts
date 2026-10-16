import { requireOptionalNativeModule } from "expo-modules-core";
export type AuthStatus =
  | "disconnected"
  | "authorizing"
  | "connectedWithoutPlan"
  | "ready"
  | "reconnectRequired"
  | "temporarilyUnavailable";
export type PublicProfile = {
  profileId: string;
  label: string;
  connected: boolean;
};
export type AuthSnapshot = {
  status: AuthStatus;
  profileId?: string;
  message?: string;
};
export type ModelChoice = { slug: string; displayName: string };
export type AiEvent = {
  requestId: string;
  type: "delta" | "completed" | "failed" | "cancelled";
  text?: string;
  code?: string;
};
export type AiRequest = {
  profileId: string;
  model: string;
  instructions: string;
  input: { role: "user" | "assistant"; content: string }[];
};
export interface SiwcGateway {
  getState(): Promise<AuthSnapshot>;
  listProfiles(): Promise<PublicProfile[]>;
  signIn(
    profileId: string | null,
    requestPlanConsent: boolean,
  ): Promise<AuthSnapshot>;
  cancelSignIn(): Promise<void>;
  selectProfile(profileId: string | null): Promise<AuthSnapshot>;
  signOut(profileId: string): Promise<{ revoked: boolean }>;
  listModels(profileId: string): Promise<ModelChoice[]>;
  startResponse(request: string): Promise<{ requestId: string }>;
  cancelResponse(requestId: string): Promise<void>;
  eraseAll(): Promise<void>;
  addListener(
    name: "onResponse",
    listener: (event: AiEvent) => void,
  ): { remove(): void };
}
const native = requireOptionalNativeModule<SiwcGateway>("SiwcAndroid");
export function getSiwc(): SiwcGateway {
  if (!native)
    throw new Error("SIWC는 Android Development Build에서 사용할 수 있어요.");
  return native;
}
