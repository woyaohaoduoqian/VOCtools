import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const script = join(root, "agent", "tools", "voc_workbench.mjs");
const run = (...args) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
const fails = (...args) => assert.throws(() => run(...args));
const tables = JSON.parse(await readFile(join(root, "agent", "schemas", "tabular-contracts.json"), "utf8")).tables;
const csv = (fields, rows) => `\uFEFF${fields.join(",")}\n${rows.map((row) => fields.map((field) => row[field] ?? "").join(",")).join("\n")}${rows.length ? "\n" : ""}`;
const hash = (content) => createHash("sha256").update(content).digest("hex");
const iso = "2026-01-02T00:00:00.000Z";

const taskRoot = await mkdtemp(join(tmpdir(), "voc-v2-"));
const task = join(taskRoot, "fixture");
run("init", "--root", taskRoot, "--name", "fixture");
const researchFile = join(task, "research.json");
let research = JSON.parse(await readFile(researchFile, "utf8"));
assert.equal(research.schema_version, 2);
assert.equal(research.current_stage, "intake");
assert.match(run("validate", "--task", task), /校验通过/);

// current_stage 与最后记录一致仍不够，非法跳阶段必须被拒绝。
const invalidStageTask = join(taskRoot, "invalid-stage");
run("init", "--root", taskRoot, "--name", "invalid-stage");
const invalidStageFile = join(invalidStageTask, "research.json");
const invalidStageResearch = JSON.parse(await readFile(invalidStageFile, "utf8"));
invalidStageResearch.current_stage = "analysis";
invalidStageResearch.stage_history.push({ stage: "analysis", status: "entered", at: iso, reason: "illegal jump" });
await writeFile(invalidStageFile, `${JSON.stringify(invalidStageResearch, null, 2)}\n`, "utf8");
fails("validate", "--task", invalidStageTask);

const queryRows = [
  {
    query_id: "Q-001", research_question_ids: "RQ-001", query_group: "pain", query_text: "cleaning",
    language: "en", research_purpose: "cleaning friction", include_or_exclude: "include", status: "approved", source: "user", revision_reason: ""
  },
  {
    query_id: "Q-002", research_question_ids: "RQ-001", query_group: "draft", query_text: "cleanup",
    language: "en", research_purpose: "draft alternative", include_or_exclude: "include", status: "draft", source: "agent", revision_reason: "not approved"
  }
];
await writeFile(join(task, "query-plan.csv"), csv(tables.query_plan, queryRows), "utf8");
research.research_questions = [{ research_question_id: "RQ-001", question: "清洁摩擦是什么？", status: "active" }];
research.research_use = "product_problem_improvement";
research.target_users = "使用便携榨汁杯并负责清洁的用户";
research.mode = "exploratory";
research.platform_scope = ["reddit"];
research.content_models = ["threaded-discussion"];
research.sample_target = { analysis_unit: "thread", target: 1, current_qualified_count: 99, inclusion_rules_locked: true, approved_expansion_boundary: "r/test", scope_exhausted: false };
research.current_stage = "collection";
research.status = "running";
research.gates.intake = { status: "passed", result_file: "intake.md" };
research.gates.design = { status: "passed", result_file: "plan.md" };
research.gates.capability = { status: "passed", result_file: "provider-binding.json" };
research.stage_history = [
  { stage: "intake", status: "entered", at: iso, reason: "test" },
  { stage: "design", status: "entered", at: iso, reason: "test" },
  { stage: "capability", status: "entered", at: iso, reason: "test" },
  { stage: "collection", status: "entered", at: iso, reason: "test" }
];
await writeFile(researchFile, `${JSON.stringify(research, null, 2)}\n`, "utf8");

