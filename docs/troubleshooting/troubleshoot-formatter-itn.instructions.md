---
description: 'Troubleshooting Vietnamese formatter and ITN boundary/parity failures.'
applyTo: 'packages/formatter/**,tools/transcript-reference/**,test-data/expected/transcript-reference.json'
---

# Formatter ITN troubleshooting

- If a date phrase such as `ngày hai mươi hai tháng sáu năm ...` fails to convert, check whether the month number regex greedily consumed the year marker `năm` as the digit word “five”. Prefer an explicit with-year pass before a without-year pass and use lazy number-phrase groups before structural markers.
- If a decimal phrase such as `ba phẩy năm triệu đồng` fails, keep the fractional side restricted to digit words only. Do not allow magnitude words such as `nghìn`, `triệu`, or `trăm` in fractional digit parsing.
- Regenerate formatter fixtures from the Python reference after rule changes, then run Prettier on `test-data/expected/transcript-reference.json`.
- Re-run both parity sides: `pnpm --filter @speech/formatter test` and `PYTHONPATH=tools/transcript-reference uv run pytest tools/transcript-reference`.
