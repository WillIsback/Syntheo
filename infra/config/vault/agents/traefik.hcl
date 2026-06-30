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
      role_id_file_path   = "/run/secrets/vault_traefik_role_id"
      secret_id_file_path = "/run/secrets/vault_traefik_secret_id"
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
  contents    = "{{ with secret \"secret/data/syntheo/traefik\" }}{{ .Data.data.bouncer_key }}{{ end }}"
  destination = "/run/vault/CROWDSEC_BOUNCER_KEY"
}

template {
  contents    = "{{ with secret \"secret/data/syntheo/traefik\" }}{{ .Data.data.dashboard_htpasswd }}{{ end }}"
  destination = "/run/vault/traefik_htpasswd"
}
