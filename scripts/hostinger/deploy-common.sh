#!/usr/bin/env bash

deployment_fail() { printf '%s\n' "$1" >&2; return 1; }

validate_private_api_configuration() {
  local domain_root="$1" configuration="$1/hbuilds/config/.env" parent mode
  for parent in "$domain_root" "$domain_root/hbuilds" "$domain_root/hbuilds/config"; do
    [[ -d "$parent" && ! -L "$parent" && "$(realpath "$parent")" == "$parent" ]] || deployment_fail 'Private configuration directory resolves outside the application.' || return
  done
  [[ -f "$configuration" && ! -L "$configuration" && -r "$configuration" ]] || deployment_fail 'Private API configuration must be a readable regular file.' || return
  [[ "$(stat -c '%u' "$configuration")" == "$(id -u)" ]] || deployment_fail 'Private API configuration belongs to another account.' || return
  mode="$(stat -c '%a' "$configuration")"
  [[ "$mode" =~ ^[0-7]{3,4}$ && $((8#$mode & 077)) == 0 ]] || deployment_fail 'Private API configuration is accessible to other accounts.' || return
}

ensure_private_runtime_environment() {
  local domain_root="$1" runtime_path="$2" versions_root runtime_root relative configuration runtime_env
  validate_private_api_configuration "$domain_root" || return
  configuration="$domain_root/hbuilds/config/.env"
  versions_root="$domain_root/hbuilds/versions"
  [[ -d "$versions_root" && ! -L "$versions_root" && "$(realpath "$versions_root")" == "$versions_root" ]] || deployment_fail 'Managed runtime versions directory is invalid.' || return
  runtime_root="$(realpath -e "$runtime_path")" || return
  [[ -d "$runtime_root" && "$runtime_root" == "$versions_root/"* ]] || deployment_fail 'Runtime resolves outside the application versions.' || return
  relative="${runtime_root#"$versions_root/"}"
  [[ "$relative" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*/nodejs$ ]] || deployment_fail 'Runtime must be the nodejs directory of one managed version.' || return
  runtime_env="$runtime_root/.env"
  if [[ -e "$runtime_env" || -L "$runtime_env" ]]; then
    [[ -L "$runtime_env" && "$(realpath -e "$runtime_env")" == "$configuration" ]] || deployment_fail 'Runtime configuration conflicts with the private application configuration.' || return
  else
    ln -s "$configuration" "$runtime_env" || return
  fi
  [[ "$(realpath -e "$runtime_env")" == "$configuration" ]] || deployment_fail 'Runtime environment link verification failed.'
}

configure_hostinger_build_resources() {
  # CPU count reported by the host exceeds this account's available threads.
  export TOKIO_WORKER_THREADS=2
  export UV_THREADPOOL_SIZE=1
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--v8-pool-size=1"
}

validate_deployment_paths() {
  local account="$1" domain_root="$2" domain="$3" sha="$4" release_id="$5" archive="$6" kind="$7"
  [[ "$account" =~ ^u[0-9]+$ ]] || deployment_fail 'Invalid Hostinger account.' || return
  [[ "$domain" == 'api.orcaproobras.com.br' || "$domain" == 'sistema.orcaproobras.com.br' ]] || deployment_fail 'Domain is not an OrçaPro production application.' || return
  [[ "$domain_root" == "/home/${account}/domains/${domain}" ]] || deployment_fail 'Deployment root is outside the specified production application.' || return
  [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || deployment_fail 'Release must be a full lowercase commit SHA.' || return
  [[ "$release_id" =~ ^${sha}-[0-9]+-[0-9]+$ ]] || deployment_fail 'Invalid immutable release identifier.' || return
  [[ "$kind" == 'api-source' || "$kind" == 'frontend' ]] || deployment_fail 'Invalid deployment artifact kind.' || return
  [[ "$archive" == "${domain_root}/hbuilds/incoming/${release_id}/${kind}.tar.gz" ]] || deployment_fail 'Artifact is outside its private incoming release directory.' || return
}

validate_application_directory() {
  local domain_root="$1"
  [[ -d "$domain_root" && ! -L "$domain_root" ]] || deployment_fail 'Application root must be an existing real directory.' || return
  [[ "$(realpath "$domain_root")" == "$domain_root" ]] || deployment_fail 'Application root resolves outside its expected path.' || return
  [[ -d "$domain_root/hbuilds" && ! -L "$domain_root/hbuilds" ]] || deployment_fail 'Provision the managed application before promoting it.' || return
  local parent
  for parent in versions incoming manual-web; do
    if [[ -e "$domain_root/hbuilds/$parent" || -L "$domain_root/hbuilds/$parent" ]]; then
      [[ -d "$domain_root/hbuilds/$parent" && ! -L "$domain_root/hbuilds/$parent" && "$(realpath "$domain_root/hbuilds/$parent")" == "$domain_root/hbuilds/$parent" ]] || deployment_fail 'Managed deployment parent resolves outside the application.' || return
    fi
  done
}

verify_artifact_digest() {
  local archive="$1" expected="$2"
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || deployment_fail 'Invalid artifact checksum.' || return
  [[ -f "$archive" && ! -L "$archive" ]] || deployment_fail 'Artifact must be a regular file.' || return
  printf '%s  %s\n' "$expected" "$archive" | sha256sum --check --status || deployment_fail 'Artifact checksum mismatch.'
}

recycle_application_processes() {
  local account="$1" domain="$2" process_pattern pids
  # Passenger truncates its title. The anchored prefix still names exactly one
  # managed application and cannot match the SSH shell or another domain.
  process_pattern="^lsnode:/home/${account}/domains/${domain//./\\.}/(\\.builds|hbuilds)/[^[:space:]]*$"
  pids="$(pgrep -u "$account" -f "$process_pattern" || true)"
  if [[ -n "$pids" ]]; then kill -TERM $pids; fi
}
