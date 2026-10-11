---
slug: /getting-started/install
id: install
title: Install ZPLC Studio
sidebar_label: Install
description: "Download, verify, open, update and remove ZPLC Studio on Windows, macOS and Linux, from the channels that exist today."
tags: [install, download, verify]
---

# Install ZPLC Studio

This page covers the one way to get a ready-made Studio today: the files of a
GitHub release. It says what each file is, how to check it, what your system
asks the first time you open it, and how to update and remove it.

:::warning Prerelease and unsigned
ZPLC 2.0.0-rc.3 is a prerelease for evaluation. The Windows installers carry no
signature, and the macOS app is signed only ad hoc and is not notarized, so both
systems ask you to confirm before the first launch. No paid certificate is used.
Do not use ZPLC to control machinery: [Safety and limitations](../safety-and-limitations.md).
:::

## Channels

| Channel | State | What it is |
| --- | --- | --- |
| [GitHub releases](https://github.com/eduardojvieira/ZPLC/releases) | Live | Installers for Windows, macOS and Linux, the standalone command line and MCP server, a bill of materials and checksums. |
| Build from source | Works on Linux and macOS | The path of [Run Studio from source](./index.md#run-studio-from-source). |
| Homebrew cask, Arch User Repository | Not set up | There is nothing to install from them yet. |
| Microsoft Store, winget | Not yet submittable | The channels need a signing identity or an account the project does not have. |

Do not install ZPLC from a package manager or a store: until a channel above is
live, any package that says it is ZPLC Studio did not come from this project.

## What is signed

| System | Signature of the installer | What the system does |
| --- | --- | --- |
| Windows | None. The file name says `unsigned`. | SmartScreen warns; Smart App Control, when it is on, blocks the file. |
| macOS | Ad hoc: the bundle is sealed but has no developer identity, and it is never notarized. | Gatekeeper treats it as an app from an unidentified developer. |
| Linux | None. | Nothing asks you; check the checksum yourself. |

Integrity comes from the checksums and from a build provenance attestation, which
you can check as shown [below](#verify-the-download). The notes of every release
list the signing state of each file, and say so when a check of that run did not
pass.

## Download

Open the [releases page](https://github.com/eduardojvieira/ZPLC/releases) and
choose a release whose name starts with `ZPLC v2.0`. While 2.0 is a prerelease,
GitHub still marks the older 1.5.0 release as Latest; scroll down to the 2.0
prerelease.

| Your system | File of the rc.3 release |
| --- | --- |
| Windows, Intel or AMD | `ZPLC.IDE-2.0.0-rc.3-win-x64-Setup.exe`, or `...-win-x64-Portable.exe` to run without installing |
| Windows on ARM | `ZPLC.IDE-2.0.0-rc.3-win-arm64-Setup.exe` |
| macOS, Apple silicon | `ZPLC.IDE-2.0.0-rc.3-mac-arm64.dmg` |
| macOS, Intel | `ZPLC.IDE-2.0.0-rc.3-mac-x64.dmg` |
| Linux, Fedora family | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm` |
| Linux, Ubuntu | `ZPLC.IDE-2.0.0-rc.3-linux-amd64.deb` |
| Linux, other distributions | `ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage` |

The rc.3 files were built by a preview build and uploaded by hand. Releases that
the release pipeline makes name their files from one template,
`ZPLC.IDE-<version>-<system>-<architecture>.<extension>`, and add `setup-unsigned`
or `portable-unsigned` to the two Windows files, for example
`ZPLC.IDE-<version>-win-x64-setup-unsigned.exe`. The `zplc-cli-<version>-<system>-<architecture>`
and `zplc-mcp-<version>-<system>-<architecture>` executables of those releases need
no installer and no Node.js or Bun; they are not signed either.

## Verify the download

Download `SHA256SUMS` from the same release, into the folder of the file, and
compare. Run the command of your system:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 -c SHA256SUMS
Windows:  Get-FileHash .\<file> -Algorithm SHA256
```

On Windows, compare the printed hash with the line of your file in `SHA256SUMS`.
Do not open a file whose hash is different.

Each release made by the pipeline also carries a build provenance attestation for
every file, which says which run of the project's workflow built it. With the
GitHub CLI:

```text
gh attestation verify <file> --repo eduardojvieira/ZPLC
```

The release lists one bill of materials per platform, in the CycloneDX format,
named `ZPLC-<version>-<platform>.cdx.json`. It lists the components that went
into the build.

A matching checksum shows that the file is the one that was published, and an
attestation shows where it was built. Neither shows that the program is safe, and
neither changes what Windows or macOS ask you at the first launch.

## First launch

### Windows

1. Run the `Setup.exe` file (or the `Portable.exe` file, which needs no installation).
2. SmartScreen shows **Windows protected your PC**. Select **More info**, then **Run anyway**. Because the files are unsigned, SmartScreen asks again for every new version. See [Microsoft's SmartScreen documentation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
3. If Windows blocks the file and offers no **Run anyway**, Smart App Control is on. It blocks every unsigned app and Microsoft documents no override for a single app. Turn it off in Windows Security, or [run Studio from source](./index.md#run-studio-from-source). See [Microsoft's Smart App Control page](https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003).

### macOS

1. Open the DMG, drag **ZPLC IDE** to Applications and open it.
2. macOS says it could not verify the app. Choose **Done**, not **Move to Trash**.
3. Open **System Settings**, then **Privacy & Security**. In the **Security** section, choose **Open Anyway** next to the ZPLC IDE message, confirm, and enter your password. The button stays available for about an hour after the failed attempt. See [Apple's instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

If macOS reports that the app is damaged and offers only **Move to Trash**, the
cause is the quarantine flag that macOS put on the download. Removing it skips
macOS's check of the app, so do it only after the checksum matches:

```bash
xattr -dr com.apple.quarantine "/Applications/ZPLC IDE.app"
```

### Linux

Install the `.deb` or the `.rpm` first. The package manager brings the
libraries the application needs, installs the [udev rule of the boards](#linux-serial-port-access)
and removes everything when you uninstall. Use the AppImage only when neither
package fits your distribution.

```bash
# Debian, Ubuntu and their derivatives (DEB)
sudo apt install ./ZPLC.IDE-2.0.0-rc.3-linux-amd64.deb

# Fedora and the RHEL family (RPM)
sudo dnf install ./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.rpm
```

The `.deb` of rc.3 declares dependencies that current Debian and Ubuntu releases
no longer provide, so it installs only on Ubuntu 22.04. The pipeline that builds
the later releases installs the `.deb` on Debian 13 and Ubuntu 24.04 and the
`.rpm` on Fedora, in clean containers, before it publishes them, and the release
notes say whether that check passed.

The AppImage is published for every release and needs nothing installed, with
these prerequisites:

- FUSE 2 (`libfuse2` or `libfuse2t64` on Debian and Ubuntu, `fuse-libs` on
  Fedora). Without it, run the file with `--appimage-extract-and-run`, an option
  of the AppImage runtime.
- On Ubuntu 24.04 and later, AppArmor restricts the Chromium sandbox of an
  application that is not installed by a package. Neither this nor FUSE was tried
  with ZPLC: this is why the packages come first.
- It installs nothing outside its own file, so it installs no udev rule: use the
  group of [serial port access](#linux-serial-port-access).

```bash
chmod +x ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
./ZPLC.IDE-2.0.0-rc.3-linux-x86_64.AppImage
```

## Linux: serial port access

Studio opens a serial port only when you connect a board yourself. On Linux a
board that shows up as `/dev/ttyACM0` or `/dev/ttyUSB0` belongs to a group, and
your user has to be allowed to open it.

**The `.deb` and the `.rpm` do this for you** for the boards whose USB identifier
the project has recorded. They install `/usr/lib/udev/rules.d/70-zplc-boards.rules`,
which tells `systemd-logind` to give the user who is logged in at the machine
access to those serial devices while the session lasts, with no group and no
reboot. The rule is generated from the project's list of board USB identifiers
(`tools/hil/usb-ids.json`), so it covers exactly the boards that list names. Today
that is the two RP2040 boards, Raspberry Pi Pico and Waveshare RP2040-Zero
(`2e8a:000a`); the file lists the boards that have no recorded identifier, such as
the ESP32-S3-DevKitC-1, and they need the group below.

To apply the rule to a board that is already plugged in, without rebooting,
reload the rules and replay the device events, or unplug the board and plug it in
again:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=tty --action=add
getfacl /dev/ttyACM0   # an entry for your user means the rule applied
```

**The group, for the AppImage and for the boards the rule does not name:**

```bash
ls -l /dev/ttyACM0
sudo usermod -aG dialout "$USER"
```

The group is `dialout` on Debian, Ubuntu and Fedora and `uucp` on Arch; use the
group that `ls -l` prints. Log out and in again for the change to apply. This
is the general Linux procedure; what has been tested with a board, and what has
not, is on [Hardware support](../reference/capabilities-evidence.md).

## Update

Studio never updates itself. To find out whether a newer release exists, turn on
**Check for a newer release when Studio starts** in Preferences, or press
**Check now**. The check is off by default; it asks the GitHub releases of this
project for the latest published release, sends nothing about you, and shows a
version and a link. It downloads and installs nothing.

To update, download the new file and verify it as above, then install it over the
old one (Windows setup, macOS: replace the app in Applications; Linux: install
the new package or replace the AppImage). Your projects are folders that you
chose, so an update does not touch them.

## Uninstall

| System | How |
| --- | --- |
| Windows, setup | **Settings**, **Apps**, **Installed apps**, then remove **ZPLC IDE**. |
| Windows, portable | Delete the `Portable.exe` file. |
| macOS | Drag **ZPLC IDE** from Applications to the Trash. |
| Linux, RPM | `sudo dnf remove zplc-ide` |
| Linux, DEB | `sudo apt remove zplc-ide` |
| Linux, AppImage | Delete the file. |

Studio keeps its preferences, recent projects, lesson progress and recovery
copies in the user-data folder of the application for your account; removing the
application does not remove it. Your project folders are never inside it.

## Troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| **Windows protected your PC** | SmartScreen: the file is unsigned. | **More info**, then **Run anyway**, after the checksum matched. |
| Windows blocks the file and has no **Run anyway** | Smart App Control is on. | Turn it off in Windows Security, or run from source. |
| macOS says it could not verify the app | The app has no developer identity and is not notarized. | **Open Anyway** in **Privacy & Security**. |
| macOS says the app is damaged | The quarantine flag of the download, on an app that is not notarized. | Check the checksum, then remove the flag with `xattr`. |
| The checksum does not match | The download is incomplete, or it is not the published file. | Download it again. If it still differs, do not open it. |
| `gh attestation verify` fails | The file was not built by the project's workflow, or it is a file of a release made by hand, such as rc.3. | Check the checksum and download from the releases page of this repository. |
| The AppImage does not start | Other Electron AppImages need `libfuse2` on Ubuntu 22.10 and later, and extra settings for the Chromium sandbox on Ubuntu 24.04 and later. Neither was tried with ZPLC. | Use the `.rpm` or `.deb` where your system supports it, or run Studio from source. |
| The port of a board is refused | Your user is not in the serial group. | See [Linux: serial port access](#linux-serial-port-access). |
| Studio cannot connect to the simulator, in a build from source | The native runtime is a separate program. | Build it first and point Studio to it, as in [Run Studio from source](./index.md#run-studio-from-source). |

If your problem is not here, open an issue from the bug report template of the
[repository](https://github.com/eduardojvieira/ZPLC/issues). Do not put
credentials or device identifiers in it.
