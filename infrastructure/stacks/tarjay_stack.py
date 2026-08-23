"""Base class for every stack: reads context, wires the AWS provider, and
points the stack at its own key in the shared S3 state bucket.

Ported from the reference CDK Terrain (TypeScript) project's kisasa-stack.ts.
Unlike that project, this base class declares no per-stack secret handling
yet -- add it here, in one place, the first time a stack needs one, rather
than inventing a pattern per-stack.
"""

from re import compile as re_compile
from typing import Any

from cdktn import DataTerraformRemoteStateS3, S3Backend, TerraformOutput, TerraformStack
from cdktn_provider_aws.provider import AwsProvider
from constructs import Construct

from common import format_terraform_id
from models.aws_configuration import AwsConfiguration, aws_configuration_from_context
from models.context import ContextNode, require_node, require_string, require_string_map

_SENSITIVE_OUTPUT_NAME = re_compile(r"password|secret|token|apikey", flags=0)


class TarjayStack(TerraformStack):
    """Not instantiated directly -- every real stack subclasses this.

    jsii's own metaclass conflicts with `abc.ABC`, so this is enforced by
    convention (and by every subclass adding a resource) rather than by
    `abc.abstractmethod`.
    """

    # Every key this project uses sits at the root of cdktf.json's `context`
    # block. Collected once into a plain dict so the model factories can
    # validate it as data, rather than each field reaching into the
    # construct tree on its own.
    _CONTEXT_KEYS = [
        "aws",
        "global-tags",
        "state-bucket-name",
        "vpc-cidr-block",
    ]

    def __init__(self, scope: Construct, tf_state_key: str, stack_id: str) -> None:
        super().__init__(scope, stack_id)

        context = self._root_context()

        self.aws: AwsConfiguration = aws_configuration_from_context(require_node(context, "aws", "context"))
        self.global_tags: dict[str, str] = require_string_map(context, "global-tags", "context")
        self.vpc_cidr_block: str = require_string(context, "vpc-cidr-block", "context")

        self._state_bucket_name: str = require_string(context, "state-bucket-name", "context")

        AwsProvider(
            self,
            "aws",
            region=self.aws.region,
            profile=self.aws.profile,
            # Refuses to plan against the wrong account if a profile is
            # mis-set -- cheap protection given the account number is
            # already in context.
            allowed_account_ids=[self.aws.account_number],
        )

        S3Backend(
            self,
            bucket=self._state_bucket_name,
            key=tf_state_key,
            region=self.aws.region,
            profile=self.aws.profile,
            encrypt=True,
            # S3-native state locking, which is why there is no DynamoDB
            # lock table anywhere in this project. Requires Terraform or
            # OpenTofu >= 1.10 -- declared as `targetVersions` in
            # cdktf.json, which synth validates against.
            use_lockfile=True,
        )

    def _root_context(self) -> ContextNode:
        context: ContextNode = {}
        for key in self._CONTEXT_KEYS:
            value = self.node.try_get_context(key)
            if value is not None:
                context[key] = value
        return context

    def render_outputs(self, outputs: dict[str, Any]) -> None:
        """Publishes one Terraform output per key of `outputs`."""
        for name, value in outputs.items():
            TerraformOutput(
                self,
                name,
                value=value,
                # No output in this project is currently a secret. The
                # check is here so that adding one later fails safe rather
                # than printing it to a console.
                sensitive=bool(_SENSITIVE_OUTPUT_NAME.search(name)),
            )

    def remote_state(self, tf_state_key: str) -> DataTerraformRemoteStateS3:
        return DataTerraformRemoteStateS3(
            self,
            format_terraform_id(f"remote_state_{tf_state_key}"),
            bucket=self._state_bucket_name,
            key=tf_state_key,
            region=self.aws.region,
            profile=self.aws.profile,
        )

