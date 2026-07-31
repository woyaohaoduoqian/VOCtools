#!/usr/bin/env node
/** VOC v2 本地工作台：只创建、迁移、复算和校验文件，不访问网络或凭证。 */
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const agentRoot = resolve(import.meta.dirname, "..");
const now = () => new Date().toISOString();
const exists = (file) => access(file, constants.F_OK).then(() => true).catch(() => false);
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? "" : process.argv[i + 1] || ""; };
const die = (message) => { console.error(`错误: ${message}`); process.exit(2); };
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const idToken = (value) => String(value).normalize("NFKC").replace(/^RESEARCH-/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || sha256(String(value)).slice(0, 12);
const tableFields = (await readJson(join(agentRoot, "schemas", "tabular-contracts.json"))).tables;

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]; const n = text[i + 1];
    if (c === '"' && quoted && n === '"') { cell += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i += 1;
      row.push(cell); if (row.some((v) => v !== "")) rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  row.push(cell); if (row.some((v) => v !== "")) rows.push(row);
  const [rawHeader = [], ...body] = rows;
  const fields = rawHeader.map((v) => v.replace(/^\uFEFF/, "").trim());
  return { fields, rows: body.map((values) => Object.fromEntries(fields.map((field, i) => [field, values[i] ?? ""]))) };
}

const quote = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (fields, rows) => `\uFEFF${fields.join(",")}\n${rows.map((row) => fields.map((field) => quote(row[field])).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
const readCsv = async (file) => parseCsv(await readFile(file, "utf8"));
const duplicates = (values) => [...new Set(values.filter(Boolean).filter((value, i, all) => all.indexOf(value) !== i))];

function schemaErrors(value, schema, path = "$", rootSchema = schema) {
  if (schema.$ref?.startsWith("#/")) {
    const target = schema.$ref.slice(2).split("/").reduce((current, key) => current?.[key], rootSchema);
    return target ? schemaErrors(value, target, path, rootSchema) : [`${path} 无法解析 ${schema.$ref}`];
  }
  const errors = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (types.length && !types.includes(actual) && !(types.includes("number") && ["integer", "number"].includes(actual))) errors.push(`${path} 类型应为 ${types.join("|")}，实际为 ${actual}`);
  if ("const" in schema && value !== schema.const) errors.push(`${path} 必须为 ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} 不是允许的枚举值`);
  if (schema.pattern && typeof value === "string" && !(new RegExp(schema.pattern).test(value))) errors.push(`${path} 不匹配 ${schema.pattern}`);
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) errors.push(`${path} 长度小于 ${schema.minLength}`);
  if (schema.minimum !== undefined && typeof value === "number" && value < schema.minimum) errors.push(`${path} 小于 ${schema.minimum}`);
  if (schema.format === "date-time" && typeof value === "string" && Number.isNaN(Date.parse(value))) errors.push(`${path} 不是有效日期时间`);
  if (actual === "object") {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key} 缺失`);
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) errors.push(...schemaErrors(value[key], child, `${path}.${key}`, rootSchema));
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) errors.push(`${path}.${key} 是未允许字段`);
  }
  if (actual === "array") {
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} 包含重复项`);
    if (schema.items) value.forEach((item, i) => errors.push(...schemaErrors(item, schema.items, `${path}[${i}]`, rootSchema)));
  }
  return errors;
}

async function validateJson(file, schemaName) {
  const value = await readJson(file);
  const schema = await readJson(join(agentRoot, "schemas", schemaName));
  return schemaErrors(value, schema).map((error) => `${file}: ${error}`);
}

async function readJsonLines(file) {
  const content = await readFile(file, "utf8");
  const rows = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { throw new Error(`${file}:${index + 1} 不是有效 JSON`); }
  }
  return rows;
}

const headerErrors = (parsed, expected, label) => {
  const missing = expected.filter((field) => !parsed.fields.includes(field));
  const extra = parsed.fields.filter((field) => !expected.includes(field));
  return [...(missing.length ? [`${label} 缺少字段：${missing.join("、")}`] : []), ...(extra.length ? [`${label} 存在未定义字段：${extra.join("、")}`] : [])];
};
const splitIds = (value) => String(value || "").split(/[|;,，\s]+/).map((x) => x.trim()).filter(Boolean);
const meaningful = (value) => String(value || "").replace(/[\s#*_`>|-]/g, "").length > 0;
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stages = ["intake", "design", "capability", "collection", "collection_quality", "analysis", "analysis_quality", "synthesis", "delivery"];
const relativeExists = (task, ref) => {
  if (!ref) return Promise.resolve(false);
  if (String(ref).startsWith("legacy:")) return Promise.resolve(true);
  const root = resolve(task); const target = resolve(root, ref);
  if (target !== root && !target.startsWith(`${root}\\`) && !target.startsWith(`${root}/`)) return Promise.resolve(false);
  return exists(target);
};
const pushHistory = (research, stage, status, reason) => research.stage_history.push({ stage, status, at: now(), reason });
const observedCheckTemplate = () => ({
  parameters_effective: { status: "not_checked", notes: "" },
  relevance_reviewed: { status: "not_checked", notes: "" },
  anomalies_reviewed: { status: "not_checked", notes: "" },
  platform_bias_reviewed: { status: "not_checked", notes: "" }
});

function stageHistoryErrors(research) {
  const errors = [];
  const history = research.stage_history || [];
  for (let i = 0; i < history.length; i += 1) {
    const current = history[i]; const previous = history[i - 1];
    if (!previous) {
      if (current.stage !== "intake" || current.status !== "entered") errors.push("stage_history 必须从 intake/entered 开始");
      continue;
    }
    const from = stages.indexOf(previous.stage); const to = stages.indexOf(current.stage);
    if (current.status === "returned" && to >= from) errors.push(`stage_history[${i}] returned 必须回到更早阶段`);
    else if (current.status === "entered" && !(to === from || to === from + 1)) errors.push(`stage_history[${i}] entered 只能进入当前或下一阶段`);
    else if (["passed", "blocked", "completed"].includes(current.status) && to !== from) errors.push(`stage_history[${i}] ${current.status} 必须记录在当前阶段`);
  }
  if (history.at(-1)?.stage !== research.current_stage) errors.push("current_stage 与 stage_history 最后一项不一致");
  return errors;
}

const gatePassed = (gate) => ["passed", "passed_with_limitations"].includes(gate?.status);
function coreStageGateErrors(research) {
  const errors = [];
  const index = stages.indexOf(research.current_stage);
  if (index >= stages.indexOf("collection")) {
    for (const gate of ["intake", "design", "capability"]) if (!gatePassed(research.gates?.[gate])) errors.push(`进入 ${research.current_stage} 前 ${gate} 闸门未通过`);
  }
  if (index >= stages.indexOf("analysis") && !gatePassed(research.gates?.collection_quality)) errors.push(`进入 ${research.current_stage} 前 collection_quality 闸门未通过`);
  return errors;
}

const collectionScopeSnapshot = (research, run) => ({
  analysis_unit: research.sample_target.analysis_unit,
  target: research.sample_target.target,
  inclusion_rules_locked: research.sample_target.inclusion_rules_locked,
  expansion_boundary: run.approved_scope.expansion_boundary,
  cost_limit: run.approved_scope.cost_limit,
  currency: run.approved_scope.currency
});

