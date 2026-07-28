import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = async (file) => JSON.parse(await readFile(resolve(root, file), "utf8"));
const registry = await readJson("agent/providers/registry.json");
const plugin = await readJson(".codex-plugin/plugin.json");
const mcp = await readJson(".mcp.json");

const apify = registry.providers.find(({ provider, platforms }) => provider === "apify" && platforms.includes("instagram"));
const reddit = registry.providers.find(({ provider }) => provider === "reddit-research-mcp");

assert.equal(apify?.type, "rest_api", "Apify must remain a standard API provider");
assert.equal(reddit?.type, "mcp_http_via_remote", "Reddit must remain an MCP provider");
assert.equal(reddit?.status, "已接入（首次使用需 OAuth 授权）", "Reddit MCP authorization state is required");
assert.equal(registry.providers.some(({ provider, platforms }) => provider === "apify" && platforms.includes("reddit")), false, "Reddit must not fall back to Apify");
await access(resolve(root, "agent/providers/apify.md"));
await access(resolve(root, "agent/providers/reddit-research-mcp.md"));
assert.equal(plugin.mcpServers, "./.mcp.json", "Plugin must load the Reddit MCP configuration");
assert.ok(mcp.mcpServers["dialog-mcp"], "Reddit MCP configuration is required");

console.log("Plugin deployment contract passed");
