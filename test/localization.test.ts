import { describe, expect, it } from "vitest";
import {
  Localization, NodeOverlay, MenuDef, writeTranslationFile, parseTranslationFile, entriesFor, toCsv, fromCsv, parseCsv, suggestKey, uniqueKey, pseudoLocalize,
  translationPath, BRIDGE_MEMBERS, migrate, SPEC_VERSION,
} from "../src/index.js";

const loc = () =>
  Localization.parse({
    specVersion: 7, namespace: "Inkwell_Stopwatch", source: "ENGLISH", languages: ["ENGLISH", "GERMAN"],
    entries: {
      $Inkwell_Stopwatch_Start: { ENGLISH: "Start", GERMAN: "Starten" },
      $Inkwell_Stopwatch_Reset: { ENGLISH: "Reset", GERMAN: "Zurücksetzen" },
      $Inkwell_Stopwatch_Note: { ENGLISH: 'Line "one"\nLine two, with comma' },
    },
  });

describe("Localization schema", () => {
  it("parses, keeps unknown keys, and checks source and keys", () => {
    expect((Localization.parse({ ...loc(), extraKey: 1 }) as any).extraKey).toBe(1);
    expect(() => Localization.parse({ ...loc(), source: "FRENCH" })).toThrow();
    expect(() => Localization.parse({ ...loc(), languages: ["ENGLISH", "ENGLISH"] })).toThrow();
    expect(() => Localization.parse({ ...loc(), entries: { Bad: { ENGLISH: "x" } } })).toThrow();
    expect(() => Localization.parse({ ...loc(), entries: { $A: { english: "x" } } })).toThrow();
  });
  it("overlay and menu gain optional fields, spec 7 migrates", () => {
    expect(NodeOverlay.parse({ locKey: "$A_B", font: "abc" }).locKey).toBe("$A_B");
    expect(() => NodeOverlay.parse({ locKey: "A_B" })).toThrow();
    const m = MenuDef.parse({ specVersion: 7, name: "My_Menu", swf: "Interface/Inkwell/My/Menu.swf", translations: "My" });
    expect(m.translations).toBe("My");
    expect(() => MenuDef.parse({ specVersion: 7, name: "My_Menu", swf: "Interface/Inkwell/My/Menu.swf", translations: "bad name" })).toThrow();
    expect(SPEC_VERSION).toBe(7);
    expect(migrate({ specVersion: 6 })).toEqual({ specVersion: 7 });
    expect(BRIDGE_MEMBERS.find((b) => b.name === "translate")?.params).toBe("key:String");
    expect(BRIDGE_MEMBERS.find((b) => b.name === "language")?.kind).toBe("property");
    expect(translationPath("My", "GERMAN")).toBe("Interface/Translations/My_GERMAN.txt");
  });
});

describe("translation files", () => {
  it("writes UTF-16 LE with BOM, TAB and CRLF, and reads it back", () => {
    const bytes = writeTranslationFile({ $A_One: "Zurücksetzen ÄÖÜ ß", $A_Two: "a\nb\\c\td" });
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe]);
    const text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
    expect(text).toBe("$A_One\tZurücksetzen ÄÖÜ ß\r\n$A_Two\ta\\nb\\\\c d\r\n");
    const p = parseTranslationFile(bytes);
    expect(p.encoding).toBe("utf-16le");
    expect(p.issues).toEqual([]);
    expect(p.entries).toEqual({ $A_One: "Zurücksetzen ÄÖÜ ß", $A_Two: "a\nb\\c d" });
  });
  it("rejects invalid keys on write", () => {
    expect(() => writeTranslationFile({ bad: "x" })).toThrow();
  });
  it("reads UTF-8 with and without BOM, UTF-16 BE, LF and CR, comments and bad lines", () => {
    const enc = new TextEncoder();
    const body = "; comment\n$A_One\tOne\n\n$A_Two\ttwo\ttabbed\nno tab here\nbad\tkey\n$A_One\tUno\r$A_Three\tdrei";
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode(body)]);
    for (const bytes of [bom, enc.encode(body)]) {
      const p = parseTranslationFile(bytes);
      expect(p.encoding).toBe("utf-8");
      expect(p.entries).toEqual({ $A_One: "Uno", $A_Two: "two\ttabbed", $A_Three: "drei" });
      expect(p.issues.map((i) => i.line)).toEqual([5, 6, 7]);
      expect(p.issues[2]!.message).toMatch(/duplicate/);
    }
    const be = new Uint8Array([0xfe, 0xff, 0, 0x24, 0, 0x41, 0, 0x09, 0, 0x78]); // "$A<TAB>x"
    expect(parseTranslationFile(be)).toMatchObject({ encoding: "utf-16be", entries: { $A: "x" } });
    expect(parseTranslationFile(new Uint8Array())).toEqual({ entries: {}, encoding: "utf-8", issues: [] });
  });
});

