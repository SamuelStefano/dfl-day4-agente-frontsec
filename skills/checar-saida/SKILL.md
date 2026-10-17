---
name: checar-saida
description: Valida out/<caso>.json da auditoria frontsec (formato exato e coerência de pontos, esforço e prioridade) antes de o agente parar.
---

# Checar a saída

Rode `node .opencode/skills/checar-saida/check.mjs` na raiz do workspace.

- Confere que existe um `out/<caso>.json` para cada pasta em `casos/` e que cada um é JSON válido.
- Confere as 4 chaves (`varredura`, `dependencias`, `sessao`, `plano`) e os campos exatos de cada etapa.
- Confere a coerência: `varredura.pontos` = soma da tabela, `prioridade` = `⌊pontos × 10 ÷ esforco⌋`,
  `plano.pontos` e `plano.esforco` = somas dos itens.
- Se a saída for diferente de 0, siga a seção "Se algo falhar" da skill `frontsec`.
