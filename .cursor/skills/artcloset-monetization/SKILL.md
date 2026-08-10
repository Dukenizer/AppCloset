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

## Before coding

1. Inspect the existing ArtCloset codebase (architecture, schema, sharing, storage, any payments).
2. Read the full spec: [reference.md](reference.md).
3. Produce a gap analysis + incremental plan (files to change/create, risks) **before** implementing Drive, IAP, or Premium UI.
4. Preserve backward compatibility with existing artwork data.
5. Keep entitlements centralized (feature flags / permission checks). Do not hard-code prices in UI logic — use configurable product IDs/settings.

## Current product anchors (as of this skill)

Likely already present and must stay Free unless explicitly migrated with a plan:

- Local SQLite catalog, offline-first
- Unlimited artwork CRUD, search/filter, basic stats
- Share card (composed image → system share sheet)
- Selection → email buyers (improve toward full Share → Email)
- Exhibit labels: **basic labels Free**; Premium adds **exhibiting org/group logo** on labels + CoA (and later templates/QR).

## Entitlement model

Tiers: `FREE` | `PREMIUM`

Permissions (names may match project style):

- `CAN_USE_GOOGLE_DRIVE_BACKUP`
- `CAN_GENERATE_CERTIFICATE`
- `CAN_GENERATE_PORTFOLIO`
- `CAN_USE_ORG_LOGO` — exhibiting **organization/group** logo (e.g. Pasig Art Club) on **exhibit labels** and **CoA** for that show; not the artist’s personal mark
- `CAN_USE_EXHIBITION_LABELS` — advanced label options (templates, QR, etc.); basic labels remain Free
- `CAN_USE_BATCH_LABELS`
- `CAN_USE_ADVANCED_ANALYTICS`
- `CAN_USE_EXHIBITION_MANAGER`
- `CAN_USE_SALES_MANAGEMENT`
- `CAN_USE_PUBLIC_PORTFOLIO`

## Phases

1. **Core Free** — unlimited catalog, tags, search, basic dashboard, offline, share, email share  
2. **Premium** — Google Drive backup/restore, CoA, portfolio PDF, org logo on labels/CoA, advanced labels  
3. **Premium expansion** — exhibition manager, advanced analytics, sales/buyer, templates, public portfolio, calling-card polish  

**No ads** on Free. See [docs/ROADMAP.md](../../../docs/ROADMAP.md).

## Google Drive positioning

Call it **Backup your ArtCloset to Google Drive** — not “unlimited cloud storage.”

## Share / email (Free)

Path: Artwork → Share → Email (and multi-select → Share → Email).  
Native share sheet may also offer Facebook, Instagram, Messenger, WhatsApp, Copy Link where the OS supports them.  
Share card = post-style image graphic; OS/IG decide Feed vs DM.

## After implementation — verify

- Free: unlimited upload/edit/search/filter; email/share work; catalog never locked
- Premium: Drive backup/restore; CoA; portfolio PDF; labels + batch labels; entitlements gate correctly
- Existing artwork data intact
