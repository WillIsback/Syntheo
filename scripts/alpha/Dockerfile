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

# Un `curl | tar` ou `curl | sh` qui échoue doit faire échouer la construction.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG RUST_TOOLCHAIN
ARG RUST_COMPONENTS=clippy,rustfmt
ARG NODE_VERSION
ARG PNPM_VERSION

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

# Node : même version que .github/actions/pnpm_install ; pnpm : packageManager.
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 \
    && npm install -g "pnpm@${PNPM_VERSION}" > /dev/null \
    && npm cache clean --force > /dev/null

# Rust : toolchain du dépôt, installée une fois pour toutes dans l'image. Le
# build tourne avec l'UID de l'hôte : RUSTUP_HOME reste lisible par tous, et
# CARGO_HOME (registre, git) pointe à l'exécution vers un cache de l'hôte.
RUN curl -fsSL https://sh.rustup.rs \
    | CARGO_HOME=/opt/cargo sh -s -- -y --no-modify-path --profile minimal \
      --default-toolchain "${RUST_TOOLCHAIN}" -c "${RUST_COMPONENTS}" > /dev/null \
    && chmod -R a+rX /opt/rustup /opt/cargo

WORKDIR /work
