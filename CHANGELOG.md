# Changelog

## 1.1.0 — 2026-09-27

### Accounting
- Added forward-only database schema migrations for existing installations.
- Added cash, card, and wallet settlement methods for expenses.
- Added cash, card, wallet, and supplier-credit settlement for inventory receipts.
- Corrected journal posting and cash-shift reconciliation for non-cash expenses and stock purchases.
- Aligned credit-invoice returns with targeted debt-payment allocation, including partial-payment protection.

### Reliability
- Added regression coverage for migrations, purchase accounting, credit invoice status, and backup compatibility.
- Kept Android native database self-tests in CI before release artifacts are trusted.

### Android security and releases
- Disabled raw Android OS backups of Haseeb application data.
- Excluded database, files, preferences, and app storage from cloud backup and device-transfer extraction.
- Kept portable data transfer through Haseeb's passphrase-encrypted `.hsb` backups.
- Added signed Android App Bundle (`.aab`) generation alongside release APKs.
- Added tag/package version validation and required complete signing secrets for tagged releases.
- Tagged GitHub releases now publish signed release artifacts only.
