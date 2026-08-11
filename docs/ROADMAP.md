# ArtCloset product roadmap

**Last updated:** 2026-08-11  
**Product line:** Free = create & organize · Premium = protect, present & manage professionally  
**Monetization:** Subscription Premium (target ~₱49/mo or ~₱399/yr, configurable). **No ads** on Free.  
**Current ship target:** Android Free offline catalog APK (v1.0.0)

Related docs:

- [Architecture](ARCHITECTURE.md)
- [Monetization strategy](MONETIZATION-STRATEGY.md)
- [Monetization gap analysis](MONETIZATION-GAP-ANALYSIS.md)
- Monetization skill: `.cursor/skills/artcloset-monetization/`
- Product overview: [`AboutArtCloset`](../AboutArtCloset)

---

## Principles (locked)

1. **Never gate** unlimited uploads, edit, search, basic tags/collections, or core offline catalog.
2. **Sharing stays Free** — email, share card, system share destinations, digital calling card (basic).
3. **No ads** — Premium funds Free, not advertising.
4. **Upsell only on Premium actions** — never interrupt vault/edit/search.
5. **Basic exhibit labels stay Free**; Premium adds professional branding (org logo, later templates).
6. **Drive is Premium backup**, not “unlimited cloud storage,” and is not required for core use.

---

## Now (shipped — Free APK scope)

| Area | Status |
| --- | --- |
| Unlimited local artwork catalog (SQLite + managed images) | Done |
| Photos, crop/re-crop (Android), camera, batch upload (Android) | Done |
| Details, dimensions, price, status, tags, genres, collections | Done |
| Statuses: Available, Reserved, Loaned, Exhibited, Sold, Not for sale, Other | Done |
| Home gallery header + featured artwork (pin from Edit → Basic entry) | Done |
| Search, status + year filters, sort, grid/list | Done |
| Soft delete / trash + archived collections restore | Done |
| Basic dashboard counts (available / sold / exhibiting) | Done |
| Share card (post-style image → system share) | Done |
| Multi-select buyer email | Done |
| Exhibit mode slideshow | Done |
| **Basic exhibit labels** + batch PDF | Done · **Free** |
| Profile + digital calling card (contacts / socials) | Done |
| Themes (dark / light / neon / metallic) | Done |
| JSON catalog metadata export | Done |
| Google Drive backup | Stub only (Settings) — **not** in Free APK value prop |
| Entitlements / IAP / Premium UI | Not started |

**Tabs:** Home · Profile · Settings  

**v1 APK label:** *ArtCloset 1.0.0 — Free offline catalog (Android)*. Do not market Drive, Premium, or cloud sync.

---

## Phase 1 — Free polish & foundation

**Goal:** Finish Free communication polish; add entitlement plumbing without paywalling the catalog.

### 1A — Free communication

| Item | Notes | Status |
| --- | --- | --- |
| Digital calling card (basic) | Profile → shareable card | **Done** |
| Profile contact fields | Email / phone / socials | **Done** |
| Artwork → Share → Email | Richer composer (recipients, subject, message, price toggle) | Partial — multi-select mail works |
| Multi-artwork email | Select works → one email | **Done** (enrich copy/UI) |
| Dashboard value metrics | Total listed value; basic sales total from Sold + price | Todo |
| Share entry clarity | Share card + Email + OS share | Partial |

### 1B — Entitlement scaffold (no store required yet)

| Item | Notes |
| --- | --- |
| `FREE` / `PREMIUM` tiers + `CAN_*` permissions | Central module |
| Debug Premium override | Dev builds only |
| `PremiumUpsell` sheet | Natural prompt on Premium taps |
| Configurable product IDs / prices | Do not hard-code ₱ amounts in UI logic |
| Subtle **PRO** badges | Only on Premium surfaces |

**Out of scope for Phase 1:** ads, upload caps, gating basic labels, shipping Drive.

---

## Phase 2 — Premium core

**Goal:** Clear recurring value — protect data and produce professional documents.

| Priority | Feature | Entitlement / notes |
| --- | --- | --- |
| 1 | **Google Drive backup & restore** | `CAN_USE_GOOGLE_DRIVE_BACKUP` — “Backup your ArtCloset to Google Drive.” Manual + optional schedule. Safe restore confirmations. |
| 2 | **Certificate of Authenticity** | `CAN_GENERATE_CERTIFICATE` — PDF preview/export/share |
| 3 | **Portfolio PDF** | `CAN_GENERATE_PORTFOLIO` — multi-select, reorder, templates |
| 4 | **Org / exhibition logo** on labels + CoA | `CAN_USE_ORG_LOGO` — exhibiting group logo (not artist personal mark) |
| 5 | Advanced label options | Templates / QR / price-on-label (basic labels remain Free) |
| 6 | Store IAP / subscription | Wire real Premium after scaffold proves gates |

### Document branding model

| Brand | Where it lives | Used on |
| --- | --- | --- |
| Artist identity | Profile | Calling card, emails, optional CoA artist block |
| **Exhibiting org logo** | Exhibition / group (Premium) | Exhibit labels + CoA for that show |
| Artwork image | Artwork | Share card, portfolio, CoA artwork plate |

---

## Phase 3 — Premium expansion

| Feature | Notes |
| --- | --- |
| **Exhibition Manager** | Name, venue, dates, organizer; roster statuses; owns org logo |
| Batch labels from exhibition | Generate all labels for show roster |
| Advanced analytics | Value, sales trends — basic counts stay Free |
| Sales / buyer management | Buyer, price, date, payment, commission — Free still marks Sold only |
| Premium calling card polish | Templates, QR to portfolio, multi-link |
| Premium templates packs | Optional one-time IAPs later |
| **Public artist portfolio** | Hosted profile — largest leap (needs backend) |

---

## Explicitly not on the roadmap

| Idea | Decision |
| --- | --- |
| Ads on Free | **No** |
| Max artwork / photo caps | **No** |
| Pay to edit / search / basic tags | **No** |
| Pay for basic email, share card, or calling card | **No** |
| Gate all exhibit labels | **No** — basic stays Free |
| Artist studio logo as the primary Premium logo story | Prefer **org/exhibition logo** for labels + CoA |

---

## Suggested build order (engineering)

```text
Free APK v1 (shipped catalog + share + labels + calling card)
    → Phase 1A remaining polish (email composer, dashboard value)
        → Phase 1B entitlements + upsell UI
            → Phase 2 Drive backup (#1 Premium)
                → CoA PDF → Portfolio PDF → Org logo
                    → Phase 3 Exhibition Manager → Analytics / Sales / Public portfolio
```

---

## Success criteria

**Free feels complete** for catalog + sharing without nagging.  
**Premium feels professional** — backup peace of mind + branded exhibition docs + CoA/portfolio.  
**One sentence pitch:** *A free digital art catalog that becomes a professional artist management tool when upgraded.*
