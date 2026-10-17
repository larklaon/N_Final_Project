import { useState } from "react";
import { useRouter } from "expo-router";
import { Message, Screen } from "../src/components/ui";
import { SubjectList } from "../src/components/SubjectList";
import { useApp } from "../src/platform/AppProvider";
import { mutateLearningWithGap } from "../src/services/gap/sync";

export default function Subjects() {
  const { repo, snapshot, refresh } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <Screen title="과목">
      <SubjectList
        tone="light"
        installed={repo.installedSubjects()}
        current={snapshot.settings.subjectId}
        onPick={(id) =>
          void mutateLearningWithGap(repo, () => repo.installSubject(id))
            .then(() => {
              refresh();
              router.back();
            })
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "과목을 바꾸지 못했어요."),
            )
        }
      />
      {!!error && <Message text={error} error />}
    </Screen>
  );
}
