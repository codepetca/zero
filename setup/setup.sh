#!/bin/bash
# Readable, dependency-free student setup; macOS Bash 3 and Linux Bash.
set -u
SETUP_DIR=$(cd "$(dirname "$0")" && pwd) || exit 1
KIT_DIR=$(cd "$SETUP_DIR/.." && pwd) || exit 1
STARTER="$KIT_DIR/starter"
export ZERO_KIT_DIR="$KIT_DIR"
CHECK_ONLY=0
NATIVE_MODE=''
case "${1:-}" in
  --check) CHECK_ONLY=1; [ "$#" = 1 ] || exit 2 ;;
  --native-check|--native-plan|--native-install|--native-extension|--native-profile|--native-open) NATIVE_MODE=$1 ;;
  '') [ "$#" = 0 ] || exit 2 ;;
  *) printf 'Usage: %s [--check]\n' "$0"; exit 2 ;;
esac
OS=$(uname -s)
CODE=''
KIT_VERSION=''
EXTENSION_ID=''
VSCODE_MINIMUM=''
CODE_VERSION=''
CODE_DIAGNOSTICS=''
JAVA_OK=0
GIT_OK=0
KIT_OK=0
EXTENSIONS_OK=0
PROFILE_OK=0
JAVA_VERSION=''
JAVAC_VERSION=''
EXTENSIONS=''

# Bound tool probes so a broken local CLI cannot leave setup waiting forever.
# Installers themselves keep their normal interactive prompts and cancellation.
probe() {
  probe_file=$(mktemp "${TMPDIR:-/tmp}/zero-setup.XXXXXX") || return 1
  "$@" >"$probe_file" 2>&1 &
  probe_pid=$!
  (
    sleep 20 & timer_sleep=$!
    trap 'kill "$timer_sleep" 2>/dev/null; exit' TERM
    wait "$timer_sleep"
    # Stop immediate CLI children too where the standard OS pgrep is available.
    if command -v pgrep >/dev/null 2>&1; then
      for child in $(pgrep -P "$probe_pid" 2>/dev/null); do kill -TERM "$child" 2>/dev/null; done
    fi
    kill -TERM "$probe_pid" 2>/dev/null
    sleep 2 & timer_sleep=$!; wait "$timer_sleep"
    kill -KILL "$probe_pid" 2>/dev/null
  ) >/dev/null 2>&1 &
  timer_pid=$!
  wait "$probe_pid"
  probe_status=$?
  kill "$timer_pid" 2>/dev/null || :
  wait "$timer_pid" 2>/dev/null || :
  cat "$probe_file"
  rm -f "$probe_file"
  return "$probe_status"
}
yes() {
  printf '%s [y/N] ' "$1"
  read -r answer || return 1
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}
version() {
  # Accept Java's version line only, not an error containing a number.
  printf '%s\n' "$1" | sed -nE 's/^(openjdk|java) version "([0-9]+(\.[0-9]+)*).*$/\2/p; s/^javac ([0-9]+(\.[0-9]+)*).*$/\1/p' | head -n 1
}
at_least() {
  # Stable numeric three-part versions; prereleases are deliberately not accepted.
  case "$1" in ''|*[!0-9.]*) return 1 ;; esac
  awk -v actual="$1" -v required="$2" 'BEGIN { split(actual,a,"."); split(required,b,"."); for(i=1;i<=3;i++){if(a[i]+0>b[i]+0)exit 0;if(a[i]+0<b[i]+0)exit 1}exit 0 }'
}
extension_version() {
  printf '%s\n' "$EXTENSIONS" | awk -F@ -v id="$1" 'tolower($1)==tolower(id) {print $2; exit}'
}
detect_code() {
  CODE=''; CODE_VERSION=''; CODE_DIAGNOSTICS=''
  candidates=("$(command -v code 2>/dev/null || :)")
  if [ "$OS" = Darwin ]; then
    candidates+=("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")
  fi
  # Only stable versions within the extension engine's major are compatible.
  # Keep the first compatible CLI, but report rejected visible installations.
  seen=''
  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    case "$seen" in *"|$candidate|"*) continue ;; esac
    seen="$seen|$candidate|"
    candidate_version=''
    if candidate_output=$(probe "$candidate" --version); then
      candidate_version=$(printf '%s\n' "$candidate_output" | head -n 1 | tr -d '\r')
    fi
    if printf '%s\n' "$candidate_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' && [ -n "$VSCODE_MINIMUM" ] && [ "${candidate_version%%.*}" = "${VSCODE_MINIMUM%%.*}" ] && at_least "$candidate_version" "$VSCODE_MINIMUM"; then
      if [ -z "$CODE" ]; then CODE=$candidate; CODE_VERSION=$candidate_version; fi
    else
      CODE_DIAGNOSTICS="$CODE_DIAGNOSTICS
