import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Format only: field names and value types of out/<caso>.json. The values are graded by the hidden tests.
type Schema = { types: string[]; required?: boolean; keys?: Record<string, Schema>; values?: Schema; items?: Schema };

const kind = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function check(value: unknown, s: Schema, path: string, errors: string[]) {
  const k = kind(value);
  if (!s.types.includes("any") && !s.types.includes(k)) return void errors.push(`${path}: esperado ${s.types.join(" | ")}, veio ${k}`);
  if (k === "object" && s.values) for (const [key, val] of Object.entries(value as object)) check(val, s.values, `${path}.${key}`, errors);
  if (k === "object" && s.keys) {
    const obj = value as Record<string, unknown>;
    for (const [key, sub] of Object.entries(s.keys)) {
      if (key in obj) check(obj[key], sub, `${path}.${key}`, errors);
      else if (sub.required) errors.push(`${path}.${key}: campo faltando`);
    }
    for (const key of Object.keys(obj)) if (!(key in s.keys)) errors.push(`${path}.${key}: campo que não existe no formato`);
  }
  if (k === "array" && s.items) (value as unknown[]).forEach((item, i) => check(item, s.items!, `${path}[${i}]`, errors));
}

const STAGES: Record<string, Schema> = {
  "varredura": {
    "types": [
      "object"
    ],
    "keys": {
      "achados": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "object"
          ],
          "keys": {
            "regra": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "arquivo": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "linha": {
              "required": true,
              "types": [
                "number"
              ]
            }
          }
        }
      },
      "pontos": {
        "required": true,
        "types": [
          "number"
        ]
      },
      "nota": {
        "required": true,
        "types": [
          "string"
        ]
      }
    }
  },
  "dependencias": {
    "types": [
      "object"
    ],
    "keys": {
      "vulneraveis": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "object"
          ],
          "keys": {
            "pacote": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "versao": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "avisos": {
              "required": true,
              "types": [
                "array"
              ],
              "items": {
                "types": [
                  "string"
                ]
              }
            },
            "severidade": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "caminho": {
              "required": true,
              "types": [
                "array"
              ],
              "items": {
                "types": [
                  "string"
                ]
              }
            },
            "correcao": {
              "required": true,
              "types": [
                "null",
                "string"
              ]
            },
            "navegador": {
              "required": true,
              "types": [
                "boolean"
              ]
            }
          }
        }
      }
    }
  },
  "sessao": {
    "types": [
      "object"
    ],
    "keys": {
      "cookies": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "object"
          ],
          "keys": {
            "nome": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "dominio": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "caminho": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "problemas": {
              "required": true,
              "types": [
                "array"
              ],
              "items": {
                "types": [
                  "string"
                ]
              }
            }
          }
        }
      }
    }
  },
  "plano": {
    "types": [
      "object"
    ],
    "keys": {
      "itens": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "object"
          ],
          "keys": {
            "id": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "pontos": {
              "required": true,
              "types": [
                "number"
              ]
            },
            "esforco": {
              "required": true,
              "types": [
                "number"
              ]
            },
            "prioridade": {
              "required": true,
              "types": [
                "number"
              ]
            }
          }
        }
      },
      "aceitos": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "string"
          ]
        }
      },
      "excecoes_ignoradas": {
        "required": true,
        "types": [
          "array"
        ],
        "items": {
          "types": [
            "object"
          ],
          "keys": {
            "item": {
              "required": true,
              "types": [
                "string"
              ]
            },
            "motivo": {
              "required": true,
              "types": [
                "string"
              ]
            }
          }
        }
      },
      "pontos": {
        "required": true,
        "types": [
          "number"
        ]
      },
      "esforco": {
        "required": true,
        "types": [
          "number"
        ]
      },
      "nota": {
        "required": true,
        "types": [
          "string"
        ]
      }
    }
  }
};

const CASOS = ["exemplo-1","exemplo-2","exemplo-3","exemplo-4","exemplo-5"];

describe("formato da saída", () => {
  for (const caso of CASOS) {
    for (const [etapa, schema] of Object.entries(STAGES)) {
      it(`${caso} · ${etapa}`, () => {
        const file = `out/${caso}.json`;
        expect(existsSync(file), `${file} não existe`).toBe(true);
        const out = JSON.parse(readFileSync(file, "utf8"));
        expect(out, `${file} sem a chave "${etapa}"`).toHaveProperty(etapa);
        const errors: string[] = [];
        check(out[etapa], schema, etapa, errors);
        expect(errors).toEqual([]);
      });
    }
  }
});
