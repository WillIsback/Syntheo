// Listes de mots du rapprochement notes / compte rendu (note-attribution.ts),
// sans accents ni majuscules (comparées après normalisation).

const words = (list: string) => list.trim().split(/\s+/);

/**
 * Mots vides français et anglais, ignorés dans la comparaison, civilités
 * comprises (« Mme Kowalczyk » et « Ms Kowalczyk » désignent le même nom).
 */
export const STOPWORDS: ReadonlySet<string> = new Set(
  words(`
    a afin ai aie ainsi alors as au aucun aussi autre aux avait avant avec
    avez avoir avons bien c ca car ce ceci cela celle celui ces cet cette chez
    comme d dans de des deja doit doivent donc dont du elle elles en encore
    entre est et ete etre eu faire fait faut il ils j je l la le les leur leurs
    lui m ma mais me meme mes moi mon n ne nos notre nous on ont ou par pas
    peu peut plus pour qu quand que quel quelle qui s sa sans se sera seront
    ses si son sont sous sur t ta te tes toi ton tous tout toute toutes tres
    tu un une va vers via vont vos votre vous y
    mme mmes mlle mr mrs ms dr
    about after all also an and any are at be been before being but by can
    could did do does for from had has have he her his how i if in into is it
    its may more must no not of or our out she should so some than that the
    their them then there these they this those to too up very was we were
    what when which who will with would you your
  `),
);

/**
 * Terminaisons retirées par la racinisation légère (pluriels, féminins,
 * quelques suffixes verbaux et nominaux FR/EN), de la plus longue à la plus
 * courte.
 */
export const SUFFIXES: readonly string[] = words(`
  issements issement ements ations ement ation ments ances ences ables istes
  euses ment ance ence able iste eurs euse ives ings eur ive ing ees ee es ed
  er ez s x e
`);

/** Abréviations suivies d'un point qui ne terminent pas une phrase. */
export const ABBREVIATIONS: ReadonlySet<string> = new Set(
  words("cf dr env etc ex mme mlle mr mrs ms no p pp st vs"),
);
