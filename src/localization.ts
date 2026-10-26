// V2 to V4, V13: localization data (`localization.json`), the translation files the runtime reads, CSV for translators, pseudo-localization.
// Pure functions only. The C++ runtime mirrors `parseTranslationFile` by hand and is kept in step by `Inkwell-Runtime/test-vectors/translations/`.
import { z } from "zod";

/** Skyrim's full upper-case language names (Skyrim.ini `sLanguage`). Other names are accepted by the schema (a patch or a future language). */
export const SKYRIM_LANGUAGES = ["ENGLISH", "FRENCH", "GERMAN", "ITALIAN", "SPANISH", "RUSSIAN", "POLISH", "JAPANESE", "CZECH"] as const;
export const LANGUAGE = /^[A-Z]{3,20}$/;
export const LOC_KEY = /^\$[A-Za-z0-9_]{1,96}$/;
/** The key prefix without `$`: `Inkwell_MyMod`. */
export const LOC_NAMESPACE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** The mod name in `Interface/Translations/<Mod>_<LANGUAGE>.txt` and in the menu JSON `translations`. */
export const TRANSLATION_MOD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const Language = z.string().regex(LANGUAGE, "language must be an upper case name such as ENGLISH");
const LocKeySchema = z.string().regex(LOC_KEY, "key must be $ followed by letters, digits or _ (at most 96)");

/** V2.3 `localization.json`, next to the project's overlay. Unknown keys survive. */
export const Localization = z
  .looseObject({
    specVersion: z.number().int(),
    namespace: z.string().regex(LOC_NAMESPACE),
    source: Language,
    languages: z.array(Language).min(1),
    entries: z.record(LocKeySchema, z.record(Language, z.string())).default({}),
  })
  .refine((l) => l.languages.includes(l.source), { message: "source must be one of languages", path: ["source"] })
  .refine((l) => new Set(l.languages).size === l.languages.length, { message: "languages must be unique", path: ["languages"] });
export type Localization = z.infer<typeof Localization>;

/** Path of a translation file relative to `Data/`. */
export const translationPath = (mod: string, language: string): string => `Interface/Translations/${mod}_${language}.txt`;

// ---- translation file (V3, V13.2) --------------------------------------------------------------------------------
/** A line break in the text is the two characters `\n`; a backslash is `\\`. Tabs are not allowed in a text (they separate key and text): `writeTranslationFile` turns each into one space. */
const escapeText = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/\t/g, " ");
const unescapeText = (s: string): string => s.replace(/\\(.)/g, (_m, c: string) => (c === "n" ? "\n" : c));

/** UTF-16 LE with a BOM, `KEY<TAB>text` per line, CRLF. Keys must be valid; entries are written in the given order. */
export function writeTranslationFile(entries: Record<string, string>): Uint8Array {
  const lines = Object.entries(entries).map(([k, v]) => {
    if (!LOC_KEY.test(k)) throw new Error(`invalid translation key ${JSON.stringify(k)}`);
    return `${k}\t${escapeText(v)}\r\n`;
  });
  const text = lines.join("");
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

export type TranslationIssue = { line: number; message: string };
export type ParsedTranslations = { entries: Record<string, string>; encoding: "utf-16le" | "utf-16be" | "utf-8"; issues: TranslationIssue[] };

/**
 * The runtime's reader. Encoding by BOM: FF FE = UTF-16 LE, FE FF = UTF-16 BE, EF BB BF = UTF-8; no BOM = UTF-8. Lines end CRLF, LF or CR; blank lines
 * and lines starting `;` or `#` are skipped; a line needs a TAB after a `$KEY`; the first TAB splits, later tabs stay in the text. A later duplicate key wins
 * and is reported. Malformed lines are issues, never an exception.
 */
export function parseTranslationFile(bytes: Uint8Array): ParsedTranslations {
  let encoding: ParsedTranslations["encoding"] = "utf-8";
  let text: string;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  } else {
    const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    text = new TextDecoder("utf-8").decode(bytes.subarray(start));
  }
  const entries: Record<string, string> = {};
  const issues: TranslationIssue[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, i) => {
    const line = i + 1;
    if (raw === "" || raw.startsWith(";") || raw.startsWith("#")) return;
    const tab = raw.indexOf("\t");
    if (tab < 0) return void issues.push({ line, message: "no TAB between key and text" });
    const key = raw.slice(0, tab);
    if (!LOC_KEY.test(key)) return void issues.push({ line, message: `invalid key ${JSON.stringify(key.slice(0, 40))}` });
    if (key in entries) issues.push({ line, message: `duplicate key ${key}, the later line wins` });
    entries[key] = unescapeText(raw.slice(tab + 1));
  });
  return { entries, encoding, issues };
}

