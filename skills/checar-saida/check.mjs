// Validates out/*.json for the frontsec-scan task: one file per case, valid JSON, exact shape and internal consistency.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const errors = [];
const cases = existsSync("casos") ? readdirSync("casos", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
if (!existsSync("out")) errors.push("out/ folder does not exist");

const POINTS = { FS01: 40, FS02: 3, FS03: 40, FS04: 25, FS05: 20, FS06: 15, FS07: 10, FS08: 3, FS09: 10, FS10: 5, FS11: 8 };
const GRADES = ["A", "B", "C", "D", "F"];
const SEVERITIES = ["baixa", "media", "alta", "critica"];
const PROBLEMS = ["sem_secure", "sem_httponly", "samesite_fraco", "dominio_amplo", "prefixo_invalido", "expiracao_longa", "nao_removido_no_logout"];
const int = (v) => Number.isInteger(v);
const keys = (o, ks) => o && typeof o === "object" && !Array.isArray(o) && ks.every((k) => k in o) && Object.keys(o).length === ks.length;
const sorted = (a) => a.every((x, i) => i === 0 || a[i - 1] <= x);

function check(name, r) {
  const e = (msg) => errors.push(`${name}: ${msg}`);
  if (!keys(r, ["varredura", "dependencias", "sessao", "plano"])) return e("top-level keys must be varredura, dependencias, sessao, plano");

  const v = r.varredura;
  if (!keys(v, ["achados", "pontos", "nota"]) || !Array.isArray(v.achados)) e("varredura has wrong keys");
  else {
    if (!v.achados.every((a) => keys(a, ["regra", "arquivo", "linha"]) && a.regra in POINTS && int(a.linha))) e("varredura.achados has an invalid item");
    const sum = v.achados.reduce((s, a) => s + (POINTS[a.regra] || 0), 0);
    if (sum !== v.pontos) e(`varredura.pontos (${v.pontos}) != sum of findings (${sum})`);
    if (!GRADES.includes(v.nota)) e("varredura.nota invalid");
  }

  const d = r.dependencias;
  if (!keys(d, ["vulneraveis"]) || !Array.isArray(d.vulneraveis)) e("dependencias has wrong keys");
  else if (!d.vulneraveis.every((x) => keys(x, ["pacote", "versao", "avisos", "severidade", "caminho", "correcao", "navegador"])
    && Array.isArray(x.avisos) && sorted(x.avisos) && SEVERITIES.includes(x.severidade) && Array.isArray(x.caminho)
    && (x.correcao === null || typeof x.correcao === "string") && typeof x.navegador === "boolean")) e("dependencias.vulneraveis has an invalid item");

  const s = r.sessao;
  if (!keys(s, ["cookies"]) || !Array.isArray(s.cookies)) e("sessao has wrong keys");
  else if (!s.cookies.every((c) => keys(c, ["nome", "dominio", "caminho", "problemas"]) && Array.isArray(c.problemas)
    && c.problemas.every((p) => PROBLEMS.includes(p)))) e("sessao.cookies has an invalid item");

  const p = r.plano;
  if (!keys(p, ["itens", "aceitos", "excecoes_ignoradas", "pontos", "esforco", "nota"]) || !Array.isArray(p.itens)) return e("plano has wrong keys");
  if (!p.itens.every((i) => keys(i, ["id", "pontos", "esforco", "prioridade"]) && int(i.pontos) && int(i.esforco) && i.prioridade === Math.floor((i.pontos * 10) / i.esforco))) e("plano.itens has an invalid item or wrong prioridade");
  if (p.pontos !== p.itens.reduce((t, i) => t + i.pontos, 0)) e("plano.pontos != sum of itens");
  if (p.esforco !== p.itens.reduce((t, i) => t + i.esforco, 0)) e("plano.esforco != sum of itens");
  if (!Array.isArray(p.aceitos) || !sorted(p.aceitos)) e("plano.aceitos must be a sorted array");
  if (!Array.isArray(p.excecoes_ignoradas) || !p.excecoes_ignoradas.every((x) => keys(x, ["item", "motivo"]) && ["inexistente", "critico", "vencida"].includes(x.motivo))) e("plano.excecoes_ignoradas invalid");
  if (!GRADES.includes(p.nota)) e("plano.nota invalid");
}

for (const name of cases) {
  const file = `out/${name}.json`;
  if (!existsSync(file)) { errors.push(`missing ${file}`); continue; }
  try { check(name, JSON.parse(readFileSync(file, "utf8"))); console.log(`ok: ${file}`); } catch (err) { errors.push(`${file}: invalid JSON (${err.message})`); }
}
if (!cases.length) errors.push("no folder in casos/");
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`ok: ${cases.length} case(s) with valid output`);
