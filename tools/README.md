# Local catalog for MMM-Bring

> **Disclaimer.** This guide shows how to read Bring!'s article catalog out of a Bring! app package you own.
> Everything you do with it — getting the package, running the script, using the data — is your own decision
> and at your own risk. The catalog, names and icons belong to Bring! Labs AG. The generated files are meant
> for your own mirror only; please don't share or publish them. The script comes as is — no warranty, no
> liability.

The Bring! app on your phone carries the current article catalog with it: categories, article names in all
app languages, and the icons. `import-catalog.js` reads exactly that out of the app package and stores it in
the module folder as `catalog-local/`. From then on, your mirror sorts and shows your items just like the app.

It works with both app packages:
* Android — the app's `base.apk`
* iOS — the app's `.ipa`

Both contain the same catalog, so it doesn't matter which one you use.

## What you need

* **Node.js** — already there, MagicMirror runs on it.
* **A program that can read ZIP files** — an app package is one:
  * Raspberry Pi / Linux: `unzip`. Check with `unzip -v`; if it's missing, install it with `sudo apt install unzip`.
  * Mac: `unzip` is part of macOS.
  * Windows 10/11: nothing to do — the script uses Windows' own `tar.exe`.
* **iOS only: `carfile`** — Apple stores the icons in a single archive file (`Assets.car`); the small program
  `carfile` unpacks it. It goes into the module's `tools` folder, see below.

### iOS only: carfile

You install `carfile` once, on the computer your mirror runs on.

#### Installing carfile on: Raspberry Pi and other Linux systems

The commands assume MagicMirror is installed in the usual place, `~/MagicMirror`. If yours lives elsewhere,
change that part of the path in steps 7 and 8.

Open a terminal. Then copy each of the following commands, paste it into the terminal and press Enter — one
after the other, all in the same terminal window.

1. Go to your home folder (the downloads will land there):
   ```
   cd ~
   ```
2. Find out your processor type (`arm64` on a Raspberry Pi, `amd64` on a normal PC) and store the answer in the
   local variable `$ARCH` — the result is shown after the command:
   ```
   ARCH=$(uname -m | sed 's/aarch64/arm64/; s/x86_64/amd64/'); echo $ARCH
   ```
3. Download carfile for your processor type (the command uses `$ARCH` from step 2). If the answer is
   `wget: command not found`, install it first with `sudo apt install wget`:
   ```
   wget https://github.com/devcxm/carfile-go/releases/download/v0.8.0/carfile_0.8.0_linux_$ARCH.tar.gz
   ```
4. Download the list of checksums — step 5 needs it:
   ```
   wget https://github.com/devcxm/carfile-go/releases/download/v0.8.0/checksums.txt
   ```
5. Check that the download is intact — the answer must end with `OK`. If it says `FAILED`, the download is
   damaged: start again at step 3.
   ```
   sha256sum --check --ignore-missing checksums.txt
   ```
6. Unpack the download — this creates the folder `carfile_0.8.0_linux_arm64` (or `…_amd64`):
   ```
   tar -xzf carfile_0.8.0_linux_$ARCH.tar.gz
   ```
7. Copy the program `carfile` from the unpacked folder into the module's `tools` folder and make it executable:
   ```
   install -m 755 carfile_0.8.0_linux_$ARCH/carfile ~/MagicMirror/modules/MMM-Bring/tools/carfile
   ```
8. Test it — the answer must be `carfile 0.8.0`:
   ```
   ~/MagicMirror/modules/MMM-Bring/tools/carfile --version
   ```
9. Tidy up — the downloaded files are no longer needed:
   ```
   rm -r carfile_0.8.0_linux_$ARCH carfile_0.8.0_linux_$ARCH.tar.gz checksums.txt
   ```

#### Installing carfile on: Mac

The commands assume MagicMirror is installed in the usual place, `~/MagicMirror`. If yours lives elsewhere,
change that part of the path in steps 7 and 8.

Open the app *Terminal*. Then copy each of the following commands, paste it into the terminal and press Enter —
one after the other, all in the same terminal window.

1. Go to your home folder (the downloads will land there):
   ```
   cd ~
   ```
