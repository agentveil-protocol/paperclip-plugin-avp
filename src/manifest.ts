import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES, JOB_KEYS } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "AVP Trust & Reputation",
  description:
    "Adds trust verification, reputation scoring, and signed attestations " +
    "between agents via Agent Veil Protocol. DID identity, EigenTrust reputation, " +
    "peer-to-peer attestations.",
  author: "AgentVeil Protocol",
  categories: ["connector"],

  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "agents.read",
    "companies.read",
    "jobs.schedule",
  ],

  entrypoints: {
    worker: "./dist/worker.js",
  },

  instanceConfigSchema: {
    type: "object",
    properties: {
      avpBaseUrl: {
        type: "string",
        title: "AVP API URL",
        default: "https://agentveil.dev",
      },
      avpAgentName: {
        type: "string",
        title: "Agent Name",
        description: "Name used for AVP agent identity (keys stored at ~/.avp/agents/{name}.json)",
        default: "paperclip_agent",
      },
      minDelegationScore: {
        type: "number",
        title: "Minimum Delegation Score",
        description: "Default minimum reputation score (0.0-1.0) for delegation approval",
        default: 0.5,
      },
    },
    required: ["avpBaseUrl"],
  },

  tools: [
    {
      name: TOOL_NAMES.checkReputation,
      displayName: "AVP Check Reputation",
      description:
        "Check an agent's trust score on Agent Veil Protocol. " +
        "Returns score (0-1), confidence, and interpretation. " +
        "Use before delegating tasks to verify agent reliability.",
      parametersSchema: {
        type: "object",
        properties: {
          did: {
            type: "string",
            description: "The DID (did:key:z6Mk...) of the agent to check",
          },
        },
        required: ["did"],
      },
    },
    {
      name: TOOL_NAMES.shouldDelegate,
      displayName: "AVP Should Delegate",
      description:
        "Decide whether to delegate a task to an agent based on their " +
        "AVP reputation. Returns yes/no decision with reasoning.",
      parametersSchema: {
        type: "object",
        properties: {
          did: {
            type: "string",
            description: "The DID of the agent to evaluate",
          },
          min_score: {
            type: "number",
            description: "Minimum reputation score (0.0-1.0) to approve delegation",
          },
        },
        required: ["did"],
      },
    },
    {
      name: TOOL_NAMES.logInteraction,
      displayName: "AVP Log Interaction",
      description:
        "Log an interaction with another agent as a signed attestation. " +
        "Record positive, negative, or neutral outcomes after task completion.",
      parametersSchema: {
        type: "object",
        properties: {
          did: {
            type: "string",
            description: "The DID of the agent you interacted with",
          },
          outcome: {
            type: "string",
            enum: ["positive", "negative", "neutral"],
            description: "Interaction outcome",
          },
          context: {
            type: "string",
            description: "Context (e.g. 'code_review', 'content_writing')",
          },
        },
        required: ["did"],
      },
    },
    {
      name: TOOL_NAMES.evaluateTeam,
      displayName: "AVP Evaluate Team",
      description:
        "Batch-check trust scores for all agents in a Paperclip company. " +
        "Returns per-agent scores, team average, and weakest link.",
      parametersSchema: {
        type: "object",
        properties: {
          dids: {
            type: "array",
            items: { type: "string" },
            description: "List of agent DIDs to evaluate",
          },
        },
        required: ["dids"],
      },
    },
    {
      name: TOOL_NAMES.heartbeatReport,
      displayName: "AVP Heartbeat Report",
      description:
        "Generate a trust report at the end of a heartbeat cycle. " +
        "Includes own reputation, velocity trend, and optional peer attestations.",
      parametersSchema: {
        type: "object",
        properties: {
          agent_did: {
            type: "string",
            description: "DID of the agent running this heartbeat",
          },
          peers_evaluated: {
            type: "array",
            items: {
              type: "object",
              properties: {
                did: { type: "string" },
                outcome: { type: "string", enum: ["positive", "negative", "neutral"] },
                context: { type: "string" },
              },
              required: ["did"],
            },
            description: "Optional peer evaluations from this heartbeat",
          },
        },
        required: ["agent_did"],
      },
    },
  ],

  jobs: [
    {
      jobKey: JOB_KEYS.healthCheck,
      displayName: "AVP Health Check",
      description: "Pings AVP API to verify connectivity",
      schedule: "*/30 * * * *",
    },
  ],
};

export default manifest;
