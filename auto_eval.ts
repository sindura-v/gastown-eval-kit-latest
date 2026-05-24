import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { randomUUID, createHash } from "crypto";
import { resolve, join, extname } from "path";
import { parse as parseYaml } from "yaml";

// ─────────────────────────────────────────────────────────────
// Config Loading
// ─────────────────────────────────────────────────────────────

interface Config {
  agent: { prompt_path?: string; skills_dir: string; agent_file?: string };
  model: { name: string };
  questions: { csv_path: string };
  execution: {
    timeout_seconds: number;
    retries: number;
    retry_delay_ms: number;
    save_partial: boolean;
  };
  output: { file: string; validate: boolean };
}

function loadConfig(): Config {
  const configPath = resolve(process.cwd(), "config.yaml");
  if (!existsSync(configPath)) {
    console.error("\n❌ config.yaml not found in project root.");
    console.error("   Copy config.yaml.example to config.yaml and fill in your settings.\n");
    process.exit(1);
  }
  const raw = readFileSync(configPath, "utf-8");
  return parseYaml(raw) as Config;
}

// ─────────────────────────────────────────────────────────────
// Agent Frontmatter Parsing
// ─────────────────────────────────────────────────────────────

interface AgentMeta {
  name: string;
  model: string;
  description: string;
}

interface AgentResolution {
  promptPath: string;
  content: string;
}

function parseAgentFrontmatter(content: string): AgentMeta {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: "unknown", model: "unknown", description: "" };
  const fm = parseYaml(match[1]) as Record<string, unknown>;
  return {
    name: typeof fm.name === "string" ? fm.name : "unknown",
    model: typeof fm.model === "string" ? fm.model : "unknown",
    description: typeof fm.description === "string" ? fm.description : "",
  };
}

// ─────────────────────────────────────────────────────────────
// Agent Prompt Path Resolution
// ─────────────────────────────────────────────────────────────

function resolveAgentConfig(config: Config): AgentResolution {
  const promptPath = config.agent.prompt_path ?? "auto";
  const configuredAgentFile = config.agent.agent_file;

  // Explicit prompt path always wins. Allow skills-only by leaving agent_file empty.
  if (promptPath !== "auto") {
    if (!configuredAgentFile) {
      return { promptPath, content: "" };
    }

    const explicitAgentPath = resolve(process.cwd(), configuredAgentFile);
    if (!existsSync(explicitAgentPath)) {
      return { promptPath, content: "" };
    }

    return { promptPath, content: readFileSync(explicitAgentPath, "utf-8") };
  }

  if (!configuredAgentFile) {
    return { promptPath: "workspace://skills-only", content: "" };
  }

  const agentFile = resolve(process.cwd(), configuredAgentFile);
  if (!existsSync(agentFile)) {
    return { promptPath: "workspace://skills-only", content: "" };
  }

  return {
    promptPath: `workspace://${configuredAgentFile}`,
    content: readFileSync(agentFile, "utf-8"),
  };
}

// ─────────────────────────────────────────────────────────────
// Agent and Skill Loading
// ─────────────────────────────────────────────────────────────

interface SkillPayload {
  content: string;
  skills: string[];
}

