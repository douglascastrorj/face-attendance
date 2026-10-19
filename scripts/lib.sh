# Funções compartilhadas pelos scripts shell. Não executar diretamente.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
POETRY_VERSION_REQUIRED="2.3"        # série fixada (lock gerado com Poetry 2.3.2)
PYTHON_VERSIONS=("3.12" "3.13")      # compatíveis com pyproject.toml (>=3.12,<3.14)

if [ -t 1 ]; then RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; BLD=$'\e[1m'; RST=$'\e[0m'; else RED=; GRN=; YLW=; BLD=; RST=; fi
info() { echo "${BLD}==>${RST} $*"; }
ok()   { echo "  ${GRN}✔${RST} $*"; }
warn() { echo "  ${YLW}!${RST} $*" >&2; }
die()  { echo "  ${RED}✖ $*${RST}" >&2; exit 1; }

# Localiza um Python compatível sem depender do "python3" global (que no macOS é 3.9).
find_python() {
  local v c
  for v in "${PYTHON_VERSIONS[@]}"; do
    for c in "python$v" "/opt/homebrew/bin/python$v" "/usr/local/bin/python$v" "$HOME/.pyenv/shims/python$v"; do
      if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return 0; fi
    done
  done
  return 1
}

load_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    return 0
  fi
  if [ -s /opt/homebrew/opt/nvm/nvm.sh ]; then
    # shellcheck disable=SC1091
    . /opt/homebrew/opt/nvm/nvm.sh --no-use
    return 0
  fi
  return 1
}
