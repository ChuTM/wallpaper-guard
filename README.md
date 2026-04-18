# Wallpaper Guard 🖼️🛡️

A centralized management system for macOS desktop wallpapers. This project consists of a **Host (Admin)** application and a **Client** application designed to enforce a standard desktop background across multiple macOS devices in a network.

## Project Structure

The repository is divided into two main components:

* **`/host`**: An Electron-based server and admin dashboard. It manages the connection state of clients and controls whether users are allowed to modify settings.
* **`/client`**: A lightweight macOS background utility that connects to the host and enforces the system wallpaper via AppleScript.

---

## 🚀 Features

-   **Real-time Monitoring**: The Admin dashboard shows which devices are currently online/offline.
-   **Lockdown Mode**: Toggle "Config Mode" from the Host to enable or disable the Client's ability to change server settings or quit the app.
-   **Persistent Enforcement**: The client resets the wallpaper every second using macOS native `osascript`.
-   **Auto-Discovery**: Clients can be pointed to the Host's IP address to establish a Socket.io connection.
-   **Persistence**: Device history and server configurations are saved locally using `electron-store` and filesystem JSON.

---

## 🛠️ Technical Architecture



### Host (Admin)
-   **Framework**: Electron
-   **Server**: Express.js (for UI/API) + Socket.io (for real-time duplex communication).
-   **Security**: Middleware restricts the Admin UI and API control to `localhost` only.
-   **Storage**: Saves device history in the user's `userData` directory.

### Client
-   **Framework**: Electron (runs in the background/tray).
-   **Communication**: Socket.io-client.
-   **Engine**: Executes shell commands (`osascript`) to interact with macOS System Events.
-   **Tray Interface**: Provides a status indicator (🟢/🔴) and server configuration options.

---

## 📦 Installation & Setup

### Prerequisites
-   Node.js (v16 or higher)
-   macOS (Required for Client wallpaper enforcement)

### 1. Set up the Host
```bash
cd host
npm install
npm start
```
-   The Admin Dashboard will open automatically.
-   Note the Server IP displayed in the dashboard or via the `/server` endpoint.

### 2. Set up the Client
```bash
cd client
npm install
npm start
```
-   Click the Tray Icon (top menu bar).
-   Select **Set Server Address** and enter the Host's URL (e.g., `http://192.168.1.50:7100`).

---

## 🛠️ Configuration

### Default Wallpaper
The client enforces the wallpaper located at:
`/System/Library/CoreServices/DefaultDesktop.heic`

To change this, modify the `DEFAULT_PATH` constant in `client/main.js`.

### Build Executables
Both applications are configured with `electron-builder`. To generate a `.dmg` for distribution:

```bash
# In either /host or /client
npm prune --production

npm run dist
```

---

## 🔒 Security Notes
-   The **Admin Dashboard** is restricted to the local machine where the Host is running.
-   Remote clients can only communicate via the Socket.io port to register their presence and receive "Config Mode" updates.
-   `contextIsolation` and `nodeIntegration` are configured to follow Electron security best practices.