function loadSkillContent(config: Config): SkillPayload {
  const skillRoot = resolve(process.cwd(), config.agent.skills_dir);

  if (!existsSync(skillRoot)) {
    console.error(`\n❌ Skills directory not found: ${skillRoot}`);
    process.exit(1);
  }

  // Legacy: skills_dir points directly at a single skill folder containing SKILL.md
  const directSkillMd = join(skillRoot, "SKILL.md");
  if (existsSync(directSkillMd)) {
    let content = readFileSync(directSkillMd, "utf-8");
    const refPath = join(skillRoot, "reference/instructions.md");
    if (existsSync(refPath)) {
      content += `\n\n---\n\n${readFileSync(refPath, "utf-8")}`;
    }
    return { content, skills: [skillRoot.split("/").pop() ?? "unknown"] };
  }

  // Current: skills_dir contains subdirectories, each with its own SKILL.md and resource files
  const entries = readdirSync(skillRoot, { withFileTypes: true });
  const skillDirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (skillDirs.length === 0) {
    console.error(`\n❌ No SKILL.md and no skill subdirectories found in: ${skillRoot}`);
    process.exit(1);
  }

  const loadedSkills: string[] = [];
  const parts: string[] = [];

  for (const skillDir of skillDirs) {
    const skillPath = join(skillRoot, skillDir.name);
    const skillMdPath = join(skillPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    loadedSkills.push(skillDir.name);
    parts.push(`## Skill: ${skillDir.name}\n\n${readFileSync(skillMdPath, "utf-8")}`);

    // Load resource files alongside SKILL.md so templates are available in eval context
    const resources = readdirSync(skillPath)
      .filter((f) => f !== "SKILL.md")
      .sort();

    for (const resource of resources) {
      const resourcePath = join(skillPath, resource);
      if (!statSync(resourcePath).isFile()) continue;
      const ext = extname(resource).replace(".", "") || "text";
      const fileContent = readFileSync(resourcePath, "utf-8");
      parts.push(`### Resource: ${resource}\n\n\`\`\`${ext}\n${fileContent}\n\`\`\``);
    }
  }

  if (parts.length === 0) {
    console.error(`\n❌ No SKILL.md files found in any subdirectory of: ${skillRoot}`);
    process.exit(1);
  }

  return { content: parts.join("\n\n---\n\n"), skills: loadedSkills };
}

// ─────────────────────────────────────────────────────────────
// CSV Parsing (using proper field handling)
// ─────────────────────────────────────────────────────────────

interface Question {
  text: string;
  category: string;
}

function loadQuestions(csvPath: string): Question[] {
  const fullPath = resolve(process.cwd(), csvPath);
  if (!existsSync(fullPath)) {
    console.error(`\n❌ Questions file not found: ${fullPath}`);
    process.exit(1);
  }

  const content = readFileSync(fullPath, "utf-8").trim();
  const lines = content.split(/\r?\n/);
  const header = lines[0].toLowerCase();

  if (!header.includes("question")) {
    console.error("\n❌ CSV must have a 'question' column in the header row.");
    process.exit(1);
  }

  // Parse CSV respecting quoted fields.
  // CSV format: question, category. (Marking criteria stay server-side.)
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      text: fields[0]?.trim() ?? "",
      category: fields[1]?.trim() ?? "general",
    };
  }).filter((q) => q.text.length > 0);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// ─────────────────────────────────────────────────────────────
// Trace Types
// ─────────────────────────────────────────────────────────────

interface RawEvent {
  type: string;
  timestamp: number;
  data: unknown;
}

interface TokenUsageRecord {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  source: "sendAndWait" | "raw_event";
}

interface NormalizedTokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface RequestRecord {
  requestId: string;
  responseId: string;
  timestamp: string;
  modelId: string;
  agent: string;
  message: { text: string };
  response: Array<{ value: string }>;
  followups: unknown[];
  variableData: Record<string, unknown>;
  timeSpentWaiting: number;
  modelState: { completedAt: number };
  latencyMs: number;
  contentReferences: unknown[];
  codeCitations: unknown[];
  rawEvents: RawEvent[];
  result: {
    timings: {
      firstProgress: number | null;
      totalElapsed: number;
    };
    metadata?: {
      promptTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  };
}

interface SessionRecord {
  sessionId: string;
  timestamp: string;
  creationDate: number;
  customTitle: string;
  responderUsername: string;
  modelId: string;
  initialLocation: string;
  inputState: {
    mode: { id: string; kind: string };
    selectedModel: { identifier: string };
    attachments: unknown[];
    inputText: string;
    selections: unknown[];
    contrib: Record<string, unknown>;
  };
  requests: RequestRecord[];
}

interface SessionWrapper {
  version: number;
  hasPendingEdits: boolean;
  pendingRequests: unknown[];
  data: SessionRecord;
}

interface TraceOutput {
  since_filter: null;
  workspace_count: number;
  workspaces: Record<string, { workspacePath: string; sessions: SessionWrapper[] }>;
}

// ─────────────────────────────────────────────────────────────
// Token Usage Extraction
// ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getFirstNumberFromKeys(
  record: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const num = toFiniteNumber(record[key]);
    if (num !== undefined) return num;
  }
  return undefined;
}

