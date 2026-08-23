# infrastructure

The AWS infrastructure for Team Targét, defined in Python with
[CDK Terrain](https://cdktn.io/docs) (CDKTN).

This is a base scaffold, not a finished deployment. One stack exists today:

| Stack | State key | What it holds |
|---|---|---|
| `network` | `network.tfstate` | VPC, internet gateway, two public subnets, route table |

Everything this application needs to run (API hosting, a database, frontend hosting, and
whatever else `backend/` and `frontend/` end up needing) is **not yet decided** and is not
built here speculatively. Add it as its own stack, following the pattern `network`
establishes, once there's a real decision to encode.

## Design

Ported from Kisasa's own `intent-to-production/infrastructure` (TypeScript, same
framework), adapted to Python. The shape:

- **Context is the only configuration source** — every value comes from the `context`
  block of [`cdktf.json`](cdktf.json), read once per stack in the base stack's constructor.
  Nothing reads an environment variable.
- **A base stack** (`stacks/tarjay_stack.py`) owns the AWS provider and the S3 backend, so
  every real stack subclass gets both for free.
- **Typed config, with validating factories** — `models/context.py`'s `require_*` helpers
  throw at synth time, naming the missing key, rather than letting a `None` propagate into
  a resource and fail an apply twenty minutes later.
- **Named state keys** (`common.py`'s `TF_STATE_KEYS`) rather than inline strings, so a typo
  can't silently point a stack at empty state.
- **Reusable constructs** (`infra_constructs/`) for pieces more than one stack will need.

One thing diverges from the reference project on purpose, not by oversight:

**The reusable-pieces folder is `infra_constructs/`, not `constructs/`.** The TypeScript
project names it `constructs/` with no conflict, because Node's module resolution for
`import { Construct } from "constructs"` goes through `node_modules`, never a same-named
local folder. Python has no such separation — a same-named top-level package on `sys.path`
(which includes the working directory) shadows the real `constructs` PyPI package that
`cdktn` itself depends on, and every import of the SDK's own `Construct` base class breaks.
Do not rename this folder back to `constructs/`; it will resynthesize the exact same crash
that led to the rename here.

## Prerequisites

Not managed by this project — each either has to exist before Terraform runs, or is
created by a process outside it.

| Thing | Why it is not in a stack |
|---|---|
| S3 state bucket, versioned | Cannot live in the state it holds. **Does not exist yet for this project** — create it, then replace `state-bucket-name` in `cdktf.json`. |
| An AWS profile named in `aws.profile` | |
| Terraform or OpenTofu **>= 1.10** on PATH | Required for S3-native state locking (`use_lockfile`), which is why there is no DynamoDB lock table |
| Node.js **>= 22.19** and the `cdktn-cli` npm package on PATH | CDK Terrain's CLI (`cdktn synth`/`diff`/`deploy`) is a Node binary even in a Python project — install with `npm install -g cdktn-cli` |

## Configuration

Every setting comes from the `context` block of [`cdktf.json`](cdktf.json). Values marked
`REPLACE_ME` in the committed file are placeholders — deliberately not filled in, so no
account number, region, profile name, or bucket name is committed to this repository.
Fill them in locally (or via an untracked override) before running `synth` against real
infrastructure.

| Key | Notes |
|---|---|
| `aws.region` | `REPLACE_ME` |
| `aws.account-number` | `REPLACE_ME`. Also passed as `allowed_account_ids`, so a mis-set profile fails the plan rather than applying to the wrong account |
| `aws.profile` | `REPLACE_ME` |
| `state-bucket-name` | `REPLACE_ME` — see Prerequisites |
| `global-tags` | Applied to every resource, plus a per-stack `stack` tag |
| `vpc-cidr-block` | `10.20.0.0/22` — a real default, not a placeholder; it's a private RFC 1918 block with nothing sensitive about it. Adjust if it collides with something else in the account. Split into `/24` subnets; two blocks left spare for a private tier if one is ever needed. |

## Working with it

```bash
poetry install
poetry run python main.py   # sanity-checks that main.py itself imports and runs
```

```bash
cdktn synth
cdktn diff --skip-synth network
cdktn deploy --skip-synth --auto-approve network
```

```bash
poetry run pytest       # unit / construct-synth tests
poetry run ruff check .  # lint
poetry run mypy .        # typecheck
```

## Layout

```
main.py                  Stack construction and (eventually) dependency wiring
common.py                Name formatting and state keys
cdktf.json               Project config; the context block is all the settings
models/                  Typed configuration and stack outputs, with from-context factories
infra_constructs/        Reusable pieces. Named infra_constructs, not constructs -- see Design
stacks/                  tarjay_stack.py (base) plus network.py
tests/                   pytest; construct tests synth a real TerraformStack and assert on
                         the JSON via Testing.synth(stack) -- not Testing.synth_scope(fn), which
                         doesn't cross the Python/jsii boundary. See tests/test_network_vpc.py.
```

## Known gaps

Honest about what this does not do yet.

- **Only one stack.** No compute, no database, no frontend hosting, no DNS/certificate,
  no CI/CD wiring — none of it is decided yet, let alone built. `network` exists because a
  VPC is the one piece almost any AWS deployment needs first, not because the rest is out
  of scope.
- **No CI.** Nothing runs `cdktn synth`, `pytest`, `ruff`, or `mypy` automatically yet.
- **The state bucket doesn't exist.** `state-bucket-name` in `cdktf.json` is a placeholder;
  `cdktn deploy` will fail until a real, versioned bucket exists and the value is filled in.
- **One environment.** Nothing in the code assumes a single environment; only `cdktf.json`
  does. Adding a second means a second context file or a second directory of stacks —
  not yet decided which.
