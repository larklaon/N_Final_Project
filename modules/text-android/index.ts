import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

type Native = {
  readOnly(tag: number, label: string): Promise<boolean>;
  addListener(event: "onAsk", listener: (e: { tag: number; text: string }) => void): EventSubscription;
};
const native = requireOptionalNativeModule<Native>("TextAndroid");

/**
 * Reading text built on a TextInput: no cut/paste in the selection menu, and an
 * "ask" item that hands the selected text back. No-op outside an Android dev build.
 */
export function readOnlySelection(tag: number | null, label: string, onAsk: (text: string) => void) {
  if (!native || tag == null) return () => {};
  void native.readOnly(tag, label).catch(() => {});
  const sub = native.addListener("onAsk", (e) => {
    if (e.tag === tag && e.text) onAsk(e.text);
  });
  return () => sub.remove();
}
