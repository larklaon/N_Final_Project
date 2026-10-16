import { buildLearningContext } from "../context";
import { advanceProgress } from "../../../domain/review";
import { defaultSettings } from "../../../data/repositories/LearningRepository";
import type { LearningSnapshot } from "../../../domain/types";
const s: LearningSnapshot = {
  learnerId: "local-a",
  settings: defaultSettings,
  gapProgress: {},
  concepts: [
    {
      id: "c",
      title: "기본키",
      area: "db",
      order: 1,
      oneLiner: "정의",
      explanation: "설명",
      example: "예시",
      deep: "심화",
      subjectId: "info-basic",
      prerequisiteIds: [],
      sourceRefs: [],
      contentVersion: 1,
      reviewStatus: "draft",
    },
  ],
  progress: {},
  attempts: [],
  memoryRevision: 0,
};
test("learning history changes the actual AI context; local identity stays out", () => {
  const first = buildLearningContext(s, "c");
  const after = buildLearningContext(
    {
      ...s,
      progress: {
        c: advanceProgress(undefined, false, 1, "2026-10-15", "choice"),
      },
    },
    "c",
  );
  expect(first.history).toBeNull();
  expect(after.history?.gradedAttempts).toBe(1);
  expect(after).not.toEqual(first);
  expect(JSON.stringify(after)).not.toContain("local-a");
});
