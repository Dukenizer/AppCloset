# VIP codes & Google Drive (internal testing)

## This release (premium reliability)

Drive is the **only** full backup. Do not add on-device zip copies, USB export, or a download-from-Drive-website path.

This release: **full-catalog** Backup now / Restore only (not incremental, not collection-scoped). Incremental backup and optional collection **export** (not Drive restore) are tracked in [ROADMAP.md](ROADMAP.md) Phase 2.1.

Objective: Backup now / Restore from Drive must be as reliable as we can make it for VIP/Premium. A failed restore is a catalog disaster.

- Canonical file stays in Google **app data** (hidden). Restore is in-app only, same Google account.
- Upload the new backup **before** deleting the previous Drive file.
- Restore must verify artwork count + primary image files, then show the **full vault** (no leftover collection filter).
- Future (not this release): optional PC download of a **copy**; never edit the canonical Drive file.

## Secrets (never commit)

Create `.env` from `.env.example`:

```
ARTCLOSET_VIP_SALT=<same salt used to generate hashes>
GOOGLE_ANDROID_CLIENT_ID=<Android OAuth client ID ending in .apps.googleusercontent.com>
GOOGLE_IOS_CLIENT_ID=
```

Also set the same keys as **EAS secrets** for preview/production builds.

`GOOGLE_ANDROID_CLIENT_ID` is baked into the binary so the app knows OAuth is configured. Native Google Sign-In matches the install by **package name + signing-certificate SHA-1**, not by requiring that env value to equal every Android client ID. Keep one Android client ID in EAS secrets; register **all** needed SHA-1s as separate Android OAuth clients in the same Cloud project.

## Regenerate VIP hash lists

```powershell
$env:ARTCLOSET_VIP_SALT="your-salt"
npm run generate:vip-hashes -- "$env:USERPROFILE\Downloads\artcloset_vip_codes.csv"
```

Commits **only** `src/entitlements/vipHashes.generated.ts` (hashes). Plaintext codes stay in your CSV outside the repo.

## Google Cloud (Drive)

Connect Google uses **native Google Sign-In** (on-device account picker). It does **not** open a browser tab and does **not** use a Web OAuth client or a custom redirect URI for the Connect flow.

### 1. Project & API

1. Google Cloud Console → project that owns ArtCloset OAuth clients
2. Enable **Google Drive API** (APIs & Services → Library / Enabled APIs)
3. Do **not** rely on a Web OAuth client for Connect. A leftover Web client is harmless if unused.

### 2. Audience (Testing)

1. **Google Auth Platform** → **Audience**
2. Publishing status **Testing** (until production verification)
3. **User type** External
4. Add every tester Gmail under **Test users** (e.g. `rockesti01@gmail.com`)
5. While Testing, accounts **not** on that list cannot authorize Drive scopes

### 3. Data Access (scopes)

1. **Google Auth Platform** → **Data Access** → **Add or remove scopes**
2. Filter `appdata` or select / manually add:
   ```
   https://www.googleapis.com/auth/drive.appdata
   ```
3. **Update** → **Save**

App code also requests `openid`, `email`, `profile`. `drive.appdata` is **non-sensitive** and is the Drive scope ArtCloset uses ([Drive appdata](https://developers.google.com/workspace/drive/api/guides/appdata)).

Declaring scopes does **not** fix `DEVELOPER_ERROR` code `10`. That error is package + SHA-1 mismatch at Sign-In.

### 4. Android OAuth clients (SHA-1 strategy)

Package name for every Android client: **`com.dukenizer.artcloset`**.

Create **one Android OAuth client per signing certificate**. Keep all of them. Do not delete clients until you know they are unused.

| Typical client | SHA-1 source | Used when |
| --- | --- | --- |
| Upload / EAS | Play Console → Upload key certificate, or EAS/local keystore | Sideload, EAS preview APK signed with upload key |
| Classical | Play App signing → Classical key | Many Play installs |
| Post-quantum | Play App signing → Post-quantum key | Quantum-ready Play signing |
| **Play-delivered APK (source of truth)** | `apksigner` on a **signed APK** downloaded from Play | **Whatever Play actually signed for that release** |

**Critical lesson (validated Aug 2026):** Play Console App signing labels (Classical / Quantum / Upload) may **not** match the **Signer #1** SHA-1 on the APK users install. If Connect fails with code `10` after registering Console fingerprints, download the Play-signed APK and register **Signer #1** SHA-1 as another Android client.

Official background:

- [Play App Signing — register API fingerprints](https://support.google.com/googleplay/android-developer/answer/9842756)
- [Google Sign-In / client auth SHA-1](https://developers.google.com/android/guides/client-auth)
- [react-native-google-signin: DEVELOPER_ERROR / code 10](https://react-native-google-signin.github.io/docs/troubleshooting)

#### How to get SHA-1 fingerprints

Full step-by-step (Play Console, **AAB extraction**, Play-signed APK, EAS keystore, registration, checklist): **[PLAY-SHA1-GUIDE.md](PLAY-SHA1-GUIDE.md)**.

Quick path for Play installs (source of truth):

1. Play Console → **Test and release** → **Latest releases and bundles** → open the live bundle
2. **Downloads** → download a **signed APK** (not the upload AAB alone)
3. `apksigner verify --print-certs` on that APK → copy **Signer #1** SHA-1 → register in Google Cloud

No new AAB is required when only adding a SHA-1 client. Rebuild only if EAS secrets / `GOOGLE_ANDROID_CLIENT_ID` were wrong or missing in that binary.

### 5. Env / EAS

1. Put any Android **client ID** from this project into `.env` as `GOOGLE_ANDROID_CLIENT_ID` and the matching EAS secret
2. Optional: iOS OAuth client → `GOOGLE_IOS_CLIENT_ID`
3. Rebuild after changing `.env` / EAS secrets or adding the Google Sign-In native module

Scope used in app: `https://www.googleapis.com/auth/drive.appdata`

## Troubleshooting: `DEVELOPER_ERROR` / code `10`

| Symptom | Meaning |
| --- | --- |
| Fail at `signIn`, `isDeveloperError: true`, code `10` | Package name or SHA-1 does not match the **installed** APK’s signing cert |
| Play Services OK, native module OK, client ID present | App/build is fine; fix Cloud OAuth Android clients |
| Empty Data Access scopes | Fix for consent / Drive **after** Sign-In; does not clear code `10` |

Checklist:

1. Confirm install is from **Google Play** (not a random sideload)
2. Confirm package is `com.dukenizer.artcloset`
3. Register Upload + Classical + Post-quantum (+ Previous if listed)
4. If still failing: `apksigner` on Play-downloaded APK → add **Signer #1** SHA-1
5. Test user Gmail is the account used on the phone
6. Drive API enabled; `drive.appdata` on Data Access
7. Wait for Cloud propagation; force-stop app (reinstall only if still stuck)

## Internal test checklist

- [ ] Redeem VIP1 / VIP2 → Settings shows Active until date  
- [ ] Same code again → already used  
- [ ] Second code while active → already has active VIP  
- [ ] Free user sees Drive upsell  
- [ ] VIP + Play install → Connect (account picker, not Chrome) → Backup now → Restore (confirm)  
- [ ] Play Connect works after Android OAuth SHA-1s include **apksigner Signer #1** for that release  
- [ ] Backup now alert artwork count matches Home (all works, e.g. 5 + Hummingbird = 6)  
- [ ] Restore verified alert matches that count; Home lists **all** works with images (not empty-studio / Add first artwork)  
- [ ] Failed restore keeps the previous catalog on the phone  
- [ ] Catalog untouched after VIP expiry messaging
