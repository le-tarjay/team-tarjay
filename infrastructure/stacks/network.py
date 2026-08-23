"""The slow-moving half of any future deployment: the VPC and its public
subnets, which should change essentially never once real workloads depend
on it. Kept as its own stack -- separate state, separate blast radius --
so that whatever gets built on top of it never has to plan against the
network by accident.

Ported from the reference CDK Terrain (TypeScript) project's stacks/network.ts.
"""

from constructs import Construct

from common import TF_STATE_KEYS
from infra_constructs.network_vpc import NetworkVpc, NetworkVpcConfig
from models.network_stack_output import NetworkStackOutput
from stacks.tarjay_stack import TarjayStack


class NetworkStack(TarjayStack):
    def __init__(self, scope: Construct) -> None:
        super().__init__(scope, TF_STATE_KEYS["network"], "network")

        tags = {**self.global_tags, "stack": "network"}

        network = NetworkVpc(
            self,
            "vpc",
            NetworkVpcConfig(
                name="team-tarjay",
                cidr_block=self.vpc_cidr_block,
                availability_zone_count=2,
                global_tags=tags,
            ),
        )

        outputs = NetworkStackOutput(
            vpc_id=network.vpc.id,
            public_subnet_ids=network.public_subnet_ids,
        )

        self.render_outputs(outputs.as_dict())
