vault {
  address = "https://vault:8200"
  tls {
    tls_skip_verify = true
  }
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_postgres_role_id"
      secret_id_file_path = "/run/secrets/vault_postgres_secret_id"
    }
  }
  sink "file" {
    config = {
      path  = "/run/vault/.vault-token"
      perms = "0600"
    }
  }
}

template {
  contents = <<EOT
{{ with secret "secret/data/syntheo/postgres" -}}
POSTGRES_USER={{ .Data.data.username }}
POSTGRES_PASSWORD={{ .Data.data.password }}
KEYCLOAK_DB_PASSWORD={{ .Data.data.keycloak_db_password }}
MLFLOW_DB_PASSWORD={{ .Data.data.mlflow_db_password }}
{{- end }}
EOT
  destination = "/run/vault/postgres.env"
}
