# Licensing review (before any public launch)

This prototype is fine to run locally. Before it's public, review each item below.

| Item | Where it's used | Status |
| --- | --- | --- |
| NHL team logos (`assets.nhle.com/logos/...`) | Schedule, standings, home, game pages (`components/ui/TeamLogo.tsx`) | **Needs review.** Trademarks of the NHL and its teams. Fine for local prototyping; for launch, get permission or replace with team abbreviations (the component already falls back to them). |
| NHL player headshots (`assets.nhle.com/mugs/...`) | Player pages (`components/ui/Headshot.tsx`) | **Needs review.** Photos are NHL property. Same options as logos. |
| NHL stats data (`api-web.nhle.com`) | Everything | **Needs review.** Public but undocumented API with no published terms for third-party use. Check the NHL's terms of use; keep request volumes low (the cache already does). |
| Oilers marks (logo, oil drop, gear crest, Hunter, wordmark lettering) | Nowhere | Not used, by design. Colours and general style only. |
| Fonts: Saira Extra Condensed, Oswald, Barlow | Site-wide, via Fontsource | OK: SIL Open Font License. |
| Icons: Lucide | Site-wide | OK: ISC licence. |

Footer disclaimer on every page: "Independent fan site. Not affiliated with the Edmonton Oilers, Oilers
Entertainment Group or the NHL."
