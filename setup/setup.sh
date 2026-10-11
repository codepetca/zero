#!/bin/bash
# Readable, dependency-free student setup; macOS Bash 3 and Linux Bash.
set -u
SETUP_DIR=$(cd "$(dirname "$0")" && pwd) || exit 1
KIT_DIR=$(cd "$SETUP_DIR/.." && pwd) || exit 1
STARTER="$KIT_DIR/starter"
CHECK_ONLY=0
case "${1:-}" in
  --check) CHECK_ONLY=1 ;;
  '') ;;
  *) printf 'Usage: %s [--check]\n' "$0"; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then echo 'Use only --check, or no arguments.'; exit 2; fi
OS=$(uname -s)
CODE=''
KIT_VERSION=''
EXTENSION_ID=''
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
  CODE=$(command -v code 2>/dev/null || :)
  if [ -z "$CODE" ] && [ "$OS" = Darwin ]; then
    for candidate in "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"; do
      if [ -x "$candidate" ]; then CODE=$candidate; break; fi
    done
  fi
  if [ -n "$CODE" ] && ! probe "$CODE" --version >/dev/null; then CODE=''; fi
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
  GIT_OK=0
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
  KIT_VERSION=''; EXTENSION_ID=''
  if [ -f "$SETUP_DIR/kit.properties" ]; then
    KIT_VERSION=$(sed -n 's/^kitVersion=//p' "$SETUP_DIR/kit.properties")
    EXTENSION_ID=$(sed -n 's/^extensionId=//p' "$SETUP_DIR/kit.properties")
  fi
  if ! printf '%s\n' "$KIT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || [ "$EXTENSION_ID" != zero.zero ]; then
    echo 'Kit metadata missing or invalid: extract the complete Zero kit again.'; return
  fi
  VSIX="$KIT_DIR/zero-$KIT_VERSION.vsix"
  for member in "$VSIX" "$KIT_DIR/optional/Zero.code-profile" "$STARTER/zero.json" "$STARTER/pom.xml" "$STARTER/mvnw" "$STARTER/mvnw.cmd" "$STARTER/.mvn/wrapper/maven-wrapper.properties" "$STARTER/.vscode/tasks.json"; do
    if [ ! -f "$member" ]; then printf 'Missing kit file: %s\nExtract the complete kit again.\n' "$member"; return; fi
  done
  if [ ! -x "$STARTER/mvnw" ]; then echo 'Starter mvnw is not executable. Extract with an archive tool that preserves permissions; ask your teacher for help.'; return; fi
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
  detect_code; detect_java; detect_git; detect_kit; detect_extensions
  printf '\nZero setup check (profile: Zero)\n'
  if [ "$KIT_OK" = 1 ]; then echo "Kit $KIT_VERSION: complete"; else echo 'Kit: needs attention'; fi
  if [ -n "$CODE" ]; then echo "VS Code: $CODE"; else echo 'VS Code: missing or its command failed'; fi
  if [ "$JAVA_OK" = 1 ]; then echo "JDK: Java $JAVA_VERSION and javac $JAVAC_VERSION"; else echo "JDK: needs matching java + javac major versions 17+ (java: ${JAVA_VERSION:-missing}, javac: ${JAVAC_VERSION:-missing})"; fi
  if [ -n "${JAVA_HOME:-}" ]; then echo "Selected JAVA_HOME: $JAVA_HOME"; fi
  if [ "$PROFILE_OK" = 0 ]; then echo 'Zero profile: unavailable; create/import it before installing extensions';
  elif [ "$EXTENSIONS_OK" = 1 ]; then echo 'Zero profile extensions: ready'; else echo 'Zero profile extensions: Zero/Java support missing or Zero too old'; fi
  if [ "$PROFILE_OK" = 1 ] && [ -z "$(extension_version vscjava.vscode-java-debug)" ]; then echo 'Java debugger: missing (optional; Run App still works)'; fi
  if [ "$GIT_OK" = 1 ]; then echo 'Git: ready for optional sharing'; else echo 'Git 2.31+: missing/old (optional; local apps can run without it)'; fi
  ready
}
ready() { [ "$KIT_OK" = 1 ] && [ -n "$CODE" ] && [ "$JAVA_OK" = 1 ] && [ "$EXTENSIONS_OK" = 1 ]; }
open_url() {
  if [ "$OS" = Darwin ]; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"; else echo "Open in your browser: $1"; fi
}
help_tool() {
  case "$1" in
    code) detect_code; if [ -n "$CODE" ]; then echo 'VS Code is already available. Use Check again.'; return; fi ;;
    java) detect_java; if [ "$JAVA_OK" = 1 ]; then echo 'A suitable JDK is already available. Use Check again.'; return; fi ;;
    git) detect_git; if [ "$GIT_OK" = 1 ]; then echo 'A suitable Git is already available. Use Check again.'; return; fi ;;
  esac
  case "$1" in
    code) title='VS Code'; url='https://code.visualstudio.com/download'; brew_args=(install --cask visual-studio-code) ;;
    java) title='Temurin JDK 17'; url='https://adoptium.net/temurin/releases/?version=17'; brew_args=(install --cask temurin@17) ;;
    git) title='Git (optional sharing)'; url='https://git-scm.com/downloads'; brew_args=(install git) ;;
  esac
  printf '\n%s: school laptops may require your teacher or IT to install software.\n' "$title"
  echo 'If blocked, stop here and show the check summary to them. Do not bypass school restrictions.'
  if [ "$OS" = Darwin ] && command -v brew >/dev/null 2>&1 && yes "Use your existing Homebrew to install $title? It may request administrator approval."; then
    brew "${brew_args[@]}"
    install_status=$?
    echo "Homebrew finished with exit code $install_status."
  elif yes "Open the official $title download page?"; then open_url "$url"; fi
  echo 'After installing, close VS Code completely, reopen setup, and check again. A restart may be needed.'
}
summary || :
if [ "$CHECK_ONLY" = 1 ]; then ready; exit $?; fi
if [ ! -t 0 ]; then echo 'Interactive setup needs a terminal. Use --check for a read-only summary.'; exit 2; fi
printf '\nWelcome! Nothing is installed until you choose an action.\n'
echo 'Use the check summary above. You do not need Node.js, Python or global Maven.'
echo 'If JAVA_HOME points to an old/missing JDK, ask your teacher/IT to correct it before proceeding.'
echo 'The optional quiet profile must be imported BEFORE extension installation:'
echo "In VS Code: Profiles > Import Profile > Select File: $KIT_DIR/optional/Zero.code-profile"
echo 'Choose the name Zero. Or use action 4 for an empty Zero profile without those optional settings.'
while :; do
  printf '\n1 VS Code install help   2 JDK install help   3 Git install help\n4 Open/create Zero profile   5 Install missing extensions in Zero\n6 Check again   7 Open starter   0 Exit\nChoice: '
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
      if ready && yes 'Open your starter in the Zero profile? Close all VS Code windows first if you just changed Java.'; then
        "$CODE" --new-window --profile Zero "$STARTER"
        echo "VS Code exit code: $?"
        echo 'In the Zero sidebar, choose Run App. First run downloads Maven/JavaFX and needs internet.'
      else echo 'Finish the required setup checks before opening the starter.'; fi ;;
    0) break ;;
    *) echo 'Choose a number from the menu.' ;;
  esac
done
ready; exit $?
