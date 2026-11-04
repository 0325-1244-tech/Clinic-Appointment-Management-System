#!/bin/sh
# Compiles the project and packages ClinicAppointmentSystem.jar (macOS / Linux / Git Bash).
cd "$(dirname "$0")" || exit 1
rm -rf out && mkdir out
find src -name "*.java" > sources.txt
javac --release 17 -encoding UTF-8 -d out @sources.txt || { rm -f sources.txt; echo "Build FAILED"; exit 1; }
rm -f sources.txt
if command -v jar >/dev/null 2>&1; then
    jar --create --file ClinicAppointmentSystem.jar --main-class clinic.Main -C out .
fi
echo "Build successful. Run with: java -cp out clinic.Main"
