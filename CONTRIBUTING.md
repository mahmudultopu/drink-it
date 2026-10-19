# Contributing

Thanks for your interest in Drink it. This document explains how to set the project up, how the code is organised
and what a good change looks like.

## Getting started

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
git clone https://github.com/mahmudultopu/drink-it.git
cd drink-it
npm ci            # development tools only; the shop itself has no runtime dependencies
npm start         # http://localhost:3000, serving the readable sources
```

The first start prints a generated admin password once. `node server.js --reset-admin` issues a new one.

To try the production build locally:

```bash
npm run build     # bundles, minifies and fingerprints the front end into public/assets/dist
npm start         # the server picks the build up automatically
```

## Project layout

| Path                      | What lives there                                                               |
| ------------------------- | ------------------------------------------------------------------------------ |
| `server.js`, `server/`    | Node HTTP server: pages, JSON API, authentication, JSON-file storage           |
| `views/`, `partials/`     | HTML page templates and the fragments they share                               |
| `public/assets/js`        | Browser code (ES modules, no framework); one module per page in `pages/`       |
| `public/assets/css/parts` | Stylesheets, concatenated in file-name order                                   |
| `data/`                   | Catalogue and configuration as JSON (orders and accounts are written here too) |
| `scripts/`                | Build tooling: asset build, catalogue generator, 3D can renderer               |
| `test/`                   | Unit and end-to-end tests (`node:test`)                                        |
| `docs/`                   | Architecture notes                                                             |

[docs/architecture.md](docs/architecture.md) describes how a request flows through the system.

## Before you open a pull request

```bash
npm run check     # eslint, prettier and the whole test suite
```

- **Formatting** is handled by Prettier; run `npm run format` rather than fixing style by hand.
- **Tests** are required for behaviour changes. The end-to-end suites start the real server on a free port with a
  throw-away copy of `data/`, so they are the quickest way to check an API change.
- **Security-sensitive code** (authentication, request validation, anything that handles customer data) needs a test
  for the failure case as well as the success case.
- **Comments** should explain why, not repeat what the code says. Public functions get a short doc comment.
- Keep changes focused. A refactor and a feature belong in separate pull requests.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org):

```
feat(cart): remember the chosen pack size
fix(api): reject negative stock in the admin product editor
perf: serve product thumbnails at their display size
docs: describe the deployment options
```

The first line is imperative, at most about 72 characters, and says what changed. Use the body to explain why and to
note anything a reviewer should look at.

## Reporting bugs and requesting features

Open an issue and fill in the template. For security problems, **do not open a public issue**; follow
[SECURITY.md](SECURITY.md) instead.

## Adding or changing products

Edit `data/products.json` (or run `npm run build:catalog` after changing `scripts/catalog.mjs`) and see
[scripts/render/inbox/README.md](scripts/render/inbox/README.md) for adding real product photos. Regenerating images
with `npm run render` needs Chrome and a GPU-capable machine; the committed images are fine for everything else.
