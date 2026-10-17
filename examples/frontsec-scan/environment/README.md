# Auditoria de segurança frontend antes do go-live

Uma agência pequena entrega SPAs (Vite/React + backend como serviço). Antes de o site de um cliente ir ao ar,
ela precisa entregar uma **auditoria de segurança frontend completa**, em 4 etapas que se alimentam:

| Etapa | Chave na saída | O que faz | Usa |
|---|---|---|---|
| 1 | `varredura` | varre o build publicado e os headers com um catálogo fechado de 11 regras (FS01–FS11), soma pontos e dá nota | `dist/`, `headers.json` |
| 2 | `dependencias` | cruza a árvore de pacotes instalados com uma base de avisos de vulnerabilidade e diz quais chegam ao navegador | `lock.json`, `avisos.json`, `dist/` |
| 3 | `sessao` | confere cada cookie gravado no fluxo login → logout contra uma lista fechada de problemas | `sessao.json` |
| 4 | `plano` | junta tudo em itens de correção (mesma causa = um item), aplica as exceções aceitas, prioriza por fórmula e recalcula a nota | resultados das etapas 1–3, `excecoes.json` |

Um erro numa etapa cedo se propaga: o `plano` é montado a partir do que as etapas 1–3 encontraram.

## Entrada: `casos/<caso>/`

| Caminho | Conteúdo |
|---|---|
| `dist/` | o build publicado: `index.html`, arquivos `.js` (alguns minificados numa linha só), às vezes `.js.map`, às vezes em subpastas |
| `headers.json` | `{ "<Nome-Do-Header>": "<valor>" }` — headers HTTP da resposta de `index.html` em produção |
| `lock.json` | a árvore de pacotes instalados, no formato do `package-lock.json` (etapa 2) |
| `avisos.json` | base de avisos de vulnerabilidade e versões publicadas de cada pacote (etapa 2) |
| `sessao.json` | os headers `Set-Cookie` capturados em cada passo do fluxo de login e logout (etapa 3) |
| `excecoes.json` | a data da auditoria e os riscos que o cliente pediu para aceitar (etapa 4) |

Todos os pacotes, avisos (`AVF-...`), chaves e domínios são **fictícios**.

# Etapa 1 — `varredura`

## Formatos fictícios usados nos dados

| Coisa | Formato |
|---|---|
| Chave **secreta** da PagaFácil (pagamentos) | `pf_live_` seguido de **24 ou mais** caracteres `[A-Za-z0-9]` |
| Chave **de teste** da PagaFácil | `pf_test_` seguido de **24 ou mais** caracteres `[A-Za-z0-9]` |
| Chave **pública** da PagaFácil | `pf_pub_...` — feita para o navegador, **nunca** é achado |
| Chave **secreta** da Nuvem Local (cloud) | `nvm_sec_` seguido de **32** caracteres hexadecimais minúsculos `[0-9a-f]` |
| Chave **pública** da Nuvem Local | `nvm_pub_...` — **nunca** é achado |
| Token JWT do Auth Nuvem Local | três partes separadas por `.`: `eyJ...` `.` `<payload>` `.` `<assinatura>`. O payload é JSON em **base64url** (sem `=` no fim; `-` e `_` no lugar de `+` e `/`). A assinatura é falsa e não importa |

Um texto que não casa exatamente com o formato (menos caracteres, `_` no meio, placeholder como
`pf_live_SUA_CHAVE_AQUI`) **não é** chave.

## Quais arquivos olhar

1. Percorra `dist/` inteiro, **inclusive subpastas**. `arquivo` no resultado é o caminho relativo a `dist/`,
   com `/` (ex.: `assets/vendor/x.js`, `index.html`).
2. Só o conteúdo de arquivos `.js` e `.html` é lido. Arquivos `.map` **não são lidos** (só importam para a FS11).
   Scripts inline dentro do `.html` são lidos como qualquer linha.
3. A análise é **por linha**: `linha` é o número da linha no arquivo, começando em 1 (separe por `\n`).
   Um arquivo minificado tem tudo na linha 1.
4. **Comentários contam.** Código comentado (`// ...`) continua dentro do arquivo público, então é analisado normalmente.

## Regras (catálogo fechado)

