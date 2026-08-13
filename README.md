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
