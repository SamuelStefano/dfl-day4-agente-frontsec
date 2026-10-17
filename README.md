# Agente — Auditoria de segurança frontend (DFL Day 4, P2)

Agente pronto pra task `dfl/day4-frontsec-scan`. Feito para o modelo `deepseek-v4.1-flash` no harness do
TestMyAgent (opencode).

**Como ele funciona:** o modelo não faz conta nenhuma. As 45 regras do README da task estão num solver
determinístico: a varredura FS01–FS11 com decodificação de JWT, a resolução de pacotes igual ao Node, as faixas
de versão, a leitura de cookies igual ao navegador, a absorção pela biblioteca, as exceções e a prioridade.
O modelo só roda 3 comandos e para. Assim um modelo barato tira a nota máxima, gasta centavos e termina
muito antes dos 600 s.

Resultado local: **80/80 testes** (5 exemplos + 5 casos ocultos do gabarito da DFL).

## O que vai pro runner

```text
AGENTS.md                         prompt de sistema: rodar o solver → checar → testar → parar
skills/frontsec/solve.mjs         solver determinístico das 45 regras (etapas 1–4)
skills/frontsec/SKILL.md          passo a passo + o que fazer se algum teste falhar (corrige uma cópia em /tmp)
skills/checar-saida/check.mjs     valida out/<caso>.json: formato exato e coerência de pontos e prioridade
```

O agente tem menos de 30 KB (o limite é 200 KB). Sem symlinks. Ele escreve só em `out/`.

## Testar sem modelo (segundos)

```bash
evals/run-solver.sh examples/frontsec-scan                 # 5 exemplos públicos
evals/run-solver.sh <pasta-da-task-com-tests/hidden>       # ex.: dfl-day4-tasks/tasks/frontsec-scan
```

## Testar com o DeepSeek (igual ao runner)

Precisa de Node 22+, git, [opencode](https://opencode.ai) e uma chave OpenRouter.

```bash
export OPENROUTER_API_KEY=...
MODEL=openrouter/deepseek/deepseek-v4.1-flash evals/run-local.sh examples/frontsec-scan 3
```

O script monta o workspace igual ao runner: `environment/` + `tests/public` + `AGENTS.md` + `skills/` em
`.opencode/skills/`. Depois roda o agente e os testes públicos. Também avisa se o agente escreveu fora de
`out/`. O trace fica em `/tmp/trace-N.jsonl`.

Pra rodar outro conjunto de casos, aponte para a pasta dele. A pasta precisa ter `environment/`,
`tests/public/` e `instruction.md`.
