import { readFileSync, existsSync } from "node:fs";
const path = new URL("../src/data/content/catalog.json", import.meta.url);
if (!existsSync(path)) {
  console.log("No content shipped yet (M0).");
  process.exit(0);
}
const { concepts, questions } = JSON.parse(readFileSync(path, "utf8"));
const ids = new Set(concepts.map((c) => c.id));
if (ids.size !== concepts.length) throw Error("Duplicate concept IDs");
const qids = new Set();
for (const c of concepts) {
  if (!c.title || !c.explanation || !c.sourceRefs?.length)
    throw Error(`Missing concept data: ${c.id}`);
  for (const id of c.prerequisiteIds)
    if (!ids.has(id) || id === c.id)
      throw Error(`Invalid prerequisite: ${c.id}`);
}
function visit(id, path = new Set()) {
  if (path.has(id)) throw Error(`Prerequisite cycle: ${id}`);
  const next = new Set(path).add(id);
  for (const p of concepts.find((c) => c.id === id).prerequisiteIds)
    visit(p, next);
}
for (const c of concepts) visit(c.id);
for (const q of questions) {
  if (
    qids.has(q.id) ||
    !ids.has(q.conceptId) ||
    !q.explanation ||
    !q.sourceRefs?.length
  )
    throw Error(`Invalid question: ${q.id}`);
  qids.add(q.id);
  if (
    q.options.length < (q.type === "ox" ? 2 : 3) ||
    new Set(q.options.map((o) => o.id)).size !== q.options.length ||
    !q.options.some((o) => o.id === q.correctOptionId)
  )
    throw Error(`Invalid options: ${q.id}`);
}
for (const c of concepts)
  if (questions.filter((q) => q.conceptId === c.id).length !== 2)
    throw Error(`Expected 2 questions: ${c.id}`);
console.log(
  `Validated structure: ${concepts.length} concepts, ${questions.length} questions. Accuracy requires source review.`,
);
