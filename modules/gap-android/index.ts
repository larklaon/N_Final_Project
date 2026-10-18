import { requireOptionalNativeModule } from "expo-modules-core";
import type { GapCard } from "../../src/domain/gap";
import type { GapEvent } from "../../src/domain/types";

/** Everything the native side needs to keep showing cards while the app is closed. */
export type GapConfig = {
  enabled: boolean;
  learnerId: string;
  intervalMinutes: number;
  start: string;
  end: string;
  /** Apply the start/end window (its complement is the quiet time). Missing means true. */
  quiet?: boolean;
  deck: GapCard[];
};
export type GapPreview = {
  prompt: string;
  /** Collapsed lock-screen wording, when the prompt is too long. */
  short?: string;
  /** V4: "ai" for an AI-made card. */
  origin?: string;
  area: string;
  type: "ox" | "choice";
  options: { id: string; text: string }[];
  /** False outside the card hours, after a swipe-away, or while the toggle is off. */
  onLockScreen: boolean;
};
type Native = {
  configure(config: string): Promise<void>;
  current(): Promise<string>;
  readEvents(): Promise<string>;
  ackEvents(ids: string[]): Promise<void>;
  canPinWidget(): Promise<boolean>;
  pinWidget(): Promise<boolean>;
};
export interface GapGateway {
  configure(config: GapConfig): Promise<void>;
  current(): Promise<GapPreview | null>;
  readEvents(): Promise<GapEvent[]>;
  ackEvents(ids: string[]): Promise<void>;
  canPinWidget(): Promise<boolean>;
  pinWidget(): Promise<boolean>;
}
const native = requireOptionalNativeModule<Native>("GapAndroid");
/** Null outside an Android development build (tests, Expo Go). */
export function getGap(): GapGateway | null {
  if (!native) return null;
  return {
    configure: (config) => native.configure(JSON.stringify(config)),
    current: async () => JSON.parse(await native.current()) as GapPreview | null,
    readEvents: async () => {
      const raw = JSON.parse(await native.readEvents()) as unknown;
      return Array.isArray(raw) ? (raw as GapEvent[]) : [];
    },
    ackEvents: (ids) => native.ackEvents(ids),
    canPinWidget: () => native.canPinWidget(),
    pinWidget: () => native.pinWidget(),
  };
}
