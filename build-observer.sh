#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
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
if [ ! -f observer/javassist.jar ]; then
  curl -fsSL 'https://repo.maven.apache.org/maven2/org/javassist/javassist/3.30.2-GA/javassist-3.30.2-GA.jar' -o observer/javassist.jar
fi
mkdir -p observer/classes
"$JAVAC" -cp observer/javassist.jar -d observer/classes observer/DragonObserver.java
"$JAR" cfm observer/dragon-observer.jar observer/MANIFEST.MF -C observer/classes .
