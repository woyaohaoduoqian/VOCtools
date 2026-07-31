import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (file) => readFile(resolve(root, file), "utf8");
const json = async (file) => JSON.parse(await text(file));

const registry = await json("agent/providers/registry.json");
assert.equal(registry.schema_version, 2);
assert.equal(registry.providers.find((x) => x.provider_id === "reddit-research-mcp").status, "integrated");
assert.deepEqual(registry.providers.map((x) => x.provider_id), ["reddit-research-mcp"]);

for (const file of [
  "research.schema.json", "source-requirements.schema.json", "provider-binding.schema.json",
  "collection-run.schema.json", "request-event.schema.json", "collection-quality.schema.json", "analysis-quality.schema.json",
  "delivery-metadata.schema.json", "delivery-quality-summary.schema.json", "provider-registry.schema.json", "tabular-contracts.json"
]) await access(resolve(root, "agent/schemas", file));

const core = await text("agent/INSTRUCTIONS.md");
assert.match(core, /先读 `soul\.md`/);
assert.match(core, /workflows\/research-planning\.md/);
for (const forbidden of ["discover_operations", "get_operation_schema", "execute_operation", "OAuth", "https://"]) {
  assert.equal(core.includes(forbidden), false, `generic agent contains ${forbidden}`);
}

const planning = await text("agent/workflows/research-planning.md");
const collection = await text("agent/workflows/data-collection.md");
const quality = await text("agent/workflows/quality-check.md");
const insight = await text("agent/workflows/insight-writing.md");
for (const phrase of ["来源侦察", "关键词组", "平台候选", "画像偏差"]) assert.match(planning, new RegExp(phrase));
for (const phrase of ["行级筛选", "字段缺口", "数据复用", "失败"]) assert.match(collection, new RegExp(phrase));
for (const phrase of ["饱和", "10%", "分子", "分母"]) assert.match(quality, new RegExp(phrase));
for (const phrase of ["来源分为", "禁用", "有限结论"]) assert.match(insight, new RegExp(phrase));

const platform = await text("agent/platforms/reddit.md");
for (const forbidden of ["Provider", "MCP", "OAuth", "接入状态"]) assert.equal(platform.includes(forbidden), false);
const workbench = await text("agent/tools/voc_workbench.mjs");
assert.equal(workbench.includes("query_id,query_group,query_text"), false);
assert.equal(workbench.includes('execFileSync("powershell"'), false);
await assert.rejects(access(resolve(root, ".agents/plugins/marketplace.json")));
assert.match(await text("integrations/codex/marketplace.json"), /plugins\/voc-research-agent/);
const ci = await text(".github/workflows/verify.yml");
assert.match(ci, /tests\/codex-integration\.mjs/);
assert.equal(ci.includes("plugin-contract.mjs"), false);
assert.equal(ci.includes("sync-plugin.ps1"), false);

const output = await mkdtemp(join(tmpdir(), "voctools-codex-"));
try {
  execFileSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", resolve(root, "integrations/codex/package.ps1"),
    "-OutputRoot", output
  ], { encoding: "utf8" });
  const pkg = join(output, "plugins/voc-research-agent");
  const generatedSkill = await readFile(join(pkg, "skills/voc-research-agent/SKILL.md"), "utf8");
  assert.match(generatedSkill, /^---\r?\nname: voctools/m);
  assert.match(generatedSkill, /# VOC 调研智能体/);
  const generatedManifest = JSON.parse(await readFile(join(pkg, ".codex-plugin/plugin.json"), "utf8"));
  const sourceManifest = await json("integrations/codex/plugin.json");
  assert.match(generatedManifest.version, new RegExp(`^${sourceManifest.version.replaceAll(".", "\\.")}\\+codex\\.\\d{17}$`));
  assert.deepEqual({ ...generatedManifest, version: sourceManifest.version }, sourceManifest);
  assert.deepEqual(JSON.parse(await readFile(join(pkg, ".mcp.json"), "utf8")), await json("integrations/codex/mcp.json"));
  assert.deepEqual(JSON.parse(await readFile(join(output, ".agents/plugins/marketplace.json"), "utf8")), await json("integrations/codex/marketplace.json"));
  await access(join(pkg, "skills/voc-research-agent/workflows/quality-check.md"));
  execFileSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", resolve(root, "integrations/codex/package.ps1"),
    "-OutputRoot", output
  ], { encoding: "utf8" });
  const regeneratedManifest = JSON.parse(await readFile(join(pkg, ".codex-plugin/plugin.json"), "utf8"));
  assert.notEqual(regeneratedManifest.version, generatedManifest.version, "每次打包必须生成新的 cachebuster");
} finally {
  await rm(output, { recursive: true, force: true });
}

console.log("Core architecture and Codex integration contract passed");
