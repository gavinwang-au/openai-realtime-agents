# Migration Plan: Next.js to SST v3 on AWS

## Application Inventory

| Capability | Observed Usage | Notes |
| --- | --- | --- |
| Routing | Next.js App Router (`packages/web/src/app`) | Dynamic React server components with client components mixed in. |
| Rendering | SSR for root `/` page, no static exports | No `revalidate` calls detected; all pages render on request. |
| API Routes | `/api/session`, `/api/health`, `/api/responses` | Server-only handlers proxying OpenAI APIs; require `OPENAI_API_KEY`. |
| Middleware | None present | No `middleware.ts` file. |
| Image Optimization | `next/image` used in `App.tsx`, `Transcript.tsx` | Requires CloudFront compatibility for optimized images. |
| Environment Variables | `OPENAI_API_KEY` from `.env.local` | Sensitive server-only secret. |
| Styling & Assets | Tailwind CSS, local static assets under `public/` | Static assets should be served via CloudFront/S3. |

## Before → After Mapping

| Before | After (SST Component) |
| --- | --- |
| Local Next.js dev server via `npm run dev` | `pnpm dev` targeting `@openai-realtime-agents/web` workspace. |
| Manual AWS hosting (none) | `sst.aws.Nextjs` component deploying SSR site on Lambda@Edge + CloudFront. |
| `.env.local` for secrets | SST secrets (`sst secret set OPENAI_API_KEY`) with stage-scoped values. |
| Static asset hosting via Next dev server | CloudFront distribution + S3 origin managed by SST Next component. |
| API routes under Vercel dev server | Bundled into SST Next deployment with Lambda runtime. |
| Manual deployments | `sst deploy --stage <stage>` orchestrated via `pnpm infra:deploy:<stage>` scripts. |
| No CI/CD | GitHub Actions `deploy.yml` with stage matrix & preview stacks. |
| Single repo layout | Monorepo layout with `packages/` (Next app + shared) and `infra/`. |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| SST component API drift | Documented version in root `package.json`; lock via `pnpm-lock.yaml` once dependencies resolved. |
| Lambda runtime incompatibilities with Node APIs used by Next | Pin runtime to Node.js 20 (`nodejs20.x`) aligning with `.nvmrc`. |
| OpenAI secret exposure via client bundle | Secrets injected only on server (no `NEXT_PUBLIC_` prefix) via `sst.Secret`, never embedded in client bundles. |
| Large audio/image assets bypassing cache | CloudFront cache policy configured with long TTLs and compression flags. |
| Preview stack sprawl | Workflow tears down stacks on PR close and names stacks uniquely per PR. |
| Install step failure in restricted networks | Document offline bootstrap instructions and include manual lockfile creation guidance. |

## Rollback Strategy

1. Each deployment stage (`dev`, `stg`, `prod`, PR previews) is isolated by stage name in SST state; exports are managed automatically in the AWS account configured as `home`.
2. To rollback, check out a previous Git commit and rerun `pnpm infra:deploy:<stage>`; SST will reconcile resources to the earlier definition.
3. For emergency removal, run `pnpm infra:destroy:<stage>` (`sst remove --stage <stage>`) to tear down the stage before redeploying the prior version.
4. Ensure stage state buckets created by SST are versioned or backed up per your compliance requirements.

## Repository Layout

```
.
├─ infra/
│  └─ web.ts
├─ packages/
│  ├─ shared/
│  └─ web/
├─ env/
│  ├─ dev.env.example
│  ├─ stg.env.example
│  └─ prod.env.example
├─ .github/workflows/deploy.yml
├─ sst.config.ts
├─ sst-env.d.ts
├─ README.md
└─ MIGRATION_PLAN.md
```

## Deployment Checklist

- [ ] Install dependencies with `pnpm install` (requires internet access).
- [ ] Configure SST secrets per stage:
  - `sst secret set OPENAI_API_KEY <value> --stage dev`
  - repeat for `stg` and `prod`.
- [ ] Run `pnpm infra:deploy:dev` for smoke deployment.
- [ ] Validate outputs (`pnpm infra:outputs -- --stage dev`).
- [ ] Promote via GitHub Actions or manual `pnpm infra:deploy:<stage>` for higher environments.

## Testing Strategy

- **SSR Smoke Test** – Hit the deployed `/` endpoint via CloudFront URL; ensure HTML renders and contains runtime data.
- **API Health Check** – `curl <url>/api/health` returns JSON with `ok: true`.
- **Static Asset Cache** – Fetch `/favicon.ico`, confirm `Cache-Control` headers reflect CDN policy.
- **Secrets Validation** – Trigger `/api/session`; confirm it authenticates using stage-specific OpenAI key.
- **Preview Lifecycle** – Open PR to create preview stack and confirm PR comment; close PR to destroy resources.
