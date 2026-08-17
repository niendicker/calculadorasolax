# Mirrors what Nixpacks already builds today (node 22, npm ci / npm run build
# / npm run start, no `output: standalone` in next.config.ts) so switching
# Coolify's build strategy from Nixpacks to this Dockerfile doesn't change
# runtime behavior — it only removes the nixpkgs archive fetch from GitHub
# that's been getting 429'd during builds.
FROM node:22-alpine

RUN apk add --no-cache libc6-compat curl git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Coolify injects every "Buildtime" env var as a --build-arg automatically;
# these ARGs are what let that reach `next build` (next.config.ts reads
# NEXT_PUBLIC_SUPABASE_URL at build time, so it errors loudly if missing
# rather than silently producing a broken image).
ARG ANEEL_TARIFF_RESOURCE_ID
ARG SOLAX_NEXO_STOCK
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG SUPABASE_INTERNAL_URL
ENV ANEEL_TARIFF_RESOURCE_ID=$ANEEL_TARIFF_RESOURCE_ID \
    SOLAX_NEXO_STOCK=$SOLAX_NEXO_STOCK \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    SUPABASE_INTERNAL_URL=$SUPABASE_INTERNAL_URL \
    NODE_ENV=production

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