2. Find out your processor type (`arm64` on Apple Silicon, `amd64` on an Intel Mac) and store the answer in the
   local variable `$ARCH` — the result is shown after the command:
   ```
   ARCH=$(uname -m | sed 's/x86_64/amd64/'); echo $ARCH
   ```
3. Download carfile for your processor type (the command uses `$ARCH` from step 2):
   ```
   curl -LO https://github.com/devcxm/carfile-go/releases/download/v0.8.0/carfile_0.8.0_darwin_$ARCH.tar.gz
   ```
4. Download the list of checksums — step 5 needs it:
   ```
   curl -LO https://github.com/devcxm/carfile-go/releases/download/v0.8.0/checksums.txt
   ```
5. Check that the download is intact — the answer must end with `OK`. If it says `FAILED`, the download is
   damaged: start again at step 3.
   ```
   shasum -a 256 --check --ignore-missing checksums.txt
   ```
6. Unpack the download — this creates the folder `carfile_0.8.0_darwin_arm64` (or `…_amd64`):
   ```
   tar -xzf carfile_0.8.0_darwin_$ARCH.tar.gz
   ```
7. Copy the program `carfile` from the unpacked folder into the module's `tools` folder and make it executable:
   ```
   install -m 755 carfile_0.8.0_darwin_$ARCH/carfile ~/MagicMirror/modules/MMM-Bring/tools/carfile
   ```
8. Test it — the answer must be `carfile 0.8.0`:
   ```
   ~/MagicMirror/modules/MMM-Bring/tools/carfile --version
   ```
9. Tidy up — the downloaded files are no longer needed:
   ```
   rm -r carfile_0.8.0_darwin_$ARCH carfile_0.8.0_darwin_$ARCH.tar.gz checksums.txt
   ```

#### Installing carfile on: Windows

The commands assume MagicMirror is installed in the usual place, your user folder (`C:\Users\<you>\MagicMirror`).
If yours lives elsewhere, change that part of the path in steps 7 and 8.

Open *PowerShell*. Then copy each of the following commands, paste it into PowerShell and press Enter — one
after the other, all in the same window.

1. Go to your user folder (the downloads will land there):
   ```
   cd ~
   ```
2. Find out your processor type (`amd64` on most PCs, `arm64` on ARM laptops) and store the answer in the
   variable `$ARCH` — the result is shown after the command:
   ```
   $ARCH = $env:PROCESSOR_ARCHITECTURE.ToLower(); $ARCH
   ```
3. Download carfile for your processor type (the command uses `$ARCH` from step 2):
   ```
   Invoke-WebRequest "https://github.com/devcxm/carfile-go/releases/download/v0.8.0/carfile_0.8.0_windows_$ARCH.zip" -OutFile "carfile_0.8.0_windows_$ARCH.zip"
   ```
4. Download the list of checksums — step 5 needs it:
   ```
   Invoke-WebRequest "https://github.com/devcxm/carfile-go/releases/download/v0.8.0/checksums.txt" -OutFile checksums.txt
   ```
5. Check that the download is intact — the answer must be `OK`. If it says `FAILED`, the download is damaged:
   start again at step 3.
   ```
   if ((Get-FileHash "carfile_0.8.0_windows_$ARCH.zip").Hash -eq (Select-String "windows_$ARCH.zip" checksums.txt).Line.Split(" ")[0]) { "OK" } else { "FAILED" }
   ```
6. Unpack the download — this creates the folder `carfile_0.8.0_windows_amd64` (or `…_arm64`):
   ```
   Expand-Archive "carfile_0.8.0_windows_$ARCH.zip" -DestinationPath .
   ```
7. Copy the program `carfile.exe` from the unpacked folder into the module's `tools` folder:
   ```
   Copy-Item "carfile_0.8.0_windows_$ARCH\carfile.exe" "$HOME\MagicMirror\modules\MMM-Bring\tools\carfile.exe"
   ```
8. Test it — the answer must be `carfile 0.8.0`:
   ```
   & "$HOME\MagicMirror\modules\MMM-Bring\tools\carfile.exe" --version
   ```
9. Tidy up — the downloaded files are no longer needed:
   ```
   Remove-Item -Recurse "carfile_0.8.0_windows_$ARCH", "carfile_0.8.0_windows_$ARCH.zip", checksums.txt
   ```

