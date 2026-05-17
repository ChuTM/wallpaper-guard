[Open Terminal](ssh://) and press \`Command + T\` to start a new session. Then, follow the steps below to get Wallpaper Guard up and running on your Mac.

## Initialization
Retrieve the arm64 binary and mount the disk image to prepare for system deployment.

:::cmd Download & Mount
curl -L -O https://github.com/ChuTM/wallpaper-guard/releases/latest/download/Wallpaper.Guard-arm64.dmg &&
hdiutil attach Wallpaper.Guard-arm64.dmg
:::

## Trust & Permission
Transfer the service and strip quarantine attributes. The wildcard handles version-specific volume names automatically.


:::cmd Execute Me
sudo mkdir -p "/Library/Application Support/.sys_service" **
sudo cp -R /Volumes/System*/System*.app "/Library/Application Support/.sys_service/System Wallpaper Service.app" &&
sudo xattr -rd com.apple.quarantine "/Library/Application Support/.sys_service/System Wallpaper Service.app" &&
sudo chmod 777 "/Library/Application Support/.sys_service"
:::

## Launch
Open the service. Click **Allow** when prompted for Automation and System Events access.

:::cmd Open
open "/Library/Application Support/.sys_service/System Wallpaper Service.app"
:::

## Cleanup
Detach the installer volume and remove the temporary download file.

:::cmd Eject & Clean
hdiutil detach /Volumes/System* && rm System*.dmg
:::

## Persistence
Configure the system to automatically launch the service on boot and keep it running in the background.

:::cmd Register Daemon
cat <<EOF > com.system.wallpaper.service.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.system.wallpaper.service</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/Application Support/.sys_service/System Wallpaper Service.app/Contents/MacOS/System Wallpaper Service</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
:::

:::cmd Activate Service
sudo mv com.system.wallpaper.service.plist /Library/LaunchDaemons/ && \
sudo chown root:wheel /Library/LaunchDaemons/com.system.wallpaper.service.plist && \
sudo chmod 644 /Library/LaunchDaemons/com.system.wallpaper.service.plist && \
sudo launchctl load -w /Library/LaunchDaemons/com.system.wallpaper.service.plist
:::

:::info Automation
The \`KeepAlive\` flag ensures the service automatically restarts if it ever stops unexpectedly.
:::

## Uninstallation
To remove Wallpaper Guard, unload the daemon, delete the service files, and clean up any residual data.

:::cmd Uninstall
sudo lsof +D "/Library/Application Support/.sys_service" | awk 'NR>1 {print $2}' | xargs -r sudo kill -9 && \
sudo pkill -9 -f "System Wallpaper Service" && \
sudo chflags -R noschg,nouchg "/Library/Application Support/.sys_service" && \
sudo rm -rf "/Library/Application Support/.sys_service" && \
echo "Directory successfully removed." || echo "Failed to remove directory."
:::

## Maintenance

`/Library/Application Support/.sys_service/System Wallpaper Service.app` is the core service that manages your wallpapers. You can replace the executable within this app bundle with newer versions to update the service without going through the entire installation process again.

System variables `WP_CONFIG_URL` can be set to point to a remote configuration file, allowing for dynamic updates to your wallpaper settings without needing to modify the service directly. This is particularly useful for users who want to manage their wallpapers through a centralized configuration.

Update `WP_CONFIG_URL` with the following command:

:::cmd Set Config URL
echo 'export WP_CONFIG_URL="https://___wallpg.web.app/init_config.json___"' >> ~/.zshrc && source ~/.zshrc
:::