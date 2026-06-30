#!/bin/bash
set -e

# :'var' syntax passes values as SQL literals — psql quotes and escapes them,
# preventing SQL injection regardless of special characters in passwords.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set keycloak_pw="${KEYCLOAK_DB_PASSWORD}" \
  --set mlflow_pw="${MLFLOW_DB_PASSWORD}" <<-EOSQL
    CREATE DATABASE keycloak_db;
    CREATE DATABASE mlflow_db;
    CREATE ROLE keycloak WITH LOGIN PASSWORD :'keycloak_pw';
    GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak;
    CREATE ROLE mlflow WITH LOGIN PASSWORD :'mlflow_pw';
    GRANT ALL PRIVILEGES ON DATABASE mlflow_db TO mlflow;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "keycloak_db" <<-EOSQL
    GRANT CREATE ON SCHEMA public TO keycloak;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "mlflow_db" <<-EOSQL
    GRANT CREATE ON SCHEMA public TO mlflow;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "syntheo_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    -- Non-owner app role with least-privilege access; table owner bypasses RLS by default,
    -- so the app must connect as this role (FORCE RLS in schema.sql covers the owner too).
    CREATE ROLE app_user NOLOGIN;
    GRANT CONNECT ON DATABASE syntheo_db TO app_user;
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, transcriptions, reports TO app_user;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "mlflow_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL
