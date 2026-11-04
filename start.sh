#!/bin/sh
# Container entry point: virtual screen -> window manager -> VNC server -> CareConnect -> noVNC on $PORT.
export DISPLAY=:0
PORT="${PORT:-10000}"

Xvfb :0 -screen 0 1440x900x24 -nolisten tcp &
sleep 2
openbox &

# Protect the screen with VNC_PASSWORD when it is set (VNC only uses the first 8 characters).
if [ -n "$VNC_PASSWORD" ]; then
    x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vncpass >/dev/null 2>&1
    AUTH="-rfbauth /tmp/vncpass"
else
    AUTH="-nopw"
fi
x11vnc -display :0 -forever -shared -localhost -rfbport 5900 $AUTH -quiet &

# Run the app; if someone closes the window, start it again.
(
    cd /app
    while true; do
        java -Xmx160m -XX:+UseSerialGC -cp /app/classes clinic.Main
        sleep 2
    done
) &

exec websockify --web=/usr/share/novnc "$PORT" localhost:5900
