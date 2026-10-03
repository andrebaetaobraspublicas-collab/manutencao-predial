#!/usr/bin/env bash

deployment_fail() { printf '%s\n' "$1" >&2; return 1; }

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
