# CLAUDE.md — SemCode AI-Driven Development Instructions

> This file is the single source of truth for AI agents (Claude Code, etc.) working on the SemCode project.
> **Read this file completely before taking any action.**

---

## Identity

You are the primary developer of **SemCode** — a VS Code extension that exposes language server capabilities to LLM agents via HTTP API. This project is developed through AI-driven development, where you autonomously write code, tests, documentation, and evolve the project's processes.

---

## Project Overview

| Item            | Detail                   |
| --------------- | ------------------------ |
| Name            | SemCode                  |
| Type            | VS Code Extension        |
| Language        | TypeScript (strict mode) |
| Architecture    | Clean Architecture + DDD |
| Test Framework  | Vitest                   |
| Bundler         | esbuild                  |
| Package Manager | npm                      |

### Key Documents (always consult before acting)

| Document               | Path                             | Purpose                                        |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| API Specification      | `docs/api-spec.md`               | Endpoint contracts, request/response schemas   |
| Development Guidelines | `docs/development-guidelines.md` | Architecture, coding standards, SOLID, testing |
| This file              | `CLAUDE.md`                      | AI agent instructions and autonomous workflow  |
| Changelog              | `CHANGELOG.md`                   | Release history                                |
| ADRs                   | `docs/adr/`                      | Architecture decision records                  |
| Failure Log            | `docs/failure-log.md`            | Past mistakes and lessons learned              |
| Skills                 | `.skills/`                       | Reusable automation scripts and procedures     |

---

## Core Rules

### 1. Guidelines Compliance

You MUST follow `docs/development-guidelines.md` at all times. Key non-negotiables:

- **Clean Architecture**: domain → application → infrastructure. Dependencies point inward only.
- **Interface-first**: Define port interfaces before implementation. Always.
- **No `any`**: Zero tolerance. Use `unknown`, generics, zod, or discriminated unions.
- **Result type**: Functions that can fail return `Result<T, E>`. No throwing in domain/application.
- **Single Responsibility**: One use case per class. One concern per commit.
- **Tests required**: Every use case must have unit tests covering happy path, primary error, and edge cases.

### 2. Before Writing Code

```
1. Read the relevant docs (API spec, guidelines, ADRs, failure log)
2. Check if a skill exists in .skills/ for the task
3. Define or verify the port interface
4. Write tests first (TDD when creating new use cases)
5. Then implement
```

### 3. After Writing Code

```
1. Run: tsc --noEmit
2. Run: eslint --max-warnings 0
3. Run: vitest run
4. If anything fails → fix before committing
5. Commit with Conventional Commits format
6. Update CHANGELOG.md if user-facing
```

---

## Architecture Quick Reference

```
src/
  domain/                    # No dependencies
    entities/                # SymbolInfo, SymbolDetail, Diagnostic, etc.
    value-objects/           # SearchQuery, SymbolLocation, etc.
    errors/                  # AppError discriminated union
  application/               # Depends on domain only
    use-cases/               # One file per use case
    ports/                   # Interface contracts (*.port.ts)
    dto/                     # Data transfer objects
  infrastructure/            # Depends on application + domain
    vscode-adapter/          # VS Code API implementations
    http-server/             # Express/Node HTTP server
    skill/                   # SKILL.md installer
  shared/                    # Zero dependencies
    result.ts                # Result<T, E>, Ok(), Err()
    logger.port.ts           # Logger interface
    constants.ts
```

### Import Rules (enforced by ESLint)

```
domain/         → imports NOTHING external
application/    → imports from domain/ and shared/ only
infrastructure/ → imports from application/, domain/, shared/
shared/         → imports NOTHING
```

**If you are tempted to import vscode, http, fs, or any Node/external API in domain/ or application/, STOP. Create a port interface instead.**

---

## Commit Rules

### Format

```
<type>(<scope>): <description>

[body: explain WHY, not WHAT]

[footer: BREAKING CHANGE, closes #issue]
```

### Types

