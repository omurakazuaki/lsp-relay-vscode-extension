# Failure Log

Record of mistakes, root causes, fixes, and preventions.

---

## 2026-02-27: `exactOptionalPropertyTypes` incompatibility with zod-parsed optional fields

**What happened:** TypeScript error when passing zod-parsed optional fields (type `T | undefined`) to interface properties declared as `?: T` (without `| undefined`). The error appeared in `search.handler.ts` line 42.

**Root cause:** `exactOptionalPropertyTypes: true` distinguishes between "property is absent" and "property is explicitly `undefined`". Zod parses missing optional fields as `undefined`, which cannot be assigned to `?: T` (only to `?: T | undefined`).

**Fix applied:** Changed all optional fields in `SearchQueryInput` (and all subsequent port interfaces) to use `?: T | undefined` pattern explicitly.

**Prevention:** All port interfaces and DTOs now use `?: T | undefined` for optional fields. Added a note to development guidelines.

**Docs updated:** `docs/development-guidelines.md` (TypeScript notes section)

---

## 2026-02-27: `AppError` discriminated union field access without narrowing

**What happened:** TypeScript error accessing `result.error.message` on `AppError` without first narrowing the `kind` discriminant. The `AppError` union has different fields per variant.

**Root cause:** Accessing a field that only exists on some union members without narrowing first.

**Fix applied:** Created `describeError(err: AppError): string` function with exhaustive `switch` on `err.kind`, handling all variants.

**Prevention:** All error-to-string conversions now go through `describeError()`. Never access `.message` or other variant-specific fields directly without narrowing.

**Docs updated:** Pattern documented in handler template.

---

## 2026-02-27: `http.AddressInfo` does not exist

**What happened:** TypeScript error — `http.AddressInfo` does not exist; the type is on the `net` module.

**Root cause:** Misremembered which Node.js module exports `AddressInfo`.

**Fix applied:** Imported `net` module and used `net.AddressInfo`.

**Prevention:** Note added to MEMORY.md. Use `net.AddressInfo` for socket address types.

**Docs updated:** `memory/MEMORY.md`
