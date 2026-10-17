Faça a auditoria de segurança frontend completa de cada site, para cada caso em `casos/`.

Para cada pasta `casos/<caso>/`, use `dist/` (todos os `.js` e `.html`, inclusive subpastas), `headers.json`, `lock.json`, `avisos.json`, `sessao.json` e `excecoes.json`, e escreva `out/<caso>.json` com as 4 etapas: `varredura`, `dependencias`, `sessao` e `plano`.
As regras de cada etapa e o formato exato da saída estão no `README.md`. Siga as regras à risca: decodifique os JWT, resolva os pacotes como o Node, compare versões numericamente, leia os cookies como o navegador (caminho padrão, Max-Age antes de Expires), junte o que tem a mesma causa, aplique as exceções pela data e use as fórmulas e ordenações exatas.
Vale a pena escrever um script. Escreva só em `out/`. Não edite `tests/`, `casos/`, `README.md` nem `package*.json`.