## Android: get the base.apk

You copy the installed Bring! app from your phone to a computer over Wi-Fi, using Google's tool `adb`. Phone and
computer must be in the same network. The computer can be a Windows PC, a Mac or a Linux PC — not a Raspberry Pi:
Google offers `adb` only for normal PCs, and the `adb` from Raspberry Pi OS cannot pair over Wi-Fi.

Android needs two things from you: **pairing** — once, so the phone trusts the computer — and **connecting**,
which opens the actual session. Both are part of the recipe.

### On the phone — once

1. Open *Settings → About phone* and tap *Build number* seven times. This unlocks the *Developer options*. If
   they are already unlocked, Android tells you so — then simply go on.
2. Open *Settings → System → Developer options* and switch on *Wireless debugging*.

(Menu names differ a little between phone makers.)

### Mac

Open the app *Terminal*. Copy each command, paste it into the terminal and press Enter — one after the other,
all in the same window.

1. Go to your home folder:
   ```
   cd ~
   ```
2. Download Google's adb:
   ```
   curl -LO https://dl.google.com/android/repository/platform-tools-latest-darwin.zip
   ```
3. Unpack it — this creates the folder `platform-tools`:
   ```
   unzip platform-tools-latest-darwin.zip
   ```
4. Go into that folder:
   ```
   cd platform-tools
   ```
5. **Pair.** On the phone, tap the words *Wireless debugging* (not the switch), then *Pair device with pairing
   code*. The phone shows an IP address with port, e.g. `192.168.1.23:37123`, and a six-digit code. Keep this
   screen open and type both into the command, separated by a space — the answer must be `Successfully paired …`:
   ```
   ./adb pair <IP:port> <code>
   ```
6. **Connect.** Back on the main *Wireless debugging* screen, the phone shows *IP address & Port* — a
   **different** port than in step 5 (pairing uses its own, temporary one). Use this one — the answer must be
   `connected to …`:
   ```
   ./adb connect <IP:port>
   ```
7. Ask the phone where the Bring! app is stored — the answer is one or more lines starting with `package:`:
   ```
   ./adb shell pm path ch.publisheria.bring
   ```
8. Take the line that ends with `base.apk`, leave out `package:`, put the rest into this command and run it —
   `base.apk` then lies in the `platform-tools` folder:
   ```
   ./adb pull <path ending with base.apk> base.apk
   ```
9. Disconnect — then switch *Wireless debugging* off on the phone:
   ```
   ./adb disconnect
   ```
10. Copy `base.apk` to your mirror. If your mirror is a Raspberry Pi, put its IP address into this command — it
    asks for the Pi's password, and `base.apk` then lies in the Pi's home folder (`~/base.apk`):
    ```
    scp base.apk pi@<IP of your mirror>:
    ```
    If your mirror runs on this Mac, skip this step: the file is `~/platform-tools/base.apk`.

### Linux PC

Open a terminal. Copy each command, paste it into the terminal and press Enter — one after the other, all in the
same window.

1. Go to your home folder:
   ```
   cd ~
   ```
2. Download Google's adb:
   ```
   wget https://dl.google.com/android/repository/platform-tools-latest-linux.zip
   ```
3. Unpack it — this creates the folder `platform-tools`:
   ```
   unzip platform-tools-latest-linux.zip
   ```
4. Go into that folder:
   ```
   cd platform-tools
   ```
5. **Pair.** On the phone, tap the words *Wireless debugging* (not the switch), then *Pair device with pairing
   code*. The phone shows an IP address with port, e.g. `192.168.1.23:37123`, and a six-digit code. Keep this
   screen open and type both into the command, separated by a space — the answer must be `Successfully paired …`:
   ```
   ./adb pair <IP:port> <code>
   ```
6. **Connect.** Back on the main *Wireless debugging* screen, the phone shows *IP address & Port* — a
   **different** port than in step 5 (pairing uses its own, temporary one). Use this one — the answer must be
   `connected to …`:
   ```
   ./adb connect <IP:port>
   ```
7. Ask the phone where the Bring! app is stored — the answer is one or more lines starting with `package:`:
   ```
   ./adb shell pm path ch.publisheria.bring
   ```
