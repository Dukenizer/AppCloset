# ArtCloset architecture

## Product guarantees

- The SQLite catalog and files under the app document directory are the source of truth.
- Adding, editing, searching, filtering, presenting, sharing, and exporting the catalog do not require an account.
- Network access is not part of any core workflow.
- No data is uploaded without a user starting an explicit backup action.
- Deletion is soft by default. Items can be restored from Settings.

## Layers

- `app/` contains small Expo Router screens and navigation.
- `src/domain/` contains framework-independent models and validation.
- `src/data/` owns migrations, SQL, mapping, and repositories.
- `src/services/` owns managed files, exports, and native integrations.
- `src/state/` coordinates use cases and keeps screens independent of storage details.
- `src/ui/` contains reusable accessible primitives and visual tokens.

Screens do not execute SQL or manage permanent files directly.

## Platform strategy (v1)

ArtCloset is **Android-first** for media tooling. iOS remains in the codebase for a later release but is not the
current ship target for capture, crop, or batch flows.

Central flags live in `src/platform/capabilities.ts`:

| Capability | Android | iOS (deferred) | Web |
| --- | --- | --- | --- |
| Managed images + catalog | Yes | Basic pick/save path | No |
| Native freeform crop + rotate | Yes (`expo-image-picker` / UCrop) | Pick only, no crop editor | No |
| Batch photo upload | Yes | Hidden / message | No |

When iOS media support expands, wire a freeform crop library (e.g. `react-native-image-crop-picker` + config plugin)
through the same capability gates rather than branching in screens.

## Local database

`src/data/database.ts` uses `PRAGMA user_version` and forward-only migrations. Version 1 creates:

- artworks and artwork images
- tags and artwork-tag relationships
- genres and artwork-genre relationships
- collections and artwork-collection relationships
- app settings
- backup records

Foreign keys are enabled, writes that span related tables use transactions, and frequently filtered or sorted fields
are indexed. User-controlled values are always bound parameters. Dynamic SQL is limited to internal allowlists.

Artwork deletion sets `deleted_at`; it does not immediately destroy catalog data or images. This supports recovery from
Settings.

## Managed images

Imported or captured images are resized to a maximum width of 2400 pixels and encoded as JPEG before being copied to:

`<document directory>/artcloset/images/<random UUID>.jpg`

SQLite stores the URI and metadata, not image bytes. The coordinator follows these rules:

1. Process and copy the new image.
2. Write the database record in a transaction.
3. If the database write fails, remove the new managed file.
4. During replacement, retain the previous image until the new image and database row are both valid.
5. Treat missing files as a recoverable UI state instead of crashing.

## Search performance

The collection uses a virtualized `FlatList`. Search is debounced and performed in SQLite. Relationship filtering uses
indexed join tables and `EXISTS` queries. The current approach is appropriate for hundreds to low thousands of records.
If profiling shows larger catalogs need it, a later migration can add a synchronized FTS5 index without changing screen
contracts.

## Export and backup boundary

The current local catalog export is JSON metadata and intentionally states that it does not contain image bytes.
Complete image backup and Google Drive restore must use one versioned, validated archive format. That work must not be
represented as complete until it includes:

- streaming archive creation to avoid holding a catalog in memory
- checksums and manifest validation
- available-space checks
- restore into a staging location
- atomic database cutover and rollback
- OAuth client IDs for both Android and iOS
- Drive scope limited to files created by ArtCloset where possible
- tokens stored only with `expo-secure-store`

Google client IDs are deployment-specific and must never be hard-coded into source control. Drive remains disabled until
those values and the restore test matrix are supplied.

## Expo Go and development builds

The offline catalog, SQLite, camera, image picker, file storage, sharing, and SecureStore packages are supported by the
installed Expo SDK and can be exercised in Expo Go. A development build is required to validate the final application
identity, custom URL scheme, platform permission text, OAuth redirect URIs, and store-like native behavior.

Create development builds after configuring an EAS project:

```sh
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

Google OAuth must be tested in a development build because redirect URIs depend on the installed app's scheme and signed
Android/iOS identifiers.

Expo SQLite web support is alpha. The bundled WASM worker requires the checked-in Metro configuration. Any production
web host must also send `Cross-Origin-Embedder-Policy: credentialless` and
`Cross-Origin-Opener-Policy: same-origin`; exporting static files alone does not configure hosting headers. Permanent
artwork image storage and native sharing remain Android/iOS-only.

## Verification

Required checks before a release:

```sh
npm run typecheck
npm run doctor
npx expo export --platform android
npx expo export --platform ios
```

Device QA must cover denied permissions, low storage, missing image files, interrupted writes, 500+ artwork performance,
screen reader navigation, large text, offline mode, process restarts, and backup restore rollback.

## Official references

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [React Native](https://reactnative.dev/docs/getting-started)
