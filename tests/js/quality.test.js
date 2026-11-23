import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

function getJsFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results = results.concat(getJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Architectural Code Quality & Function Boundaries", () => {
  it("should enforce that no function in api/ or public/js/ exceeds 40 lines", () => {
    const targetDirs = [
      path.join(ROOT_DIR, "api"),
      path.join(ROOT_DIR, "public", "js"),
      path.join(ROOT_DIR, "public")
    ];

    const jsFiles = [];
    for (const d of targetDirs) {
      if (fs.existsSync(d)) {
        if (d.endsWith("public")) {
          // only take top-level public/app.js
          const appJs = path.join(d, "app.js");
          if (fs.existsSync(appJs)) jsFiles.push(appJs);
        } else {
          jsFiles.push(...getJsFiles(d));
        }
      }
    }

    const uniqueFiles = [...new Set(jsFiles)];
    const violations = [];

    const funcRegex = /(?:function\s+([a-zA-Z0-9_$]+)?\s*\(|(?:\bconst|\blet|\bvar)?\s*([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|(?:async\s+)?function)/;

    for (const file of uniqueFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (funcRegex.test(line)) {
          let openBrace = false;
          let braceCount = 0;
          let j = i;
          for (; j < lines.length; j++) {
            for (const ch of lines[j]) {
              if (ch === "{") { braceCount++; openBrace = true; }
              else if (ch === "}") { braceCount--; }
            }
            if (openBrace && braceCount === 0) break;
          }
          if (openBrace && braceCount === 0) {
            const count = j - i + 1;
            if (count > 40) {
              const rel = path.relative(ROOT_DIR, file);
              violations.append?.(rel) || violations.push(`${rel}:${i + 1} (${count} lines)`);
            }
          }
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `JavaScript functions exceeding 40 lines:\n${violations.join("\n")}`
    );
  });
});
