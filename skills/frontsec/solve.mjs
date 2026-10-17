#!/usr/bin/env node
// Deterministic solver for dfl/day4-frontsec-scan. Implements README rules 1-45.
// Usage (from the workspace root): node .opencode/skills/frontsec/solve.mjs [case ...]
// Reads casos/<case>/ and writes out/<case>.json.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CASES_DIR = path.join(ROOT, "casos");
const OUT_DIR = path.join(ROOT, "out");

const POINTS = { FS01: 40, FS02: 3, FS03: 40, FS04: 25, FS05: 20, FS06: 15, FS07: 10, FS08: 3, FS09: 10, FS10: 5, FS11: 8 };
const SEVERITY_RANK = { baixa: 1, media: 2, alta: 3, critica: 4 };
const SEVERITY_POINTS = { baixa: 3, media: 10, alta: 25, critica: 40 };
const COOKIE_POINTS = {
  sem_secure: 5, sem_httponly: 10, samesite_fraco: 8, dominio_amplo: 5,
  prefixo_invalido: 5, expiracao_longa: 3, nao_removido_no_logout: 8,
};
const COOKIE_PROBLEMS = Object.keys(COOKIE_POINTS);
const XSS_SOURCES = ["location.hash", "location.search", "location.href", "document.URL", "document.referrer", "window.name", "event.data"];
const PUBLIC_ROLES = new Set(["anon", "usuario"]);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function grade(points, hasCritical) {
  if (hasCritical) return "F";
  if (points === 0) return "A";
  if (points <= 15) return "B";
  if (points <= 35) return "C";
  if (points <= 59) return "D";
  return "F";
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort(cmp);
}

// ---------- Stage 1: varredura ----------