/** The text of one language: the language's entry, else the source language's (V3: the player never sees a raw key). `fallbacks` counts the keys that used the source text. */
export function entriesFor(loc: Localization, language: string): { entries: Record<string, string>; fallbacks: string[] } {
  const entries: Record<string, string> = {};
  const fallbacks: string[] = [];
  for (const [key, row] of Object.entries(loc.entries)) {
    const own = row[language];
    if (own !== undefined && own !== "") entries[key] = own;
    else {
      entries[key] = row[loc.source] ?? "";
      if (language !== loc.source) fallbacks.push(key);
    }
  }
  return { entries, fallbacks };
}

// ---- CSV for translators (V3) ------------------------------------------------------------------------------------
const csvCell = (s: string): string => (/[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s);

/** UTF-8 text with a BOM, header `key,<LANGUAGE>...` (source language first), CRLF. Line breaks inside a cell are real line breaks inside quotes. */
export function toCsv(loc: Localization): string {
  const langs = [loc.source, ...loc.languages.filter((l) => l !== loc.source)];
  const rows = [["key", ...langs], ...Object.entries(loc.entries).map(([k, row]) => [k, ...langs.map((l) => row[l] ?? "")])];
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180 reader (quotes, doubled quotes, line breaks in quotes). Throws on an unterminated quote. A leading BOM is ignored. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let any = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") { quoted = true; any = true; }
    else if (c === ",") { row.push(cell); cell = ""; any = true; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      if (any || cell !== "") { row.push(cell); rows.push(row); }
      row = []; cell = ""; any = false;
    } else { cell += c; any = true; }
  }
  if (quoted) throw new Error("unterminated quote in CSV");
  if (any || cell !== "") { row.push(cell); rows.push(row); }
  return rows;
}

export type CsvImport = { languages: string[]; entries: Record<string, Record<string, string>>; issues: string[] };
/** Reads the table `toCsv` writes: a `key` column and one column per language. Rows with an invalid key and columns with an invalid language are issues and skipped. */
export function fromCsv(text: string): CsvImport {
  const rows = parseCsv(text);
  const issues: string[] = [];
  const head = rows[0];
  if (!head || head[0]?.trim().toLowerCase() !== "key") return { languages: [], entries: {}, issues: ["the first column must be named key"] };
  const cols = head.slice(1).map((h) => h.trim().toUpperCase());
  cols.forEach((c) => { if (!LANGUAGE.test(c)) issues.push(`column ${JSON.stringify(c)} is not a language name`); });
  const entries: Record<string, Record<string, string>> = {};
  rows.slice(1).forEach((r, i) => {
    const key = (r[0] ?? "").trim();
    if (!LOC_KEY.test(key)) return void issues.push(`row ${i + 2}: invalid key ${JSON.stringify(key.slice(0, 40))}`);
    const out: Record<string, string> = {};
    cols.forEach((c, j) => { if (LANGUAGE.test(c) && r[j + 1] !== undefined && r[j + 1] !== "") out[c] = r[j + 1]!; });
    entries[key] = out;
  });
  return { languages: cols.filter((c) => LANGUAGE.test(c)), entries, issues };
}

// ---- keys, pseudo-localization -----------------------------------------------------------------------------------
/** `$<namespace>_<LayerName>` from a layer name: words become PascalCase, other characters drop out, an empty name becomes `Text`. Capped so the key stays valid. */
export function suggestKey(namespace: string, layerName: string): string {
  const words = layerName.normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const body = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("") || "Text";
  return `$${namespace}_${body}`.slice(0, 97);
}
/** `base`, or `base_2`, `base_3`... until it is not in `taken` (compared case-insensitively, as the engine does). */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const t = new Set([...taken].map((k) => k.toLowerCase()));
  if (!t.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const k = `${base.slice(0, 97 - String(n).length - 1)}_${n}`;
    if (!t.has(k.toLowerCase())) return k;
  }
}

const ACCENT: Record<string, string> = { a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", y: "ý", s: "š", z: "ž", A: "Å", E: "É", I: "Î", O: "Ø", U: "Ü", C: "Ç", N: "Ñ", Y: "Ý", S: "Š", Z: "Ž" };
/** V4. Accents the letters, pads with `·` to ceil(length * 1.35) and wraps in [ ]; `{placeholders}`, `$KEYS` and line breaks stay as they are. */
export function pseudoLocalize(text: string): string {
  let out = "";
  for (const part of text.split(/(\{[^}]*\}|\$[A-Za-z0-9_]+|\r\n|\n|\r)/)) {
    out += /^(\{|\$|\r|\n)/.test(part) ? part : part.replace(/[A-Za-z]/g, (c) => ACCENT[c] ?? c);
  }
  const target = Math.ceil(text.length * 1.35);
  return `[${out}${"·".repeat(Math.max(0, target - text.length))}]`;
}
