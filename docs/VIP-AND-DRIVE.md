# VIP codes & Google Drive (internal testing)

## Secrets (never commit)

Create `.env` from `.env.example`:

```
ARTCLOSET_VIP_SALT=<same salt used to generate hashes>
GOOGLE_ANDROID_CLIENT_ID=<Android OAuth client ID ending in .apps.googleusercontent.com>
GOOGLE_IOS_CLIENT_ID=
```

Also set the same keys as **EAS secrets** for preview/production builds.

## Regenerate VIP hash lists

```powershell
$env:ARTCLOSET_VIP_SALT="your-salt"
npm run generate:vip-hashes -- "$env:USERPROFILE\Downloads\artcloset_vip_codes.csv"
```

Commits **only** `src/entitlements/vipHashes.generated.ts` (hashes). Plaintext codes stay in your CSV outside the repo.

## Google Cloud (Drive)

Connect Google uses **native Google Sign-In** (on-device account picker). It does **not** open a browser tab and does **not** use a Web OAuth client or a custom redirect URI.

1. Google Cloud Console → enable **Google Drive API**
2. OAuth consent screen (External / Testing) → add every tester Gmail under **Test users**
3. Create an **Android** OAuth client:
   - Package name: `com.dukenizer.artcloset`
   - SHA-1: EAS preview/dev keystore (and later Play App Signing if you ship to Play)
4. Put that Android **client ID** into `.env` as `GOOGLE_ANDROID_CLIENT_ID` (and the matching EAS secret)
5. Optional later: an **iOS** OAuth client (`com.dukenizer.artcloset`) → `GOOGLE_IOS_CLIENT_ID`
6. **Rebuild** the preview/dev APK after adding the native module or changing `.env`

Do **not** create a Web client for this flow. Google rejects custom URI schemes on Android (`invalid_request`).

Scope used: `https://www.googleapis.com/auth/drive.appdata`

## Internal test checklist

- [ ] Redeem VIP1 / VIP2 → Settings shows Active until date  
- [ ] Same code again → already used  
- [ ] Second code while active → already has active VIP  
- [ ] Free user sees Drive upsell  
- [ ] VIP + `GOOGLE_ANDROID_CLIENT_ID` → Connect (account picker, not Chrome) → Backup now → Restore (confirm)  
- [ ] Catalog untouched after VIP expiry messaging
