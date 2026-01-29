# VRR Monitor for GNOME

A simple GNOME Shell extension that displays the current refresh rate (Hz) on the top bar. This extension includes a real-time graph of refresh intervals and a numeric display.

![VRR Monitor Screenshot](screenshots/screenshot.png)


## Compatibility
| GNOME Version | Status |
|---|---|
| 47 | ❌ Not Compatible |
| 48 | ✅ Compatible |
| 49 | ✅ Compatible |

## How It Works (Disclaimer)
This extension monitors GNOME Shell's frame rendering to estimate your refresh rate, but this is a software calculation *not* a direct 1:1 sync with your display hardware. It's great for getting a general idea of your effective refresh rate, but it cannot confirm if your display is actually syncing to the GPU. As such, this tool is **not** an effective way to verify VRR functionality or diagnose hardware-level syncing issues.

## Installation
You can install this extension directly from the GNOME Extensions website:
[Install VRR Monitor](https://extensions.gnome.org/extension/9225/vrr-refresh-rate-monitor/)