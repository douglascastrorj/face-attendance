#!/usr/bin/env node
// Baixa e verifica (SHA-256) os modelos ONNX listados em recognition/models/manifest.json.
// Idempotente: arquivos já presentes e íntegros não são baixados de novo.
// Uso: npm run models:download   |   npm run models:verify (só verifica, não baixa)
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = path.join(root, 'recognition', 'models');
const manifest = JSON.parse(readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8'));
const verifyOnly = process.argv.includes('--verify-only');
// Apenas fontes oficiais conhecidas são aceitas.
const ALLOWED_HOSTS = new Set(['media.githubusercontent.com', 'github.com', 'raw.githubusercontent.com']);

const sha256 = (file) =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

async function download(url, dest) {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`Host não permitido para download: ${host}`);
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  const finalHost = new URL(res.url).hostname;
  if (!ALLOWED_HOSTS.has(finalHost) && !finalHost.endsWith('.githubusercontent.com')) {
    throw new Error(`Redirecionado para host inesperado: ${finalHost}`);
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

let failed = false;
mkdirSync(modelsDir, { recursive: true });
console.log(`Modelos de ${manifest.source_repository} @ ${manifest.source_commit.slice(0, 12)}`);
for (const m of manifest.models) {
  const file = path.join(modelsDir, m.file);
  const label = `${m.name}/${m.version} (${m.file}, ${m.license})`;
  try {
    if (existsSync(file)) {
      if ((await sha256(file)) === m.sha256) {
        console.log(`✔ ${label} — já presente e íntegro`);
        continue;
      }
      if (verifyOnly) throw new Error('checksum inválido');
      console.warn(`! ${label} — checksum divergente, baixando novamente`);
    } else if (verifyOnly) {
      throw new Error('arquivo ausente');
    }
    const tmp = `${file}.part`;
    console.log(`↓ ${label} — baixando ${(m.size / 1024 / 1024).toFixed(1)} MB…`);
    await download(m.url, tmp);
    const size = statSync(tmp).size;
    const digest = await sha256(tmp);
    if (size !== m.size || digest !== m.sha256) {
      rmSync(tmp, { force: true });
      throw new Error(`verificação falhou (tamanho ${size}, sha256 ${digest})`);
    }
    renameSync(tmp, file);
    console.log(`✔ ${label} — baixado e verificado`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${label} — ${err.message}`);
  }
}
if (failed) {
  console.error(verifyOnly ? 'Modelos ausentes ou inválidos. Execute `npm run models:download`.' : 'Falha ao obter os modelos.');
  process.exit(1);
}
