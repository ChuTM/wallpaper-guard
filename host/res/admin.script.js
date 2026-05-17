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
            <h2>Console Output</h2>
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
function appendConsoleOutput(deviceName, payload, isError = false) {
	const streamContainer = document.getElementById("console-stream");
	if (!streamContainer) return;

	const timestamp = new Date().toLocaleTimeString();
	const cleanOutput =
		typeof payload === "string"
			? payload.trim()
			: JSON.stringify(payload, null, 2);

	if (!cleanOutput) return;

    console.log(deviceName, { payload, isError });

	const outputCard = document.createElement("details");
	outputCard.className = "device-output-card";
	outputCard.open = true;

	outputCard.innerHTML = `
        <summary class="device-output-summary">
            <div class="summary-left">
                <span class="device-name">${deviceName}</span>
                <span class="status-badge ${isError ? "stderr" : "stdout"}">
                    ${isError ? "STDERR" : "STDOUT"}
                </span>
            </div>
            <span class="timestamp">${timestamp}</span>
        </summary>
        <pre class="console-content"><code>${cleanOutput}</code></pre>
    `;

	streamContainer.insertBefore(outputCard, streamContainer.firstChild);
}

// Lifecycle Init hooks
document.addEventListener("DOMContentLoaded", () => {
	initializeConsoleLayout();
	fetchStatus();
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

    appendConsoleOutput(data.user || "Unknown Device", data.result?.stdout || "No output", false);
    if (data.result?.stderr) {
        appendConsoleOutput(data.user || "Unknown Device", data.result.stderr, true);
    }
    

//     {
//     "user": "retrn",
//     "command": "echo \"hi\"",
//     "result": {
//         "stdout": "hi\n",
//         "stderr": ""
//     }
// }

});

socket.on("admin-command-error", (error) => {
	const name = error.deviceName || "System Network Error";
	const msg = error.message || JSON.stringify(error);
	appendConsoleOutput(name, msg, true);
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
				appendConsoleOutput("Admin System", err.message, true);
			});
		commandInput.value = "";
	}
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
