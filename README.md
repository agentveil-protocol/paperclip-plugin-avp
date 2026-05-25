# AgentVeil for Paperclip

AgentVeil for Paperclip adds advisory action-control signals to Paperclip agent workflows.

Paperclip manages agent work. AgentVeil helps control and prove risky actions.

Paperclip manages agent work: companies, tasks, approvals, budgets, and operational flow. AgentVeil focuses on the execution boundary: helping decide which risky agent actions should run, which should require approval, and what proof should exist afterward.

The current plugin exposes reputation and delegation signals that Paperclip workflows can use as advisory inputs. It does not embed the full AgentVeil runtime gate.

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

Agent teams need more than execution logs. Before a workflow delegates or runs risky work, the system should be able to ask:

- Is this agent known?
- Is this action within the expected risk boundary?
- Should this action remain automatic or require approval?
- What proof reference should exist afterward?

This plugin currently contributes advisory reputation and delegation signals for those questions. Future releases may connect Paperclip workflows to external AgentVeil gate decisions and proof references. The current plugin does not embed the AgentVeil runtime gate.

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

It is not the full AgentVeil runtime gate embedded inside Paperclip.

Installing this plugin does not automatically gate every agent action or generate proof packets for every workflow. The current release exposes advisory reputation and delegation signals.

Reputation signals should be treated as decision inputs, not absolute guarantees. Production deployments should choose thresholds and delegation policies based on their own risk model.

## Related projects

- [AgentVeil SDK](https://github.com/agentveil-protocol/agentveil-sdk) - Python SDK for AgentVeil integrations.
- [Lurkr](https://github.com/agentveil-protocol/lurkr) - local-only pre-deploy scanner for risky AI-agent capability surfaces.
- [AgentVeil Protocol](https://agentveil.dev) - action-control infrastructure for autonomous agents.

## License

MIT
