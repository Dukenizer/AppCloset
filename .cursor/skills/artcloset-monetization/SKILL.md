---
name: artcloset-monetization
description: >-
  ArtCloset Free vs Premium monetization architecture, entitlement model, and
  phased implementation plan. Use when planning or building Premium features,
  subscriptions, Google Drive backup, certificates, portfolio PDFs, exhibition
  labels/manager, analytics, sales/buyer management, public portfolio, share/
  email gating, or any monetization UX — and to prevent gating unlimited
  uploads or core catalog workflows.
---

# ArtCloset monetization

Act as a senior product architect, UX designer, mobile monetization expert, and React Native/Expo developer for ArtCloset.

## Core principle (non-negotiable)

**FREE = Create and organize your art**  
**PREMIUM = Protect, present, and manage your art professionally**

- Do **not** gate artwork uploads, photo count, edit, view, search, basic tags, or basic sharing/email.
- Do **not** use max-artwork-count as the primary Premium restriction.
- Premium prompts appear only when the user tries a Premium feature — never interrupt core catalog use.
- **No ads** on Free.

## Source of truth

- Strategy: [docs/MONETIZATION-STRATEGY.md](../../../docs/MONETIZATION-STRATEGY.md)
- Roadmap: [docs/ROADMAP.md](../../../docs/ROADMAP.md)
- Gap analysis: [docs/MONETIZATION-GAP-ANALYSIS.md](../../../docs/MONETIZATION-GAP-ANALYSIS.md)
- Full feature reference: [reference.md](reference.md)

## Before coding

1. Inspect the existing ArtCloset codebase (architecture, schema, sharing, storage, any payments).
2. Read the strategy + gap analysis + [reference.md](reference.md).
3. Produce a gap analysis + incremental plan **before** implementing Drive, IAP, or Premium UI.
4. Preserve backward compatibility with existing artwork data.
5. Keep entitlements centralized. Do not hard-code prices in UI logic.

## Current product anchors (Free APK v1 — Aug 2026)

Must stay Free unless explicitly migrated with a plan:

- Local SQLite catalog, offline-first (schema v10)
- Unlimited artwork CRUD, search/filter (status + year), collections, featured Home art
- Share card, multi-select email, exhibit mode
- Exhibit labels: **basic labels Free**
- Digital calling card + profile contacts
- Themes; trash / archive restore; JSON metadata export
- Google Drive: **stub only** — real backup is **Premium Phase 2 #1**
- Entitlements / IAP: **not started**

## Entitlement model

Tiers: `FREE` | `PREMIUM`

Permissions:

- `CAN_USE_GOOGLE_DRIVE_BACKUP`
- `CAN_GENERATE_CERTIFICATE`
- `CAN_GENERATE_PORTFOLIO`
- `CAN_USE_ORG_LOGO` — exhibiting org/group logo on labels + CoA
- `CAN_USE_EXHIBITION_LABELS` — advanced label options; basic labels remain Free
- `CAN_USE_BATCH_LABELS`
- `CAN_USE_ADVANCED_ANALYTICS`
- `CAN_USE_EXHIBITION_MANAGER`
- `CAN_USE_SALES_MANAGEMENT`
- `CAN_USE_PUBLIC_PORTFOLIO`

## Phases

1. **Free APK** — unlimited catalog + share + labels + calling card (**shipping**)  
2. **Phase 1B** — entitlement scaffold + upsell UI  
3. **Phase 2 Premium** — Drive backup (#1), CoA, portfolio PDF, org logo, IAP  
4. **Phase 3** — Exhibition Manager, analytics, sales, public portfolio  

## Google Drive positioning

Call it **Backup your ArtCloset to Google Drive** — not “unlimited cloud storage.” Not part of Free APK marketing.

## Share / email (Free)

Path: Artwork → Share → Email (and multi-select → Email).  
Share card = post-style image; OS decides destinations.

## After implementation — verify

- Free: unlimited upload/edit/search/filter; email/share/calling card work; catalog never locked
- Premium: Drive backup/restore; CoA; portfolio PDF; entitlements gate correctly
- Existing artwork data intact
