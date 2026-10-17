---
name: frontsec
description: Auditoria de segurança frontend (varredura FS01–FS11, dependências, cookies de sessão, plano priorizado). Um script determinístico implementa as regras 1–45 do README.md e escreve out/<caso>.json.
---

# Auditoria frontsec (task dfl/day4-frontsec-scan)

As 45 regras do `README.md` do workspace são todas mecânicas e já estão implementadas em `solve.mjs`, nesta pasta.
**Não calcule nada à mão, não decodifique JWT nem leia cookie de cabeça. Rode o script.**

## Passo a passo

1. Na raiz do workspace, rode:

   ```bash
   node .opencode/skills/frontsec/solve.mjs
   ```

   Ele lê todas as pastas de `casos/` e escreve um `out/<caso>.json` por caso. Para rodar um caso só:
   `node .opencode/skills/frontsec/solve.mjs exemplo-2`.
2. Rode `node .opencode/skills/checar-saida/check.mjs`.
3. Se existir `tests/public`, rode `npx vitest run tests/public`.
4. Se tudo passou, pare. Não edite os arquivos de `out/` à mão.

## Se algo falhar

- **Nunca edite `.opencode/`, `tests/`, `casos/`, `README.md` nem `package*.json`.** Um arquivo alterado
  fora de `out/` zera a nota.
- Para corrigir o script, copie-o para `/tmp` e edite a cópia:

  ```bash
  cp .opencode/skills/frontsec/solve.mjs /tmp/solve.mjs
  node /tmp/solve.mjs
  ```

  A cópia continua lendo `casos/` e escrevendo `out/` a partir da pasta atual.
- Leia a mensagem do teste, ache no `README.md` a regra que cobre aquele campo e corrija só essa função:
  `scanLine`/`scanHeaders` (etapa 1), `dependencias` (etapa 2), `sessao` (etapa 3), `plano` (etapa 4).
  No máximo 3 ciclos. Se não passar, deixe a melhor saída que o script gerou.

## O que o script garante (para conferir no README se precisar)

- **Etapa 1:** percorre `dist/` inteiro, inclusive subpastas. Lê só `.js` e `.html`, linha por linha, e os comentários contam.
  - Chave só vale no formato exato: `pf_live_`/`pf_test_` + 24 ou mais `[A-Za-z0-9]`, ou `nvm_sec_` + 32 hex.
    `pf_pub_`, `nvm_pub_` e placeholder nunca contam.
  - JWT: o payload é decodificado em base64url. `role` `anon` ou `usuario` é público. Qualquer outro valor, ou sem `role`, é FS03.
  - FS04: o sink só conta com a fonte escrita literalmente no trecho até o `;`. FS05: o primeiro caractere depois do
    `(` não é aspas (crase conta). FS11: o `.map` precisa existir, resolvido a partir da pasta do `.js`, ou ser `data:`.
  - CSP: vale `script-src` e, se não houver, `default-src`. `Report-Only` é ignorado. HSTS precisa de `max-age` ≥ 31536000.
  - Trio repetido (`regra`, `arquivo`, `linha`) conta uma vez. Nota `F` se houver FS01 ou FS03.
- **Etapa 2:** resolve como o Node, subindo `node_modules`, com a raiz em `dependencies` + `devDependencies`.
  - O caminho é o mais curto e, no empate, o menor em ordem de texto. Versão é comparada numericamente. Faixa aceita `||`.
  - `correcao` é a menor versão publicada acima da instalada que não cai em nenhum aviso.
  - `navegador` exige o banner `/*! nome@versao` num `.js`.
- **Etapa 3:**
  - Atributos não diferenciam maiúsculas. O domínio fica sem `.` inicial e o caminho padrão vem do `caminho` do passo.
  - `Max-Age` vale mais que `Expires`. Vida ≤ 0 é remoção.
  - Os 7 problemas saem na ordem da lista. `nao_removido_no_logout` exige remoção com a mesma identidade no passo `logout`.
- **Etapa 4:**
  - Os itens são `cred:`, `cod:`, `hdr:`, `dep:` e `cookie:`. FS04 e FS05 num `.js` com banner de pacote vulnerável somam no `dep:`.
  - As exceções são julgadas na ordem: inexistente, depois crítico, depois vencida.
  - A prioridade é `⌊pontos × 10 ÷ esforco⌋`. Ordenação: prioridade, depois pontos, depois id.
