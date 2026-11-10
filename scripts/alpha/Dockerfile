# Environnement de build des alphas Linux, identique au runner Linux de
# .github/workflows/release.yml : Ubuntu 24.04 (WebKitGTK 2.52, sans
# l'« Error 71 » de l'issue 555), dépendances de install_desktop_deps
# (scripts/setup-linux-tauri.sh et setup-linux-others.sh), Node de pnpm_install,
# pnpm de packageManager et toolchain Rust de rust-toolchain.toml.
#
# Construit et utilisé par `scripts/build-alpha.sh --docker` : les versions
# arrivent en arguments, lues dans le dépôt, et l'étiquette de l'image en dérive
# (une nouvelle toolchain ou un nouveau Node reconstruit l'image). Les caches
# (cargo, pnpm, ort, linuxdeploy, target/) sont des volumes de l'hôte, pas des
# couches de l'image.
FROM ubuntu:24.04

# Toute commande d'une chaîne qui échoue doit faire échouer la construction.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG RUST_TOOLCHAIN
ARG RUST_COMPONENTS=clippy,rustfmt
ARG NODE_VERSION
# Somme de l'archive Node, figée par version dans scripts/build-alpha.sh.
ARG NODE_SHA256
ARG PNPM_VERSION
# rustup-init figé et vérifié, comme dans scripts/alpha/install-windows-toolchain.ps1.
ARG RUSTUP_VERSION=1.29.3
ARG RUSTUP_SHA256=b1c8cb14e30889e7e2999e6b69e62d9e9b9ffc0f4df8180564d306d9680e6c55

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    PATH=/opt/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Les scripts du dépôt passent par sudo, comme sur les runners GitHub.
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends sudo ca-certificates curl git xz-utils jq \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/bash-guard.sh scripts/setup-linux-tauri.sh scripts/setup-linux-others.sh /tmp/setup/
RUN bash /tmp/setup/setup-linux-tauri.sh > /dev/null \
    && bash /tmp/setup/setup-linux-others.sh > /dev/null \
    && rm -rf /var/lib/apt/lists/* /tmp/setup

# Node : même version que .github/actions/pnpm_install, archive vérifiée avant
# extraction ; pnpm : packageManager.
RUN : "${NODE_SHA256:?NODE_SHA256 manquant}" \
    && curl -fsSL -o /tmp/node.tar.xz \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c --quiet - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && npm install -g "pnpm@${PNPM_VERSION}" > /dev/null \
    && npm cache clean --force > /dev/null

# Rust : toolchain du dépôt, installée une fois pour toutes dans l'image. Le
# build tourne avec l'UID de l'hôte : RUSTUP_HOME reste lisible par tous, et
# CARGO_HOME (registre, git) pointe à l'exécution vers un cache de l'hôte.
RUN curl -fsSL -o /tmp/rustup-init \
      "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init" \
    && echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c --quiet - \
    && chmod +x /tmp/rustup-init \
    && CARGO_HOME=/opt/cargo /tmp/rustup-init -y --no-modify-path --profile minimal \
      --default-toolchain "${RUST_TOOLCHAIN}" -c "${RUST_COMPONENTS}" > /dev/null \
    && rm /tmp/rustup-init \
    && chmod -R a+rX /opt/rustup /opt/cargo

# Utilisateur par défaut non root. build-alpha.sh lance le conteneur avec
# `--user $(id -u):$(id -g)`, qui le remplace : les fichiers produits restent à
# l'utilisateur de l'hôte.
RUN useradd --system --create-home --home-dir /home/syntheo syntheo
USER syntheo

WORKDIR /work
