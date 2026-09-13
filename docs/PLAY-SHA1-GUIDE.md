# Extract SHA-1 from Google Play builds (ArtCloset)

ArtCloset uses **native Google Sign-In** for Drive backup. Google matches the installed app by:

```
package name  +  signing certificate SHA-1
```

For ArtCloset the package is always **`com.dukenizer.artcloset`**.

If the SHA-1 on the phone does not match an Android OAuth client in Google Cloud, Connect Google fails with **`DEVELOPER_ERROR` / code `10`**.

This guide explains how to **find and verify SHA-1 fingerprints** from Play builds — including from an **AAB** file — and register them in Google Cloud.

Related: [VIP-AND-DRIVE.md](VIP-AND-DRIVE.md) (OAuth setup, troubleshooting, internal test checklist).  
Quick AAB command only: [PLAY-SHA1-AAB-EXTRACT.md](PLAY-SHA1-AAB-EXTRACT.md).

---

## Which SHA-1 do you need?

| Install source | Certificate you need | Best method |
| --- | --- | --- |
| **Google Play** (production / internal / closed test) | **App signing** cert (what Play re-signs with) | Play-signed APK + `apksigner` (**Method 2**) |
| **EAS preview APK** sideloaded before Play | **Upload** cert (your EAS keystore) | AAB/APK from that build + `jarsigner` (**Method 3**) |
| **Play Console “App signing” page** | Classical / Post-quantum / Upload listed by Google | Console UI (**Method 1**) |

**Important:** An **AAB downloaded from Play** is usually signed with your **upload key**, not the key Play uses when users install from the store. SHA-1 from that AAB alone is **not enough** for Play installs — always verify with a **Play-signed APK** (Method 2) if Connect fails after registering Console fingerprints.

---

## Prerequisites (Windows)

1. **Android Studio** installed (provides Java + Android SDK).
2. Note your SDK build-tools version, e.g. `36.1.0`:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" | Select-Object Name
```

3. Set Java for the session:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

Adjust the path if Android Studio is installed elsewhere.

---

## Quick reference — SHA-1 from an AAB

Copy-paste in **PowerShell**. Replace `C:\path\to\artcloset.aab` with your downloaded `.aab` path.

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs "C:\path\to\artcloset.aab" 2>&1 | Select-String "SHA1"
```

