import { resolveResource } from "@tauri-apps/api/path"
import { Command, type Child } from "@tauri-apps/plugin-shell"

// The engine is app/engine/main.mjs on the bundled Node, spoken to in JSON lines over stdin/stdout.
declare const __ENGINE_MAIN__: string

export type Engine = "claude" | "codex"
export type Msg = { id?: number; type: string; [key: string]: unknown }
export type EngineError = Error & { code?: string; step?: string }

export type CliStatus = { installed: boolean; loggedIn: boolean; plan?: string | null; message?: string }
// The cloud transcription provider, from the engine's TRANSCRIBE_PROVIDER.
export type Provider = { id: string; name: string; keyUrl: string; keyPattern: string; keyHint: string }
export type Job = {
  slug: string
  name: string
  engine: Engine
  versions: number[]
  current: number
  notes?: Record<string, string>
  times?: Record<string, string>
  created?: string
  summary?: string
  final?: { version: number; mp4: string; srt: string; encoder: string }
  files: Record<string, { mp4: string; srt: string }>
}
export type Status = {
  steps: { id: string; weight: number; done: boolean }[]
  setupDone: boolean
  claude: CliStatus
  codex: CliStatus
  jobs: Job[]
  testVideo: string | null
  work: string
}

type Pending = { resolve: (m: Msg) => void; reject: (e: EngineError) => void; onProgress?: (m: Msg) => void }

let child: Child | null = null
let nextId = 1
const pending = new Map<number, Pending>()
const listeners = new Set<(m: Msg) => void>()

export function onEngine(fn: (m: Msg) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
const emit = (m: Msg) => listeners.forEach((fn) => fn(m))

let starting: Promise<void> | null = null
// Once per page load (React's dev mode runs effects twice). A reloaded page starts a new engine,
// and the old one exits by itself when it sees the newer one.
export function startEngine() {
  starting ??= spawnEngine()
  return starting
}

async function spawnEngine() {
  const main = import.meta.env.DEV ? __ENGINE_MAIN__ : await resolveResource("engine/main.mjs")
  const cmd = Command.sidecar("binaries/node", [main, import.meta.env.DEV ? "--dev" : "--prod"], {
    encoding: "utf-8",
    // Killing the engine also stops the Claude Code or Codex run it started.
    processGroup: true,
  })
  cmd.stdout.on("data", (line) => {
    let msg: Msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const waiting = msg.id ? pending.get(msg.id) : undefined
    if (!waiting) return emit(msg)
    if (msg.type === "progress") return waiting.onProgress?.(msg)
    pending.delete(msg.id!)
    if (msg.type === "result") waiting.resolve(msg)
    else waiting.reject(Object.assign(new Error(String(msg.message)), { code: msg.code as string, step: msg.step as string }))
  })
  cmd.stderr.on("data", (line) => console.warn("[engine]", line))
  cmd.on("close", ({ code }) => {
    child = null
    for (const p of pending.values()) p.reject(Object.assign(new Error("Huminto ang engine."), { code: "exit" }))
    pending.clear()
    emit({ type: "exit", code })
  })
  child = await cmd.spawn()
}

export function call<T = Msg>(cmd: string, args: Record<string, unknown> = {}, onProgress?: (m: Msg) => void): Promise<T> {
  if (!child) return Promise.reject(Object.assign(new Error("Hindi pa handa ang engine."), { code: "exit" }))
  const id = nextId++
  const promise = new Promise<Msg>((resolve, reject) => pending.set(id, { resolve, reject, onProgress }))
  child.write(JSON.stringify({ id, cmd, ...args }) + "\n").catch(() => {})
  return promise as Promise<T>
}
