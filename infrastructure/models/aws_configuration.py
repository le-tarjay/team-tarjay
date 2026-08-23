from dataclasses import dataclass

from models.context import ContextNode, require_string


@dataclass(frozen=True)
class AwsConfiguration:
    region: str
    account_number: str
    profile: str


def aws_configuration_from_context(node: ContextNode) -> AwsConfiguration:
    return AwsConfiguration(
        region=require_string(node, "region", "aws"),
        account_number=require_string(node, "account-number", "aws"),
        profile=require_string(node, "profile", "aws"),
    )
