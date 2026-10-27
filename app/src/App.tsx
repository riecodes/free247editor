import { invoke } from "@tauri-apps/api/core"
import { videoDir } from "@tauri-apps/api/path"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { open } from "@tauri-apps/plugin-dialog"
import { useCallback, useEffect, useRef, useState } from "react"
import { LangPill } from "@/components/LangPill"
import { Sidebar, type Speed, type Template } from "@/components/Sidebar"
import { ThemePill } from "@/components/ThemePill"
import icon from "../icon.svg"
import wordmark from "@/assets/wordmark.svg"
import wordmarkDark from "@/assets/wordmark-dark.svg"
import { newRun } from "@/lib/copy"
import { call, onEngine, startEngine, type Engine, type EngineError, type Job, type Msg, type Provider, type Status } from "@/lib/engine"
import { setupEta, setupPercent, setupPhase, type Answers, type SetupRun } from "@/lib/onboarding"
import { errorText, useT } from "@/lib/strings"
import { cn } from "@/lib/utils"
import { Editing, type EditRun } from "@/screens/Editing"
import { Questions, Wait, type SetupView } from "@/screens/FirstRun"
import { DEFAULT_PICKS, useCaptionFonts, type Picks } from "@/lib/guided"
import { Choose, Guided } from "@/screens/Guided"
import { Home } from "@/screens/Home"
import { Review } from "@/screens/Review"

type Screen = "wait" | "q" | "ready" | "home" | "choose" | "guided" | "editing" | "review"
type Prepared = { slug: string; src: string; name: string }
const VIDEO = /\.(mp4|mov|m4v|mkv|webm)$/i
const CLI = { claude: "Claude Code", codex: "Codex" } as const
const FALLBACK_PROVIDER: Provider = { id: "groq", name: "Groq", keyUrl: "https://console.groq.com/keys", keyPattern: "", keyHint: "gsk_..." }
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`free247editor-${k}`)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`free247editor-${k}`, v)
    } catch {
      // this session only
    }
  },
}
const savedAnswers = (): Answers => {
  try {
    return JSON.parse(store.get("answers") || "{}")
  } catch {
    return {}
  }
}

