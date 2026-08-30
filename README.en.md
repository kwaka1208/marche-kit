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
> and a working sample ([`examples/demo/`](examples/demo/README.md)) all run.

## What you get

Unlike a general-purpose static site generator, marche-kit ships **the intake side of
running an event** — the work that shows up every day after the site goes live, handled
without the organizers touching code.

| Feature | Who uses it | What it does | Status |
|---|---|---|---|
| Vendor editor | Each vendor | Edit their own blurb, logo, products, prices and sold-out state; live immediately | ✅ |
| Announcement editor | Organizers | Add and revise announcements. No rebuild | ✅ |
| Contact form | Visitors | Generated from a field-definition JSON, with a confirmation step and spam trap. Sends mail | ✅ |
| Site rendering | Visitors | Vendor cards, product listing, announcements | ✅ |
| Official social links | Organizers | List URLs in the config and they appear on the site. Icons belong to the theme | ✅ |

The only requirement is **a shared host that runs PHP 8.0 or later.**
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

A sample for a fictional event is included. It runs with no theme applied at all.

```bash
cd examples/demo
python3 -m http.server 8000
```

Open <http://localhost:8000/?fixed>. (`?fixed` stops the display order from being shuffled.)

The demo is not decoration — **it is the real test of whether the separation holds.**
If it doesn't work bare, the theme has leaked into the core.

## Using it for your event

It is a template, not a dependency. You copy the repository rather than installing it —
it contains PHP, and every event customizes it.

```bash
git clone https://github.com/kwaka1208/marche-kit my-event
cd my-event
rm -rf .git && git init
```

Everything about the event lives in a single `marche.config.json`: dates, product
categories, the unit prices are shown in, and the display language.

Notification addresses, the admin key and webhook URLs go in `.env` and are injected
into the deployed copy — **never into the files in the repository.**

```bash
cp .env.example .env                        # fill in the values
python3 tools/inject-env.py <deploy directory>
```

Full instructions — assembling the public directory, permissions, and a verification
checklist — are in [docs/setup.md](docs/setup.md) (Japanese).

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
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Validating your data

Checks that your data matches the contract. No external libraries required.

```bash
python3 tools/validate.py <public directory>
```

It reports vendor ID mismatches, malformed product IDs, HTML tags that slipped in,
undefined sale days and missing image files. Run it after editing data by hand.

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