async function collectionAuthorizationErrors(task, research, run, binding) {
  const errors = [];
  const active = research.approvals.filter((approval) => approval.status === "approved");
  const hashes = {
    plan: sha256(await readFile(join(task, "plan.md"))),
    query_plan: sha256(await readFile(join(task, "query-plan.csv"))),
    provider_binding: sha256(await readFile(join(task, "provider-binding.json")))
  };
  for (const [type, hash] of Object.entries(hashes)) {
    const approval = active.find((item) => item.scope_type === type && item.scope_sha256 === hash);
    if (!approval) errors.push(`${type} 缺少与当前文件一致的有效确认`);
    else if (!run.approved_scope.approval_ids.includes(approval.approval_id)) errors.push(`collection-run 未引用确认 ${approval.approval_id}`);
  }
  const scopeHash = sha256(JSON.stringify(collectionScopeSnapshot(research, run)));
  const scopeApproval = active.find((item) => item.scope_type === "collection_scope" && item.scope_sha256 === scopeHash);
  if (!scopeApproval) errors.push("collection_scope 确认与当前样本、成本或扩样边界不一致");
  else {
    if (!run.approved_scope.approval_ids.includes(scopeApproval.approval_id)) errors.push(`collection-run 未引用确认 ${scopeApproval.approval_id}`);
    if (scopeApproval.cost_limit !== run.approved_scope.cost_limit || scopeApproval.currency !== run.approved_scope.currency) errors.push("collection_scope 成本上限或币种与运行不一致");
  }
  if (research.sample_target.approved_expansion_boundary !== run.approved_scope.expansion_boundary) errors.push("采集扩样边界与 research.json 不一致");
  if (binding.status !== "executable") errors.push("Provider 绑定不是 executable");
  if (run.approved_scope.plan_sha256 !== hashes.plan || run.approved_scope.query_plan_sha256 !== hashes.query_plan || run.approved_scope.provider_binding_sha256 !== hashes.provider_binding) errors.push("collection-run 批准范围哈希与当前文件不一致");
  return errors;
}

const researchTemplate = (name) => ({
  schema_version: 2,
  research_id: `RESEARCH-${idToken(name)}`,
  title: name,
  current_stage: "intake",
  status: "draft",
  mode: "unknown",
  platform_scope: [],
  content_models: [],
  research_questions: [],
  files: {
    intake: "intake.md",
    plan: "plan.md",
    source_requirements: "source-requirements.json",
    query_plan: "query-plan.csv",
    provider_binding: "provider-binding.json",
    collection_run: "collection/collection-run.json"
  },
  gates: {
    intake: { status: "pending", result_file: "intake.md" },
    design: { status: "not_started", result_file: "plan.md" },
    capability: { status: "not_started", result_file: "provider-binding.json" },
    collection_quality: { status: "not_started", result_file: "quality/collection-quality.json" },
    analysis_quality: { status: "not_started", result_file: "quality/analysis-quality.json" },
    delivery: { status: "not_started", result_file: "交付/审阅数据/交付元数据.json" }
  },
  sample_target: {
    analysis_unit: "unknown",
    target: null,
    current_qualified_count: 0,
    inclusion_rules_locked: false,
    approved_expansion_boundary: "unknown",
    scope_exhausted: false
  },
  approvals: [],
  stage_history: [{ stage: "intake", status: "entered", at: now(), reason: "task_initialized" }],
  limitations: []
});

async function initializeTask(task, name) {
  await mkdir(join(task, "collection", "raw"), { recursive: true });
  await mkdir(join(task, "quality"), { recursive: true });
  await cp(join(agentRoot, "templates", "intake.md"), join(task, "intake.md"));
  await cp(join(agentRoot, "templates", "plan.md"), join(task, "plan.md"));
  await writeJson(join(task, "research.json"), researchTemplate(name));
  await writeJson(join(task, "source-requirements.json"), { schema_version: 2, requirements: [] });
  await writeJson(join(task, "provider-binding.json"), { schema_version: 2, status: "pending", bindings: [] });
  await writeFile(join(task, "query-plan.csv"), toCsv(tableFields.query_plan, []), "utf8");
  await writeJson(join(task, "collection", "collection-run.json"), {
    schema_version: 2, run_id: `RUN-${idToken(name)}-001`, research_id: `RESEARCH-${idToken(name)}`, provider_bindings: [], status: "planned",
    approved_scope: { approval_ids: [], plan_sha256: "", query_plan_sha256: "", provider_binding_sha256: "", cost_limit: null, currency: null, expansion_boundary: "unknown" },
    observed_checks: observedCheckTemplate(),
    request_log: "collection/requests.jsonl", raw_root: "collection/raw", started_at: null, finished_at: null, errors: []
  });
  await writeFile(join(task, "collection", "requests.jsonl"), "", "utf8");
  await writeFile(join(task, "collection", "records.csv"), toCsv(tableFields.records, []), "utf8");
  await writeFile(join(task, "collection", "candidate-log.csv"), toCsv(tableFields.candidate_log, []), "utf8");
  await writeFile(join(task, "collection", "run.md"), `# 采集执行记录\n\n- 创建时间：${now()}\n- 状态：等待方案、查询、能力和授权确认。\n`, "utf8");
}

async function init() {
  const root = resolve(arg("--root") || "调研文件"); const name = arg("--name"); if (!name) die("init 需要 --name");
  const task = join(root, name); if (await exists(task)) die(`任务目录已存在: ${task}`);
  await initializeTask(task, name); console.log(task);
}