Expected output includes a line like `SHA1: AB:CD:EF:...` — that is the **upload key** fingerprint. Register it in Google Cloud (see below). For **Play Store installs**, also run [Method 2](#method-2--play-signed-apk-source-of-truth) — the AAB upload cert may differ from what users install.

---

## Method 1 — Play Console (no file extraction)

Fastest way to copy fingerprints Google knows about.

1. Open [Google Play Console](https://play.google.com/console) → **ArtCloset**.
2. Go to **Test and release** → **App integrity** (or **Setup** → **App signing** / **Manage Play app signing**).
3. Under **App signing key certificate**, copy **SHA-1** for:
   - **App signing key certificate** (Classical / current)
   - **Post-quantum** (if listed)
   - **Upload key certificate**
   - **Previous** signing key (if listed)
4. Register **each** SHA-1 as its own Android OAuth client (see [Register in Google Cloud](#register-in-google-cloud)).

Still run **Method 2** if Connect fails — Console labels can disagree with **Signer #1** on the APK users actually install.

---

## Method 2 — Play-signed APK (source of truth)

Use this to confirm what certificate is on the build **users install from Play**.

### Download a signed APK from Play

1. Play Console → **Test and release** → **Latest releases and bundles**.
2. Open the release (e.g. production or internal test).
3. Open the bundle row (e.g. `versionCode 4`).
4. **Downloads** → download a **signed APK** (not the raw upload AAB alone).

### Extract SHA-1 with apksigner

Replace paths and build-tools version as needed:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$apksigner = "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.1.0\apksigner.bat"
& $apksigner verify --print-certs "C:\Users\Owner\Downloads\artcloset-signed.apk"
```

Example output:

```
Signer #1 certificate SHA-1 digest: af3e921c1b2c3d4e5f60718293a4b5c6d7e8f901
Signer #2 certificate SHA-1 digest: ...
```

**Use Signer #1 only.** Ignore **Source Stamp Signer** / secondary signers unless Google support tells you otherwise.

### Format for Google Cloud

Google Cloud expects colons and uppercase hex:

```
af3e921c1b2c3d4e5f60718293a4b5c6d7e8f901  →  AF:3E:92:1C:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:01
```

Quick PowerShell formatter (paste the 40-char hex from apksigner):

```powershell
$hex = "af3e921c1b2c3d4e5f60718293a4b5c6d7e8f901".ToUpper()
($hex -split '(?<=\G.{2})' | Where-Object { $_ }) -join ':'
```

---

## Method 3 — SHA-1 from an AAB file

Use this when you have the **`.aab`** (from Play Console, EAS artifact, or local build) and want to check the **upload** certificate — or compare it to what you registered in Cloud.

### Download the AAB from Play Console

1. Play Console → **Test and release** → **Latest releases and bundles**.
2. Open the release → open the app bundle row.
3. **Downloads** → **App bundle** (`.aab`).

You can also download the production AAB from [expo.dev](https://expo.dev) → project → **Builds** → production Android build → **Download**.

### Option A — jarsigner (recommended for AAB)

Same command as [Quick reference — SHA-1 from an AAB](#quick-reference--sha-1-from-an-aab):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs "C:\path\to\artcloset.aab" 2>&1 | Select-String "SHA1"
```

Look for lines like:

```
SHA1: AB:CD:EF:...
```

That is the **upload key** SHA-1 embedded in the AAB signature.

### Option B — keytool on the certificate inside the AAB

An AAB is a ZIP archive. The signing cert lives under `META-INF/`.

```powershell
$aab = "C:\Users\Owner\Downloads\artcloset.aab"
$work = "$env:TEMP\artcloset-aab-inspect"
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null
Copy-Item $aab "$work\bundle.zip"
Expand-Archive "$work\bundle.zip" "$work\extracted"
Get-ChildItem "$work\extracted\META-INF" -Include *.RSA,*.DSA,*.EC -Recurse
```

Pick the cert file (often `META-INF\CERT.RSA` or `META-INF\UPLOAD.RSA`), then:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\keytool.exe" -printcert -file "$work\extracted\META-INF\CERT.RSA"
```

Copy the **SHA1** line from the output.

### What the AAB SHA-1 tells you

| You extracted SHA-1 from… | It matches… |
| --- | --- |
| Play-downloaded AAB | Usually your **upload / EAS** key |
| EAS production AAB artifact | Your **upload / EAS** key |
| Play-signed APK (Method 2) | What **Play Store installs** use |

For **Google Play installs**, register Method 2 (Play-signed APK) **and** Method 1 (Console app signing keys). Keep upload-key clients too for sideloaded preview APKs.

---

## Method 4 — EAS / local keystore (preview builds)

If you sign preview APKs with EAS credentials and sideload them (not from Play):

```powershell
# If you have the keystore file and alias (from EAS credentials)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\keytool.exe" -list -v -keystore "path\to\keystore.jks" -alias your-alias
```

Or extract from a signed preview APK with the same `apksigner verify --print-certs` command as Method 2.

---

## Register in Google Cloud

Do this once per distinct SHA-1. **Do not delete** old clients until you know nothing uses that cert.

1. [Google Cloud Console](https://console.cloud.google.com/) → project that owns ArtCloset OAuth.
2. **Google Auth Platform** → **Clients** → **Create client**.
3. Type: **Android**.
4. Package name: `com.dukenizer.artcloset`
5. SHA-1: paste the formatted fingerprint.
6. **Create** — note the new client ID (any Android client ID from this project works in `GOOGLE_ANDROID_CLIENT_ID`).

Also confirm:

- **Google Drive API** enabled.
- **Data Access** includes `https://www.googleapis.com/auth/drive.appdata`.
- For public Play release: OAuth **Audience** is **In production** (not Testing-only).

Wait **5 minutes to a few hours** for Google Cloud to propagate, then **force-stop** ArtCloset and try **Connect Google** again. You do **not** need a new AAB when only adding SHA-1 clients.

---

## Checklist before production

- [ ] Registered **Upload** SHA-1 (from AAB or Console upload cert)
- [ ] Registered **App signing** SHA-1s from Play Console (Classical, post-quantum, previous if any)
- [ ] Verified **Signer #1** from a **Play-downloaded signed APK** (Method 2)
- [ ] Smoke-tested on a **Play-installed** build: VIP → Connect Google → Backup now → Restore
- [ ] OAuth Audience published to **Production** before wide release

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `DEVELOPER_ERROR` code `10` at Connect | SHA-1 not registered for installed cert | Method 2 → register Signer #1 |
| Works on sideload, fails on Play | Only upload SHA-1 registered | Add Play app signing SHA-1s |
| Works for testers, fails for public users | OAuth Audience still **Testing** | Publish OAuth app; remove test-user-only gate |
| `jarsigner` / `apksigner` not found | SDK or Java path wrong | Install Android Studio; set `$env:JAVA_HOME` |
| `keytool -printcert -jarfile app.apk` fails | Common on Play-signed APKs | Use **apksigner**, not keytool on the APK |

---

## References

- [Play App Signing — register API fingerprints](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Google Sign-In — client auth SHA-1](https://developers.google.com/android/guides/client-auth)
- [react-native-google-signin — DEVELOPER_ERROR / code 10](https://react-native-google-signin.github.io/docs/troubleshooting)
- ArtCloset internal ops: [VIP-AND-DRIVE.md](VIP-AND-DRIVE.md)
