/**
 * Regenera el bloque DASHBOARD del README del perfil (NidoIDi/NidoIDi) y los
 * gráficos SVG de actividad (assets/actividad-semanal.svg y
 * assets/actividad-repos.svg):
 *  - Tabla de todos los repos SIEMPRE ordenada por última actividad (el más
 *    reciente arriba), con semáforo, último push y estado del deploy.
 *  - Gráfico de barras: commits por semana de las últimas 12 semanas.
 *  - Gráfico horizontal: commits por proyecto en los últimos 30 días.
 *
 * Se ejecuta cada 6 horas desde GitHub Actions (dashboard.yml). Necesita un
 * token con LECTURA de los repos privados en DASHBOARD_TOKEN (el GITHUB_TOKEN
 * de Actions solo ve este repo público; sin secreto no se toca nada para no
 * vaciar la tabla).
 *
 * Prueba en local:  GITHUB_TOKEN=$(gh auth token) node scripts/actualizar-dashboard.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const TOKEN = process.env.DASHBOARD_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.log('Falta el secreto DASHBOARD_TOKEN — no toco nada. ' +
    'Créalo en Settings → Secrets and variables → Actions del repo NidoIDi/NidoIDi.');
  process.exit(0);
}

const CUENTA = 'NidoIDi';
const ZONA = 'Europe/Madrid';
const SEMANAS = 12;

// Paleta de marca (la del ecosistema Nido: naranja + azul marino tinta).
const C = {
  fondo: '#1b2536',
  borde: 'rgba(255,255,255,0.13)',
  texto: '#f5f7fa',
  textoSuave: '#9fb0c3',
  naranja: '#ee8b60',
  naranjaClaro: '#f5b193',
  rejilla: 'rgba(255,255,255,0.07)',
};

// Ficha de cada app: emoji, web pública y (si la hay) insignia de Netlify.
const FICHAS = {
  'mis_partes':      { emoji: '🔧', web: 'https://mis-partes.netlify.app',  netlify: 'c8637da5-5ec3-47d4-bde3-ffc0f4ebc743' },
  'Mis_Actas':       { emoji: '📝', web: 'https://misactas.netlify.app',    netlify: '895d053f-02e8-4082-a6bb-1c9fdb033317' },
  'CoeYDuca':        { emoji: '🎓', web: 'https://coeduca.netlify.app',     netlify: '1b728c08-95e2-477a-b7f8-32a5d7efea25' },
  'Manten.App':      { emoji: '🛠️', web: 'https://panel.manten.app' },
  'el-altavoz':      { emoji: '📣', web: 'https://elaltavoz.app' },
  'focus360':        { emoji: '🎯', web: 'https://focus360o.app' },
  'labora_e':        { emoji: '💼', web: 'https://labora-e.com' },
  'QrActivos':       { emoji: '🔳', web: 'https://qractivos.netlify.app' },
  'nidodeideas-web': { emoji: '🪺', web: 'https://nidodeideas.es' },
  'mantenapp-mapa':  { emoji: '🗺️' },
  'MVPPaisVasco':    { emoji: '🧪' },
  'siloe':           { emoji: '🌾' },
  'mis-espacios':    { emoji: '🏢' },
  'andisa-web':      { emoji: '🌐' },
};

async function api(ruta) {
  const r = await fetch(`https://api.github.com${ruta}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`GitHub API ${r.status} en ${ruta}`);
  return r.json();
}

const diasDesde = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;
const semaforo = (d) => (d <= 2 ? '🟢' : d <= 7 ? '🟡' : d <= 30 ? '🟠' : '⚪');

function relativo(d) {
  if (d < 1) return 'hoy';
  if (d < 2) return 'ayer';
  if (d < 14) return `hace ${Math.floor(d)} días`;
  if (d < 60) return `hace ${Math.floor(d / 7)} semanas`;
  if (d < 365 * 2) return `hace ${Math.floor(d / 30)} meses`;
  return `hace ${Math.floor(d / 365)} años`;
}

const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric' });

// ── Repos, SIEMPRE del más reciente al más antiguo ──────────────────────────
const repos = (await api(`/user/repos?per_page=100&affiliation=owner`))
  .filter((r) => r.name !== CUENTA)
  .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

if (repos.length < 5) {
  console.log(`Solo veo ${repos.length} repos — el token no llega a los privados. No toco nada.`);
  process.exit(0);
}

// ── Commits de las últimas 12 semanas (para los dos gráficos) ───────────────
// Semana empezando en lunes, en hora de Madrid aproximada por UTC.
const ahora = new Date();
const inicioSemanaActual = new Date(ahora);
inicioSemanaActual.setUTCHours(0, 0, 0, 0);
inicioSemanaActual.setUTCDate(inicioSemanaActual.getUTCDate() - ((inicioSemanaActual.getUTCDay() + 6) % 7));
const inicioVentana = new Date(inicioSemanaActual);
inicioVentana.setUTCDate(inicioVentana.getUTCDate() - 7 * (SEMANAS - 1));

const porSemana = new Array(SEMANAS).fill(0);
const porRepo30 = new Map();
const hace30 = Date.now() - 30 * 86400000;

for (const r of repos) {
  for (let pagina = 1; pagina <= 5; pagina++) {
    let commits;
    try {
      commits = await api(`/repos/${CUENTA}/${r.name}/commits?since=${inicioVentana.toISOString()}&per_page=100&page=${pagina}`);
    } catch {
      break; // repo vacío → la API devuelve 409
    }
    for (const c of commits) {
      const f = new Date(c.commit.committer?.date ?? c.commit.author.date);
      const idx = Math.floor((f - inicioVentana) / (7 * 86400000));
      if (idx >= 0 && idx < SEMANAS) porSemana[idx]++;
      if (f.getTime() >= hace30) porRepo30.set(r.name, (porRepo30.get(r.name) ?? 0) + 1);
    }
    if (commits.length < 100) break;
  }
}

// ── SVG 1: barras de commits por semana ─────────────────────────────────────
function svgSemanal() {
  const W = 760, H = 240, mx = 42, mtop = 56, mbot = 34;
  const anchoUtil = W - mx * 2, altoUtil = H - mtop - mbot;
  const max = Math.max(...porSemana, 1);
  const paso = anchoUtil / SEMANAS;
  const barW = Math.min(34, paso - 10);
  const total = porSemana.reduce((a, b) => a + b, 0);

  let barras = '';
  for (let i = 0; i < SEMANAS; i++) {
    const v = porSemana[i];
    const h = Math.max((v / max) * altoUtil, v > 0 ? 4 : 2);
    const x = mx + i * paso + (paso - barW) / 2;
    const y = mtop + altoUtil - h;
    const ini = new Date(inicioVentana.getTime() + i * 7 * 86400000);
    const etiqueta = ini.toLocaleDateString('es-ES', { timeZone: 'UTC', day: '2-digit', month: 'short' });
    barras += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="4" fill="${v > 0 ? 'url(#gNido)' : C.rejilla}"/>`;
    if (v > 0) barras += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="${C.naranjaClaro}">${v}</text>`;
    barras += `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="${C.textoSuave}">${etiqueta}</text>`;
  }

  let rejilla = '';
  for (let g = 1; g <= 3; g++) {
    const y = mtop + altoUtil - (altoUtil * g) / 4;
    rejilla += `<line x1="${mx}" y1="${y.toFixed(1)}" x2="${W - mx}" y2="${y.toFixed(1)}" stroke="${C.rejilla}" stroke-width="1"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commits por semana">
<defs><linearGradient id="gNido" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.naranjaClaro}"/><stop offset="1" stop-color="${C.naranja}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="12" fill="${C.fondo}" stroke="${C.borde}"/>
<text x="${mx}" y="30" font-size="16" font-weight="800" fill="${C.texto}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">Actividad — commits por semana</text>
<text x="${W - mx}" y="30" text-anchor="end" font-size="13" font-weight="700" fill="${C.naranja}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${total} commits · ${SEMANAS} semanas</text>
<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${rejilla}${barras}</g>
</svg>`;
}

// ── SVG 2: barras horizontales de commits por proyecto (30 días) ────────────
function svgRepos() {
  const top = [...porRepo30.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const W = 760, filaH = 34, mtop = 52, mbot = 18, mx = 42;
  const H = mtop + Math.max(top.length, 1) * filaH + mbot;
  const etiquetaW = 190;
  const max = Math.max(...top.map(([, v]) => v), 1);
  const barMax = W - mx * 2 - etiquetaW - 52;
  const total30 = [...porRepo30.values()].reduce((a, b) => a + b, 0);

  let filas = '';
  top.forEach(([nombre, v], i) => {
    const y = mtop + i * filaH;
    const w = Math.max((v / max) * barMax, 4);
    filas += `<text x="${mx + etiquetaW - 12}" y="${y + 21}" text-anchor="end" font-size="13" font-weight="600" fill="${C.texto}">${nombre}</text>`;
    filas += `<rect x="${mx + etiquetaW}" y="${y + 8}" width="${barMax}" height="18" rx="5" fill="${C.rejilla}"/>`;
    filas += `<rect x="${mx + etiquetaW}" y="${y + 8}" width="${w.toFixed(1)}" height="18" rx="5" fill="url(#gNido2)"/>`;
    filas += `<text x="${(mx + etiquetaW + w + 10).toFixed(1)}" y="${y + 21}" font-size="12" font-weight="700" fill="${C.naranjaClaro}">${v}</text>`;
  });
  if (top.length === 0) {
    filas = `<text x="${W / 2}" y="${mtop + 20}" text-anchor="middle" font-size="13" fill="${C.textoSuave}">Sin commits en los últimos 30 días</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commits por proyecto">
<defs><linearGradient id="gNido2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.naranja}"/><stop offset="1" stop-color="${C.naranjaClaro}"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="12" fill="${C.fondo}" stroke="${C.borde}"/>
<text x="${mx}" y="30" font-size="16" font-weight="800" fill="${C.texto}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">¿Dónde se ha trabajado? — últimos 30 días</text>
<text x="${W - mx}" y="30" text-anchor="end" font-size="13" font-weight="700" fill="${C.naranja}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${total30} commits</text>
<g font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${filas}</g>
</svg>`;
}

mkdirSync('assets', { recursive: true });
writeFileSync('assets/actividad-semanal.svg', svgSemanal());
writeFileSync('assets/actividad-repos.svg', svgRepos());

// ── Tabla del cuadro de mando ───────────────────────────────────────────────
const filas = repos.map((r) => {
  const ficha = FICHAS[r.name] ?? { emoji: '📦' };
  const dias = diasDesde(r.pushed_at);
  const web = ficha.web ? `[abrir ↗](${ficha.web})` : '—';
  const deploy = ficha.netlify
    ? `[![Netlify](https://api.netlify.com/api/v1/badges/${ficha.netlify}/deploy-status)](https://app.netlify.com/projects)`
    : '—';
  return `| ${ficha.emoji} **[${r.name}](${r.html_url})** | ${r.description ?? '—'} | ${semaforo(dias)} ${relativo(dias)} | ${fechaCorta(r.pushed_at)} | ${web} | ${deploy} |`;
});

const sello = new Date().toLocaleString('es-ES', { timeZone: ZONA, dateStyle: 'full', timeStyle: 'short' });

const bloque = `<!-- DASHBOARD:START -->
| Proyecto | Descripción | Actividad | Último push | Web | Deploy |
|---|---|:---:|---|:---:|:---:|
${filas.join('\n')}

**Leyenda:** 🟢 activo (≤ 2 días) · 🟡 esta semana · 🟠 este mes · ⚪ en reposo

<sub>🔄 Actualizado automáticamente cada 6 horas · Última vez: **${sello}** (hora de Madrid)</sub>
<!-- DASHBOARD:END -->`;

const readme = readFileSync('README.md', 'utf8');
const nuevo = readme.replace(/<!-- DASHBOARD:START -->[\s\S]*<!-- DASHBOARD:END -->/, bloque);
writeFileSync('README.md', nuevo);
console.log(`Dashboard regenerado: ${filas.length} repos, ${porSemana.reduce((a, b) => a + b, 0)} commits en ${SEMANAS} semanas.`);
