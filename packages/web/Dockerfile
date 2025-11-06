ARG PNPM_VERSION=9.12.1
ARG AUTH_ISSUER_URL
ARG NEXT_PUBLIC_AUTH_URL

FROM node:20.17-bullseye AS deps
ARG PNPM_VERSION
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
RUN pnpm config set store-dir /pnpm-store

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM node:20.17-bullseye AS builder
ARG PNPM_VERSION
ARG AUTH_ISSUER_URL
ARG NEXT_PUBLIC_AUTH_URL
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate
RUN pnpm config set store-dir /pnpm-store

# Use the cached store from deps
COPY --from=deps /pnpm-store /pnpm-store
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

ENV AUTH_ISSUER_URL=${AUTH_ISSUER_URL}
ENV NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL}

# Now bring in the rest of the source
COPY . .
RUN pnpm --filter @openai-realtime-agents/web build


FROM node:20.17-bullseye-slim AS runner
ARG PNPM_VERSION
ARG AUTH_ISSUER_URL
ARG NEXT_PUBLIC_AUTH_URL
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages ./packages

ENV AUTH_ISSUER_URL=${AUTH_ISSUER_URL}
ENV NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL}

EXPOSE 3000
CMD ["pnpm", "--filter", "@openai-realtime-agents/web", "start"]
