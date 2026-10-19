#!/usr/bin/env node
// Orquestra os três serviços. Ctrl+C (ou falha de qualquer um) encerra TODOS — sem processos órfãos.
//   npm run dev     → modo desenvolvimento (hot reload)
//   npm start       → usa os builds (npm run build antes)
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.argv.includes('--prod');

function preflight() {
  const problems = [];
  const want = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  if (process.version !== `v${want}`) problems.push(`Node ${process.version} ativo; esperado v${want} (rode: nvm use)`);
  if (!existsSync(path.join(root, '.env'))) problems.push('.env ausente (rode: npm run setup)');
  if (!existsSync(path.join(root, 'node_modules'))) problems.push('dependências npm ausentes (rode: npm run setup)');
  if (!existsSync(path.join(root, 'recognition', '.venv'))) problems.push('ambiente Python ausente (rode: npm run recognition:install)');
  const manifest = JSON.parse(readFileSync(path.join(root, 'recognition/models/manifest.json'), 'utf8'));
  for (const m of manifest.models) {
    if (!existsSync(path.join(root, 'recognition/models', m.file))) problems.push(`modelo ${m.file} ausente (rode: npm run models:download)`);
  }
  if (prod && !existsSync(path.join(root, 'backend/dist/server.js'))) problems.push('build ausente (rode: npm run build)');
  if (problems.length) {
    console.error('Não foi possível iniciar:\n' + problems.map((p) => `  ✖ ${p}`).join('\n'));
    process.exit(1);
  }
}
preflight();

const colors = { recognition: 35, backend: 36, frontend: 33 };
const services = [
  { name: 'recognition', cmd: 'bash', args: ['scripts/recognition.sh', 'dev'] },
  prod
    ? { name: 'backend', cmd: 'npm', args: ['run', 'start', '-w', 'backend'] }
    : { name: 'backend', cmd: 'npm', args: ['run', 'dev', '-w', 'backend'] },
  prod
    ? { name: 'frontend', cmd: 'npm', args: ['run', 'preview', '-w', 'frontend'] }
    : { name: 'frontend', cmd: 'npm', args: ['run', 'dev', '-w', 'frontend'] },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;

function prefix(name, stream, chunk) {
  const tag = `\x1b[${colors[name]}m[${name.padEnd(11)}]\x1b[0m `;
  for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) stream.write(tag + line + '\n');
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  console.log('\nEncerrando serviços…');
  for (const c of children) {
    // detached=true → cada serviço é líder do próprio grupo; sinalizar -pid alcança netos (uvicorn, tsx, vite).
    try { process.kill(-c.pid, 'SIGTERM'); } catch { /* já saiu */ }
  }
  setTimeout(() => {
    for (const c of children) {
      try { process.kill(-c.pid, 'SIGKILL'); } catch { /* já saiu */ }
    }
    process.exit(exitCode);
  }, 5000).unref();
}

for (const s of services) {
  const child = spawn(s.cmd, s.args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1', PYTHONUNBUFFERED: '1' },
  });
  children.push(child);
  child.stdout.on('data', (d) => prefix(s.name, process.stdout, d));
  child.stderr.on('data', (d) => prefix(s.name, process.stderr, d));
  child.on('exit', (code, signal) => {
    child.exited = true;
    if (!shuttingDown) {
      console.error(`\n✖ ${s.name} terminou (código ${code ?? signal}). Encerrando os demais.`);
      shutdown(code || 1);
    }
    if (children.every((c) => c.exited)) process.exit(exitCode);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

const port = process.env.FRONTEND_PORT || 5173;
console.log(`Iniciando… frontend: http://localhost:${port} · API: http://127.0.0.1:3001/api/docs · Ctrl+C para encerrar`);
