# Notes de version

- Une note par version stable de l'app : `desktop/<major>.<minor>.<patch>.md`.
  Lis aussi `desktop/AGENTS.md`.
- L'app lit uniquement `desktop/<version>.md` (plugin Vite
  `apps/desktop/plugins/changelog.ts` pour le bundle, `apps/desktop/src/changelog/source.ts`
  pour le téléchargement depuis `main`). Il n'existe ni copie à la racine, ni
  canal nightly, ni app mobile.
- Garde seulement les changements visibles par l'utilisateur, en français, par
  thème. Pas de changement interne ni d'infrastructure.
- Chaque note porte un frontmatter `date` et `summary` : une phrase courte, en
  texte brut, sans markdown ni balise.

```md
---
date: "AAAA-MM-JJ"
summary: "Une phrase courte, orientée utilisateur."
---
```

# Retrouver le contenu d'une version

```bash
git tag --list 'v*' --sort=-v:refname | head
gh api repos/WillIsback/Syntheo/compare/<tag-précédent>...<tag> --jq '.commits[].commit.message'
```

# Crédit des contributeurs

Si un changement visible vient d'une PR ouverte par quelqu'un d'extérieur
(`author_association` différent de `MEMBER`, `OWNER` ou `COLLABORATOR`, et
`user.type` différent de `Bot`), remercie l'auteur à la fin de l'élément, avec
un lien vers son compte GitHub. Jamais dans `summary`.

```bash
gh api repos/WillIsback/Syntheo/pulls/<numéro> --jq '{login: .user.login, type: .user.type, association: .author_association}'
```

# Balises personnalisées

Le rendu des notes dans l'app (basé sur Streamdown) accepte des balises HTML en plus du markdown standard.

## `<banner>`

Pour une annonce, un avertissement ou un point fort.

Attributs :

- `title` (facultatif) : titre en gras en haut du bandeau.
- `variant` (facultatif) : `"warning"` pour un bandeau ambre, `"info"` pour un bandeau bleu. Par défaut : ambre.

```mdx
<banner title="Nouveau dossier de données">
Vos notes restent en place : rien à faire de votre côté.
</banner>

<banner title="Changement incompatible" variant="warning">
L'ancien format d'export n'est plus accepté. Réexportez vos notes.
</banner>
```
