# CONVENTIONS.md — infrastructure

Rules for `infrastructure/`, the CDK Terrain (CDKTN) Python project defining Team
Targét's AWS infrastructure. Read this before writing any code here.

## Status

This surface is greenfield. There is no prior infrastructure code in this repository to
treat as precedent, and no ADRs yet. The design is deliberately borrowed from Kisasa's
`intent-to-production/infrastructure` (the same framework, in TypeScript) — that project's
patterns are real precedent to follow, not an accident of what happened to exist.

## Orientation

Start at `main.py`, then `stacks/tarjay_stack.py` (the base class every stack subclasses).
`stacks/network.py` is the reference shape for a new stack — copy its structure, not its
resources.

## Where things go

- `stacks/` — one file per stack, one class per file, subclassing `TarjayStack`.
- `models/` — typed configuration and stack outputs, each with a `*_from_context` factory
  that validates the raw context node.
- `infra_constructs/` — reusable pieces used by more than one stack. **Not** `constructs/`
  — that name collides with the `constructs` PyPI package this project's own SDK depends
  on, and breaks every import of the SDK's own `Construct` base class. Do not rename it
  back.
- `common.py` — naming helpers (`format_name`, `format_terraform_id`,
  `security_group_description`) and `TF_STATE_KEYS`, the named registry of state-file keys.
  Add a new stack's key here, not as an inline string in the stack file.
- `tests/` — pytest. See Test levels below for what needs a test and how.

## Stack design

- One stack per logical piece of infrastructure, split by rate of change — not grouped by
  convenience. A piece that changes on every deploy (a service, a worker) does not share a
  stack with a piece that almost never changes (the network).
- Every stack subclasses `TarjayStack`, which wires the AWS provider and the S3 backend and
  reads context. A new stack's constructor reads only the context keys it actually needs,
  declared in `TarjayStack._CONTEXT_KEYS`.
- One state file per stack, named in `common.TF_STATE_KEYS`. A stack that reads another
  stack's outputs does so through `TarjayStack.remote_state(...)`, and the dependency is
  declared explicitly in `main.py` with `.add_dependency(...)` — Terraform cannot infer that
  ordering from a remote-state data source on its own.
- Every resource gets `self.global_tags` plus a `stack` tag identifying which stack created
  it.

## Configuration and secrets

- The `context` block of `cdktf.json` is the only configuration source. Nothing reads an
  environment variable.
- No real AWS account number, region, profile name, or state bucket name is committed to
  this repository. Those stay `REPLACE_ME` in the committed `cdktf.json`; fill them in
  locally or through an untracked override before synthesizing against real infrastructure.
- No secret value ever reaches Terraform state or the synthesized JSON. A stack may only
  ever hold an SSM parameter's ARN; the actual value is read by the running task/container
  at start time, never at synth. There is no exception to this yet — if one becomes
  genuinely unavoidable (a provider that must authenticate with a real value at synth,
  the way the reference project's `temporalcloud` provider does), it must be called out
  explicitly in the stack's own comments and in this file's Known-gaps-equivalent, not
  worked around silently.

## Validation and errors

- Every value pulled from context goes through one of `models/context.py`'s `require_*`
  helpers (`require_string`, `require_number`, `require_node`, `require_string_map`,
  `optional_string`). These raise at synth time, naming the missing key, rather than
  letting `None` reach a resource and fail an apply later.
- Do not default a required context value in code. A missing value is a synth-time error,
  not a fallback.

## Composition and dependencies

- Adding a new Terraform provider or a new Python package is an architect decision. Raise
  it as a question; do not add one on your own judgment, however well-established the
  package is.
- Poetry manages dependencies. `poetry.lock` is committed — every install should be
  reproducible from it.

## Test levels

This project runs one test level: pytest, exercising construct-level synth tests.

**What "test" means here:** build a real `cdktn.TerraformStack` (or a real stack of this
project's own), instantiate the construct or stack inside it, and call
`Testing.synth(stack)` (imported under an alias, e.g. `CdktnTesting`, so pytest doesn't try
to collect the SDK's `Testing` class as a test class) to get the synthesized JSON. Assert
against that JSON, or against the exception a synth-time validation raises.

**Do not use `Testing.synth_scope(fn)`.** It takes a TypeScript call-signature interface
(`(scope) => void`), and jsii cannot marshal a Python callable across that boundary —
passing a plain function raises `JSIIError: Cannot pass function as argument here`, and
wrapping it in a `__call__`-implementing class fails the same way from the JavaScript side
("fn is not a function"). This is a dead end in this Python project specifically, even
though it is the documented pattern in the TypeScript reference project. Use the
`Testing.synth(stack)` shape in `tests/test_network_vpc.py` instead.

**Which constructs need a test:** a construct gets a synth test when it has real branching
logic or a security-relevant invariant — a guard clause, a singleton constraint, an
ingress-scoping rule, a region or count check. A construct that only wires resources
together with no conditionals and nothing security-relevant does not need one.

**How to run it:**

```bash
poetry run pytest        # unit / construct-synth tests
poetry run ruff check .  # lint
poetry run mypy .        # typecheck
```

**What this surface deliberately does not test:** there is no integration test that
actually applies against real AWS, and no drift detection. Both are out of scope until
there's a real deployed environment to test against.

## Deliberately the specialist's call

Multi-environment strategy is intentionally undecided. Today there is one `cdktf.json`
context block and one implied environment. When a second environment is genuinely needed,
whether that becomes a second context file, a second directory of stacks, or something
else is not decided — a specialist facing that need should raise it as a question rather
than picking a shape unilaterally.

## Never in this codebase

- No secret value reaches Terraform state or the synthesized JSON, except through an
  explicitly documented, unavoidable exception (see Configuration and secrets) — never a
  silent workaround.
- No DynamoDB lock table. State locking is S3-native (`use_lockfile=True`), which requires
  Terraform or OpenTofu >= 1.10.
