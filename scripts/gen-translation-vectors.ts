// Writes the shared test vectors for the translation file reader: `<name>.txt` (the bytes) and `<name>.expected.json` (what `parseTranslationFile` returns).
// The C++ runtime (Inkwell-Runtime/src/core/Translations.cpp) must give the same entries, encoding and issue lines.
// Usage: tsx scripts/gen-translation-vectors.ts <output dir>   (Inkwell-Runtime/test-vectors/translations)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseTranslationFile, writeTranslationFile } from "../src/index.js";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const utf16 = (s: string, bom: [number, number], be: boolean): Uint8Array => {
  const out = [...bom];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out.push(...(be ? [c >> 8, c & 0xff] : [c & 0xff, c >> 8]));
  }
  return new Uint8Array(out);
};

const messy = "; comment\n$A_One\tOne\n\n$A_Two\ttwo\ttabbed\nno tab here\nbad\tkey\n$A_One\tUno\r$A_Three\tdrei\\\n# also a comment\n$A_Four\ta\\nb\\\\c\\q";
const cases: Record<string, Uint8Array> = {
  "utf16le-basic": writeTranslationFile({ $A_One: "Zurücksetzen ÄÖÜ ß", $A_Two: "line one\nline two", $A_Three: "back\\slash", $A_Four: "" }),
  "utf16le-surrogate": utf16("$A_Emoji\tgrin 😀 end\r\n$A_Lone\tbad \ud83d end\r\n", [0xff, 0xfe], false),
  "utf16be": utf16("$A_One\tEins\r\n$A_Two\tZwei ÄÖ\r\n", [0xfe, 0xff], true),
  "utf8-bom-messy": new Uint8Array([0xef, 0xbb, 0xbf, ...enc(messy)]),
  "utf8-nobom-messy": enc(messy),
  "utf8-crlf": enc("$A_One\tOne\r\n$A_Two\tTwo\r\n"),
  empty: new Uint8Array(),
  "only-bom": new Uint8Array([0xff, 0xfe]),
};

const dir = process.argv[2];
if (!dir) throw new Error("usage: tsx scripts/gen-translation-vectors.ts <output dir>");
mkdirSync(dir, { recursive: true });
for (const [name, bytes] of Object.entries(cases)) {
  const p = parseTranslationFile(bytes);
  writeFileSync(join(dir, `${name}.txt`), bytes);
  writeFileSync(join(dir, `${name}.expected.json`), JSON.stringify({ encoding: p.encoding, entries: p.entries, issueLines: p.issues.map((i) => i.line) }, null, 2) + "\n");
}
console.log(`wrote ${Object.keys(cases).length} vectors to ${dir}`);