describe("entriesFor", () => {
  it("falls back to the source language and lists the fallbacks", () => {
    const r = entriesFor(loc(), "GERMAN");
    expect(r.entries.$Inkwell_Stopwatch_Start).toBe("Starten");
    expect(r.entries.$Inkwell_Stopwatch_Note).toBe('Line "one"\nLine two, with comma');
    expect(r.fallbacks).toEqual(["$Inkwell_Stopwatch_Note"]);
    expect(entriesFor(loc(), "ENGLISH").fallbacks).toEqual([]);
  });
});

describe("CSV", () => {
  it("round trips quotes, commas and line breaks", () => {
    const text = toCsv(loc());
    expect(text.startsWith("﻿key,ENGLISH,GERMAN\r\n")).toBe(true);
    const r = fromCsv(text);
    expect(r.issues).toEqual([]);
    expect(r.languages).toEqual(["ENGLISH", "GERMAN"]);
    expect(r.entries).toEqual(loc().entries);
  });
  it("reports bad headers, keys and languages; an unterminated quote throws", () => {
    expect(fromCsv("name,ENGLISH\r\n").issues[0]).toMatch(/key/);
    const r = fromCsv("key,english,x1\r\nbad,x,y\r\n$A,hello,\r\n");
    expect(r.languages).toEqual(["ENGLISH"]);
    expect(r.entries).toEqual({ $A: { ENGLISH: "hello" } });
    expect(r.issues.length).toBe(2);
    expect(() => parseCsv('a,"b')).toThrow();
    expect(parseCsv("a,b\n\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv('"x ""y""",\r\n')).toEqual([['x "y"', ""]]);
  });
});

describe("keys and pseudo-localization", () => {
  it("suggests and de-duplicates keys", () => {
    expect(suggestKey("Inkwell_Stopwatch", "lap time (label)")).toBe("$Inkwell_Stopwatch_LapTimeLabel");
    expect(suggestKey("N", "Zurücksetzen")).toBe("$N_Zurucksetzen");
    expect(suggestKey("N", "!!!")).toBe("$N_Text");
    expect(suggestKey("N", "x".repeat(200)).length).toBe(97);
    expect(uniqueKey("$A_B", ["$a_b"])).toBe("$A_B_2");
    expect(uniqueKey("$A_B", ["$A_B", "$A_B_2"])).toBe("$A_B_3");
    expect(uniqueKey("$A_B", [])).toBe("$A_B");
  });
  it("pseudo-localizes with +35% filler, keeps placeholders, keys and line breaks", () => {
    const src = "Lap {n} of $Key\nDone";
    const s = pseudoLocalize(src);
    expect(s.startsWith("[Láp {n} öf $Key\nDöñé")).toBe(true);
    expect(s.endsWith("]")).toBe(true);
    expect(s.length).toBe(Math.ceil(src.length * 1.35) + 2);
    expect(pseudoLocalize("")).toBe("[]");
    expect(pseudoLocalize("abc")).toBe("[ábç··]");
  });
});