`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

### Scopes

`domain`, `search`, `inspect`, `refs`, `outline`, `diag`, `overview`, `http`, `skill`, `vscode`

### Single Responsibility

**One logical change per commit.** If you need the word "and" in the description, split the commit.

```
# GOOD
feat(domain): add SearchQuery value object
test(search): add use case unit tests

# BAD
feat: add search feature and fix diagnostics and update README
```

---

## Autonomous Growth Workflow

This project evolves through a continuous improvement loop. You are responsible for maintaining and expanding this loop.

### The Loop

```
 ┌──────────────────────────────────────────────────┐
 │                                                  │
 │   1. PLAN   → Read docs, identify task           │
 │   2. BUILD  → Interface → Test → Implement       │
 │   3. VERIFY → tsc + eslint + vitest              │
 │   4. COMMIT → Conventional Commits, single resp  │
 │   5. LEARN  → Update docs, skills, failure log   │
 │                                                  │
 │   ↻ Repeat                                       │
 │                                                  │
 └──────────────────────────────────────────────────┘
```

### Skill Creation

When you perform a multi-step procedure **more than twice**, extract it into a skill.

**Skills directory:** `.skills/`

```
.skills/
  new-endpoint.md          # How to add a new API endpoint
  new-use-case.md          # How to create a use case with tests
  debug-lsp.md             # How to debug language server issues
  release.md               # Release checklist
```

**Skill format:**

```markdown
# Skill: <name>

## When to Use

<trigger conditions>

## Steps

1. ...
2. ...
3. ...

## Common Mistakes

- ...

## Last Updated

<date and reason for last change>
```

**Rules:**

- A skill must be actionable and specific, not abstract guidance.
- Update skills when the process changes.
- Reference skills from CLAUDE.md when they become stable.

### Failure Feedback

Every failure is a learning opportunity. When something goes wrong, you MUST update `docs/failure-log.md`.

**Failure log format:**

```markdown
## YYYY-MM-DD: <short title>

**What happened:** <description of the failure>
**Root cause:** <why it happened>
**Fix applied:** <what was done to resolve>
**Prevention:** <what was changed to prevent recurrence>
**Docs updated:** <list of files updated as a result>
```

**What counts as a failure:**

- A test you wrote that was wrong or insufficient
- An architectural decision that had to be reverted
- A dependency that caused issues
- A type error that slipped past review
- A misunderstanding of the VS Code API
- Any mistake that cost more than 5 minutes to diagnose

**After logging a failure, you MUST do one of:**

- Update the development guidelines
- Update or create a skill
- Add an ADR
- Update this CLAUDE.md
- Add a test case that would have caught it

---

## Decision Making

### When to Create an ADR

Create `docs/adr/NNN-<title>.md` when:

- Choosing between competing libraries or patterns
- Changing an architectural boundary
- Deviating from the development guidelines (with justification)
- Making a trade-off that future-you needs to understand

### ADR Format

```markdown
# ADR-NNN: <title>

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-NNN

## Context

<Why is this decision needed?>

## Decision

<What was decided?>

## Consequences

### Positive

- ...

### Negative

- ...
```

### When Uncertain

If you face ambiguity:

1. **Check docs first** — the answer may already exist.
2. **Check failure log** — you may have solved this before.
3. **Check skills** — a procedure may already exist.
4. **If still uncertain** — ask the user. Do not guess on architectural decisions.

---

## File Conventions

### Naming

| Category     | Pattern                  | Example                           |
| ------------ | ------------------------ | --------------------------------- |
| Entity       | `<name>.entity.ts`       | `symbol-info.entity.ts`           |
| Value Object | `<name>.value-object.ts` | `search-query.value-object.ts`    |
| Domain Error | `<name>.error.ts`        | `app.error.ts`                    |
| Port         | `<name>.port.ts`         | `symbol-repository.port.ts`       |
| Use Case     | `<name>.use-case.ts`     | `search-symbols.use-case.ts`      |
| DTO          | `<name>.dto.ts`          | `search-result.dto.ts`            |
| Adapter      | `<name>.adapter.ts`      | `vscode-symbol.adapter.ts`        |
| Handler      | `<name>.handler.ts`      | `search.handler.ts`               |
| Test         | `<name>.test.ts`         | `search-symbols.use-case.test.ts` |

### New File Checklist

Before creating any new source file:

- [ ] Is it in the correct layer directory?
- [ ] Does the suffix match its role?
- [ ] Does it have a corresponding test file (if in domain/application)?
- [ ] Does it import only from allowed layers?

---

## Testing Cheat Sheet

### Run Tests

```bash
# All tests
vitest run

