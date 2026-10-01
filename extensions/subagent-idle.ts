import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const blockingWaits = new Set(["wait_agent", "wait_all_agents"]);
const idleGuideline =
  "Subagent results arrive automatically. Blocking subagent wait tools are unavailable. " +
  "Continue independent work after spawning. When only child results remain, end your turn with the task still pending. " +
  "Answer intervening user messages normally, then resume unfinished work when completion notifications arrive.";

export default function registerSubagentIdle(pi: ExtensionAPI) {
  const removeBlockingWaits = () => {
    const active = pi.getActiveTools();
    const remaining = active.filter((name) => !blockingWaits.has(name));
    if (remaining.length !== active.length) pi.setActiveTools(remaining);
  };

  pi.on("session_start", removeBlockingWaits);
  pi.on("before_agent_start", (event) => {
    removeBlockingWaits();
    const options = event.systemPromptOptions;
    options.selectedTools = options.selectedTools.filter((name) => !blockingWaits.has(name));
    if (!options.promptGuidelines.includes(idleGuideline)) options.promptGuidelines.push(idleGuideline);
  });
}
