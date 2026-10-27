import { Monitor, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"
const KEY = "free247editor-theme"
const THEMES = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
] as const
const media = window.matchMedia("(prefers-color-scheme: dark)")
const apply = (t: Theme) => document.documentElement.classList.toggle("dark", t === "dark" || (t === "system" && media.matches))

function saved(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === "dark" || t === "system") return t
  } catch {
    // storage blocked: light
  }
  return "light"
}

// Light by default for everyone; the pick is remembered, and only System follows Windows.
export function ThemePill() {
  const [theme, setTheme] = useState<Theme>(saved)
  useEffect(() => {
    apply(theme)
    if (theme !== "system") return
    const follow = () => apply("system")
    media.addEventListener("change", follow)
    return () => media.removeEventListener("change", follow)
  }, [theme])
  const pick = (t: Theme) => {
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // this session only
    }
    setTheme(t)
  }
  return (
    <div role="group" aria-label="Theme" className="inline-flex gap-0.5 rounded-full border bg-card p-[3px]">
      {THEMES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => pick(id)}
          className={cn(
            "inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold",
            theme === id ? "bg-seg text-seg-ink" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
