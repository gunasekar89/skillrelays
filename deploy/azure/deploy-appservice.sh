#!/usr/bin/env bash
# Deploy SkillRelays (web app + API in one Python app) to Azure App Service.
#
# Usage: deploy/azure/deploy-appservice.sh [env-file]
#   env-file  optional file with AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
#
# Optional overrides: RESOURCE_GROUP, LOCATION, APP_NAME, SKU (default B1)
# Requires: az (logged in), node/npm, zip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-}"
if [[ -n "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

RESOURCE_GROUP="${RESOURCE_GROUP:-$(az group list --query '[0].name' -o tsv)}"
LOCATION="${LOCATION:-$(az group show -n "$RESOURCE_GROUP" --query location -o tsv)}"
APP_NAME="${APP_NAME:-skillrelays-demo-$RANDOM}"
SKU="${SKU:-B1}"
echo "Resource group: $RESOURCE_GROUP ($LOCATION) · App: $APP_NAME · SKU: $SKU"

echo "Building the web app..."
(cd "$ROOT/apps/web" && npm install --no-audit --no-fund && npm run build)

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$ROOT/apps/api/app" "$STAGE/app"
cp "$ROOT/apps/api/requirements.txt" "$STAGE/"
cp -R "$ROOT/apps/web/dist" "$STAGE/static"
find "$STAGE" -name '__pycache__' -prune -exec rm -rf {} +
(cd "$STAGE" && zip -qr app.zip app static requirements.txt)

echo "Creating the App Service plan and app..."
az appservice plan create -g "$RESOURCE_GROUP" -n "$APP_NAME-plan" -l "$LOCATION" --is-linux --sku "$SKU" -o none
az webapp create -g "$RESOURCE_GROUP" -p "$APP_NAME-plan" -n "$APP_NAME" --runtime "PYTHON:3.12" -o none
az webapp config set -g "$RESOURCE_GROUP" -n "$APP_NAME" -o none \
  --startup-file "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

SETTINGS=(SCM_DO_BUILD_DURING_DEPLOYMENT=true WEBSITES_PORT=8000)
if [[ -n "${AZURE_OPENAI_ENDPOINT:-}" && -n "${AZURE_OPENAI_API_KEY:-}" ]]; then
  SETTINGS+=(AI_PROVIDER=azure "AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT" "AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY"
    "AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT:-gpt-4o-mini}")
else
  echo "No Azure OpenAI settings found: the site will run with simulated answers."
fi
az webapp config appsettings set -g "$RESOURCE_GROUP" -n "$APP_NAME" --settings "${SETTINGS[@]}" -o none

echo "Uploading (the first deploy installs Python packages and takes a few minutes)..."
az webapp deploy -g "$RESOURCE_GROUP" -n "$APP_NAME" --src-path "$STAGE/app.zip" --type zip -o none

URL="https://$(az webapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" --query defaultHostName -o tsv)"
echo "Waiting for the site to start..."
for _ in $(seq 1 30); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then break; fi
  sleep 10
done
curl -fsS "$URL/api/health" && echo
echo "Live at: $URL"
echo "To remove it later: az webapp delete -g $RESOURCE_GROUP -n $APP_NAME && az appservice plan delete -g $RESOURCE_GROUP -n $APP_NAME-plan -y"
