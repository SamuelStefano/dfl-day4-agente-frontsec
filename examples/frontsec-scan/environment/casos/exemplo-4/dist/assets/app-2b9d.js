const ESTOQUE_URL = "https://estoque.mercadinho.example";
const ESTOQUE_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoicmVkZS1tZXJjYWRpbmhvIiwic3ViIjoicGFpbmVsLWVzdG9xdWUiLCJhdWQiOiJhcGktaW50ZXJuYSIsImlhdCI6MTc5MDAwMDAwMH0.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS01";

export function configurarPagamento(chave) {
  if (!chave) {
    throw new Error("Defina VITE_PAGAFACIL como pf_live_SUA_CHAVE_AQUI no painel");
  }
  return chave;
}

export function listarOfertas(itens) {
  const lista = document.getElementById("ofertas");
  for (const item of itens) {
    lista.innerHTML += "<li>" + item.nome + "</li>";
  }
  return fetch(ESTOQUE_URL + "/ofertas", { headers: { Authorization: "Bearer " + ESTOQUE_TOKEN } });
}
