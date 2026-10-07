#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
java_cmd=java
if [[ -n "${JAVA_HOME:-}" ]]; then java_cmd="$JAVA_HOME/bin/java"; fi
command -v "$java_cmd" >/dev/null || { echo 'Install Java 17 or newer (Java 21 recommended).' >&2; exit 1; }
shasum -a 256 -c data/SHA256SUMS
./mvnw -q package
exec "$java_cmd" -Xmx3g -Dorg.slf4j.simpleLogger.defaultLogLevel=warn -jar target/anatomy-atlas-0.1.0.jar data/aism.owl "${PORT:-8787}"
