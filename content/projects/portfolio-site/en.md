## Overview

A static site generated from Markdown files in the repo. Every push to `main` runs lint → typecheck → test → build in GitHub Actions and deploys to GitHub Pages.

## Built to grow

- Data schemas live in the `shared` package, ready to be reused by a future API
- Pages read data only through `lib/content.ts` — moving to an API + MongoDB means changing just that file
- Malformed project content fails CI before it reaches production
