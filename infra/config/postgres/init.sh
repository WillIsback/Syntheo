#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE keycloak_db;
    CREATE DATABASE mlflow_db;
    CREATE ROLE keycloak WITH LOGIN PASSWORD '${KEYCLOAK_DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "syntheo_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "mlflow_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL
