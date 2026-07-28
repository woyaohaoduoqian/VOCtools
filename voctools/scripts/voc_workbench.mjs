#!/usr/bin/env node
/** 本地 VOC 工作台：不访问网络、不读取凭证、不触发采集。 */
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const die = (message) => { console.error(`错误: ${message}`); process.exit(2); };
const now = () => new Date().toISOString();
const exists = async (file) => access(file, constants.F_OK).then(() => true).catch(() => false);
const json = async (file) => { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { die(`无法读取 ${file}: ${error.message}`); } };
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
const arg = (name) => { const index = process.argv.indexOf(name); return index < 0 ? "" : process.argv[index + 1] || ""; };

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]; const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell); if (row.some((value) => value !== "")) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  row.push(cell); if (row.some((value) => value !== "")) rows.push(row);
  const [header = [], ...records] = rows;
  return { fields: header.map((value) => value.replace(/^\uFEFF/, "").trim()), rows: records.map((record) => Object.fromEntries(header.map((field, index) => [field.replace(/^\uFEFF/, "").trim(), record[index] || ""]))) };
}

async function csvs(task, filename = "") {
  const folder = join(task, "processed");
  const files = filename ? [join(task, filename)] : (await (await import("node:fs/promises")).readdir(folder)).filter((file) => file.endsWith(".csv")).map((file) => join(folder, file));
  if (!files.length) die("没有找到 CSV 文件");
  const parsed = await Promise.all(files.map(async (file) => parseCsv(await readFile(file, "utf8"))));
  return { files, fields: [...new Set(parsed.flatMap((item) => item.fields))], rows: parsed.flatMap((item) => item.rows) };
}

async function init() {
  const root = resolve(arg("--root") || "research"); const name = arg("--name"); if (!name) die("init 需要 --name");
  const task = join(root, name); if (await exists(task)) die(`任务目录已存在: ${task}`);
  await mkdir(join(task, "raw"), { recursive: true }); await mkdir(join(task, "processed"));
  await writeFile(join(task, "plan.md"), `# 调研方案（待确认）

## 研究对象与边界
- 研究对象：
- 包含：
- 明确排除：

## 目的与决策
- 本次结果将支持的决策：
- 阅读者：

## 研究问题与可答性
- 可回答：
- 本次答不了：

## 范围与取样
- 市场/语言：
- 时间窗：
- 平台与理由：
- 种子（账号、帖子、关键词或标签）：
- 排序与计划样本量：

## 研究设计
- 模式：探索式 / 验证式
- 编码维度：痛点/需求 / 内容形式
- 验证式判断标准（探索式填写停止条件）：
- 输出形式：数据表 / 候选发现 / 结论报告

## 平台偏差、风险与预估费用
- 已知偏差：
- 采集风险：
- 试跑范围和预估费用：
- 全量范围和预估费用：

## 待用户确认
- [ ] 已确认研究方案
- [ ] 已明确授权本次试跑（如可能产生费用）
- [ ] 已明确授权全量采集（试跑通过后另行确认）
`, "utf8");
  await writeJson(join(task, "manifest.json"), { schema_version: 1, research_id: name, created_at: now(), status: "planned", tasks: [], quality_checks: [], notes: ["本文件不得保存 API token 或其他凭证。"] });
  await writeFile(join(task, "run.md"), `# 执行记录\n\n- 创建时间：${now()}\n- 状态：等待方案确认。\n`, "utf8"); console.log(task);
}

function provenance(manifest) {
  const content = new Set((manifest.tasks || []).map((item) => item?.content));
  if (["post", "reel", "comment"].some((kind) => content.has(kind))) return ["原始链接", "发布时间", "采集时间"];
  if (["profile", "followers", "following"].some((kind) => content.has(kind))) return ["主页链接", "采集时间"];
  return ["采集时间"];
}

