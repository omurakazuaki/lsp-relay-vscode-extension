# SemCode — Development Guidelines

> **Version:** 1.0 | **Date:** February 2026

**Purpose:** This document defines the coding standards, architectural decisions, and development workflows for the SemCode project. All contributors must follow these guidelines to ensure consistency, quality, and long-term maintainability.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Coding Standards](#2-coding-standards)
3. [Error Handling](#3-error-handling)
4. [Testing Strategy](#4-testing-strategy)
5. [Domain-Driven Design](#5-domain-driven-design)
6. [Git Workflow](#6-git-workflow)
7. [Dependency Management](#7-dependency-management)
8. [Code Review Checklist](#8-code-review-checklist)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Documentation Standards](#10-documentation-standards)
11. [Performance Guidelines](#11-performance-guidelines)
12. [Security Guidelines](#12-security-guidelines)

---

## 1. Architecture

### 1.1 Clean Architecture

SemCode adopts Clean Architecture to isolate business logic from infrastructure concerns. Dependencies always point inward: outer layers depend on inner layers, never the reverse.

#### 1.1.1 Layer Structure

```
src/
  domain/            # Innermost: entities, value objects, domain errors
    entities/
    value-objects/
    errors/
  application/       # Use cases, port interfaces (input/output)
    use-cases/
    ports/
  infrastructure/    # Adapters: VS Code API, HTTP server, file system
    vscode-adapter/
    http-server/
    skill/
  shared/            # Cross-cutting: logger, result types, constants
```

| Layer          | Contains                                      | Depends On                  |
| -------------- | --------------------------------------------- | --------------------------- |
| Domain         | Entities, Value Objects, Domain Errors        | Nothing (zero dependencies) |
| Application    | Use Cases, Port Interfaces                    | Domain only                 |
| Infrastructure | VS Code Adapter, HTTP Server, Skill Installer | Application + Domain        |
| Shared         | Result type, Logger interface, Constants      | Nothing (utility only)      |

#### 1.1.2 Dependency Rule

The fundamental rule: **source code dependencies must point inward.** Infrastructure code must never be imported by domain or application layers.

```typescript
// ✅ GOOD: use-case imports domain entity
import { Symbol } from "../domain/entities";

// ✅ GOOD: use-case defines port interface
export interface SymbolRepository {
  search(query: string): Promise<Symbol[]>;
}

// ❌ BAD: use-case imports vscode directly
import * as vscode from "vscode";

// ❌ BAD: domain depends on infrastructure
import { HttpServer } from "../infrastructure/http";
```

> **Enforcement:** ESLint import restriction rules must be configured to prevent cross-layer violations. CI will fail on any dependency rule breach.

### 1.2 Interface-First Design

All development begins with interface design. Before writing any implementation, define the contract as a TypeScript interface in the `application/ports` directory.

#### 1.2.1 Design Process

1. **Define the Port interface** in `application/ports/`
2. **Write unit tests** against the interface using mocks
3. **Implement the adapter** in `infrastructure/`
4. **Wire dependencies** via the composition root

#### 1.2.2 Port Interface Conventions

```typescript
// application/ports/symbol-repository.port.ts

export interface SymbolSearcher {
  /** Search workspace symbols by query string */
  search(query: SearchQuery): Promise<Result<SymbolInfo[]>>;
}

// infrastructure/vscode-adapter/vscode-symbol-searcher.adapter.ts
export class VscodeSymbolSearcherAdapter implements SymbolSearcher {
  // ... implementation using vscode.executeWorkspaceSymbolProvider
}
```

---

## 2. Coding Standards

### 2.1 TypeScript Strict Mode

The project uses TypeScript in strict mode with additional constraints.

#### 2.1.1 tsconfig Requirements

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

#### 2.1.2 `any` Type Prohibition

**The use of `any` is strictly prohibited.** No exceptions. Use proper types, generics, `unknown`, or discriminated unions instead.

| Situation                | Instead of `any`      | Use                                   |
| ------------------------ | --------------------- | ------------------------------------- |
| Unknown external data    | `any`                 | `unknown` + type guard / zod schema   |
| Flexible function params | `any`                 | Generics: `<T extends Constraint>`    |
| JSON parsing             | `JSON.parse() as any` | `zod.parse()` or manual validation    |
| Complex union            | `any`                 | Discriminated union with `kind` field |
| Third-party lib types    | `any`                 | Declaration merging or wrapper type   |

```typescript
// ✅ GOOD: Proper type narrowing
function parse(raw: unknown): Symbol {
  return symbolSchema.parse(raw);
}

// ✅ GOOD: Generic constraint
function first<T>(items: T[]): T | undefined {
  return items[0];
}

// ❌ BAD: any leaks into the system
function parse(raw: any): Symbol {
  return raw as Symbol;
}

// ❌ BAD: eslint-disable no-explicit-any
function first(items: any[]): any {
  return items[0];
}
```

> **ESLint Rule:** `@typescript-eslint/no-explicit-any` is set to `error`. `@typescript-eslint/no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, and `no-unsafe-return` are also errors. `eslint-disable` for these rules requires a PR comment explaining why.

### 2.2 SOLID Principles

#### 2.2.1 Single Responsibility Principle (SRP)

Each class/module has exactly one reason to change. Use cases are the primary unit of business logic, each handling a single operation.

```typescript
// ✅ One use case = one responsibility
class SearchSymbolsUseCase {
  execute(query: SearchQuery): Promise<Result<SearchResult>> { ... }
}

// ❌ NOT: a god class handling everything
class SymbolService {
  search() { ... }
  inspect() { ... }
  getReferences() { ... }
  getDiagnostics() { ... }  // Too many responsibilities
}
```

#### 2.2.2 Open/Closed Principle (OCP)

Extend behavior by adding new implementations, not by modifying existing code. New endpoints are added by creating new use cases and adapters without changing existing ones.

#### 2.2.3 Liskov Substitution Principle (LSP)

All implementations of a port interface must be interchangeable. A mock `SymbolRepository` used in tests must behave identically (in contract terms) to the `VsCodeSymbolRepository` used in production.

#### 2.2.4 Interface Segregation Principle (ISP)

Port interfaces must be small and focused. Prefer multiple specific interfaces over one large interface.

```typescript
// ✅ GOOD: Segregated interfaces
interface SymbolSearcher {
  search(q: SearchQuery): Promise<Result<SymbolInfo[]>>;
}
interface ReferenceProvider {
  findReferences(loc: SymbolLocation): Promise<Result<Reference[]>>;
}
// Each consumer depends only on what it actually needs

// ❌ BAD: Monolithic interface
interface SymbolService {
  search(q: SearchQuery): ...
  findReferences(loc: SymbolLocation): ...
  getDiagnostics(file: ...): ...
  getOutline(file: ...): ...
  // Consumer forced to depend on all
}
```

#### 2.2.5 Dependency Inversion Principle (DIP)

High-level modules (use cases) must not depend on low-level modules (VS Code API). Both depend on abstractions (port interfaces). All dependencies are injected via constructor injection.

```typescript
// Composition root (infrastructure layer) wires everything
const symbolRepo = new VsCodeSymbolRepository(vsCodeApi);
const searchUseCase = new SearchSymbolsUseCase(symbolRepo);
const httpHandler = new SearchHandler(searchUseCase);
```

### 2.3 Naming Conventions

| Category           | Convention                      | Example                           |
| ------------------ | ------------------------------- | --------------------------------- |
| Files              | kebab-case                      | `search-symbols.use-case.ts`      |
| Interfaces (ports) | PascalCase, no 'I' prefix       | `SymbolRepository`                |
| Classes            | PascalCase                      | `VsCodeSymbolRepository`          |
| Functions/Methods  | camelCase, verb-first           | `searchSymbols()`, `toDto()`      |
| Constants          | UPPER_SNAKE_CASE                | `MAX_SEARCH_RESULTS`              |
| Type Aliases       | PascalCase                      | `SearchQuery`, `SymbolKind`       |
| Enums              | PascalCase + PascalCase members | `SymbolKind.Function`             |
| Test files         | `*.test.ts`                     | `search-symbols.use-case.test.ts` |
| Port interfaces    | `*.port.ts`                     | `symbol-repository.port.ts`       |

### 2.4 File Suffix Conventions

File suffixes communicate the role and layer of each module at a glance.

| Suffix             | Layer          | Purpose                     |
| ------------------ | -------------- | --------------------------- |
| `.entity.ts`       | Domain         | Domain entities             |
| `.value-object.ts` | Domain         | Value objects               |
| `.error.ts`        | Domain         | Domain-specific errors      |
| `.port.ts`         | Application    | Port interfaces (contracts) |
| `.use-case.ts`     | Application    | Use case implementations    |
| `.dto.ts`          | Application    | Data transfer objects       |
| `.adapter.ts`      | Infrastructure | Adapter implementations     |
| `.handler.ts`      | Infrastructure | HTTP request handlers       |
| `.test.ts`         | Test           | Unit / integration tests    |

---

## 3. Error Handling

### 3.1 Result Type Pattern

Functions that can fail must return a `Result` type instead of throwing exceptions. Exceptions are reserved for truly unexpected, unrecoverable situations.

```typescript
// shared/result.ts
type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Helper constructors
const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Usage in use case
async execute(query: SearchQuery): Promise<Result<SearchResult>> {
  const symbols = await this.repo.search(query);
  if (!symbols.ok) return symbols; // propagate error
  return Ok({ results: symbols.value, total: symbols.value.length });
}
```

### 3.2 Error Hierarchy

Domain errors are typed and hierarchical. Each error carries a `kind` for programmatic handling and a message for humans.

```typescript
// domain/errors/app-error.ts
type AppError =
  | { kind: "NOT_FOUND"; entity: string; id: string }
  | { kind: "VALIDATION"; field: string; message: string }
  | { kind: "TIMEOUT"; operation: string; ms: number }
  | { kind: "LSP_UNAVAILABLE"; language: string }
  | { kind: "INTERNAL"; message: string; cause?: unknown };
```

### 3.3 Error Translation at Boundaries

Infrastructure adapters catch external exceptions and translate them into Result errors. The HTTP layer maps `AppError` kinds to HTTP status codes. No raw exceptions should cross layer boundaries.

| AppError Kind     | HTTP Status               |
| ----------------- | ------------------------- |
| `VALIDATION`      | 400 Bad Request           |
| `NOT_FOUND`       | 404 Not Found             |
| `TIMEOUT`         | 408 Request Timeout       |
| `LSP_UNAVAILABLE` | 503 Service Unavailable   |
| `INTERNAL`        | 500 Internal Server Error |

> **Rule:** Never throw in domain or application layers. Never catch and swallow errors. Never use try/catch as control flow. The only try/catch blocks should be in infrastructure adapters wrapping external API calls.

---

## 4. Testing Strategy

### 4.1 Test Pyramid

Focus testing effort where it provides the most value.

| Level       | Scope                     | Target                      | Coverage                   |
| ----------- | ------------------------- | --------------------------- | -------------------------- |
| Unit        | Single use case / entity  | Domain + Application layers | Required for all use cases |
| Integration | Adapter + external system | Infrastructure adapters     | Required for each adapter  |
| E2E         | Full HTTP request         | Entire system               | Key workflows only         |

### 4.2 Unit Testing Principles

#### 4.2.1 Focus on Essential Cases

Write tests for the cases that matter. Do not aim for line coverage metrics. Instead, focus on behavioral coverage of meaningful scenarios.

**Every use case test must cover:**

- **Happy path:** Valid input produces expected output.
- **Primary error path:** The most likely failure mode returns the correct error.
- **Edge cases:** Empty results, boundary values, concurrent access if applicable.
- **Domain invariants:** Validation rules that protect business logic.

**Do NOT write tests for:**

- Trivial getters/setters or DTOs with no logic.
- Framework boilerplate or configuration wiring.
- Exact string formatting of error messages.

#### 4.2.2 Test Structure: Arrange-Act-Assert

```typescript
describe('SearchSymbolsUseCase', () => {
  it('returns matching symbols for valid query', async () => {
    // Arrange
    const repo = createMockSymbolRepository({
      search: async () => Ok([mockSymbol({ name: 'authMiddleware' })]),
    });
    const useCase = new SearchSymbolsUseCase(repo);

    // Act
    const result = await useCase.execute({ query: 'auth', limit: 10 });

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results).toHaveLength(1);
      expect(result.value.results[0].symbol).toBe('authMiddleware');
    }
  });

  it('returns empty results when no symbols match', async () => { ... });
  it('propagates LSP_UNAVAILABLE when server is down', async () => { ... });
  it('respects limit parameter', async () => { ... });
});
```

#### 4.2.3 Mock Strategy

Mocks are created from port interfaces. Each mock is a minimal implementation that satisfies the interface contract. Prefer hand-written factory functions over mocking libraries for type safety.

```typescript
// test/helpers/mock-symbol-repository.ts
export function createMockSymbolRepository(
  overrides: Partial<SymbolRepository> = {},
): SymbolRepository {
  return {
    search: async () => Ok([]),
    inspect: async () => Err({ kind: "NOT_FOUND", entity: "Symbol", id: "" }),
    ...overrides,
  };
}
```

### 4.3 Test File Organization

Test files are co-located with their source files.

```
application/
  use-cases/
    search-symbols.use-case.ts
    search-symbols.use-case.test.ts    # co-located
    find-references.use-case.ts
    find-references.use-case.test.ts
```

---

## 5. Domain-Driven Design

### 5.1 Domain Model

The domain layer models the core concepts of code navigation. Entities and value objects encapsulate business rules and validation.

#### 5.1.1 Key Entities and Value Objects

| Name             | Type         | Description                                                      |
| ---------------- | ------------ | ---------------------------------------------------------------- |
| `SymbolInfo`     | Entity       | A code symbol with name, kind, location, and metadata.           |
| `SymbolDetail`   | Entity       | Extended symbol info including body, references, type hierarchy. |
| `SearchQuery`    | Value Object | Validated search parameters (query string, scope, filters).      |
| `SymbolLocation` | Value Object | File path + line + character. Immutable.                         |
| `FileOutline`    | Entity       | Structured representation of a file's symbols and imports.       |
| `Diagnostic`     | Entity       | A compiler/linter diagnostic with severity, location, message.   |
| `WorkspaceInfo`  | Entity       | Project structure, language stats, entry points.                 |

#### 5.1.2 Value Object Example

```typescript
// domain/value-objects/search-query.value-object.ts
export class SearchQuery {
  private constructor(
    readonly query: string,
    readonly scope: SearchScope,
    readonly kinds: ReadonlyArray<SymbolKind> | null,
    readonly limit: number,
    readonly includeBody: boolean,
  ) {}

  static create(params: SearchQueryInput): Result<SearchQuery> {
    if (params.query.trim().length === 0) {
      return Err({
        kind: "VALIDATION",
        field: "query",
        message: "Query must not be empty",
      });
    }
    const limit = Math.min(params.limit ?? 15, 100);
    return Ok(
      new SearchQuery(
        params.query.trim(),
        params.scope ?? "workspace",
        params.kinds ?? null,
        limit,
        params.includeBody ?? false,
      ),
    );
  }
}
```

### 5.2 Ubiquitous Language

The following terms are used consistently across code, documentation, and communication.

| Term       | Definition                                             | NOT                         |
| ---------- | ------------------------------------------------------ | --------------------------- |
| Symbol     | A named code element (function, class, variable, type) | Token, identifier, node     |
| Inspect    | Get detailed info about a specific symbol              | Describe, analyze, detail   |
| Reference  | A location where a symbol is used                      | Usage, occurrence, mention  |
| Outline    | Structural summary of a file's symbols                 | Structure, tree, overview   |
| Diagnostic | An error/warning from the language server              | Issue, problem, lint error  |
| Port       | An interface defining a boundary contract              | Interface, service, gateway |
| Adapter    | An implementation of a port for a specific technology  | Provider, connector, plugin |

---

## 6. Git Workflow

### 6.1 Commit Message Format

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). Every commit message must include a type, an optional scope, and a description.

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

#### 6.1.1 Commit Types

| Type       | Description                             | Example                                              |
| ---------- | --------------------------------------- | ---------------------------------------------------- |
| `feat`     | New feature                             | `feat(search): add kind filter to symbol search`     |
| `fix`      | Bug fix                                 | `fix(http): handle empty query parameter`            |
| `refactor` | Code change that neither fixes nor adds | `refactor(domain): extract SearchQuery value object` |
| `test`     | Adding or updating tests                | `test(search): add include_hover edge case`          |
| `docs`     | Documentation only                      | `docs: update API spec with /diagnostics`            |
| `chore`    | Build, CI, tooling                      | `chore: upgrade typescript to 5.5`                   |
| `perf`     | Performance improvement                 | `perf(search): cache workspace symbol results`       |

#### 6.1.2 Scope Values

| Scope      | Area                                         |
| ---------- | -------------------------------------------- |
| `domain`  | Domain layer entities, value objects, errors |
| `search`  | Search endpoint / use case                   |
| `refs`    | References endpoint / use case               |
| `outline` | File outline endpoint / use case             |
| `diag`    | Diagnostics endpoint / use case              |
| `http`    | HTTP server infrastructure                   |
| `skill`   | Skill installer                              |
| `vscode`  | VS Code extension adapter                    |

### 6.2 Single Responsibility Commits

Each commit must represent exactly one logical change. This makes code review easier, enables clean reverts, and produces a meaningful git history.

```
✅ GOOD                                ❌ BAD
─────────────────────────────────────  ─────────────────────────────────────
Commit 1:                              Commit 1:
  feat(domain): add SearchQuery VO       feat: add search feature with tests
                                         and HTTP endpoint and also fix some
Commit 2:                                typos in the README
  feat(search): implement SearchUseCase
                                         (multiple concerns, impossible
Commit 3:                                 to revert partially)
  feat(http): add /search endpoint

Commit 4:
  test(search): add use case unit tests
```

### 6.3 Branch Strategy

| Branch    | Purpose                 | Naming                          |
| --------- | ----------------------- | ------------------------------- |
| `main`    | Production-ready code   | `main`                          |
| `develop` | Integration branch      | `develop`                       |
| Feature   | New features            | `feat/<scope>/<short-desc>`     |
| Fix       | Bug fixes               | `fix/<scope>/<short-desc>`      |
| Refactor  | Structural improvements | `refactor/<scope>/<short-desc>` |

### 6.4 Pull Request Requirements

- All tests pass (unit + integration).
- No ESLint errors or warnings.
- TypeScript compiles with zero errors.
- PR description explains **what** and **why** (not how).
- Each PR addresses a single feature, fix, or refactor.
- Breaking changes are clearly documented.

---

## 7. Dependency Management

### 7.1 Library Selection Criteria

Every new dependency must be evaluated against the following criteria before adoption.

| Criterion      | Requirement                                      | Rationale                                 |
| -------------- | ------------------------------------------------ | ----------------------------------------- |
| Maintenance    | Active development within last 6 months          | Abandoned libraries become security risks |
| Type Safety    | First-class TypeScript types (bundled or @types) | No any-typed libraries                    |
| License        | MIT, Apache-2.0, or BSD                          | Avoid copyleft in extension code          |
| Size           | Prefer zero-dependency or minimal deps           | Reduce supply chain risk and bundle size  |
| Alternatives   | Must compare at least 2 alternatives             | Avoid lock-in to suboptimal choices       |
| Security       | No known CVEs at time of adoption                | Check via `npm audit` and Snyk            |
| VS Code compat | Must work in VS Code extension host              | No Node-only APIs in domain/application   |

### 7.2 Approved Libraries

| Library   | Purpose                                       | Layer                        |
| --------- | --------------------------------------------- | ---------------------------- |
| `zod`     | Runtime type validation and schema definition | Application / Infrastructure |
| `vitest`  | Unit and integration testing                  | Test                         |
| `esbuild` | Bundling extension                            | Build                        |

### 7.3 Adding New Dependencies

1. Open an issue with title: `dep: add <library-name>`
2. Document evaluation against all criteria in Section 7.1.
3. List alternatives considered and reasons for selection.
4. Require approval from at least one other contributor.

> **Rule:** Do not add devDependencies to the extension runtime bundle.

---

## 8. Code Review Checklist

Reviewers must verify each item before approving a pull request.

### 8.1 Architecture

- No dependency rule violations (inner layers must not import outer layers).
- New functionality uses port interfaces, not direct dependencies.
- Use cases are single-responsibility and focused.

### 8.2 Type Safety

- `any` is not used anywhere (including type assertions).
- All external data is validated at the boundary (zod or type guards).
- No `as` type assertions unless accompanied by a runtime check.

### 8.3 Error Handling

- Functions that can fail return `Result<T, E>`.
- No unhandled promise rejections or uncaught throws in application/domain.
- Infrastructure adapters wrap all external calls in try/catch and return Result.

### 8.4 Testing

- New use cases have corresponding unit tests.
- Tests cover happy path, primary error path, and meaningful edge cases.
- Mocks are created from port interfaces, not from implementations.

### 8.5 Git Hygiene

- Commit messages follow Conventional Commits format.
- Each commit is single-responsibility.
- No merge commits in the PR (rebase on target branch).

---

## 9. CI/CD Pipeline

The CI pipeline runs on every push and pull request. All checks must pass before merge.

### 9.1 Pipeline Stages

| Stage             | Command                            | Failure Blocks Merge |
| ----------------- | ---------------------------------- | -------------------- |
| Type Check        | `tsc --noEmit`                     | Yes                  |
| Lint              | `eslint --max-warnings 0`          | Yes                  |
| Unit Tests        | `vitest run`                       | Yes                  |
| Integration Tests | `vitest run --project integration` | Yes                  |
| Build             | `esbuild` (extension)              | Yes                  |
| Bundle Size Check | Custom script, threshold TBD       | Warning only         |

### 9.2 ESLint Configuration Highlights

```
// Key rules (non-negotiable)
@typescript-eslint/no-explicit-any: 'error'
@typescript-eslint/no-unsafe-assignment: 'error'
@typescript-eslint/no-unsafe-call: 'error'
@typescript-eslint/no-unsafe-member-access: 'error'
@typescript-eslint/no-unsafe-return: 'error'
@typescript-eslint/explicit-function-return-type: 'error'
import/no-restricted-paths: [configured per layer]
no-console: 'error'  // use Logger port instead
```

---

## 10. Documentation Standards

### 10.1 Code Documentation

- **Port interfaces:** Every method must have a JSDoc comment describing its contract, parameters, return value, and possible errors.
- **Use cases:** Document the business rule and any preconditions.
- **Domain entities:** Document invariants and validation rules.
- **Infrastructure adapters:** Document external system assumptions and limitations.
- **Non-obvious code:** Explain **why**, not what. The code shows what; comments explain the reasoning.

### 10.2 ADR (Architecture Decision Records)

Significant architectural decisions are documented in ADR format in the `docs/adr/` directory. An ADR is required for decisions on dependency adoption, architectural pattern changes, API design choices, and trade-offs between competing approaches.

```
docs/adr/
  001-clean-architecture.md
  002-result-type-over-exceptions.md
  003-zod-for-validation.md
  004-vitest-over-jest.md
```

### 10.3 Changelog

`CHANGELOG.md` is maintained following the [Keep a Changelog](https://keepachangelog.com/) format. Entries are grouped by: Added, Changed, Fixed, Removed, Deprecated, and Security. Each entry links to the relevant PR.

---

## 11. Performance Guidelines

- **Default limits:** All list-returning endpoints have a default limit (15 for search, 30 for references). Never return unbounded results.
- **Lazy loading:** `include_body`, `references_summary`, and `type_hierarchy` are opt-in fields. Do not compute them unless requested.
- **Timeouts:** All VS Code API calls must have a configurable timeout (default: 10s). Never await without a timeout.
- **Caching:** Consider caching workspace symbol results for repeated queries within a short window. Cache invalidation must be tied to file change events.
- **Streaming:** For future consideration. Large reference results could benefit from streaming rather than buffering the entire response.

---

## 12. Security Guidelines

- **Input validation at the boundary:** All HTTP request bodies are validated via zod schemas before reaching use cases. Invalid input is rejected with 400.
- **No eval or dynamic code execution:** Never use `eval()`, `Function()`, or `vm.runInNewContext()`.
- **Path traversal prevention:** File paths received from the API must be resolved and verified to be within the workspace root.
- **No secrets in code:** No hardcoded tokens, keys, or passwords. Use environment variables if authentication is added.
- **Dependency auditing:** Run `npm audit` weekly. Address critical and high severity findings within 48 hours.
