import { Screen } from "../src/components/ui";
import { UsageSummary } from "../src/components/UsageSummary";
import { useApp } from "../src/platform/AppProvider";

export default function UsageScreen() {
  const { auth } = useApp();
  return <Screen title="AI 사용량"><UsageSummary key={auth.profileId ?? "guest"} profileId={auth.profileId} /></Screen>;
}
