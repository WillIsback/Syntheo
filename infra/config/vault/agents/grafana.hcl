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
      role_id_file_path   = "/run/secrets/vault_grafana_role_id"
      secret_id_file_path = "/run/secrets/vault_grafana_secret_id"
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
  contents    = "{{ with secret \"secret/data/syntheo/grafana\" }}{{ .Data.data.admin_password }}{{ end }}"
  destination = "/run/vault/GF_SECURITY_ADMIN_PASSWORD"
}
