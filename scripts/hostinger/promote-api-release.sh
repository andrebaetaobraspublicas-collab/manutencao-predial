#!/usr/bin/env bash
set -euo pipefail
helper_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$helper_root/deploy-common.sh"
[[ "$#" == 5 ]] || { deployment_fail 'Expected domain root, SHA, release ID, archive and checksum.'; exit 1; }
domain_root="$1" release_sha="$2" release_id="$3" archive="$4" expected_digest="$5"
deployment_account="$(id -un)"
validate_deployment_paths "$deployment_account" "$domain_root" 'api.orcaproobras.com.br' "$release_sha" "$release_id" "$archive" 'api-source'
validate_application_directory "$domain_root"
verify_artifact_digest "$archive" "$expected_digest"
python3 "$helper_root/verify-deployment-archive.py" "$archive"
configuration="$domain_root/hbuilds/config/.env"
validate_private_api_configuration "$domain_root"
grep -Pq '^SEED_MAINTENANCE_ON_DEPLOY=(false|"false"|\x27false\x27)\r?$' "$configuration" || { deployment_fail 'Disable the maintenance seed before promotion.'; exit 1; }
if grep -Pq '^ORCAPRO_SEED_ON_DEPLOY=(true|"true"|\x27true\x27)\r?$' "$configuration"; then deployment_fail 'Disable the OrçaPro catalog seed before promotion.'; exit 1; fi
[[ -f "$domain_root/public_html/.htaccess" ]] || { deployment_fail 'Managed API routing is missing.'; exit 1; }
grep -Fq "PassengerAppRoot $domain_root/hbuilds/current/nodejs" "$domain_root/public_html/.htaccess" || { deployment_fail 'Managed API routing does not point to its current private runtime.'; exit 1; }
grep -Eq '^PassengerStartupFile[[:space:]]+main\.js[[:space:]]*$' "$domain_root/public_html/.htaccess" || { deployment_fail 'Managed API startup must use main.js.'; exit 1; }
[[ -L "$domain_root/hbuilds/current" ]] || { deployment_fail 'Managed API current pointer is not a symbolic link.'; exit 1; }
[[ "$(realpath "$domain_root/hbuilds/current")" == "$domain_root/hbuilds/versions/"* ]] || { deployment_fail 'Current API runtime is outside its managed versions directory.'; exit 1; }
release_root="$domain_root/hbuilds/versions/github-${release_id}"
[[ ! -e "$release_root" && ! -L "$release_root" ]] || { deployment_fail 'Immutable API release already exists.'; exit 1; }
mkdir -m 700 "$release_root"
mkdir -m 700 "$release_root/nodejs"
mkdir -m 755 "$release_root/public_html"
cp -p "$domain_root/public_html/.htaccess" "$release_root/public_html/.htaccess"
tar --extract --gzip --file "$archive" --directory "$release_root/nodejs" --no-same-owner --no-same-permissions
[[ ! -e "$release_root/nodejs/.env" && ! -L "$release_root/nodejs/.env" ]] || { deployment_fail 'Source artifact must not include environment secrets.'; exit 1; }
ensure_private_runtime_environment "$domain_root" "$release_root/nodejs"
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
[[ -x /opt/alt/alt-nodejs22/root/usr/bin/node ]] || { deployment_fail 'Node.js 22 runtime is unavailable.'; exit 1; }
configure_hostinger_build_resources
cd "$release_root/nodejs"
npm ci --workspace @gestaopredios/api --include-workspace-root --include=dev --no-audit --no-fund
npm run build:api
timeout --signal=TERM --kill-after=30s 600s npm run prisma:deploy -w @gestaopredios/api
printf '%s\n' "$release_sha" > apps/api/dist/release-sha.txt
cat > main.js <<'JAVASCRIPT'
const path = require('node:path');
const providerPort = process.env.PORT;
const environment = require('dotenv').config({ path: path.resolve(__dirname, '../../../config/.env'), override: true, quiet: true });
if (environment.error) throw new Error('Private API configuration could not be loaded.');
if (providerPort !== undefined) process.env.PORT = providerPort;
process.chdir(__dirname);
require('./apps/api/dist/main.js');
JAVASCRIPT
node --check main.js
[[ -f apps/api/dist/main.js && -f apps/api/dist/modules/orcapro/legacy/assets/runtime.cjs ]] || { deployment_fail 'API artifact is incomplete.'; exit 1; }
readlink "$domain_root/hbuilds/current" > "$release_root/previous-pointer.txt"
next_pointer="$domain_root/hbuilds/.current-next-${release_id}"
[[ ! -e "$next_pointer" && ! -L "$next_pointer" ]] || { deployment_fail 'Temporary API pointer already exists.'; exit 1; }
ln -s "versions/github-${release_id}" "$next_pointer"
mv -Tf "$next_pointer" "$domain_root/hbuilds/current"
recycle_application_processes "$deployment_account" 'api.orcaproobras.com.br'
printf 'API release %s activated; previous runtime preserved.\n' "$release_sha"
