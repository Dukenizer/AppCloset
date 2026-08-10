# ArtCloset — Monetization & Premium Feature Specification

Full Cursor-ready master prompt. Use with the [artcloset-monetization](SKILL.md) skill.

Act as a senior product architect, UX designer, mobile app monetization expert, and React Native/Expo developer.

I am developing ArtCloset, a mobile app for artists to catalog, organize, present, and manage their artwork.

The goal is to create a useful Free tier that attracts artists and a reasonably priced Premium tier that monetizes professional workflows.

---

## CORE MONETIZATION PRINCIPLE

DO NOT gate artwork uploads.

Artists must be able to upload and catalog an unlimited number of paintings/artworks for free.

The core purpose of ArtCloset is artwork organization. If users are prevented from uploading their artwork, they may not build enough value in the app.

Instead:

- **FREE** = Create and organize your art
- **PREMIUM** = Protect, present, and manage your art professionally

Do NOT implement a maximum artwork count as the primary Premium restriction.

---

## FREE FEATURES

The Free version should provide substantial value.

### Artwork Management

Users should be able to:

- Upload unlimited artwork
- Add artwork photos
- Enter artwork title
- Enter artist name
- Medium
- Dimensions
- Year created
- Description
- Price
- Artwork status (Available, Sold, Reserved, Not for Sale, and other statuses already in the app)
- Tags
- Categories / collections
- Search artwork
- Filter artwork
- Sort artwork
- View artwork details
- Edit artwork
- Delete artwork
- Mark artwork as sold/reserved/available

### Offline Functionality

The core artwork catalog should work offline.

Do not require an internet connection just to:

- Add artwork
- Edit artwork
- View artwork
- Search artwork
- Manage artwork

### Basic Dashboard

Free users should have basic statistics such as:

- Total artworks
- Available artworks
- Sold artworks
- Reserved / exhibiting (as already modeled)
- Total listed value (optional if already supported)
- Basic sales total (optional if already supported)

---

## FREE SHARING FEATURES

Sharing artwork should NOT be Premium.

Artists should be able to share their artwork to help promote ArtCloset and their work.

### Share Artwork

Provide a Share action from an artwork.

Possible options:

- Email
- Messenger
- Facebook
- WhatsApp
- Instagram (via system share / share card image)
- Other system share destinations
- Copy/share link where supported

Use the native mobile sharing functionality where appropriate.

### Share via Email

This is a **CORE FREE FEATURE**.

Allow users to send artwork information via email.

Path: **Artwork → Share → Email**

Email should be able to contain:

- Artwork image
- Artwork title
- Medium
- Dimensions
- Year
- Description
- Price
- Artist name
- Optional personal message

Allow the user to:

- Enter recipient email
- Enter multiple recipients where supported
- Edit subject
- Add personal message
- Choose whether price is displayed
- Include artist contact information

Example body:

```text
Vibrant Chaos
Acrylic on Canvas
60 × 80 cm
2024
₱8,000

[Artwork Image]

View artwork / Contact artist
```

Optional personal line:

```text
Thank you for your interest in my artwork.
```

### Share multiple artworks (Free)

Allow: **Select artworks → Share → Email**

Example subject: `Edwin Estingor — Available Works`

Include 5–10 paintings in one email — especially useful when responding to a potential buyer (“Here are some of my available works.”).

### Share artwork as image/card (Free)

Compose a post-style image card and share via the system share sheet (Instagram, Messenger, WhatsApp, etc.). This is a graphic for posting, not a forced DM — destination is chosen in the OS/app share UI.

Do not require Premium for basic email sharing or share card.

---

## PREMIUM STRATEGY

Premium should focus on professional artist workflows.

Recommended initial Premium price (configurable — do not hard-code throughout the app):

- **ArtCloset Premium**: ₱49/month
- Optional annual: ₱399/year

Implement pricing through configurable product IDs/settings so pricing can be changed later.

Philosophy:

| Free | Premium |
| --- | --- |
| Communicate your art | Professionally present and manage your art |
| Email sharing | Professional portfolio PDF |
| Share card / system share | Exhibition labels |
| Unlimited catalog | Certificate of Authenticity |
| | Google Drive backup |
| | Advanced business management |

---

## PREMIUM FEATURE 1 — GOOGLE DRIVE BACKUP

Google Drive backup should be a Premium feature.

Do NOT describe this as unlimited ArtCloset cloud storage.

Position it as:

**Backup your ArtCloset to Google Drive**

Also referred to as **ArtCloset Cloud Backup** (backup framing, not storage framing).

Premium users should be able to:

- Connect Google Drive
- Backup ArtCloset data
- Backup artwork metadata
- Backup artwork photos
- Backup relevant app data
- Manually trigger backup
- Restore a previous backup
- Disconnect Google Drive
- View last backup date/time
- View backup status

### Automatic Backup

Allow Premium users to configure:

- Manual
- Daily
- Weekly

If practical within the architecture.

UI should clearly show:

- Last backup: (date/time)
- Backup status: Up to date / needs backup / failed

### Restore

Premium users should be able to restore their ArtCloset data from Google Drive.

Include appropriate confirmation dialogs before destructive restore operations.

Do not silently overwrite local data.

Provide a safe restore flow.

Value: years of artwork records and photos survive phone loss, damage, or replacement.

---

## PREMIUM FEATURE 2 — CERTIFICATE OF AUTHENTICITY

Create a professional Certificate of Authenticity generator.

The user selects an artwork and chooses **Generate Certificate**.

Certificate should support:

- Artwork image
- Artwork title
- Artist name
- Medium
- Dimensions
- Year created
- Artwork ID
- Certificate number
- Signature area
- Date
- Optional price
- Optional QR code
- Artist contact information
- **Exhibiting organization / group logo** (Premium — e.g. Pasig Art Club; same `CAN_USE_ORG_LOGO` asset used on that show’s exhibit labels; not the artist’s personal mark)

Allow: Preview, Generate PDF, Save/export, Share.

Designed for real-world use when an artist sells artwork.

---

## PREMIUM FEATURE 3 — PORTFOLIO PDF GENERATOR

Allow artists to select multiple artworks and generate a professional portfolio.

Example: `Edwin Estingor — Selected Works 2026`

Each artwork may include: Image, Title, Medium, Dimensions, Year, Description, optional Price.

Allow: Select artworks, Reorder, Choose template, Preview, Generate PDF, Export, Share.

Do not limit the number of artworks in the user's actual ArtCloset catalog.

Any limitation, if any, should only apply to premium-generated documents according to the product plan.

---

## PREMIUM FEATURE 4 — EXHIBITION TAG / LABEL MAKER

**Basic exhibit labels remain Free** (title, artist, date, medium, current sizes, batch PDF).

Premium upgrades branding and presentation — starting with:

- **Exhibiting org / group logo** on labels (e.g. Pasig Art Club; shared with CoA via `CAN_USE_ORG_LOGO`)

Later Premium label options may include templates, QR, price visibility, paper packs.

**Exhibition Tag / Label Maker** example:

```text
VIBRANT CHAOS

Edwin Estingor
Acrylic on Canvas
60 × 80 cm
2024

₱8,000
```

Customizable fields: Artist name, Artwork title, Medium, Dimensions, Year, Price, Artwork ID, QR code, Contact/social information, logo.

Templates such as: Minimal, Gallery, Classic, Contemporary, Exhibition.

Allow: Font selection, Layout, Paper size, Portrait/landscape, Price visibility, QR visibility, logo visibility.

---

## PREMIUM FEATURE 5 — BATCH EXHIBITION LABEL GENERATOR

Artists should NOT have to create labels individually.

Allow:

- Create/select an exhibition
- Select multiple artworks
- Generate labels for all selected artworks
- Preview
- Export as a printable PDF

Example: Exhibition “Ortigas Art Festival 2026” → select artworks → **Generate All Labels**.

Resulting PDF: one label per artwork according to the selected template.

---

## PREMIUM FEATURE 6 — EXHIBITION MANAGER

Exhibition management feature.

Information: Exhibition name, Venue, Start date, End date, Organizer, Notes.

Associated artwork states: Submitted, Displayed, Sold, Reserved, Returned.

Integrate with Exhibition Tag/Label Maker.

Workflow:

Create Exhibition → Select Artworks → Generate Labels → Track Exhibition → Mark Sold/Returned → Record Sales

---

## PREMIUM FEATURE 7 — ADVANCED ARTIST ANALYTICS

Keep basic statistics Free.

Premium advanced analytics examples:

- Total artwork value
- Total sales
- Average artwork price / selling price
- Sales by year / month / medium / category
- Number sold / available
- Exhibition sales
- Revenue trends

---

## PREMIUM FEATURE 8 — SALES / BUYER MANAGEMENT

Free users can simply mark artwork as Sold.

Premium users can manage sales details: Buyer name/contact, Artwork, Sale price, Sale date, Payment status/method, Commission, Net proceeds, Notes.

Do not require users to create buyer accounts.

---

## PREMIUM FEATURE 9 — PUBLIC ARTIST PORTFOLIO

Premium roadmap feature: public artist profile with bio, selected works, descriptions, contact, social links, shareable portfolio.

---

## FEATURE MATRIX (SUMMARY)

### Free — Create & Organize

- Unlimited artwork uploads
- Artwork photos & details (title, medium, dimensions, year, description, price)
- Statuses (Available / Sold / Reserved / etc.)
- Tags & categories
- Search & filtering
- Basic dashboard
- Offline access
- Share artwork
- Share via Email
- Share artwork image/card
- ❌ Google Drive backup

### Premium — Protect, Present & Manage

