# Politique de sécurité

## Versions maintenues

Seule la dernière release reçoit des correctifs de sécurité.

## Signaler une vulnérabilité

N'ouvrez pas d'issue publique. Utilisez
[GitHub Security Advisories](https://github.com/WillIsback/Syntheo/security/advisories/new)
en décrivant le problème, son impact et un moyen de le reproduire.

## Périmètre

Syntheo Desktop ne communique qu'avec les endpoints d'inférence et les webhooks
configurés par l'utilisateur, plus les flux documentés dans
[Données et confidentialité](docs/fr/data-and-privacy.mdx) : recherche de mises
à jour et téléchargement de l'installeur sur GitHub et, à la demande de
l'utilisateur, modèles de la transcription sur le poste (GitHub, Hugging Face
ou miroir de l'organisation). Une image distante dans un contenu généré
n'est jamais chargée. Il ne conserve jamais l'audio. Toute autre
communication réseau, ou toute écriture d'audio sur disque, est considérée
comme une vulnérabilité.
