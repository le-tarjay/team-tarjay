#!/usr/bin/env python
from cdktn import App

from stacks.network import NetworkStack

app = App()

# STACKS
network_stack = NetworkStack(app)

# DEPENDENCIES
# None yet -- network is the only stack. When a second stack reads the
# network's outputs through remote state, declare the ordering explicitly
# here with `.add_dependency(...)`, the same way the reference TypeScript
# project wires listener -> temporal-workers -> specialist-sandbox ->
# network in its own main.ts. Terraform cannot infer that ordering on its
# own from a remote-state data source.

app.synth()
