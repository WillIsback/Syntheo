const PROMISE_CHAIN_METHODS = new Set(["then", "catch", "finally"]);

// Remonte une chaîne `.then/.catch/.finally` à partir de l'appel de commande.
// La chaîne est considérée comme traitée dès qu'un maillon gère le rejet
// (`.catch(...)` ou `.then(onFulfilled, onRejected)`).
function climbPromiseChain(node) {
  let top = node;
  let handled = false;
  for (;;) {
    const member = top.parent;
    if (
      member?.type !== "MemberExpression" ||
      member.object !== top ||
      member.computed ||
      member.property.type !== "Identifier" ||
      !PROMISE_CHAIN_METHODS.has(member.property.name)
    ) {
      break;
    }
    const call = member.parent;
    if (call?.type !== "CallExpression" || call.callee !== member) {
      break;
    }
    if (
      member.property.name === "catch" ||
      (member.property.name === "then" && call.arguments.length >= 2)
    ) {
      handled = true;
    }
    top = call;
  }
  return { top, handled };
}

const awaitTauriCommands = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce await on Tauri IPC commands to prevent race conditions and freezes",
    },
    fixable: "code",
    messages: {
      missingAwait:
        "Tauri command '{{name}}' must be awaited. Unawaited IPC calls can cause race conditions and freezes.",
    },
  },
  createOnce(context) {
    let tauriCommandImports;

    return {
      before() {
        tauriCommandImports = new Set();
      },

      ImportDeclaration(node) {
        const source = node.source.value;

        const isTauriCommands =
          source.startsWith("@syntheo/plugin-") ||
          source.endsWith("/tauri.gen");

        if (isTauriCommands) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.name === "commands"
            ) {
              tauriCommandImports.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          tauriCommandImports.has(node.callee.object.name)
        ) {
          const methodName = node.callee.property.name;
          const { top, handled } = climbPromiseChain(node);
          const current = top.parent;

          if (handled) {
            return;
          }

          if (current.type === "AwaitExpression") {
            return;
          }

          if (
            current.type === "ReturnStatement" ||
            current.type === "ArrowFunctionExpression"
          ) {
            return;
          }

          if (current.type === "ArrayExpression") {
            return;
          }

          context.report({
            node,
            messageId: "missingAwait",
            data: { name: methodName },
            fix(fixer) {
              if (current.type === "ExpressionStatement") {
                const sourceCode =
                  context.sourceCode || context.getSourceCode();
                const callText = sourceCode.getText(top);
                return fixer.replaceText(top, `await ${callText}`);
              }
              return null;
            },
          });
        }
      },
    };
  },
};

const noRawTinybase = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prevent TinyBase from being reintroduced into the SQLite-backed desktop app.",
    },
    messages: {
      bannedImport:
        "TinyBase import '{{source}}' is not allowed. Use the canonical SQLite domain queries and mutations instead.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== "string") return;

        if (
          source === "tinybase" ||
          source.startsWith("tinybase/") ||
          source === "@syntheo/tinybase-utils" ||
          source.startsWith("@syntheo/tinybase-utils/") ||
          source.startsWith("~/store/tinybase/")
        ) {
          context.report({
            node,
            messageId: "bannedImport",
            data: { source },
          });
        }
      },
    };
  },
};

const plugin = {
  meta: {
    name: "syntheo",
    version: "1.0.0",
  },
  rules: {
    "await-tauri-commands": awaitTauriCommands,
    "no-raw-tinybase": noRawTinybase,
  },
};

export default plugin;
