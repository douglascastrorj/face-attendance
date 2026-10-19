#!/usr/bin/env bash
# Verifica ferramentas e versões exigidas. Não instala nada.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"
errors=0

info "Verificando ferramentas"
[ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] && ok "macOS Apple Silicon (arm64)" || warn "Plataforma $(uname -s)/$(uname -m): validado apenas em macOS arm64"

want_node="$(tr -d '[:space:]' < .nvmrc)"
if command -v node >/dev/null; then
  have_node="$(node -v | sed 's/^v//')"
  if [ "$have_node" = "$want_node" ]; then ok "Node.js $have_node (.nvmrc)"; else echo "  ${RED}✖${RST} Node.js $have_node ativo; esperado $want_node. Rode: nvm install && nvm use"; errors=$((errors+1)); fi
else echo "  ${RED}✖${RST} Node.js não encontrado. Instale o nvm e rode: nvm install"; errors=$((errors+1)); fi

if command -v npm >/dev/null; then
  have_npm="$(npm -v)"
  major="${have_npm%%.*}"; rest="${have_npm#*.}"; minor="${rest%%.*}"
  if [ "$major" -eq 11 ] && [ "$minor" -ge 16 ]; then ok "npm $have_npm"; else echo "  ${RED}✖${RST} npm $have_npm; esperado >=11.16 <12 (vem com Node $want_node)"; errors=$((errors+1)); fi
fi

if py="$(find_python)"; then ok "Python $("$py" -c 'import platform;print(platform.python_version())') ($py)"; else
  echo "  ${RED}✖${RST} Python 3.12 ou 3.13 não encontrado. Instale: brew install python@3.12"; errors=$((errors+1)); fi

if command -v poetry >/dev/null; then
  have_poetry="$(poetry --version | sed -E 's/.*version ([0-9.]+).*/\1/')"
  case "$have_poetry" in
    "$POETRY_VERSION_REQUIRED".*) ok "Poetry $have_poetry" ;;
    *) echo "  ${RED}✖${RST} Poetry $have_poetry; esperado $POETRY_VERSION_REQUIRED.x. Rode: pipx install 'poetry==2.3.2' (ou: poetry self update 2.3.2)"; errors=$((errors+1)) ;;
  esac
else echo "  ${RED}✖${RST} Poetry não encontrado. Instale: pipx install 'poetry==2.3.2'"; errors=$((errors+1)); fi

if xcode-select -p >/dev/null 2>&1; then ok "Xcode Command Line Tools"; else warn "Xcode CLT ausente (necessário se o better-sqlite3 precisar compilar). Rode: xcode-select --install"; fi

if [ "$errors" -gt 0 ]; then die "$errors problema(s) encontrado(s)."; fi
ok "Ferramentas OK"