function parseUsageRecord(
  candidate: Record<string, unknown>,
  source: "sendAndWait" | "raw_event"
): TokenUsageRecord | null {
  const promptTokens = getFirstNumberFromKeys(candidate, [
    "promptTokens",
    "prompt_tokens",
    "inputTokens",
    "input_tokens",
    "requestTokens",
    "request_tokens",
  ]);
  const completionTokens = getFirstNumberFromKeys(candidate, [
    "completionTokens",
    "completion_tokens",
    "outputTokens",
    "output_tokens",
    "responseTokens",
    "response_tokens",
    "generatedTokens",
    "generated_tokens",
  ]);
  let totalTokens = getFirstNumberFromKeys(candidate, ["totalTokens", "total_tokens"]);

  if (totalTokens === undefined && promptTokens !== undefined && completionTokens !== undefined) {
    totalTokens = promptTokens + completionTokens;
  }

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return null;
  }

  return { promptTokens, completionTokens, totalTokens, source };
}

function findTokenUsage(value: unknown, source: "sendAndWait" | "raw_event", depth = 0): TokenUsageRecord | null {
  if (depth > 6 || !isRecord(value)) return null;

  // Common API shape: { usage: { ...token counters... } }
  const usage = value["usage"];
  if (isRecord(usage)) {
    const parsed = parseUsageRecord(usage, source);
    if (parsed) return parsed;
  }

  // Some APIs return token counters directly at the top level.
  const topLevel = parseUsageRecord(value, source);
  if (topLevel) return topLevel;

  for (const nested of Object.values(value)) {
    if (!isRecord(nested) && !Array.isArray(nested)) continue;
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const parsed = findTokenUsage(item, source, depth + 1);
        if (parsed) return parsed;
      }
    } else {
      const parsed = findTokenUsage(nested, source, depth + 1);
      if (parsed) return parsed;
    }
  }

  return null;
}

function extractTokenUsageFromSources(sendResult: unknown, rawEvents: RawEvent[]): TokenUsageRecord | null {
  const fromSendResult = findTokenUsage(sendResult, "sendAndWait");
  if (fromSendResult) return fromSendResult;

  for (const event of rawEvents) {
    const fromEvent = findTokenUsage(event.data, "raw_event");
    if (fromEvent) return fromEvent;
  }

  return null;
}

function estimateTokenCount(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) return 0;
  // Lightweight heuristic: roughly 4 chars per token in English prose.
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function normalizeTokenUsage(
  rawUsage: TokenUsageRecord | null,
  promptText: string,
  responseText: string
): NormalizedTokenUsage {
  const promptTokens = rawUsage?.promptTokens ?? estimateTokenCount(promptText);
  const outputTokens = rawUsage?.completionTokens ?? estimateTokenCount(responseText);
  const totalTokens = rawUsage?.totalTokens ?? (promptTokens + outputTokens);

  return { promptTokens, outputTokens, totalTokens };
}

