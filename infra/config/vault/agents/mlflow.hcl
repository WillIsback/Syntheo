vault {
  address = "http://vault:8200"
}
auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/run/secrets/vault_mlflow_role_id"
      secret_id_file_path = "/run/secrets/vault_mlflow_secret_id"
    }
  }
  sink "file" { config = { path = "/tmp/.vault-token" } }
}
template {
  contents    = "{{ with secret \"secret/data/syntheo/mlflow\" }}{{ .Data.data.db_password }}{{ end }}"
  destination = "/run/vault/MLFLOW_DB_PASSWORD"
}
