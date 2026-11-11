#!/usr/bin/env bash

. "$(dirname "$0")/bash-guard.sh"

set -euo pipefail

# Délais courts et nouvelles tentatives, comme setup-linux-tauri.sh.
APT_OPTS=(-o Acquire::Retries=5 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
sudo apt-get "${APT_OPTS[@]}" update
sudo apt-get "${APT_OPTS[@]}" install -y \
  clang \
  libclang-dev \
  libgtk-3-dev \
  libgtk-4-dev \
  libasound2-dev \
  libudev-dev \
  libpulse-dev \
  libpipewire-0.3-dev \
  libgraphene-1.0-dev \
  pkg-config \
  patchelf \
  xdg-utils \
  cmake \
  curl \
  jq \
  libcurl4-openssl-dev \
  unzip
