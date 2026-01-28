import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class VRRMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Configure the VRR Monitor display'
        });

        // Helper to convert GdkRGBA to Hex string
        const toHex = (rgba) => {
            const clamp = (val) => Math.round(Math.max(0, Math.min(1, val)) * 255);
            const r = clamp(rgba.red).toString(16).padStart(2, '0');
            const g = clamp(rgba.green).toString(16).padStart(2, '0');
            const b = clamp(rgba.blue).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`.toUpperCase();
        };

        // Helper to parse Hex string to GdkRGBA
        const fromHex = (hex, destRgba) => {
            if (!destRgba) destRgba = new Gdk.RGBA();
            destRgba.parse(hex);
            return destRgba;
        };

        // --- Graph Width (Scale) ---
        const widthRow = new Adw.ActionRow({
            title: 'Graph Width',
            subtitle: 'Width of the graph in pixels'
        });

        const widthScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 25,
                upper: 300,
                step_increment: 10,
                page_increment: 50
            }),
            draw_value: true,
            value_pos: Gtk.PositionType.LEFT,
            hexpand: true,
            vexpand: true
        });

        // Bind directly to settings
        settings.bind(
            'graph-width',
            widthScale.get_adjustment(),
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        widthRow.add_suffix(widthScale);
        group.add(widthRow);

        // --- Graph Color ---
        const colorRow = new Adw.ActionRow({
            title: 'Graph Color',
            subtitle: 'Select the color for the graph line'
        });

        const colorDialogBtn = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            valign: Gtk.Align.CENTER
        });

        // Initialize color from settings
        try {
            const savedColor = settings.get_string('graph-color');
            const rgba = new Gdk.RGBA();
            rgba.parse(savedColor);
            colorDialogBtn.set_rgba(rgba);
        } catch (e) {
            console.error('Failed to parse graph color:', e);
        }

        // Save color on change
        colorDialogBtn.connect('notify::rgba', () => {
            const rgba = colorDialogBtn.get_rgba();
            settings.set_string('graph-color', toHex(rgba));
        });

        colorRow.add_suffix(colorDialogBtn);
        group.add(colorRow);

        // --- Text Color ---
        const textColorRow = new Adw.ActionRow({
            title: 'Text Color',
            subtitle: 'Color of the Hz text'
        });

        const textColorBtn = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            valign: Gtk.Align.CENTER
        });

        try {
            const savedColor = settings.get_string('text-color');
            const rgba = new Gdk.RGBA();
            rgba.parse(savedColor);
            textColorBtn.set_rgba(rgba);
        } catch (e) {
            console.error('Failed to parse text color:', e);
        }

        textColorBtn.connect('notify::rgba', () => {
            const rgba = textColorBtn.get_rgba();
            settings.set_string('text-color', toHex(rgba));
        });

        textColorRow.add_suffix(textColorBtn);
        group.add(textColorRow);


        // --- Unit Display Mode ---
        const unitRow = new Adw.ComboRow({
            title: 'Unit Label',
            subtitle: 'Choose the text suffix',
            model: new Gtk.StringList({
                strings: ['Hz', 'FPS', 'Disabled']
            })
        });

        settings.bind(
            'unit-display-mode',
            unitRow,
            'selected',
            Gio.SettingsBindFlags.DEFAULT
        );

        group.add(unitRow);
        page.add(group);
        window.add(page);
    }
}
