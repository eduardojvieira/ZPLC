#!/usr/bin/env bash
# Installs a ZPLC IDE .deb or .rpm in a clean container and checks that the installed application starts
# (REL-011). It installs packages and creates a user, so it runs only in the CI container:
#
#   docker run --rm --cap-add=SYS_ADMIN -e ZPLC_CONTAINER_CHECK=1 \
#     -v "$PWD/scripts:/scripts:ro" -v "$PWD/dist-electron:/dist:ro" <image> bash /scripts/check-linux-package.sh /dist/<package>
#
# SYS_ADMIN lets Chromium create its sandbox inside the container; the sandbox itself stays on.
set -euo pipefail

[ "${ZPLC_CONTAINER_CHECK:-}" = 1 ] || { echo "Refusing to install packages outside the CI container (set ZPLC_CONTAINER_CHECK=1)." >&2; exit 2; }
package="${1:?usage: check-linux-package.sh <package.deb|package.rpm>}"
[ -f "$package" ] || { echo "No such package: $package" >&2; exit 2; }

port=9222
user=zplcsmoke

# The package alone first: the dependencies it declares must be enough for the libraries the application loads.
case "$package" in
  *.deb)
    cp "$package" /tmp/zplc-ide.deb && chmod 644 /tmp/zplc-ide.deb
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y /tmp/zplc-ide.deb
    install_display() { apt-get install -y xvfb xauth; }
    ;;
  *.rpm)
    cp "$package" /tmp/zplc-ide.rpm && chmod 644 /tmp/zplc-ide.rpm
    dnf install -y /tmp/zplc-ide.rpm
    install_display() { dnf install -y xorg-x11-server-Xvfb xorg-x11-xauth; }
    ;;
  *) echo "Unsupported package type: $package" >&2; exit 2 ;;
esac

# REL-013: the package installs the udev rule that lets the logged-in user open the serial port of a board.
rule=/usr/lib/udev/rules.d/70-zplc-boards.rules
[ -f "$rule" ] || { echo "The package did not install $rule." >&2; exit 1; }
grep -q 'TAG+="uaccess"' "$rule" || { echo "$rule does not tag any device for the logged-in user." >&2; exit 1; }
if command -v udevadm > /dev/null 2>&1; then udevadm verify "$rule"; fi
echo "Installed the udev rule: $rule"

executable="$(readlink -f "$(command -v zplc-ide)")"
echo "Installed executable: $executable"
unresolved="$(ldd "$executable" 2>&1 | awk '/not found/')"
[ -z "$unresolved" ] || { echo "Libraries the package does not provide:" >&2; echo "$unresolved" >&2; exit 1; }

# The test display is part of the harness, not of the application.
install_display
useradd -m "$user"
profile="$(runuser -u "$user" -- mktemp -d)"
log=/tmp/zplc-ide.log
runuser -u "$user" -- env HOME="/home/$user" xvfb-run -a zplc-ide --headless --disable-gpu \
  --remote-debugging-port="$port" --user-data-dir="$profile" >"$log" 2>&1 &
pid=$!

# Chromium lists a page target for the packaged file:// renderer once the application is up.
targets() {
  exec 3<>"/dev/tcp/127.0.0.1/$port" || return 1
  printf 'GET /json/list HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n' >&3
  local line out=''
  while IFS= read -r line <&3 || [ -n "$line" ]; do out+="$line"; done
  exec 3>&-
  printf '%s' "$out"
}
deadline=$((SECONDS + 60))
until [[ "$(targets 2>/dev/null || true)" =~ \"type\":\ *\"page\".*\"url\":\ *\"file: ]]; do
  if ! kill -0 "$pid" 2>/dev/null; then echo "The application exited before it opened its window." >&2; tail -n 40 "$log" >&2; exit 1; fi
  if [ "$SECONDS" -ge "$deadline" ]; then echo "The application did not open its window within 60 seconds." >&2; tail -n 40 "$log" >&2; exit 1; fi
  sleep 1
done
echo "The installed application started and opened its window."
kill "$pid" 2>/dev/null || true