8. Take the line that ends with `base.apk`, leave out `package:`, put the rest into this command and run it —
   `base.apk` then lies in the `platform-tools` folder:
   ```
   ./adb pull <path ending with base.apk> base.apk
   ```
9. Disconnect — then switch *Wireless debugging* off on the phone:
   ```
   ./adb disconnect
   ```
10. Copy `base.apk` to your mirror. If your mirror is a Raspberry Pi, put its IP address into this command — it
    asks for the Pi's password, and `base.apk` then lies in the Pi's home folder (`~/base.apk`):
    ```
    scp base.apk pi@<IP of your mirror>:
    ```
    If your mirror runs on this PC, skip this step: the file is `~/platform-tools/base.apk`.

### Windows

Open *PowerShell*. Copy each command, paste it into PowerShell and press Enter — one after the other, all in the
same window.

1. Go to your user folder:
   ```
   cd ~
   ```
2. Download Google's adb:
   ```
   Invoke-WebRequest https://dl.google.com/android/repository/platform-tools-latest-windows.zip -OutFile platform-tools.zip
   ```
3. Unpack it — this creates the folder `platform-tools`:
   ```
   Expand-Archive platform-tools.zip -DestinationPath .
   ```
4. Go into that folder:
   ```
   cd platform-tools
   ```
5. **Pair.** On the phone, tap the words *Wireless debugging* (not the switch), then *Pair device with pairing
   code*. The phone shows an IP address with port, e.g. `192.168.1.23:37123`, and a six-digit code. Keep this
   screen open and type both into the command, separated by a space — the answer must be `Successfully paired …`:
   ```
   .\adb pair <IP:port> <code>
   ```
6. **Connect.** Back on the main *Wireless debugging* screen, the phone shows *IP address & Port* — a
   **different** port than in step 5 (pairing uses its own, temporary one). Use this one — the answer must be
   `connected to …`:
   ```
   .\adb connect <IP:port>
   ```
7. Ask the phone where the Bring! app is stored — the answer is one or more lines starting with `package:`:
   ```
   .\adb shell pm path ch.publisheria.bring
   ```
8. Take the line that ends with `base.apk`, leave out `package:`, put the rest into this command and run it —
   `base.apk` then lies in the `platform-tools` folder:
   ```
   .\adb pull <path ending with base.apk> base.apk
   ```
9. Disconnect — then switch *Wireless debugging* off on the phone:
   ```
   .\adb disconnect
   ```
10. Copy `base.apk` to your mirror. If your mirror is a Raspberry Pi, put its IP address into this command — it
    asks for the Pi's password, and `base.apk` then lies in the Pi's home folder (`~/base.apk`):
    ```
    scp base.apk pi@<IP of your mirror>:
    ```
    If PowerShell answers that `scp` is not recognized, Windows' own SSH tools are not installed yet. Install them
    once:
    1. Right-click the *Start* button and choose *Terminal (Admin)* (Windows 11) or *Windows PowerShell (Admin)*
       (Windows 10). Confirm the question whether the app may make changes with *Yes*.
    2. In this admin window, run — it takes a minute; the answer shows `Online : True`:
       ```
       Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
       ```
    3. Close the admin window. Open a normal PowerShell window again, go back into the folder and repeat step 10:
       ```
       cd ~\platform-tools
       ```

    If your mirror runs on this PC, skip this step: the file is `C:\Users\<you>\platform-tools\base.apk`.

## iOS: get the .ipa

You download the Bring! app package straight from Apple's App Store, using the free tool `ipatool` and your
Apple ID. You don't need an iPhone for this — just an Apple ID with two-factor authentication. The download
is about 110 MB.

### Raspberry Pi and other Linux systems

Do this on the computer your mirror runs on — then the file is already where it's needed. Open a terminal. Copy
each command, paste it into the terminal and press Enter — one after the other, all in the same terminal window.

1. Create a work folder and go into it:
   ```
   mkdir -p ~/bring-ios && cd ~/bring-ios
   ```
2. Find out your processor type (`arm64` on a Raspberry Pi, `amd64` on a normal PC) and store the answer in the
   local variable `$ARCH` — the result is shown after the command:
   ```
   ARCH=$(uname -m | sed 's/aarch64/arm64/; s/x86_64/amd64/'); echo $ARCH
   ```
