export function retrieval(termo) {
  return fetch("/api/busca?q=" + encodeURIComponent(termo));
}

export function iniciarBusca() {
  document.title = "Busca: " + location.search;
  const resposta = retrieval(location.search.slice(3));
  const versao = new Function("return 42");
  return [resposta, versao()];
}
