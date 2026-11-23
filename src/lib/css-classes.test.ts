import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function walkTsxFiles(dir: string): string[] {
  const res: string[] = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) res.push(...walkTsxFiles(full));
    else if (f.name.endsWith(".tsx")) res.push(full);
  }
  return res;
}

test("CSS-1. All classNames in JSX must be defined in globals.css", () => {
  const rootDir = path.resolve(import.meta.dirname, "../..");
  const srcDir = path.join(rootDir, "src");
  const cssPath = path.join(srcDir, "app", "globals.css");
  assert.ok(fs.existsSync(cssPath), "globals.css must exist");

  const css = fs.readFileSync(cssPath, "utf8");
  const files = walkTsxFiles(srcDir);

  const classes = new Map<string, string[]>();
  // Dynamic prefixes that are completed at runtime (e.g. source-badge-pubmed, role-tag-population)
  const DYNAMIC_ALLOWLIST = new Set([
    "source-badge-",
    "role-",
    "category-",
    "mode-",
    "level-"
  ]);

  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    // Match static classNames
    const staticMatches = content.matchAll(/className=["']([^"']+)["']/g);
    for (const m of staticMatches) {
      m[1].split(/\s+/).forEach((c) => {
        if (!c) return;
        if (!classes.has(c)) classes.set(c, []);
        classes.get(c)!.push(path.relative(rootDir, f));
      });
    }

    // Match template literal classNames e.g. className={`...`}
    const tmplMatches = content.matchAll(/className=\{`([^`]+)`\}/g);
    for (const m of tmplMatches) {
      // Split on expressions
      const staticParts = m[1].replace(/\$\{[^}]+\}/g, " ").split(/\s+/);
      staticParts.forEach((c) => {
        if (!c || DYNAMIC_ALLOWLIST.has(c)) return;
        if (!classes.has(c)) classes.set(c, []);
        classes.get(c)!.push(path.relative(rootDir, f));
      });
    }
  }

  const missing: Array<{ className: string; files: string[] }> = [];

  for (const [cls, occurrences] of classes.entries()) {
    if (DYNAMIC_ALLOWLIST.has(cls)) continue;
    // Check if .class is defined in globals.css
    const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\." + esc + "(?=[^a-zA-Z0-9_-]|$)", "m");
    if (!re.test(css)) {
      missing.push({ className: cls, files: [...new Set(occurrences)] });
    }
  }

  assert.equal(
    missing.length,
    0,
    `Found undefined CSS classes in JSX:\n${JSON.stringify(missing, null, 2)}`
  );
});