VS Code candidate: $candidate (${candidate_version:-unusable/unparseable version}; requires ${VSCODE_MINIMUM:-valid kit metadata} in the same major)"
    fi
  done
}
detect_java() {
  JAVA_OK=0
  # The Maven wrapper honours JAVA_HOME. Never silently ignore a broken value.
  if [ -z "${JAVA_HOME:-}" ] && [ "$OS" = Darwin ] && [ -x /usr/libexec/java_home ]; then
    selected_home=$(probe /usr/libexec/java_home -v '17+' 2>/dev/null || :)
    if [ -d "$selected_home/bin" ]; then export JAVA_HOME="$selected_home"; fi
  fi
  if [ -n "${JAVA_HOME:-}" ]; then
    java_command="$JAVA_HOME/bin/java"
    javac_command="$JAVA_HOME/bin/javac"
  else
    java_command=$(command -v java 2>/dev/null || :)
    javac_command=$(command -v javac 2>/dev/null || :)
  fi
  JAVA_VERSION=''; JAVAC_VERSION=''
  if [ -n "$java_command" ] && [ -x "$java_command" ]; then
    java_output=$(probe "$java_command" -version) && JAVA_VERSION=$(version "$java_output")
  fi
  if [ -n "$javac_command" ] && [ -x "$javac_command" ]; then
    javac_output=$(probe "$javac_command" -version) && JAVAC_VERSION=$(version "$javac_output")
  fi
  if [ -n "$JAVA_VERSION" ] && [ "${JAVA_VERSION%%.*}" = "${JAVAC_VERSION%%.*}" ] && at_least "$JAVA_VERSION" 17.0.0; then JAVA_OK=1; fi
}
detect_git() {
  GIT_OK=0; git_version=''
  git_command=$(command -v git 2>/dev/null || :)
  # macOS /usr/bin/git can prompt to install developer tools even for --version.
  if [ "$OS" = Darwin ] && [ "$git_command" = /usr/bin/git ] && ! /usr/bin/xcode-select -p >/dev/null 2>&1; then return; fi
  if [ -n "$git_command" ]; then
    git_output=$(probe "$git_command" --version) || return
    git_version=$(printf '%s\n' "$git_output" | sed -nE 's/^git version ([0-9]+\.[0-9]+\.[0-9]+).*$/\1/p')
    if at_least "$git_version" 2.31.0; then GIT_OK=1; fi
  fi
}
detect_kit() {
  KIT_OK=0
  KIT_VERSION=''; EXTENSION_ID=''; VSCODE_MINIMUM=''
  if [ -f "$SETUP_DIR/kit.properties" ]; then
    KIT_VERSION=$(sed -n 's/^kitVersion=//p' "$SETUP_DIR/kit.properties")
    EXTENSION_ID=$(sed -n 's/^extensionId=//p' "$SETUP_DIR/kit.properties")
    VSCODE_MINIMUM=$(sed -n 's/^vscodeMinimum=//p' "$SETUP_DIR/kit.properties")
  fi
  if ! [[ "$KIT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || ! [[ "$VSCODE_MINIMUM" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ "$EXTENSION_ID" != zero.zero ]; then
    VSCODE_MINIMUM=''
    echo 'Kit metadata missing or invalid: extract the complete Zero kit again.'; return
  fi
  VSIX="$KIT_DIR/zero-$KIT_VERSION.vsix"
  for member in "$VSIX" "$KIT_DIR/optional/Zero.code-profile" "$STARTER/zero.json" "$STARTER/pom.xml" "$STARTER/mvnw" "$STARTER/mvnw.cmd" "$STARTER/.mvn/wrapper/maven-wrapper.properties" "$STARTER/.vscode/tasks.json"; do
    if [ ! -f "$member" ]; then printf 'Missing kit file: %s\nExtract the complete kit again.\n' "$member"; return; fi
  done
  if [ ! -x "$STARTER/mvnw" ]; then echo 'Starter mvnw is not executable. Extract with an archive tool that preserves permissions; ask your device administrator or IT for help.'; return; fi
  KIT_OK=1
}
detect_extensions() {
  EXTENSIONS_OK=0; PROFILE_OK=0; EXTENSIONS=''
  [ -n "$CODE" ] || return
  # VS Code's extension CLI reads profiles and fails if Zero does not exist.
  # Unlike launching --profile, this does not create an empty profile.
  if EXTENSIONS=$(probe "$CODE" --profile Zero --list-extensions --show-versions); then
    PROFILE_OK=1
    if at_least "$(extension_version "$EXTENSION_ID")" "$KIT_VERSION" && [ -n "$(extension_version redhat.java)" ]; then EXTENSIONS_OK=1; fi
  fi
}
summary() {
  detect_kit; detect_code; detect_java; detect_git; detect_extensions
  printf '\nZero setup check (profile: Zero)\n'
  if [ "$KIT_OK" = 1 ]; then echo "Kit $KIT_VERSION: complete"; else echo 'Kit: needs attention'; fi
  if [ -n "$CODE" ]; then echo "VS Code: $CODE_VERSION at $CODE"; else echo 'VS Code: missing or incompatible; see candidate details'; fi
  [ -z "$CODE_DIAGNOSTICS" ] || printf '%s\n' "$CODE_DIAGNOSTICS"
  if [ "$JAVA_OK" = 1 ]; then echo "JDK: Java $JAVA_VERSION and javac $JAVAC_VERSION"; else echo "JDK: needs matching java + javac major versions 17+ (java: ${JAVA_VERSION:-missing}, javac: ${JAVAC_VERSION:-missing})"; fi
  if [ -n "${JAVA_HOME:-}" ]; then echo "Selected JAVA_HOME: $JAVA_HOME"; fi
  echo "JDK commands: ${java_command:-missing} ; ${javac_command:-missing}"
  if [ "$PROFILE_OK" = 0 ]; then echo 'Zero profile: unavailable; create/import it before installing extensions';
  elif [ "$EXTENSIONS_OK" = 1 ]; then echo 'Zero profile extensions: ready'; else echo 'Zero profile extensions: Zero/Java support missing or Zero too old'; fi
  if [ "$PROFILE_OK" = 1 ] && [ -z "$(extension_version vscjava.vscode-java-debug)" ]; then echo 'Java debugger: missing (optional; Run App still works)'; fi
  if [ "$GIT_OK" = 1 ]; then echo "Git: $git_version at $git_command (ready for optional sharing)"; else echo "Git 2.31+: missing/old at ${git_command:-missing} (optional; local apps can run without it)"; fi
  ready
}
ready() { [ "$KIT_OK" = 1 ] && [ -n "$CODE" ] && [ "$JAVA_OK" = 1 ] && [ "$EXTENSIONS_OK" = 1 ]; }
open_url() {
  if [ "$OS" = Darwin ]; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"; else echo "Open in your browser: $1"; fi
}
help_tool() {
  case "$1" in
    code) detect_kit; detect_code; if [ -z "$VSCODE_MINIMUM" ]; then return; fi; if [ -n "$CODE" ]; then echo 'VS Code is already available. Use Check again.'; return; fi ;;
    java) detect_java; if [ "$JAVA_OK" = 1 ]; then echo 'A suitable JDK is already available. Use Check again.'; return; fi
      if [ -n "${JAVA_HOME:-}" ]; then echo 'JAVA_HOME selects an incompatible/missing JDK. Ask your device administrator or IT to select an installed matching JDK 17+; setup will not install over this environment choice.'; return; fi ;;
    git) detect_git; if [ "$GIT_OK" = 1 ]; then echo 'A suitable Git is already available. Use Check again.'; return; fi ;;
  esac
  case "$1" in
    code) title='VS Code'; url='https://code.visualstudio.com/download'; package=visual-studio-code; package_kind=(--cask) ;;
    java) title='Temurin JDK 17'; url='https://adoptium.net/temurin/releases/?version=17'; package=temurin@17; package_kind=(--cask) ;;
    git) title='Git (optional sharing)'; url='https://git-scm.com/downloads'; package=git; package_kind=(--formula) ;;
  esac
  printf '\n%s: school laptops may require your device administrator or IT to install software.\n' "$title"
  echo 'If blocked, stop here and show the check summary to them. Do not bypass school restrictions.'
  if [ "$OS" = Darwin ] && command -v brew >/dev/null 2>&1; then
    operation=install
    # Inventory queries cannot trigger Homebrew's automatic update.
    if ! inventory=$(HOMEBREW_NO_AUTO_UPDATE=1 probe brew list --versions "${package_kind[@]}"); then
      echo 'Could not read Homebrew inventory. Ask your device administrator or IT or use the official download page; no installation attempted.'; return
    fi
    installed=$(printf '%s\n' "$inventory" | awk -v name="$package" '$1==name {print}')
    if [ -n "$installed" ]; then
      outdated_options=(--quiet "${package_kind[@]}")
      if [ "${package_kind[0]}" = --cask ]; then outdated_options+=(--greedy-auto-updates); fi
      # Named outdated returns exit 1 when updates exist. Query the kind without
      # names, include auto-updating casks, then select this exact fixed package.
      if ! outdated_inventory=$(HOMEBREW_NO_AUTO_UPDATE=1 probe brew outdated "${outdated_options[@]}"); then
        echo 'Could not verify package update status. Ask your device administrator or IT; no installation was attempted.'; return
      fi
      outdated=$(printf '%s\n' "$outdated_inventory" | awk -v name="$package" '$0==name {print}')
      if [ -z "$outdated" ]; then
        echo "Homebrew already has $package current. Review PATH/JAVA_HOME or the selected installation with your device administrator or IT; restart and check again. No reinstall attempted."; return
      fi
      operation=upgrade
    fi
    printf 'Proposed command: brew %s' "$operation"; printf ' %s' "${package_kind[@]}" "$package"; printf '\n'
    if yes "Use your existing Homebrew to $operation $title? It may request administrator approval."; then
      brew "$operation" "${package_kind[@]}" "$package"
      install_status=$?
      echo "Homebrew finished with exit code $install_status."
      summary || :
    elif yes "Open the official $title download page?"; then open_url "$url"; fi
  elif yes "Open the official $title download page?"; then open_url "$url"; fi
  echo 'After installing, close VS Code completely, reopen setup, and check again. A restart may be needed.'
}
# Native protocol stays separate from human diagnostics. Fixed keys contain only
# booleans/tokens; paths and tool output are never parsed as commands or state.
native_check() {
  summary || :
  zero_ok=0; redhat_ok=0; home_blocked=0; readiness=0; code_ok=0
  at_least "$(extension_version "$EXTENSION_ID")" "$KIT_VERSION" && zero_ok=1
  [ -n "$(extension_version redhat.java)" ] && redhat_ok=1
  [ -n "${JAVA_HOME:-}" ] && [ "$JAVA_OK" = 0 ] && home_blocked=1
  [ -n "$CODE" ] && code_ok=1
  ready && readiness=1
  printf '\nZERO_SETUP_V1\nkit=%s\ncode=%s\njava=%s\nprofile=%s\nzero=%s\nredhat=%s\njavaHomeBlocked=%s\nready=%s\nEND_ZERO_SETUP\n' "$KIT_OK" "$code_ok" "$JAVA_OK" "$PROFILE_OK" "$zero_ok" "$redhat_ok" "$home_blocked" "$readiness"
  # A completed check is successful even when work remains. Readiness is a field.
}
native_plan() {
  PLAN=manual
  detect_kit
  [ "$KIT_OK" = 1 ] || { PLAN=blocked; return 0; }
  case "$1" in
    code) detect_code; [ -z "$CODE" ] || PLAN=skip ;;
    java) detect_java
      if [ "$JAVA_OK" = 1 ]; then PLAN=skip
      elif [ -n "${JAVA_HOME:-}" ]; then PLAN=blocked; fi ;;
    *) return 2 ;;
  esac
  # Native setup cannot guarantee Homebrew's dependency/privilege behavior.
  # All missing system tools use the deliberate official browser/OS handoff.
  # Manual is a successful plan, including no-manager/permission/query failures.
  return 0
}
if [ -n "$NATIVE_MODE" ]; then
  case "$NATIVE_MODE" in
    --native-check) [ "$#" = 1 ] || exit 2; native_check ;;
    --native-plan)
      [ "$#" = 2 ] || exit 2
      native_plan "$2" || exit 2
      printf '\nZERO_PLAN_V1\naction=%s\nEND_ZERO_PLAN\n' "$PLAN" ;;
    --native-install)
      echo 'Native background system-tool installation is unavailable. Use the official download page.'
      exit 2 ;;
    --native-extension)
      [ "$#" = 3 ] && [ "$3" = --approved ] || exit 2
      case "$2" in zero|java) ;; *) exit 2 ;; esac
      detect_kit; detect_code; detect_extensions
      [ "$KIT_OK" = 1 ] && [ -n "$CODE" ] && [ "$PROFILE_OK" = 1 ] || { echo 'Complete the kit and import the Zero profile first.'; exit 1; }
      if [ "$2" = zero ]; then
        at_least "$(extension_version "$EXTENSION_ID")" "$KIT_VERSION" && exit 0
        target="$VSIX"
      else
        [ -n "$(extension_version redhat.java)" ] && exit 0
        target=redhat.java
      fi
      "$CODE" --profile Zero --install-extension "$target" </dev/null ;;
    --native-profile)
      [ "$#" = 1 ] || exit 2
      detect_kit; detect_code; detect_extensions
      [ "$KIT_OK" = 1 ] && [ -n "$CODE" ] || exit 1
      [ "$PROFILE_OK" = 0 ] || { echo 'Existing Zero profile preserved.'; exit 0; }
      # Official CLI cannot import/create a profile without opening the editor.
      # The user imports the supplied settings-only file in the supported UI.
      "$CODE" --new-window ;;
    --native-open)
      [ "$#" = 1 ] || exit 2
      summary || :
      ready || { echo 'Readiness changed; check again before opening Zero.'; exit 1; }
      "$CODE" --new-window --profile Zero ;;
  esac
  exit $?
