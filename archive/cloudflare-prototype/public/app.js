const $ = (id) => document.getElementById(id);
const state = { key: localStorage.getItem("voc-access-key") || "", plan: localStorage.getItem("voc-plan") || "" };
const dialog = $("settings-dialog");

function showPlan(plan) {
  $("plan-output").textContent = plan;
  $("result").classList.remove("hidden");
}
function download(filename, content) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
if (state.plan) showPlan(state.plan);

$("settings").addEventListener("click", () => { $("access-key").value = state.key; dialog.showModal(); });
$("save-key").addEventListener("click", () => { state.key = $("access-key").value.trim(); localStorage.setItem("voc-access-key", state.key); });
$("plan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.key) { dialog.showModal(); return; }
  const status = $("form-status"); status.textContent = "正在生成方案…";
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json", "x-voc-access-key": state.key }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败");
    state.plan = result.plan; localStorage.setItem("voc-plan", state.plan); showPlan(state.plan); status.textContent = "方案已生成。";
  } catch (error) { status.textContent = `未生成：${error.message}`; }
});
$("download-plan").addEventListener("click", () => download("plan.md", state.plan));
$("confirm-plan").addEventListener("click", () => { $("next").classList.remove("hidden"); $("confirm-plan").textContent = "方案已确认"; $("confirm-plan").disabled = true; });
$("reset").addEventListener("click", () => { localStorage.removeItem("voc-plan"); state.plan = ""; $("result").classList.add("hidden"); $("next").classList.add("hidden"); $("plan-form").reset(); window.scrollTo({ top: 0, behavior: "smooth" }); });
