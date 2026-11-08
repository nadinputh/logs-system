# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* values (and NEXT_PUBLIC_APP_URL, derived from NEXTAUTH_URL in
# next.config.mjs) are inlined into the client bundle at build time, so they
# are build args. Both are public; no secret belongs here.
ARG NEXTAUTH_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4000 \
    # Docker sets HOSTNAME to the container id; the standalone server binds to it.
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# lib/email/send.ts loads nodemailer through an indirection file tracing cannot
# follow, so the standalone bundle omits it. It has no dependencies of its own.
COPY --from=build --chown=node:node /app/node_modules/nodemailer ./node_modules/nodemailer
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/manifest.json').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
