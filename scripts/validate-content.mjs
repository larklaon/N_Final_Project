import { readFileSync, existsSync } from "node:fs";
const files = ["catalog.json", "sqld.json"];
const all = files.map((f) => {
  const path = new URL(`../src/data/content/${f}`, import.meta.url);
  if (!existsSync(path)) throw Error(`Missing pack: ${f}`);
  return JSON.parse(readFileSync(path, "utf8"));
});
// Packs share one database, so ids must be unique across all of them.
const concepts = all.flatMap((p) => p.concepts);
const questions = all.flatMap((p) => p.questions);
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
// Lock-screen wording: same rough measure as src/domain/fit.ts (two 9.8em lines).
function ems(text) {
  let w = 0;
  for (const ch of text) {
    if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u4e00-\u9fff]/.test(ch)) w += 1;
    else if (ch === " ") w += 0.3;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[a-z0-9]/.test(ch)) w += 0.56;
    else w += 0.36;
  }
  return w;
}
for (const q of questions) {
  if (q.short !== undefined && (q.type !== "ox" || typeof q.short !== "string" || !q.short))
    throw Error(`Invalid short: ${q.id}`);
  if (q.layer === "gap" && q.type === "ox" && ems(q.short ?? q.prompt) > 19.6)
    throw Error(`Lock-screen O/X needs a short wording: ${q.id}`);
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
  `Validated ${files.length} packs: ${concepts.length} concepts, ${questions.length - app} gap cards, ${app} app questions. Accuracy requires source review.`,
);
