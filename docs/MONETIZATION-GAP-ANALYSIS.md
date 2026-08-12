# ArtCloset — Monetization gap analysis

**Last updated:** 2026-08-12  
**Status:** Living gap analysis. Strategy: [MONETIZATION-STRATEGY.md](MONETIZATION-STRATEGY.md). Roadmap: [ROADMAP.md](ROADMAP.md).

**Codebase:** ArtCloset · Offline-first Expo app (Android-first)

---

## Verdict

ArtCloset ships a **Free** digital art catalog (ungated create/organize/share) plus **Premium** via **VIP codes** (testers) and a future store purchase path. **Google Drive backup/restore** is the first Premium capability. CoA, portfolio PDF, exhibition manager, sales, analytics, and public portfolio remain greenfield.

**Commercial posture:** Free = habit; Premium = protect (Drive) then professional docs; no ads; no upload caps.


---

## 1. Current architecture summary

| Layer | Role |
| --- | --- |
| `app/` | Expo Router screens (thin) |
| `src/domain/` | Models, validation, exhibit label specs, theme |
| `src/data/` | Migrations (`database.ts` v10), repositories, featured artwork setting |
| `src/services/` | Images, export, buyer email, exhibit label PDF |
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
| Search / filter / sort | Free | Done (status + year in Filters modal) |
| Offline catalog | Free | Done |
| Featured artwork on Home | Free | Done |
| Basic stats (counts) | Free | Partial — no listed value / sales total |
| Share card (image) | Free | Done |
| Share via Email | Free | Partial — multi-select mail composer; not full Share → Email UI |
| System share (IG/WhatsApp/etc.) | Free | Via OS share sheet |
| Digital calling card | Free | Done |
| Profile contacts / socials | Free | Done |
| Exhibit labels / batch PDF | Free (approved) | Done |
| Themes | Free | Done (dark / light / neon / metallic) |
| Google Drive backup | Premium | Stub only |
| CoA / Portfolio PDF / Exhibition Manager / Analytics / Sales / Public portfolio | Premium | Missing |
| Entitlements / IAP | — | Missing |

---

## 3. Database / storage

- **DB:** `artcloset.db`, `DATABASE_VERSION = 10`
- **Artworks:** rich metadata + soft delete; statuses include **Reserved**
- **Related:** images, tags, genres, collections, catalog mediums/materials, `app_settings`, `backup_records` (unused runtime), featured artwork id setting
- **Missing tables:** sales, buyers, exhibitions, certificates, entitlements, OAuth tokens
- **Images:** `documentDirectory/artcloset/images/`
- **Deps present unused for Drive:** `expo-auth-session`, `expo-secure-store`, `expo-web-browser`
- **Deps absent:** RevenueCat / IAP / Drive API / analytics SDKs

---

## 4. Existing monetization / subscription

**None.** No FREE/PREMIUM runtime, feature flags, paywalls, or product IDs. Pricing (₱49/mo, ₱399/yr) must remain configurable when introduced.

---

## 5. Gaps against the specification

### Free (Phase 1A) remaining

1. Richer **Artwork → Share → Email** (recipients, subject, personal message, price toggle)
2. Dashboard **total listed value** and **basic sales total**
3. ~~Reserved status~~ — **Done**
4. ~~Profile email / phone / social~~ — **Done**
5. ~~Digital calling card~~ — **Done**

### Product decisions (approved)

| Topic | Decision |
| --- | --- |
| Exhibit labels | **Basic Free** |
| Org / exhibition logo | **Premium** (`CAN_USE_ORG_LOGO`) |
| Ads | **No** |
| Calling card basic | **Free** |
| Drive backup | **Premium · Phase 2 #1** |
| Free APK without Drive/IAP | **Yes** |

### Premium gaps (Phases 2–3)

Everything else in the Premium list is net-new, starting with entitlements + Drive backup package format.

---

## 6. Recommended implementation plan

### Phase 0 — Decisions

**Complete** for labels, ads, Drive positioning, Free APK scope.

### Next engineering choices

- **A)** Phase 1A remaining Free polish (email composer, dashboard value)  
- **B)** Phase 1B entitlement scaffold  
- **C)** A then B, then Phase 2 Drive  

No Drive / IAP / Premium UI until 1B is ready to gate surfaces.

### Phase 2 — Premium core (reminder)

1. Google Drive backup / restore  
2. CoA PDF  
3. Portfolio PDF  
4. Org logo + advanced labels  
5. Real IAP  

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Marketing Drive before it works | Stub copy + About limits; omit from APK store listing |
| Gating existing Free labels | Grandfather basic labels |
| Destructive Drive restore | Confirmations + optional local snapshot first |
| Hard-coded prices | Product IDs / settings only |
| Paywall on catalog actions | Upsell only on Premium features |

---

## Next step

Ship / validate **Free Android APK**, then schedule **1B entitlements** before any Drive work.
