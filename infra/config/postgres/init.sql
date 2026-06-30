-- Create additional databases for Keycloak and MLflow
CREATE DATABASE keycloak_db;
CREATE DATABASE mlflow_db;

-- Enable extensions on main db
\c syntheo_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable extensions on mlflow db
\c mlflow_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
