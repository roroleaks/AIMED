import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const ROOT = process.cwd();

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const base = path.resolve(ROOT, "src", rel);
      for (const ext of ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"]) {
        const candidate = base + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    if (specifier === "next/server") {
      const candidate = path.resolve(ROOT, "node_modules/next/server.js");
      if (fs.existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
