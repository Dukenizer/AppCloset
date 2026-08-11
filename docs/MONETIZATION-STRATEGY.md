# ArtCloset — Monetization strategy

**Last updated:** 2026-08-11  
**Status:** Product strategy (approved direction). Implement Premium / Drive / IAP only after Phase 1B scaffold.

Related:

- [Product roadmap](ROADMAP.md)
- [Gap analysis](MONETIZATION-GAP-ANALYSIS.md)
- Skill: `.cursor/skills/artcloset-monetization/`

---

## One-line strategy

**Free wins daily habit** (catalog + share on-device). **Premium sells protection and professional presentation** (Drive backup first, then CoA / portfolio / exhibition branding). **No ads. No upload caps.**

---

## Value split

| Tier | Promise | Examples |
| --- | --- | --- |
| **FREE** | Create & organize your art | Unlimited artworks & photos, collections, search/filters, share card, email, basic labels, calling card, exhibit mode, local JSON export |
| **PREMIUM** | Protect, present & manage professionally | Google Drive backup/restore, Certificate of Authenticity, portfolio PDF, org logo on labels/CoA, advanced labels, later Exhibition Manager / sales / analytics / public portfolio |

### Pricing (targets — configurable, not hard-coded in UI)

- ~₱49 / month or ~₱399 / year (or store equivalents)
- Product IDs and display prices live in config/settings when IAP ships

---

## Non-negotiables

1. Never gate uploads, edit, search, basic tags/collections, or offline catalog.
2. Never put ads on Free.
3. Upsell only when the user taps a Premium action — never interrupt Home browse/edit.
4. Basic exhibit labels stay Free forever (grandfathered).
5. Sharing (card, email, OS destinations) and basic calling card stay Free.
6. Call Drive **“Backup your ArtCloset to Google Drive”** — not unlimited cloud storage.

---

## Current commercial state (v1 Free APK)

| Item | Reality |
| --- | --- |
| Paywall / entitlements / IAP | **Not built** |
| Google Drive | Settings **stub only** — Phase 2 #1 |
| What we sell today | Nothing — Free APK is the full local catalog product |
| What we must not claim in v1 marketing | Cloud backup, Premium, multi-device sync |

---

## Phased monetization plan

### Phase 1A — Free completeness (habit)

Finish Free communication polish so unpaid users feel ArtCloset is “enough”:

- Richer Share → Email (optional)
- Dashboard listed-value / sales totals (optional)
- Calling card + profile contacts — **done**

### Phase 1B — Entitlement scaffold (gates without charging)

Ship `FREE` / `PREMIUM` + `CAN_*` permissions, debug override, and `PremiumUpsell` so Premium surfaces can be wired without store IDs yet.

### Phase 2 — First paid value (conversion)

**Priority order:**

1. **Google Drive backup & restore** — clearest “protect my life’s work” reason to pay  
2. CoA PDF  
3. Portfolio PDF  
4. Org/exhibition logo on labels + CoA  
5. Real store subscription / IAP  

### Phase 3 — Expand ARPU

Exhibition Manager, analytics, sales/buyer tools, premium templates, public portfolio.

---

## Entitlements (planned)

| Permission | Feature |
| --- | --- |
| `CAN_USE_GOOGLE_DRIVE_BACKUP` | Backup / restore |
| `CAN_GENERATE_CERTIFICATE` | CoA |
| `CAN_GENERATE_PORTFOLIO` | Portfolio PDF |
| `CAN_USE_ORG_LOGO` | Exhibiting org logo on labels + CoA |
| `CAN_USE_EXHIBITION_LABELS` | Advanced label options |
| `CAN_USE_BATCH_LABELS` | Batch from exhibition (if gated separately) |
| `CAN_USE_ADVANCED_ANALYTICS` | Analytics |
| `CAN_USE_EXHIBITION_MANAGER` | Exhibition Manager |
| `CAN_USE_SALES_MANAGEMENT` | Sales / buyers |
| `CAN_USE_PUBLIC_PORTFOLIO` | Public portfolio |

---

## Go-to-market notes for APK v1

- Position as **private offline art vault** for Android.
- Lead with unlimited catalog, photos, collections, share, labels, calling card.
- Mention Premium only as **coming later** (backup + professional docs)—or omit until Phase 2 is near.
- Keep Drive stub honest: “not connected yet” / setup required.

---

## Success metrics (later)

| Funnel | Signal |
| --- | --- |
| Free activation | Artwork + photo saved in first session |
| Habit | Weekly opens / artworks added |
| Premium intent | Upsell views on Drive / CoA / portfolio |
| Conversion | Trial → paid; backup completed |
| Retention | 30-day return Free vs Premium |

---

## Decision log (approved)

| Decision | Choice |
| --- | --- |
| Upload caps | **No** |
| Ads | **No** |
| Basic labels | **Free** |
| Calling card basic | **Free** |
| Org logo on labels/CoA | **Premium** |
| Drive backup | **Premium · Phase 2 #1** |
| Free APK v1 without Drive/IAP | **Yes — ship local catalog** |
