#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
if [ -n "${MC_JAVA_HOME:-}" ]; then
  if [ -x "$MC_JAVA_HOME/bin/javac" ]; then
    JAVAC="$MC_JAVA_HOME/bin/javac"
    JAR="$MC_JAVA_HOME/bin/jar"
  else
    JAVAC=$MC_JAVA_HOME
    JAR=$(dirname -- "$MC_JAVA_HOME")/jar
  fi
else
  JAVAC=$(command -v javac)
  JAR=$(command -v jar)
fi
mkdir -p native-client/classes
"$JAVAC" --release 17 -cp "observer/javassist.jar:$(cat native-client/classpath.txt)" -d native-client/classes native-client/NativeViewAgent.java native-client/FrameCapture.java native-client/NativeUi.java
"$JAR" cfm native-client/native-view-agent.jar native-client/MANIFEST.MF -C native-client/classes .