function decodeJwtPayload(part) {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function scanLine(line, isJs, isHtml, ctx) {
  const hits = []; // { regra, cred? }

  for (const m of line.matchAll(/pf_live_[A-Za-z0-9]{24,}(?![A-Za-z0-9_])/g)) hits.push({ regra: "FS01", cred: m[0] });
  for (const m of line.matchAll(/nvm_sec_[0-9a-f]{32}(?![A-Za-z0-9_])/g)) hits.push({ regra: "FS01", cred: m[0] });
  for (const m of line.matchAll(/pf_test_[A-Za-z0-9]{24,}(?![A-Za-z0-9_])/g)) hits.push({ regra: "FS02", cred: m[0] });

  for (const m of line.matchAll(/eyJ[A-Za-z0-9_-]*\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    const payload = decodeJwtPayload(m[1]);
    if (payload === undefined || payload === null || typeof payload !== "object") continue;
    if (!("role" in payload) || !PUBLIC_ROLES.has(payload.role)) hits.push({ regra: "FS03", cred: m[0] });
  }

  const sinkRe = /\.(?:innerHTML|outerHTML)\s*(?:\+=|=(?!=))|document\.write\(|\.insertAdjacentHTML\(/g;
  for (const m of line.matchAll(sinkRe)) {
    const start = m.index + m[0].length;
    const semi = line.indexOf(";", start);
    const fragment = line.slice(start, semi < 0 ? line.length : semi);
    if (XSS_SOURCES.some((s) => fragment.includes(s))) hits.push({ regra: "FS04" });
  }

  for (const m of line.matchAll(/(?<![A-Za-z0-9_$])eval\(|new Function\(/g)) {
    const rest = line.slice(m.index + m[0].length).trimStart();
    if (rest[0] !== '"' && rest[0] !== "'") hits.push({ regra: "FS05" });
  }

  if (isHtml) {
    for (const m of line.matchAll(/<script\b[^>]*>/gi)) {
      if (/\bsrc\s*=\s*["']http:\/\//i.test(m[0])) hits.push({ regra: "FS06" });
    }
    for (const m of line.matchAll(/<a\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/\btarget\s*=\s*["']_blank["']/i.test(tag)) continue;
      const rel = tag.match(/\brel\s*=\s*["']([^"']*)["']/i);
      const words = rel ? rel[1].split(/\s+/).map((w) => w.toLowerCase()) : [];
      if (!words.includes("noopener") && !words.includes("noreferrer")) hits.push({ regra: "FS08" });
    }
  }

  for (const m of line.matchAll(/localStorage\.setItem\(\s*(["'])(.*?)\1/g)) {
    if (/token|jwt|sessao/i.test(m[2])) hits.push({ regra: "FS07" });
  }

  if (isJs) {
    for (const m of line.matchAll(/\/\/# sourceMappingURL=(\S+)/g)) {
      const target = m[1];
      if (target.startsWith("data:")) { hits.push({ regra: "FS11" }); continue; }
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.file), target.split(/[?#]/)[0]));
      if (!resolved.startsWith("../") && ctx.fileSet.has(resolved)) hits.push({ regra: "FS11" });
    }
  }

  return hits;
}

function scanHeaders(headers) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const found = [];

  const csp = lower["content-security-policy"];
  let cspBad = csp === undefined;
  if (!cspBad) {
    const directives = new Map();
    for (const raw of csp.split(";")) {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) continue;
      const name = parts[0].toLowerCase();
      if (!directives.has(name)) directives.set(name, parts.slice(1));
    }
    const effective = directives.get("script-src") ?? directives.get("default-src");
    cspBad = !effective || effective.some((v) => v === "'unsafe-inline'" || v === "'unsafe-eval'" || v === "*");
  }
  if (cspBad) found.push("FS09");

  const hsts = lower["strict-transport-security"];
  const maxAge = hsts && hsts.match(/max-age\s*=\s*"?(\d+)/i);
  if (!maxAge || Number(maxAge[1]) < 31536000) found.push("FS10");

  return found;
}

function varredura(caseDir, ctx) {
  const distDir = path.join(caseDir, "dist");
  const files = fs.existsSync(distDir) ? listFiles(distDir) : [];
  const fileSet = new Set(files);
  const seen = new Set();
  const achados = [];
  const creds = []; // { regra, cred }
  const jsContents = [];

  for (const file of files) {
    const isJs = file.endsWith(".js");
    const isHtml = file.endsWith(".html");
    if (!isJs && !isHtml) continue;
    const content = fs.readFileSync(path.join(distDir, file), "utf8");
    if (isJs) jsContents.push({ file, content });
    content.split("\n").forEach((line, i) => {
      for (const hit of scanLine(line, isJs, isHtml, { file, fileSet })) {
        if (hit.cred) creds.push({ regra: hit.regra, cred: hit.cred });
        const key = `${hit.regra}|${file}|${i + 1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        achados.push({ regra: hit.regra, arquivo: file, linha: i + 1 });
      }
    });
  }

  const headersFile = path.join(caseDir, "headers.json");
  const headers = fs.existsSync(headersFile) ? readJson(headersFile) : {};
  for (const regra of scanHeaders(headers)) achados.push({ regra, arquivo: "headers.json", linha: 0 });

  achados.sort((a, b) => cmp(a.arquivo, b.arquivo) || a.linha - b.linha || cmp(a.regra, b.regra));
  const pontos = achados.reduce((s, a) => s + POINTS[a.regra], 0);
  const nota = grade(pontos, achados.some((a) => a.regra === "FS01" || a.regra === "FS03"));
  ctx.creds = creds;
  ctx.jsContents = jsContents;
  return { achados, pontos, nota };
}

// ---------- Stage 2: dependencias ----------

const parseVersion = (v) => v.trim().split(".").map(Number);
function cmpVersion(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

function inRange(version, range) {
  return range.split("||").some((alt) => {
    const comps = alt.trim().split(/\s+/).filter(Boolean);
    if (!comps.length) return false;
    return comps.every((c) => {
      const m = c.match(/^(>=|<=|>|<|=)?(.+)$/);
      const op = m[1] ?? "=";
      const d = cmpVersion(version, m[2]);
      return op === ">=" ? d >= 0 : op === "<=" ? d <= 0 : op === ">" ? d > 0 : op === "<" ? d < 0 : d === 0;
    });
  });
}

const pkgName = (p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length);

function resolveDep(packages, fromPath, name) {
  let p = fromPath;
  for (;;) {
    const candidate = (p ? p + "/" : "") + "node_modules/" + name;
    if (packages[candidate]) return candidate;
    if (!p) return null;
    const idx = p.lastIndexOf("/node_modules/");
    p = idx < 0 ? "" : p.slice(0, idx);
  }
}

function cmpPath(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const c = cmp(a[i], b[i]);
    if (c) return c;
  }
  return 0;
}

function shortestPaths(packages) {
  const root = packages[""] || {};
  const best = new Map();
  const queue = [];
  const offer = (pkgPath, chain) => {
    const cur = best.get(pkgPath);
    if (!cur || cmpPath(chain, cur) < 0) {
      best.set(pkgPath, chain);
      queue.push(pkgPath);
    }
  };
  for (const name of Object.keys({ ...(root.dependencies || {}), ...(root.devDependencies || {}) })) {
    const target = resolveDep(packages, "", name);
    if (target) offer(target, [name]);
  }
  while (queue.length) {
    const from = queue.shift();
    const chain = best.get(from);
    for (const name of Object.keys(packages[from].dependencies || {})) {
      const target = resolveDep(packages, from, name);
      if (target) offer(target, [...chain, name]);
    }
  }
  return best;
}

function hasBanner(jsContents, name, version) {
  const re = new RegExp(`/\\*!\\s*${escapeRe(name)}@${escapeRe(version)}(?![0-9]|\\.[0-9])`);
  return jsContents.some(({ content }) => re.test(content));
}

function dependencias(caseDir, ctx) {
  const lockFile = path.join(caseDir, "lock.json");
  const avisosFile = path.join(caseDir, "avisos.json");
  if (!fs.existsSync(lockFile) || !fs.existsSync(avisosFile)) return { vulneraveis: [] };
  const packages = readJson(lockFile).packages || {};
  const { versoes = {}, avisos = [] } = readJson(avisosFile);
  const paths = shortestPaths(packages);

  const byKey = new Map();
  for (const [pkgPath, info] of Object.entries(packages)) {
    if (!pkgPath || !info || !info.version) continue;
    const name = pkgName(pkgPath);
    const version = info.version;
    const own = avisos.filter((a) => a.pacote === name);
    const hit = own.filter((a) => inRange(version, a.faixa));
    if (!hit.length) continue;
    const key = `${name}@${version}`;
    const chain = paths.get(pkgPath) || [name];
    const prev = byKey.get(key);
    if (prev) {
      if (cmpPath(chain, prev.caminho) < 0) prev.caminho = chain;
      continue;
    }
    const severidade = hit.map((a) => a.severidade).sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0];
    const candidates = (versoes[name] || [])
      .filter((v) => cmpVersion(v, version) > 0 && !own.some((a) => inRange(v, a.faixa)))
      .sort(cmpVersion);
    byKey.set(key, {
      pacote: name,
      versao: version,
      avisos: [...new Set(hit.map((a) => a.id))].sort(cmp),
      severidade,
      caminho: chain,
      correcao: candidates[0] ?? null,
      navegador: hasBanner(ctx.jsContents, name, version),
    });
  }
  const vulneraveis = [...byKey.values()].sort((a, b) => cmp(a.pacote, b.pacote) || cmpVersion(a.versao, b.versao));
  ctx.avisos = avisos;
  return { vulneraveis };
}

// ---------- Stage 3: sessao ----------

function parseSetCookie(raw) {
  const parts = raw.split(";").map((p) => p.trim());
  const first = parts.shift();
  const eq = first.indexOf("=");
  const nome = (eq < 0 ? first : first.slice(0, eq)).trim();
  const attrs = {};
  for (const part of parts) {
    if (!part) continue;
    const i = part.indexOf("=");
    const key = (i < 0 ? part : part.slice(0, i)).trim().toLowerCase();
    attrs[key] = i < 0 ? true : part.slice(i + 1).trim();
  }
  return { nome, attrs };
}

function defaultPath(urlPath) {
  const i = urlPath.lastIndexOf("/");
  const p = i <= 0 ? "" : urlPath.slice(0, i);
  return p || "/";
}

const isSensitive = (nome) => /sess|sid|token|auth|jwt/.test(nome.toLowerCase());

function sessao(caseDir) {
  const file = path.join(caseDir, "sessao.json");
  if (!fs.existsSync(file)) return { cookies: [] };
  const { host, passos = [] } = readJson(file);
  const logoutIndex = passos.findIndex((p) => p.passo === "logout");
  const cookies = new Map();
  const removedAtLogout = new Set();

  passos.forEach((step, stepIndex) => {
    for (const raw of step.set_cookie || []) {
      const { nome, attrs } = parseSetCookie(raw);
      const hasDomain = typeof attrs.domain === "string" && attrs.domain !== "";
      const dominio = hasDomain ? attrs.domain.toLowerCase().replace(/^\./, "") : String(host).toLowerCase();
      const hasPath = typeof attrs.path === "string" && attrs.path.startsWith("/");
      const caminho = hasPath ? attrs.path : defaultPath(step.caminho || "/");
      const id = `${nome}\u0000${dominio}\u0000${caminho}`;

      let life = null;
      if (attrs["max-age"] !== undefined && attrs["max-age"] !== true && /^-?\d+$/.test(attrs["max-age"])) {
        life = Number(attrs["max-age"]);
      } else if (typeof attrs.expires === "string") {
        const exp = Date.parse(attrs.expires);
        if (!Number.isNaN(exp)) life = Math.floor((exp - Date.parse(step.momento)) / 1000);
      }

      if (life !== null && life <= 0) {
        if (stepIndex === logoutIndex) removedAtLogout.add(id);
        continue;
      }

      let entry = cookies.get(id);
      if (!entry) {
        entry = { nome, dominio, caminho, problems: new Set(), writtenBeforeLogout: false };
        cookies.set(id, entry);
      }
      if (stepIndex < logoutIndex) entry.writtenBeforeLogout = true;

      const sensitive = isSensitive(nome);
      const secure = attrs.secure !== undefined;
      const httpOnly = attrs.httponly !== undefined;
      const sameSite = typeof attrs.samesite === "string" ? attrs.samesite.toLowerCase() : attrs.samesite === true ? "" : undefined;
      if (!secure) entry.problems.add("sem_secure");
      if (sensitive && !httpOnly) entry.problems.add("sem_httponly");
      if (sensitive && (sameSite === undefined || sameSite === "" || sameSite === "none")) entry.problems.add("samesite_fraco");
      if (sensitive && attrs.domain !== undefined) entry.problems.add("dominio_amplo");
      if (nome.startsWith("__Secure-") && !secure) entry.problems.add("prefixo_invalido");
      if (nome.startsWith("__Host-") && (!secure || attrs.domain !== undefined || attrs.path !== "/")) entry.problems.add("prefixo_invalido");
      if (sensitive && life !== null && life > 604800) entry.problems.add("expiracao_longa");
    }
  });

  for (const [id, entry] of cookies) {
    if (isSensitive(entry.nome) && entry.writtenBeforeLogout && !removedAtLogout.has(id)) entry.problems.add("nao_removido_no_logout");
  }

  const out = [...cookies.values()]
    .map((c) => ({ nome: c.nome, dominio: c.dominio, caminho: c.caminho, problemas: COOKIE_PROBLEMS.filter((p) => c.problems.has(p)) }))
    .sort((a, b) => cmp(a.nome, b.nome) || cmp(a.dominio, b.dominio) || cmp(a.caminho, b.caminho));
  return { cookies: out };
}

// ---------- Stage 4: plano ----------

function plano(caseDir, stage1, stage2, stage3, ctx) {
  const items = new Map();
  const add = (id, pontos, esforco, critico) => {
    const cur = items.get(id);
    if (cur) cur.pontos += pontos;
    else items.set(id, { id, pontos, esforco, critico });
  };

  const seenCred = new Set();
  for (const { regra, cred } of ctx.creds) {
    if (seenCred.has(cred)) continue;
    seenCred.add(cred);
    add(`cred:${cred.slice(-8)}`, POINTS[regra], 2, regra === "FS01" || regra === "FS03");
  }

  for (const v of stage2.vulneraveis) {
    let pontos = v.avisos.reduce((s, id) => s + (SEVERITY_POINTS[(ctx.avisos.find((a) => a.id === id) || {}).severidade] || 0), 0);
    if (!v.navegador) pontos = Math.floor(pontos / 2);
    let esforco = 1;
    if (v.correcao === null) esforco = 8;
    else if (parseVersion(v.correcao)[0] > parseVersion(v.versao)[0]) esforco = 5;
    add(`dep:${v.pacote}@${v.versao}`, pontos, esforco, v.severidade === "critica" && v.navegador);
  }

  const vulnKeys = stage2.vulneraveis.map((v) => ({ key: `${v.pacote}@${v.versao}`, pacote: v.pacote, versao: v.versao })).sort((a, b) => cmp(a.key, b.key));
  const absorbedBy = new Map();
  for (const { file, content } of ctx.jsContents) {
    const owner = vulnKeys.find((v) => hasBanner([{ content }], v.pacote, v.versao));
    if (owner) absorbedBy.set(file, owner.key);
  }

  for (const a of stage1.achados) {
    const pts = POINTS[a.regra];
    if (["FS01", "FS02", "FS03"].includes(a.regra)) continue;
    if (a.regra === "FS09" || a.regra === "FS10") { add(`hdr:${a.regra}`, pts, 1, false); continue; }
    if ((a.regra === "FS04" || a.regra === "FS05") && absorbedBy.has(a.arquivo)) {
      items.get(`dep:${absorbedBy.get(a.arquivo)}`).pontos += pts;
      continue;
    }
    add(`cod:${a.regra}:${a.arquivo}`, pts, a.regra === "FS04" || a.regra === "FS05" ? 3 : 1, false);
  }

  for (const c of stage3.cookies) {
    if (!c.problemas.length) continue;
    add(`cookie:${c.nome}@${c.dominio}${c.caminho}`, c.problemas.reduce((s, p) => s + COOKIE_POINTS[p], 0), 1, false);
  }

  const excFile = path.join(caseDir, "excecoes.json");
  const { data_auditoria = "", excecoes = [] } = fs.existsSync(excFile) ? readJson(excFile) : {};
  const accepted = new Set();
  const ignored = [];
  for (const e of excecoes) {
    const item = items.get(e.item);
    if (!item) ignored.push({ item: e.item, motivo: "inexistente" });
    else if (item.critico) ignored.push({ item: e.item, motivo: "critico" });
    else if (String(e.expira_em) < String(data_auditoria)) ignored.push({ item: e.item, motivo: "vencida" });
    else accepted.add(e.item);
  }

  const kept = [...items.values()].filter((i) => !accepted.has(i.id));
  const itens = kept
    .map((i) => ({ id: i.id, pontos: i.pontos, esforco: i.esforco, prioridade: Math.floor((i.pontos * 10) / i.esforco) }))
    .sort((a, b) => b.prioridade - a.prioridade || b.pontos - a.pontos || cmp(a.id, b.id));
  const pontos = itens.reduce((s, i) => s + i.pontos, 0);
  const esforco = itens.reduce((s, i) => s + i.esforco, 0);
  return {
    itens,
    aceitos: [...accepted].sort(cmp),
    excecoes_ignoradas: ignored.sort((a, b) => cmp(a.item, b.item)),
    pontos,
    esforco,
    nota: grade(pontos, kept.some((i) => i.critico)),
  };
}

// ---------- main ----------

function solveCase(name) {
  const caseDir = path.join(CASES_DIR, name);
  const ctx = {};
  const stage1 = varredura(caseDir, ctx);
  const stage2 = dependencias(caseDir, ctx);
  const stage3 = sessao(caseDir);
  const stage4 = plano(caseDir, stage1, stage2, stage3, ctx);
  return { varredura: stage1, dependencias: stage2, sessao: stage3, plano: stage4 };
}

const requested = process.argv.slice(2);
const cases = requested.length
  ? requested
  : fs.readdirSync(CASES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(cmp);
fs.mkdirSync(OUT_DIR, { recursive: true });
let failed = 0;
for (const name of cases) {
  try {
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(solveCase(name), null, 2) + "\n");
    console.log(`ok: out/${name}.json`);
  } catch (err) {
    failed++;
    console.error(`error in ${name}: ${err.stack || err}`);
  }
}
process.exit(failed ? 1 : 0);
