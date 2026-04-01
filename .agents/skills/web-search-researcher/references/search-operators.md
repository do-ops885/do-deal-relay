# Search Operators Reference

## Basic Operators

| Operator    | Usage         | Example               |
| ----------- | ------------- | --------------------- |
| `""`        | Exact phrase  | `"AI startup"`        |
| `site:`     | Specific site | `site:crunchbase.com` |
| `filetype:` | File type     | `filetype:pdf`        |
| `intitle:`  | In page title | `intitle:raising`     |
| `-`         | Exclude       | `-after:2023`         |
| `..`        | Range         | `funding 2023..2024`  |

## Deal Discovery Patterns

| Goal                  | Query                                     |
| --------------------- | ----------------------------------------- |
| Company background    | `"{company}" founded funding team`        |
| Market analysis       | `{market} market size growth 2024`        |
| Competitive landscape | `{product} alternatives competitors`      |
| Technology validation | `{technology} reviews case studies`       |
| Team research         | `"{founder}" linkedin previous companies` |
| Recent news           | `"{company}" news 2024`                   |
| Funding news          | `"{company}" raised funding series`       |
| Acquisition rumors    | `"{company}" acquisition deal`            |

## Advanced Combinations

```
"{company}" (funding OR raised OR valuation) after:2024
site:linkedin.com/in "{founder}" (CEO OR founder)
filetype:pdf "{company}" (pitch deck OR investor presentation)
```

## Source-Specific Queries

```
site:news.ycombinator.com "{company}" OR "{product}"
site:producthunt.com "{company}" OR "{product}"
site:github.com "{company}" OR "{technology}"
site:sec.gov "{company}" CIK
```
