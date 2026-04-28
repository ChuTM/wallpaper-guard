const { app } = require("electron");
const { exec } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const https = require("https");
const io = require("socket.io-client");
const Store = require("electron-store");

// --- DYNAMIC PATHING ---
// In a macOS .app bundle, the executable is at: Contents/MacOS/AppName
// We go up 4 levels to land in the folder containing the .app
const APP_BUNDLE_DIR = app.isPackaged
	? path.join(path.dirname(app.getPath("exe")), "../../../../")
	: __dirname;

const CONFIG_FILE = path.join(APP_BUNDLE_DIR, "config.json");
const INIT_CONFIG_URL = "https://wallpg.web.app/init_config.json";

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

let socket = null;
let enforcementTimer = null;

// --- CORE FUNCTIONS ---

function connectSocket() {
	if (socket) socket.disconnect();
	socket = io(settings.serverUrl, { reconnection: true });

	socket.on("connect", () => {
		socket.emit("register-mac", DEVICE_NAME);
	});

	socket.on("enforce-wallpaper", () => {
		if (toolUsable) enforceWallpaper();
	});

	socket.on("admin-change", (allow) => {
		toolUsable = allow;
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
						fs.writeFileSync(
							CONFIG_FILE,
							JSON.stringify(cleanConfig, null, 4),
						);
						resolve(cleanConfig);
					} catch (e) {
						reject(e);
					}
				});
			})
			.on("error", reject);
	});
}

fs.watchFile(CONFIG_FILE, () => {
	try {
		const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
		syncConfig(data);
	} catch (e) {}
});

// --- LIFECYCLE ---

app.on("window-all-closed", (e) => e.preventDefault());

app.whenReady().then(async () => {
	if (process.platform === "darwin") app.dock.hide();

	// Verification check for IT (Visible in Console/Logs)
	console.log("Service directory:", APP_BUNDLE_DIR);

	if (!fs.existsSync(CONFIG_FILE)) {
		try {
			const remoteConfig = await downloadInitConfig();
			await syncConfig(remoteConfig);
		} catch (e) {
			console.error("Failed to write config. Ensure folder is writable.");
			syncConfig(settings);
		}
	} else {
		try {
			const localFileConfig = JSON.parse(
				fs.readFileSync(CONFIG_FILE, "utf8"),
			);
			syncConfig(localFileConfig);
		} catch (e) {
			syncConfig(settings);
		}
	}

	app.setLoginItemSettings({
		openAtLogin: true,
		openAsHidden: true,
		path: app.getPath("exe"),
	});

	connectSocket();
	startEnforcementLoop();
});