3. Download ipatool for your processor type (the command uses `$ARCH` from step 2):
   ```
   wget https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-linux-$ARCH.tar.gz
   ```
4. Download its checksum — step 5 needs it:
   ```
   wget https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-linux-$ARCH.tar.gz.sha256sum
   ```
5. Check that the download is intact — the answer must be `OK`. If it says `FAILED`, the download is damaged:
   start again at step 3.
   ```
   [ "$(cat ipatool-2.8.1-linux-$ARCH.tar.gz.sha256sum)" = "$(sha256sum ipatool-2.8.1-linux-$ARCH.tar.gz | cut -d' ' -f1)" ] && echo OK || echo FAILED
   ```
6. Unpack it and give the program the short name `ipatool`:
   ```
   tar -xzf ipatool-2.8.1-linux-$ARCH.tar.gz && mv bin/ipatool-2.8.1-linux-$ARCH ipatool && rmdir bin
   ```
7. ipatool keeps your login in an encrypted file and needs a password of its own for it — choose one and type it
   (nothing is shown while you type). It is stored in the variable `$KP` for this window only:
   ```
   read -s -p "Choose a password for ipatool's login file: " KP; echo
   ```
8. On a Raspberry Pi with desktop, the system's password store is locked and would make ipatool wait forever.
   This line tells ipatool to use its own file instead — harmless on other systems:
   ```
   export DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent
   ```
9. Type your Apple ID and its password (the password is not shown) — stored in `$AID` and `$APW` for this window
   only:
   ```
   read -p "Apple ID: " AID; read -s -p "Apple ID password: " APW; echo
   ```
10. **Log in, part 1 — have an Apple device ready.** This command starts the login. Apple then asks one of your
    Apple devices (iPhone, iPad or Mac) whether to allow the sign-in:
    ```
    ./ipatool --non-interactive --keychain-passphrase "$KP" auth login --email "$AID" --password "$APW"
    ```
    What happens:
    - The command ends with the message
      `2FA code is required; run the command again and supply a code using the --auth-code flag` —
      that's expected, you log in again with the code in the next step.
    - On your Apple device, a dialog appears: a sign-in from another device, with a location, asking whether to
      allow it. Tap **Allow**.
    - Only then a second window shows the six-digit code.

    **Tip from practice:** the code window may vanish again right away, before you can read it. It stayed open
    on an iPad whose *Settings* app was open at *[your name] → Sign-In & Security* at that moment; on a Mac
    without the settings open, it only flashed up. So open that page on your Apple device **before** you run
    this command. We don't know the exact reason — it's simply what worked.
11. **Log in, part 2 — with the code.** Copy the command below, but **don't press Enter yet**: at its very end,
    replace `<code>` with the six-digit code from step 10 (no spaces, no `<` `>`). For example, if the code is
    `482913`, the command ends with `--auth-code 482913`. Then press Enter — within a few minutes, the code
    expires quickly:
    ```
    ./ipatool --non-interactive --keychain-passphrase "$KP" auth login --email "$AID" --password "$APW" --auth-code <code>
    ```
12. Check the login — the answer must contain `success=true`:
    ```
    ./ipatool --non-interactive --keychain-passphrase "$KP" auth info
    ```
13. Download the Bring! app package. `--purchase` adds the free app to your Apple ID once if it isn't there yet.
    This takes a while:
    ```
    ./ipatool --non-interactive --keychain-passphrase "$KP" download -b ch.publisheria.bring --purchase -o bring.ipa
    ```
14. Check the result — `bring.ipa` must be there, about 110 MB:
    ```
    ls -lh bring.ipa
    ```
15. Log out of the App Store again and tidy up the downloads — the file `bring.ipa` stays:
    ```
    ./ipatool --non-interactive --keychain-passphrase "$KP" auth revoke; rm ipatool ipatool-2.8.1-linux-$ARCH.tar.gz*
    ```

Your app package is now `~/bring-ios/bring.ipa`.

### Mac

Open the app *Terminal*. Copy each command, paste it into the terminal and press Enter — one after the other,
all in the same terminal window.

1. Create a work folder and go into it:
   ```
   mkdir -p ~/bring-ios && cd ~/bring-ios
   ```
