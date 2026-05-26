# AgentVeil for Paperclip

AgentVeil for Paperclip exposes optional advisory reputation and delegation signals inside Paperclip workflows.

Paperclip manages agent work. The external AgentVeil MCP proxy handles runtime control for MCP-routed tool calls.

This plugin is the Paperclip-side advisory companion. It does not replace Paperclip governance, and it is not the AgentVeil MCP proxy.

The current plugin exposes reputation and delegation signals that Paperclip workflows can use as advisory inputs.

## What this plugin does today

The current release exposes advisory AgentVeil signals. These signals can inform Paperclip workflows, but they do not enforce runtime controls by themselves.

| Tool | Purpose |
| --- | --- |
| `avp_check_reputation` | Check advisory reputation signals before delegation. |
| `avp_should_delegate` | Return an advisory delegation recommendation with reasoning. |
| `avp_log_interaction` | Record an interaction signal to AgentVeil after task completion. |
| `avp_evaluate_team` | Evaluate team-level trust posture across a group of agents. |
| `avp_heartbeat_report` | Report heartbeat and status signals during heartbeat cycles. |

## Why it matters

Agent teams need more than execution logs. Before a workflow delegates work, the system should be able to ask:

- Is this agent known?
- Is there a useful reputation signal?
- Does the delegation recommendation clear the configured threshold?
- What interaction signal should be recorded afterward?

This plugin contributes advisory reputation and delegation signals for those questions. Runtime control for MCP-routed tool calls lives in the external AgentVeil MCP proxy, documented separately in the AgentVeil SDK.

## Install

```bash
paperclipai plugin install paperclip-plugin-avp
```

## Configuration

Configure the plugin in the Paperclip dashboard after installation.

| Setting | Default | Description |
| --- | --- | --- |
| AVP API URL | `https://agentveil.dev` | AgentVeil API endpoint. |
| Agent Name | `paperclip_agent` | Local identity label for AVP requests. |
| Min Delegation Score | `0.5` | Minimum score used for advisory delegation recommendations. |

## Basic flow

1. A coordinating agent calls `avp_should_delegate` before assigning work.
2. AgentVeil checks the target agent's advisory reputation signal and delegation threshold.
3. After the task, agents call `avp_log_interaction` to record an interaction signal.
4. Heartbeat summaries use recent interactions to surface trust changes and delegation risk.

## What this plugin is not

This plugin is not a replacement for Paperclip governance, approvals, budgets, logs, or rollback.

It is not the AgentVeil MCP proxy and does not enforce runtime controls inside Paperclip.

Installing this plugin only adds advisory reputation and delegation tools. It does not change Paperclip's execution path.

Reputation signals should be treated as decision inputs, not absolute guarantees. Production deployments should choose thresholds and delegation policies based on their own risk model.

## Runtime MCP proxy integration

This plugin exposes advisory AgentVeil signals inside Paperclip workflows. Runtime control is handled by the external AgentVeil MCP proxy, not by this plugin.

For the runtime MCP proxy integration with Paperclip-managed Claude and Codex agents, see the AgentVeil SDK Paperclip integration guide:

- [AgentVeil SDK Paperclip integration guide](https://github.com/agentveil-protocol/agentveil-sdk/blob/main/docs/PAPERCLIP_INTEGRATION.md)

The linked AgentVeil SDK guide also documents read-only local helper commands for this proxy path: `agentveil paperclip doctor` checks local readiness, and `agentveil paperclip init --dry-run` previews setup steps without writing Paperclip, Claude, or Codex configuration.

## Related projects

- [AgentVeil SDK](https://github.com/agentveil-protocol/agentveil-sdk) - Python SDK for AgentVeil integrations.
- [Lurkr](https://github.com/agentveil-protocol/lurkr) - local-only pre-deploy scanner for risky AI-agent capability surfaces.
- [AgentVeil Protocol](https://agentveil.dev) - external runtime-control infrastructure for autonomous agents.

## License

MIT
