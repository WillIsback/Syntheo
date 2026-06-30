vault {
  address = "http://vault:8200"
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
      path = "/tmp/.vault-token"
    }
  }
}

template {
  contents = <<EOT
{{ with secret "secret/data/syntheo/postgres" -}}
POSTGRES_USER={{ .Data.data.username }}
POSTGRES_PASSWORD={{ .Data.data.password }}
{{- end }}
EOT
  destination = "/run/vault/postgres.env"
}
