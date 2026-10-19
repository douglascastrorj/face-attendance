#!/usr/bin/env bash
# Configuração idempotente do ambiente. Pode ser executado várias vezes:
# não apaga o banco, não sobrescreve o .env existente e não rebaixa modelos íntegros.
source "$(dirname "$0")/lib.sh"
cd "$ROOT"

info "1/7 Node.js via nvm (.nvmrc = $(cat .nvmrc))"
if load_nvm; then
  nvm install >/dev/null
  nvm use >/dev/null
  ok "nvm $(nvm --version) · node $(node -v)"
else
  warn "nvm não encontrado — usando o Node.js do PATH ($(node -v 2>/dev/null || echo ausente))"
fi

info "2/7 Verificando ferramentas"
bash scripts/check-tools.sh

info "3/7 Dependências npm (npm ci, a partir do package-lock.json)"
npm ci --no-audit --no-fund
node -e "require('better-sqlite3')" 2>/dev/null && ok "better-sqlite3 nativo carregado" || die "better-sqlite3 não carregou; rode: npm rebuild better-sqlite3 (requer Xcode CLT)"

info "4/7 Ambiente Python (Poetry)"
bash scripts/recognition.sh install

info "5/7 Modelos ONNX"
node scripts/download-models.mjs

info "6/7 Configuração local (.env)"
if [ -f .env ]; then
  ok ".env já existe — mantido sem alterações"
else
  pw="$(node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))")"
  sed "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$pw|" .env.example > .env
  chmod 600 .env
  ok ".env criado a partir de .env.example com ADMIN_PASSWORD aleatória"
  echo "     Senha administrativa: ${BLD}$pw${RST}  (guardada em .env)"
fi

info "7/7 Banco de dados (migrations)"
npm run --silent db:migrate

echo
ok "Setup concluído. Próximos passos:"
echo "     npm run dev     # inicia Python (8001), backend (3001) e frontend (http://localhost:5173)"
echo "     npm test        # executa todos os testes"
