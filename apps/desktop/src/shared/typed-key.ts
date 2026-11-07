// Raccourcis de ponctuation, quelle que soit la disposition du clavier.
//
// react-hotkeys-hook 4.6.2 accepte un appui si la touche physique (`code`) OU
// le caractère (`key`) correspond. Pour la ponctuation, seul le code physique
// fonctionne : `"mod+comma"` attend le code `Comma`. Sur AZERTY, la touche « , »
// a le code `KeyM`, et le code `Comma` donne « ; ». Résultat : `Ctrl+,` ne fait
// rien et `Ctrl+;` ouvre les paramètres.
//
// On écoute donc les codes physiques possibles du caractère (QWERTY et AZERTY),
// et on écarte l'appui dont le caractère tapé n'est pas le bon (`ignoreEventWhen`
// de react-hotkeys-hook).

type TypedKeyEvent = Pick<KeyboardEvent, "key">;

// Le caractère réellement tapé (`event.key`) est-il celui du raccourci ?
export function matchesTypedKey(event: TypedKeyEvent, expected: string) {
  return event.key.toLowerCase() === expected.toLowerCase();
}

// À passer à `useHotkeys` : ignore l'appui si le caractère tapé diffère.
export function ignoreUnlessTyped(expected: string | undefined) {
  if (expected === undefined) {
    return undefined;
  }

  return (event: TypedKeyEvent) => !matchesTypedKey(event, expected);
}
