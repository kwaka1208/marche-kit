# marche-kit

A website toolkit for events where **each vendor updates their own information.**
Design is fully separated: swapping the theme is all it takes to reuse it for a different event.1

Built for events where vendors gather and each puts products on display — craft beer
festivals, farmers' markets, morning markets, school festivals, community events.

> **Documentation is written in Japanese.**
> This file is the only English document. Everything under [`docs/`](docs/) — the design
> rationale, the data contract, the theme contract — is in Japanese. The code comments are too.

> **Status: in development (stage 8 of the [roadmap](docs/roadmap.md))**
> The server side ([`core/php/`](core/php/)), the editors ([`core/editor/`](core/editor/)),
> the rendering layer ([`core/js/`](core/js/)), the contact form, two themes ([`themes/`](themes/README.md))
> and working samples ([`examples/`](examples/README.md)) all run.

## What you get

Unlike a general-purpose static site generator, marche-kit ships **the intake side of
running an event** — the work that shows up every day after the site goes live, handled
without the organizers touching code.

| Feature | Who uses it | What it does | Status |
|---|---|---|---|
| Vendor editor | Each vendor | Edit their own blurb, logo, products, prices and sold-out state; live immediately | ✅ |
| Product visibility | Organizers | One config line picks none / vendor popup only / full listing. **Defaults to none** | ✅ |
| Announcement editor | Organizers | Add and revise announcements. No rebuild | ✅ |
| Contact form | Visitors | Generated from a field-definition JSON, with a confirmation step and spam trap. Sends mail | ✅ |
| Site rendering | Visitors | Vendor cards, product listing, announcements | ✅ |
| Official social links | Organizers | List URLs in the config and they appear on the site. Icons belong to the theme | ✅ |

The only requirement is **a shared host running a PHP version that still receives security support** (see [docs/setup.md](docs/setup.md), in Japanese, for the current range).
No database, no admin framework, no external SaaS. All data lives as JSON files on the server.

## ⚠️ This assumes vendors you can trust

**Whatever a vendor saves goes public immediately, with no review step by the organizers.**
The absence of an approval workflow is deliberate ([why](docs/concepts.md), in Japanese).

So marche-kit assumes an event where **you know who the vendors are and can reach them.**
Do not use it as-is for open sign-up where anyone can register and publish.

There are safeguards. Everything a vendor types is treated as text and HTML tags are
stripped server-side. Images are checked for extension, MIME type and size. Vendor and
product IDs have fixed formats so nobody can write into another vendor's data.
**Even so, a mistake can still go public.**

## Ship it fast

**If you only want one site up, this section is all you need to read.**
No git, no Node.js, no build step — just a shared host that runs PHP.

### 1. Get it

```bash
curl -fsSLO https://raw.githubusercontent.com/kwaka1208/marche-kit/main/tools/fetch-release.sh
bash fetch-release.sh
```

The latest release lands in `marche-kit-<ver>-site-default/`.
For the dark theme, add `--theme night-market`.

**Read the script before you run it.** That is why it is not written as a pipe into a shell.

