This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

Self-hosted with Docker, Cloudflare Tunnel and MongoDB Atlas. See [DEPLOY.md](DEPLOY.md).

# logs-system

## Team Ownership Migration

After enabling team ownership, run these commands once per environment:

```bash
pnpm seed
pnpm backfill:team:dry
pnpm backfill:team
```

- `pnpm seed` ensures the default admin and default team exist.
- `pnpm backfill:team:dry` previews how many legacy records will be updated.
- `pnpm backfill:team` applies team ownership to legacy location/log/guest records.
