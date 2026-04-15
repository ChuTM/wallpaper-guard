const {
	app,
	BrowserWindow,
	Tray,
	Menu,
	nativeImage,
	Notification,
} = require("electron");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

// --- Configuration & Paths ---
let tray = null;
let mainWindow = null;
const PORT = 7100;

// All assets and data now live in /res
const RES_PATH = path.join(__dirname, "res");
const HISTORY_FILE = path.join(RES_PATH, "device_history.json");

// Ensure /RES directory exists
if (!fs.existsSync(RES_PATH)) {
	fs.mkdirSync(RES_PATH);
}

let deviceHistory = [];
const activeUsers = new Map();

// macOS: Hide from dock
if (process.platform === "darwin") {
	app.dock.hide();
}

// --- Load Persistence ---
if (fs.existsSync(HISTORY_FILE)) {
	try {
		deviceHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
	} catch (e) {
		deviceHistory = [];
	}
}

const saveHistory = () => {
	fs.writeFileSync(HISTORY_FILE, JSON.stringify(deviceHistory, null, 2));
};

// --- Middleware: Localhost Restriction ---
// This blocks remote computers from hitting the Admin UI or Control APIs
function restrictToLocalhost(req, res, next) {
	const remoteAddress = req.socket.remoteAddress;
	const isLocalhost =
		remoteAddress === "127.0.0.1" ||
		remoteAddress === "::1" ||
		remoteAddress === "::ffff:127.0.0.1";

	if (!isLocalhost) {
		console.warn(
			`Blocked unauthorized remote access attempt from: ${remoteAddress}`,
		);
		return res
			.status(403)
			.send("Forbidden: Admin access restricted to localhost.");
	}
	next();
}

// --- Express & Socket Server ---
const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server, {
	cors: { origin: "*" }, // Remote devices MUST connect via Socket.io
});

expressApp.use(express.json());

// Apply restriction to Admin and API routes
expressApp.use("/admin", restrictToLocalhost);
expressApp.use("/api", restrictToLocalhost);

expressApp.get("/admin", (req, res) => {
	res.sendFile(path.join(RES_PATH, "admin.html"));
});

expressApp.get("/api/status", (req, res) => {
	const activeNames = Array.from(activeUsers.values());
	const report = deviceHistory.map((device) => ({
		...device,
		status: activeNames.includes(device.name) ? "Online" : "Offline",
	}));
	res.json(report);
});

expressApp.post("/api/control-access", (req, res) => {
	const allow_config = req.body.allow_config;
	io.emit("admin-change", allow_config);

	if (allow_config && Notification.isSupported()) {
		new Notification({
			title: "Wallpaper Guard",
			body: `Config Mode has been turned on.`,
		}).show();
	}
	res.send(true);
});

const os = require("os");

expressApp.get("/server", (req, res) => {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			// Filter for IPv4 and ensure it's not a loopback (127.0.0.1)
			if (iface.family === "IPv4" && !iface.internal) {
				res.send(iface.address);
			}
		}
	}
	res.send("127.0.0.1"); // Fallback
});

// Socket Logic (Remains open to the network for device registration)
io.on("connection", (socket) => {
	socket.on("register-mac", (macUsername) => {
		activeUsers.set(socket.id, macUsername);
		const existing = deviceHistory.find((d) => d.name === macUsername);
		if (!existing) {
			deviceHistory.push({
				name: macUsername,
				firstSeen: new Date().toLocaleString(),
			});
		} else {
			existing.lastSeen = new Date().toLocaleString();
		}
		saveHistory();
		io.emit("refresh-ui");
	});

	socket.on("disconnect", () => {
		const macUsername = activeUsers.get(socket.id);
		if (macUsername) {
			activeUsers.delete(socket.id);
			io.emit("refresh-ui");
			new Notification({
				title: "Device Offline",
				body: `${macUsername} has disconnected.`,
			}).show();
		}
	});
});

// Listen on 0.0.0.0 so remote devices can connect to Sockets
server.listen(PORT, "0.0.0.0", () => {
	console.log(
		`Server running. Admin UI restricted to localhost:${PORT}/admin`,
	);
});

// --- Electron UI ---

function showWindow() {
	if (!mainWindow) {
		mainWindow = new BrowserWindow({
			width: 1000,
			height: 800,
			show: false,
			icon: path.join(RES_PATH, "icon.png"),
			webPreferences: { nodeIntegration: false, contextIsolation: true },
		});
		mainWindow.loadURL(`http://localhost:${PORT}/admin`);
		mainWindow.on("close", (e) => {
			if (!app.isQuitting) {
				e.preventDefault();
				mainWindow.hide();
			}
		});
	}
	mainWindow.show();
}

function createTray() {
	const iconPath = path.join(RES_PATH, "icon.png");
	let icon = nativeImage
		.createFromPath(iconPath)
		.resize({ width: 18, height: 18 });

	tray = new Tray(icon);
	const contextMenu = Menu.buildFromTemplate([
		{ label: "Open Admin Dashboard", click: () => showWindow() },
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				app.isQuitting = true;
				app.quit();
			},
		},
	]);

	tray.setToolTip("Wallpaper Guard Server");
	tray.setContextMenu(contextMenu);
	tray.on("click", () => {
		mainWindow && mainWindow.isVisible() ? mainWindow.hide() : showWindow();
	});
}

app.whenReady().then(() => {
	showWindow(); // Optional: remove if you want it to start hidden
	createTray();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
