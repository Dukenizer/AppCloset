# ArtCloset — Monetization gap analysis

**Status:** Analysis only. Do not implement Google Drive, IAP, or Premium UI until product decisions below are approved.

**Codebase:** ArtCloset · SQLite schema v9 · Offline-first Expo app  
**Spec:** Monetization & Premium Feature Specification (Free = create & organize · Premium = protect, present & manage)

---

## Verdict

ArtCloset today is a **fully Free** digital art catalog. Unlimited uploads, search, share card, buyer email, exhibit labels, and exhibit mode are **ungated**. There is **no** entitlement model, subscription, or payment code. Google Drive is a **Settings stub** plus unused OAuth packages. Premium targets (CoA, portfolio PDF, exhibition manager, sales, analytics, public portfolio) are **greenfield**.

---

## 1. Current architecture summary

| Layer | Role |
| --- | --- |
| `app/` | Expo Router screens (thin) |
| `src/domain/` | Models, validation, exhibit label specs |
| `src/data/` | Migrations (`database.ts` v9), repositories |
| `src/services/` | Images, export, buyer email, exhibit label PDF |
| `src/state/` | `ArtworkContext`, `CaptureContext` |
| `src/platform/` | Android-first capability flags |
| `src/ui/` | Shared components / theme |

Guarantees (from `docs/ARCHITECTURE.md`): local SQLite + files are source of truth; core catalog needs no account or network; no upload without explicit user action.

---

## 2. Existing relevant features

| Feature | Spec | Today |
| --- | --- | --- |
| Unlimited artwork CRUD + photos | Free | Done |
| Tags, collections, genres, catalogs | Free | Done |
| Search / filter / sort | Free | Done |
| Offline catalog | Free | Done |
| Basic stats (counts) | Free | Partial — no listed value / sales total |
| Share card (image) | Free | Done |
| Share via Email | Free | Partial — multi-select mail composer; not full Share → Email UI |
| System share (IG/WhatsApp/etc.) | Free | Partial — via OS share sheet |
| Exhibit labels / batch PDF | Premium in spec | **Conflict — already Free** |
| Google Drive backup | Premium | Stub only |
| CoA / Portfolio PDF / Exhibition Manager / Analytics / Sales / Public portfolio | Premium | Missing |
| Entitlements / IAP | — | Missing |

---

## 3. Database / storage

- **DB:** `artcloset.db`, `DATABASE_VERSION = 9`
- **Artworks:** rich metadata + soft delete; statuses: Available, Loaned, Exhibited, Sold, Not for sale, Other
- **Related:** images, tags, genres, collections, catalog mediums/materials, `app_settings`, `backup_records` (unused runtime)
- **Missing tables:** sales, buyers, exhibitions, certificates, entitlements, OAuth tokens
- **Images:** `documentDirectory/artcloset/images/`
- **Deps present unused:** `expo-auth-session`, `expo-secure-store`, `expo-web-browser`
- **Deps absent:** RevenueCat / IAP / Drive API / analytics SDKs

---

## 4. Existing monetization / subscription

**None.** No FREE/PREMIUM runtime, feature flags, paywalls, or product IDs. Pricing (₱49/mo, ₱399/yr) must remain configurable when introduced.

---

## 5. Gaps against the specification

### Free (Phase 1) gaps

1. Richer **Artwork → Share → Email** (recipients, subject, personal message, price toggle, artist contact)
2. Dashboard **total listed value** and **basic sales total**
3. Spec lists **Reserved** — app uses Loaned / Exhibited / Other instead
4. Profile lacks email / phone / social (needed later for CoA & public portfolio)

### Product conflict (must decide)

Exhibit Label Maker is **complete and Free**. Spec marks it **Premium**. Gating it wholesale risks breaking existing user habit.

**Decision (approved):** Keep **basic exhibit labels Free**.

**Org / exhibition logo (Premium):** e.g. Pasig Art Club — logo belongs to the **exhibiting group / exhibition**, applied to that show’s **labels and CoA**. Not the artist’s personal studio mark. One entitlement (`CAN_USE_ORG_LOGO`); one logo asset per exhibition/group.

**Also decided:** No ads on Free. Basic digital calling card is Free (Profile); Premium may add templates/QR later.

### Premium gaps (Phases 2–3)

Everything else in the Premium list is net-new, starting with entitlements + Drive backup package format.

---

## 6. Recommended implementation plan

### Phase 0 — Decisions (before code)

1. Labels Free vs Premium split (recommend grandfather basic Free)
2. Add Reserved status or keep current set
3. IAP approach (RevenueCat vs direct store IAP)
4. Drive OAuth clients (Android-first)

### Phase 1A — Free polish (no paywall)

- Share → Email composer + multi-artwork email
- Dashboard value / sales totals from `price_minor` + Sold
- Optional status / profile contact fields

### Phase 1B — Entitlement foundation

- `src/domain/entitlements.ts` — tiers + `CAN_*` permissions
- `EntitlementContext` + debug Premium override
- `PremiumUpsell` sheet (natural prompt on Premium action only)
- Configurable product IDs/settings (no hard-coded prices in UI logic)

### Phase 2 — Premium core

1. Google Drive backup / restore (versioned archive; safe restore confirmations)
2. Certificate of Authenticity PDF
3. Portfolio PDF generator
4. Premium label upgrades + gate advanced label features
5. Wire real IAP when product IDs exist

### Phase 3 — Expansion

Exhibition Manager → Advanced analytics → Sales/buyer management → Premium templates → Public portfolio (needs hosting; largest leap)

---

## 7. Files to modify / create

### Modify early

- `app/(tabs)/index.tsx`
- `app/(tabs)/settings.tsx`
- `app/artwork/[id]/index.tsx`
- `src/services/buyerEmailService.ts`
- `app/labels.tsx`
- `src/data/database.ts` (future migrations)
- `docs/ARCHITECTURE.md`

### Create (phased)

- `src/domain/entitlements.ts`
- `src/state/EntitlementContext.tsx`
- `src/ui/PremiumUpsell.tsx`
- `src/services/billing/`
- `src/services/backup/`
- `src/services/certificateService.ts`
- `src/services/portfolioPdfService.ts`
- Screens: `share-email`, `backup`, certificate, exhibitions

---

## 8. Potential risks

| Risk | Mitigation |
| --- | --- |
| Gating existing Free labels | Grandfather basic labels; Premium for advanced templates |
| Destructive Drive restore | Confirmations + optional local snapshot first |
| Public portfolio scope | Defer to Phase 3 after docs + backup |
| Hard-coded prices | Product IDs / settings only |
| Paywall on catalog actions | Upsell only on Premium features |
| Migration failures | Continue forward-only `user_version` migrations |

---

## Next step

Approve **Phase 0** (especially the labels boundary), then choose:

- **A)** Phase 1A Free email + dashboard polish  
- **B)** Phase 1B entitlement scaffold  
- **C)** Both A then B  

No Drive / IAP / Premium UI until you confirm.
