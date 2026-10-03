#!/usr/bin/env bash
set -euo pipefail
helper_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$helper_root/deploy-common.sh"
[[ "$#" == 5 ]] || { deployment_fail 'Expected domain root, SHA, release ID, archive and checksum.'; exit 1; }
domain_root="$1" release_sha="$2" release_id="$3" archive="$4" expected_digest="$5"
deployment_account="$(id -un)"
validate_deployment_paths "$deployment_account" "$domain_root" 'sistema.orcaproobras.com.br' "$release_sha" "$release_id" "$archive" 'frontend'
validate_application_directory "$domain_root"
verify_artifact_digest "$archive" "$expected_digest"
python3 "$helper_root/verify-deployment-archive.py" "$archive"
[[ -d "$domain_root/public_html" && ! -L "$domain_root/public_html" ]] || { deployment_fail 'Frontend document root must be a real directory.'; exit 1; }
static_ready=false
for attempt in $(seq 1 120); do
  if [[ -f "$domain_root/public_html/.orcapro-static-root" ]] && ! grep -Eiq '^[[:space:]]*Passenger(AppRoot|AppType|StartupFile|Enabled[[:space:]]+on)' "$domain_root/public_html/.htaccess" 2>/dev/null; then static_ready=true; break; fi
  sleep 5
done
[[ "$static_ready" == true ]] || { deployment_fail 'The frontend has not been converted to a static managed application.'; exit 1; }
release_root="$domain_root/hbuilds/manual-web/github-${release_id}"
[[ ! -e "$release_root" && ! -L "$release_root" ]] || { deployment_fail 'Immutable frontend release already exists.'; exit 1; }
mkdir -p "$domain_root/hbuilds/manual-web"
mkdir -m 700 "$release_root"
mkdir -m 755 "$release_root/public_html"
tar --extract --gzip --file "$archive" --directory "$release_root/public_html" --no-same-owner --no-same-permissions
[[ "$(cat "$release_root/public_html/hostinger-release-sha.txt")" == "$release_sha" && -f "$release_root/public_html/login/index.html" ]] || { deployment_fail 'Frontend artifact does not match the selected release.'; exit 1; }
python3 - "$release_root/public_html/orcapro-legacy/manifest.json" <<'PYTHON'
import json, sys
with open(sys.argv[1], encoding='utf-8') as source:
    if json.load(source).get('apiBase') != 'https://api.orcaproobras.com.br/api/v1':
        sys.exit('Frontend cloud editor points outside the production API')
PYTHON
printf '%s\n' 'OrçaPro static document root' > "$release_root/public_html/.orcapro-static-root"
cat > "$release_root/public_html/.htaccess" <<'HTACCESS'
Options -Indexes
DirectoryIndex index.html
<FilesMatch "^\.">
  Require all denied
</FilesMatch>
HTACCESS
previous_root="$domain_root/hbuilds/manual-web/previous-${release_id}"
[[ ! -e "$previous_root" && ! -L "$previous_root" ]] || { deployment_fail 'Previous frontend backup path already exists.'; exit 1; }
restore_document_root() {
  local status="$?"
  if [[ "$status" != 0 && -d "$previous_root" && ! -e "$domain_root/public_html" ]]; then mv "$previous_root" "$domain_root/public_html"; fi
  exit "$status"
}
trap restore_document_root EXIT
mv "$domain_root/public_html" "$previous_root"
mv "$release_root/public_html" "$domain_root/public_html"
trap - EXIT
recycle_application_processes "$deployment_account" 'sistema.orcaproobras.com.br'
printf 'Frontend release %s activated; previous document root preserved.\n' "$release_sha"
