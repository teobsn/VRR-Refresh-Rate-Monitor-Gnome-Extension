# VRR Monitor for GNOME

A simple GNOME Shell extension that displays the current refresh rate (Hz) on the top bar. This extension includes a real-time graph of refresh intervals and a numeric display, making it useful for verifying Variable Refresh Rate (VRR) functionality.

## Compatibility
| GNOME Version | Status |
|---|---|
| 46 | ❌ Not Compatible |
| 47 | ❌ Not Compatible |
| 48 | ✅ Compatible |
| 49 | ✅ Compatible |

## How It Works (Disclaimer)
This extension monitors the GNOME Shell compositor's frame rendering timing to estimate the current refresh rate. In a VRR setup, your monitor effectively syncs to this rate. Please note this is a software-side measurement and not a direct hardware readout, but it provides a pretty reliable indicator of VRR activity.

## Installation
You can install this extension directly from the GNOME Extensions website:
[Install VRR Monitor](https://extensions.gnome.org/extension/placeholder-id/placeholder-name/)
