const { app, Tray, Menu, nativeImage, dialog } = require("electron");
const { exec } = require("child_process");
const os = require("os");
const path = require("path"); // Added for path resolution
const io = require("socket.io-client");
const Store = require("electron-store");
const prompt = require("electron-prompt");

let tool_usable = true;

// Fix for CommonJS instantiation
const store = new (Store.default || Store)();

let tray = null;
let socket = null;
const DEFAULT_PATH = "/System/Library/CoreServices/DefaultDesktop.heic";

let serverUrl = store.get("serverUrl") || "http://localhost:7100";
const macUsername = os.userInfo().username;

// CRITICAL: Prevent the app from quitting when the prompt window closes
app.on("window-all-closed", (e) => {
	e.preventDefault();
});

function connectSocket() {
	if (socket) {
		socket.removeAllListeners();
		socket.disconnect();
	}

	console.log(`Connecting to: ${serverUrl}`);
	socket = io(serverUrl, {
		reconnection: true,
		reconnectionAttempts: Infinity,
	});

	socket.on("connect", () => {
		socket.emit("register-mac", macUsername);
		updateMenu();
	});

	socket.on("connect_error", () => updateMenu());
	socket.on("disconnect", () => updateMenu());

	socket.on("admin-change", (allow_control) => {
		tool_usable = allow_control;
		updateMenu();
	});
}

function updateMenu() {
	const status = socket && socket.connected ? "🟢 Online" : "🔴 Offline";

	const contextMenu = Menu.buildFromTemplate([
		{ label: `Device: ${macUsername}`, enabled: false },
		{ label: `Status: ${status}`, enabled: false },
		{ label: `Server: ${serverUrl}`, enabled: false },
		{ type: "separator" },
		{
			label: "Set Server Address",
			enabled: tool_usable,
			click: () => {
				prompt({
					title: "Server Settings",
					label: "Enter Server URL (e.g., http://192.168.1.50:7100):",
					value: serverUrl,
					inputAttrs: { type: "url" },
					type: "input",
					alwaysOnTop: true,
				})
					.then((r) => {
						if (r && r.startsWith("http")) {
							serverUrl = r;
							store.set("serverUrl", r);
							connectSocket();
						}
					})
					.catch(console.error);
			},
		},
		{ type: "separator" },
		{
			label: "Force Reset Wallpaper",
			click: () => enforceWallpaper(),
			enabled: tool_usable,
		},
		{ label: "Quit", click: () => app.quit(), enabled: tool_usable },
	]);

	if (tray) tray.setContextMenu(contextMenu);
}

function enforceWallpaper() {
	const script = `tell application "System Events" to set picture of every desktop to POSIX file "${DEFAULT_PATH}"`;
	exec(`osascript -e '${script}'`);
}

app.whenReady().then(() => {
	if (process.platform === "darwin") app.dock.hide();

	function setAutoLaunch(enabled) {
		app.setLoginItemSettings({
			openAtLogin: enabled,
			openAsHidden: true,
			path: app.getPath("exe"),
		});
	}

	setAutoLaunch(true);

	// Resolve the path to the icon file
	const iconPath = path.join(__dirname, "res", "icon.png");

	// Create the image. Using resize ensures it fits standard tray dimensions (16x16 or 22x22)
	const icon = nativeImage
		.createFromPath(iconPath)
		.resize({ width: 18, height: 18 });

	// Initialize the tray with your icon
	tray = new Tray(icon);

	// to change colors automatically in Dark Mode,
	// ensure the file is named iconTemplate.png and use:
	// icon.setTemplateImage(true);

	// Tooltip when hovering over the icon
	tray.setToolTip("Wallpaper Guard");

	connectSocket();
	updateMenu();

	// The Guard
	setInterval(enforceWallpaper, 1000);
});