fi
summary || :
if [ "$CHECK_ONLY" = 1 ]; then ready; exit $?; fi
if [ ! -t 0 ]; then echo 'Interactive setup needs a terminal. Use --check for a read-only summary.'; exit 2; fi
printf '\nWelcome! Nothing is installed until you choose an action.\n'
echo 'Use the check summary above. You do not need Node.js, Python or global Maven.'
echo 'If JAVA_HOME points to an old/missing JDK, ask your device administrator or IT to correct it before proceeding.'
echo 'The optional quiet profile must be imported BEFORE extension installation:'
echo "In VS Code: Profiles > Import Profile > Select File: $KIT_DIR/optional/Zero.code-profile"
echo 'Choose the name Zero. Or use action 4 for an empty Zero profile without those optional settings.'
while :; do
  printf '\n1 VS Code install help   2 JDK install help   3 Git install help\n4 Open/create Zero profile   5 Install missing extensions in Zero\n6 Check again   7 Open Zero   0 Exit\nChoice: '
  read -r choice || break
  case "$choice" in
    1) help_tool code ;;
    2) help_tool java ;;
    3) help_tool git ;;
    4) if [ -n "$CODE" ] && yes 'Open VS Code using Zero? This creates an empty Zero profile if it is missing. Import the optional profile first if you want it.'; then "$CODE" --new-window --profile Zero; echo "VS Code exit code: $?"; fi ;;
    5)
      summary || :
      if [ "$KIT_OK" = 0 ] || [ "$PROFILE_OK" = 0 ]; then echo 'Complete the kit and open/import the Zero profile first.'; continue; fi
      for extension in "$EXTENSION_ID" redhat.java vscjava.vscode-java-debug; do
        current=$(extension_version "$extension")
        if [ "$extension" = "$EXTENSION_ID" ]; then
          at_least "$current" "$KIT_VERSION" && continue
          target="$VSIX"
        else [ -n "$current" ] && continue; target="$extension"; fi
        if yes "Install $extension into the Zero profile?"; then
          "$CODE" --profile Zero --install-extension "$target"
          echo "Extension installer exit code: $?"
        fi
      done
      summary || : ;;
    6) summary || : ;;
    7)
      summary || :
      if ready && yes 'Open Zero to start a tutorial? Close all VS Code windows first if you just changed Java.'; then
        "$CODE" --new-window --profile Zero
        echo "VS Code exit code: $?"
        echo 'Choose Start tutorial in Zero to create your project.'
      else echo 'Finish the required setup checks before opening Zero.'; fi ;;
    0) break ;;
    *) echo 'Choose a number from the menu.' ;;
  esac
done
ready; exit $?
