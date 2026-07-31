---
provider_id: apify
type: rest_api
status: candidate
platforms: [instagram]
content_models: []
---

# Apify 候选 Provider

## 能力与缺口

历史候选规格仅保存在源码仓库的 `archive/provider-candidates/apify-instagram.json`，不随运行插件发布。当前尚未完成集成、运行验证、内容模型映射和标准字段验证，不得用于正式任务。

## 鉴权和运行条件

REST API token。当前产品未配置此凭证和调用通道。

## 调用契约

候选规格描述 actor 输入与结果字段；只有状态变为 `integrated` 且绑定测试通过后才能形成正式调用契约。

## 代价、配额、并发与超时

候选规格记录历史价格范围；正式代价、配额和超时需在集成评估时重新确认。

## 字段映射

尚未建立到 v2 标准记录和内容模型的正式映射。

## 错误映射

认证、超时、空结果、限流、Schema 变化、传输失败和未知状态分别映射到合同中的同名通用错误类型。
