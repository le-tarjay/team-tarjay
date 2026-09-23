# infrastructure

Runtime provisioning for Team Targét. Two things live here, and they are unrelated to
each other beyond both being this surface's job:

1. **[Local runtime](#local-runtime)** — a `docker-compose` stack running the whole
   application (frontend, API, identity provider) on a developer's machine.
2. **AWS infrastructure**, defined in Python with
   [CDK Terrain](https://cdktn.io/docs) (CDKTN) — everything from [Design](#design)
   onward.

The AWS side is a base scaffold, not a finished deployment. One stack exists today:

| Stack | State key | What it holds |
|---|---|---|
| `network` | `network.tfstate` | VPC, internet gateway, two public subnets, route table |

Everything this application needs to run **on AWS** (API hosting, frontend hosting, and
whatever else `backend/` and `frontend/` end up needing) is **not yet decided** and is not
built here speculatively. Add it as its own stack, following the pattern `network`
establishes, once there's a real decision to encode. The local runtime below is a
separate concern and does not imply anything about the deployed shape.

## Local runtime

The whole application, on your own machine, in one command. Everything it needs is in
[`local/`](local).

```bash
cd infrastructure/local
docker compose up --build      # start (first run builds the images)
docker compose down            # stop, and discard all state
```

Requires Docker with Compose v2. The first build compiles the Angular bundle and
publishes the API, so expect a few minutes; later starts are fast.

### What serves what

| URL | Service | What it is |
|---|---|---|
| http://localhost:4200 | `web` | The app. Angular, **production-built**, served by nginx. Start here. |
| http://localhost:4200/v1/* | `web` → `api` | The API, proxied. This is what makes the stack same-origin, so the browser never needs CORS. |
| http://localhost:5080 | `api` | The API directly. Published for the `ng serve` inner loop and for `curl`; 8080 is already Keycloak's. |
| http://localhost:8080 | `id` | Keycloak. The authority `backend/appsettings.json` already expects — not a free choice. |

**Admin console:** http://localhost:8080 → *Administration Console*, `admin` / `admin`.
Local throwaway credentials; no employee signs in with them. The seeded realm is
`team-targe` — pick it from the realm selector, top left.

### Readiness

Nothing in the stack blocks on Keycloak being up: the API calls it per sign-in request,
not at boot. The stack is ready to sign into once this answers:

```bash
curl -fsS http://localhost:8080/realms/team-targe/.well-known/openid-configuration >/dev/null && echo ready
```

That URL is the right thing for a test harness to poll, rather than a fixed sleep.

### Signing in

Employee ID is the username, PIN is the password. One employee per role, plus a
Customer Support case, so every branch of the frontend's role-based navigation is
reachable with a real credential:

| Employee ID | PIN | Name | Role | Department | Job function |
|---|---|---|---|---|---|
| `10041` | `4417` | Dana Okafor | Associate | Grocery | Stocking |
| `10042` | `5528` | Sam Rivera | DepartmentManager | Grocery | Stocking |
| `10043` | `6639` | Alex Mercer | StoreManager | Store Operations | Store Management |
| `10044` | `7741` | Priya Raman | ReceivingAssociate | Receiving | Receiving |
| `10045` | `8852` | Chris Bell | Associate | Grocery | Customer Support |

A wrong PIN is rejected by Keycloak, which is the case the API turns into its own
invalid-credentials response. Brute-force protection is deliberately off, so repeating
that test does not lock an employee out and break the next run.

### The admin client, for ending an employee's other sessions

Signing in on one device ends that employee's session everywhere else, and the API does
that by calling Keycloak's Admin API. It needs an identity of its own to make that call,
and the realm carries one: a second client, `team-targe-admin`.

| | `team-targe-store` | `team-targe-admin` |
|---|---|---|
| Who uses it | every employee, signing in | the API, and only the API |
| Kind | public | confidential — has a secret |
| Grant | password (Employee ID + PIN) | client credentials |
| Permission | none beyond reading its own identity | `manage-users` on `realm-management`, and nothing else |

**It is not the `admin` / `admin` console login.** That bootstrap credential opens the
admin console and nothing in the application ever authenticates with it; giving the API
a scoped service account instead is the entire point of the second client. Its secret is
`local-development-only-not-a-real-secret`, committed in the realm export and passed to
the API by compose as `Identity__Admin__ClientId` / `Identity__Admin__ClientSecret` — as
throwaway as `admin` / `admin` and the PINs above, and for the same reason: this stack
only ever runs on a developer's machine. A deployed Keycloak would take a real secret
from a secret store, which CONVENTIONS.md's *Configuration and secrets* requires and
which nothing here provisions yet.

`manage-users` is the least Keycloak will accept for the logout call. `realm-admin` would
also work and would carry every other administrative power with it, so the narrower role
is deliberate and `tests/test_local_realm.py` asserts the service account holds exactly
that one grant.

To confirm the client works against a running stack — a token, then a session-termination
call for a signed-in employee:

```bash
# 1. The service account's own token, via the client-credentials grant.
TOKEN=$(curl -fsS -X POST \
  http://localhost:8080/realms/team-targe/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=team-targe-admin \
  -d client_secret=local-development-only-not-a-real-secret | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')

# It must carry manage-users -- decode the payload and look under realm-management.
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | node -pe 'JSON.parse(require("fs").readFileSync(0)).resource_access["realm-management"].roles'

# 2. Give an employee a session to terminate, then find their user id.
curl -fsS -X POST http://localhost:8080/realms/team-targe/protocol/openid-connect/token \
  -d grant_type=password -d client_id=team-targe-store -d username=10041 -d password=4417 >/dev/null
USER_ID=$(curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/admin/realms/team-targe/users?username=10041" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')

# 3. Terminate it. 204, and the session list is empty afterwards.
curl -fsS -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/admin/realms/team-targe/users/$USER_ID/logout"
curl -fsS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/admin/realms/team-targe/users/$USER_ID/sessions"
```

Nothing in the API calls this yet; LET-130 writes that call and consumes the two settings
compose already passes.

### The realm is a file, not a configuration session

[`local/keycloak/team-targe-realm.json`](local/keycloak/team-targe-realm.json) is
imported at container start (`--import-realm`). Keycloak's dev mode keeps its store
inside the container and **nothing mounts a volume for it**, so `docker compose down`
discards it and the next start re-imports from scratch. The realm is therefore identical
on every run.

The practical consequence: **do not configure this realm through the admin console.**
Anything clicked there is gone at the next teardown. Change the export and restart.

Four settings in it are load-bearing and easy to lose:

- **The three custom claims each need a protocol mapper with *Add to userinfo* on.** The
  API reads identity from `/userinfo`, and a user-attribute mapper does not reach
  `/userinfo` by default. Without it the credential check succeeds and the sign-in then
  fails as identity-incomplete — which reads like an API bug and is not one.
- **`store_role`, `department`, and `job_function` are declared in the realm's user
  profile.** Keycloak 24+ drops undeclared ("unmanaged") user attributes on import
  silently.
- **`email`, `firstName`, and `lastName` are declared optional, and every employee has
  no required actions.** Employees have no email address; Keycloak's default profile
  requires one, and an incomplete profile attaches a required action that makes the
  password grant fail instead of returning a token.
- **`team-targe-admin`'s permission lives in `users`, not on the client.** A realm export
  grants a service account its roles through a user entry carrying
  `serviceAccountClientId`, so the client and its `manage-users` grant sit in two
  different sections of the file. The client alone imports fine, issues tokens fine, and
  is refused by the Admin API with a 403 that looks like a bug in the caller.

`tests/test_local_realm.py` asserts all of this, so a regression fails `pytest` rather
than surfacing as a failed sign-in.

### Layout

```
local/
  docker-compose.yml              The stack: web, api, id
  api.Dockerfile                  API image; build context is ../../backend
  web.Dockerfile                  Frontend image, production build + nginx; context ../../frontend
  *.Dockerfile.dockerignore       Per-Dockerfile excludes, so neither surface needs a file added to it
  web/nginx.conf                  Serves the bundle; proxies /v1/* to api; SPA fallback
  keycloak/team-targe-realm.json  The realm, imported at start
```

The Dockerfiles live here rather than in `backend/` and `frontend/` because runtime
provisioning is this surface's job (see CONVENTIONS.md's Cross-surface impact); only
their build contexts reach into those surfaces.

### This is not the only way to run the app

The composed stack is same-origin and is what the e2e suite drives. Running the frontend
outside the stack with `ng serve`, against the composed API and Keycloak, is a separate
loop that needs CORS on the API and a dev-server proxy — neither is here, and neither is
this directory's business.

### Gotchas

- **Don't set an HTTPS port on the API.** `Program.cs` calls `UseHttpsRedirection()`
  unconditionally; with no HTTPS port discoverable it logs a warning and passes requests
  through, which is what makes plain HTTP work. Set `ASPNETCORE_HTTPS_PORTS` and every
  proxied request starts answering 307.
- **`Identity__Authority` is overridden in `docker-compose.yml`, on purpose.**
  `appsettings.json` configures `http://localhost:8080`, which is right on a developer's
  machine and wrong inside a container, where `localhost:8080` is the API itself. The
  realm and the *employee-facing* client id are deliberately *not* repeated in compose —
  they are correct in `appsettings.json`, and duplicating them would let compose silently
  override a real change to it. `Identity__Admin__ClientId` and
  `Identity__Admin__ClientSecret` are the one exception, and are not duplication:
  `appsettings.json` has no `Identity:Admin` section to contradict. The secret could not
  live there anyway, and its client id keeps it company rather than being split across
  two files while nothing binds the section yet. LET-130, which adds that binding, may
  move the non-secret half.
- **Base images are pinned** (`keycloak:26.0`, `dotnet/sdk:10.0`, `dotnet/aspnet:10.0`).
  The API targets `net10.0`, and a floating tag turns that into a restore error that
  reads like a code problem.
- **Ports 4200 and 8080 are not free choices.** 4200 keeps `e2e/playwright.config.ts`'s
  `baseURL` valid; 8080 is the authority `appsettings.json` configures.

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
local/                   The docker-compose runtime -- see Local runtime. Nothing to do with
                         CDKTN or AWS; it is the other half of this surface's job.
tests/                   pytest; construct tests synth a real TerraformStack and assert on
                         the JSON via Testing.synth(stack) -- not Testing.synth_scope(fn), which
                         doesn't cross the Python/jsii boundary. See tests/test_network_vpc.py.
                         test_local_realm.py and test_local_stack.py assert on local/ instead:
                         data files whose correctness is otherwise invisible until a sign-in fails.
```

## Known gaps

Honest about what this does not do yet.

- **Only one stack.** No compute, no database, no frontend hosting, no DNS/certificate,
  no CI/CD wiring — none of it is decided yet, let alone built. `network` exists because a
  VPC is the one piece almost any AWS deployment needs first, not because the rest is out
  of scope.
- **The local runtime is local only.** `local/` runs the stack on a developer's machine.
  There is no AWS-deployed equivalent: no Keycloak stack, no container registry, no
  compute to run these images, and no secret management for a deployed environment. The
  local compose file is not a template for any of them, and nothing in it encodes a
  decision about the deployed shape.
- **No CI.** Nothing runs `cdktn synth`, `pytest`, `ruff`, or `mypy` automatically yet —
  including the `local/` tests added alongside the local runtime.
- **The state bucket doesn't exist.** `state-bucket-name` in `cdktf.json` is a placeholder;
  `cdktn deploy` will fail until a real, versioned bucket exists and the value is filled in.
- **One environment.** Nothing in the code assumes a single environment; only `cdktf.json`
  does. Adding a second means a second context file or a second directory of stacks —
  not yet decided which.
