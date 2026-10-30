/**
 * Dev-time audit helper: finds exports in src/ that nothing else in src/ imports,
 * and names the ones only tests touch. Run: node scripts/dead-exports.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const src = walk("src").filter((f) => f.endsWith(".ts"));
const others = [...walk("tests"), ...walk("e2e"), ...walk("scripts")].filter((f) => /\.(ts|mjs)$/.test(f));
const read = (f) => readFileSync(f, "utf8");
const source = new Map(src.map((f) => [f, read(f)]));

const DECL = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_]+)/g;
const TYPEDECL = /export\s+(?:interface|type)\s+([A-Za-z0-9_]+)/g;

const rows = [];
for (const [file, text] of source) {
  for (const re of [DECL, TYPEDECL]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1];
      const word = new RegExp("\\b" + name + "\\b", "g");
      const prodConsumers = [];
      for (const [other, otext] of source) {
        if (other === file) continue;
        if (word.test(otext)) prodConsumers.push(relative("src", other));
      }
      const testConsumers = others.filter((f) => word.test(read(f))).map((f) => relative(".", f));
      const ownUses = (text.match(word) || []).length - 1;
      if (prodConsumers.length === 0) rows.push({ file: relative("src", file), name, ownUses, testConsumers });
    }
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
console.log("Exports with no consumer inside src/:\n");
for (const r of rows) {
  const kind = r.ownUses > 0 ? "used only inside its own file" : "not referenced anywhere in its own file";
  const t = r.testConsumers.length ? "tests only: " + r.testConsumers.join(" ") : "no test uses it either";
  console.log(`  ${r.file}:${r.name}  [${kind}]  ${t}`);
}
console.log(`\n${rows.length} exports with no cross-file production consumer.`);
