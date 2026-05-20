# paperclip-plugin-avp

Trust and reputation layer for Paperclip agents via [Agent Veil Protocol](https://agentveil.dev).

## What it does

Adds 5 trust tools to every agent in your Paperclip company:

| Tool | What it does |
|------|-------------|
| `avp_check_reputation` | Check agent trust score before delegation |
| `avp_should_delegate` | Trust gate — yes/no with reasoning |
| `avp_log_interaction` | Signed attestation after task completion |
| `avp_evaluate_team` | Batch check entire company |
| `avp_heartbeat_report` | Trust summary per heartbeat cycle |

## Install

```bash
paperclipai plugin install paperclip-plugin-avp
```

## Configuration

After installing, configure in your Paperclip dashboard:

| Setting | Default | Description |
|---------|---------|-------------|
| AVP API URL | `https://agentveil.dev` | AVP server endpoint |
| Agent Name | `paperclip_agent` | Name for AVP identity |
| Min Delegation Score | `0.5` | Default threshold for delegation approval |

## How it works

1. CEO agent calls `avp_should_delegate` before assigning tasks
2. After each heartbeat, agents call `avp_log_interaction` to rate peers
3. `avp_heartbeat_report` generates trust summary with velocity alerts
4. Over time, reliable agents build reputation, unreliable ones get flagged

## Links

- AVP Protocol: [agentveil.dev](https://agentveil.dev)
- AgentVeil SDK (Python): `pip install agentveil`
- AVP GitHub: [github.com/agentveil-protocol/agentveil-sdk](https://github.com/agentveil-protocol/agentveil-sdk)

## License

MIT