async function collectionQuality(task) {
  const records = await readCsv(join(task, "collection", "records.csv"));
  const candidates = await readCsv(join(task, "collection", "candidate-log.csv"));
  const events = await readJsonLines(join(task, "collection", "requests.jsonl"));
  const research = await readJson(join(task, "research.json"));
  const historyErrors = stageHistoryErrors(research);
  if (historyErrors.length) die(`任务阶段历史无效：${historyErrors.join("；")}`);
  if (!["collection", "collection_quality"].includes(research.current_stage)) die(`当前阶段 ${research.current_stage} 不能执行采集质量检查`);
  const run = await readJson(join(task, "collection", "collection-run.json"));
  const binding = await readJson(join(task, "provider-binding.json"));
  const queryPlan = await readCsv(join(task, "query-plan.csv"));
  const eventSchema = await readJson(join(agentRoot, "schemas", "request-event.schema.json"));
  const runSchema = await readJson(join(agentRoot, "schemas", "collection-run.schema.json"));
  const traceErrors = [
    ...headerErrors(records, tableFields.records, "records.csv"),
    ...headerErrors(candidates, tableFields.candidate_log, "candidate-log.csv"),
    ...events.flatMap((event, index) => schemaErrors(event, eventSchema, `requests.jsonl[${index}]`)),
    ...schemaErrors(run, runSchema, "collection-run.json")
  ];
  traceErrors.push(...coreStageGateErrors(research));
  traceErrors.push(...await collectionAuthorizationErrors(task, research, run, binding));
  const queryIds = new Set(queryPlan.rows.map((row) => row.query_id));
  const boundProviders = new Set(binding.bindings.filter((item) => item.decision === "usable").map((item) => item.provider_id));
  if (run.research_id !== research.research_id) traceErrors.push("collection-run research_id 与任务不一致");
  if (!["in_progress", "succeeded"].includes(run.status)) traceErrors.push(`collection-run 状态不可质检：${run.status}`);
  for (const providerId of run.provider_bindings) if (!boundProviders.has(providerId)) traceErrors.push(`collection-run 引用未通过绑定的 Provider：${providerId}`);
  for (const event of events) {
    if (event.run_id !== run.run_id) traceErrors.push(`${event.request_id} 的 run_id 与当前运行不一致`);
    if (!run.provider_bindings.includes(event.provider_id) || !boundProviders.has(event.provider_id)) traceErrors.push(`${event.request_id} 的 provider_id 未获本次运行授权`);
    if (!queryIds.has(event.query_id)) traceErrors.push(`${event.request_id} 引用不存在查询 ${event.query_id}`);
  }
  if (!records.rows.length) traceErrors.push("records.csv 没有数据行");
  const includedRows = records.rows.filter((row) => row.inclusion_status === "included");
  const invalidStatuses = records.rows.filter((row) => !["included", "excluded", "uncertain"].includes(row.inclusion_status)).map((row) => row.record_id);
  if (invalidStatuses.length) traceErrors.push(`无效 inclusion_status：${invalidStatuses.join("、")}`);
  const completeness = Object.fromEntries(tableFields.records.map((field) => [field, +(includedRows.filter((row) => String(row[field] ?? "").trim()).length / Math.max(includedRows.length, 1) * 100).toFixed(2)]));
  const ids = new Set(records.rows.map((row) => row.record_id));
  const relationshipErrors = records.rows.filter((row) => row.entity_type === "reply" && (!row.parent_record_id || !ids.has(row.parent_record_id))).map((row) => row.record_id);
  const duplicateIds = duplicates(records.rows.map((row) => row.record_id));
  const duplicatePermalinks = duplicates(records.rows.map((row) => row.permalink));
  const duplicateRate = +(duplicateIds.length / Math.max(records.rows.length, 1) * 100).toFixed(2);
  const permalinkDuplicateRate = +(duplicatePermalinks.length / Math.max(records.rows.length, 1) * 100).toFixed(2);
  const finalEventById = new Map(events.map((event) => [event.request_id, event]));
  const succeeded = [...finalEventById.values()].filter((event) => event.status === "succeeded");
  for (const event of succeeded) {
    if (!event.raw_ref || !await relativeExists(task, event.raw_ref)) traceErrors.push(`${event.request_id} 的成功事件没有可用 raw_ref`);
    else {
      const actualHash = sha256(await readFile(resolve(task, event.raw_ref)));
      if (!event.response_sha256 || event.response_sha256 !== actualHash) traceErrors.push(`${event.request_id} 的 raw 响应哈希不一致`);
    }
  }
  for (const candidate of candidates.rows) {
    if (!["included", "excluded", "uncertain"].includes(candidate.status)) traceErrors.push(`${candidate.candidate_id} 状态无效`);
    if (candidate.request_id && !finalEventById.has(candidate.request_id)) traceErrors.push(`${candidate.candidate_id} 引用不存在请求`);
    if (candidate.query_id && !queryIds.has(candidate.query_id)) traceErrors.push(`${candidate.candidate_id} 引用不存在查询`);
    if (candidate.status === "included" && (!candidate.record_id || !ids.has(candidate.record_id))) traceErrors.push(`${candidate.candidate_id} 未关联纳入记录`);
    if (["excluded", "uncertain"].includes(candidate.status) && !candidate.exclusion_reason?.trim()) traceErrors.push(`${candidate.candidate_id} 缺少排除或存疑原因`);
  }
  for (const row of includedRows) {
    const event = finalEventById.get(row.request_id);
    if (!event || event.status !== "succeeded") traceErrors.push(`${row.record_id} 未关联成功请求`);
    if (!row.raw_ref || !await relativeExists(task, row.raw_ref)) traceErrors.push(`${row.record_id} 的 raw_ref 不存在`);
    if (event?.raw_ref && row.raw_ref !== event.raw_ref) traceErrors.push(`${row.record_id} 与请求 ${row.request_id} 的 raw_ref 不一致`);
  }
  const rawRoot = join(task, "collection", "raw");
  const rawResponseCount = await exists(rawRoot) ? (await readdir(rawRoot, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).length : 0;
  const limitations = [];
  const observedChecks = run.observed_checks || observedCheckTemplate();
  const incompleteObservedChecks = Object.entries(observedChecks).filter(([, check]) => !["passed", "passed_with_limitations"].includes(check?.status)).map(([name]) => name);
  const undocumentedObservedChecks = Object.entries(observedChecks).filter(([, check]) => ["passed", "passed_with_limitations"].includes(check?.status) && !meaningful(check.notes)).map(([name]) => name);
  const limitedObservedChecks = Object.entries(observedChecks).filter(([, check]) => check?.status === "passed_with_limitations").map(([name, check]) => `${name}：${check.notes || "存在限制"}`);
  if (incompleteObservedChecks.length) traceErrors.push(`采集观察项未通过：${incompleteObservedChecks.join("、")}`);
  if (undocumentedObservedChecks.length) traceErrors.push(`采集观察项缺少说明：${undocumentedObservedChecks.join("、")}`);
  limitations.push(...limitedObservedChecks);
  if (duplicateIds.length) limitations.push(`重复 record_id：${duplicateIds.join("、")}`);
  if (duplicatePermalinks.length) limitations.push(`重复 permalink：${duplicatePermalinks.length}`);
  const target = research.sample_target || {};
  const targetNumber = Number(target.target);
  const hasTarget = Number.isFinite(targetNumber) && targetNumber > 0;
  const unitType = target.analysis_unit === "unknown" && research.content_models.includes("threaded-discussion") ? "thread" : target.analysis_unit;
  const qualifiedRows = includedRows.filter((row) => unitType === "unknown" || row.entity_type === unitType);
  const qualified = new Set(qualifiedRows.map((row) => row.permalink || row.record_id)).size;
  research.sample_target.current_qualified_count = qualified;
  const targetUnmet = hasTarget && qualified < targetNumber;
  if (targetUnmet) limitations.push(`样本目标未达成：${qualified}/${targetNumber}`);
  const sources = new Map();
  for (const row of qualifiedRows) sources.set(row.source_location || "unknown", (sources.get(row.source_location || "unknown") || 0) + 1);
  const sourceCounts = [...sources].sort((a, b) => b[1] - a[1]);
  const topSource = sourceCounts[0] || ["unknown", 0];
  const topShare = qualified ? +(topSource[1] / qualified * 100).toFixed(2) : 0;
  if (topShare > 70 && qualified > 1) limitations.push(`来源集中：${topSource[0]} 占 ${topShare}%`);
  const published = includedRows.map((row) => row.published_at).filter(Boolean).sort();
  const requiredFields = ["record_id", "query_id", "request_id", "raw_ref", "platform", "content_model", "entity_type", "permalink", "published_at", "collected_at", "text", "inclusion_status"];
  const missingCritical = requiredFields.filter((field) => completeness[field] < 100);
  let decision = "usable";
  if (missingCritical.length || relationshipErrors.length || traceErrors.length || !qualified) decision = "unusable";
  else if (targetUnmet && !target.scope_exhausted) decision = "collection_incomplete";
  else if (targetUnmet || limitations.length || Object.values(completeness).some((rate) => rate < 80)) decision = "usable_with_limitations";
  const result = {
    schema_version: 2, checked_at: now(), decision, record_count: records.rows.length, included_record_count: includedRows.length,
    candidate_count: candidates.rows.length, request_event_count: events.length, succeeded_request_count: succeeded.length, raw_response_count: rawResponseCount,
    observed_checks: observedChecks,
    field_completeness: completeness, relationship_errors: relationshipErrors, trace_errors: traceErrors,
    duplicate_rate: duplicateRate, permalink_duplicate_rate: permalinkDuplicateRate,
    source_concentration: { top_source: topSource[0], top_count: topSource[1], top_share_percent: topShare, source_count: sources.size },
    time_coverage: { earliest: published[0] || null, latest: published.at(-1) || null },
    sample_target: hasTarget ? targetNumber : null, qualified_units: qualified, limitations,
    next_step: decision === "collection_incomplete" ? "resume_approved_scope" : decision === "unusable" ? "return_to_collection_or_design" : "build_analysis_units"
  };
  await writeJson(join(task, "quality", "collection-quality.json"), result);
  await writeFile(join(task, "quality", "collection-quality.md"), `# 采集质量检查\n\n- 判定：${decision}\n- 标准化记录：${records.rows.length}\n- 合格主单位：${qualified}\n- 成功请求：${succeeded.length}\n- raw 文件：${rawResponseCount}\n- 追溯错误：${traceErrors.length}\n- 父子关系错误：${relationshipErrors.length}\n- 限制：${limitations.length ? limitations.join("；") : "无"}\n`, "utf8");
  research.gates.collection_quality = { status: decision === "usable" ? "passed" : decision === "usable_with_limitations" ? "passed_with_limitations" : decision === "collection_incomplete" ? "pending" : "failed", result_file: "quality/collection-quality.json" };
  if (research.stage_history.at(-1)?.stage !== "collection_quality") pushHistory(research, "collection_quality", "entered", "collection_quality_started");
  pushHistory(research, "collection_quality", decision === "unusable" ? "blocked" : ["usable", "usable_with_limitations"].includes(decision) ? "passed" : "completed", decision);
  research.current_stage = ["usable", "usable_with_limitations"].includes(decision) ? "analysis" : decision === "collection_incomplete" ? "collection" : "collection_quality";
  research.status = ["usable", "usable_with_limitations", "collection_incomplete"].includes(decision) ? "running" : "blocked";
  if (research.current_stage !== "collection_quality") pushHistory(research, research.current_stage, decision === "collection_incomplete" ? "returned" : "entered", decision);
  await writeJson(join(task, "research.json"), research); console.log(decision);
}

async function analysisQuality(task) {
  const research = await readJson(join(task, "research.json"));
  const historyErrors = stageHistoryErrors(research);
  if (historyErrors.length) die(`任务阶段历史无效：${historyErrors.join("；")}`);
  if (!["analysis", "analysis_quality"].includes(research.current_stage)) die(`当前阶段 ${research.current_stage} 不能执行分析质量检查`);
  const gateErrors = coreStageGateErrors(research);
  if (gateErrors.length) die(`分析质量检查前置闸门无效：${gateErrors.join("；")}`);
  const records = await readCsv(join(task, "collection", "records.csv"));
  const units = await readCsv(join(task, "analysis-units.csv"));
  const links = await readCsv(join(task, "evidence-links.csv"));
  const audits = await readCsv(join(task, "coding-audit.csv"));
  const codebook = await readFile(join(task, "codebook.md"), "utf8");
  const codeIds = new Set(codebook.match(/\bCODE-[A-Za-z0-9._-]+\b/g) || []);
  const recordById = new Map(records.rows.map((row) => [row.record_id, row]));
  const unitById = new Map(units.rows.map((row) => [row.unit_id, row]));
  const unitIds = new Set(units.rows.map((row) => row.unit_id));
  const duplicateUnitIds = duplicates(units.rows.map((row) => row.unit_id));
  const duplicatePrimaryRecords = duplicates(units.rows.filter((row) => row.inclusion_status === "included").map((row) => row.primary_record_id));
  const invalidPrimaryCodes = units.rows.filter((row) => row.inclusion_status === "included" && (!row.primary_code || row.primary_code === "unknown" || (row.primary_code !== "uncategorized" && !codeIds.has(row.primary_code)))).map((row) => row.unit_id);
  const replyUnits = units.rows.filter((row) => recordById.get(row.primary_record_id)?.entity_type === "reply").map((row) => row.unit_id);
  const validRoles = new Set(["primary", "supporting", "counterexample", "context", "exclusion_basis"]);
  const invalidEvidenceLinks = links.rows.filter((row) => !unitIds.has(row.unit_id) || !recordById.has(row.record_id) || !validRoles.has(row.evidence_role) || (row.code_id && !codeIds.has(row.code_id))).map((row) => row.link_id);
  const quoteMismatches = links.rows.filter((row) => row.quote && !String(recordById.get(row.record_id)?.text || "").includes(row.quote)).map((row) => row.link_id);
  const included = units.rows.filter((row) => row.inclusion_status === "included");
  const includedUnitIds = new Set(included.map((row) => row.unit_id));
  const missingPrimaryLinks = included.filter((unit) => !links.rows.some((link) => link.unit_id === unit.unit_id && link.record_id === unit.primary_record_id && link.evidence_role === "primary")).map((unit) => unit.unit_id);
  const uncategorized = included.filter((row) => ["uncategorized", "unknown", ""].includes(row.primary_code)).length;
  const uncategorizedRate = included.length ? +(uncategorized / included.length * 100).toFixed(2) : 0;
  const auditRequired = included.length ? Math.max(1, Math.ceil(included.length * 0.1)) : 0;
  const duplicateAuditIds = duplicates(audits.rows.map((row) => row.audit_id));
  const duplicateAuditUnits = duplicates(audits.rows.map((row) => row.unit_id));
  const invalidAudits = audits.rows.filter((row) => {
    const agreementValid = ["yes", "no"].includes(row.agreement) && (row.agreement === "yes") === (row.first_code === row.review_code);
    const resolutionValid = codeIds.has(row.resolved_code)
      && row.resolved_code === unitById.get(row.unit_id)?.primary_code
      && (row.agreement !== "no" || Boolean(row.resolution?.trim()));
    return !includedUnitIds.has(row.unit_id) || !codeIds.has(row.first_code) || !codeIds.has(row.review_code) || !agreementValid || !resolutionValid;
  }).map((row) => row.audit_id);
  const validAudits = audits.rows.filter((row) => !invalidAudits.includes(row.audit_id));
  const auditCompleted = new Set(validAudits.map((row) => row.unit_id)).size;
  const auditDisagreements = validAudits.filter((row) => row.agreement === "no").length;
  const auditCoverage = included.length ? +(auditCompleted / included.length * 100).toFixed(2) : 0;
  const auditUnreliable = auditCompleted < auditRequired || (auditCompleted && auditDisagreements / auditCompleted > 0.2);
  const fatal = [...headerErrors(units, tableFields.analysis_units, "analysis-units.csv"), ...headerErrors(links, tableFields.evidence_links, "evidence-links.csv"), ...headerErrors(audits, tableFields.coding_audit, "coding-audit.csv"), ...duplicateUnitIds, ...duplicatePrimaryRecords, ...invalidPrimaryCodes, ...replyUnits, ...invalidEvidenceLinks, ...missingPrimaryLinks, ...quoteMismatches, ...duplicateAuditIds, ...duplicateAuditUnits, ...invalidAudits];
  if (!included.length) fatal.push("没有纳入分析单位");
  if (!codeIds.size) fatal.push("codebook.md 没有 CODE ID");
  if (auditUnreliable) fatal.push("二次编码覆盖不足或分歧率超过 20%");
  const limitations = uncategorizedRate > 30 ? [`未归类比例为 ${uncategorizedRate}%`] : [];
  const decision = fatal.length ? "unusable" : limitations.length ? "usable_with_limitations" : "usable";
  const result = {
    schema_version: 2, checked_at: now(), decision, unit_count: units.rows.length, included_unit_count: included.length, duplicate_unit_ids: duplicateUnitIds,
    duplicate_primary_records: duplicatePrimaryRecords, invalid_primary_codes: [...new Set([...invalidPrimaryCodes, ...replyUnits])],
    invalid_evidence_links: invalidEvidenceLinks, missing_primary_links: missingPrimaryLinks, quote_mismatches: quoteMismatches, uncategorized_rate: uncategorizedRate,
    audit_required: auditRequired, audit_completed: auditCompleted, audit_disagreements: auditDisagreements, audit_coverage: auditCoverage, limitations,
    next_step: decision === "unusable" ? "return_to_analysis" : "generate_findings"
  };
  await writeJson(join(task, "quality", "analysis-quality.json"), result);
  await writeFile(join(task, "quality", "analysis-quality.md"), `# 分析质量检查\n\n- 判定：${decision}\n- 分析单位：${units.rows.length}\n- 无效项：${fatal.length}\n- 未归类比例：${uncategorizedRate}%\n- 二次编码：${auditCompleted}/${auditRequired}，分歧 ${auditDisagreements}\n- 限制：${limitations.length ? limitations.join("；") : "无"}\n`, "utf8");
  research.gates.analysis_quality = { status: decision === "usable" ? "passed" : decision === "usable_with_limitations" ? "passed_with_limitations" : "failed", result_file: "quality/analysis-quality.json" };
  if (research.stage_history.at(-1)?.stage !== "analysis_quality") pushHistory(research, "analysis_quality", "entered", "analysis_quality_started");
  pushHistory(research, "analysis_quality", decision === "unusable" ? "blocked" : "passed", decision);
  research.current_stage = decision === "unusable" ? "analysis_quality" : "synthesis"; research.status = decision === "unusable" ? "blocked" : "running";
  if (research.current_stage === "synthesis") pushHistory(research, "synthesis", "entered", decision);
  await writeJson(join(task, "research.json"), research); console.log(decision);
}

async function quality() {
  const task = resolve(arg("--task")); const stage = arg("--stage");
  if (!task || !["collection", "analysis"].includes(stage)) die("quality 需要 --task 和 --stage collection|analysis");
  if (stage === "collection") await collectionQuality(task); else await analysisQuality(task);
}

async function summarize() {
  const task = resolve(arg("--task")); if (!task) die("summarize 需要 --task");
  const units = await readCsv(join(task, "analysis-units.csv"));
  const included = units.rows.filter((row) => row.inclusion_status === "included" && row.dedup_status !== "duplicate");
  const counts = new Map(); for (const row of included) counts.set(row.primary_code || "uncategorized", (counts.get(row.primary_code || "uncategorized") || 0) + 1);
  const categories = [...counts].sort((a, b) => b[1] - a[1]).map(([primary_code, count]) => ({ primary_code, count, percentage: included.length ? +(count / included.length * 100).toFixed(2) : 0 }));
  await writeJson(join(task, "category-summary.json"), { schema_version: 2, generated_at: now(), source: "analysis-units.csv", denominator: included.length, categories });
  console.log(join(task, "category-summary.json"));
}

const deliveryCsvHeaders = {
  "标准化记录.csv": tableFields.records,
  "分析单位.csv": tableFields.analysis_units,
  "证据关联.csv": tableFields.evidence_links,
  "发现清单.csv": tableFields.findings,
  "产品假设.csv": tableFields.hypotheses
};

function parseInsightCards(text) {
  const matches = [...text.matchAll(/^#{1,6}\s+(I-[A-Za-z0-9._-]+)\b.*$/gm)];
  return matches.map((match, index) => {
    const body = text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length);
    const findingLine = body.match(/^\s*[-*]?\s*关联发现\s*IDs?\s*[：:]\s*(.*)$/mi);
    return { insight_id: match[1], finding_ids: splitIds(findingLine?.[1] || ""), body };
  });
}

function sectionContent(text, heading) {
  const match = new RegExp(`^#{2,6}\\s+${escapeRegex(heading)}\\s*$`, "mi").exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length);
  return rest.slice(0, /^#{1,6}\s+/m.exec(rest)?.index ?? rest.length).trim();
}

async function walkFiles(root, base = root) {
  const output = [];
  if (!await exists(root)) return output;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(full, base));
    else output.push(full.slice(base.length + 1).replaceAll("\\", "/"));
  }
  return output;
}

