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
  if (!c.title || !c.oneLiner || !c.explanation || !c.deep || !c.sourceRefs?.length)
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
for (const q of questions) {
  if (q.layer !== "gap" && q.layer !== "app")
    throw Error(`Invalid layer: ${q.id}`);
  if (q.context !== undefined && (typeof q.context !== "string" || !q.context))
    throw Error(`Invalid context: ${q.id}`);
  if (q.layer === "app") {
    if (q.type !== "choice" || q.options.length !== 4)
      throw Error(`App question needs 4 choices: ${q.id}`);
    if (
      !q.builtOn?.length ||
      !q.builtOn.includes(q.conceptId) ||
      q.builtOn.some((id) => !ids.has(id))
    )
      throw Error(`Invalid builtOn: ${q.id}`);
  }
}
for (const c of concepts) {
  const own = questions.filter((q) => q.conceptId === c.id);
  // Gap cards: one O/X and one quick choice. App layer: one deeper choice.
  if (
    own.filter((q) => q.layer === "gap" && q.type === "ox").length !== 1 ||
    own.filter((q) => q.layer === "gap" && q.type === "choice").length !== 1 ||
    own.filter((q) => q.layer === "app").length !== 1
  )
    throw Error(`Expected gap ox + gap choice + app question: ${c.id}`);
}
const app = questions.filter((q) => q.layer === "app").length;
console.log(
  `Validated structure: ${concepts.length} concepts, ${questions.length - app} gap cards, ${app} app questions. Accuracy requires source review.`,
);
