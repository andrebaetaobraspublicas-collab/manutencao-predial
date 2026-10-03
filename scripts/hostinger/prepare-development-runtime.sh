#!/usr/bin/env bash
set -euo pipefail
helper_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$helper_root/deploy-common.sh"
[[ "$#" == 3 ]] || { deployment_fail 'Expected development domain, runtime and release SHA.'; exit 1; }
domain_root="$1" runtime_path="$2" release_sha="$3"
[[ "$(id -un)" == 'u296746636' && "$domain_root" == '/home/u296746636/domains/api.gestaodepredios.com.br' ]] || { deployment_fail 'Development application does not match its Hostinger account.'; exit 1; }
[[ "$release_sha" =~ ^[a-f0-9]{40}$ ]] || { deployment_fail 'Invalid development release SHA.'; exit 1; }
[[ "$runtime_path" == "$domain_root/.builds/current/nodejs" || "$runtime_path" == "$domain_root/hbuilds/current/nodejs" ]] || { deployment_fail 'Development runtime must use its managed current pointer.'; exit 1; }
ensure_private_runtime_environment "$domain_root" "$runtime_path"
runtime_root="$(realpath -e "$runtime_path")"
[[ -f "$runtime_root/apps/api/dist/main.js" && ! -L "$runtime_root/apps/api/dist/main.js" ]] || { deployment_fail 'Compiled development API is missing.'; exit 1; }
routing="$(realpath -e "$domain_root/public_html/.htaccess")"
[[ "$routing" == "$domain_root/public_html/.htaccess" || "$routing" == "${runtime_root%/nodejs}/public_html/.htaccess" ]] || { deployment_fail 'Development routing resolves outside the application.'; exit 1; }
[[ -f "$routing" && ! -L "$routing" && "$(stat -c '%u' "$routing")" == "$(id -u)" ]] || { deployment_fail 'Development routing must be a regular file owned by the account.'; exit 1; }
wrapper="$runtime_root/orcapro-hostinger-main.cjs"
wrapper_next="$(mktemp "$runtime_root/.orcapro-startup-XXXXXX")"
cleanup() { rm -f -- "$wrapper_next"; }
trap cleanup EXIT
cat > "$wrapper_next" <<'JAVASCRIPT'
'use strict';
const path=require('node:path');
const providerPort=process.env.PORT;
const loaded=require('dotenv').config({path:path.resolve(__dirname,'.env'),override:true,quiet:true});
if(loaded.error) throw new Error('Private API environment could not be loaded.');
if(providerPort!==undefined) process.env.PORT=providerPort;
process.chdir(__dirname);
require('./apps/api/dist/main.js');
JAVASCRIPT
configure_hostinger_build_resources
[[ -x /opt/alt/alt-nodejs22/root/usr/bin/node ]] || { deployment_fail 'Node.js 22 runtime is unavailable.'; exit 1; }
/opt/alt/alt-nodejs22/root/usr/bin/node --check < "$wrapper_next"
state="$(python3 - "$wrapper" "$wrapper_next" "$routing" <<'PYTHON'
import os, pathlib, re, stat, sys
wrapper, expected, routing = map(pathlib.Path, sys.argv[1:])
exists = os.path.lexists(wrapper)
if exists:
    metadata = wrapper.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid():
        sys.exit('Existing startup wrapper is not a regular account-owned file')
    normalize = lambda value: re.sub(rb'\s+', b'', value)
    if normalize(wrapper.read_bytes()) != normalize(expected.read_bytes()):
        sys.exit('Existing startup wrapper conflicts with the managed template')
data = routing.read_bytes()
directives = re.findall(rb'^[ \t]*PassengerStartupFile\b[^\n]*', data, re.M)
allowed = re.findall(rb'^[ \t]*PassengerStartupFile[ \t]+(apps/api/dist/main\.js|orcapro-hostinger-main\.cjs)[ \t]*\r?$', data, re.M)
if len(directives) != 1 or len(allowed) != 1:
    sys.exit('Development startup directive is missing, duplicated or unexpected')
print('existing' if exists else 'missing', 'old' if allowed[0] == b'apps/api/dist/main.js' else 'current')
PYTHON
)"
read -r wrapper_state routing_state <<< "$state"
if [[ "$wrapper_state" == existing && "$routing_state" == current ]]; then
  printf '%s\n' 'Private development startup already verified.'
  exit 0
fi
backup_root="$(mktemp -d "$domain_root/hbuilds/config/development-runtime-${release_sha}-XXXXXX")"
chmod 700 "$backup_root"
cp -p -- "$routing" "$backup_root/htaccess.before"
chmod 600 "$backup_root/htaccess.before"
if [[ "$wrapper_state" == existing ]]; then
  cp -p -- "$wrapper" "$backup_root/startup.before.cjs"
  chmod 600 "$backup_root/startup.before.cjs"
else
  [[ ! -e "$wrapper" && ! -L "$wrapper" ]] || { deployment_fail 'Startup wrapper appeared concurrently.'; exit 1; }
  mv -n -- "$wrapper_next" "$wrapper"
  [[ ! -e "$wrapper_next" ]] || { deployment_fail 'Startup wrapper was not installed.'; exit 1; }
  chmod 600 "$wrapper"
fi
if [[ "$routing_state" == old ]]; then
  cp -p -- "$backup_root/htaccess.before" "$backup_root/htaccess.next"
  python3 - "$backup_root/htaccess.next" <<'PYTHON'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
data = path.read_bytes()
pattern = rb'^([ \t]*PassengerStartupFile[ \t]+)apps/api/dist/main\.js([ \t]*\r?)$'
updated, count = re.subn(pattern, rb'\1orcapro-hostinger-main.cjs\2', data, flags=re.M)
if count != 1:
    sys.exit('Development routing changed before installation')
path.write_bytes(updated)
PYTHON
  cmp -s -- "$routing" "$backup_root/htaccess.before" || { deployment_fail 'Development routing changed concurrently.'; exit 1; }
  chmod --reference="$routing" "$backup_root/htaccess.next"
  mv -f -- "$backup_root/htaccess.next" "$routing"
fi
printf '%s\n' 'Private development startup prepared; original routing preserved in a private backup.'