async function deliveryErrors(task, { allowPendingDelivery = true } = {}) {
  const errors = []; const human = join(task, "交付", "交付报告"); const data = join(task, "交付", "审阅数据");
  for (const file of ["调研报告.md", "完整证据追溯表.md", "数据质量核查报告.md"]) if (!await exists(join(human, file))) errors.push(`交付报告缺少 ${file}`);
  for (const file of ["research.json", "数据字典.md", "标准化记录.csv", "质量检查结果.json", "交付元数据.json"]) if (!await exists(join(data, file))) errors.push(`审阅数据缺少 ${file}`);
  if (errors.length) return errors;
  const metadata = await readJson(join(data, "交付元数据.json"));
  errors.push(...schemaErrors(metadata, await readJson(join(agentRoot, "schemas", "delivery-metadata.schema.json")), "交付元数据"));
  const profile = metadata.profile || "full_insight";
  const fullFiles = ["分析单位.csv", "证据关联.csv", "发现清单.csv", "洞察.md", "产品假设.csv"];
  if (profile === "full_insight") for (const file of fullFiles) if (!await exists(join(data, file))) errors.push(`审阅数据缺少 ${file}`);
  if (profile === "dataset_only") for (const file of fullFiles) if (!metadata.non_applicable_files?.includes(`审阅数据/${file}`)) errors.push(`dataset_only 未声明不适用：${file}`);
  if (errors.length) return errors;
  const requiredCsv = profile === "dataset_only" ? ["标准化记录.csv"] : Object.keys(deliveryCsvHeaders);
  for (const file of requiredCsv) {
    if (!await exists(join(data, file))) { errors.push(`审阅数据缺少 ${file}`); continue; }
    const content = await readFile(join(data, file), "utf8"); const parsed = parseCsv(content);
    const missing = deliveryCsvHeaders[file].filter((field) => !parsed.fields.includes(field));
    if (missing.length) errors.push(`${file} 缺少字段：${missing.join("、")}`);
    const item = metadata.files.find((entry) => entry.path === `审阅数据/${file}`);
    if (!item) errors.push(`交付元数据缺少 ${file}`); else {
      if (item.sha256 !== sha256(content)) errors.push(`${file} 哈希不一致`);
      if (item.rows !== parsed.rows.length) errors.push(`${file} 行数不一致`);
    }
  }
  const actualFiles = (await walkFiles(join(task, "交付"))).filter((file) => file !== "审阅数据/交付元数据.json");
  for (const file of actualFiles) {
    const content = await readFile(join(task, "交付", file)); const item = metadata.files.find((entry) => entry.path === file);
    if (!item) errors.push(`交付元数据缺少 ${file}`); else if (item.sha256 !== sha256(content)) errors.push(`${file} 哈希不一致`);
  }
  for (const item of metadata.files || []) if (!actualFiles.includes(item.path)) errors.push(`交付元数据引用不存在文件：${item.path}`);

  const deliveredResearch = await readJson(join(data, "research.json"));
  errors.push(...schemaErrors(deliveredResearch, await readJson(join(agentRoot, "schemas", "research.schema.json")), "交付 research.json"));
  if (await readFile(join(data, "research.json"), "utf8") !== await readFile(join(task, "research.json"), "utf8")) errors.push("交付 research.json 不是当前任务快照");
  if (deliveredResearch.current_stage !== "delivery" || deliveredResearch.stage_history.at(-1)?.stage !== "delivery") errors.push("交付前任务必须进入 delivery 阶段");
  if (allowPendingDelivery) {
    if (!["running", "completed"].includes(deliveredResearch.status) || !["pending", "passed"].includes(deliveredResearch.gates?.delivery?.status)) errors.push("交付任务状态必须为 running/pending 或 completed/passed");
  } else if (deliveredResearch.status !== "completed" || deliveredResearch.gates?.delivery?.status !== "passed" || deliveredResearch.stage_history.at(-1)?.status !== "completed") errors.push("任务尚未完成交付终态");
  const collectionGate = deliveredResearch.gates?.collection_quality?.status;
  if (!["passed", "passed_with_limitations"].includes(collectionGate)) errors.push("采集质量闸门未通过");
  if (profile === "full_insight" && !["passed", "passed_with_limitations"].includes(deliveredResearch.gates?.analysis_quality?.status)) errors.push("分析质量闸门未通过");

  const qualitySummary = await readJson(join(data, "质量检查结果.json"));
  errors.push(...schemaErrors(qualitySummary, await readJson(join(agentRoot, "schemas", "delivery-quality-summary.schema.json")), "质量检查结果"));
  if (qualitySummary.profile !== profile) errors.push("质量检查结果 profile 与交付元数据不一致");
  const sourceCollectionPath = join(task, "quality", "collection-quality.json");
  if (!await exists(sourceCollectionPath)) errors.push("缺少源采集质量结果");
  else {
    const sourceCollectionContent = await readFile(sourceCollectionPath);
    const sourceCollectionQuality = JSON.parse(sourceCollectionContent);
    if (qualitySummary.collection_quality?.decision !== sourceCollectionQuality.decision || !["usable", "usable_with_limitations"].includes(sourceCollectionQuality.decision)) errors.push("交付采集质量与源质量结果不一致或不可交付");
    if (qualitySummary.collection_quality?.sha256 !== sha256(sourceCollectionContent)) errors.push("交付采集质量哈希与源结果不一致");
  }
  if (profile === "full_insight") {
    const sourceAnalysisPath = join(task, "quality", "analysis-quality.json");
    if (!await exists(sourceAnalysisPath)) errors.push("缺少源分析质量结果");
    else {
      const sourceAnalysisContent = await readFile(sourceAnalysisPath);
      const sourceAnalysisQuality = JSON.parse(sourceAnalysisContent);
      if (qualitySummary.analysis_quality?.decision !== sourceAnalysisQuality.decision || !["usable", "usable_with_limitations"].includes(sourceAnalysisQuality.decision)) errors.push("交付分析质量与源质量结果不一致或不可交付");
      if (qualitySummary.analysis_quality?.sha256 !== sha256(sourceAnalysisContent)) errors.push("交付分析质量哈希与源结果不一致");
    }
  }

  const reportText = await readFile(join(human, "调研报告.md"), "utf8");
  for (const heading of ["研究范围与问题", "数据来源与方法", "样本与质量", "发现与证据", "限制与待验证"]) if (!meaningful(sectionContent(reportText, heading))) errors.push(`调研报告缺少有效章节：${heading}`);
  const qualityText = await readFile(join(human, "数据质量核查报告.md"), "utf8");
  for (const heading of profile === "full_insight" ? ["采集质量", "分析质量", "限制"] : ["采集质量", "限制"]) if (!meaningful(sectionContent(qualityText, heading))) errors.push(`数据质量核查报告缺少有效章节：${heading}`);
  const traceText = await readFile(join(human, "完整证据追溯表.md"), "utf8");
  for (const prefix of profile === "full_insight" ? ["RQ-", "R-", "U-", "E-", "F-", "I-"] : ["RQ-", "R-"]) if (!traceText.includes(prefix)) errors.push(`完整证据追溯表缺少 ${prefix} 关系`);

  if (profile === "full_insight") {
    const records = await readCsv(join(data, "标准化记录.csv"));
    const units = await readCsv(join(data, "分析单位.csv"));
    const links = await readCsv(join(data, "证据关联.csv"));
    const findings = await readCsv(join(data, "发现清单.csv"));
    const hypotheses = await readCsv(join(data, "产品假设.csv"));
    const rqIds = new Set(deliveredResearch.research_questions.filter((rq) => rq.status === "active").map((rq) => rq.research_question_id));
    const recordIds = new Set(records.rows.map((row) => row.record_id));
    const unitIds = new Set(units.rows.map((row) => row.unit_id));
    const linkIds = new Set(links.rows.map((row) => row.link_id));
    const limitationIds = new Set(deliveredResearch.limitations.map((item) => item.limitation_id));
    const findingIds = new Set(findings.rows.map((row) => row.finding_id));
    const primaryCodes = new Set(units.rows.map((row) => row.primary_code).filter(Boolean));
    if (!findings.rows.length) errors.push("完整洞察交付没有发现");
    for (const id of duplicates(findings.rows.map((row) => row.finding_id))) errors.push(`发现 ID 重复 ${id}`);
    for (const unit of units.rows) if (!recordIds.has(unit.primary_record_id)) errors.push(`${unit.unit_id} 引用不存在记录`);
    for (const link of links.rows) if (!unitIds.has(link.unit_id) || !recordIds.has(link.record_id)) errors.push(`${link.link_id} 证据关系无效`);
    for (const finding of findings.rows) {
      for (const field of ["finding_id", "research_question_id", "finding_type", "fact_statement", "scope_statement", "primary_code", "unit_count", "sample_denominator", "evidence_level", "status"]) if (!meaningful(finding[field])) errors.push(`${finding.finding_id || "未知发现"} 缺少 ${field}`);
      if (!finding.finding_id?.startsWith("F-")) errors.push("发现 ID 无效");
      if (finding.status !== "accepted") errors.push(`${finding.finding_id} 不是 accepted 状态`);
      if (!primaryCodes.has(finding.primary_code)) errors.push(`${finding.finding_id} 主类别不存在`);
      if (!["single_observation", "repeated_pattern", "stable_within_sample", "insufficient_data"].includes(finding.evidence_level)) errors.push(`${finding.finding_id} 证据等级无效`);
      if (!rqIds.has(finding.research_question_id)) errors.push(`${finding.finding_id} 引用不存在研究问题`);
      const supportingIds = splitIds(finding.supporting_link_ids);
      if (finding.evidence_level !== "insufficient_data" && !supportingIds.length) errors.push(`${finding.finding_id} 没有支持证据`);
      for (const id of [...supportingIds, ...splitIds(finding.counterexample_link_ids)]) if (!linkIds.has(id)) errors.push(`${finding.finding_id} 引用不存在证据 ${id}`);
      for (const id of splitIds(finding.limitation_ids)) if (!limitationIds.has(id)) errors.push(`${finding.finding_id} 引用不存在限制 ${id}`);
      const counted = units.rows.filter((unit) => unit.inclusion_status === "included" && unit.dedup_status !== "duplicate" && unit.primary_code === finding.primary_code).length;
      const denominator = units.rows.filter((unit) => unit.inclusion_status === "included" && unit.dedup_status !== "duplicate").length;
      if (Number(finding.unit_count) !== counted || Number(finding.sample_denominator) !== denominator) errors.push(`${finding.finding_id} 分子或分母不可复算`);
    }
    const insightText = await readFile(join(data, "洞察.md"), "utf8");
    const insightCards = parseInsightCards(insightText);
    const insightIds = new Set(insightCards.map((card) => card.insight_id));
    for (const id of duplicates(insightCards.map((card) => card.insight_id))) errors.push(`洞察 ID 重复 ${id}`);
    for (const card of insightCards) {
      if (!card.finding_ids.length) errors.push(`${card.insight_id} 没有关联发现`);
      for (const id of card.finding_ids) if (!findingIds.has(id)) errors.push(`${card.insight_id} 引用不存在发现 ${id}`);
      for (const heading of ["已观察事实", "发生场景", "当前替代和卡点", "需求解读", "替代解释", "证据边界", "关联限制", "后续待验证问题"]) if (!meaningful(sectionContent(card.body, heading))) errors.push(`${card.insight_id} 缺少有效章节：${heading}`);
    }
    if (!insightIds.size) errors.push("洞察.md 没有以标题声明的 I- ID");
    for (const id of duplicates(hypotheses.rows.map((row) => row.hypothesis_id))) errors.push(`产品假设 ID 重复 ${id}`);
    for (const hypothesis of hypotheses.rows) {
      for (const field of ["hypothesis_id", "insight_id", "proposed_change", "expected_user_outcome", "supporting_finding_ids", "unverified_assumptions", "validation_needed", "status"]) if (!meaningful(hypothesis[field])) errors.push(`${hypothesis.hypothesis_id || "未知假设"} 缺少 ${field}`);
      if (!hypothesis.hypothesis_id?.startsWith("H-")) errors.push("产品假设 ID 无效");
      if (hypothesis.status !== "proposed") errors.push(`${hypothesis.hypothesis_id} 必须保持 proposed`);
      if (!insightIds.has(hypothesis.insight_id)) errors.push(`${hypothesis.hypothesis_id} 引用不存在洞察`);
      const supportingFindingIds = splitIds(hypothesis.supporting_finding_ids);
      if (!supportingFindingIds.length) errors.push(`${hypothesis.hypothesis_id} 没有关联发现`);
      for (const id of supportingFindingIds) if (!findingIds.has(id)) errors.push(`${hypothesis.hypothesis_id} 引用不存在发现 ${id}`);
    }
  }
  return errors;
}