Downloading `marche-kit-<ver>-site-<theme>.zip` from the
[releases page](https://github.com/kwaka1208/marche-kit/releases) and unzipping it
gets you the same thing. **The contents are already laid out as a public directory** —
nothing to rearrange.

### 2. Fill in three files

```bash
cd marche-kit-<ver>-site-default
make env          # creates .env
```

These three are the only files you touch.

| File | What goes in it |
|---|---|
| `.env` | Admin key, notification addresses, and **where your server is** |
| `site/marche.config.json` | Event name, venue, dates |
| `site/data/shops.json` | The list of vendor IDs |

The server lives in the `DEPLOY_*` keys of `.env`. Use `rsync` if you have SSH,
or `ftp` for a shared host that only speaks FTP (this one needs `lftp`).

**Products are not shown by default.** Events that are only about the vendors themselves
are the bare case. To list them, add `"items": { "display": "list" }` to `marche.config.json`.

### 3. Send it

```bash
make setup          # inject the secrets, validate what you wrote
make deploy-init    # upload, then fix up permissions
```

From then on use `make deploy`. **That one will not overwrite what vendors have saved.**

### Check that it works

| URL | Who uses it |
|---|---|
| `/` | Visitors |
| `/editor/` | Each vendor — all you hand out is **this URL and their shop ID** |
| `/editor/news/` | Organizers, for announcements (needs the admin key) |

Add `/?fixed` to stop the display order from shuffling while you check.

If something is off, see
[docs/setup.md](docs/setup.md) (Japanese) — it has a troubleshooting table.
The same steps ship inside the download as `START-HERE.md`.

---

**Everything below is for people writing themes or changing the internals.**

## Three layers

marche-kit borrows the structure of a real marketplace.

| Layer | What it means in French | Contents | Swapped |
|---|---|---|---|
| **Halle** (`core/`) | The market hall — the shared roof | PHP backend, rendering JS, editors, text dictionaries | Never |
| **Étal** (operational data) | Each vendor's stall | Per-vendor JSON and images | Per event |
| **Auvent** (`themes/`) | The awning you hang over it | CSS, layout, fonts, colors | Freely |

Two themes are included: the neutral [`default/`](themes/default/) and
[`night-market/`](themes/night-market/), which is dark with a bottom-fixed nav.
**Same core, same DOM — the difference is CSS alone.**

The line between Halle and Auvent is one sentence:
**the core emits class names; it does not decide how things look.**

## Try it

A sample for a fictional event is included. It runs with the default theme applied.

```bash
cd examples/demo-default
python3 -m http.server 8000
```

Open <http://localhost:8000/?fixed>. (`?fixed` stops the display order from being shuffled.)

**The same data is also served with no theme at all** (`examples/demo/`). That one is not
decoration — **it is the real test of whether the separation holds.** If the data renders
correctly with nothing styling it, the theme has not leaked into the core. The two share
the same data and config — only the markup and the CSS differ.

## Customizing it

It is a template, not a dependency. You copy it rather than installing it —
it contains PHP, and every event customizes it.

**To just get a site up, [Ship it fast](#ship-it-fast) is enough.**
What follows is for writing your own theme, reading the core, or assembling
the public directory yourself from the full set.

### Download a zip (no git needed)

Three zips are attached to each [release](https://github.com/kwaka1208/marche-kit/releases).

| zip | Contents | For |
|---|---|---|
| `marche-kit-<ver>-site-default.zip` | **Assembled into the shape of a public directory**, neutral theme | Just shipping |
| `marche-kit-<ver>-site-night-market.zip` | The same, with the dark theme | Same |
| `marche-kit-<ver>.zip` | Everything: both themes, the samples, the documentation | **Customizing** |

**Take the full set if you want to write your own theme or read the core.**
The assembled zips contain neither `themes/` nor `core/`.

```bash
bash fetch-release.sh --source    # the full set
```

### Or clone it

**git is not required.** Cloning is one way to get the full set; the zip gives you
the same thing. This is a template — **it is not built to track upstream.**

```bash
git clone https://github.com/kwaka1208/marche-kit my-event
cd my-event && rm -rf .git && git init
```

`rm -rf .git` **throws away the upstream history.** It is neither a fork nor a
dependency: from here on it is your event's repository. The `git init` that follows
is optional — it is there if you want to version-control your event's config.

> `cd my-event && rm -rf .git` is chained with `&&` so that **a failed clone cannot
> delete the `.git` of whatever directory you happen to be standing in.**

Same contents as the full zip. **Either way, you assemble the public directory yourself**
— step 2 of [docs/setup.md](docs/setup.md).

Everything about the event lives in a single `marche.config.json`: dates, whether
products are listed at all, product categories, the unit prices are shown in, and the
display language.

**Products are not shown by default.** Events that are only about the vendors themselves
are the bare case. To show them, add one line — `"items": { "display": "list" }`, or
`"popup"` to expose them only from the vendor popup.

Notification addresses, the admin key and webhook URLs go in `.env` and are injected
into the deployed copy — **never into the files in the repository.**

```bash
cp .env.example .env                        # fill in the values
python3 tools/inject-env.py <deploy directory>
```

Full instructions — assembling the public directory, permissions, and a verification
checklist — are in [docs/setup.md](docs/setup.md) (Japanese).

### Doing it with make

Assembling, injecting, validating and uploading are all reachable from the `Makefile`.
**It does exactly what docs/setup.md describes**, calling the scripts in `tools/` in order.

```bash
make env            # create .env from .env.example
                    # then write the admin key, addresses and server into .env
make build          # assemble → inject secrets → validate
                    # then write your event into the config files under build/site/
make deploy-init    # first upload, plus permissions
make deploy         # afterwards. **Never overwrites what vendors saved**
```

`make help` lists everything. Theme and destination are variables
(`make build THEME=night-market SITE=../my-event-site`).

Three transports, chosen with `DEPLOY_METHOD` in `.env`.

| Method | When |
|---|---|
| `rsync` | The host gives you SSH. Sends only what changed — recommended |
| `sftp` | SSH works but `rsync` is not installed |
| `ftp` | A shared host that only speaks FTP. Needs `lftp` |

**`make deploy` does not upload `data/shop-data/` or `data/news.json`.**
Vendors and organizers write those on the server, so pushing your older local copy
over them would destroy their work.

The assembled zips ship the same Makefile. There `site/` already exists, so it is just
`make env` → `make setup` → `make deploy-init`.

## Documentation

All Japanese.

| File | Contents |
|---|---|
| [docs/concepts.md](docs/concepts.md) | The three-layer model and the design rationale. Start here |
| [docs/setup.md](docs/setup.md) | Deploying to a shared host, permissions, verification |
| [docs/decisions.md](docs/decisions.md) | Design decisions and why, including the options rejected |
| [docs/data-contract.md](docs/data-contract.md) | Data contract. JSON formats and server-side validation |
| [docs/theme-contract.md](docs/theme-contract.md) | Theme contract. CSS variables, class names, the hooks the core looks for |
| [docs/roadmap.md](docs/roadmap.md) | Implementation stages |
| [schema/](schema/) | JSON Schema (the authoritative format) |
| [examples/README.md](examples/README.md) | The working samples, with and without a theme |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Validating your data

Checks that your data matches the contract. No external libraries required.

```bash
python3 tools/validate.py <public directory>
```

It reports vendor ID mismatches, malformed product IDs, HTML tags that slipped in,
undefined sale days and missing image files. Run it after editing data by hand.

**It also cross-checks the theme.** It reads `index.html` and verifies that every category
you defined has a slot to render into — forget one and that category's vendors silently
never appear on the site.

## Contributing

Issues and pull requests are welcome **in English or Japanese.**
Please read [CONTRIBUTING.md](CONTRIBUTING.md) (Japanese) first — in particular the
section on what belongs in the core versus the theme.

## Origin

Extracted from the site running the Nara Craft Beer Festival
([naracraft.beer](https://naracraft.beer)) so that other events can use it.
That site continues to run from its own separate repository.

## License

MIT
