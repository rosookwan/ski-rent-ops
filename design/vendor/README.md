# Bundled browser assets

The published demo loads fonts and icons from its own generated HTML. It does not depend on the Codex app or an external CDN at runtime.

- **Pretendard Variable 1.3.9** — https://github.com/orioncactus/pretendard/tree/v1.3.9 — SIL Open Font License, see `LICENSE-Pretendard`.
- **Lucide 1.17.0** — https://www.npmjs.com/package/lucide/v/1.17.0 — ISC and applicable MIT icon licenses, see `LICENSE-lucide`.

The binary font is embedded as a data URL, and the icon bundle is inlined by `scripts/build.py`.