| Regra | O que é | Onde | Pontos |
|---|---|---|---|
| `FS01` | chave secreta (`pf_live_` ou `nvm_sec_`) | `.js`, `.html` | 40 (crítico) |
| `FS02` | chave de teste (`pf_test_`) | `.js`, `.html` | 3 |
| `FS03` | JWT com papel de servidor | `.js`, `.html` | 40 (crítico) |
| `FS04` | XSS: sink de HTML alimentado por fonte controlada pelo usuário | `.js`, `.html` | 25 |
| `FS05` | `eval` / `new Function` com argumento não literal | `.js`, `.html` | 20 |
| `FS06` | `<script>` carregado por `http://` | `.html` | 15 |
| `FS07` | token/sessão guardado em `localStorage` | `.js`, `.html` | 10 |
| `FS08` | link `target="_blank"` sem `noopener`/`noreferrer` | `.html` | 3 |
| `FS09` | CSP ausente ou insegura | `headers.json` | 10 |
| `FS10` | HSTS ausente ou curto | `headers.json` | 5 |
| `FS11` | source map exposto | `.js` | 8 |

Detalhe de cada regra:

5. **FS01** — a linha contém uma chave secreta no formato da tabela de formatos (`pf_live_` + 24 ou mais
   `[A-Za-z0-9]`, ou `nvm_sec_` + 32 `[0-9a-f]`).
6. **FS02** — a linha contém `pf_test_` + 24 ou mais `[A-Za-z0-9]`. Se a mesma linha tem uma `pf_live_` e uma
   `pf_test_`, são **dois** achados (FS01 e FS02).
7. **FS03** — a linha contém um JWT. Decodifique o payload (parte do meio) e leia o campo `role`.
   Papéis **públicos**: `"anon"` e `"usuario"` → **não** é achado. Qualquer outro valor (ex.: `"servidor"`,
   `"admin"`) **ou payload sem o campo `role`** → FS03.
8. **FS04** — **sinks**: `.innerHTML =`, `.innerHTML +=`, `.outerHTML =`, `.outerHTML +=` (espaços opcionais;
   comparação `==`/`===` **não** é sink), `document.write(` e `.insertAdjacentHTML(`.
   O **trecho** de um sink vai do fim do sink até o próximo `;` da mesma linha (ou o fim da linha, se não houver `;`).
   É achado quando o trecho contém, escrito literalmente, uma destas **fontes**:
   `location.hash`, `location.search`, `location.href`, `document.URL`, `document.referrer`, `window.name`, `event.data`.
   O texto precisa aparecer exatamente assim (`event.data.titulo` contém `event.data`; `e.data` não contém).
   Não há rastreio de variável: `const q = location.search; el.innerHTML = q` **não** é achado (a fonte não está no trecho).
   Texto literal (`el.innerHTML = "<p>oi</p>"`) não é achado. `textContent`, `innerText`, `title` etc. não são sinks.
