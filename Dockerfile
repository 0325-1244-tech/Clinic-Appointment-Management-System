# Runs the CareConnect Swing desktop app on a virtual screen and streams it
# to the browser with noVNC, so it can be hosted on Render (or any Docker host).

# ---- Build stage: compile the Java source ----
FROM eclipse-temurin:17-jdk AS build
WORKDIR /src
COPY src ./src
RUN javac --release 17 -encoding UTF-8 -d /out $(find src -name "*.java")

# ---- Runtime stage: virtual display + VNC server + noVNC web client ----
FROM eclipse-temurin:17-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb x11vnc openbox novnc websockify \
        libxext6 libxrender1 libxtst6 libxi6 fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    # Opening the site root goes straight to the app, scaled to the browser window.
    && printf '<!doctype html><meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=scale&reconnect=true">\n' \
        > /usr/share/novnc/index.html

WORKDIR /app
COPY --from=build /out ./classes
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

# Render sets PORT automatically; 10000 is its default.
ENV PORT=10000
EXPOSE 10000
CMD ["/start.sh"]
