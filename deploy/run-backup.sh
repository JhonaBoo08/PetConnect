#!/usr/bin/env bash
set -euo pipefail

was_active=0
if systemctl is-active --quiet petconnect.service; then
  was_active=1
  systemctl stop petconnect.service
fi

restore_service() {
  if [[ "$was_active" -eq 1 ]]; then
    systemctl start petconnect.service
  fi
}
trap restore_service EXIT

cd /opt/petconnect
/usr/bin/npm run db:backup
