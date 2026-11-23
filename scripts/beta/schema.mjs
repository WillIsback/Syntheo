// Validateur JSON Schema minimal pour l'export de mesure (issue 673).
//
// Il ne couvre que les mots-clés effectivement utilisés par
// crates/mesure/schema/export-v1.json. Un mot-clé inconnu dans le schéma fait
// échouer la compilation : si le schéma évolue, ce validateur refuse de
// travailler plutôt que d'ignorer une contrainte en silence.
//
// En cas d'échec, il ne rend que le nom du mot-clé du schéma qui a échoué,
// jamais un chemin ni une valeur venant du fichier validé.

const ANNOTATIONS = new Set(["$schema", "$id", "title", "description"]);
const KEYWORDS = new Set([
  ...ANNOTATIONS,
  "$defs",
  "$ref",
  "type",
  "additionalProperties",
  "required",
  "properties",
  "const",
  "enum",
  "pattern",
  "minimum",
  "maximum",
  "maxItems",
  "items",
  "oneOf",
]);
const TYPES = new Set([
  "object",
  "array",
  "string",
  "integer",
  "boolean",
  "null",
]);

function fail(message) {
  throw new Error(`schéma non pris en charge : ${message}`);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Compile le schéma en une fonction `(valeur) => null | motCle`.
export function compileSchema(root) {
  const defs = isPlainObject(root.$defs) ? root.$defs : {};
  const compiled = new Map();

  function resolveRef(ref) {
    const match = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
    if (!match || !Object.hasOwn(defs, match[1])) fail(`$ref ${ref}`);
    return match[1];
  }

  function compile(node) {
    if (!isPlainObject(node)) fail("nœud qui n'est pas un objet");
    for (const key of Object.keys(node)) {
      if (!KEYWORDS.has(key)) fail(`mot-clé ${key}`);
    }
    const checks = [];

    if (node.$ref !== undefined) {
      const name = resolveRef(node.$ref);
      checks.push((value) => compiled.get(name)(value));
    }
    if (node.type !== undefined) {
      if (!TYPES.has(node.type)) fail(`type ${String(node.type)}`);
      const type = node.type;
      checks.push((value) => (typeOf(value) === type ? null : "type"));
    }
    if (node.const !== undefined) {
      const expected = node.const;
      if (typeof expected === "object" && expected !== null) fail("const");
      checks.push((value) => (value === expected ? null : "const"));
    }
    if (node.enum !== undefined) {
      if (!Array.isArray(node.enum)) fail("enum");
      const allowed = node.enum;
      checks.push((value) => (allowed.includes(value) ? null : "enum"));
    }
    if (node.pattern !== undefined) {
      const regex = new RegExp(node.pattern, "u");
      checks.push((value) =>
        typeof value !== "string" || regex.test(value) ? null : "pattern",
      );
    }
    if (node.minimum !== undefined) {
      const min = node.minimum;
      checks.push((value) =>
        typeof value !== "number" || value >= min ? null : "minimum",
      );
    }
    if (node.maximum !== undefined) {
      const max = node.maximum;
      checks.push((value) =>
        typeof value !== "number" || value <= max ? null : "maximum",
      );
    }
    if (node.maxItems !== undefined) {
      const max = node.maxItems;
      checks.push((value) =>
        !Array.isArray(value) || value.length <= max ? null : "maxItems",
      );
    }
    if (node.items !== undefined) {
      const item = compile(node.items);
      checks.push((value) => {
        if (!Array.isArray(value)) return null;
        for (const element of value) {
          const error = item(element);
          if (error) return error;
        }
        return null;
      });
    }
    if (node.required !== undefined) {
      if (!Array.isArray(node.required)) fail("required");
      const required = node.required;
      checks.push((value) => {
        if (!isPlainObject(value)) return null;
        for (const key of required) {
          if (!Object.hasOwn(value, key)) return "required";
        }
        return null;
      });
    }
    const properties = new Map();
    if (node.properties !== undefined) {
      if (!isPlainObject(node.properties)) fail("properties");
      for (const [key, sub] of Object.entries(node.properties)) {
        properties.set(key, compile(sub));
      }
      checks.push((value) => {
        if (!isPlainObject(value)) return null;
        for (const [key, check] of properties) {
          if (!Object.hasOwn(value, key)) continue;
          const error = check(value[key]);
          if (error) return error;
        }
        return null;
      });
    }
    if (node.additionalProperties !== undefined) {
      if (node.additionalProperties !== false) fail("additionalProperties");
      checks.push((value) => {
        if (!isPlainObject(value)) return null;
        for (const key of Object.keys(value)) {
          if (!properties.has(key)) return "additionalProperties";
        }
        return null;
      });
    }
    if (node.oneOf !== undefined) {
      if (!Array.isArray(node.oneOf)) fail("oneOf");
      const branches = node.oneOf.map(compile);
      checks.push((value) => {
        let matches = 0;
        for (const branch of branches) if (branch(value) === null) matches++;
        return matches === 1 ? null : "oneOf";
      });
    }

    return (value) => {
      for (const check of checks) {
        const error = check(value);
        if (error) return error;
      }
      return null;
    };
  }

  for (const name of Object.keys(defs)) compiled.set(name, null);
  for (const [name, node] of Object.entries(defs)) {
    compiled.set(name, compile(node));
  }
  const { $defs: _defs, ...rest } = root;
  return compile(rest);
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}
