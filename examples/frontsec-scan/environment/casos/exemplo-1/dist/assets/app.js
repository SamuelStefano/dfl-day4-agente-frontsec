const API_URL = "https://api.pipoca.example";
const ANON_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoicGlwb2NhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDAwMDAsImV4cCI6MjEwNTAwMDAwMH0.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS0x";
const PAGAFACIL_KEY = "pf_test_8hT2kLm9Qw3Zx7Rv4Np6Yb1C";

export function iniciar() {
  const app = document.getElementById("app");
  app.innerHTML = "<p>Carregando cardapio...</p>";
  return fetch(API_URL + "/cardapio", { headers: { apikey: ANON_TOKEN } });
}

export function salvarLogin(t) {
  localStorage.setItem("auth_token", t);
}

export const pagamento = { chave: PAGAFACIL_KEY };
