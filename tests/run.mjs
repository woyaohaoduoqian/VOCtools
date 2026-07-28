import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const task = join(await mkdtemp(join(tmpdir(), "voc-workbench-")), "fixture");
await cp(join(root, "tests", "fixture"), task, { recursive: true });
const script = join(root, "agent", "scripts", "voc_workbench.mjs");
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });

assert.match(run("quality", "--task", task, "--stage", "full"), /可用/);
run("summarize", "--task", task);
assert.match(await readFile(join(task, "category-summary.md"), "utf8"), /\| 清洁 \| 1 \| 50% \|/);
await (await import("node:fs/promises")).writeFile(join(task, "report.md"), "# 测试报告\n", "utf8");
assert.match(run("validate", "--task", task, "--for-report"), /校验通过/);
console.log("VOC workbench tests passed");
