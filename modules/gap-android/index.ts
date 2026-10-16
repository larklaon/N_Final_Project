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
  deck: GapCard[];
};
type Native = {
  configure(config: string): Promise<void>;
  readEvents(): Promise<string>;
  ackEvents(ids: string[]): Promise<void>;
  canPinWidget(): Promise<boolean>;
  pinWidget(): Promise<boolean>;
};
export interface GapGateway {
  configure(config: GapConfig): Promise<void>;
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
    readEvents: async () => {
      const raw = JSON.parse(await native.readEvents()) as unknown;
      return Array.isArray(raw) ? (raw as GapEvent[]) : [];
    },
    ackEvents: (ids) => native.ackEvents(ids),
    canPinWidget: () => native.canPinWidget(),
    pinWidget: () => native.pinWidget(),
  };
}
