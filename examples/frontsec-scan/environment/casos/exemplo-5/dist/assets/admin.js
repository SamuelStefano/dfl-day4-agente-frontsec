import { conectar } from "./vendor/editor-55aa.js";

const CHAVES = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoiY3Vyc29zLWlwZSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc5MDAwMDAwMCwiZXhwIjoyMTA1MDAwMDAwfQ.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS02", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoiY3Vyc29zLWlwZSIsInJvbGUiOiJ1c3VhcmlvIiwic3ViIjoiYWx1bm8tNzciLCJpYXQiOjE3OTAwMDAwMDAsImV4cCI6MjEwNTAwMDAwMH0.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS04"];
const PAR = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoiY3Vyc29zLWlwZSIsInJvbGUiOiJzZXJ2aWRvciIsImlhdCI6MTc5MDAwMDAwMCwiZXhwIjoyMTA1MDAwMDAwfQ.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS05", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGgubnV2ZW1sb2NhbC5leGFtcGxlIiwicmVmIjoiY3Vyc29zLWlwZSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzkwMDAwMDAwLCJleHAiOjIxMDUwMDAwMDB9.YXNzaW5hdHVyYS1mYWxzYS1kZS10ZXN0ZS03"];
const NVM_PUBLICA = "nvm_pub_7d2e9a4c1b8f3065e2a7c9d4b1f83a60";
const NVM_BACKUP = "nvm_sec_0b7c4e1a9d3f6285c0e8a4d2f9b17c35";

export function painel(out) {
  const q = location.search;
  out.innerHTML = q;
  if (out.innerHTML === location.hash) { return; }
  out.innerHTML = "<b>Painel</b>"; out.textContent = location.href;
  document.write(window.name);
  sessionStorage.setItem("access_token", CHAVES[1]);
  return conectar(PAR, NVM_PUBLICA, NVM_BACKUP);
}