// ─────────────────────────────────────────────────────────────
// Retry Helper
// ─────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number,
  label: string
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt <= retries) {
        console.warn(`  ⚠️  Attempt ${attempt} failed for "${label}": ${lastError.message}`);
        console.warn(`     Retrying in ${delayMs / 1000}s... (${retries - attempt + 1} retries left)`);
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────────
// Partial Save
// ─────────────────────────────────────────────────────────────

function savePartialResults(
  sessions: SessionWrapper[],
  outputFile: string,
  workspaceHash: string
): void {
  const partialFile = outputFile.replace(".json", ".partial.json");
  const output: TraceOutput = {
    since_filter: null,
    workspace_count: 1,
    workspaces: {
      [workspaceHash]: { workspacePath: process.cwd(), sessions },
    },
  };
  writeFileSync(partialFile, JSON.stringify(output, null, 2));
  console.log(`  💾 Partial results saved to ${partialFile}`);
}

// ─────────────────────────────────────────────────────────────
// Main Eval Runner
// ─────────────────────────────────────────────────────────────

async function runEval(): Promise<void> {
  console.log("\n🚀 Gastown Eval Kit\n");

  // Load configuration
  const config = loadConfig();

  // Resolve paths and load content up front so we can print the full banner
  const agentResolution = resolveAgentConfig(config);
  const agentPromptPath = agentResolution.promptPath;
  const agentContent = agentResolution.content;
  const agentMeta = parseAgentFrontmatter(agentContent);
  const { content: skillContent, skills: loadedSkills } = loadSkillContent(config);
  const questions = loadQuestions(config.questions.csv_path);

  // ── Live agent banner ──────────────────────────────────────
  console.log("─".repeat(60));
  const usingSkillsOnly = agentContent.trim().length === 0;
  console.log(`  Agent:     ${usingSkillsOnly ? "skills-only" : agentMeta.name}`);
  console.log(`  File:      ${usingSkillsOnly ? "(none)" : (config.agent.agent_file ?? "(none)")}`);
  console.log(`  Skills:    ${loadedSkills.join(", ")}`);
  if (!usingSkillsOnly && agentMeta.model !== "unknown" && agentMeta.model !== config.model.name) {
    console.log(`  Eval model:  ${config.model.name}  (agent default: ${agentMeta.model})`);
  } else {
    console.log(`  Model:     ${config.model.name}`);
  }
  console.log(`  Questions: ${config.questions.csv_path} (${questions.length} loaded)`);
  console.log(`  Output:    ${config.output.file}`);
  console.log(`  Retries:   ${config.execution.retries}`);
  console.log("─".repeat(60));
  console.log("");

  // Start Copilot client
  const client = new CopilotClient({ autoStart: true, autoRestart: true });
  await client.start();

  const workspaceHash = createHash("sha256").update(process.cwd()).digest("hex");
  const sessions: SessionWrapper[] = [];
  let failures = 0;

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const questionLabel = question.text.length > 55
      ? question.text.slice(0, 52) + "..."
      : question.text;

    console.log(`\n  [${i + 1}/${questions.length}] ${questionLabel}`);

    try {
      const sessionWrapper = await withRetry(
        () => evaluateQuestion(client, question, config, agentPromptPath, agentContent, skillContent),
        config.execution.retries,
        config.execution.retry_delay_ms,
        questionLabel
      );

      sessions.push(sessionWrapper);
      const request = sessionWrapper.data.requests[0];
      const latency = request?.latencyMs ?? 0;
      const tokenSuffix = request?.result?.metadata?.totalTokens !== undefined
        ? ` | tokens: ${request.result.metadata.totalTokens}`
        : "";
      console.log(`  ✅ ${latency}ms${tokenSuffix} | category: ${question.category}`);
    } catch (err) {
      failures++;
      console.error(`  ❌ FAILED after ${config.execution.retries + 1} attempts: ${(err as Error).message}`);

      // Save partial results on failure if configured
      if (config.execution.save_partial && sessions.length > 0) {
        savePartialResults(sessions, config.output.file, workspaceHash);
      }
    }
  }

  await client.stop();

  // Write final output
  console.log("\n" + "─".repeat(60));

  if (sessions.length === 0) {
    console.error("\n❌ No successful evaluations. Nothing to write.");
    process.exit(1);
  }

  const output: TraceOutput = {
    since_filter: null,
    workspace_count: 1,
    workspaces: {
      [workspaceHash]: { workspacePath: process.cwd(), sessions },
    },
  };

  writeFileSync(config.output.file, JSON.stringify(output, null, 2));

  console.log(`\n✅ Done! ${sessions.length} sessions written to ${config.output.file}`);
  if (failures > 0) {
    console.warn(`⚠️  ${failures} question(s) failed and were skipped.`);
  }
  console.log("");
}

// ─────────────────────────────────────────────────────────────
// Single Question Evaluation
// ─────────────────────────────────────────────────────────────

