---
provider_id: example-provider
type: rest_api
status: candidate
platforms: [example]
content_models: []
---

# Provider 文档模板

Frontmatter 必须与 `registry.json` 一致。

- `type` 和 `status` 只使用 `schemas/provider-registry.schema.json` 中的枚举。
- `integrated` 只表示核心已有正式 Provider 契约；当前运行环境能否调用仍由能力匹配逐任务判断。
- MCP 另写 `transport`。

正文只包含：

1. 能力与缺口；
2. 鉴权和运行条件；
3. 调用契约与运行时 Schema 发现；
4. 费用、配额、并发与超时；
5. 原始字段到标准字段映射；
6. Provider 特有错误到通用错误的映射。

不要重复研究方法、内容模型计数、通用质量闸门、洞察措辞或通用失败纪律。
