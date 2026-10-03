# Gotham numeral fonts

The user supplied [NicoAcosta/gotham-fonts](https://github.com/NicoAcosta/gotham-fonts/tree/main/ttf) for the requested Gotham numerical styling.

The existing WOFF2 versions in the same repository are self-hosted, unchanged, to avoid serving full TTF files or requesting fonts from a third party at runtime. Source commit: `cb6f5587fb8dad1718d5447575889dbc64d9e790`.

| Asset                      | SHA-256                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| gothamlight-webfont.woff2  | DDE96198486A0FC06E8592C4832A7FCE7CF37FECA79F41AC1AA38FE86B903C4D |
| gothambook-webfont.woff2   | 9CF81F6170B4401E5B3E0D2E2153F595BAC65853681A01BDFFDC0A4668B55426 |
| gothammedium-webfont.woff2 | C9588BA59FB7FC7DA3C4A480C2D36775EFCA123B577B2AACAB040F6E411A2B3F |
| gothambold-webfont.woff2   | 45AFFED82A1CC641A25EA1B7658428E55A923D1C76227C41D87A81CAC4F6719A |
| gothamblack-webfont.woff2  | 9C08BAC2BA95BBDFA0E9A12CC47C5A2386CBD53E754D5CC668DCA39357295486 |

Each source is `https://raw.githubusercontent.com/NicoAcosta/gotham-fonts/cb6f5587fb8dad1718d5447575889dbc64d9e790/web/<asset>`.

The repository README contains only its project title and has no license statement. This source record identifies the user-supplied assets; it does not establish font licensing rights. Font metadata and copyright notices are preserved in the original files.

`src/app/numeric-fonts.css` limits these faces to digits and financial symbols. Instrument Sans remains the text font for visitor pages and dashboard previews. The terminal retains its original text font with Gotham numbers.
