import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Cairo from 'gi://cairo';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const HISTORY_SIZE = 50;
const GRAPH_HEIGHT = 20;

const RefreshRateIndicator = GObject.registerClass(
    class RefreshRateIndicator extends PanelMenu.Button {
        _init(extension) {
            try {
                super._init(0.0, 'VRR Monitor');

                this._extension = extension;
                this._settings = extension.getSettings();

                // Mutter settings for VRR detection
                this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
                this._isVrrEnabled = false;

                // Data history
                this._history = new Array(HISTORY_SIZE).fill(0);
                this._currentHz = 0;

                // Container for our content
                let box = new St.BoxLayout({
                    style_class: 'vrr-panel-box',
                    vertical: false,
                    x_expand: false,
                    y_expand: false
                });

                console.log('VRR Monitor: Creating DrawingArea');
                this._drawingArea = new St.DrawingArea({
                    style_class: 'vrr-graph',
                    width: this._settings.get_int('graph-width'),
                    height: GRAPH_HEIGHT,
                    x_expand: false,
                    y_expand: false
                });
                // Connect to repaint signal
                this._drawingArea.connect('repaint', this._onRepaint.bind(this));

                console.log('VRR Monitor: Creating Label');
                this._label = new St.Label({
                    text: 'Init...',
                    y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'vrr-monitor-label'
                });

                box.add_child(this._drawingArea);
                box.add_child(this._label);

                this.add_child(box);

                // Add Settings Menu Item
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                const settingsItem = new PopupMenu.PopupMenuItem('Settings');
                settingsItem.connect('activate', () => {
                    this._extension.openPreferences();
                });
                this.menu.addMenuItem(settingsItem);

                // State
                this._lastTime = 0;
                this._frameCount = 0;
                this._accumulatedTime = 0;
                this._frameSignalId = 0;

                // Wire settings
                console.log('VRR Monitor: Connecting Settings');
                this._settingsSignalId = this._settings.connect('changed', this._onSettingsChanged.bind(this));

                // Watch for VRR changes
                this._mutterSettingsSignalId = this._mutterSettings.connect('changed::experimental-features', this._checkVrrStatus.bind(this));

                // Initial setup
                try {
                    this._onSettingsChanged();
                    this._updateMaxHz();
                    this._checkVrrStatus();
                } catch (e) {
                    console.error('VRR Monitor: Error applying settings', e);
                }
                console.log('VRR Monitor: Init complete');
            } catch (e) {
                console.error('VRR Monitor: FATAL ERROR in _init', e);
                throw e;
            }
        }

        enable() {
            console.log('VRR Monitor: Enabling internal indicator');
            try {
                this._frameSignalId = global.stage.connect('after-paint', this._onAfterPaint.bind(this));

                // Monitor configuration changes to update max Hz
                this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', this._updateMaxHz.bind(this));
                this._updateMaxHz();

                // Force initial draw
                this._drawingArea.queue_repaint();
            } catch (e) {
                console.error('VRR Monitor: Error in cursor enable', e);
            }
        }

        disable() {
            if (this._frameSignalId) {
                global.stage.disconnect(this._frameSignalId);
                this._frameSignalId = 0;
            }
            if (this._settingsSignalId) {
                this._settings.disconnect(this._settingsSignalId);
                this._settingsSignalId = 0;
            }
            if (this._monitorsChangedId) {
                Main.layoutManager.disconnect(this._monitorsChangedId);
                this._monitorsChangedId = 0;
            }
            if (this._mutterSettingsSignalId) {
                this._mutterSettings.disconnect(this._mutterSettingsSignalId);
                this._mutterSettingsSignalId = 0;
            }
            this._mutterSettings = null;
            this._lastTime = 0;
        }

        _checkVrrStatus() {
            try {
                let features = this._mutterSettings.get_strv('experimental-features');
                this._isVrrEnabled = features.includes('variable-refresh-rate');
                console.log(`VRR Monitor: VRR Enabled: ${this._isVrrEnabled}`);
            } catch (e) {
                console.error('VRR Monitor: Error checking VRR status', e);
                this._isVrrEnabled = false;
            }
        }

        _updateMaxHz() {
            try {
                // Default fallback
                this._maxHz = 60;

                // Get primary monitor index
                let primaryIndex = global.display.get_primary_monitor();

                // We need to use Meta.MonitorManager to get the refresh rate
                // Note: global.backend.get_monitor_manager() is available in standard shell
                let monitorManager = global.backend.get_monitor_manager();
                let monitors = monitorManager.monitors;

                console.log(`VRR Monitor: Monitors found: ${monitors ? monitors.length : 'null'}`);

                if (monitors && monitors[primaryIndex]) {
                    let mode = monitors[primaryIndex].get_current_mode();
                    if (!mode) mode = monitors[primaryIndex].current_mode; // Try property fallback

                    if (mode) {
                        // get_refresh_rate() returns float
                        this._maxHz = mode.get_refresh_rate ? mode.get_refresh_rate() : mode.refresh_rate;
                        console.log(`VRR Monitor: Detected Max Hz: ${this._maxHz}`);
                    }
                }
            } catch (e) {
                console.error('VRR Monitor: Error fetching max Hz', e);
            }
        }

        _onSettingsChanged() {
            this._graphColor = this._settings.get_string('graph-color');
            this._unitDisplayMode = this._settings.get_int('unit-display-mode');
            this._textColor = this._settings.get_string('text-color');

            const graphWidth = this._settings.get_int('graph-width');
            this._drawingArea.set_width(graphWidth);

            this._updateLabel();
            this._drawingArea.queue_repaint();
        }

        _updateLabel() {
            const val = Math.round(this._currentHz);
            switch (this._unitDisplayMode) {
                case 1: // FPS
                    this._label.set_text(`${val} FPS`);
                    break;
                case 2: // Disabled
                    this._label.set_text(`${val}`);
                    break;
                case 0: // Hz
                default:
                    this._label.set_text(`${val} Hz`);
                    break;
            }

            if (this._textColor) {
                this._label.set_style(`color: ${this._textColor};`);
            }
        }

        _onRepaint(area) {
            let cr = area.get_context();
            const width = area.width;
            const height = area.height;

            // Clear value
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);

            // Parse color
            // Simple hex parser since St/Clutter usually want GdkRGBA or ClutterColor,
            // but Cairo needs r,g,b (0-1).
            // Let's assume standard #RRGGBB format from settings
            let r = 0, g = 1, b = 0;
            if (this._graphColor && this._graphColor.startsWith('#')) {
                let hex = this._graphColor.substring(1);
                if (hex.length === 6) {
                    r = parseInt(hex.substring(0, 2), 16) / 255;
                    g = parseInt(hex.substring(2, 4), 16) / 255;
                    b = parseInt(hex.substring(4, 6), 16) / 255;
                }
            }

            cr.setSourceRGB(r, g, b);
            cr.setLineWidth(1.5);

            // Draw graph using _maxHz for scaling
            const maxScale = Math.max(this._maxHz, 60); // Ensure at least 60 for scale
            const stepX = width / (HISTORY_SIZE - 1);

            cr.moveTo(0, height); // start bottom left

            for (let i = 0; i < HISTORY_SIZE; i++) {
                const hz = this._history[i];
                const y = height - (Math.min(hz, maxScale) / maxScale) * height;
                if (i === 0) {
                    cr.moveTo(0, y);
                } else {
                    cr.lineTo(i * stepX, y);
                }
            }

            cr.stroke();
            cr.$dispose();
        }

        _onAfterPaint() {
            const now = GLib.get_monotonic_time();

            if (this._lastTime === 0) {
                this._lastTime = now;
                return;
            }

            const delta = now - this._lastTime; // microseconds
            this._lastTime = now;

            this._frameCount++;
            this._accumulatedTime += delta;

            // Update UI every 250ms for smoother graph but readable number
            if (this._accumulatedTime >= 250000) {
                let fps = 0;

                if (!this._isVrrEnabled) {
                    // Non-VRR mode: Lock to monitor Hz
                    fps = this._maxHz;
                } else {
                    // VRR mode: Calculate real FPS
                    fps = this._frameCount / (this._accumulatedTime / 1000000);

                    // Clamp to monitor refresh rate (plus a tiny error margin)
                    if (this._maxHz > 0 && fps > this._maxHz) {
                        fps = this._maxHz;
                    }

                    // Clamp to generic VRR floor (e.g. 30Hz) to avoid showing 0-1Hz
                    // Most VRR monitors have a floor around 48Hz or 30Hz with LFC
                    if (fps < 30) {
                        fps = 30;
                    }
                }

                this._currentHz = fps;

                // Update History
                this._history.shift();
                this._history.push(fps);

                // Trigger updates
                this._updateLabel();
                this._drawingArea.queue_repaint();

                this._frameCount = 0;
                this._accumulatedTime = 0;
            }
        }
    }
);

export default class VRRMonitorExtension extends Extension {
    enable() {
        console.log('VRR Monitor: Extension Enable called');
        try {
            this._settings = this.getSettings();
            console.log('VRR Monitor: Settings loaded');

            this._indicator = new RefreshRateIndicator(this);
            console.log('VRR Monitor: Indicator instance created');

            this._indicator.enable();

            Main.panel.addToStatusArea('vrr-monitor', this._indicator, 0, 'right');
            console.log('VRR Monitor: Added to status area');
        } catch (e) {
            console.error('VRR Monitor: FATAL Main Enable Error', e);
            if (e.stack) console.error(e.stack);
        }
    }

    disable() {
        console.log('VRR Monitor: Extension Disable called');
        try {
            if (this._indicator) {
                this._indicator.disable();
                this._indicator.destroy();
                this._indicator = null;
            }
        } catch (e) {
            console.error('VRR Monitor: Error disabling', e);
        }
        this._settings = null;
    }
}
