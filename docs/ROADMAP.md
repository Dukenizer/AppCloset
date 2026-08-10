# ArtCloset product roadmap

**Last updated:** 2026-08-10  
**Product line:** Free = create & organize · Premium = protect, present & manage professionally  
**Monetization:** Subscription Premium (target ~₱49/mo or ~₱399/yr, configurable). **No ads** on Free.

Related docs:

- [Architecture](ARCHITECTURE.md)
- [Monetization gap analysis](MONETIZATION-GAP-ANALYSIS.md)
- Monetization skill: `.cursor/skills/artcloset-monetization/`

---

## Principles (locked)

1. **Never gate** unlimited uploads, edit, search, basic tags/collections, or core offline catalog.
2. **Sharing stays Free** — email, share card, system share destinations.
3. **No ads** — Premium funds Free, not advertising.
4. **Upsell only on Premium actions** — never interrupt vault/edit/search.
5. **Basic exhibit labels stay Free**; Premium adds professional branding (org logo, later templates).

---

## Now (shipped)

| Area | Status |
| --- | --- |
| Unlimited local artwork catalog (SQLite + images) | Done |
| Photos, details, dimensions, price, status, tags, genres, collections | Done |
| Search, filter, sort, soft delete / trash | Done |
| Basic dashboard counts (total / available / sold / exhibiting) | Done |
| Share card (post-style image → system share) | Done |
| Multi-select buyer email | Done (enrich toward full Share → Email) |
| Exhibit mode slideshow | Done |
| **Basic exhibit labels** + batch PDF (sizes 2×3 / 3×4) | Done · **Free** |
| JSON catalog metadata export | Done |
| Google Drive backup | Stub only (not connected) |
| Entitlements / IAP / Premium UI | Not started |

Statuses today: Available, Loaned, Exhibited, Sold, Not for sale, Other.

---

## Phase 1 — Free polish & foundation

**Goal:** Make Free unmistakably useful for daily artist communication; lay entitlement plumbing without paywalling the catalog.

### 1A — Free communication

| Item | Notes |
| --- | --- |
| Artwork → Share → Email | Recipients, subject, personal message, price toggle, image + details |
| Multi-artwork email | Select works → one email (“Available works”) |
| Dashboard value metrics | Total listed value; basic sales total from Sold + price |
| Profile contact fields | Email / phone / socials (for email signature & later CoA) |
| Digital calling card (basic) | **Free** — rectangular card; medium one-liner; contacts auto-reflow; Share + Save to photos |
| Share entry clarity | Share card + Email + OS share; not a forced IG DM |

### 1B — Entitlement scaffold (no store required yet)

| Item | Notes |
| --- | --- |
| `FREE` / `PREMIUM` tiers + `CAN_*` permissions | Central module |
| Debug Premium override | Dev builds only |
| `PremiumUpsell` sheet | Natural prompt on Premium taps |
| Configurable product IDs / prices | Do not hard-code ₱ amounts in UI logic |
| Subtle **PRO** badges | Only on Premium surfaces |

**Out of scope for Phase 1:** ads, upload caps, gating basic labels.

---

## Phase 2 — Premium core

**Goal:** Clear recurring value — protect data and produce professional documents.

| Priority | Feature | Entitlement / notes |
| --- | --- | --- |
| 1 | **Google Drive backup & restore** | `CAN_USE_GOOGLE_DRIVE_BACKUP` — “Backup your ArtCloset to Google Drive” (not unlimited cloud storage). Manual + daily/weekly if practical. Safe restore confirmations. |
| 2 | **Certificate of Authenticity** | `CAN_GENERATE_CERTIFICATE` — PDF preview/export/share |
| 3 | **Portfolio PDF** | `CAN_GENERATE_PORTFOLIO` — multi-select, reorder, templates |
| 4 | **Org / exhibition logo** on labels + CoA | `CAN_USE_ORG_LOGO` — e.g. Pasig Art Club logo for that show’s labels & certificates. **Not** the artist’s personal mark. Owned by exhibition/group (or export picker until Exhibition Manager ships). |
| 5 | Advanced label options | Templates / QR / price-on-label packs (basic labels remain Free) |
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
| **Exhibition Manager** | Name, venue, dates, organizer, notes; artworks Submitted / Displayed / Sold / Reserved / Returned; owns org logo |
| Batch labels from exhibition | Generate all labels for show roster |
| Advanced analytics | Value, sales trends, by medium/year — basic counts stay Free |
| Sales / buyer management | Buyer, price, date, payment, commission, net — Free still marks Sold only |
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
| Pay for basic email or share card | **No** |
| Gate all exhibit labels | **No** — basic stays Free |
| Artist studio logo as the primary Premium logo story | Prefer **org/exhibition logo** for labels + CoA; artist branding belongs on calling card / profile |

---

## Suggested build order (engineering)

```text
Phase 1A Free email + dashboard + calling card (basic)
    → Phase 1B entitlements + upsell UI
        → Phase 2 Drive backup
            → CoA PDF
                → Portfolio PDF
                    → Org logo on labels + CoA
                        → Phase 3 Exhibition Manager (logo moves onto exhibitions)
                            → Analytics / Sales / Public portfolio
```

---

## Success criteria

**Free feels complete** for catalog + sharing without nagging.  
**Premium feels professional** — backup peace of mind + branded exhibition docs + CoA/portfolio.  
**One sentence pitch:** *A free digital art catalog that becomes a professional artist management tool when upgraded.*
