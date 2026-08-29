---
name: Cdkterrain
description: Use when defining infrastructure as code in TypeScript, Python, Java, C#, or Go instead of HCL, creating reusable constructs, managing multiple environments with stacks, or converting existing Terraform projects to a programmatic approach.
metadata:
    mintlify-proj: cdkterrain
    version: "1.0"
---

# CDK Terrain (CDKTN) Skill

## Product Summary

CDK Terrain (CDKTN) is an infrastructure-as-code framework that lets you define and provision infrastructure using familiar programming languages (TypeScript, Python, Java, C#, Go) instead of HashiCorp Configuration Language (HCL). CDKTN translates your code into Terraform-compatible JSON configuration files, giving you access to the entire Terraform ecosystem while leveraging your existing language toolchain for testing, dependency management, and version control.

**Key files and commands:**
- `cdktf.json` — project configuration file defining providers, modules, language, and output directory
- `cdktn init` — initialize a new project from a template
- `cdktn synth` — synthesize code to JSON Terraform configuration
- `cdktn deploy` — deploy infrastructure (runs synth + terraform apply)
- `cdktn destroy` — tear down infrastructure
- `cdktn get` — generate code bindings for providers and modules
- `.gen/` directory — generated provider and module bindings (default location)

**Primary docs:** https://cdktn.io/docs

## When to Use

Reach for CDKTN when:

- **Language preference**: Your team prefers or requires a procedural language over HCL for infrastructure definition
- **Code reuse**: You need to create abstractions (constructs) to manage complexity and enforce best practices across multiple infrastructure patterns
- **Testing**: You want to unit test infrastructure code using your language's testing framework before synthesis
- **Existing codebase**: You have a Terraform HCL project you want to migrate to a programmatic approach
- **Type safety**: You need strict type checking and parameter validation for resources
- **Multiple environments**: You're managing separate stacks for dev/staging/production with shared logic
- **Custom logic**: Your infrastructure definition requires conditional logic, loops, or dynamic computation

Do not use CDKTN if your team is deeply invested in HCL, prefers declarative configuration, or needs to avoid the pre-1.0 stability risk.

## Quick Reference

### Project Initialization

| Task | Command |
|------|---------|
| Create new TypeScript project (local state) | `cdktn init --template=typescript --local` |
| Create new Python project (HCP Terraform backend) | `cdktn init --template=python` |
| Create from existing HCL project | `cdktn init --template=typescript --from-terraform-project /path/to/hcl` |
| Add providers during init | `cdktn init --template=typescript --providers=aws,kubernetes` |

### Core CLI Commands

| Command | Purpose |
|---------|---------|
| `cdktn get` | Download providers/modules and generate code bindings |
| `cdktn synth` | Synthesize code to JSON (stored in `cdktf.out/` by default) |
| `cdktn diff [stack]` | Preview changes (terraform plan) |
| `cdktn deploy [stacks...]` | Synthesize and apply infrastructure |
| `cdktn destroy [stacks...]` | Tear down infrastructure |
| `cdktn list` | Show all stacks in the application |
| `cdktn output [stacks...]` | Display stack outputs |
| `cdktn provider add aws@~>4.0` | Add a provider to the project |
| `cdktn convert` | Convert HCL files to CDKTN code (stdin/stdout) |
| `cdktn watch [stacks...]` | Watch files and auto-deploy on changes (dev only) |

### cdktf.json Configuration

```json
{
  "language": "typescript",
  "app": "npm run --silent compile && node main.js",
  "output": "cdktf.out",
  "codeMakerOutput": ".gen",
  "terraformProviders": ["aws@~>4.0", "kubernetes"],
  "terraformModules": ["terraform-aws-modules/vpc/aws"],
  "targetVersions": {
    "terraform": ">=1.5.7",
    "opentofu": ">=1.6.0"
  },
  "validateInstalledBinary": false,
  "sendCrashReports": false
}
```

### Construct Hierarchy

```
App (root)
├── TerraformStack (manages state separately)
│   ├── TerraformProvider (e.g., AwsProvider)
│   ├── TerraformResource (e.g., S3Bucket)
│   ├── TerraformModule (reusable HCL modules)
│   ├── TerraformVariable (input variables)
│   ├── TerraformOutput (outputs)
│   └── Custom Constructs (your abstractions)
```

### Common Code Patterns

**Define a stack with a provider and resource:**
```typescript
class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);
    new AwsProvider(this, "aws", { region: "us-east-1" });
    new S3Bucket(this, "bucket", { bucket: "my-bucket" });
  }
}
```

**Use a Terraform variable for secrets:**
```typescript
const password = new TerraformVariable(this, "dbPassword", {
  type: "string",
  sensitive: true,
  description: "Database password"
});
// Pass via TF_VAR_dbPassword environment variable
```

**Create a custom construct:**
```typescript
class TaggedS3Bucket extends S3Bucket {
  constructor(scope: Construct, name: string, config: S3BucketConfig) {
    super(scope, name, config);
    this.tagsInput = { ...this.tagsInput, owner: "team", env: "prod" };
  }
}
```

**Reference remote state:**
```typescript
const remoteState = new DataTerraformRemoteState(this, "vpc", {
  organization: "my-org",
  workspaces: new NamedRemoteWorkspace("vpc-prod")
});
const subnetId = remoteState.getString("subnet_id");
```

## Decision Guidance

### When to Use Local vs. Remote Backend

| Scenario | Local Backend | Remote Backend (HCP Terraform) |
|----------|---------------|--------------------------------|
| Solo development | ✓ | ✗ |
| Team collaboration | ✗ | ✓ |
| CI/CD pipeline | ✗ | ✓ |
| State locking needed | ✗ | ✓ |
| Sensitive data storage | ✗ | ✓ |
| Quick prototyping | ✓ | ✗ |

### When to Use Stacks vs. Constructs

| Use Case | Stacks | Constructs |
|----------|--------|-----------|
| Separate state management | ✓ | ✗ |
| Different environments (dev/prod) | ✓ | ✗ |
| Reusable infrastructure patterns | ✗ | ✓ |
| Enforce best practices | ✗ | ✓ |
| Logical grouping within same state | ✗ | ✓ |
| Cross-stack references | ✓ | ✗ |

### When to Use Pre-built vs. Local Providers

| Consideration | Pre-built | Local Generation |
|---------------|-----------|------------------|
| Performance (faster synth) | ✓ | ✗ |
| Custom version needed | ✗ | ✓ |
| Large provider schema | ✓ | ✗ |
| Bleeding-edge version | ✗ | ✓ |
| Available for your language | ✓ | ✓ |

## Workflow

### 1. Initialize a Project
```bash
cdktn init --template=typescript --local
cd my-project
npm install
```

### 2. Add Providers and Modules
Edit `cdktf.json` to declare providers/modules, then:
```bash
cdktn get
```
This generates code bindings in `.gen/` directory.

### 3. Define Infrastructure
Write your stack and constructs in your language. Example:
```typescript
// main.ts
import { App, TerraformStack } from "cdktn";
import { AwsProvider } from "./.gen/providers/aws/provider";
import { S3Bucket } from "./.gen/providers/aws/s3-bucket";

class MyStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);
    new AwsProvider(this, "aws", { region: "us-east-1" });
    new S3Bucket(this, "bucket", { bucket: "my-unique-bucket" });
  }
}

const app = new App();
new MyStack(app, "my-stack");
app.synth();
```

### 4. Synthesize and Preview
```bash
cdktn synth              # Generate JSON in cdktf.out/
cdktn diff my-stack      # Preview changes
```

### 5. Deploy
```bash
cdktn deploy my-stack                    # Interactive approval
cdktn deploy my-stack --auto-approve     # Skip approval (CI/CD)
```

### 6. Verify and Destroy
```bash
cdktn output my-stack                    # View outputs
cdktn destroy my-stack --auto-approve    # Tear down
```

## Common Gotchas

- **Secrets in synthesized output**: Never read secrets directly from environment variables in your code. Use `TerraformVariable` with `sensitive: true` instead. Secrets read directly will appear in `cdktf.out/` JSON files.

- **Construct naming conflicts**: If you instantiate multiple constructs with the same parent scope, each must have a unique `id`. CDKTN uses the id to generate unique Terraform resource names.

- **Provider bindings not generated**: After adding providers to `cdktf.json`, you must run `cdktn get` before you can import them in your code. The `.gen/` directory won't exist until you run this command.

- **State migration issues**: When switching backends (local → HCP Terraform), use `cdktn deploy --migrate-state` to approve the migration. Without this flag, the command will fail.

- **Missing app command in cdktf.json**: The `app` field must be a valid shell command that executes your code. For TypeScript, this is typically `npx ts-node main.ts` or `npm run build && node main.js`. If this command fails, synthesis fails.

- **Circular dependencies**: Constructs cannot reference outputs from stacks that depend on them. Use `addDependency()` to manage stack ordering, not circular references.

- **HCL conversion limitations**: The `cdktn convert` command has known limitations and may not handle all HCL syntax. Always review and test converted code.

- **Pre-built provider version mismatch**: Pre-built providers are tied to specific CDKTN versions. If you need a different provider version, use local generation with `cdktn get` instead.

- **Terraform binary not found**: CDKTN requires Terraform or OpenTofu to be installed and on your PATH. Set `TERRAFORM_BINARY_NAME=tofu` to use OpenTofu instead of Terraform.

- **Forgetting to commit .gen/ directory**: Generated bindings should typically be committed to version control so teammates don't need to run `cdktn get` separately.

## Verification Checklist

Before deploying or submitting work:

- [ ] Run `cdktn synth` and verify no errors in output
- [ ] Check `cdktf.out/` contains valid JSON Terraform configuration
- [ ] Run `cdktn diff [stack]` and review planned changes
- [ ] Verify all secrets use `TerraformVariable` with `sensitive: true`, not environment variables
- [ ] Confirm providers and modules are declared in `cdktf.json`
- [ ] Test constructs with unit tests if they contain logic
- [ ] Verify stack dependencies are correct (use `cdktn list` to check)
- [ ] Check that all required environment variables (e.g., `TF_VAR_*`) are set
- [ ] Validate `cdktf.json` syntax (no trailing commas, valid JSON)
- [ ] Ensure `.gen/` directory is in `.gitignore` if using local generation, or committed if using pre-built providers
- [ ] Run `cdktn debug` to verify environment (Terraform version, providers installed, etc.)
- [ ] Test destroy and re-deploy to ensure idempotency

## Resources

**Comprehensive navigation:** https://cdktn.io/docs/llms.txt

**Critical documentation pages:**
- [Project Setup](https://cdktn.io/docs/create-and-deploy/project-setup) — Initialize projects, configure backends, convert HCL
- [CLI Commands Reference](https://cdktn.io/docs/cli-reference/commands) — Full command documentation with examples
- [Constructs](https://cdktn.io/docs/concepts/constructs) — Build reusable infrastructure abstractions
- [Best Practices](https://cdktn.io/docs/create-and-deploy/best-practices) — Production-ready patterns for stacks, constructs, secrets
- [Configuration File](https://cdktn.io/docs/create-and-deploy/configuration-file) — cdktf.json specification and examples

---

> For additional documentation and navigation, see: https://cdktn.io/docs/llms.txt