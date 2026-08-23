"""Naming and state-key helpers shared by every stack.

AWS caps many resource names well below what a descriptive identifier wants
to be -- load balancers and target groups at 32 characters -- and rejects
uppercase, spaces, and leading/trailing hyphens in most of them. Truncating
in one place keeps those limits from being rediscovered one failed apply at
a time.

Ported from the reference CDK Terrain (TypeScript) project's common.ts.
"""

import re

_LEADING_HYPHENS = re.compile(r"^-+")
_TRAILING_HYPHENS = re.compile(r"-+$")

# Security group descriptions accept a narrow ASCII subset -- notably no em
# dash and no apostrophe, both easy to type into a comment-like string. AWS
# rejects a violation at apply time, several minutes in; this turns that into
# a synth-time failure naming the offending text.
#
# Source: the EC2 API's own constraint on the field.
_SECURITY_GROUP_DESCRIPTION_PATTERN = re.compile(r"^[0-9A-Za-z_ .:/()#,@\[\]+=&;{}!$*-]*$")


def format_name(name: str, max_length: int = 100) -> str:
    normalized = name.lower().replace(" ", "-")
    truncated = normalized[:max_length] if len(normalized) > max_length else normalized

    # Truncation can leave a trailing hyphen, which ALB and target-group
    # names reject outright.
    truncated = _LEADING_HYPHENS.sub("", truncated)
    return _TRAILING_HYPHENS.sub("", truncated)


def format_terraform_id(name: str, max_length: int = 32) -> str:
    """For Terraform logical ids and the AWS names with the tightest caps
    (load balancer, target group). The 32-character default is the ALB
    limit, which is why an `environment-name` context value is documented
    as needing to stay short.
    """
    return format_name(name, max_length)


def security_group_description(description: str) -> str:
    if len(description) > 255:
        raise ValueError(f"Security group description exceeds 255 characters: {description}")

    if not _SECURITY_GROUP_DESCRIPTION_PATTERN.match(description):
        offending = [c for c in description if not _SECURITY_GROUP_DESCRIPTION_PATTERN.match(c)]
        raise ValueError(
            f"Security group description contains characters AWS rejects ({' '.join(offending)}): {description}"
        )

    return description


# One state file per stack, keyed inside the shared state bucket. Named
# constants rather than inline strings because a typo here silently points a
# stack at an empty state and plans a full re-create.
TF_STATE_KEYS = {
    "network": "network.tfstate",
}
