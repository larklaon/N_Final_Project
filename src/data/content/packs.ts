import info from "./catalog.json";
import sqld from "./sqld.json";
import type { Concept, Quiz } from "../../domain/types";

type Catalog = { concepts: Omit<Concept, "subjectId">[]; questions: Quiz[] };

/** A study subject. Bundled in the app; "downloading" one is a demo of the paper plan. */
export type Pack = {
  id: string;
  title: string;
  subtitle: string;
  available: boolean;
  catalog: Catalog | null;
};

export const packs: Pack[] = [
  {
    id: "info-basic",
    title: "정보처리기사 기초",
    subtitle: "네트워크·DB·운영체제 등 6개 영역 · 60조각",
    available: true,
    catalog: info as unknown as Catalog,
  },
  {
    id: "sqld-taste",
    title: "SQLD 맛보기",
    subtitle: "데이터 모델링·SQL 기본·SQL 활용 · 12조각",
    available: true,
    catalog: sqld as unknown as Catalog,
  },
  {
    id: "computer-1",
    title: "컴퓨터활용능력 1급",
    subtitle: "스프레드시트·데이터베이스 실무",
    available: false,
    catalog: null,
  },
  {
    id: "toeic-words",
    title: "토익 필수 단어",
    subtitle: "자주 나오는 단어와 표현",
    available: false,
    catalog: null,
  },
];
export const defaultPackId = "info-basic";
export function packOf(id: string | null | undefined) {
  return packs.find((p) => p.id === id && p.available) ?? packs[0];
}
