# ArtCloset product roadmap

**Last updated:** 2026-08-12  
**Product line:** Free = create & organize · Premium = protect, present & manage professionally  
**Monetization:** Subscription Premium (target ~₱49/mo or ~₱399/yr, configurable). **No ads** on Free.  
**VIP:** Offline tester codes grant full Premium for 3 (VIP1) or 6 (VIP2) months from activation.  
**Current ship target:** Android APK with Free catalog + Premium VIP redeem + Google Drive backup/restore

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
| CoA / portfolio PDF / org logo | Not started |

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
| 2 | Certificate of Authenticity | Todo |
| 3 | Portfolio PDF | Todo |
| 4 | Org / exhibition logo | Todo |
| 5 | Advanced label options | Todo |
| 6 | Store IAP / subscription | Todo (VIP covers testers until then) |

---

## Phase 3 — Premium expansion

Exhibition Manager, analytics, sales/buyer tools, premium templates, public portfolio — unchanged intent.

---

## Suggested build order (engineering)

```text
Free catalog (shipped)
    → Entitlements + VIP redeem + Drive backup (this release)
        → CoA PDF → Portfolio PDF → Org logo
            → Store IAP
                → Phase 3 Exhibition Manager → Analytics / Sales / Public portfolio
```

---

## Success criteria

**Free feels complete** for catalog + sharing without nagging.  
**Premium feels protective** — Drive backup peace of mind first; then branded docs.  
**VIP testers** can unlock Premium offline and recover via Drive after reinstall.  
**One sentence pitch:** *A free digital art catalog that protects your life’s work with Premium Drive backup.*
