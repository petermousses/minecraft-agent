#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SERVER_DIR=${MC_SERVER_DIR:-"$ROOT/server"}
SERVER_JAR=${MC_SERVER_JAR:-"$SERVER_DIR/server.jar"}
OBSERVER_AGENT=${OBSERVER_AGENT:-"$ROOT/observer/dragon-observer.jar"}

if [ -n "${MC_JAVA_HOME:-}" ]; then
  if [ -x "$MC_JAVA_HOME/bin/java" ]; then
    JAVA="$MC_JAVA_HOME/bin/java"
  else
    JAVA=$MC_JAVA_HOME
  fi
else
  JAVA=$(command -v java)
fi

cd "$SERVER_DIR"
exec "$JAVA" -javaagent:"$OBSERVER_AGENT"="${DRAGON_SENSOR_PORT:-3093}" -Xms512M -Xmx2G -jar "$SERVER_JAR" nogui
