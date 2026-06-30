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
      role_id_file_path   = "/run/secrets/vault_keycloak_role_id"
      secret_id_file_path = "/run/secrets/vault_keycloak_secret_id"
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
{{ with secret "secret/data/syntheo/keycloak" -}}
KEYCLOAK_ADMIN={{ .Data.data.admin_user }}
KEYCLOAK_ADMIN_PASSWORD={{ .Data.data.admin_password }}
KC_DB_PASSWORD={{ .Data.data.db_password }}
{{- end }}
EOT
  destination = "/run/vault/keycloak.env"
}
