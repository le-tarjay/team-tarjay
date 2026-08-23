"""Construct-level synth test for NetworkVpc -- the pattern every future
construct with real branching logic or a security-relevant invariant should
follow: synth a real stack and assert on the resulting JSON, rather than
only on Python-side return values.

Ported from the reference CDK Terrain (TypeScript) project's
constructs/network-vpc.test.ts, with one deliberate adaptation: the
TypeScript version uses `Testing.synthScope(fn)`, passing a plain callback.
`IScopeCallback` is a TypeScript call-signature interface (`(scope) => void`),
and jsii cannot marshal a Python callable across that boundary -- passing one
raises `JSIIError: Cannot pass function as argument here`, and wrapping it in
a `__call__`-implementing class fails the same way from the JavaScript side
("fn is not a function"). Build a real `TerraformStack` and call
`CdktnTesting.synth(stack)` instead; every construct test in this project should
follow this shape, not `synth_scope`.
"""

import json
from typing import cast

from cdktn import TerraformStack
from cdktn import Testing as CdktnTesting

from infra_constructs.network_vpc import NetworkVpc, NetworkVpcConfig


def _synth_vpc(availability_zone_count: int, global_tags: dict[str, str] | None = None) -> str:
    app = CdktnTesting.app()
    stack = TerraformStack(app, "test")
    NetworkVpc(
        stack,
        "vpc",
        NetworkVpcConfig(
            name="test",
            cidr_block="10.0.0.0/22",
            availability_zone_count=availability_zone_count,
            global_tags=global_tags or {},
        ),
    )
    return cast(str, CdktnTesting.synth(stack))


def test_rejects_fewer_than_two_availability_zones() -> None:
    try:
        _synth_vpc(availability_zone_count=1)
    except Exception as error:  # noqa: BLE001 -- asserting on the message, not the type
        assert "at least 2" in str(error)
    else:
        raise AssertionError("expected NetworkVpc to reject availability_zone_count < 2")


def test_creates_one_public_subnet_per_availability_zone() -> None:
    synthesized = json.loads(_synth_vpc(availability_zone_count=3, global_tags={"project": "team-tarjay"}))
    subnets = synthesized.get("resource", {}).get("aws_subnet", {})

    assert len(subnets) == 3
    for subnet in subnets.values():
        assert subnet["map_public_ip_on_launch"] is True
