from dataclasses import dataclass


@dataclass(frozen=True)
class NetworkStackOutput:
    vpc_id: str
    public_subnet_ids: list[str]

    def as_dict(self) -> dict[str, object]:
        return {"vpc_id": self.vpc_id, "public_subnet_ids": self.public_subnet_ids}
