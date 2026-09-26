# Gym App Project Doctrine

## Product authority

- `SPEC.md` is the product source of truth. Read it before making product decisions or implementing features.
- Preserve working code. Do not rewrite or regenerate the app unless the existing implementation is clearly unusable.
- Implement the smallest change that satisfies the current requirement and the relevant alpha acceptance criterion.
- This is a private, single-user personal instrument, not a startup or general-purpose product.

## Scope discipline

- Do not anticipate future requirements.
- Do not add speculative infrastructure, abstractions, extensibility, configurability, design systems, generalized frameworks, or defensive machinery unless the current requirement needs them.
- Do not fill product gaps merely because similar apps commonly have those features.
- Do not broaden a task while implementing it.
- Prefer direct, boring, maintainable code and explicit database fields.
- Prefer one obvious workflow over configurability.
- Visual polish is secondary to a working, fast, phone-friendly flow.
- If a choice is reversible, choose the simpler implementation and keep moving.
- When uncertain whether work is necessary for alpha, default to not building it.

## Working with Josh

- Assume Josh is non-technical and does not want routine implementation work delegated back to him.
- If the agent can safely perform a technical action itself, it should do so rather than instructing Josh to do it.
- Only require Josh's action when it strictly needs his login, approval, secret, local-device interaction, subjective product choice, or another capability the agent genuinely lacks.
- When Josh must act, give precise, minimal, step-by-step instructions: exactly what to open, click, type, copy, or report back.
- Do not ask Josh to run diagnostic commands, edit files, move code, or perform repository/database operations that the agent can perform itself.
- Do not present a menu of technical choices when one simple option clearly satisfies `SPEC.md`; choose the simple option.
- Explain technical details in plain language unless Josh asks for depth.

## Definition of good progress

The priority is a simple workable alpha as soon as possible. Before adding work, ask:

> Does this directly help satisfy `SPEC.md` or make Josh's actual training logging or later analysis materially easier right now?

If not, do not build it.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
