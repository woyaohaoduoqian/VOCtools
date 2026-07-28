const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" },
});

function safeString(value, max = 1200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function authorised(request, env) {
  const expected = safeString(env.APP_ACCESS_KEY, 512);
  return Boolean(expected) && request.headers.get("x-voc-access-key") === expected;
}

function planPrompt(input) {
  return `你是 VOC（用户之声）调研方案专家。你现在只能做“研究规划”，不能声称已经采到数据，不能编造样本、价格、引文或调研结论。输出中文 Markdown，标题为“调研方案（待确认）”。

必须包含以下固定小节：
1. 研究对象与边界（含明确排除项）
2. 决策目标
3. 研究问题与可答性（明确本次答不了的部分）
4. 取样设计（市场/语言、时间窗、平台候选、种子、排序、计划样本量）
5. 研究模式与编码维度（探索式或验证式；验证式需给预注册判断标准）
6. 平台偏差与风险
7. 试跑建议与费用确认点（只写“需向采集 provider 核验”，不得编造价格）
8. 待用户确认清单

已知需求：
- 产品/品类：${input.subject}
- 目标用户：${input.audience}
- 决策目标：${input.goal}
- 研究问题：${input.question}
- 市场与语言：${input.market}
- 时间窗：${input.timeWindow}
- 候选平台：${input.platforms}
- 预算上限：${input.budget}
- 计划交付：${input.deliverable}
- 已知种子：${input.seeds}

若关键输入为空，要在“待用户确认清单”中明确列出，不能自行补造。`;
}

async function createPlan(request, env) {
  if (!authorised(request, env)) return json({ error: "未授权。请在设置中输入访问口令。" }, 401);
  if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) {
    return json({ error: "服务尚未配置模型。管理员需设置 OPENAI_API_KEY Secret 和 OPENAI_MODEL。" }, 503);
  }
  let input;
  try { input = await request.json(); } catch { return json({ error: "请求必须是 JSON。" }, 400); }
  const fields = ["subject", "audience", "goal", "question", "market", "timeWindow", "platforms", "budget", "deliverable", "seeds"];
  const cleaned = Object.fromEntries(fields.map((field) => [field, safeString(input[field])]));
  if (!cleaned.subject || !cleaned.goal || !cleaned.question) {
    return json({ error: "请至少填写产品/品类、决策目标和研究问题。" }, 400);
  }
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "authorization": `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: env.OPENAI_MODEL, input: planPrompt(cleaned) }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: "方案生成服务暂不可用。", detail: data.error?.message || "上游请求失败" }, 502);
  const plan = data.output_text || data.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n");
  if (!plan) return json({ error: "模型未返回可用的方案文本。" }, 502);
  return json({ plan, generatedAt: new Date().toISOString() });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, service: "voc-research-agent" });
    if (request.method === "POST" && url.pathname === "/api/plan") return createPlan(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "未找到接口。" }, 404);
    return env.ASSETS.fetch(request);
  },
};
