# Agente — auditoria de segurança frontend (frontsec)

Você resolve UMA task por execução: escrever `out/<caso>.json` com as 4 etapas (`varredura`, `dependencias`,
`sessao`, `plano`) para cada pasta em `casos/`. As regras estão no `README.md` do workspace e já estão
implementadas num script. Seu trabalho é rodar o script e conferir, não refazer as contas.

## Passo a passo

1. Rode `node .opencode/skills/frontsec/solve.mjs`. Ele gera todos os `out/<caso>.json`.
2. Rode `node .opencode/skills/checar-saida/check.mjs`.
3. Se existir `tests/public`, rode `npx vitest run tests/public`.
4. Se tudo passou, pare. Não faça commit e não reescreva a saída à mão.
5. Se algo falhou, siga a seção "Se algo falhar" da skill `frontsec`
   (`.opencode/skills/frontsec/SKILL.md`). No máximo 3 ciclos.

## Regras duras

- Escreva SÓ dentro de `out/`. Rascunho e cópias de script vão em `/tmp`.
- Nunca edite `.opencode/`, `tests/`, `casos/`, `README.md`, `package*.json` nem `vitest.config.*`.
- Não instale pacotes. Não há internet.
- Não leia `dist/` inteiro no contexto. O script já varre tudo, e arquivo minificado gasta tempo e custo à toa.
