import { describe, expect, it } from "vitest";
import { artIndex, monogram } from "../../src/art";
import { appendDigit, stepChannel } from "../../src/live/zap";
import { matchTrack, pickOf, type TrackInfo } from "../../src/live/tracks";
import { foldText } from "../../src/text";

describe("stepChannel", () => {
  const ids = [10, 20, 30];
  it("moves and wraps at both ends", () => {
    expect(stepChannel(ids, 20, 1)).toBe(30);
    expect(stepChannel(ids, 30, 1)).toBe(10);
    expect(stepChannel(ids, 10, -1)).toBe(30);
    expect(stepChannel(ids, 10, -4)).toBe(30);
  });
  it("starts at an end when the current channel is not in the list", () => {
    expect(stepChannel(ids, 99, 1)).toBe(10);
    expect(stepChannel(ids, 99, -1)).toBe(30);
    expect(stepChannel([], 1, 1)).toBeNull();
  });
});

describe("appendDigit", () => {
  it("keeps digits only, at most 7", () => {
    expect(appendDigit("12", "3")).toBe("123");
    expect(appendDigit("12", "x")).toBe("12");
    expect(appendDigit("1234567", "8")).toBe("2345678");
  });
});

describe("monogram", () => {
  it.each([
    ["Sport 1 HD", "SP1"],
    ["FR: Canal+ Sport FHD", "CS"],
    ["|UK| BBC One", "BO"],
    ["Eurosport", "EUR"],
    ["Télé Matin 4K", "TM"],
    ["M6", "M6"],
    ["24 7", "247"],
    ["News Channel Four Extra", "NCF"],
    ["***", "*"],
  ])("%s → %s", (name, expected) => {
    expect(monogram(name)).toBe(expected);
  });
});

describe("artIndex", () => {
  it("is stable and within the palette", () => {
    expect(artIndex("Sport 1 HD")).toBe(artIndex(" sport 1 hd "));
    const indexes = new Set(Array.from({ length: 200 }, (_, i) => artIndex(`Channel ${i}`)));
    expect([...indexes].every((i) => i >= 0 && i < 8)).toBe(true);
    expect(indexes.size).toBe(8);
  });
});

describe("foldText", () => {
  it("ignores case, accents and punctuation", () => {
    expect(foldText("Téléfoot · HD!")).toBe("telefoot hd");
    expect(foldText("FR: TF1")).toContain("tf1");
  });
});

describe("matchTrack", () => {
  const first: TrackInfo[] = [
    { id: 1, lang: "fre", title: null, codec: "aac" },
    { id: 2, lang: "eng", title: "Commentary", codec: "ac3" },
    { id: 3, lang: "eng", title: null, codec: "aac" },
  ];
  it("finds the same track in a new opening with other ids", () => {
    const pick = pickOf(first, 2)!;
    const reopened = first.map((t) => ({ ...t, id: t.id + 10 }));
    expect(matchTrack(reopened, pick)).toBe(12);
  });
  it("falls back to the language, then the position", () => {
    const pick = pickOf(first, 3)!;
    expect(matchTrack([{ id: 7, lang: "eng", title: "Main", codec: "eac3" }], pick)).toBe(7);
    const noLang = pickOf(
      [
        { id: 1, lang: null, title: null, codec: "aac" },
        { id: 2, lang: null, title: null, codec: "mp2" },
      ],
      2,
    )!;
    expect(
      matchTrack(
        [
          { id: 5, lang: null, title: null, codec: "x" },
          { id: 6, lang: null, title: null, codec: "y" },
        ],
        noLang,
      ),
    ).toBe(6);
    expect(matchTrack([], noLang)).toBeNull();
  });
});
