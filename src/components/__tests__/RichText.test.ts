import { spans } from "../RichText";

test("bold and code become spans; markers disappear", () => {
  expect(spans("**4xx는 클라이언트 오류**를 뜻해요. 예: `회원ID = 1001`")).toEqual([
    { text: "4xx는 클라이언트 오류", bold: true },
    { text: "를 뜻해요. 예: " },
    { text: "회원ID = 1001", code: true },
  ]);
});

test("headings and bullets are tidied, unclosed markers stay as written", () => {
  expect(spans("## 정리\n- 하나\n- 둘")).toEqual([{ text: "정리\n· 하나\n· 둘" }]);
  expect(spans("2 ** 3 은 8")).toEqual([{ text: "2 ** 3 은 8" }]);
});
