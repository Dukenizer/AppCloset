# VIP codes & Google Drive (internal testing)

## Secrets (never commit)

Create `.env` from `.env.example`:

```
ARTCLOSET_VIP_SALT=<same salt used to generate hashes>
GOOGLE_ANDROID_CLIENT_ID=<OAuth Android client ID>
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

1. Google Cloud Console → enable **Google Drive API**
2. OAuth consent screen (External / Testing) with your tester Google accounts
3. Create OAuth client:
   - For Expo `AuthSession` browser flow, a **Web** client ID is usually required (set as `GOOGLE_ANDROID_CLIENT_ID` in `.env` for now), with redirect URIs covering your scheme (`artcloset://oauth`) and any Expo auth proxy URI you use
   - Also create an **Android** client (`com.dukenizer.artcloset` + EAS keystore SHA-1) for Play / native Sign-In later
4. Put the client ID used by the app in `.env` / EAS secrets as `GOOGLE_ANDROID_CLIENT_ID`
5. Test Drive in a **dev or preview build** (OAuth redirects are unreliable in Expo Go)

Scope used: `https://www.googleapis.com/auth/drive.appdata`

## Internal test checklist

- [ ] Redeem VIP1 / VIP2 → Settings shows Active until date  
- [ ] Same code again → already used  
- [ ] Second code while active → already has active VIP  
- [ ] Free user sees Drive upsell  
- [ ] VIP + `GOOGLE_ANDROID_CLIENT_ID` → Connect → Backup now → Restore (confirm)  
- [ ] Catalog untouched after VIP expiry messaging
