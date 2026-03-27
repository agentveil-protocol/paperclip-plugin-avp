import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { TOOL_NAMES, JOB_KEYS } from "./constants.js";

interface AvpConfig {
  avpBaseUrl: string;
  avpAgentName: string;
  minDelegationScore: number;
}

async function avpFetch(
  ctx: any,
  config: AvpConfig,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<any> {
  const url = `${config.avpBaseUrl}${path}`;
  const init: any = {
    method: options?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
  };
  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }
  const resp = await ctx.http.fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AVP API ${init.method} ${path} returned ${resp.status}: ${text}`);
  }
  return resp.json();
}

function encodeDid(did: string): string {
  return encodeURIComponent(did);
}

const plugin = definePlugin({
  async setup(ctx) {
    const getConfig = async (): Promise<AvpConfig> => {
      const raw = await ctx.config.get();
      return {
        avpBaseUrl: (raw.avpBaseUrl as string) ?? "https://agentveil.dev",
        avpAgentName: (raw.avpAgentName as string) ?? "paperclip_agent",
        minDelegationScore: (raw.minDelegationScore as number) ?? 0.5,
      };
    };

    // ---- Tool: Check Reputation ----
    ctx.tools.register(
      TOOL_NAMES.checkReputation,
      {
        displayName: "AVP Check Reputation",
        description: "Check an agent's trust score on Agent Veil Protocol.",
        parametersSchema: {
          type: "object",
          properties: {
            did: { type: "string", description: "Agent DID (did:key:z6Mk...)" },
          },
          required: ["did"],
        },
      },
      async (params, runCtx) => {
        const { did } = params as { did: string };
        const config = await getConfig();

        try {
          const rep = await avpFetch(ctx, config, `/v1/reputation/${encodeDid(did)}`);
          return {
            content: `Reputation for ${did}: score=${rep.score}, confidence=${rep.confidence}, ${rep.interpretation}`,
            data: {
              did,
              score: rep.score ?? 0.0,
              confidence: rep.confidence ?? 0.0,
              interpretation: rep.interpretation ?? "unknown",
              total_attestations: rep.total_attestations ?? 0,
            },
          };
        } catch (err) {
          return { error: `Failed to check reputation: ${err}` };
        }
      }
    );

    // ---- Tool: Should Delegate ----
    ctx.tools.register(
      TOOL_NAMES.shouldDelegate,
      {
        displayName: "AVP Should Delegate",
        description: "Decide whether to delegate to an agent based on AVP reputation.",
        parametersSchema: {
          type: "object",
          properties: {
            did: { type: "string" },
            min_score: { type: "number" },
          },
          required: ["did"],
        },
      },
      async (params, runCtx) => {
        const { did, min_score } = params as { did: string; min_score?: number };
        const config = await getConfig();
        const threshold = min_score ?? config.minDelegationScore;

        try {
          const rep = await avpFetch(ctx, config, `/v1/reputation/${encodeDid(did)}`);
          const score = rep.score ?? 0.0;
          const confidence = rep.confidence ?? 0.0;
          const scorePassed = score >= threshold;
          const confidencePassed = confidence > 0.1;
          const shouldDelegate = scorePassed && confidencePassed;

          let reason: string;
          if (shouldDelegate) {
            reason = `Score ${score.toFixed(2)} >= ${threshold.toFixed(2)} threshold, confidence ${confidence.toFixed(2)}`;
          } else if (!scorePassed) {
            reason = `Score ${score.toFixed(2)} < ${threshold.toFixed(2)} threshold`;
          } else {
            reason = `Low confidence (${confidence.toFixed(2)}) despite score ${score.toFixed(2)} >= ${threshold.toFixed(2)}`;
          }

          return {
            content: shouldDelegate
              ? `DELEGATE: ${reason}`
              : `DO NOT DELEGATE: ${reason}`,
            data: {
              delegate: shouldDelegate,
              did,
              score,
              confidence,
              min_score: threshold,
              reason,
            },
          };
        } catch (err) {
          return { error: `Failed to evaluate agent: ${err}` };
        }
      }
    );

    // ---- Tool: Log Interaction ----
    ctx.tools.register(
      TOOL_NAMES.logInteraction,
      {
        displayName: "AVP Log Interaction",
        description: "Log a signed attestation after interacting with another agent.",
        parametersSchema: {
          type: "object",
          properties: {
            did: { type: "string" },
            outcome: { type: "string", enum: ["positive", "negative", "neutral"] },
            context: { type: "string" },
          },
          required: ["did"],
        },
      },
      async (params, runCtx) => {
        const { did, outcome, context } = params as {
          did: string;
          outcome?: string;
          context?: string;
        };
        const config = await getConfig();
        const attestOutcome = outcome ?? "positive";
        const attestContext = context ?? "paperclip_task";

        try {
          const result = await avpFetch(ctx, config, "/v1/attestations", {
            method: "POST",
            body: {
              to_agent_did: did,
              outcome: attestOutcome,
              weight: 0.8,
              context: attestContext,
            },
          });

          return {
            content: `Attestation recorded: ${attestOutcome} for ${did}`,
            data: {
              status: "recorded",
              to_did: did,
              outcome: attestOutcome,
              weight: 0.8,
              context: attestContext,
            },
          };
        } catch (err) {
          return { error: `Failed to log interaction: ${err}` };
        }
      }
    );

    // ---- Tool: Evaluate Team ----
    ctx.tools.register(
      TOOL_NAMES.evaluateTeam,
      {
        displayName: "AVP Evaluate Team",
        description: "Batch-check trust scores for all agents in a company.",
        parametersSchema: {
          type: "object",
          properties: {
            dids: { type: "array", items: { type: "string" } },
          },
          required: ["dids"],
        },
      },
      async (params, runCtx) => {
        const { dids } = params as { dids: string[] };
        const config = await getConfig();

        if (dids.length === 0) {
          return {
            content: "No agents to evaluate — empty DID list",
            data: { team_size: 0, average_score: 0, lowest_score: 0, lowest_agent: "", agents: [] },
          };
        }

        const results: any[] = [];
        let successCount = 0;
        let totalScore = 0;
        let lowestScore = Infinity;
        let lowestAgent = "";

        for (const did of dids) {
          try {
            const rep = await avpFetch(ctx, config, `/v1/reputation/${encodeDid(did)}`);
            const score = rep.score ?? 0.0;
            results.push({
              did,
              score,
              confidence: rep.confidence ?? 0.0,
              interpretation: rep.interpretation ?? "unknown",
            });
            successCount++;
            totalScore += score;
            if (score < lowestScore) {
              lowestScore = score;
              lowestAgent = did;
            }
          } catch (err) {
            results.push({ did, score: null, confidence: null, error: String(err) });
          }
        }

        const avg = successCount > 0 ? totalScore / successCount : 0;
        if (lowestScore === Infinity) {
          lowestScore = 0;
        }

        return {
          content: `Team of ${dids.length} agents (${successCount} resolved): avg score ${avg.toFixed(3)}, weakest: ${lowestAgent || "n/a"}`,
          data: {
            team_size: dids.length,
            resolved: successCount,
            failed: dids.length - successCount,
            average_score: Number(avg.toFixed(3)),
            lowest_score: Number(lowestScore.toFixed(3)),
            lowest_agent: lowestAgent,
            agents: results,
          },
        };
      }
    );

    // ---- Tool: Heartbeat Report ----
    ctx.tools.register(
      TOOL_NAMES.heartbeatReport,
      {
        displayName: "AVP Heartbeat Report",
        description: "Generate a trust report at the end of a heartbeat cycle.",
        parametersSchema: {
          type: "object",
          properties: {
            agent_did: { type: "string" },
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
            },
          },
          required: ["agent_did"],
        },
      },
      async (params, runCtx) => {
        const { agent_did, peers_evaluated } = params as {
          agent_did: string;
          peers_evaluated?: Array<{ did: string; outcome?: string; context?: string }>;
        };
        const config = await getConfig();

        try {
          const ownRep = await avpFetch(ctx, config, `/v1/reputation/${encodeDid(agent_did)}`);

          let velocity: any = {};
          try {
            velocity = await avpFetch(ctx, config, `/v1/reputation/${encodeDid(agent_did)}/velocity`);
          } catch {
            // velocity endpoint may not be available
          }

          const peerResults: any[] = [];
          if (peers_evaluated) {
            for (const peer of peers_evaluated) {
              try {
                await avpFetch(ctx, config, "/v1/attestations", {
                  method: "POST",
                  body: {
                    to_agent_did: peer.did,
                    outcome: peer.outcome ?? "positive",
                    weight: 0.8,
                    context: peer.context ?? "paperclip_heartbeat",
                  },
                });
                peerResults.push({ did: peer.did, outcome: peer.outcome ?? "positive", status: "recorded" });
              } catch (err) {
                peerResults.push({ did: peer.did, outcome: peer.outcome ?? "positive", status: `error: ${err}` });
              }
            }
          }

          const report = {
            agent_did,
            own_reputation: {
              score: ownRep.score ?? 0.0,
              confidence: ownRep.confidence ?? 0.0,
              interpretation: ownRep.interpretation ?? "unknown",
            },
            velocity: {
              trend: velocity.trend ?? "unknown",
              alert: velocity.alert ?? false,
              alert_reason: velocity.alert_reason ?? "",
            },
            peer_attestations: peerResults,
          };

          return {
            content: `Heartbeat report: score=${report.own_reputation.score}, trend=${report.velocity.trend}, ${peerResults.length} peer attestations`,
            data: report,
          };
        } catch (err) {
          return { error: `Failed to generate heartbeat report: ${err}` };
        }
      }
    );

    // ---- Job: Health Check ----
    ctx.jobs.register(JOB_KEYS.healthCheck, async (job) => {
      const config = await getConfig();
      try {
        await avpFetch(ctx, config, "/v1/health");
        ctx.logger.info("AVP health check passed");
      } catch (err) {
        ctx.logger.error("AVP health check failed", { error: String(err) });
      }
    });

    ctx.logger.info("paperclip-plugin-avp initialized with 5 trust tools");
  },

  async onHealth() {
    return { status: "ok", message: "AVP plugin running" };
  },

  async onValidateConfig(config) {
    const errors: string[] = [];
    if (!config.avpBaseUrl) errors.push("AVP API URL is required");
    return { ok: errors.length === 0, errors };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
