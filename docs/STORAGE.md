# Storage — Cloudflare R2

## Why we moved

Vercel Blob blocked the store about a day into a billing period, with
`403 Your store is blocked` on every public read. Not space — **egress**. A gift's
full-resolution splat is 23 MB and every view pulls it, so seven seeded gifts and a few days of
testing were enough to exhaust a month's free allowance.

That mattered more than the outage itself: judging runs **Oct 5–25**, with judges opening gifts.
The same cap would have been reached again, mid-judging, with no warning.

**R2 charges nothing for egress at all.** 10 GB of storage free. That is the entire reason it is
here.

Nothing was recoverable from the blocked store — the bytes could not be read by any method,
authenticated or not, so everything in it had to be regenerated.

## What you need to create

In the Cloudflare dashboard:

1. **R2 → Create bucket.** Any name; `lantern` is fine.
2. **Settings → Public access → Allow via r2.dev.** This gives a public URL like
   `https://pub-<hash>.r2.dev`. Rate-limited and not meant for heavy production use, but correct
   for a hackathon. A custom domain is the upgrade path if it ever matters.
3. **R2 → Manage API tokens → Create token**, with **Object Read & Write** on that bucket. It
   shows an access key id and a secret exactly once.
4. **Account ID** is on the R2 overview page.

## The five variables

The same five everywhere — local `.env.local`, Vercel, and Railway:

```
R2_ACCOUNT_ID=<from the R2 overview>
R2_ACCESS_KEY_ID=<from the API token>
R2_SECRET_ACCESS_KEY=<from the API token>
R2_BUCKET=lantern
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

`R2_PUBLIC_URL` is also read by `vercel.ts`, which rewrites `/gifts/*` and `/worlds/*` onto it so
assets stay same-origin. Same-origin is not cosmetic: Spark loads splats with HTTP `Range`
requests, which are not CORS-safelisted, so a cross-origin load triggers a preflight and the world
fails with nothing more useful than "network error".

Setting them:

```bash
vercel env add R2_ACCOUNT_ID production      # and the other four
railway variables --set "R2_ACCOUNT_ID=..."  # worker needs all five too
```

**Strip the newline** when copying a value out of a file on Windows. A trailing carriage return
produced `Access denied` against Railway earlier and reads exactly like a wrong key.

## What changed in the code

One module, `src/lib/providers/storage.ts`, with the same seven functions the Blob version had and
the same pathnames, so no caller had to change beyond its import. Two things got simpler:

- **No cache-busting on reads.** Blob served documents through a CDN that could hand two readers
  different versions for minutes — which is why the constellation once showed three gifts when
  five were shared, and why a versioned index exists at all. R2 reads go through the S3 API and are
  read-after-write consistent.
- **No `head` round trip** to find a URL. A pathname is a key, so a read is one request, not two.

The versioned shared index is kept anyway. It costs nothing and it is still the right shape.

## After the variables exist

Everything in the old store is gone, so the gifts have to be rebuilt:

```bash
npm run world:push          # the hero world, from public/worlds
npm run gift:seed -- --to "..." --from "..." --memory "..." --model marble-1.1 --share
```

Then `npm run gift:reindex` to rebuild the constellation index, and check `/constellation`.