9. **FS05** — ocorrência de `eval(` (sem letra, dígito, `_` ou `$` imediatamente antes; `.` antes vale, então
   `window.eval(` conta) ou de `new Function(`. É achado quando o **primeiro caractere não-espaço** depois do `(`
   **não** é `"` nem `'`. Template com crase (`` ` ``) **não** é literal → é achado. Outras funções
   (`setTimeout`, `retrieval(`, `$eval(`) estão fora do catálogo.
10. **FS06** — linha de `.html` com uma tag `<script` cujo atributo `src="..."` começa com `http://`.
    `https://`, `//` (relativo ao protocolo) e `/` não são achado. Um `src = "http://..."` montado dentro de `.js` não conta.
11. **FS07** — `localStorage.setItem(` cujo primeiro argumento é um texto entre aspas (`"..."` ou `'...'`) que
    **contém** `token`, `jwt` ou `sessao`, sem diferenciar maiúsculas (ex.: `"auth_token"`, `'SESSAO_ID'`).
    Primeiro argumento que é variável não é achado. O que importa é a **chave**, não o valor.
    `sessionStorage` está fora desta regra.
12. **FS08** — cada tag `<a ...>` de `.html` (a tag inteira fica numa linha) com `target="_blank"` é achado se
    não tem `rel="..."` ou se as palavras do `rel` (separadas por espaço) não incluem `noopener` nem `noreferrer`.
    Tag sem `target="_blank"` nunca é achado.
13. **FS09** — (vale para FS09 e FS10: nomes de header **sem diferenciar maiúsculas**, `strict-transport-security`
    = `Strict-Transport-Security`). Só `Content-Security-Policy` conta
    (`Content-Security-Policy-Report-Only` só reporta, não protege; é ignorado). FS09 quando:
    a) o header não existe; ou
    b) a diretiva **efetiva para scripts** é insegura. Separe o valor por `;`; cada diretiva é
       `nome valor1 valor2 ...`. A diretiva efetiva é `script-src`; **se não houver `script-src`**, é `default-src`.
       Se nenhuma das duas existe → FS09. É insegura se algum valor dela é exatamente `'unsafe-inline'`,
       `'unsafe-eval'` ou `*`. Um host com curinga (`https://*.cdn.example`) **não** é `*`.
       Outras diretivas (`style-src`, `img-src`, ...) não importam, e `default-src` é ignorado quando há `script-src`.
14. **FS10** — header `Strict-Transport-Security` ausente, sem `max-age=N`, ou com `N` **menor que 31536000**
    (1 ano). `max-age=31536000` exato está OK.
15. **FS11** — linha de `.js` com `//# sourceMappingURL=<alvo>`. Achado se `<alvo>` começa com `data:` (mapa
    embutido) **ou** se o arquivo `<alvo>`, resolvido **a partir da pasta do `.js`** (`./` e `../` valem),
    existe dentro de `dist/`. Alvo que não existe não é achado. Um `.map` que existe mas ninguém referencia não é achado.
16. **FS09 e FS10** usam `"arquivo": "headers.json"` e `"linha": 0`, no máximo um achado de cada.

## Achados, pontos e nota

17. Um achado é o trio `{ regra, arquivo, linha }`. O **mesmo trio aparece uma vez só**: duas ocorrências da
    mesma regra na mesma linha = 1 achado. Regras diferentes na mesma linha = achados separados.
18. `achados` ordenado por `arquivo` (ordem de texto simples, código de caractere: `assets/...` < `headers.json` < `index.html`),
    depois `linha` (numérica, crescente), depois `regra` (`FS01` < `FS02` < ... < `FS11`).
19. `pontos` = soma dos pontos da tabela para cada achado (depois de remover duplicados).
20. `nota`:
    - se existe **qualquer** achado crítico (`FS01` ou `FS03`) → `"F"`, sejam quais forem os pontos;
    - senão: `pontos` = 0 → `"A"`; 1 a 15 → `"B"`; 16 a 35 → `"C"`; 36 a 59 → `"D"`; 60 ou mais → `"F"`.
      Os limites são **inclusivos** (15 é B, 16 é C, 59 é D, 60 é F).

21. A etapa 1 sai como `"varredura": { "achados": [...], "pontos": N, "nota": "X" }`.

# Etapa 2 — `dependencias`

## `lock.json`

Mesmo formato do `package-lock.json` (versão 3). Em `packages`, a chave `""` é o projeto (raiz), com
`dependencies` e `devDependencies`. Cada outra chave é um **pacote instalado**, identificado pelo caminho
da pasta: `node_modules/x` (instalado no topo) ou `node_modules/a/node_modules/x` (cópia própria de `x`
dentro de `a`). O **nome** do pacote é o que vem depois do **último** `node_modules/`. Cada pacote tem
`version` e, às vezes, `dependencies` (`{ "<nome>": "<faixa>" }`). As faixas (`^2.2.0`) do lock **não importam**:
quem decide qual versão é usada é a resolução abaixo.

22. **Resolução** (igual ao Node): quando o pacote instalado em `P` depende de `x`, procure `P/node_modules/x`;
    se não existe, suba uma pasta (corte o último `/node_modules/<nome>` de `P`) e procure de novo; no fim
    procure `node_modules/x`. A raiz (`dependencies` **e** `devDependencies`) procura direto `node_modules/x`.
    Ex.: `node_modules/a/node_modules/b` depende de `c` → tenta `node_modules/a/node_modules/b/node_modules/c`,
    depois `node_modules/a/node_modules/c`, depois `node_modules/c`.
    Todo pacote do lock é alcançável a partir da raiz. Pode haver ciclo (`a` depende de `b` e `b` de `a`).
23. **Caminho** de um pacote instalado: a lista de **nomes** desde uma dependência direta da raiz até ele,
    seguindo a resolução (sem o nome do projeto; uma dependência direta tem caminho `["ela"]`).
    Se há vários caminhos, vale o **mais curto**; empate de tamanho → compare elemento a elemento pela ordem
    de texto simples e fique com o menor (`["cupom-ui", "x"]` antes de `["graficos", "x"]`).

## `avisos.json`

```json
{
  "versoes": { "<pacote>": ["1.0.0", "1.0.1", "..."] },
  "avisos": [ { "id": "AVF-2026-0101", "pacote": "datas-br", "faixa": ">=1.0.0 <1.4.5", "severidade": "media", "titulo": "..." } ]
}
```

24. **Versões** são sempre `X.Y.Z` com números inteiros e se comparam **numericamente**, parte por parte
    (`1.10.0` > `1.9.0`; `1.0.10` > `1.0.9`).
25. **Faixa**: alternativas separadas por `||` (basta uma valer). Cada alternativa é uma lista de comparações
    separadas por espaço, **todas** precisam valer. Comparação = operador (`>=`, `>`, `<=`, `<`, `=`) colado
    numa versão; versão sem operador = `=` (igual). Ex.: `"<2.5.3 || >=3.0.0 <3.0.4"`.
26. Um pacote instalado é **vulnerável** se, para algum aviso com o mesmo `pacote`, a sua `version` está na `faixa`.
    Os `avisos` dele são os ids dos avisos cuja faixa contém a versão instalada.
    Duas cópias do mesmo pacote em versões diferentes são avaliadas separadamente (uma pode ser vulnerável e a outra não).
27. `severidade` do pacote = a **maior** entre os seus avisos (`baixa` < `media` < `alta` < `critica`).
28. `correcao` = a **menor** versão de `versoes[<pacote>]` que é **maior** que a instalada e que **não** está na
    faixa de **nenhum** aviso daquele pacote (inclusive avisos que não atingem a versão instalada).
    Se não existe → `null`.
29. **Chega ao navegador** (`navegador`): o build marca cada biblioteca empacotada com um banner
    `/*! <nome>@<versao>` (ex.: `/*! datas-br@1.4.2 | MIT */`). `navegador` é `true` se algum arquivo **`.js`**
    de `dist/` (qualquer pasta, qualquer linha) contém o banner com **o mesmo nome e a mesma versão** do pacote
    instalado; senão `false`. Como na etapa 1, `.map` e `.html` não são lidos.

30. Saída: `"dependencias": { "vulneraveis": [ ... ] }`, um objeto por pacote vulnerável (por `nome@versao`),
    ordenado por `pacote` (texto) e depois `versao` (numérica):

```json
{ "pacote": "datas-br", "versao": "1.4.2", "avisos": ["AVF-2026-0101"], "severidade": "media",
  "caminho": ["datas-br"], "correcao": "1.4.5", "navegador": true }
```

`avisos` em ordem de texto. Nenhum vulnerável → `"vulneraveis": []`.

# Etapa 3 — `sessao`

## `sessao.json`

```json
{ "host": "app.cliente.example",
  "passos": [ { "passo": "login", "caminho": "/api/login", "momento": "2026-10-20T13:00:00Z",
                "set_cookie": ["sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax"] } ] }
```

Os `passos` estão em ordem; o último é sempre o `"logout"` (há exatamente um). `caminho` é o caminho da URL
que respondeu com aqueles `Set-Cookie`, e `momento` é a hora da resposta (UTC).

31. **Leitura de um `Set-Cookie`**: separe por `;` e tire espaços. A primeira parte é `nome=valor`. As demais
    são atributos; o **nome do atributo não diferencia maiúsculas** (`secure`, `HttpOnly`, `samesite=none`...).
    `Secure` e `HttpOnly` não têm valor; `SameSite`, `Domain`, `Path`, `Max-Age` e `Expires` têm `=valor`.
32. **Identidade** de um cookie = `nome` + `dominio` + `caminho`:
    - `nome`: exatamente como escrito (diferencia maiúsculas);
    - `dominio`: o valor de `Domain` em minúsculas e **sem o `.` inicial** (`.ipe.example` = `ipe.example`);
      sem `Domain` → o `host` do `sessao.json`;
    - `caminho`: o valor de `Path`; sem `Path` → o **caminho padrão**: o `caminho` do passo até, **sem incluir**,
      a última `/`; se sobrar vazio, `/`. Ex.: `/api/login` → `/api`; `/entrar` → `/`; `/api/v1/auth/sair` → `/api/v1/auth`.
33. **Vida** do cookie: se tem `Max-Age`, a vida é esse número de segundos (**`Max-Age` vale mais que `Expires`**
    quando os dois estão presentes). Senão, se tem `Expires` (data HTTP, ex.: `Wed, 21 Oct 2026 07:28:00 GMT`),
    a vida é `Expires − momento` do passo, em segundos. Sem os dois → cookie **de sessão** (sem vida definida).
34. Um `Set-Cookie` com vida **≤ 0** é uma **remoção** (`Max-Age=0`, `Max-Age=-1` ou `Expires` no passado);
    os outros **gravam** o cookie. Remoções não entram na análise de atributos e não criam cookie novo.
35. **Cookie sensível**: o nome, em minúsculas, contém `sess`, `sid`, `token`, `auth` ou `jwt`
    (ex.: `sessao`, `__Host-sid`, `Auth`, `refresh_jwt`).
36. **Problemas** (lista fechada, nesta ordem). Um problema de atributo vale se **qualquer** `Set-Cookie` que
    **grava** aquele cookie (mesma identidade, em qualquer passo) o tem:
    1. `sem_secure` — qualquer cookie sem o atributo `Secure`;
    2. `sem_httponly` — cookie sensível sem `HttpOnly`;
    3. `samesite_fraco` — cookie sensível sem `SameSite`, ou com `SameSite=None` (valor sem diferenciar maiúsculas);
    4. `dominio_amplo` — cookie sensível com atributo `Domain` (o cookie vai também para outros subdomínios);
    5. `prefixo_invalido` — nome começa com `__Secure-` e não tem `Secure`; **ou** começa com `__Host-` e
       (não tem `Secure`, **ou** tem `Domain`, **ou** não tem o atributo `Path=/` escrito). Vale para qualquer cookie;
    6. `expiracao_longa` — cookie sensível com vida **maior que 604800** segundos (7 dias; exatamente 7 dias está OK);
    7. `nao_removido_no_logout` — cookie sensível gravado em algum passo **antes** do logout e que **não** tem,
       no passo `"logout"`, uma remoção com a **mesma identidade** (mesmo nome, domínio e caminho, pelas regras 32–34).
       Uma remoção com outro `Path` ou outro `Domain` não remove. Um cookie gravado só no próprio logout não tem este problema.
37. Saída: `"sessao": { "cookies": [ ... ] }`, um objeto por identidade que foi **gravada** pelo menos uma vez,
    ordenado por `nome`, depois `dominio`, depois `caminho` (ordem de texto simples, código de caractere:
    `__Host-x` < `Auth` < `sid`). Cookie sem problema também entra, com `"problemas": []`.

```json
{ "nome": "sid", "dominio": "app.cliente.example", "caminho": "/api", "problemas": ["sem_httponly", "nao_removido_no_logout"] }
```

# Etapa 4 — `plano`

## Itens de correção (mesma causa = um item)

38. Cada problema das etapas 1–3 vira um **item**, com `id`, `pontos` e `esforco`:

| Origem | Um item por | `id` | `pontos` | `esforco` |
|---|---|---|---|---|
| achados `FS01`, `FS02`, `FS03` | **credencial distinta** (o texto da chave ou do JWT que gerou o achado; a mesma chave em vários lugares = um item) | `cred:` + os **8 últimos caracteres** da credencial | pontos da regra (40, 3 ou 40), **uma vez** só | 2 |
| achados `FS04`..`FS08`, `FS11` | par (`regra`, `arquivo`) | `cod:<regra>:<arquivo>` (ex.: `cod:FS04:assets/admin.js`) | soma dos pontos dos achados dessa regra nesse arquivo | `FS04` e `FS05`: 3; os outros: 1 |
| achados `FS09`, `FS10` | achado | `hdr:FS09`, `hdr:FS10` | pontos da regra | 1 |
| `dependencias.vulneraveis` | pacote vulnerável | `dep:<pacote>@<versao>` | soma das severidades dos seus `avisos` (`baixa` 3, `media` 10, `alta` 25, `critica` 40); se `navegador` é `false`, **metade, arredondada para baixo** | `correcao` `null` → 8; major da `correcao` maior que o da instalada → 5; senão 1 |
| `sessao.cookies` com problema | cookie | `cookie:<nome>@<dominio><caminho>` (ex.: `cookie:sid@app.x.example/api`) | soma: `sem_secure` 5, `sem_httponly` 10, `samesite_fraco` 8, `dominio_amplo` 5, `prefixo_invalido` 5, `expiracao_longa` 3, `nao_removido_no_logout` 8 | 1 |

Achados de `FS03` com JWT público não existem (etapa 1), então não viram item. Cookie com `"problemas": []` não vira item.
39. **Absorção pela biblioteca**: um achado `FS04` ou `FS05` num arquivo `.js` que contém o banner (regra 29)
    de um pacote **vulnerável** (mesmo `nome@versao` de um item de `dependencias.vulneraveis`) é código daquela
    biblioteca: atualizar o pacote resolve. Esse achado **não** vira item `cod:`; os pontos dele **somam** nos `pontos`
    do item `dep:` (sem mudar o `esforco`). Se o arquivo tem banners de mais de um pacote vulnerável, vale o
    primeiro `nome@versao` em ordem de texto. Outras regras (`FS01`, `FS11`...) nesse arquivo continuam como sempre.
40. **Item crítico**: item `cred:` de `FS01` ou `FS03`, ou item `dep:` com `severidade` `"critica"` e `navegador` `true`.

## Exceções (riscos aceitos)

```json
{ "data_auditoria": "2026-10-20",
  "excecoes": [ { "item": "cod:FS08:index.html", "motivo": "...", "expira_em": "2026-12-31" } ] }
```

41. Cada exceção é julgada nesta ordem e fica **aceita** ou **ignorada** com um `motivo`:
    1. o `item` não é o `id` de nenhum item da regra 38 (depois da absorção da regra 39) → ignorada, `"inexistente"`;
    2. o item é crítico (regra 40) → ignorada, `"critico"` (risco crítico nunca é aceito);
    3. `expira_em` é **anterior** a `data_auditoria` → ignorada, `"vencida"` (vencer no próprio dia da auditoria ainda vale);
    4. senão → **aceita**: o item sai da lista de itens.

## Prioridade e nota final

42. `prioridade` = `pontos × 10 ÷ esforco`, **arredondado para baixo** (inteiro).
43. `itens` = os itens **não aceitos**, ordenados por `prioridade` (maior primeiro), depois `pontos` (maior primeiro),
    depois `id` (ordem de texto simples).
44. `pontos` = soma dos `pontos` dos `itens`; `esforco` = soma dos `esforco` dos `itens`.
45. `nota` = mesma escala da regra 20, usando estes `pontos`: se algum dos `itens` é crítico → `"F"`;
    senão 0 → `"A"`, 1–15 → `"B"`, 16–35 → `"C"`, 36–59 → `"D"`, 60 ou mais → `"F"`.

```json
"plano": {
  "itens": [ { "id": "dep:datas-br@1.4.2", "pontos": 10, "esforco": 1, "prioridade": 100 } ],
  "aceitos": ["cod:FS08:index.html"],
  "excecoes_ignoradas": [ { "item": "hdr:FS09", "motivo": "vencida" } ],
  "pontos": 10, "esforco": 1, "nota": "B"
}
```

`aceitos` = ids das exceções aceitas, em ordem de texto. `excecoes_ignoradas` em ordem de `item` (texto).
Listas vazias → `[]`.

# Saída: `out/<caso>.json`

Um objeto com as 4 chaves, exatamente nestes formatos:

```json
{
  "varredura": { "achados": [ { "regra": "FS02", "arquivo": "assets/app.js", "linha": 3 } ], "pontos": 3, "nota": "B" },
  "dependencias": { "vulneraveis": [ { "pacote": "...", "versao": "...", "avisos": ["..."], "severidade": "...", "caminho": ["..."], "correcao": "..." , "navegador": true } ] },
  "sessao": { "cookies": [ { "nome": "...", "dominio": "...", "caminho": "/", "problemas": [] } ] },
  "plano": { "itens": [ { "id": "...", "pontos": 0, "esforco": 0, "prioridade": 0 } ], "aceitos": [], "excecoes_ignoradas": [], "pontos": 0, "esforco": 0, "nota": "A" }
}
```

Números são inteiros. `nota` é uma de `"A"`, `"B"`, `"C"`, `"D"`, `"F"`. `correcao` é texto ou `null`.
Cada etapa é corrigida separadamente: uma etapa errada não zera as outras, mas um erro da etapa 1–3 muda o `plano`.
