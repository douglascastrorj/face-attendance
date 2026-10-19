#!/usr/bin/env bash
# Comandos do serviço Python (sempre via Poetry, no ambiente virtual isolado recognition/.venv).
# Uso: scripts/recognition.sh install | dev | test | test-unit | shell-info
source "$(dirname "$0")/lib.sh"
cd "$ROOT/recognition"

command -v poetry >/dev/null || die "Poetry não encontrado. Instale: pipx install 'poetry==2.3.2'"

ensure_env() {
  if ! poetry env info --path >/dev/null 2>&1; then
    py="$(find_python)" || die "Python 3.12/3.13 não encontrado (brew install python@3.12)"
    poetry env use "$py" >/dev/null
  fi
}

case "${1:-}" in
  install)
    py="$(find_python)" || die "Python 3.12/3.13 não encontrado (brew install python@3.12)"
    info "Ambiente Python (Poetry) em recognition/.venv com $py"
    poetry check --lock >/dev/null || die "poetry.lock desatualizado em relação ao pyproject.toml"
    poetry env use "$py" >/dev/null
    poetry install --no-interaction
    poetry run python -c "import cv2, numpy, fastapi; print(f'  OpenCV {cv2.__version__} · NumPy {numpy.__version__} · FastAPI {fastapi.__version__}')"
    ;;
  dev)
    ensure_env
    exec poetry run python -m app.main
    ;;
  test)
    ensure_env
    exec poetry run pytest -q "${@:2}"
    ;;
  test-unit)
    ensure_env
    exec poetry run pytest -q -m "not models" "${@:2}"
    ;;
  evaluate)
    ensure_env
    exec poetry run python -m app.evaluate "${@:2}"
    ;;
  shell-info)
    ensure_env
    echo "Ambiente virtual: $(poetry env info --path)"
    echo "Ativar manualmente: source \"$(poetry env info --path)/bin/activate\"  (ou: eval \$(poetry env activate))"
    ;;
  *)
    die "Uso: $0 install | dev | test | test-unit | evaluate | shell-info"
    ;;
esac