async function validate() {
  const task = resolve(arg("--task")); if (!task) die("validate 需要 --task");
  const errors = [];
  if (!await exists(join(task, "research.json"))) {
    if (await exists(join(task, "manifest.json"))) errors.push("检测到 v1 任务；先运行 migrate，不得按 v2 静默解释");
    else errors.push("缺少 research.json");
  } else {
    errors.push(...await validateJson(join(task, "research.json"), "research.schema.json"));
    errors.push(...await validateJson(join(task, "source-requirements.json"), "source-requirements.schema.json"));
    errors.push(...await validateJson(join(task, "provider-binding.json"), "provider-binding.schema.json"));
    errors.push(...await validateJson(join(task, "collection", "collection-run.json"), "collection-run.schema.json"));
    const research = await readJson(join(task, "research.json"));
    const rqIds = new Set(research.research_questions.map((rq) => rq.research_question_id));
    if (rqIds.size !== research.research_questions.length) errors.push("research_questions 包含重复 ID");
    if (duplicates(research.approvals.map((approval) => approval.approval_id)).length) errors.push("approvals 包含重复 ID");
    errors.push(...stageHistoryErrors(research));
    errors.push(...coreStageGateErrors(research));
    const sourceRequirements = await readJson(join(task, "source-requirements.json"));
    for (const requirement of sourceRequirements.requirements) for (const id of requirement.research_question_ids) if (!rqIds.has(id)) errors.push(`${requirement.requirement_id} 引用不存在研究问题 ${id}`);
    const requirementIds = new Set(sourceRequirements.requirements.map((requirement) => requirement.requirement_id));
    const providerBinding = await readJson(join(task, "provider-binding.json"));
    for (const binding of providerBinding.bindings) if (!requirementIds.has(binding.requirement_id)) errors.push(`Provider 绑定引用不存在来源需求 ${binding.requirement_id}`);
    const queryPlan = await readCsv(join(task, "query-plan.csv"));
    const records = await readCsv(join(task, "collection", "records.csv"));
    const candidates = await readCsv(join(task, "collection", "candidate-log.csv"));
    errors.push(...headerErrors(queryPlan, tableFields.query_plan, "query-plan.csv"));
    errors.push(...headerErrors(records, tableFields.records, "records.csv"));
    errors.push(...headerErrors(candidates, tableFields.candidate_log, "candidate-log.csv"));
    for (const query of queryPlan.rows) {
      const linked = splitIds(query.research_question_ids);
      if (!linked.length) errors.push(`${query.query_id} 未关联研究问题`);
      for (const id of linked) if (!rqIds.has(id)) errors.push(`${query.query_id} 引用不存在研究问题 ${id}`);
    }
    const queryIds = new Set(queryPlan.rows.map((query) => query.query_id));
    for (const record of records.rows) if (record.query_id !== "unknown" && !queryIds.has(record.query_id)) errors.push(`${record.record_id} 引用不存在查询 ${record.query_id}`);
    const requestEvents = await readJsonLines(join(task, "collection", "requests.jsonl"));
    const requestSchema = await readJson(join(agentRoot, "schemas", "request-event.schema.json"));
    requestEvents.forEach((event, index) => errors.push(...schemaErrors(event, requestSchema, `requests.jsonl[${index}]`)));
    const requestIds = new Set(requestEvents.map((event) => event.request_id));
    for (const record of records.rows) if (record.request_id && record.request_id !== "unknown" && !requestIds.has(record.request_id)) errors.push(`${record.record_id} 引用不存在请求 ${record.request_id}`);
    const collectionRun = await readJson(join(task, "collection", "collection-run.json"));
    const allowedProviders = new Set(providerBinding.bindings.filter((item) => item.decision === "usable").map((item) => item.provider_id));
    for (const event of requestEvents) {
      if (event.run_id !== collectionRun.run_id) errors.push(`${event.request_id} 的 run_id 与 collection-run 不一致`);
      if (!collectionRun.provider_bindings.includes(event.provider_id) || !allowedProviders.has(event.provider_id)) errors.push(`${event.request_id} 的 Provider 不属于当前可用绑定`);
      if (!queryIds.has(event.query_id)) errors.push(`${event.request_id} 引用不存在查询 ${event.query_id}`);
    }
    const finalEvents = new Map(requestEvents.map((event) => [event.request_id, event]));
    for (const event of finalEvents.values()) {
      if (event.status !== "succeeded") continue;
      if (!event.raw_ref || !await relativeExists(task, event.raw_ref)) errors.push(`${event.request_id} 缺少 raw 响应`);
      else if (!event.response_sha256 || event.response_sha256 !== sha256(await readFile(resolve(task, event.raw_ref)))) errors.push(`${event.request_id} 的 raw 响应哈希不一致`);
    }
    if (await exists(join(task, "quality", "collection-quality.json"))) errors.push(...await validateJson(join(task, "quality", "collection-quality.json"), "collection-quality.schema.json"));
    if (await exists(join(task, "quality", "analysis-quality.json"))) errors.push(...await validateJson(join(task, "quality", "analysis-quality.json"), "analysis-quality.schema.json"));
    if (process.argv.includes("--for-delivery")) {
      const run = collectionRun;
      if (run.status !== "succeeded") errors.push("collection-run 尚未成功完成");
      errors.push(...await collectionAuthorizationErrors(task, research, run, providerBinding));
    }
  }
  const registry = await readJson(join(agentRoot, "providers", "registry.json"));
  errors.push(...schemaErrors(registry, await readJson(join(agentRoot, "schemas", "provider-registry.schema.json")), "provider-registry"));
  if (await exists(join(task, "provider-binding.json"))) {
    const providerIds = new Set(registry.providers.filter((provider) => provider.status === "integrated").map((provider) => provider.provider_id));
    const binding = await readJson(join(task, "provider-binding.json"));
    for (const item of binding.bindings) if (!providerIds.has(item.provider_id)) errors.push(`Provider 绑定引用非正式 Provider ${item.provider_id}`);
  }
  for (const provider of registry.providers) {
    const docPath = join(agentRoot, "providers", provider.doc);
    if (!await exists(docPath) || provider.doc === "_template.md") errors.push(`Provider ${provider.provider_id} 没有独立文档`);
    else {
      const doc = await readFile(docPath, "utf8");
      for (const expected of [`provider_id: ${provider.provider_id}`, `type: ${provider.type}`, `status: ${provider.status}`]) if (!doc.includes(expected)) errors.push(`${provider.provider_id} 文档与 registry 不一致：${expected}`);
    }
  }
  if (process.argv.includes("--for-delivery")) errors.push(...await deliveryErrors(task));
  if (errors.length) { console.log(`校验未通过：\n- ${errors.join("\n- ")}`); process.exit(1); }
  console.log("校验通过");
}