async function evaluateQuestion(
  client: CopilotClient,
  question: Question,
  config: Config,
  agentPromptPath: string,
  agentContent: string,
  skillContent: string
): Promise<SessionWrapper> {
  const sessionId = randomUUID();
  const sessionCreationDate = Date.now();
  const model = config.model.name;

  const session = await client.createSession({
    model,
    streaming: true,
    onPermissionRequest: approveAll,
    systemMessage: {
      mode: "customize",
      sections: {
        custom_instructions: {
          action: "replace",
          content: agentContent.trim().length > 0
            ? `${agentContent}\n\n---\n\n${skillContent}`
            : skillContent,
        },
      },
    },
  });

  const requestId = randomUUID();
  const responseId = randomUUID();
  const rawEvents: RawEvent[] = [];
  let accumulated = "";
  let firstProgressAt: number | null = null;

  const unsub = session.on("assistant.message_delta", (event: { data: { deltaContent: string } }) => {
    if (firstProgressAt === null) {
      firstProgressAt = Date.now();
    }
    accumulated += event.data.deltaContent;
    rawEvents.push({
      type: "assistant.message_delta",
      timestamp: Date.now(),
      data: { deltaContent: event.data.deltaContent },
    });
  });

  // Capture additional events
  const sessionEmitter = session as unknown as {
    on: (event: string, cb: (...args: unknown[]) => void) => () => void;
  };
  const otherUnsubs: Array<() => void> = [];
  for (const eventName of ["turn.complete", "tool.call", "tool.result", "assistant.message", "error"]) {
    const u = sessionEmitter.on(eventName, (...args: unknown[]) => {
      rawEvents.push({ type: eventName, timestamp: Date.now(), data: args });
    });
    otherUnsubs.push(u);
  }

  const sentAt = Date.now();
  rawEvents.push({ type: "request.sent", timestamp: sentAt, data: { prompt: question.text } });

  const sendResult = await session.sendAndWait(
    { prompt: question.text },
    config.execution.timeout_seconds * 1000
  );

  const completedAt = Date.now();
  rawEvents.push({ type: "response.complete", timestamp: completedAt, data: { response: accumulated } });

  unsub();
  otherUnsubs.forEach((u) => u());

  const tokenUsage = extractTokenUsageFromSources(sendResult, rawEvents);
  const normalizedTokenUsage = normalizeTokenUsage(tokenUsage, question.text, accumulated);
  const firstProgress = firstProgressAt !== null ? firstProgressAt - sentAt : null;
  const totalElapsed = completedAt - sentAt;

  const requestRecord: RequestRecord = {
    requestId,
    responseId,
    timestamp: new Date(sentAt).toISOString(),
    modelId: `copilot/${model}`,
    agent: agentPromptPath,
    message: {
      text: question.text,
    },
    response: [{ value: accumulated }],
    followups: [],
    variableData: { category: question.category },
    timeSpentWaiting: sentAt,
    modelState: { completedAt },
    latencyMs: totalElapsed,
    contentReferences: [],
    codeCitations: [],
    rawEvents,
    result: {
      timings: {
        firstProgress,
        totalElapsed,
      },
      metadata: {
        promptTokens: normalizedTokenUsage.promptTokens,
        outputTokens: normalizedTokenUsage.outputTokens,
        totalTokens: normalizedTokenUsage.totalTokens,
      },
    },
  };

  const sessionRecord: SessionRecord = {
    sessionId,
    timestamp: new Date(sessionCreationDate).toISOString(),
    creationDate: sessionCreationDate,
    customTitle: question.text.length > 60 ? question.text.slice(0, 57) + "..." : question.text,
    responderUsername: "GitHub Copilot",
    modelId: `copilot/${model}`,
    initialLocation: "panel",
    inputState: {
      mode: { id: agentPromptPath, kind: "agent" },
      selectedModel: { identifier: `copilot/${model}` },
      attachments: [],
      inputText: question.text,
      selections: [],
      contrib: {},
    },
    requests: [requestRecord],
  };

  return { version: 3, hasPendingEdits: false, pendingRequests: [], data: sessionRecord };
}

// ─────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────

runEval().catch((err) => {
  console.error(`\n❌ Fatal error: ${err.message}`);
  process.exit(1);
});
