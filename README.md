# Token Radar — token-radar-01

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols,
finds the ones that record no token and are not a wrapped, staked or bridged
product of a token that trades, ranks them by implied launch value, and hands
in a dashboard with the board, a detail view per protocol, filters, and a
seven-step farm plan for each one.

## The model (radar-2)

Every row is scored by one function of the snapshot's own figures; no
protocol name is special-cased:

```
implied = round(tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.04 x min(chains - 1, 5))
  x (0.9 + 0.2 x category tokenization rate))
```

- **Growth**: the protocol's 7-day TVL change, clamped to −60%…+120%.
- **Maturity**: age since first listed (unknown age counts as 365 days).
  Older with no token scores higher: it has run longer without issuing one.
- **Chain reach**: protocols live on more chains score up to 1.20x.
- **Category tokenization rate**: computed from the snapshot itself — the
  share of the snapshot's protocols in that category whose token already
  trades. Categories where tokens commonly trade (Lending, Dexs) score a
  little higher; categories where almost none ever tokenized score lower.
  Small categories use the neutral 0.5.

The board covers all 40 watchlist slugs, plus every other rankable
pre-token protocol at any size (the early radar). Live-token protocols are
kept apart in their own view with their market caps, never mixed into the
ranking.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board
(search, category, chain, watchlist-only), a top-5 strip, a detail drawer
for every protocol showing the model's five multipliers and its farm plan,
a live-token tab, a model panel stating the formula, and a model sandbox —
two sliders that re-rank the board under the reader's own base multiple and
growth weight. The page recomputes every row it shows and checks it against
the number `board.json` carries.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js`, copies `dashboard/` and `screenshots/`, and writes
`dossier.json` with the vendored `vendor/makefun-board.ts`.

## Entry

- Competition: `token-radar-01` (make.fun), deadline 2026-12-14T10:00:00Z
- Entrant: @luthii-alvaroo, wallet in `.makefun/owner.json`
- License: MIT (see LICENSE)
