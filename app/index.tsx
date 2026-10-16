import { useApp } from "../src/platform/AppProvider";
import { Onboarding } from "../src/screens/Onboarding";
import { QuestionScreen } from "../src/screens/QuestionScreen";

export default function Home() {
  const { snapshot } = useApp();
  return snapshot.settings.onboarded ? <QuestionScreen /> : <Onboarding />;
}