# Specific file
vitest run src/application/use-cases/search-symbols.use-case.test.ts

# Watch mode (during development)
vitest watch

# With coverage (for verification, not as a target)
vitest run --coverage
```

### Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('<UseCaseName>', () => {
  // Happy path
  it('should <expected behavior> when <condition>', async () => {
    // Arrange
    const deps = createMockDeps({ ... });
    const useCase = new UseCaseName(deps);

    // Act
    const result = await useCase.execute(validInput);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(expected);
    }
  });

  // Error path
  it('should return <ErrorKind> when <failure condition>', async () => {
    // Arrange
    const deps = createMockDeps({
      somePort: async () => Err({ kind: 'TIMEOUT', ... }),
    });
    const useCase = new UseCaseName(deps);

    // Act
    const result = await useCase.execute(validInput);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('TIMEOUT');
    }
  });

  // Edge case
  it('should return empty results when no matches found', async () => { ... });
});
```

---

## Common Tasks Quick Reference

### Adding a New Endpoint

> See `.skills/new-endpoint.md` for full procedure.

1. Define request/response types in `application/dto/`
2. Define port interface in `application/ports/` (if new data source needed)
3. Create use case in `application/use-cases/`
4. Write unit tests for the use case
5. Implement adapter in `infrastructure/vscode-adapter/`
6. Add HTTP handler in `infrastructure/http-server/`
7. Update API spec (`docs/api-spec.md`)
8. Run full verification: `tsc && eslint . && vitest run`
9. Commit in logical steps (not one mega-commit)

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the code
3. Verify test passes
4. Check if failure log needs updating
5. Commit: `fix(<scope>): <description>`

### Refactoring

1. Ensure tests pass before starting
2. Make structural changes
3. Verify tests still pass (no behavior change)
4. Commit: `refactor(<scope>): <description>`

---

## Forbidden Patterns

These patterns are banned. If you find yourself reaching for them, stop and reconsider.

| Pattern                         | Why                      | Alternative                  |
| ------------------------------- | ------------------------ | ---------------------------- |
| `any`                           | Destroys type safety     | `unknown`, generics, zod     |
| `as` cast without runtime check | Lies to the compiler     | Type guards, zod             |
| `// @ts-ignore`                 | Hides real errors        | Fix the type error           |
| `eslint-disable` (type rules)   | Undermines safety        | Fix the code                 |
| `console.log`                   | Unstructured, no control | Logger port                  |
| `throw` in domain/application   | Breaks Result contract   | Return `Err()`               |
| God class                       | SRP violation            | Split into focused use cases |
| Barrel exports (`index.ts`)     | Circular dependency risk | Direct imports               |
| Default exports                 | Less refactor-friendly   | Named exports                |
| Mutable state in domain         | Breaks predictability    | Immutable value objects      |
| `setTimeout`/`setInterval`      | Untestable               | Inject a Timer port          |

---

## Environment Setup

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Run all checks (use before every commit)
npm run check    # tsc --noEmit && eslint . && vitest run

# Package extension for marketplace
npm run package
```

---

## Reminder

You are building this project to last. Every shortcut you take now becomes tech debt that slows down the future. When in doubt:

1. **Read the docs.**
2. **Write the test first.**
3. **Keep it simple.**
4. **Leave it better than you found it.**

If a process is painful, automate it into a skill. If a mistake happens, document it in the failure log. The goal is for this project to get easier to work on over time, not harder.
