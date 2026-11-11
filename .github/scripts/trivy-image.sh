#!/usr/bin/env bash
# Scan Trivy d'une image du service de transcription (issue 573).
# Usage : trivy-image.sh <image> <docker|remote>
# Binaire épinglé (TRIVY_VERSION, défaut 0.76.0 comme ci-security.yml) et
# vérifié par empreinte SHA-256. Rapport HIGH/CRITICAL complet ; échec sur une
# vulnérabilité CRITICAL corrigée en amont.
set -euo pipefail

image=$1
source=$2
version=${TRIVY_VERSION:-0.76.0}
[ "$version" = "0.76.0" ] || { echo "Empreintes connues pour Trivy 0.76.0 seulement" >&2; exit 1; }

case "$(uname -m)" in
  x86_64) asset=Linux-64bit; sum=e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7 ;;
  aarch64) asset=Linux-ARM64; sum=aab21e677a7b7071fc79f1711480840754c18a1b9d9cefa7ccd06af63a0e8f4c ;;
  *) echo "Architecture non prise en charge : $(uname -m)" >&2; exit 1 ;;
esac

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL \
  "https://github.com/aquasecurity/trivy/releases/download/v${version}/trivy_${version}_${asset}.tar.gz" \
  -o "$dir/trivy.tar.gz"
echo "${sum}  $dir/trivy.tar.gz" | sha256sum --check --strict -
tar -xzf "$dir/trivy.tar.gz" -C "$dir" trivy

common=(image --image-src "$source" --scanners vuln --no-progress --skip-version-check --timeout 30m)
if [ -f .trivyignore ]; then
  common+=(--ignorefile .trivyignore)
fi
"$dir/trivy" "${common[@]}" --severity HIGH,CRITICAL --exit-code 0 "$image"
"$dir/trivy" "${common[@]}" --severity CRITICAL --ignore-unfixed --exit-code 1 "$image"