const binding = {
  schema_version: 2, status: "executable", bindings: [{
    requirement_id: "SRC-001", provider_id: "reddit-research-mcp", configured: true, operations_exposed: true,
    authorization_status: "authorized", operation_names: ["search"], missing_capabilities: [], impact: "none", decision: "usable"
  }]
};
await writeFile(join(task, "provider-binding.json"), `${JSON.stringify(binding, null, 2)}\n`, "utf8");
await writeFile(join(task, "source-requirements.json"), `${JSON.stringify({
  schema_version: 2, requirements: [{
    requirement_id: "SRC-001", research_question_ids: ["RQ-001"], platform: "reddit", content_model: "threaded-discussion",
    required_entities: ["thread", "reply"], required_filters: ["query"], required_fields: ["record_id", "text", "permalink"]
  }]
}, null, 2)}\n`, "utf8");
const collectionRunFile = join(task, "collection", "collection-run.json");
let collectionRun = JSON.parse(await readFile(collectionRunFile, "utf8"));
collectionRun.status = "in_progress";
collectionRun.provider_bindings = ["reddit-research-mcp"];
const planContent = await readFile(join(task, "plan.md"));
const queryContent = await readFile(join(task, "query-plan.csv"));
const bindingContent = await readFile(join(task, "provider-binding.json"));
collectionRun.approved_scope = {
  approval_ids: ["APPROVAL-PLAN", "APPROVAL-QUERY", "APPROVAL-BINDING", "APPROVAL-SCOPE"],
  plan_sha256: hash(planContent), query_plan_sha256: hash(queryContent), provider_binding_sha256: hash(bindingContent),
  cost_limit: 0, currency: "USD", expansion_boundary: "r/test"
};
const scopeSnapshot = {
  research_use: research.research_use,
  target_users: research.target_users,
  analysis_unit: research.sample_target.analysis_unit,
  target: research.sample_target.target,
  inclusion_rules_locked: research.sample_target.inclusion_rules_locked,
  expansion_boundary: collectionRun.approved_scope.expansion_boundary,
  cost_limit: collectionRun.approved_scope.cost_limit,
  currency: collectionRun.approved_scope.currency
};
research.approvals = [
  { approval_id: "APPROVAL-PLAN", scope_type: "plan", scope_sha256: hash(planContent), approved_at: iso, status: "approved", scope_summary: "plan v1", cost_limit: null, currency: null },
  { approval_id: "APPROVAL-QUERY", scope_type: "query_plan", scope_sha256: hash(queryContent), approved_at: iso, status: "approved", scope_summary: "Q-001", cost_limit: null, currency: null },
  { approval_id: "APPROVAL-BINDING", scope_type: "provider_binding", scope_sha256: hash(bindingContent), approved_at: iso, status: "approved", scope_summary: "reddit", cost_limit: null, currency: null },
  { approval_id: "APPROVAL-SCOPE", scope_type: "collection_scope", scope_sha256: hash(JSON.stringify(scopeSnapshot)), approved_at: iso, status: "approved", scope_summary: "r/test, 1 thread", cost_limit: 0, currency: "USD" }
];
await writeFile(researchFile, `${JSON.stringify(research, null, 2)}\n`, "utf8");
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");

const rawRef = "collection/raw/REQ-001.json";
const recordRows = [
  { record_id: "R-000001", query_id: "Q-001", request_id: "REQ-001", raw_ref: rawRef, platform: "reddit", content_model: "threaded-discussion", entity_type: "thread", parent_record_id: "not_applicable", permalink: "https://example.test/t1", published_at: "2026-01-01T00:00:00Z", collected_at: iso, text: "清洁困难", author: "a", source_location: "r/test", inclusion_status: "included" },
  { record_id: "R-000002", query_id: "Q-001", request_id: "REQ-001", raw_ref: rawRef, platform: "reddit", content_model: "threaded-discussion", entity_type: "reply", parent_record_id: "R-000001", permalink: "https://example.test/c1", published_at: "2026-01-01T01:00:00Z", collected_at: iso, text: "我也遇到过", author: "b", source_location: "r/test", inclusion_status: "included" }
];
await writeFile(join(task, "collection", "records.csv"), csv(tables.records, recordRows), "utf8");
await writeFile(join(task, "collection", "candidate-log.csv"), csv(tables.candidate_log, [{
  candidate_id: "C-001", query_id: "Q-001", request_id: "REQ-001", record_id: "R-000001", platform: "reddit",
  source_location: "r/test", candidate_url: "https://example.test/t1", status: "included", exclusion_reason: ""
}]), "utf8");

// 有标准记录但没有请求终态和 raw，采集质量必须失败。
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
research = JSON.parse(await readFile(researchFile, "utf8"));
assert.equal(research.sample_target.current_qualified_count, 1, "合格数必须复算，不能相信手填 99");

