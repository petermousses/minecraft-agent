#!/bin/bash
set -Eeuo pipefail

if [[ "${EULA:-}" != "TRUE" ]]; then
  echo 'Minecraft EULA must be accepted explicitly: set EULA=TRUE.' >&2
  exit 64
fi
if [[ -z "${LITELLM_API_KEY:-}" ]]; then
  echo 'LITELLM_API_KEY must be injected at runtime.' >&2
  exit 64
fi

mkdir -p "$MC_SERVER_DIR" /app/runs /tmp/minecraft
if [[ ! "${RUN_ID:-}" ]]; then
  RUN_ID="nether-$(date -u +%Y%m%dT%H%M%S%N)-$$"
fi
if [[ ! "$RUN_ID" =~ ^[A-Za-z0-9._-]+$ || "$RUN_ID" == "." || "$RUN_ID" == ".." ]]; then
  echo 'RUN_ID may contain only letters, numbers, dots, underscores, and hyphens.' >&2
  exit 64
fi
export RUN_ID

server_log="$MC_SERVER_DIR/logs/latest.log"
mkdir -p "$(dirname "$server_log")"
if [[ -f "$server_log" ]]; then
  mv "$server_log" "$MC_SERVER_DIR/logs/latest.prestart.$RUN_ID.$$.log"
fi

xvfb_pid=
server_pid=
agent_pid=
native_pid=
stopping=0
shutdown() {
  if (( stopping )); then return; fi
  stopping=1
  echo 'Stopping native client, agent, server, and Xvfb.'
  if [[ -n "$agent_pid" ]]; then
    kill -INT "$agent_pid" 2>/dev/null || true
    for _ in $(seq 1 60); do
      kill -0 "$agent_pid" 2>/dev/null || break
      sleep 1
    done
  fi
  for pid in "$native_pid" "$server_pid" "$xvfb_pid"; do
    [[ -n "$pid" ]] && kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "$agent_pid" "$native_pid" "$server_pid" "$xvfb_pid"; do
    [[ -n "$pid" ]] && wait "$pid" 2>/dev/null || true
  done
}
handle_signal() {
  shutdown "$1"
  exit 0
}
trap 'handle_signal SIGINT' INT
trap 'handle_signal SIGTERM' TERM

printf 'eula=true\n' > "$MC_SERVER_DIR/eula.txt"
if [[ ! -f "$MC_SERVER_DIR/server.properties" ]]; then
  cat > "$MC_SERVER_DIR/server.properties" <<'PROPERTIES'
allow-flight=false
allow-nether=true
broadcast-console-to-ops=true
broadcast-rcon-to-ops=true
debug=false
difficulty=peaceful
enable-command-block=false
enable-jmx-monitoring=false
enable-query=false
enable-rcon=false
enable-status=true
enforce-whitelist=false
entity-broadcast-range-percentage=100
force-gamemode=false
function-permission-level=2
gamemode=survival
generate-structures=true
generator-settings={}
hardcore=false
level-name=world
level-seed=8398967436125155523
level-type=default
max-build-height=256
max-players=2
max-tick-time=60000
max-world-size=29999984
motd=Local Minecraft Agent
network-compression-threshold=256
online-mode=false
op-permission-level=4
player-idle-timeout=0
prevent-proxy-connections=false
pvp=true
resource-pack=
server-ip=127.0.0.1
server-port=25576
snooper-enabled=false
spawn-animals=true
spawn-monsters=true
spawn-npcs=true
spawn-protection=0
sync-chunk-writes=true
use-native-transport=true
view-distance=4
white-list=false
PROPERTIES
fi
view_distance="${MC_VIEW_DISTANCE:-4}"
if [[ ! "$view_distance" =~ ^([2-9]|[12][0-9]|3[0-2])$ ]]; then
  echo 'MC_VIEW_DISTANCE must be an integer from 2 to 32.' >&2
  exit 64
fi
if grep -q '^view-distance=' "$MC_SERVER_DIR/server.properties"; then
  sed -i "s/^view-distance=.*/view-distance=$view_distance/" "$MC_SERVER_DIR/server.properties"
else
  printf 'view-distance=%s\n' "$view_distance" >> "$MC_SERVER_DIR/server.properties"
fi

if [[ ! -d "/app/runs/$RUN_ID/source" ]]; then
  node optimization/nether/freeze-run.mjs "$RUN_ID"
fi

xvfb_pid=
Xvfb :99 -screen 0 960x540x24 +extension GLX +render -noreset -nolisten tcp &
xvfb_pid=$!
for _ in $(seq 1 30); do
  kill -0 "$xvfb_pid" 2>/dev/null || { echo 'Xvfb exited during startup.' >&2; exit 1; }
  if DISPLAY=:99 xdpyinfo >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! DISPLAY=:99 xdpyinfo >/dev/null 2>&1; then
  echo 'Xvfb did not become ready.' >&2
  exit 1
fi

./start-server.sh &
server_pid=$!
port_open() { (: > "/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
for _ in $(seq 1 300); do
  kill -0 "$server_pid" 2>/dev/null || { echo 'Minecraft server exited during startup.' >&2; exit 1; }
  if port_open 25576; then break; fi
  sleep 1
done
if ! port_open 25576; then
  echo 'Minecraft server did not open its private port.' >&2
  exit 1
fi

for _ in $(seq 1 360); do
  kill -0 "$server_pid" 2>/dev/null || { echo 'Minecraft server exited during world initialization.' >&2; exit 1; }
  if grep -Fq '[Server thread/INFO]: Done (' "$server_log" 2>/dev/null; then break; fi
  sleep 1
done
if ! grep -Fq '[Server thread/INFO]: Done (' "$server_log" 2>/dev/null; then
  echo 'Minecraft server did not finish world initialization within six minutes.' >&2
  exit 1
fi

export NATIVE_VIEW=1 WAIT_NATIVE=1 NATIVE_RECORD=1
export STATUS_HOST=0.0.0.0 STATUS_PORT=3078 VIEWER_PORT=3077 VIEWER_PREFIX=/viewer
export DRAGON_SENSOR_URL=http://127.0.0.1:3093 MC_PORT=25576
node nether-agent.mjs &
agent_pid=$!
for _ in $(seq 1 120); do
  kill -0 "$agent_pid" 2>/dev/null || { echo 'Minecraft agent exited during startup.' >&2; exit 1; }
  if port_open 25578; then break; fi
  sleep 1
done
if ! port_open 25578; then
  echo 'Native mirror did not open its private port.' >&2
  exit 1
fi

python3 native-client/launch.py &
native_pid=$!

set +e
wait -n "$server_pid" "$agent_pid" "$native_pid" "$xvfb_pid"
exit_code=$?
set -e
shutdown
exit "$exit_code"