2. Find out your processor type (`arm64` on Apple Silicon, `amd64` on an Intel Mac) and store the answer in the
   local variable `$ARCH` — the result is shown after the command:
   ```
   ARCH=$(uname -m | sed 's/x86_64/amd64/'); echo $ARCH
   ```
3. Download ipatool for your processor type (the command uses `$ARCH` from step 2):
   ```
   curl -LO https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-macos-$ARCH.tar.gz
   ```
4. Download its checksum — step 5 needs it:
   ```
   curl -LO https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-macos-$ARCH.tar.gz.sha256sum
   ```
5. Check that the download is intact — the answer must be `OK`. If it says `FAILED`, the download is damaged:
   start again at step 3.
   ```
   [ "$(cat ipatool-2.8.1-macos-$ARCH.tar.gz.sha256sum)" = "$(shasum -a 256 ipatool-2.8.1-macos-$ARCH.tar.gz | cut -d' ' -f1)" ] && echo OK || echo FAILED
   ```
6. Unpack it and give the program the short name `ipatool`:
   ```
   tar -xzf ipatool-2.8.1-macos-$ARCH.tar.gz && mv bin/ipatool-2.8.1-macos-$ARCH ipatool && rmdir bin
   ```
7. Type your Apple ID and its password (the password is not shown) — stored in `$AID` and `$APW` for this window
   only:
   ```
   read -p "Apple ID: " AID; read -s -p "Apple ID password: " APW; echo
   ```
8. **Log in, part 1 — have an Apple device ready.** This command starts the login. Apple then asks one of your
   Apple devices (iPhone, iPad or Mac) whether to allow the sign-in:
   ```
   ./ipatool --non-interactive auth login --email "$AID" --password "$APW"
   ```
   What happens:
   - The command ends with the message
     `2FA code is required; run the command again and supply a code using the --auth-code flag` —
     that's expected, you log in again with the code in the next step.
   - On your Apple device, a dialog appears: a sign-in from another device, with a location, asking whether to
     allow it. Tap **Allow**.
   - Only then a second window shows the six-digit code.

   **Tip from practice:** the code window may vanish again right away, before you can read it. It stayed open
   on an iPad whose *Settings* app was open at *[your name] → Sign-In & Security* at that moment; on a Mac
   without the settings open, it only flashed up. So open that page on your Apple device **before** you run
   this command. We don't know the exact reason — it's simply what worked.
9. **Log in, part 2 — with the code.** Copy the command below, but **don't press Enter yet**: at its very end,
   replace `<code>` with the six-digit code from step 8 (no spaces, no `<` `>`). For example, if the code is
   `482913`, the command ends with `--auth-code 482913`. Then press Enter — within a few minutes, the code
   expires quickly:
   ```
   ./ipatool --non-interactive auth login --email "$AID" --password "$APW" --auth-code <code>
   ```
10. Check the login — the answer must contain `success=true`:
    ```
    ./ipatool --non-interactive auth info
    ```
11. Download the Bring! app package. `--purchase` adds the free app to your Apple ID once if it isn't there yet.
    This takes a while:
    ```
    ./ipatool --non-interactive download -b ch.publisheria.bring --purchase -o bring.ipa
    ```
12. Check the result — `bring.ipa` must be there, about 110 MB:
    ```
    ls -lh bring.ipa
    ```
13. Log out of the App Store again and tidy up the downloads — the file `bring.ipa` stays:
    ```
    ./ipatool --non-interactive auth revoke; rm ipatool ipatool-2.8.1-macos-$ARCH.tar.gz*
    ```
14. Copy `bring.ipa` to your mirror. If your mirror is a Raspberry Pi, put its IP address into this command — it
    asks for the Pi's password, and `bring.ipa` then lies in the Pi's home folder (`~/bring.ipa`):
    ```
    scp bring.ipa pi@<IP of your mirror>:
    ```
    If your mirror runs on this Mac, skip this step: the file is `~/bring-ios/bring.ipa`.

### Windows

Open *PowerShell*. Copy each command, paste it into PowerShell and press Enter — one after the other, all in the
same window.

1. Create a work folder and go into it:
   ```
   mkdir ~\bring-ios -Force; cd ~\bring-ios
   ```
