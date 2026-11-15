#!/bin/bash
# One-paste setup for free247editor on a Mac (Linux works when node, git and ffmpeg are already there).
# Installs Homebrew and Claude Code (through webinar's claude.sh), then Git, Node.js and FFmpeg, puts the editor in
# ~/free247editor, runs its setup.mjs, then opens Claude on "start". Safe to run again.
#   curl -fsSL https://webinar.riecodes.com/editor.sh | bash
# English messages: curl -fsSL https://webinar.riecodes.com/editor.sh | RIE_LANG=en bash
# Dry run (prints every step, installs and changes nothing): curl -fsSL https://webinar.riecodes.com/editor.sh | RIE_DRY=1 bash
# Everything sits in main(): bash reads this script from the pipe, so a step that reads stdin would eat the rest.
main() {
  local bin="$HOME/.local/bin" dir="$HOME/free247editor" repo="https://github.com/riecodes/free247editor.git"
  local dry="" brew="" claude="" missing="" pkgs="" major=0
  [ "${RIE_DRY:-}" = 1 ] && dry=1
  say() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
  warn() { printf '\n\033[33m== %s\033[0m\n' "$1"; }
  stop() { printf '\n\033[31m== %s %s\033[0m\n' "$1" "$(l "I-screenshot ito at i-send kay Eirmon." "Take a screenshot and send it to Eirmon.")"; }
  l() { if [ "${RIE_LANG:-}" = en ]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
  step() { say "[$1/6] $2"; }
  # Every change goes through run, so the dry run prints exactly what a real run would do.
  run() { if [ -n "$dry" ]; then printf '   \033[90m[dry run] %s\033[0m\n' "$*"; else "$@"; fi; }
  has() { command -v "$1" >/dev/null 2>&1; }
  find_brew() { for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && { echo "$b"; return; }; done; }
  find_claude() { if [ -x "$bin/claude" ]; then echo "$bin/claude"; else command -v claude; fi; }
  node_major() { if has node; then node -v | sed 's/^v\([0-9]*\).*/\1/'; else echo 0; fi; }

  [ -n "$dry" ] && warn "$(l "DRY RUN: walang ini-install o binabago. Pinapakita lang ang gagawin." "DRY RUN: nothing is installed or changed. This only shows what would happen.")"
  step 1 "$(l "Na-paste mo na ang setup. Tapos na ito." "You pasted the setup. This step is done.")"

  step 2 "Homebrew + Claude Code"
  claude=$(find_claude)
  [ -n "$claude" ] && echo "   $(l "Meron na:" "Already there:") $claude"
  # Run either way: claude.sh also installs Homebrew and repairs PATH. Piping its output stops it from opening Claude.
  if [ -n "$dry" ]; then run "curl -fsSL https://webinar.riecodes.com/claude.sh | bash | cat  (installs Homebrew and Claude Code or fixes PATH, does not open Claude)"
  else curl -fsSL https://webinar.riecodes.com/claude.sh | bash | cat; fi
  export PATH="$bin:$PATH"
  brew=$(find_brew)
  [ -n "$brew" ] && eval "$("$brew" shellenv)"
  claude=$(find_claude)
  if [ -z "$claude" ] && [ -z "$dry" ]; then stop "$(l "Hindi na-install ang Claude Code." "Claude Code didn't install.")"; return 1; fi

  step 3 "Git, Node.js, FFmpeg"
  major=$(node_major)
  has git || { missing="$missing Git"; pkgs="$pkgs git"; }
  [ "${major:-0}" -ge 22 ] 2>/dev/null || { missing="$missing Node.js"; pkgs="$pkgs node"; }
  { has ffmpeg && has ffprobe; } || { missing="$missing FFmpeg"; pkgs="$pkgs ffmpeg"; }
  if [ -z "$pkgs" ]; then echo "   $(l "Meron na lahat." "All already there.")"
  elif [ -n "$brew" ] || { [ -n "$dry" ] && [ "$(uname)" = Darwin ]; }; then
    # $pkgs is a list of fixed names, split on purpose.
    # shellcheck disable=SC2086
    run "${brew:-brew}" install $pkgs
  elif [ -z "$dry" ]; then
    stop "$(l "Kulang pa:$missing. I-install gamit ang package manager mo, tapos i-paste ulit." "Still missing:$missing. Install them with your package manager, then paste the line again.")"
    return 1
  else run "(no Homebrew: tell the user to install$missing with their package manager)"
  fi
  if [ -z "$dry" ]; then
    has git && has ffmpeg && has ffprobe && [ "$(node_major)" -ge 22 ] || { stop "$(l "Hindi na-install lahat ng tools." "Not every tool installed.")"; return 1; }
  fi

  step 4 "$(l "free247editor sa $dir. Ilang minuto ito." "free247editor in $dir. This takes a few minutes.")"
  if [ -d "$dir/.git" ]; then
    # A failed update is fine: the copy already there still works.
    run git -C "$dir" pull --ff-only || warn "$(l "Hindi na-update, gagamitin ang dati." "Couldn't update, using the copy you have.")"
  else
    run git clone --depth 1 "$repo" "$dir" || { stop "$(l "Hindi ma-download ang free247editor sa $dir." "Couldn't download free247editor into $dir.")"; return 1; }
  fi

  step 5 "setup.mjs"
  # If setup stops halfway, Claude still opens next and helps finish it.
  if [ -n "$dry" ]; then run "cd $dir && node setup.mjs"
  else (cd "$dir" && node setup.mjs) || warn "$(l "May kulang pa sa setup. Si Claude na ang tutulong pag bukas niya." "Setup isn't finished. Claude helps with it once it opens.")"; fi

  step 6 "$(l "Bubuksan na si Claude. Piliin ang \"Claude account with subscription\" at mag-log in gamit ang Pro o Max mo." "Opening Claude. Choose \"Claude account with subscription\" and log in with your Pro or Max.")"
  if [ -n "$dry" ]; then run "cd $dir && claude --chrome start"; say "$(l "Tapos ang dry run. Walang binago." "Dry run finished. Nothing changed.")"; return 0; fi
  # Started from a script or a log (not a person at a window): stop here.
  [ -t 1 ] && [ -e /dev/tty ] || return 0
  # Same as claude.sh: stdin is the curl pipe, so Claude gets the window's own terminal device. Not /dev/tty:
  # macOS kqueue rejects it, and Claude crashes at start with "EINVAL: invalid argument, kqueue".
  local term; term=$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')
  case "$term" in ""|"?"|"??") term=/dev/tty ;; *) term="/dev/$term" ;; esac
  cd "$dir" || return 1
  "$claude" --chrome start <"$term" || warn "$(l "Kung nag-error si Claude dito: isara ang window na ito, magbukas ng bagong Terminal, at i-type: cd ~/free247editor && claude" "If Claude errored here: close this window, open a new Terminal, and type: cd ~/free247editor && claude")"
}
main
