import { database } from "../../data/repositories/__tests__/database";
import { LearningRepository } from "../../data/repositories/LearningRepository";
import { puzzle, puzzleTotals, seenPieceUsed, whenSeen } from "../puzzle";
import { DAY } from "../review";

let now = new Date(2026, 9, 15, 15).getTime();
function setup() {
  let id = 0;
  return new LearningRepository(database(), () => `t-${++id}`, () => now);
}

test("pieces move none → seen (gap) → fitted (graded app answer)", () => {
  const repo = setup();
  const learner = repo.activeLearner;
  repo.ingestGapEvents([
    { id: "e1", learnerId: learner, questionId: "db-primary-ox", selectedOptionId: "o", answeredAt: now },
  ]);
  let db = puzzle(repo.snapshot()).find((a) => a.area === "데이터베이스")!;
  expect([db.seen, db.fitted, db.pieces[0].state]).toEqual([1, 0, "seen"]);
  const s = repo.openSession("db-primary");
  repo.submit(s.id, "a");
  db = puzzle(repo.snapshot()).find((a) => a.area === "데이터베이스")!;
  expect([db.seen, db.fitted, db.pieces[0].state]).toEqual([0, 1, "fitted"]);
  expect(puzzleTotals(repo.snapshot())).toEqual({ total: 60, fitted: 1, seen: 0 });
});

test("areas follow curriculum order with ten pieces each", () => {
  const areas = puzzle(setup().snapshot());
  expect(areas.map((a) => a.area)).toEqual([
    "네트워크",
    "데이터베이스",
    "운영체제",
    "자료구조",
    "프로그래밍 기초",
    "소프트웨어·보안 기초",
  ]);
  expect(areas.every((a) => a.pieces.length === 10)).toBe(true);
});

test("the most recently seen builtOn piece is surfaced", () => {
  const repo = setup();
  const learner = repo.activeLearner;
  repo.ingestGapEvents([
    { id: "e1", learnerId: learner, questionId: "db-primary-ox", selectedOptionId: "o", answeredAt: now - 2 * DAY },
    { id: "e2", learnerId: learner, questionId: "db-foreign-ox", selectedOptionId: "o", answeredAt: now - DAY },
  ]);
  const used = seenPieceUsed(repo.snapshot(), repo.quiz("db-foreign-deep"));
  expect(used).toMatchObject({ conceptId: "db-foreign", title: "외래키" });
  expect(seenPieceUsed(repo.snapshot(), repo.quiz("net-http-deep"))).toBeNull();
});

test("seen time is coarse and local", () => {
  now = new Date(2026, 9, 15, 15).getTime();
  expect(whenSeen(new Date(2026, 9, 15, 9).getTime(), now)).toBe("오늘 오전");
  expect(whenSeen(new Date(2026, 9, 15, 13).getTime(), now)).toBe("오늘 오후");
  expect(whenSeen(new Date(2026, 9, 14, 23).getTime(), now)).toBe("어제");
  expect(whenSeen(new Date(2026, 9, 11, 10).getTime(), now)).toBe("4일 전");
});
