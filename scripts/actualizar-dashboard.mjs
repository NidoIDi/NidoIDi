/**
 * Regenera el bloque DASHBOARD del README del perfil (NidoIDi/NidoIDi):
 * una tabla con todos los repos de la cuenta ordenados por última actividad,
 * con semáforo, fecha del último push y estado del deploy en Netlify.
 *
 * Se ejecuta a diario desde GitHub Actions (.github/workflows/dashboard.yml).
 * Necesita un token con acceso de LECTURA a los repos privados en la variable
 * DASHBOARD_TOKEN (el GITHUB_TOKEN de Actions solo ve este repo público, así
 * que sin secreto el script no toca nada para no vaciar la tabla).
 *
 * Prueba en local:  GITHUB_TOKEN=$(gh auth token) node scripts/actualizar-dashboard.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.DASHBOARD_TOKEN || process.env.GITHUB_TOKEN;
const CUENTA = 'NidoIDi';
const ZONA = 'Europe/Madrid';

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

function diasDesde(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function semaforo(dias) {
  if (dias <= 2) return '🟢';
  if (dias <= 7) return '🟡';
  if (dias <= 30) return '🟠';
  return '⚪';
}

function relativo(dias) {
  if (dias < 1) return 'hoy';
  if (dias < 2) return 'ayer';
  if (dias < 14) return `hace ${Math.floor(dias)} días`;
  if (dias < 60) return `hace ${Math.floor(dias / 7)} semanas`;
  if (dias < 365 * 2) return `hace ${Math.floor(dias / 30)} meses`;
  return `hace ${Math.floor(dias / 365)} años`;
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, day: '2-digit', month: 'short', year: 'numeric' });
}

const repos = (await api(`/user/repos?per_page=100&affiliation=owner&sort=pushed`))
  .filter((r) => r.name !== CUENTA);

// Sin el secreto, Actions solo ve este repo público: no tocar el README para
// no dejar la tabla vacía.
if (repos.length < 5) {
  console.log(`Solo veo ${repos.length} repos — falta DASHBOARD_TOKEN con acceso a los privados. No toco nada.`);
  process.exit(0);
}

const filas = repos.map((r) => {
  const ficha = FICHAS[r.name] ?? { emoji: '📦' };
  const dias = diasDesde(r.pushed_at);
  const nombre = `${ficha.emoji} **[${r.name}](${r.html_url})**`;
  const desc = r.description ?? '—';
  const actividad = `${semaforo(dias)} ${relativo(dias)}`;
  const fecha = fechaCorta(r.pushed_at);
  const web = ficha.web ? `[abrir ↗](${ficha.web})` : '—';
  const deploy = ficha.netlify
    ? `[![Netlify](https://api.netlify.com/api/v1/badges/${ficha.netlify}/deploy-status)](https://app.netlify.com/projects)`
    : '—';
  return `| ${nombre} | ${desc} | ${actividad} | ${fecha} | ${web} | ${deploy} |`;
});

const ahora = new Date().toLocaleString('es-ES', { timeZone: ZONA, dateStyle: 'full', timeStyle: 'short' });

const bloque = `<!-- DASHBOARD:START -->
| Proyecto | Descripción | Actividad | Último push | Web | Deploy |
|---|---|:---:|---|:---:|:---:|
${filas.join('\n')}

**Leyenda:** 🟢 activo (≤ 2 días) · 🟡 esta semana · 🟠 este mes · ⚪ en reposo

<sub>🔄 Actualizado automáticamente: **${ahora}** (hora de Madrid)</sub>
<!-- DASHBOARD:END -->`;

const readme = readFileSync('README.md', 'utf8');
const nuevo = readme.replace(/<!-- DASHBOARD:START -->[\s\S]*<!-- DASHBOARD:END -->/, bloque);
if (nuevo === readme) {
  console.log('Sin cambios en el dashboard.');
} else {
  writeFileSync('README.md', nuevo);
  console.log(`Dashboard regenerado con ${filas.length} repos.`);
}
