### 1. Download and Mount the DMG
Open Terminal and run these commands to download the file and mount the disk image:

> Download the DMG

```bash
curl -L -O https://github.com/ChuTM/wallpaper-guard/releases/download/1.0.3/Wallpaper.Guard-1.0.3-arm64.dmg
```

> Mount the DMG

```bash
hdiutil attach Wallpaper.Guard-1.0.3-arm64.dmg
```

### 2. Copy to Applications and Remove "Quarantine"
MacOS adds a "quarantine" flag to files downloaded from the web. This is what causes the first image warning you shared. Removing this flag tells macOS to trust the app.

> Copy the app to your Applications folder

```bash
cp -R "/Volumes/Wallpaper Guard 1.0.3-arm64/Wallpaper Guard.app" /Applications/
```

> Remove the quarantine attribute (The "Magic" Command)

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Wallpaper Guard.app"
```

> Unmount the DMG

```bash
hdiutil detach "/Volumes/Wallpaper Guard 1.0.3-arm64"
```

*(Note: `sudo` will prompt for your Mac login password. Characters won't show as you type.)*

### 3. Granting System Events Access
Regarding your second image (requesting access to **System Events**), this is a privacy permission. While you can't easily "click" the button via Terminal for security reasons, you can trigger the system to prompt you correctly or check the status. 

Once you launch the app for the first time:
1. Run: `open "/Applications/Wallpaper Guard.app"`
2. When the popup in your second screenshot appears, click **Allow**. 
3. If it doesn't work, go to **System Settings > Privacy & Security > Automation** and ensure "Wallpaper Guard" has "System Events" toggled **ON**.

### 4. Managing Login Items
Your third image shows the app added itself to your **Login Items**. To verify or manage this via Terminal:

> List current login items (requires manual inspection)

```bash
sfltool dump-storage ~/Library/Application\ Support/com.apple.backgroundtaskmanagement/BackgroundItems.btm
```

*Alternatively, just go to **System Settings > General > Login Items** to toggle it off if you don't want it starting automatically.*
