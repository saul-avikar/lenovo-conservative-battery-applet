const Applet = imports.ui.applet;
const Util = imports.misc.util;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Settings = imports.ui.settings;

const UUID = "conservative_battery@saul";
const controlFile = "/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode";

function ConservativeBatteryApplet(orientation, panel_height, instance_id) {
	this._init(orientation, panel_height, instance_id);
}

ConservativeBatteryApplet.prototype = {
	__proto__: Applet.TextIconApplet.prototype,

	_init: function(orientation, panel_height, instance_id) {
		Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

		this.set_applet_icon_name("battery");
		this.set_applet_tooltip(_("Manage conservative battery mode."));
		this.set_applet_label("Conservative Battery");
		this.conservativeEnabled = false;
		this.update_interval = 10 * 1000; // 10s

		try {
			this.settings = new Settings.AppletSettings(this, UUID, this.instance_id);

			this.settings.bindProperty(
				Settings.BindingDirection.IN,
				"update-interval",
				"update_interval",
				this._new_freq,
				null
			);

			// Create the popup menu
			this.menuManager = new PopupMenu.PopupMenuManager(this);
			this.menu = new Applet.AppletPopupMenu(this, orientation);
			this.menuManager.addMenu(this.menu);

			this._contentSection = new PopupMenu.PopupMenuSection();
			this.menu.addMenuItem(this._contentSection);

			// First item: Turn on
			const item = new PopupMenu.PopupMenuItem("Toggle");

			item.connect(
				"activate",
				Lang.bind(this, async () => {
					try {
						const newValue = this.conservativeEnabled ? "0" : "1";

						await this._run_cmd(
							[
								"sh",
								"-c",
								`echo -n "${newValue}" > ${controlFile}`
							],
							true
						);

						await this._get_status();
					} catch (error) {
						global.logError(error);
					}
				})
			);

			this.menu.addMenuItem(item);

			this._get_status();
			this._update_loop();
		}
		catch (e) {
			global.logError(e);
		}

	},

	on_applet_clicked: function() {
		this.menu.toggle();
	},

	on_applet_removed_from_panel: function () {
		if (this._updateLoopID) {
			Mainloop.source_remove(this._updateLoopID);
		}
	},

	_run_cmd: function (args, sudo = false) {
		return new Promise((resolve, reject) => {
			try {
				const proc = Gio.Subprocess.new(
					sudo ? ["pkexec"].concat(args) : args,
					Gio.SubprocessFlags.STDOUT_PIPE |
					Gio.SubprocessFlags.STDERR_PIPE
				);

				proc.communicate_utf8_async(null, null, (proc, res) => {
					const [, stdout, stderr] = proc.communicate_utf8_finish(res);

					// Failure
					if (!proc.get_successful()) {
						return reject(stderr);
					}

					// Success
					resolve(stdout);
				});
			} catch (error) {
				reject(error);
			}
		});
	},

	_new_freq: function(){
		global.log(this.update_interval);

		if (this._updateLoopID) {
			Mainloop.source_remove(this._updateLoopID);
		}

		this._update_loop();
	},

	_get_status: async function () {
		try {
			const status = await this._run_cmd(["cat", controlFile]);

			this.conservativeEnabled = status.trim() === "1";

			this.set_applet_label(this.conservativeEnabled ? "ON" : "OFF");
		} catch (error) {
			global.logError(error);
		}
	},

	_update_loop: function () {
		this._get_status();

		this._updateLoopID = Mainloop.timeout_add(
			this.update_interval,
			Lang.bind(this, this._update_loop)
		);
	},
};

function main(metadata, orientation, panel_height, instance_id) {
	return new ConservativeBatteryApplet(orientation, panel_height, instance_id);
}