export default function App() {
  const [t, lang] = useT()
  const [engineState, setEngineState] = useState<"starting" | "ready" | "down">("starting")
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<Provider>(FALLBACK_PROVIDER)
  const [groq, setGroq] = useState(false)
  const [screen, setScreen] = useState<Screen | null>(null)
  const [qStep, setQStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>(savedAnswers)
  const [engine, setEngineChoice] = useState<Engine>(() => (store.get("engine") === "codex" ? "codex" : "claude"))
  // Best is the CLI's own default for the plan (Sonnet on Pro, the strongest on Max); Faster forces Sonnet.
  const [speed, setSpeedState] = useState<Speed>(() => (store.get("speed") === "fast" ? "fast" : "best"))
  const [signingIn, setSigningIn] = useState<Engine | null>(null)
  const [signInError, setSignInError] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, SetupRun>>({})
  const [setupError, setSetupError] = useState<string | null>(null)
  const [setupStarted, setSetupStarted] = useState(0)
  const [now, setNow] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [run, setRun] = useState<EditRun | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [viewing, setViewing] = useState(1)
  const [busy, setBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [rule, setRule] = useState<string | null>(null)
  // Quick or Guided: the checked template, the dropped file, and the Guided picks on its still.
  const [templates, setTemplates] = useState<Template[]>([])
  const [template, setTemplateState] = useState(() => store.get("template") || "default")
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null)
  const [path, setPathState] = useState<"quick" | "guided">(() => (store.get("path") === "guided" ? "guided" : "quick"))
  const [pending, setPending] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [still, setStill] = useState<string | null>(null)
  const [sample, setSample] = useState("")
  const [picks, setPicks] = useState<Picks>(DEFAULT_PICKS)
  const [preparing, setPreparing] = useState(false)
  const settingUp = useRef(false)
  const styleTimer = useRef(0)
  const retry = useRef<() => void>(() => {})
  const onboarded = Boolean(store.get("onboarded"))

  const refresh = useCallback(async () => {
    const [s, g, tp] = await Promise.all([call<Status>("status"), invoke<boolean>("has_groq_key"), call<{ templates: Template[] }>("templates")])
    setStatus(s)
    setGroq(g)
    setTemplates(tp.templates)
    return s
  }, [])

  const setTemplate = (id: string) => {
    setTemplateState(id)
    store.set("template", id)
  }
  const setPath = (p: "quick" | "guided") => {
    setPathState(p)
    store.set("path", p)
  }

  // Setup runs in the background from the first launch; the first-run screens only watch it.
  const runSetup = useCallback(async () => {
    if (settingUp.current) return
    settingUp.current = true
    setSetupError(null)
    setRuns({})
    setSetupStarted(Date.now())
    try {
      await call("setup", {}, (m) => setRuns((r) => ({ ...r, [m.step as string]: { status: m.status as string, percent: m.percent as number, message: m.message as string } })))
    } catch (e) {
      setSetupError((e as EngineError).message)
    }
    settingUp.current = false
    await refresh()
  }, [refresh])

  // Every launch: start the engine, then re-check the kit and both CLIs' sign-in (the startup check).
  useEffect(() => {
    let live = true
    const off = onEngine((m) => m.type === "exit" && setEngineState("down"))
    startEngine()
      .then(() => call<{ provider?: Provider }>("hello"))
      .then((h) => {
        if (h.provider) setProvider(h.provider)
        return refresh()
      })
      .then((s) => {
        if (!live) return
        setEngineState("ready")
        setScreen((cur) => cur ?? (store.get("onboarded") && s.setupDone ? "home" : "wait"))
        if (!s.setupDone) void runSetup()
      })
      .catch(() => live && setEngineState("down"))
    return () => {
      live = false
      off()
    }
  }, [refresh, runSetup])

  // The ring's time left ticks only while a first-run screen shows.
  useEffect(() => {
    if (screen !== "wait" && screen !== "q" && screen !== "ready") return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [screen])

  // Every answer is saved and written to the Default template (debounced).
  const setAnswer = (patch: Answers) => {
    const next = { ...answers, ...patch }
    setAnswers(next)
    store.set("answers", JSON.stringify(next))
    clearTimeout(styleTimer.current)
    styleTimer.current = window.setTimeout(() => void call("style", { answers: next }).catch(() => {}), 400)
  }

  const setEngine = (e: Engine) => {
    setEngineChoice(e)
    store.set("engine", e)
    setSignInError(null)
  }

  // The CLI's own sign-in opens in a visible window; poll every 2 s while it is open.
  const signIn = async (e: Engine, device = false) => {
    setSigningIn(e)
    setSignInError(null)
    const timer = setInterval(() => void refresh(), 2000)
    try {
      const s = await call<{ loggedIn: boolean }>("login", { engine: e, device })
      if (!s.loggedIn) setSignInError(t("ai.failed"))
    } catch (err) {
      setSignInError((err as EngineError).message)
    }
    clearInterval(timer)
    setSigningIn(null)
    await refresh()
  }

  const finishOnboarding = () => {
    store.set("onboarded", "1")
    setScreen("home")
  }

  const progress = (m: Msg) =>
    setRun((r) => (r ? { ...r, line: (m.line as string) || r.line, ...(m.step && m.step !== r.step ? { step: m.step as string, stepStarted: Date.now() } : {}) } : r))

  const finish = async (result: Job) => {
    setJob(result)
    setViewing(result.current)
    setRun(null)
    setScreen("review")
    await refresh()
  }

  const fail = (err: unknown, back: Screen) => {
    const e = err as EngineError
    if (e.code === "cancelled" || e.code === "notVideo") {
      setRun(null)
      setScreen(back)
      if (e.code === "notVideo") setDropError(e.message)
    } else setRun((r) => (r ? { ...r, error: errorText(t, e, provider.name) } : r))
  }

  // A drop goes to the Quick or Guided choice first.
  const startEdit = async (file: string) => {
    if (!status) return
    const name = file.split(/[\\/]/).pop() || file
    if (!VIDEO.test(file)) return setDropError(t("home.notVideo", { name }))
    if (!status.setupDone || !status[engine].loggedIn || !groq) return setDropError(t("home.fixFirst"))
    setDropError(null)
    setPending(file)
    setScreen("choose")
  }

  const runEdit = async (args: { path?: string; prepared?: Prepared; template: string }) => {
    const name = args.prepared?.name ?? args.path?.split(/[\\/]/).pop() ?? ""
    retry.current = () => void runEdit(args)
    setRun(newRun("edit", name, 1, args.prepared ? "cut" : "transcribe"))
    setScreen("editing")
    try {
      const { job } = await call<{ job: Job }>("edit", { ...args, engine, speed }, progress)
      await finish(job)
    } catch (err) {
      fail(err, "home")
    }
  }

  const go = async () => {
    if (!pending) return
    if (path === "quick") return void runEdit({ path: pending, template })
    setPreparing(true)
    try {
      const res = await call<{ prepared: Prepared; still: string | null; sample: string }>("prepare", { path: pending })
      setPrepared(res.prepared)
      setStill(res.still)
      setSample(res.sample)
      setPicks(DEFAULT_PICKS)
      setScreen("guided")
    } catch (err) {
      setDropError(errorText(t, err as EngineError, provider.name))
      setScreen("home")
    }
    setPreparing(false)
  }

  const saveAndEdit = async (name: string, makeDefault: boolean) => {
    try {
      const { template: tp } = await call<{ template: Template }>("saveTemplate", { name, picks })
      await refresh()
      if (makeDefault) setTemplate(tp.id)
      setSavedTemplate(tp.name)
      void runEdit({ prepared: prepared!, template: tp.id })
      return null
    } catch (err) {
      return errorText(t, err as EngineError, provider.name)
    }
  }

  const editOnce = async () => {
    await call("saveTemplate", { once: true, picks })
    void runEdit({ prepared: prepared!, template: "_once" })
  }

  const sendNote = async (note: { chips: string[]; text: string; rule: boolean }) => {
    if (!job) return
    retry.current = () => void sendNote(note)
    setRun(newRun("note", job.name, Math.max(...job.versions) + 1, "cut"))
    setScreen("editing")
    try {
      const res = await call<{ job: Job; rule: string | null }>("note", { slug: job.slug, lang, speed, ...note }, progress)
      if (res.rule) setRule(res.rule)
      await finish(res.job)
    } catch (err) {
      fail(err, "review")
    }
  }

  const reviewAction = async (cmd: string, args: Record<string, unknown>) => {
    setBusy(true)
    setReviewError(null)
    try {
      const res = await call<{ job: Job }>(cmd, args)
      setJob(res.job)
      setViewing(res.job.current)
    } catch (err) {
      setReviewError(errorText(t, err as EngineError, provider.name))
    }
    setBusy(false)
    void refresh()
  }

  // The whole window takes a drop while the home screen shows (real file paths from Tauri).
  useEffect(() => {
    if (screen !== "home") return
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") setDragging(true)
      else if (e.payload.type === "leave") setDragging(false)
      else if (e.payload.type === "drop") {
        setDragging(false)
        if (e.payload.paths[0]) void startEdit(e.payload.paths[0])
      }
    })
    return () => void un.then((f) => f())
  })

  // Dev builds only: lets a test drive the same path a dropped file takes.
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __f247: { drop: startEdit } })
  })

  const pickFile = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Video", extensions: ["mp4", "mov", "m4v", "mkv", "webm"] }] })
    if (typeof path === "string") void startEdit(path)
  }

  const setupDone = Boolean(status?.setupDone)
  const pct = setupDone ? 100 : status ? setupPercent(status.steps, runs) : 0
  const [etaKey, etaVars] = setupEta(setupStarted, now, pct, setupDone)
  const setupView: SetupView = { pct, eta: t(etaKey, etaVars), phase: t(setupPhase(runs, pct, setupDone, Boolean(setupError))), done: setupDone, error: setupError }
  const copyDetails = async () => {
    const failed = Object.entries(runs).find(([, r]) => r.status === "error")
    const lines = ["free247editor 0.1.0", navigator.userAgent.match(/Windows NT [\d.]+/)?.[0] ?? "Windows", `setup ${pct}%`, failed ? `${failed[0]}: ${failed[1].message}` : setupError, new Date().toISOString()]
    await navigator.clipboard.writeText(lines.join("\n")).catch(() => {})
  }

  useCaptionFonts(status ? `${status.work}\\fonts` : "")

  const cli = status?.[engine]
  const plan = cli?.plan?.replace(/^Claude /, "") ?? ""
  const templateName = template === "default" ? t("side.default") : (templates.find((x) => x.id === template)?.name ?? t("side.default"))
  const engineLine = cli?.loggedIn ? (engine === "claude" ? t("side.claude", { plan }) : t("side.chatgpt")) : t("side.signedOut", { cli: CLI[engine] })
  const firstRun = screen === "wait" || screen === "q" || screen === "ready"
  const showSidebar = screen === "home" || screen === "review" || screen === "choose" || screen === "guided"

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b bg-header px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex items-center gap-2">
            <img src={icon} alt="" className="size-[30px]" />
            <img src={wordmark} alt="free247editor" className="h-6 w-auto dark:hidden" />
            <img src={wordmarkDark} alt="free247editor" className="hidden h-6 w-auto dark:block" />
          </span>
          <span role="status" className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", engineState === "down" ? "text-destructive" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", engineState === "ready" ? "bg-ok" : engineState === "down" ? "bg-destructive" : "bg-warn")} aria-hidden="true" />
            {engineState === "ready" ? t("app.engineReady") : engineState === "down" ? t("app.engineDown") : t("app.engineStarting")}
          </span>
        </div>
        {cli?.loggedIn && (
          <button
            type="button"
            onClick={() => {
              setQStep(5)
              setScreen("q")
            }}
            aria-label={t("app.changeAi")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-3.5 text-[13px]"
          >
            <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
            {cli.plan} · {CLI[engine]}
          </button>
        )}
        {firstRun && onboarded && setupDone && (
          <button type="button" onClick={() => setScreen("home")} className="inline-flex min-h-11 items-center rounded-full border bg-card px-3.5 text-[13px] font-semibold">
            {t("app.backHome")}
          </button>
        )}
        <LangPill />
        <ThemePill />
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {showSidebar && status && (
          <Sidebar
            engineLine={engineLine}
            engineOk={Boolean(cli?.loggedIn)}
            speed={engine === "claude" ? speed : undefined}
            setSpeed={(s) => {
              setSpeedState(s)
              store.set("speed", s)
            }}
            templates={templates}
            template={template}
            setTemplate={setTemplate}
            saved={savedTemplate}
            job={screen === "review" ? job : null}
            busy={busy}
            onRestore={(v) => reviewAction("use", { slug: job!.slug, version: v })}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!status || !screen ? (
            <main className="flex flex-1 items-center justify-center p-10 text-muted-foreground">{engineState === "down" ? t("app.engineNotStarted") : t("app.loading")}</main>
          ) : screen === "wait" || screen === "ready" ? (
            <Wait
              mode={screen}
              setup={setupView}
              name={answers.name?.trim() ?? ""}
              onRetry={() => void runSetup()}
              onCopy={copyDetails}
              onStart={() => {
                setQStep(0)
                setScreen("q")
              }}
              onDrop={finishOnboarding}
            />
          ) : screen === "q" ? (
            <Questions
              step={qStep}
              setStep={setQStep}
              answers={answers}
              setAnswer={setAnswer}
              setup={setupView}
              status={status}
              provider={provider}
              groq={groq}
              engine={engine}
              setEngine={setEngine}
              signIn={signIn}
              signingIn={signingIn}
              signInError={signInError}
              onGroq={() => setGroq(true)}
              onBackToWait={() => setScreen("wait")}
              onFinish={() => (onboarded && setupDone ? setScreen("home") : setScreen("ready"))}
            />
          ) : screen === "home" ? (
            <Home
              status={status}
              provider={provider}
              groq={groq}
              engine={engine}
              dragging={dragging}
              dropError={dropError}
              onPickFile={pickFile}
              onOpen={(j) => {
                setJob(j)
                setViewing(j.current)
                setRule(null)
                setReviewError(null)
                setScreen("review")
              }}
              goSetup={() => setScreen("wait")}
              goEngine={() => {
                setQStep(5)
                setScreen("q")
              }}
              signIn={signIn}
              signingIn={signingIn}
              signInError={signInError}
              onGroq={() => setGroq(true)}
            />
          ) : screen === "choose" ? (
            <Choose templateName={templateName} path={path} setPath={setPath} onGo={go} preparing={preparing} />
          ) : screen === "guided" ? (
            <Guided
              still={still}
              sample={sample}
              picks={picks}
              setPick={(g, v) => setPicks((p) => ({ ...p, [g]: v }))}
              onBack={() => setScreen("choose")}
              onSave={saveAndEdit}
              onEditOnly={editOnce}
            />
          ) : screen === "editing" && run ? (
            <Editing
              run={run}
              provider={provider.name}
              onCancel={() => void call("cancel")}
              onBack={() => {
                setRun(null)
                setScreen(job && run.kind === "note" ? "review" : "home")
              }}
              onRetry={() => retry.current()}
            />
          ) : job ? (
            <Review
              job={job}
              viewing={viewing}
              setViewing={setViewing}
              busy={busy}
              error={reviewError}
              rule={rule}
              onUse={(v) => reviewAction("use", { slug: job.slug, version: v })}
              onNote={sendNote}
              onApprove={async () => reviewAction("approve", { slug: job.slug, videos: await videoDir() })}
              onReveal={(path) => void call("reveal", { path }).catch((e: EngineError) => setReviewError(e.message))}
              onAgain={() => {
                setJob(null)
                setScreen("home")
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
