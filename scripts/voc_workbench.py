#!/usr/bin/env python3
"""VOC 调研工作台：创建任务、复算质检、汇总编码、校验和打包。

只操作本地交付文件，不调用网络、不调用采集 provider，也不读取凭证。
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

UTF8_BOM = "utf-8-sig"
REQUIRED_ARTIFACTS = ("plan.md", "manifest.json", "run.md")
CONTENT_TYPES = {"post", "reel", "comment"}
PROFILE_TYPES = {"profile", "followers", "following"}


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def fail(message: str) -> None:
    print(f"错误: {message}", file=sys.stderr)
    raise SystemExit(2)


def read_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"无法读取 {path}: {exc}")
    if not isinstance(value, dict):
        fail(f"{path} 必须是 JSON 对象")
    return value


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def csv_files(task: Path) -> list[Path]:
    return sorted((task / "processed").glob("*.csv"))


def load_rows(paths: list[Path]) -> tuple[list[dict], list[str]]:
    rows: list[dict] = []
    fields: list[str] = []
    for path in paths:
        with path.open("r", encoding=UTF8_BOM, newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                continue
            for field in reader.fieldnames:
                if field not in fields:
                    fields.append(field)
            rows.extend(dict(row) for row in reader)
    return rows, fields


def init_task(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    task = root / args.name
    if task.exists():
        fail(f"任务目录已存在: {task}")
    (task / "raw").mkdir(parents=True)
    (task / "processed").mkdir()
    plan = """# 调研方案（待确认）

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
"""
    (task / "plan.md").write_text(plan, encoding="utf-8")
    manifest = {
        "schema_version": 1,
        "research_id": args.name,
        "created_at": now(),
        "status": "planned",
        "tasks": [],
        "quality_checks": [],
        "notes": ["本文件不得保存 API token 或其他凭证。"],
    }
    write_json(task / "manifest.json", manifest)
    (task / "run.md").write_text("# 执行记录\n\n- 创建时间：" + now() + "\n- 状态：等待方案确认。\n", encoding="utf-8")
    print(task)


def required_provenance(manifest: dict) -> set[str]:
    kinds = {str(item.get("content", "")) for item in manifest.get("tasks", []) if isinstance(item, dict)}
    if kinds & CONTENT_TYPES:
        return {"原始链接", "发布时间", "采集时间"}
    if kinds & PROFILE_TYPES:
        return {"主页链接", "采集时间"}
    return {"采集时间"}


def quality(args: argparse.Namespace) -> None:
    task = Path(args.task).resolve()
    manifest = read_json(task / "manifest.json")
    paths = csv_files(task)
    if not paths:
        fail("processed/ 下没有 CSV，不能做质量检查")
    rows, fields = load_rows(paths)
    if not rows:
        fail("processed/ 下的 CSV 没有数据行，不能做质量检查")
    required = required_provenance(manifest)
    field_rates = {field: round(sum(bool(str(row.get(field, "")).strip()) for row in rows) / len(rows) * 100, 2) for field in fields}
    missing_provenance = sorted(required - set(fields))
    blank_provenance = {field: field_rates.get(field, 0) for field in required if field in fields and field_rates.get(field, 0) < 100}
    text_field = next((x for x in ("评论文本", "文案", "文本", "content", "text") if x in fields), None)
    duplicate_rate = None
    if text_field:
        normalized = [re.sub(r"\s+", " ", str(row.get(text_field, "")).strip().lower()) for row in rows]
        nonempty = [x for x in normalized if x]
        duplicate_rate = round((len(nonempty) - len(set(nonempty))) / len(nonempty) * 100, 2) if nonempty else 0
    reservations: list[str] = []
    if missing_provenance:
        reservations.append("缺少必需溯源列：" + "、".join(missing_provenance))
    if blank_provenance:
        reservations.append("必需溯源列存在空值：" + "；".join(f"{k}={v}%" for k, v in blank_provenance.items()))
    key_empty = [f"{key}={100-value}%" for key, value in field_rates.items() if key in required and value < 80]
    if key_empty:
        reservations.append("关键溯源字段空值率超过 20%：" + "；".join(key_empty))
    if duplicate_rate is not None and duplicate_rate > 20:
        reservations.append(f"文本完全重复率为 {duplicate_rate}%；须人工判断是否为采集重复或模板内容。")
    decision = "不可用" if missing_provenance or key_empty else ("带保留可用" if reservations else "可用")
    report = [f"# 数据质量检查\n\n{args.stage} 闸门｜检查时间：{now()}\n", f"**判定：{decision}**\n", "## 基础统计", f"- CSV 文件数：{len(paths)}", f"- 数据行数：{len(rows)}", f"- 必需溯源字段：{'、'.join(sorted(required))}"]
    if duplicate_rate is not None:
        report.append(f"- {text_field} 完全重复率：{duplicate_rate}%")
    report.extend(["\n## 字段有值率", "| 字段 | 有值率 |", "|---|---:|"])
    report.extend(f"| {field} | {field_rates[field]}% |" for field in fields)
    report.append("\n## 保留点")
    report.extend([f"- {item}" for item in reservations] or ["- 无。"])
    report.append("\n## 后续")
    report.append("- 判定不可用：停止后续分析，向用户报告问题及可选调整方向。" if decision == "不可用" else "- 该结果不等于自动进入下一阶段；仍按已确认方案和用户授权执行。")
    quality_path = task / "quality.md"
    prefix = quality_path.read_text(encoding="utf-8").rstrip() + "\n\n---\n\n" if quality_path.exists() else ""
    quality_path.write_text(prefix + "\n".join(report) + "\n", encoding="utf-8")
    manifest.setdefault("quality_checks", []).append({"stage": args.stage, "checked_at": now(), "rows": len(rows), "decision": decision, "reservations": reservations})
    write_json(task / "manifest.json", manifest)
    print(decision)


def summarize(args: argparse.Namespace) -> None:
    task = Path(args.task).resolve()
    source = task / "coded.csv"
    if not source.exists():
        fail("缺少 coded.csv；只有完成逐行编码后才能汇总")
    rows, fields = load_rows([source])
    if "类别" not in fields:
        fail("coded.csv 缺少“类别”列")
    counts = Counter((row.get("类别") or "未归类").strip() for row in rows)
    denominator = len(rows)
    summary = {"generated_at": now(), "denominator": denominator, "categories": [{"category": key, "count": value, "percentage": round(value / denominator * 100, 2)} for key, value in counts.most_common()]}
    write_json(task / "category-summary.json", summary)
    lines = ["# 编码汇总（可复算）", "", f"样本分母：{denominator}", "", "| 类别 | 条数 | 样本内占比 |", "|---|---:|---:|"]
    lines += [f"| {item['category']} | {item['count']} | {item['percentage']}% |" for item in summary["categories"]]
    (task / "category-summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(task / "category-summary.md")


def validate(args: argparse.Namespace) -> None:
    task = Path(args.task).resolve()
    errors = [f"缺少 {name}" for name in REQUIRED_ARTIFACTS if not (task / name).exists()]
    manifest = read_json(task / "manifest.json") if (task / "manifest.json").exists() else {}
    if not csv_files(task):
        errors.append("processed/ 下没有 CSV")
    if args.for_report:
        for name in ("quality.md", "coded.csv", "category-summary.md", "report.md"):
            if not (task / name).exists():
                errors.append(f"报告交付缺少 {name}")
        decisions = [item.get("decision") for item in manifest.get("quality_checks", []) if isinstance(item, dict)]
        if not any(value in {"可用", "带保留可用"} for value in decisions):
            errors.append("没有可用于分析的全量质量闸门判定")
    if errors:
        print("校验未通过：\n- " + "\n- ".join(errors))
        raise SystemExit(1)
    print("校验通过")


def pack(args: argparse.Namespace) -> None:
    task = Path(args.task).resolve()
    if not task.is_dir():
        fail(f"任务目录不存在: {task}")
    output = Path(args.output).resolve() if args.output else task.parent / f"{task.name}-delivery"
    archive = shutil.make_archive(str(output), "zip", root_dir=task.parent, base_dir=task.name)
    print(archive)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    subs = value.add_subparsers(dest="command", required=True)
    init = subs.add_parser("init", help="创建新的调研任务目录")
    init.add_argument("--root", default="research")
    init.add_argument("--name", required=True)
    init.set_defaults(func=init_task)
    check = subs.add_parser("quality", help="对 processed CSV 执行可复算质量检查")
    check.add_argument("--task", required=True)
    check.add_argument("--stage", choices=("pilot", "full"), required=True)
    check.set_defaults(func=quality)
    summary = subs.add_parser("summarize", help="汇总人工/模型逐行编码后的 coded.csv")
    summary.add_argument("--task", required=True)
    summary.set_defaults(func=summarize)
    validate = subs.add_parser("validate", help="校验任务交付链完整性")
    validate.add_argument("--task", required=True)
    validate.add_argument("--for-report", action="store_true")
    validate.set_defaults(func=validate)
    package = subs.add_parser("pack", help="将完整调研目录打为 zip 交付包")
    package.add_argument("--task", required=True)
    package.add_argument("--output")
    package.set_defaults(func=pack)
    return value


if __name__ == "__main__":
    parsed = parser().parse_args()
    parsed.func(parsed)
