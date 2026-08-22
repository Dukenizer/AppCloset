# ArtCloset product roadmap

**Last updated:** 2026-08-22  
**Product line:** Free = create & organize · Premium = protect, present & manage professionally  
**Monetization:** Subscription Premium (target ~₱49/mo or ~₱399/yr, configurable). **No ads** on Free.  
**VIP:** Offline tester codes grant full Premium for 3 (VIP1) or 6 (VIP2) months from activation.  
**Current ship target:** Android APK with Free catalog + Premium VIP redeem + Google Drive backup/restore  
**Next Premium doc feature:** Certificate of Authenticity (CoA) PDF

Related docs:

- [Architecture](ARCHITECTURE.md)
- [Monetization strategy](MONETIZATION-STRATEGY.md)
- [Monetization gap analysis](MONETIZATION-GAP-ANALYSIS.md)
- Monetization skill: `.cursor/skills/artcloset-monetization/` (CoA spec in `reference.md`)
- Product overview: [`AboutArtCloset`](../AboutArtCloset)

---

## Principles (locked)

1. **Never gate** unlimited uploads, edit, search, basic tags/collections, or core offline catalog.
2. **Sharing stays Free** — email, share card, system share destinations, digital calling card (basic).
3. **No ads** — Premium funds Free, not advertising.
4. **Upsell only on Premium actions** — never interrupt vault/edit/search.
5. **Basic exhibit labels stay Free**; Premium adds professional branding (org logo, later templates).
6. **Drive is Premium backup**, not “unlimited cloud storage,” and is not required for core use.
7. **VIP expiry / Drive never delete catalog** — only in-app trash/delete removes art.

---

## Now (this release)

| Area | Status |
| --- | --- |
| Unlimited local artwork catalog (SQLite + managed images) | Done |
| Photos, crop/re-crop (Android), camera, batch upload (Android) | Done |
| Home, collections, search, filters, share, labels, calling card | Done |
| JSON catalog metadata export | Done |
| Entitlements (`FREE` / `PREMIUM` + `CAN_*`) | **This release** |
| VIP code redeem (offline hash lists, SecureStore, on-device one-time) | **This release** |
| Google Drive backup & restore (`drive.appdata`, manual) | **This release** · Premium/VIP |
| Store IAP / Get Premium purchase | Stub only |
| Certificate of Authenticity (CoA) | **Next** · Planned (see below) |
| Portfolio PDF / org logo | Not started (after CoA) |

**Tabs:** Home · Profile · Settings  

**APK label:** *ArtCloset — Free catalog + Premium Drive (VIP)*. Market Drive as optional Premium protection, not required for daily use.

---

## Phase 1 — Free polish & foundation

### 1A — Free communication

| Item | Status |
| --- | --- |
| Digital calling card / profile contacts | **Done** |
| Multi-artwork email | **Done** |
| Dashboard value metrics | Todo |
| Share entry clarity | Partial |

### 1B — Entitlement scaffold

| Item | Status |
| --- | --- |
| `FREE` / `PREMIUM` + `CAN_*` | **This release** |
| VIP as Premium path | **This release** |
| `PremiumUpsell` on Drive when Free | **This release** |
| Debug Premium override | Optional / later |
| Store product IDs | When IAP ships |

---

## Phase 2 — Premium core

| Priority | Feature | Status |
| --- | --- | --- |
| 1 | **Google Drive backup & restore** | **This release** (manual; schedule later) |
| 2 | **Certificate of Authenticity (CoA)** | **Next** · Spec locked; not in current build |
| 3 | Portfolio PDF | Todo (after CoA) |
| 4 | Org / exhibition logo on labels + CoA | Todo (can ship with or just after CoA v1) |
| 5 | Advanced label options | Todo |
| 6 | Store IAP / subscription | Todo (VIP covers testers until then) |

### Phase 2.2 — Certificate of Authenticity (planned)

**Why:** Second Premium conversion pillar after Drive — professional proof when an artist sells or consigns a work.  
**Gate:** `CAN_GENERATE_CERTIFICATE` (Premium / active VIP). Free users see `PremiumUpsell` only when they tap Generate Certificate — never on vault/edit/search.  
**Status in current app:** Not implemented (About copy and gap analysis agree). Entitlement flag exists; no CoA UI, PDF pipeline, or `certificates` table yet.

#### Entry points (planned UX)

| Surface | Action |
| --- | --- |
| Artwork details | **Generate Certificate** (primary) |
| Optional later | Multi-select / batch CoA from collection or exhibition |

#### Certificate content (v1)

Must support:

- Artwork image (primary managed image)
- Title, artist, medium, dimensions, year / completion date
- Artwork ID (`human_id` / internal id as shown in catalog)
- Certificate number (stable, unique per issued CoA)
- Signature area + issue date
- Optional price (respect hide-price)
- Optional QR (deep link or artwork id payload — exact scheme TBD)
- Artist contact from profile / calling card fields
- **Later / with org-logo work:** exhibiting org/group logo via `CAN_USE_ORG_LOGO` (same asset as Premium exhibit labels — not the artist’s personal mark)

#### Actions (v1)

Preview → Generate PDF → Save/export → Share (system share sheet). On-device only; no ArtCloset server.

#### Engineering slice (suggested)

1. Domain + SQLite: issued certificates metadata (number, artwork id, issued_at, optional snapshot fields) so regenerating does not invent conflicting numbers without intent  
2. PDF template (single professional layout first; template pack later)  
3. Artwork details entry + `can('CAN_GENERATE_CERTIFICATE')` / upsell  
4. Preview + share/export path (reuse patterns from exhibit labels / share card where possible)  
5. Optional QR + org logo when those entitlements/assets ship  
6. Device QA: Free upsell, VIP/Premium generate, missing image, hide-price, large title, offline

#### Explicit non-goals (CoA v1)

- Not a blockchain / online registry  
- Does not upload the PDF to Drive unless the user later backs up the whole catalog (Drive remains full-catalog backup, not CoA-specific cloud)  
- Does not replace exhibit labels (labels stay Free basic / Premium branding separate)  
- Does not delete or alter catalog data when generating a certificate  

#### Depends on / unlocks

| Depends on | Unlocks |
| --- | --- |
| Entitlements + VIP (shipped) | Paid CoA without waiting for store IAP |
| Stable artwork + profile fields (shipped) | Certificate field mapping |
| CoA PDF pipeline | Portfolio PDF (shared export/share patterns) |
| Org logo asset (`CAN_USE_ORG_LOGO`) | Branded CoA + labels for exhibition groups |

---

## Phase 3 — Premium expansion

Exhibition Manager, analytics, sales/buyer tools, premium templates, public portfolio — unchanged intent.

---

## Suggested build order (engineering)

```text
Free catalog (shipped)
    → Entitlements + VIP redeem + Drive backup (this release / in market)
        → CoA PDF (next) → Portfolio PDF → Org logo on labels + CoA
            → Store IAP
                → Phase 3 Exhibition Manager → Analytics / Sales / Public portfolio
```

---

## Success criteria

**Free feels complete** for catalog + sharing without nagging.  
**Premium feels protective** — Drive backup peace of mind first; then branded docs (CoA when selling).  
**VIP testers** can unlock Premium offline and recover via Drive after reinstall.  
**CoA (when shipped):** Premium/VIP can preview and share a PDF CoA from artwork details; Free only sees upsell on that action; catalog unchanged by generate.  
**One sentence pitch:** *A free digital art catalog that protects your life’s work with Premium Drive backup — and documents sales with Certificates of Authenticity.*