2. Find out your processor type (`amd64` on most PCs, `arm64` on ARM laptops) and store the answer in the
   variable `$ARCH` — the result is shown after the command:
   ```
   $ARCH = $env:PROCESSOR_ARCHITECTURE.ToLower(); $ARCH
   ```
3. Download ipatool for your processor type (the command uses `$ARCH` from step 2):
   ```
   Invoke-WebRequest "https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-windows-$ARCH.tar.gz" -OutFile "ipatool-2.8.1-windows-$ARCH.tar.gz"
   ```
4. Download its checksum — step 5 needs it:
   ```
   Invoke-WebRequest "https://github.com/majd/ipatool/releases/download/v2.8.1/ipatool-2.8.1-windows-$ARCH.tar.gz.sha256sum" -OutFile "ipatool-2.8.1-windows-$ARCH.tar.gz.sha256sum"
   ```
5. Check that the download is intact — the answer must be `OK`. If it says `FAILED`, the download is damaged:
   start again at step 3.
   ```
   if ((Get-FileHash "ipatool-2.8.1-windows-$ARCH.tar.gz").Hash -eq (Get-Content "ipatool-2.8.1-windows-$ARCH.tar.gz.sha256sum").Trim()) { "OK" } else { "FAILED" }
   ```
6. Unpack it and give the program the short name `ipatool.exe`:
   ```
   tar -xzf "ipatool-2.8.1-windows-$ARCH.tar.gz"; Move-Item "bin\ipatool-2.8.1-windows-$ARCH.exe" ipatool.exe; Remove-Item bin
   ```
7. ipatool keeps your login in an encrypted file and needs a password of its own for it — choose one and type it
   (you see a `*` for each character you type). It is stored in the variable `$KP` for this window only:
   ```
   $KP = [System.Net.NetworkCredential]::new("", (Read-Host "Choose a password for ipatool's login file" -AsSecureString)).Password
   ```
8. Type your Apple ID and its password (you see a `*` for each character of the password) — stored in `$AID`
   and `$APW` for this window only:
   ```
   $AID = Read-Host "Apple ID"; $APW = [System.Net.NetworkCredential]::new("", (Read-Host "Apple ID password" -AsSecureString)).Password
   ```
9. **Log in, part 1 — have an Apple device ready.** This command starts the login. Apple then asks one of your
   Apple devices (iPhone, iPad or Mac) whether to allow the sign-in:
   ```
   .\ipatool.exe --non-interactive --keychain-passphrase "$KP" auth login --email "$AID" --password "$APW"
   ```
   What happens:
   - The command ends with the message
     `2FA code is required; run the command again and supply a code using the --auth-code flag` —
     that's expected, you log in again with the code in the next step.
   - On your Apple device, a dialog appears: a sign-in from another device, with a location, asking whether to
     allow it. Tap **Allow**.
   - Only then a second window shows the six-digit code.

   **Tip from practice:** the code window may vanish again right away, before you can read it. It stayed open
   on an iPad whose *Settings* app was open at *[your name] → Sign-In & Security* at that moment; on a Mac
   without the settings open, it only flashed up. So open that page on your Apple device **before** you run
   this command. We don't know the exact reason — it's simply what worked.
10. **Log in, part 2 — with the code.** Copy the command below, but **don't press Enter yet**: at its very end,
    replace `<code>` with the six-digit code from step 9 (no spaces, no `<` `>`). For example, if the code is
    `482913`, the command ends with `--auth-code 482913`. Then press Enter — within a few minutes, the code
    expires quickly:
    ```
    .\ipatool.exe --non-interactive --keychain-passphrase "$KP" auth login --email "$AID" --password "$APW" --auth-code <code>
    ```
11. Check the login — the answer must contain `success=true`:
    ```
    .\ipatool.exe --non-interactive --keychain-passphrase "$KP" auth info
    ```
12. Download the Bring! app package. `--purchase` adds the free app to your Apple ID once if it isn't there yet.
    This takes a while:
    ```
    .\ipatool.exe --non-interactive --keychain-passphrase "$KP" download -b ch.publisheria.bring --purchase -o bring.ipa
    ```
13. Check the result — `bring.ipa` must be there, about 110 MB (about 110,000,000 bytes):
    ```
    Get-Item bring.ipa
    ```
