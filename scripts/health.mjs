#!/usr/bin/env node
// Verifica a saúde dos serviços em execução. Uso: npm run health
const backend = `http://${process.env.BACKEND_HOST || '127.0.0.1'}:${process.env.BACKEND_PORT || 3001}`;
const recognition = process.env.RECOGNITION_URL || 'http://127.0.0.1:8001';
const frontend = `http://localhost:${process.env.FRONTEND_PORT || 5173}`;

const checks = [
  ['Serviço Python  ', `${recognition}/health`],
  ['Backend         ', `${backend}/api/health`],
  ['Backend → Python', `${backend}/api/health/recognition`],
  ['Frontend        ', frontend],
];
let failed = false;
for (const [label, url] of checks) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get('content-type') ?? '';
    const body = type.includes('json') ? await res.json() : null;
    const extra = body ? ` ${JSON.stringify(body).slice(0, 160)}` : '';
    console.log(`${res.ok ? '✔' : '✖'} ${label} ${res.status} ${url}${extra}`);
    if (!res.ok) failed = true;
  } catch (err) {
    failed = true;
    console.log(`✖ ${label} inacessível ${url} (${err.cause?.code ?? err.name})`);
  }
}
process.exit(failed ? 1 : 0);
