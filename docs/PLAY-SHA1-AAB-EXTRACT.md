# Quick extract: SHA-1 from ArtCloset AAB

Use this on **Windows PowerShell** after downloading the `.aab` from Play Console or EAS.

Replace `C:\path\to\artcloset.aab` with your file path.

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs "C:\path\to\artcloset.aab" 2>&1 | Select-String "SHA1"
```

## What you get

- Output line like: `SHA1: AB:CD:EF:...`
- That fingerprint is usually the **upload / EAS** signing key on the AAB.

## Next steps

1. Google Cloud → **Google Auth Platform** → **Clients** → **Create client** → **Android**
2. Package name: `com.dukenizer.artcloset`
3. Paste the SHA-1 (with colons)
4. Wait a few minutes, force-stop ArtCloset, try **Connect Google** again

For **Google Play installs**, also register SHA-1 from a **Play-signed APK** — see the full guide.

Full guide: [PLAY-SHA1-GUIDE.md](PLAY-SHA1-GUIDE.md)
