# ArtCloset — Monetization gap analysis

**Last updated:** 2026-08-15  
**Status:** Living gap analysis. Strategy: [MONETIZATION-STRATEGY.md](MONETIZATION-STRATEGY.md). Roadmap: [ROADMAP.md](ROADMAP.md).

**Codebase:** ArtCloset · Offline-first Expo app (Android-first)

---

## Verdict

ArtCloset ships a **Free** digital art catalog (ungated create/organize/share) plus **Premium** via **VIP codes** (testers) and a future store purchase path. **Google Drive backup/restore** and **entitlements (`FREE` / `PREMIUM` + `CAN_*`)** are implemented. CoA, portfolio PDF, exhibition manager, sales, analytics, public portfolio, and **store IAP** remain open.

**Commercial posture:** Free = habit; Premium = protect (Drive) then professional docs; no ads; no upload caps.

---

## 1. Current architecture summary

| Layer | Role |
| --- | --- |
| `app/` | Expo Router screens (thin) |
| `src/domain/` | Models, validation, exhibit label specs, theme |
| `src/data/` | Migrations (`database.ts` **v11**), repositories, featured artwork setting |
| `src/services/` | Images, export, buyer email, exhibit labels (PDF/DOCX), Drive backup |
| `src/entitlements/` | VIP redeem, SecureStore session, `CAN_*` permissions |
| `src/state/` | `ArtworkContext` (persisted query filters), `CaptureContext` |
| `src/platform/` | Android-first capability flags |
| `src/ui/` | Shared components / themes |

Guarantees (from `docs/ARCHITECTURE.md`): local SQLite + files are source of truth; core catalog needs no account or network; no upload without explicit user action.

---

## 2. Existing relevant features

| Feature | Spec | Today |
| --- | --- | --- |
| Unlimited artwork CRUD + photos | Free | Done |
| Tags, collections, genres, catalogs | Free | Done |
| Search / filter / sort | Free | Done |
| Offline catalog | Free | Done |
| Featured artwork on Home | Free | Done |
| Basic stats (counts) | Free | Partial — no listed value / sales total |
| Share card (image) | Free | Done |
| Share via Email | Free | Partial — multi-select mail composer; not full Share → Email UI |
| System share (IG/WhatsApp/etc.) | Free | Via OS share sheet |
| Digital calling card | Free | Done |
| Profile contacts / socials | Free | Done |
| Exhibit labels / batch PDF (+ DOCX) | Free (approved) | Done |
| Themes | Free | Done (dark / light / neon / metallic) |
| Entitlements `FREE` / `PREMIUM` + `CAN_*` | — | **Done** |
| VIP code redeem (offline hashes) | Premium path | **Done** |
| Google Drive backup / restore | Premium | **Done** (manual; needs native build + EAS secrets) |
| Store IAP / Get Premium purchase | Premium | **Stub only** (“coming soon”) |
| CoA / Portfolio PDF / Exhibition Manager / Analytics / Sales / Public portfolio | Premium | Missing |

---

## 3. Database / storage

- **DB:** `artcloset.db`, `DATABASE_VERSION = 11` (backup manifest hint `BACKUP_DB_SCHEMA_HINT = 11`)
- **Artworks:** rich metadata + soft delete; statuses include **Reserved**
- **Related:** images, tags, genres, collections, catalog mediums/materials, `app_settings`, featured artwork id setting
- **Missing tables:** sales, buyers, exhibitions, certificates (OAuth tokens live in SecureStore, not SQLite)
- **Images:** `documentDirectory/artcloset/images/` (+ branding for studio logo)
- **Drive:** `@react-native-google-signin/google-signin` + Drive `appdata` API; tokens in SecureStore
- **Deps absent:** RevenueCat / Play Billing IAP / analytics SDKs

---

## 4. Existing monetization / subscription

| Path | Status |
| --- | --- |
| VIP1 / VIP2 offline redeem | Shipped (tester Premium for 3 / 6 months) |
| Runtime entitlements | Shipped (`EntitlementsProvider`, Drive gated by `CAN_USE_GOOGLE_DRIVE_BACKUP`) |
| Store IAP / subscription | Stub UI only — no product IDs or purchase flow |

Pricing (₱49/mo, ₱399/yr) must remain configurable when IAP is introduced.

---

## 5. Gaps against the specification

### Free (Phase 1A) remaining

1. Richer **Artwork → Share → Email** (recipients, subject, personal message, price toggle)
2. Dashboard **total listed value** and **basic sales total**

### Product decisions (approved)

| Topic | Decision |
| --- | --- |
| Exhibit labels | **Basic Free** |
| Org / exhibition logo | **Premium** (`CAN_USE_ORG_LOGO`) |
| Ads | **No** |
| Calling card basic | **Free** |
| Drive backup | **Premium · Phase 2 #1** (implemented) |
| Free APK without Drive/IAP | **Yes** |

### Premium gaps (remaining)

1. Store IAP / subscription  
2. Certificate of Authenticity PDF  
3. Portfolio PDF  
4. Org / exhibition logo + advanced label branding  
5. Phase 3: Exhibition Manager, analytics, sales/buyer tools, public portfolio  

### Release ops (not product features, but ship blockers)

- EAS secrets: `ARTCLOSET_VIP_SALT`, `GOOGLE_ANDROID_CLIENT_ID`  
- Google Cloud Android OAuth SHA-1 for shipping keystore  
- Device QA of VIP + Drive (preview/dev build, not Expo Go)  
- Drive archive hardening (large catalogs: in-memory zip / disk checks)

---

## 6. Recommended implementation plan

### Phase 0 — Decisions

**Complete** for labels, ads, Drive positioning, Free APK scope.

### Done for this release

- Phase 1B entitlements + VIP  
- Phase 2 #1 Google Drive backup / restore (manual)

### Next engineering choices

- **A)** Phase 1A remaining Free polish (email composer, dashboard value)  
- **B)** Drive/backup hardening + EAS/OAuth production checklist  
- **C)** CoA PDF → Portfolio PDF → Org logo  
- **D)** Store IAP when ready to replace VIP-only Premium for public users  

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Drive fails in Expo Go / missing EAS secrets | Document native build + secrets; Settings explains unavailability |
| Destructive Drive restore | Confirmations; local catalog overwrite warning |
| VIP codes shared across devices | Offline one-time use is per-device; accept for tester phase |
| Hard-coded prices | Product IDs / settings only when IAP ships |
| Paywall on catalog actions | Upsell only on Premium features (Drive today) |
| Stale gap docs misleading ops | Keep this file aligned with shipped VIP/Drive |

---

## Next step

Validate **VIP + Drive on a preview APK** (secrets + SHA-1 + checklist in [VIP-AND-DRIVE.md](VIP-AND-DRIVE.md)), then either Free polish (1A) or CoA / IAP depending on launch goals.
