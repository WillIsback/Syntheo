#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "${SCRIPT_DIR}")"
if [ -f "${INFRA_DIR}/../.env" ]; then
  set -a; source "${INFRA_DIR}/../.env"; set +a
fi

echo "This will remove all Syntheo stacks. Data volumes are NOT deleted."
read -rp "Type 'yes' to confirm: " CONFIRM
[ "${CONFIRM}" = "yes" ] || { echo "Aborted."; exit 0; }

for stack in syntheo-app syntheo-obs syntheo-data syntheo-core; do
  if docker stack ls --format '{{.Name}}' | grep -q "^${stack}$"; then
    echo "Removing ${stack}..."
    docker stack rm "${stack}"
  else
    echo "${stack} not deployed — skipping"
  fi
done

echo "Waiting for services to stop..."
sleep 10
docker service ls
echo "Teardown complete. Run swarm-init.sh + deploy.sh to redeploy."
