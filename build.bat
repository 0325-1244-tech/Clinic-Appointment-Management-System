@echo off
REM Compiles the source code into the "out" folder.
REM Also packages ClinicAppointmentSystem.jar when the JDK "jar" tool can be found.
cd /d "%~dp0"
if exist out rmdir /s /q out
mkdir out
dir /s /b src\*.java > sources.txt
javac --release 17 -encoding UTF-8 -d out @sources.txt
if errorlevel 1 (
    del sources.txt
    echo.
    echo Build FAILED.
    pause
    exit /b 1
)
del sources.txt
echo Compiled successfully into the "out" folder.

set "JAR_TOOL="
where jar >nul 2>nul && set "JAR_TOOL=jar"
if not defined JAR_TOOL if defined JAVA_HOME if exist "%JAVA_HOME%\bin\jar.exe" set "JAR_TOOL=%JAVA_HOME%\bin\jar.exe"
if not defined JAR_TOOL for /d %%D in ("C:\Program Files\Java\jdk*") do if exist "%%D\bin\jar.exe" set "JAR_TOOL=%%D\bin\jar.exe"
if defined JAR_TOOL (
    "%JAR_TOOL%" --create --file ClinicAppointmentSystem.jar --main-class clinic.Main -C out .
    echo Packaged ClinicAppointmentSystem.jar
) else (
    echo JDK "jar" tool not found - skipped creating the JAR. Use run.bat to start the app.
)