async function quality() {
  const task = resolve(arg("--task")); const stage = arg("--stage"); if (!task || !["pilot", "full"].includes(stage)) die("quality 需要 --task 和 --stage pilot|full");
  const manifest = await json(join(task, "manifest.json")); const { files, fields, rows } = await csvs(task); if (!rows.length) die("CSV 没有数据行");
  const required = provenance(manifest); const rates = Object.fromEntries(fields.map((field) => [field, +(rows.filter((row) => String(row[field] || "").trim()).length / rows.length * 100).toFixed(2)]));
  const missing = required.filter((field) => !fields.includes(field)); const reservations = [];
  if (missing.length) reservations.push(`缺少必需溯源列：${missing.join("、")}`);
  const blank = required.filter((field) => fields.includes(field) && rates[field] < 100).map((field) => `${field}=${rates[field]}%`);
  if (blank.length) reservations.push(`必需溯源列存在空值：${blank.join("；")}`);
  const low = required.filter((field) => fields.includes(field) && rates[field] < 80).map((field) => `${field}=${100 - rates[field]}%`);
  if (low.length) reservations.push(`关键溯源字段空值率超过 20%：${low.join("；")}`);
  const textField = ["评论文本", "文案", "文本", "content", "text"].find((field) => fields.includes(field)); let duplicate = null;
  if (textField) { const values = rows.map((row) => String(row[textField] || "").trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean); duplicate = values.length ? +((values.length - new Set(values).size) / values.length * 100).toFixed(2) : 0; if (duplicate > 20) reservations.push(`文本完全重复率为 ${duplicate}%；须人工判断是否为采集重复或模板内容。`); }
  const decision = missing.length || low.length ? "不可用" : reservations.length ? "带保留可用" : "可用";
  const report = [`# 数据质量检查\n\n${stage} 闸门｜检查时间：${now()}\n`, `**判定：${decision}**\n`, "## 基础统计", `- CSV 文件数：${files.length}`, `- 数据行数：${rows.length}`, `- 必需溯源字段：${required.join("、")}`, ...(textField ? [`- ${textField} 完全重复率：${duplicate}%`] : []), "\n## 字段有值率", "| 字段 | 有值率 |", "|---|---:|", ...fields.map((field) => `| ${field} | ${rates[field]}% |`), "\n## 保留点", ...(reservations.length ? reservations.map((item) => `- ${item}`) : ["- 无。"]), "\n## 后续", decision === "不可用" ? "- 停止后续分析，向用户报告问题及可选调整方向。" : "- 不自动进入下一阶段；仍按已确认方案和用户授权执行。"].join("\n");
  const qualityFile = join(task, "quality.md"); const earlier = await exists(qualityFile) ? `${await readFile(qualityFile, "utf8").then((text) => text.trim())}\n\n---\n\n` : ""; await writeFile(qualityFile, `${earlier}${report}\n`, "utf8");
  manifest.quality_checks ??= []; manifest.quality_checks.push({ stage, checked_at: now(), rows: rows.length, decision, reservations }); await writeJson(join(task, "manifest.json"), manifest); console.log(decision);
}

async function summarize() {
  const task = resolve(arg("--task")); if (!task) die("summarize 需要 --task"); const { fields, rows } = await csvs(task, "coded.csv"); if (!fields.includes("类别")) die("coded.csv 缺少“类别”列");
  const count = new Map(); for (const row of rows) { const key = String(row.类别 || "未归类").trim() || "未归类"; count.set(key, (count.get(key) || 0) + 1); }
  const categories = [...count].sort((a, b) => b[1] - a[1]).map(([category, value]) => ({ category, count: value, percentage: +(value / rows.length * 100).toFixed(2) }));
  await writeJson(join(task, "category-summary.json"), { generated_at: now(), denominator: rows.length, categories }); await writeFile(join(task, "category-summary.md"), ["# 编码汇总（可复算）", "", `样本分母：${rows.length}`, "", "| 类别 | 条数 | 样本内占比 |", "|---|---:|---:|", ...categories.map((item) => `| ${item.category} | ${item.count} | ${item.percentage}% |`), ""].join("\n"), "utf8"); console.log(join(task, "category-summary.md"));
}

async function validate() {
  const task = resolve(arg("--task")); const report = process.argv.includes("--for-report"); if (!task) die("validate 需要 --task"); const errors = [];
  for (const file of ["plan.md", "manifest.json", "run.md"]) if (!await exists(join(task, file))) errors.push(`缺少 ${file}`);
  let manifest = {}; if (await exists(join(task, "manifest.json"))) manifest = await json(join(task, "manifest.json"));
  try { await csvs(task); } catch { errors.push("processed/ 下没有 CSV"); }
  if (report) { for (const file of ["quality.md", "coded.csv", "category-summary.md", "report.md"]) if (!await exists(join(task, file))) errors.push(`报告交付缺少 ${file}`); if (!(manifest.quality_checks || []).some((item) => ["可用", "带保留可用"].includes(item.decision))) errors.push("没有可用于分析的质量闸门判定"); }
  if (errors.length) { console.log(`校验未通过：\n- ${errors.join("\n- ")}`); process.exit(1); } console.log("校验通过");
}

async function pack() { const task = resolve(arg("--task")); if (!task || !await exists(task)) die("pack 需要存在的 --task"); const output = resolve(arg("--output") || join(task, "..", `${basename(task)}-delivery.zip`)); execFileSync("powershell", ["-NoProfile", "-Command", "Compress-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", task, output], { stdio: "inherit" }); console.log(output); }

const command = process.argv[2]; ({ init, quality, summarize, validate, pack }[command] || (() => die("用法：node voc_workbench.mjs <init|quality|summarize|validate|pack>")))();
