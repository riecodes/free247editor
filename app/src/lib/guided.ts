import { convertFileSrc } from "@tauri-apps/api/core"
import { useEffect } from "react"

// Guided picks and the bundled OFL caption fonts (the same files the render uses, in work\fonts).
export type Picks = Record<string, string>
export const DEFAULT_PICKS: Picks = { format: "vertical", pace: "tight", colour: "yellow", font: "anton", hook: "big", captions: "word", position: "upper", safe: "off", visuals: "some", zoom: "on", sfx: "pop", music: "none", cta: "none" }
export const FONT_FAMILY: Record<string, string> = { anton: "F247 Anton", bebas: "F247 Bebas", montserrat: "F247 Montserrat", poppins: "F247 Poppins", archivo: "F247 Archivo" }
const FONT_FILE: Record<string, string> = { anton: "anton.woff2", bebas: "bebas-neue.woff2", montserrat: "montserrat-800.woff2", poppins: "poppins-700.woff2", archivo: "archivo-black.woff2" }

export function useCaptionFonts(fontsDir: string) {
  useEffect(() => {
    if (!fontsDir) return
    for (const [id, file] of Object.entries(FONT_FILE)) {
      const face = new FontFace(FONT_FAMILY[id], `url(${convertFileSrc(`${fontsDir}\\${file}`)})`)
      face.load().then((f) => document.fonts.add(f)).catch(() => {})
    }
  }, [fontsDir])
}
