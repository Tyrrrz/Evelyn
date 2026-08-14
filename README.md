# Evelyn

Evelyn is a toolkit of web-based tools for [EVE Online](https://www.eveonline.com) players, including an LP-to-ISK conversion helper and more.

Built with [Vite](https://vite.dev), [React](https://react.dev), [TypeScript](https://www.typescriptlang.org), and [Tailwind CSS](https://tailwindcss.com).

## Getting Started

Install dependencies:

```bash
yarn install
```

Run the development server:

```bash
yarn start
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts

- `yarn start` — run the development server
- `yarn build` — build the app for production
- `yarn serve` — preview the production build locally
- `yarn lint` / `yarn lint:check` — lint (and fix) the code
- `yarn format` / `yarn format:check` — format (and check) the code

## Deployment

The app is automatically built and deployed to GitHub Pages on every push to the `prime` branch, via the workflow defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Static data

Some data that would otherwise require a live API call is instead bundled directly into the app, since it's static and rarely changes:

- `src/esi/npcCorporations.ts` / `src/esi/npcCorporationData.json` — NPC corporation list, generated from CCP's official [Static Data Export](https://developers.eveonline.com/docs/services/static-data/) by [`scripts/generate-npc-corporations.mjs`](scripts/generate-npc-corporations.mjs). Re-run this script manually (`node scripts/generate-npc-corporations.mjs`) to refresh it when new corporations are added.
- `src/esi/blueprintData.json` — blueprint manufacturing recipes (product + materials), generated from CCP's official [Static Data Export](https://developers.eveonline.com/docs/services/static-data/) by [`scripts/generate-blueprint-data.mjs`](scripts/generate-blueprint-data.mjs). Re-run this script manually (`node scripts/generate-blueprint-data.mjs`) to refresh it after CCP introduces new blueprints.
