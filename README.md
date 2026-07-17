# Syntheo

Plateforme de transcription audio avec gestion de sessions, diarisation des intervenants et export des comptes-rendus.

Construite avec **Next.js 16**, **Auth.js**, **PostgreSQL** et **DrizzleORM**. La transcription est déléguée à une instance [WhisperX](https://github.com/m-bain/whisperX) auto-hébergée.

---

## Prérequis

- Node.js 20+
- Docker (pour PostgreSQL local)
- Une instance WhisperX accessible en HTTP

---

## Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/WillIsback/Syntheo.git
cd Syntheo

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer .env et renseigner les valeurs (voir ci-dessous)
```

### Variables d'environnement (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL |
| `AUTH_SECRET` | Secret Auth.js — générer avec `openssl rand -base64 32` |
| `AUTH_URL` | URL publique de l'app (ex. `http://localhost:3000`) |
| `WHISPERX_BASE_URL` | URL de l'API WhisperX (ex. `http://localhost:30000/asr/v1`) |
| `WHISPERX_API_KEY` | Clé d'accès à l'API WhisperX si protégée |
| `S3_ENDPOINT` | URL du stockage S3-compatible (MinIO) pour l'upload direct des fichiers audio |
| `S3_BUCKET` | Nom du bucket d'upload |
| `S3_ACCESS_KEY` | Clé d'accès S3 |
| `S3_SECRET_KEY` | Clé secrète S3 |
| `S3_REGION` | Région S3 (optionnel, défaut `us-east-1` — sans effet réel sur MinIO) |

---

## Mise en service

### 1. Démarrer la base de données

```bash
npm run db:up
```

### 2. Initialiser le schéma

```bash
npm run db:init
```

### 3. Appliquer les migrations Drizzle

```bash
npm run db:migrate
```

### 4. Créer un compte administrateur

```bash
npm run db:seed-user
# Crée dev@syntheo.local / changeme123 par défaut
# Surcharger via les variables DEV_SEED_* dans .env
```

### 5. Lancer l'application

```bash
npm run dev
# → http://localhost:3000
```

---

## Commandes utiles

```bash
npm run dev               # Serveur de développement
npm run build             # Build de production
npm run start             # Serveur de production
npm run db:up             # Démarrer PostgreSQL (Docker)
npm run db:down           # Arrêter PostgreSQL
npm run db:migrate        # Appliquer les migrations
npm run db:drizzle:studio # Interface Drizzle Studio
```

---

## Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | Auth.js v5 (Credentials provider) |
| Base de données | PostgreSQL + DrizzleORM |
| Transcription | WhisperX (API HTTP) |
| UI | React 19 + Tailwind CSS v4 |
| Typage | TypeScript 5 |