- Google Drive Backup / Restore / Automatic backup
- Certificate of Authenticity
- Portfolio PDF
- Exhibition Tag/Label Maker
- Batch exhibition labels
- Premium templates
- Exhibition Manager
- Advanced analytics
- Sales & buyer management
- Public artist portfolio

---

## FEATURE PRIORITY

### Phase 1 — Core Free

1. Unlimited artwork uploads
2. Artwork management
3. Tags/categories
4. Search/filter
5. Basic dashboard
6. Offline support
7. Artwork sharing
8. Email sharing

### Phase 2 — Premium

1. Google Drive Backup/Restore
2. Certificate of Authenticity
3. Portfolio PDF Generator
4. Exhibition Tag/Label Maker
5. Batch Exhibition Labels

### Phase 3 — Premium Expansion

1. Exhibition Manager
2. Advanced Analytics
3. Sales/Buyer Management
4. Premium Templates
5. Public Artist Portfolio

---

## MONETIZATION UX

Do NOT aggressively interrupt users with subscription prompts.

Premium prompts should appear naturally when the user attempts to use a Premium feature.

Example: User taps **Generate Exhibition Labels** → if Free, show value prop + Start Premium / Maybe Later.

Do NOT prevent users from using the core artwork catalog.

Clearly mark Premium features with a subtle **PRO** or **⭐ Premium** badge.

Do not make the entire app look locked.

Free users should feel that ArtCloset is useful even without paying.

---

## IMPORTANT — DO NOT RESTRICT

Do NOT use these monetization restrictions:

- ❌ Maximum number of paintings
- ❌ Maximum number of artwork photos
- ❌ Pay-per-upload
- ❌ Pay to edit artwork
- ❌ Pay to view artwork
- ❌ Pay to search artwork
- ❌ Pay to use basic tags
- ❌ Pay to use basic sharing
- ❌ Pay to email artwork

Premium should monetize:

- ✅ Backup/protection
- ✅ Professional documents
- ✅ Exhibition preparation
- ✅ Professional presentation
- ✅ Advanced business management
- ✅ Advanced analytics

---

## FUTURE ONE-TIME PURCHASES

Architecture should allow future one-time purchases in addition to subscriptions:

- Premium certificate template pack
- Exhibition template pack
- Portfolio template pack
- Special label designs

Optional; must not interfere with core Premium subscription architecture.

---

## TECHNICAL REQUIREMENTS

Before implementing changes:

1. Inspect the existing ArtCloset project.
2. Identify the current architecture.
3. Identify existing artwork database/schema.
4. Identify current storage implementation.
5. Identify current sharing implementation.
6. Identify current authentication/payment implementation.
7. Do NOT unnecessarily rewrite existing working functionality.
8. Preserve backward compatibility with existing artwork data.
9. Use modular services/components.
10. Keep monetization logic centralized.
11. Avoid hard-coding prices throughout the application.
12. Use feature flags or entitlement checks for Premium functionality.

Create a centralized entitlement model:

- Tiers: `FREE` | `PREMIUM`
- Feature permissions such as:
  - `CAN_USE_GOOGLE_DRIVE_BACKUP`
  - `CAN_GENERATE_CERTIFICATE`
  - `CAN_GENERATE_PORTFOLIO`
  - `CAN_USE_ORG_LOGO` (exhibiting org/group logo on labels + CoA)
  - `CAN_USE_EXHIBITION_LABELS` (advanced label options; basic labels Free)
  - `CAN_USE_BATCH_LABELS`
  - `CAN_USE_ADVANCED_ANALYTICS`
  - `CAN_USE_EXHIBITION_MANAGER`
  - `CAN_USE_SALES_MANAGEMENT`
  - `CAN_USE_PUBLIC_PORTFOLIO`

Follow the existing project's architecture for the exact implementation.

---

## IMPORTANT WORKFLOW

Do not implement Google Drive integration, subscriptions, payment processing, or Premium UI blindly.

First analyze the existing ArtCloset codebase and produce:

1. Current architecture summary
2. Existing relevant features
3. Existing database/storage structure
4. Existing dependencies
5. Existing monetization/subscription implementation, if any
6. Gaps against this specification
7. Recommended implementation plan
8. Files that need modification
9. Files that need creation
10. Potential risks

Then implement the changes incrementally.

### After implementation, test

- Free user can upload unlimited artwork
- Free user can edit artwork
- Free user can search/filter
- Free user can email/share artwork
- Premium user can backup to Google Drive
- Premium user can restore backup
- Premium user can generate certificates
- Premium user can generate portfolio PDFs
- Premium user can generate exhibition labels
- Premium user can batch-generate exhibition labels
- Premium entitlement correctly controls Premium features
- Free users are not accidentally blocked from core artwork management
- Existing artwork data remains intact

### Final UX feel

ArtCloset should feel like:

**A free digital art catalog that becomes a professional artist management tool when upgraded.**
