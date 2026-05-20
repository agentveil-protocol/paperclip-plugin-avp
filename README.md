# paperclip-plugin-avp

Trust and reputation tools for Paperclip agent teams, powered by [AgentVeil Protocol](https://agentveil.dev).

The plugin adds AgentVeil reputation checks and signed interaction records to Paperclip workflows. It is intended for teams that want delegation decisions to be based on explicit trust signals rather than informal agent names, comments, or logs after the fact.

## What it adds

| Tool | Purpose |
| --- | --- |
| `avp_check_reputation` | Check an agent's current trust signal before delegation. |
| `avp_should_delegate` | Return a yes/no delegation recommendation with reasoning. |
| `avp_log_interaction` | Record a signed attestation after task completion. |
| `avp_evaluate_team` | Check reputation signals across a group of agents. |
| `avp_heartbeat_report` | Produce a trust summary during heartbeat cycles. |

## Why it matters

Agent teams need more than execution logs. Before one agent delegates work to another, the system should be able to ask:

- Is this agent known?
- Is it trusted enough for this task?
- What evidence exists after the interaction?
- Can that evidence be verified outside the current runtime?

AgentVeil provides the control layer behind those questions: reputation signals, delegation gates, signed attestations, and portable evidence formats where useful.

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
| Min Delegation Score | `0.5` | Minimum score required for delegation approval. |

## Basic flow

1. A coordinating agent calls `avp_should_delegate` before assigning work.
2. AgentVeil checks the target agent's reputation signal and delegation threshold.
3. After the task, agents call `avp_log_interaction` to record an attestation.
4. Heartbeat summaries use recent interactions to surface trust changes and delegation risk.

## Security boundaries

- The plugin is a trust and delegation layer, not a sandbox.
- It does not replace model safety controls, runtime isolation, or application-level authorization.
- Reputation signals should be treated as decision inputs, not absolute guarantees.
- Production deployments should choose thresholds and delegation policies based on their own risk model.

## Related projects

- [AgentVeil SDK](https://github.com/agentveil-protocol/agentveil-sdk) - Python SDK for action control, gates, signed receipts, and reputation signals.
- [Lurkr](https://github.com/agentveil-protocol/lurkr) - local-only pre-deploy scanner for risky AI-agent capability surfaces.
- [AgentVeil Protocol](https://agentveil.dev) - action-control infrastructure for autonomous agents.

## License

MIT