await writeFile(join(task, rawRef), "{\"ok\":true}\n", "utf8");
let requestEvent = {
  request_id: "REQ-001", run_id: "RUN-wrong-001", query_id: "Q-001", provider_id: "reddit-research-mcp",
  operation: "search", parameters_sha256: "a".repeat(64), response_sha256: hash("{\"ok\":true}\n"), status: "succeeded", started_at: iso,
  finished_at: iso, raw_ref: rawRef, error_type: null, resume_from_request_id: null
};
await writeFile(join(task, "collection", "requests.jsonl"), `${JSON.stringify(requestEvent)}\n`, "utf8");

// 请求不能借用其他运行，raw 哈希也必须真实可复算。
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
requestEvent = { ...requestEvent, run_id: "RUN-fixture-001", response_sha256: "f".repeat(64) };
await writeFile(join(task, "collection", "requests.jsonl"), `${JSON.stringify(requestEvent)}\n`, "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
requestEvent = { ...requestEvent, response_sha256: hash("{\"ok\":true}\n") };
await writeFile(join(task, "collection", "requests.jsonl"), `${JSON.stringify(requestEvent)}\n`, "utf8");

// 未批准查询即使存在于已确认文件中也不能执行。
requestEvent = { ...requestEvent, query_id: "Q-002" };
await writeFile(join(task, "collection", "requests.jsonl"), `${JSON.stringify(requestEvent)}\n`, "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
requestEvent = { ...requestEvent, query_id: "Q-001" };
await writeFile(join(task, "collection", "requests.jsonl"), `${JSON.stringify(requestEvent)}\n`, "utf8");

// 参数、相关性、异常和平台偏差未检查时不能进入分析。
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
collectionRun.observed_checks = Object.fromEntries(["parameters_effective", "relevance_reviewed", "anomalies_reviewed", "platform_bias_reviewed"].map((name) => [name, { status: "passed", notes: "fixture reviewed" }]));
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");
collectionRun.observed_checks.parameters_effective.notes = "";
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
collectionRun.observed_checks.parameters_effective.notes = "fixture reviewed";
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");
collectionRun.approved_scope.cost_limit = 1;
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
collectionRun.approved_scope.cost_limit = 0;
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");
await writeFile(join(task, "collection", "candidate-log.csv"), csv(tables.candidate_log, [
  {
    candidate_id: "C-001", query_id: "Q-001", request_id: "REQ-001", record_id: "R-000001", platform: "reddit",
    source_location: "r/test", candidate_url: "https://example.test/t1", status: "included", exclusion_reason: ""
  },
  {
    candidate_id: "C-002", query_id: "Q-001", request_id: "REQ-001", record_id: "", platform: "reddit",
    source_location: "r/test", candidate_url: "https://example.test/t2", status: "excluded", exclusion_reason: ""
  }
]), "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /unusable/);
await writeFile(join(task, "collection", "candidate-log.csv"), csv(tables.candidate_log, [{
  candidate_id: "C-001", query_id: "Q-001", request_id: "REQ-001", record_id: "R-000001", platform: "reddit",
  source_location: "r/test", candidate_url: "https://example.test/t1", status: "included", exclusion_reason: ""
}]), "utf8");
assert.match(run("quality", "--task", task, "--stage", "collection"), /usable/);

await writeFile(join(task, "analysis-units.csv"), csv(tables.analysis_units, [{
  unit_id: "U-000001", content_model: "threaded-discussion", primary_record_id: "R-000001", primary_code: "CODE-001",
  secondary_codes: "", inclusion_status: "included", dedup_status: "canonical", classification_reason: "明确描述清洁摩擦"
}]), "utf8");
await writeFile(join(task, "evidence-links.csv"), csv(tables.evidence_links, [
  { link_id: "E-000001", unit_id: "U-000001", record_id: "R-000001", code_id: "CODE-001", dimension: "friction", evidence_role: "primary", quote: "清洁困难", reason: "主题证据" },
  { link_id: "E-000002", unit_id: "U-000001", record_id: "R-000002", code_id: "CODE-001", dimension: "consequence", evidence_role: "supporting", quote: "我也遇到过", reason: "回复佐证" }
]), "utf8");
await writeFile(join(task, "codebook.md"), "# 编码表\n\n## CODE-001 清洁摩擦\n\n- 纳入：清洁困难\n- 排除：无\n", "utf8");
await writeFile(join(task, "coding-audit.csv"), csv(tables.coding_audit, []), "utf8");

// 没有二次编码审计不能通过分析质量。
assert.match(run("quality", "--task", task, "--stage", "analysis"), /unusable/);
await writeFile(join(task, "coding-audit.csv"), csv(tables.coding_audit, [{
  audit_id: "AUDIT-001", unit_id: "U-000001", first_code: "CODE-001", review_code: "CODE-001",
  agreement: "yes", resolved_code: "CODE-999", reviewed_at: iso, resolution: "confirmed"
}]), "utf8");
assert.match(run("quality", "--task", task, "--stage", "analysis"), /unusable/);
await writeFile(join(task, "coding-audit.csv"), csv(tables.coding_audit, [
  {
    audit_id: "AUDIT-001", unit_id: "U-000001", first_code: "CODE-001", review_code: "CODE-001",
    agreement: "yes", resolved_code: "CODE-001", reviewed_at: iso, resolution: "confirmed"
  },
  {
    audit_id: "AUDIT-002", unit_id: "U-000001", first_code: "CODE-001", review_code: "CODE-001",
    agreement: "yes", resolved_code: "CODE-001", reviewed_at: iso, resolution: "duplicate audit"
  }
]), "utf8");
assert.match(run("quality", "--task", task, "--stage", "analysis"), /unusable/);
await writeFile(join(task, "coding-audit.csv"), csv(tables.coding_audit, [{
  audit_id: "AUDIT-001", unit_id: "U-000001", first_code: "CODE-001", review_code: "CODE-001",
  agreement: "yes", resolved_code: "CODE-001", reviewed_at: iso, resolution: "confirmed"
}]), "utf8");
assert.match(run("quality", "--task", task, "--stage", "analysis"), /usable/);
run("summarize", "--task", task);
const summary = JSON.parse(await readFile(join(task, "category-summary.json"), "utf8"));
assert.equal(summary.denominator, 1);

research = JSON.parse(await readFile(researchFile, "utf8"));
collectionRun = JSON.parse(await readFile(collectionRunFile, "utf8"));
collectionRun.status = "succeeded";
await writeFile(collectionRunFile, `${JSON.stringify(collectionRun, null, 2)}\n`, "utf8");

const delivery = join(task, "交付"); const human = join(delivery, "交付报告"); const data = join(delivery, "审阅数据");
await mkdir(human, { recursive: true }); await mkdir(data, { recursive: true });
const finding = { finding_id: "F-001", research_question_id: "RQ-001", finding_type: "pattern", fact_statement: "样本内出现清洁摩擦", scope_statement: "本次样本", primary_code: "CODE-001", unit_count: "1", sample_denominator: "1", supporting_link_ids: "E-000001", counterexample_link_ids: "", evidence_level: "single_observation", limitation_ids: "", status: "accepted" };
const hypothesis = { hypothesis_id: "H-001", insight_id: "I-001", proposed_change: "简化清洗", expected_user_outcome: "降低清洗摩擦", supporting_finding_ids: "F-001", unverified_assumptions: "方案可行", validation_needed: "可用性测试", status: "proposed" };
const insightContent = `# I-001 清洁洞察

- 关联发现 IDs：F-001

## 已观察事实

样本中的主题帖明确描述清洁困难。

## 发生场景

使用后需要清理设备时出现。

## 当前替代和卡点

用户只能增加手工清洗步骤。

## 需求解读

样本提示用户希望降低清洗负担，这是一项解释而非已验证购买需求。

## 替代解释

问题也可能来自使用方法不熟悉。

## 证据边界

仅能说明本次公开样本中的表达。

## 关联限制

样本量小，不能外推市场比例。

## 后续待验证问题

通过可用性测试验证简化清洗是否改善体验。
`;
const findingContent = csv(tables.findings, [finding]);
const hypothesisContent = csv(tables.hypotheses, [hypothesis]);
const reportContent = `# 调研报告

## 研究范围与问题

研究清洁摩擦在公开 Reddit 样本中的具体表现。

## 数据来源与方法

使用已确认查询采集公开主题帖与回复，并按 threaded-discussion 模型编码。

## 样本与质量

正式分母为 1 个合格主题帖，回复只作支持证据。

## 发现与证据

F-001 显示样本中出现清洁摩擦，并由 E-000001 支持。

## 限制与待验证

样本量小，不能推断市场规模、购买率或商业结果。
`;
await writeFile(join(task, "findings.csv"), csv(tables.findings, [{ ...finding, unit_count: "2" }]), "utf8");
await writeFile(join(task, "insights.md"), insightContent, "utf8");
await writeFile(join(task, "hypotheses.csv"), hypothesisContent, "utf8");
await writeFile(join(task, "report.md"), reportContent, "utf8");
assert.match(run("quality", "--task", task, "--stage", "synthesis"), /unusable/);
await writeFile(join(task, "findings.csv"), findingContent, "utf8");
assert.match(run("quality", "--task", task, "--stage", "synthesis"), /usable/);
research = JSON.parse(await readFile(researchFile, "utf8"));
assert.equal(research.current_stage, "delivery");
const collectionQualityContent = await readFile(join(task, "quality", "collection-quality.json"));
const analysisQualityContent = await readFile(join(task, "quality", "analysis-quality.json"));
const synthesisQualityContent = await readFile(join(task, "quality", "synthesis-quality.json"));
const qualitySummary = {
  schema_version: 2, profile: "full_insight",
  collection_quality: { decision: "usable", source_file: "quality/collection-quality.json", sha256: hash(collectionQualityContent) },
  analysis_quality: { decision: "usable", source_file: "quality/analysis-quality.json", sha256: hash(analysisQualityContent) },
  synthesis_quality: { decision: "usable", source_file: "quality/synthesis-quality.json", sha256: hash(synthesisQualityContent) }, limitations: []
};
const files = {
  "交付报告/调研报告.md": reportContent,
  "交付报告/完整证据追溯表.md": "# 完整证据追溯表\n\nRQ-001 → Q-001 → R-000001 → U-000001 → E-000001 → F-001 → I-001 → H-001\n",
  "交付报告/数据质量核查报告.md": `# 数据质量核查报告

## 采集质量

采集质量为 usable，raw 和请求哈希可复算。

## 分析质量

分析质量为 usable，编码审计通过。

## 综合质量

综合质量为 usable，发现、洞察和假设关系通过校验。

## 限制

仅有一个正式分析单位。
`,
  "审阅数据/research.json": await readFile(researchFile, "utf8"),
  "审阅数据/数据字典.md": "# 数据字典\n\n记录、分析单位、证据、发现、洞察和假设均使用固定 ID。\n",
  "审阅数据/标准化记录.csv": await readFile(join(task, "collection", "records.csv"), "utf8"),
  "审阅数据/分析单位.csv": await readFile(join(task, "analysis-units.csv"), "utf8"),
  "审阅数据/证据关联.csv": await readFile(join(task, "evidence-links.csv"), "utf8"),
  "审阅数据/发现清单.csv": findingContent,
  "审阅数据/洞察.md": insightContent,
  "审阅数据/产品假设.csv": hypothesisContent,
  "审阅数据/质量检查结果.json": `${JSON.stringify(qualitySummary, null, 2)}\n`
};
for (const [path, content] of Object.entries(files)) {
  await mkdir(join(delivery, path, ".."), { recursive: true });
  await writeFile(join(delivery, path), content, "utf8");
}

// 空质量结果必须被拒绝。
await writeFile(join(data, "质量检查结果.json"), "{}\n", "utf8");
let metadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries({ ...files, "审阅数据/质量检查结果.json": "{}\n" }).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");

await writeFile(join(data, "质量检查结果.json"), files["审阅数据/质量检查结果.json"], "utf8");
metadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(files).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
assert.match(run("validate", "--task", task, "--for-delivery"), /校验通过/);

// 只有标题的空报告不能通过。
const emptyReportContent = "# 调研报告\n";
await writeFile(join(human, "调研报告.md"), emptyReportContent, "utf8");
const emptyReportFiles = { ...files, "交付报告/调研报告.md": emptyReportContent };
const emptyReportMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(emptyReportFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(emptyReportMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(join(human, "调研报告.md"), files["交付报告/调研报告.md"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

// 每张洞察卡必须单独关联发现，不能依赖文档其他位置出现 F- ID。
const badInsightContent = `${files["审阅数据/洞察.md"]}\n# I-002 无证据洞察\n\n- 关联发现 IDs：\n`;
await writeFile(join(data, "洞察.md"), badInsightContent, "utf8");
const badInsightFiles = { ...files, "审阅数据/洞察.md": badInsightContent };
const badInsightMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(badInsightFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(badInsightMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(join(data, "洞察.md"), files["审阅数据/洞察.md"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

// 无法复算的 finding 必须被拒绝。
const badFindingContent = csv(tables.findings, [{ ...finding, unit_count: "2" }]);
await writeFile(join(data, "发现清单.csv"), badFindingContent, "utf8");
const badFiles = { ...files, "审阅数据/发现清单.csv": badFindingContent };
const badMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(badFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(badMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(join(data, "发现清单.csv"), files["审阅数据/发现清单.csv"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

// 发现的事实陈述不能为空。
const emptyFindingContent = csv(tables.findings, [{ ...finding, fact_statement: "" }]);
await writeFile(join(data, "发现清单.csv"), emptyFindingContent, "utf8");
const emptyFindingFiles = { ...files, "审阅数据/发现清单.csv": emptyFindingContent };
const emptyFindingMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(emptyFindingFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(emptyFindingMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(join(data, "发现清单.csv"), files["审阅数据/发现清单.csv"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

// 产品假设必须保留未验证假设和验证方法。
const emptyHypothesisContent = csv(tables.hypotheses, [{ ...hypothesis, validation_needed: "" }]);
await writeFile(join(data, "产品假设.csv"), emptyHypothesisContent, "utf8");
const emptyHypothesisFiles = { ...files, "审阅数据/产品假设.csv": emptyHypothesisContent };
const emptyHypothesisMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(emptyHypothesisFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(emptyHypothesisMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(join(data, "产品假设.csv"), files["审阅数据/产品假设.csv"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

// 缺少查询确认时不得交付。
const badResearch = JSON.parse(files["审阅数据/research.json"]);
badResearch.approvals = badResearch.approvals.filter((approval) => approval.scope_type !== "query_plan");
const badResearchContent = `${JSON.stringify(badResearch, null, 2)}\n`;
await writeFile(researchFile, badResearchContent, "utf8");
await writeFile(join(data, "research.json"), badResearchContent, "utf8");
const approvalFiles = { ...files, "审阅数据/research.json": badResearchContent };
const approvalMetadata = { schema_version: 2, version: "1", generated_at: iso, profile: "full_insight", non_applicable_files: [], files: Object.entries(approvalFiles).map(([path, content]) => ({ path, sha256: hash(content), ...(path.endsWith(".csv") ? { rows: content.trim().split(/\r?\n/).length - 1 } : {}) })) };
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(approvalMetadata, null, 2)}\n`, "utf8");
fails("validate", "--task", task, "--for-delivery");
await writeFile(researchFile, files["审阅数据/research.json"], "utf8");
await writeFile(join(data, "research.json"), files["审阅数据/research.json"], "utf8");
await writeFile(join(data, "交付元数据.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

const archive = join(taskRoot, "delivery.tar.gz");
fails("pack", "--task", task, "--output", archive);
assert.match(run("finalize", "--task", task), /交付已完成/);
assert.equal(JSON.parse(await readFile(researchFile, "utf8")).status, "completed");
assert.match(run("validate", "--task", task, "--for-delivery"), /校验通过/);
run("pack", "--task", task, "--output", archive);
assert.ok((await readFile(archive)).length > 100);

// 三种正式用途必须各自要求对应的多维编码。
async function assertResearchUse(use, dimensions) {
  const rootDir = await mkdtemp(join(tmpdir(), `voc-${use}-`));
  const fixtureTask = join(rootDir, "fixture");
  run("init", "--root", rootDir, "--name", "fixture");
  const fixtureResearchFile = join(fixtureTask, "research.json");
  const fixtureResearch = JSON.parse(await readFile(fixtureResearchFile, "utf8"));
  fixtureResearch.research_use = use;
  fixtureResearch.target_users = "测试目标用户";
  fixtureResearch.current_stage = "analysis";
  fixtureResearch.status = "running";
  fixtureResearch.gates.intake.status = "passed";
  fixtureResearch.gates.design.status = "passed";
  fixtureResearch.gates.capability.status = "passed";
  fixtureResearch.gates.collection_quality.status = "passed";
  fixtureResearch.stage_history = [
    { stage: "intake", status: "entered", at: iso, reason: "test" },
    { stage: "design", status: "entered", at: iso, reason: "test" },
    { stage: "capability", status: "entered", at: iso, reason: "test" },
    { stage: "collection", status: "entered", at: iso, reason: "test" },
    { stage: "collection_quality", status: "entered", at: iso, reason: "test" },
    { stage: "collection_quality", status: "passed", at: iso, reason: "test" },
    { stage: "analysis", status: "entered", at: iso, reason: "test" }
  ];
  await writeFile(fixtureResearchFile, `${JSON.stringify(fixtureResearch, null, 2)}\n`, "utf8");
  await writeFile(join(fixtureTask, "collection", "records.csv"), csv(tables.records, [{ record_id: "R-001", query_id: "unknown", request_id: "unknown", raw_ref: "fixture", platform: "reddit", content_model: "threaded-discussion", entity_type: "thread", parent_record_id: "not_applicable", permalink: "https://example.test/profile", published_at: iso, collected_at: iso, text: "测试证据", author: "a", source_location: "r/test", inclusion_status: "included" }]), "utf8");
  await writeFile(join(fixtureTask, "analysis-units.csv"), csv(tables.analysis_units, [{ unit_id: "U-001", content_model: "threaded-discussion", primary_record_id: "R-001", primary_code: "CODE-001", secondary_codes: "", inclusion_status: "included", dedup_status: "canonical", classification_reason: "测试" }]), "utf8");
  const profileLinks = dimensions.map((dimension, index) => ({ link_id: `E-${index + 1}`, unit_id: "U-001", record_id: "R-001", code_id: "CODE-001", dimension, evidence_role: index ? "supporting" : "primary", quote: "测试证据", reason: "用途维度测试" }));
  await writeFile(join(fixtureTask, "evidence-links.csv"), csv(tables.evidence_links, profileLinks.slice(0, -1)), "utf8");
  await writeFile(join(fixtureTask, "codebook.md"), "# 编码表\n\n## CODE-001 测试编码\n\n- 纳入：测试\n- 排除：无\n", "utf8");
  await writeFile(join(fixtureTask, "coding-audit.csv"), csv(tables.coding_audit, [{ audit_id: "AUDIT-001", unit_id: "U-001", first_code: "CODE-001", review_code: "CODE-001", agreement: "yes", resolved_code: "CODE-001", reviewed_at: iso, resolution: "confirmed" }]), "utf8");
  assert.match(run("quality", "--task", fixtureTask, "--stage", "analysis"), /unusable/);
  fixtureResearch.current_stage = "analysis";
  fixtureResearch.status = "running";
  fixtureResearch.gates.analysis_quality.status = "not_started";
  fixtureResearch.stage_history.push({ stage: "analysis", status: "entered", at: iso, reason: "retry" });
  await writeFile(fixtureResearchFile, `${JSON.stringify(fixtureResearch, null, 2)}\n`, "utf8");
  await writeFile(join(fixtureTask, "evidence-links.csv"), csv(tables.evidence_links, profileLinks), "utf8");
  assert.match(run("quality", "--task", fixtureTask, "--stage", "analysis"), /usable/);
}

await assertResearchUse("user_needs", ["goal_task", "expected_outcome"]);
await assertResearchUse("usage_experience", ["current_approach", "friction"]);
await assertResearchUse("product_problem_improvement", ["friction", "consequence"]);

const legacy = join(await mkdtemp(join(tmpdir(), "voc-v1-")), "legacy");
await cp(join(root, "tests", "fixture"), legacy, { recursive: true });
assert.match(run("migrate", "--task", legacy), /迁移完成/);
const migration = JSON.parse(await readFile(join(legacy, "migration-report.json"), "utf8"));
assert.equal(migration.records_before, migration.records_after);
assert.equal(migration.analysis_units_before, migration.analysis_units_after);
assert.equal(migration.unmatched_coded_rows, 0);
const migratedUnits = await readFile(join(legacy, "analysis-units.csv"), "utf8");
assert.match(migratedUnits, /R-000001/);
console.log("VOC v2 workbench positive and negative tests passed");