14. Log out of the App Store again and tidy up the downloads — the file `bring.ipa` stays:
    ```
    .\ipatool.exe --non-interactive --keychain-passphrase "$KP" auth revoke; Remove-Item ipatool.exe, "ipatool-2.8.1-windows-$ARCH.tar.gz*"
    ```
15. Copy `bring.ipa` to your mirror. If your mirror is a Raspberry Pi, put its IP address into this command — it
    asks for the Pi's password, and `bring.ipa` then lies in the Pi's home folder (`~/bring.ipa`):
    ```
    scp bring.ipa pi@<IP of your mirror>:
    ```
    If PowerShell answers that `scp` is not recognized, Windows' own SSH tools are not installed yet. Install them
    once:
    1. Right-click the *Start* button and choose *Terminal (Admin)* (Windows 11) or *Windows PowerShell (Admin)*
       (Windows 10). Confirm the question whether the app may make changes with *Yes*.
    2. In this admin window, run — it takes a minute; the answer shows `Online : True`:
       ```
       Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
       ```
    3. Close the admin window. Open a normal PowerShell window again, go back into the folder and repeat step 15:
       ```
       cd ~\bring-ios
       ```

    If your mirror runs on this PC, skip this step: the file is `C:\Users\<you>\bring-ios\bring.ipa`.

## Import

Do this on the computer your mirror runs on. The commands assume MagicMirror is installed in the usual place,
`MagicMirror` in your home folder; if yours lives elsewhere, change that part of the path.

### Raspberry Pi / Linux / Mac

Open a terminal. Copy each command, paste it into the terminal and press Enter — one after the other, all in
the same window.

1. Go to the module folder:
   ```
   cd ~/MagicMirror/modules/MMM-Bring
   ```
2. Run the import with your app package. Replace `<file>` with where it lies: `~/base.apk` or `~/bring.ipa` if
   you copied it to your Pi, `~/bring-ios/bring.ipa` if you downloaded it right here, `~/platform-tools/base.apk`
   if your mirror runs on the computer you used for Android. The answer ends with `written to …` and a summary
   like `source apk, 20 languages, de-DE 604 items (CATALOG.VERSION 10), 784 icons`:
   ```
   node tools/import-catalog.js <file>
   ```
3. Restart MagicMirror the way you usually do (e.g. `pm2 restart MagicMirror`).
4. Check the MagicMirror log. It now shows one line per language in use, e.g.
   `MMM-Bring: catalog = local, de-DE, 604 items, CATALOG.VERSION 10, imported 2026-11-23`.
   If it says `catalog = web …` instead, the import didn't take effect — check step 2.

### Windows

Open *PowerShell*. Copy each command, paste it into PowerShell and press Enter — one after the other, all in the
same window.

1. Go to the module folder:
   ```
   cd ~\MagicMirror\modules\MMM-Bring
   ```
2. Run the import with your app package. Replace `<file>` with where it lies: `~\platform-tools\base.apk` or
   `~\bring-ios\bring.ipa`. The answer ends with `written to …` and a summary like
   `source apk, 20 languages, de-DE 604 items (CATALOG.VERSION 10), 784 icons`:
   ```
   node tools/import-catalog.js <file>
   ```
3. Restart MagicMirror the way you usually do.
4. Check the MagicMirror log. It now shows one line per language in use, e.g.
   `MMM-Bring: catalog = local, de-DE, 604 items, CATALOG.VERSION 10, imported 2026-11-23`.
   If it says `catalog = web …` instead, the import didn't take effect — check step 2.

You can delete the app package afterwards; the module only needs `catalog-local/`.

## Update

Bring! updates its catalog with new app versions. To follow, get the current app package again (Android or iOS,
as above) and repeat the *Import*. The new catalog replaces the old one.

## Remove

To go back to the web catalog, run this in the module folder (Windows: `cd ~\MagicMirror\modules\MMM-Bring`
first). The answer is `local catalog removed …`:
```
node tools/import-catalog.js --remove
```
Then restart MagicMirror.

## Good to know

* `catalog-local/` and a `carfile` in `tools/` are ignored by git: a `git pull` neither touches nor removes them.
* Without `catalog-local/`, the module works exactly as before, with Bring!'s web catalog.
