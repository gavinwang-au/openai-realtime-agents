ARG PNPM_VERSION=9.12.1

FROM node:20.17-bullseye AS deps
ARG PNPM_VERSION
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM node:20.17-bullseye AS builder
ARG PNPM_VERSION
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
RUN pnpm --filter @openai-realtime-agents/web build

FROM node:20.17-bullseye-slim AS runner
ARG PNPM_VERSION
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN corepack prepare pnpm@${PNPM_VERSION} --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages ./packages

EXPOSE 3000
CMD ["pnpm", "--filter", "@openai-realtime-agents/web", "start"]
