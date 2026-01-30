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
            super._init(0.0, 'VRR Monitor');

            this._extension = extension;
            this._settings = extension._settings;

            this._mutterSettings = new Gio.Settings({ schema_id: 'org.gnome.mutter' });
            this._isVrrEnabled = false;

            this._history = new Array(HISTORY_SIZE).fill(0);
            this._currentHz = 0;

            let container = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                style_class: 'vrr-panel-box',
                x_expand: false,
                y_expand: false
            });

            this._drawingArea = new St.DrawingArea({
                style_class: 'vrr-graph',
                width: this._settings.get_int('graph-width'),
                height: GRAPH_HEIGHT,
                x_expand: true,
                y_expand: true
            });
            this._drawingArea.connect('repaint', this._onRepaint.bind(this));

            this._label = new St.Label({
                text: 'Init...',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                y_expand: true,
                style_class: 'vrr-monitor-label'
            });

            container.add_child(this._drawingArea);
            container.add_child(this._label);

            this.add_child(container);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const settingsItem = new PopupMenu.PopupMenuItem('Settings');
            settingsItem.connect('activate', () => {
                this._extension.openPreferences();
            });
            this.menu.addMenuItem(settingsItem);

            this._lastTime = 0;
            this._frameCount = 0;
            this._accumulatedTime = 0;
            this._frameSignalId = 0;

            this._settingsSignalId = this._settings.connect('changed', this._onSettingsChanged.bind(this));

            this._mutterSettingsSignalId = this._mutterSettings.connect('changed::experimental-features', this._checkVrrStatus.bind(this));

            this._onSettingsChanged();
            this._updateMaxHz();
            this._checkVrrStatus();

            this._frameSignalId = global.stage.connect('after-paint', this._onAfterPaint.bind(this));

            // Re-check periodically in case XML changes or monitors change
            this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', this._updateMaxHz.bind(this));

            this._drawingArea.queue_repaint();
        }

        destroy() {
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

            super.destroy();
        }

        _checkVrrStatus() {
            let features = this._mutterSettings.get_strv('experimental-features');
            this._isVrrEnabled = features.includes('variable-refresh-rate');
        }

        _updateMaxHz() {
            this._maxHz = 60; // Default

            // Try to get from API first (future proofing)
            let rate = this._getRateFromApi();
            if (rate > 60) {
                this._maxHz = rate;
                return;
            }

            // Fallback: Read from ~/.config/monitors.xml
            this._getRateFromXml();
        }

        _getRateFromApi() {
            // Attempt to use various API methods
            let monitorManager = global.backend.get_monitor_manager();

            // Check if we can get logical monitors
            if (monitorManager && typeof monitorManager.get_logical_monitors === 'function') {
                let logical = monitorManager.get_logical_monitors();
                for (let l of logical) {
                    const isPrimary = typeof l.is_primary === 'function' ? l.is_primary() : l.is_primary;
                    if (isPrimary) {
                        let m = l.get_monitors()[0];
                        if (m) {
                            let mode = m.get_current_mode();
                            if (mode) {
                                let r = mode.get_refresh_rate();
                                if (r > 1000) r /= 1000;
                                return r;
                            }
                        }
                    }
                }
            }
            return 0;
        }

        _getRateFromXml() {
            let path = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'monitors.xml']);
            let file = Gio.File.new_for_path(path);

            file.load_contents_async(null, (obj, res) => {
                let content;
                try {
                    let [success, data] = obj.load_contents_finish(res);
                    if (!success) return;
                    content = data;
                } catch (e) {
                    console.warn('VRR Monitor: Failed to read monitors.xml', e);
                    return;
                }

                try {
                    let xml = new TextDecoder().decode(content);

                    // Simple regex parser to find primary monitor's rate
                    let blocks = xml.split('<logicalmonitor>');
                    let rate = 0;

                    for (let block of blocks) {
                        if (block.includes('<primary>yes</primary>')) {
                            let match = block.match(/<rate>([\d\.]+)<\/rate>/);
                            if (match && match[1]) {
                                rate = parseFloat(match[1]);
                                break;
                            }
                        }
                    }

                    // If no primary found (or just one monitor), try first match
                    if (rate === 0) {
                        let match = xml.match(/<rate>([\d\.]+)<\/rate>/);
                        if (match && match[1]) {
                            rate = parseFloat(match[1]);
                        }
                    }

                    if (rate > 0) {
                        this._maxHz = rate;
                    }
                } catch (e) {
                    console.warn('VRR Monitor: Error parsing monitors.xml', e);
                }
            });
        }

        _onSettingsChanged() {
            this._graphColor = this._settings.get_string('graph-color');
            this._unitDisplayMode = this._settings.get_int('unit-display-mode');
            this._textColor = this._settings.get_string('text-color');
            const showGraph = this._settings.get_boolean('show-graph');

            const graphWidth = this._settings.get_int('graph-width');
            this._drawingArea.set_width(showGraph ? graphWidth : 0);
            this._drawingArea.set_height(showGraph ? GRAPH_HEIGHT : 0);
            this._drawingArea.visible = showGraph;

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

            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);

            let r = 0, g = 1, b = 0;
            if (this._graphColor && this._graphColor.startsWith('#')) {
                let hex = this._graphColor.substring(1);
                if (hex.length === 6) {
                    r = parseInt(hex.substring(0, 2), 16) / 255;
                    g = parseInt(hex.substring(2, 4), 16) / 255;
                    b = parseInt(hex.substring(4, 6), 16) / 255;
                }
            }

            cr.setSourceRGBA(r, g, b, 0.5);
            cr.setLineWidth(1.5);

            const maxScale = Math.max(this._maxHz, 60);
            const stepX = width / (HISTORY_SIZE - 1);

            const padding = 6;
            const graphHeight = height - padding;

            cr.moveTo(0, height);

            for (let i = 0; i < HISTORY_SIZE; i++) {
                const hz = this._history[i];
                const y = height - (Math.min(hz, maxScale) / maxScale) * graphHeight;
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

            if (this._accumulatedTime >= 250000) {
                let fps = 0;

                if (!this._isVrrEnabled) {
                    fps = this._maxHz;
                } else {
                    fps = this._frameCount / (this._accumulatedTime / 1000000);
                    if (this._maxHz > 0 && fps > this._maxHz) {
                        this._maxHz = fps;
                    }

                    const minHz = this._settings.get_int('min-hz');
                    if (fps < minHz) {
                        fps = minHz;
                    }
                }

                this._currentHz = fps;
                this._history.shift();
                this._history.push(fps);
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
        this._settings = this.getSettings();
        this._indicator = new RefreshRateIndicator(this);
        Main.panel.addToStatusArea('vrr-monitor', this._indicator, 0, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }
}
