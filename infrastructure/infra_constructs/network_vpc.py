"""A public-subnet-only VPC: internet gateway, one subnet per availability
zone, and a single shared route table with a default route out through the
gateway.

There is deliberately no NAT gateway and no private tier here yet -- that is
a decision for whichever stack first needs one, not one to make speculatively
in the base network. A `/22` in yields `/24` subnets out, with room for a
private tier later if this ever grows one.

Ported from the reference CDK Terrain (TypeScript) project's
constructs/network-vpc.ts.
"""

from dataclasses import dataclass

from cdktn import Fn, Token
from cdktn_provider_aws.data_aws_availability_zones import DataAwsAvailabilityZones
from cdktn_provider_aws.internet_gateway import InternetGateway
from cdktn_provider_aws.route import Route
from cdktn_provider_aws.route_table import RouteTable
from cdktn_provider_aws.route_table_association import RouteTableAssociation
from cdktn_provider_aws.subnet import Subnet
from cdktn_provider_aws.vpc import Vpc
from constructs import Construct

from common import format_name


@dataclass(frozen=True)
class NetworkVpcConfig:
    name: str
    cidr_block: str

    # An application load balancer requires subnets in at least two
    # availability zones, so two is the floor rather than a preference.
    availability_zone_count: int
    global_tags: dict[str, str]


class NetworkVpc(Construct):
    def __init__(self, scope: Construct, construct_id: str, config: NetworkVpcConfig) -> None:
        super().__init__(scope, construct_id)

        if config.availability_zone_count < 2:
            raise ValueError(
                "availability_zone_count must be at least 2 -- an application load balancer requires two subnets"
            )

        availability_zones = DataAwsAvailabilityZones(self, "azs", state="available")

        self.vpc = Vpc(
            self,
            "vpc",
            cidr_block=config.cidr_block,
            # Both are required for the ECR hostnames to resolve from a task
            # and for a load balancer's own DNS name to work inside the VPC.
            enable_dns_support=True,
            enable_dns_hostnames=True,
            tags={**config.global_tags, "Name": format_name(f"{config.name}-vpc")},
        )

        internet_gateway = InternetGateway(
            self,
            "igw",
            vpc_id=self.vpc.id,
            tags={**config.global_tags, "Name": format_name(f"{config.name}-igw")},
        )

        route_table = RouteTable(
            self,
            "public-route-table",
            vpc_id=self.vpc.id,
            tags={**config.global_tags, "Name": format_name(f"{config.name}-public-rt")},
        )

        Route(
            self,
            "public-default-route",
            route_table_id=route_table.id,
            destination_cidr_block="0.0.0.0/0",
            gateway_id=internet_gateway.id,
        )

        subnet_ids: list[str] = []

        for index in range(config.availability_zone_count):
            # /22 in, /24 subnets out -- two spare blocks left over for a
            # private tier if this ever grows one.
            subnet = Subnet(
                self,
                f"public-subnet-{index}",
                vpc_id=self.vpc.id,
                cidr_block=Fn.cidrsubnet(config.cidr_block, 2, index),
                availability_zone=Token.as_string(Fn.element(availability_zones.names, index)),
                # The task runs here with a public IP instead of behind a
                # NAT gateway.
                map_public_ip_on_launch=True,
                tags={**config.global_tags, "Name": format_name(f"{config.name}-public-{index}")},
            )

            RouteTableAssociation(
                self,
                f"public-route-table-association-{index}",
                subnet_id=subnet.id,
                route_table_id=route_table.id,
            )

            subnet_ids.append(subnet.id)

        self.public_subnet_ids = subnet_ids