async function migrate() {
  const task = resolve(arg("--task")); if (!task || !await exists(join(task, "manifest.json"))) die("migrate 需要含 manifest.json 的 v1 --task");
  if (await exists(join(task, "research.json"))) die("目标已包含 v2 research.json");
  const manifest = await readJson(join(task, "manifest.json")); const name = manifest.research_id || basename(task);
  await mkdir(join(task, "collection", "raw"), { recursive: true }); await mkdir(join(task, "quality"), { recursive: true });
  const research = researchTemplate(name); research.current_stage = "analysis_quality"; research.status = "blocked";
  research.limitations.push({ limitation_id: "L-MIGRATION-001", statement: "本任务由 v1 迁移；正式交付前必须重新执行 v2 两级质量检查。", applies_to: ["research"], status: "open" });
  for (const stage of stages.slice(1, stages.indexOf("analysis_quality") + 1)) pushHistory(research, stage, "entered", "v1_migration_history_reconstructed");
  pushHistory(research, "analysis_quality", "blocked", "v1_migration_requires_review");
  await writeJson(join(task, "research.json"), research);
  await writeJson(join(task, "source-requirements.json"), { schema_version: 2, requirements: [] });
  await writeJson(join(task, "provider-binding.json"), { schema_version: 2, status: "pending", bindings: [] });
  if (!await exists(join(task, "query-plan.csv"))) await writeFile(join(task, "query-plan.csv"), toCsv(tableFields.query_plan, []), "utf8");
  await writeJson(join(task, "collection", "collection-run.json"), {
    schema_version: 2, run_id: `RUN-${idToken(name)}-MIGRATION`, research_id: `RESEARCH-${idToken(name)}`, provider_bindings: [], status: "succeeded",
    approved_scope: { approval_ids: [], plan_sha256: "", query_plan_sha256: "", provider_binding_sha256: "", cost_limit: null, currency: null, expansion_boundary: "legacy_migration" },
    observed_checks: observedCheckTemplate(),
    request_log: "collection/requests.jsonl", raw_root: "collection/raw", started_at: null, finished_at: now(), errors: []
  });
  await writeFile(join(task, "collection", "requests.jsonl"), "", "utf8");
  const processedDir = join(task, "processed"); const processedFiles = await exists(processedDir) ? (await readdir(processedDir)).filter((file) => file.endsWith(".csv")) : [];
  const oldRows = []; for (const file of processedFiles) for (const row of (await readCsv(join(processedDir, file))).rows) oldRows.push({ ...row, __source_file: `processed/${file}` });
  const records = oldRows.map((row, i) => ({
    record_id: `R-${String(i + 1).padStart(6, "0")}`, query_id: "unknown", request_id: "unknown", raw_ref: `legacy:${row.__source_file}`, platform: "unknown", content_model: "legacy",
    entity_type: "legacy_record", parent_record_id: "unknown", permalink: row["原始链接"] || "", published_at: row["发布时间"] || "",
    collected_at: row["采集时间"] || "", text: row["评论文本"] || row["正文"] || row["文本"] || "", author: row["作者"] || "",
    source_location: "unknown", inclusion_status: "included"
  }));
  await writeFile(join(task, "collection", "records.csv"), toCsv(tableFields.records, records), "utf8");
  await writeFile(join(task, "collection", "candidate-log.csv"), toCsv(tableFields.candidate_log, []), "utf8");
  await writeFile(join(task, "collection", "run.md"), "# v1 → v2 迁移运行\n", "utf8");
  const coded = await exists(join(task, "coded.csv")) ? await readCsv(join(task, "coded.csv")) : { rows: [] };
  const recordByPermalink = new Map(records.filter((record) => record.permalink).map((record) => [record.permalink, record]));
  const categories = [...new Set(coded.rows.map((row) => row["类别"]).filter(Boolean))];
  const codeByCategory = new Map(categories.map((category, i) => [category, `CODE-${String(i + 1).padStart(3, "0")}`]));
  const matched = coded.rows.map((row) => ({ row, record: recordByPermalink.get(row["原始链接"]) })).filter((item) => item.record);
  const unmatched = coded.rows.filter((row) => !recordByPermalink.has(row["原始链接"]));
  const units = matched.map(({ row, record }, i) => ({
    unit_id: `U-${String(i + 1).padStart(6, "0")}`, content_model: "legacy", primary_record_id: record.record_id,
    primary_code: codeByCategory.get(row["类别"]) || "uncategorized", secondary_codes: "", inclusion_status: "included", dedup_status: "unknown", classification_reason: row["编码依据"] || "v1 migration"
  }));
  const migrationRecordById = new Map(records.map((record) => [record.record_id, record]));
  const links = units.map((unit, i) => ({
    link_id: `E-${String(i + 1).padStart(6, "0")}`, unit_id: unit.unit_id, record_id: unit.primary_record_id, code_id: unit.primary_code,
    evidence_role: "primary", quote: migrationRecordById.get(unit.primary_record_id)?.text || "", reason: "v1 migration matched by permalink"
  }));
  await writeFile(join(task, "analysis-units.csv"), toCsv(tableFields.analysis_units, units), "utf8");
  await writeFile(join(task, "evidence-links.csv"), toCsv(tableFields.evidence_links, links), "utf8");
  await writeFile(join(task, "coding-audit.csv"), toCsv(tableFields.coding_audit, []), "utf8");
  await writeFile(join(task, "codebook.md"), `# v1 迁移编码表\n\n${categories.map((category) => `## ${codeByCategory.get(category)} ${category}\n\n- 定义：待复核\n- 纳入：待复核\n- 排除：待复核\n`).join("\n")}`, "utf8");
  await writeJson(join(task, "migration-report.json"), {
    schema_version: 2, migrated_at: now(), source_schema_version: manifest.schema_version, records_before: oldRows.length, records_after: records.length,
    analysis_units_before: coded.rows.length, analysis_units_after: units.length, unmatched_coded_rows: unmatched.length, primary_codes_after: units.filter((unit) => unit.primary_code).length,
    permalink_count_before: oldRows.filter((row) => row["原始链接"]).length, permalink_count_after: records.filter((row) => row.permalink).length
  });
  console.log("迁移完成；任务保持 blocked，需执行 v2 质量检查");
}

const octal = (value, width) => `${Math.max(0, value).toString(8).padStart(width - 1, "0")}\0`;
function tarHeader(name, size, mtime) {
  const header = Buffer.alloc(512, 0);
  const write = (value, offset, length) => header.write(value, offset, Math.min(Buffer.byteLength(value), length), "utf8");
  write(name.replaceAll("\\", "/"), 0, 100);
  write("0000644\0", 100, 8); write("0000000\0", 108, 8); write("0000000\0", 116, 8);
  write(octal(size, 12), 124, 12); write(octal(Math.floor(mtime / 1000), 12), 136, 12);
  header.fill(32, 148, 156); header[156] = "0".charCodeAt(0); write("ustar\0", 257, 6); write("00", 263, 2);
  write(octal([...header].reduce((sum, byte) => sum + byte, 0), 8), 148, 8);
  return header;
}

async function createTarGz(source, output) {
  const parts = [];
  for (const relative of await walkFiles(source)) {
    const full = join(source, relative); const content = await readFile(full); const info = await stat(full);
    parts.push(tarHeader(`交付/${relative}`, content.length, info.mtimeMs), content);
    const padding = (512 - content.length % 512) % 512; if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  await writeFile(output, gzipSync(Buffer.concat(parts)));
}

async function finalize() {
  const task = resolve(arg("--task")); if (!task) die("finalize 需要 --task");
  const researchFile = join(task, "research.json");
  const deliveredResearchFile = join(task, "交付", "审阅数据", "research.json");
  const metadataFile = join(task, "交付", "审阅数据", "交付元数据.json");
  const research = await readJson(researchFile);
  if (research.current_stage !== "delivery" || research.stage_history.at(-1)?.stage !== "delivery") die("finalize 前必须进入 delivery 阶段");
  if (research.status !== "running" || research.gates.delivery.status !== "pending") die("finalize 需要 running/pending 的交付状态");
  const errors = await deliveryErrors(task, { allowPendingDelivery: true });
  if (errors.length) die(`交付终态校验未通过：\n- ${errors.join("\n- ")}`);
  research.status = "completed";
  research.gates.delivery = { status: "passed", result_file: "交付/审阅数据/交付元数据.json" };
  pushHistory(research, "delivery", "completed", "delivery_validated");
  const researchContent = `${JSON.stringify(research, null, 2)}\n`;
  await writeFile(researchFile, researchContent, "utf8");
  await writeFile(deliveredResearchFile, researchContent, "utf8");
  const metadata = await readJson(metadataFile);
  const researchEntry = metadata.files.find((entry) => entry.path === "审阅数据/research.json");
  if (!researchEntry) die("交付元数据缺少 research.json");
  researchEntry.sha256 = sha256(researchContent);
  metadata.generated_at = now();
  await writeJson(metadataFile, metadata);
  const finalErrors = await deliveryErrors(task, { allowPendingDelivery: false });
  if (finalErrors.length) die(`交付终态写入后校验失败：\n- ${finalErrors.join("\n- ")}`);
  console.log("交付已完成");
}

async function pack() {
  const task = resolve(arg("--task")); if (!task) die("pack 需要 --task");
  const errors = await deliveryErrors(task, { allowPendingDelivery: false }); if (errors.length) die(`交付打包前校验未通过：\n- ${errors.join("\n- ")}`);
  const output = resolve(arg("--output") || join(task, "..", `${basename(task)}-delivery.tar.gz`));
  await createTarGz(join(task, "交付"), output);
  console.log(output);
}

const command = process.argv[2];
({ init, quality, summarize, validate, migrate, finalize, pack }[command] || (() => die("用法：voc_workbench.mjs <init|quality|summarize|validate|migrate|finalize|pack>")))();
