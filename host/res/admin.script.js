const socket = io();

// Hardcoded injection right over the management panel container
function initializeConsoleLayout() {
	const configPanel = document.querySelector(".block-container");
	if (!configPanel) return;

	if (!document.getElementById("command-console-zone")) {
		const consoleSection = document.createElement("section");
		consoleSection.id = "command-console-zone";
		consoleSection.className = "console-zone";
		consoleSection.innerHTML = `
            <h2>Console</h2>
            <div id="console-stream" class="console-container"></div>
        `;

		configPanel.parentNode.insertBefore(consoleSection, configPanel);
	}
}

async function fetchStatus() {
	try {
		const response = await fetch("/api/status");
		const data = await response.json();
		const table = document.getElementById("device-table");
		if (!table) return;

		table.innerHTML = data
			.map((device) => {
				const isOnline = device.status === "Online";
				return `
                        <tr>
                            <td>
                                <span class="device-name">${device.name}</span>
                            </td>
                            <td>
                                <span class="status-badge ${isOnline ? "online" : "offline"}">
                                    <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
                                    ${device.status.toUpperCase()}
                                </span>
                            </td>
                            <td class="timestamp">
                                ${device.lastSeen || device.firstSeen}
                            </td>
                            <td>
                                ${
									!isOnline
										? `<button onclick="removeConnectionHistory('${device.name}')" class="btn-remove" title="Remove History">⨉</button>`
										: ""
								}
                            </td>
                        </tr>
                    `;
			})
			.join("");
	} catch (err) {
		console.error("Failed to fetch status:", err);
	}
}

// Appends data incoming from backend arrays directly to standard viewport layouts
function appendConsoleOutput(
	deviceName,
	payload,
	isError = false,
	fullFallback = {},
) {
	const streamContainer = document.getElementById("console-stream");
	if (!streamContainer) return;

	const timestamp = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	const cleanOutput =
		typeof payload === "string"
			? payload.trim()
			: JSON.stringify(payload, null, 2);

	if (!cleanOutput) return;

	console.log(deviceName, { payload, isError });

	// Look for an existing device container using a sanitized ID
	const safeId = `device-log-${deviceName.replace(/[^a-zA-Z0-9]/g, "-")}`;
	let deviceCard = document.getElementById(safeId);

	// If the device card doesn't exist yet, create the overall wrapper structure
	if (!deviceCard) {
		deviceCard = document.createElement("details");
		deviceCard.id = safeId;
		deviceCard.className = "device-terminal-group";
		deviceCard.open = true;

		deviceCard.innerHTML = `
			<summary class="device-terminal-header">
				<span class="header-icon">⌃</span>
				<span class="device-title">${deviceName}</span>
			</summary>
			<div class="device-terminal-body"></div>
		`;

		// Insert newest devices at the top of the stream
		streamContainer.insertBefore(deviceCard, streamContainer.firstChild);
	}

	// Target the internal body of the existing device panel
	const terminalBody = deviceCard.querySelector(".device-terminal-body");

	// Create the fresh multi-line command output block
	const commandBlock = document.createElement("div");
	commandBlock.className = `terminal-command-entry ${isError ? "has-error" : ""}`;
	commandBlock.innerHTML = `
		<div class="command-meta">[${timestamp}] &gt; ${fullFallback?.command || ""} ${isError ? "ERR" : "OUT"}</div>
		<pre class="command-payload"><code>${cleanOutput}</code></pre>
	`;

	// Append the new command linearly at the bottom of this specific device's card
	terminalBody.appendChild(commandBlock);
}

// Lifecycle Init hooks
document.addEventListener("DOMContentLoaded", () => {
	initializeConsoleLayout();
	fetchStatus();
	serverAddress();
	listenForCommands();
});

socket.on("refresh-ui", fetchStatus);

// Real-time server socket event stream processing unpacking array structure maps safely
socket.on("admin-command-result", (data) => {
	// Structural validation to verify array wrapper payload formatting types cleanly
	console.log(data);

	if (!data || typeof data !== "object") {
		console.warn("Received malformed command result:", data);
		return;
	}

	appendConsoleOutput(
		data.user || "Unknown Device",
		data.result?.stdout || "No output",
		false,
		data[0],
	);
	if (data.result?.stderr) {
		appendConsoleOutput(
			data.user || "Unknown Device",
			data.result.stderr,
			true,
			data[0],
		);
	}
});

socket.on("admin-command-error", (error) => {
	const name = error.deviceName || "System Network Error";
	const msg = error.message || JSON.stringify(error);
	appendConsoleOutput(name, msg, true, error);
});

// Print all socket events for debugging
socket.onAny((event, ...args) => {
	console.log(`Received event: ${event}`, args);
});

const configToggle = document.getElementById("config_mode");
if (configToggle) {
	configToggle.addEventListener("input", (e) => {
		fetch("http://localhost:7100/api/control-access", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ allow_config: e.target.checked }),
		});
	});
}

function executeCommand() {
	const commandInput = document.getElementById("exec_command");
	if (!commandInput) return;

	const command = commandInput.value.trim();
	if (command) {
		fetch("http://localhost:7100/api/execute-command", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ command }),
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error(
						`Server responded with status ${response.status}`,
					);
				}
				return response.json();
			})
			.catch((err) => {
				console.error(err);
				appendConsoleOutput("Admin System", err.message, true, err);
			});
		commandInput.value = "";
	}
}

function listenForCommands() {
	document.getElementById("exec_command").addEventListener("keydown", (e) => {
		if (e.key === "Enter" && e.metaKey) {
			e.preventDefault();
			executeCommand();
		}
	});
	document
		.getElementById("exec_command")
		.addEventListener("input", function () {
			[["\\sudo ", "echo '{{DEVICE_NAME}}' | sudo -S "]].forEach(
				([pattern, replacement]) => {
					if (this.value.includes(pattern)) {
						this.value = this.value.replace(pattern, replacement);
					}
				},
			);
		});
}

function removeConnectionHistory(deviceName) {
	fetch("http://localhost:7100/api/remove-history", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ deviceName }),
	})
		.then((response) => {
			if (!response.ok) {
				throw new Error(
					`Server responded with status ${response.status}`,
				);
			}
			return response.json();
		})
		.then(() => {
			alert(`Removed connection history for ${deviceName}`);
			socket.emit("refresh-ui");
		})
		.catch((err) => {
			console.error("Failed to remove connection history:", err);
			alert(`Failed to remove connection history for ${deviceName}`);
			socket.emit("refresh-ui");
		});
}

function serverAddress() {
	fetch("/server")
		.then((res) => res.text())
		.then((address) => {
			const addr_el = document.getElementById("server-address");
			addr_el.textContent = address + ":7100";
			addr_el.addEventListener("click", () => {
				copy(address + ":7100");
				addr_el.classList.add("copied");
				setTimeout(() => {
					addr_el.classList.remove("copied");
				}, 500);
				socket.emit("refresh-ui");
			});
		});
}

function copy(textToCopy) {
	navigator.clipboard.writeText(textToCopy);
}
