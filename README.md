# ArtCloset

ArtCloset is a cross-platform mobile and web application built with Expo and React Native.

It is an offline-first personal art vault. Catalog data is stored in SQLite, managed artwork images remain in the app's
document storage, and no account is required for core features.

See [Architecture and production guarantees](docs/ARCHITECTURE.md) for storage decisions, failure handling, security
boundaries, development-build requirements, and the release QA matrix.

## Requirements

- Node.js (LTS recommended)
- npm
- Expo Go on a physical device, or an Android/iOS simulator

## Getting started

Install the project dependencies:

```sh
npm install
```

Start the Expo development server:

```sh
npm start
```

After the server starts, use the terminal shortcuts to open the app:

- `a` — Android
- `i` — iOS (requires macOS)
- `w` — Web

You can also scan the displayed QR code with Expo Go.

## Available scripts

```sh
npm start
npm run android
npm run ios
npm run web
npm run typecheck
npm run doctor
```

## Project structure

- `app/` — Expo Router screens and navigation
- `src/domain/` — models and input validation
- `src/data/` — SQLite migrations and repositories
- `src/services/` — image storage, export, and native integrations
- `src/state/` — application use-case coordination
- `src/ui/` — reusable accessible UI primitives
- `app.json` — Expo application configuration
- `assets/` — icons, splash images, and other static assets

## Documentation

- [Expo documentation](https://docs.expo.dev/)
- [React Native documentation](https://reactnative.dev/docs/getting-started)
- [Set up a development environment](https://docs.expo.dev/get-started/set-up-your-environment/)
- [Expo tutorial](https://docs.expo.dev/tutorial/introduction/)
- [Expo SDK reference](https://docs.expo.dev/versions/latest/)
- [Build and submit with EAS](https://docs.expo.dev/build/introduction/)

