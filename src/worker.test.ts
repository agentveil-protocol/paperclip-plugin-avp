import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the SDK before importing worker ----
// We intercept definePlugin to capture the setup function,
// then run setup with a mock ctx to capture all tool handlers.

type ToolHandler = (params: any, runCtx: any) => Promise<any>;
type JobHandler = (job: any) => Promise<void>;

const toolHandlers = new Map<string, ToolHandler>();
const jobHandlers = new Map<string, JobHandler>();
let pluginSetup: ((ctx: any) => Promise<void>) | null = null;
let onHealthFn: (() => Promise<any>) | null = null;
let onValidateConfigFn: ((config: any) => Promise<any>) | null = null;

vi.mock("@paperclipai/plugin-sdk", () => ({
  definePlugin(opts: any) {
    pluginSetup = opts.setup;
    onHealthFn = opts.onHealth ?? null;
    onValidateConfigFn = opts.onValidateConfig ?? null;
    return opts;
  },
  runWorker() {
    // no-op in tests
  },
}));

// ---- Helpers ----

function mockResponse(data: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function createMockCtx(fetchImpl?: (url: string, init: any) => any) {
  return {
    config: {
      get: async () => ({
        avpBaseUrl: "https://test-avp.dev",
        avpAgentName: "test_agent",
        minDelegationScore: 0.5,
      }),
    },
    http: {
      fetch: fetchImpl ?? (async () => mockResponse({})),
    },
    tools: {
      register(name: string, _meta: any, handler: ToolHandler) {
        toolHandlers.set(name, handler);
      },
    },
    jobs: {
      register(key: string, handler: JobHandler) {
        jobHandlers.set(key, handler);
      },
    },
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };
}

// ---- Load worker (triggers definePlugin) ----

beforeEach(async () => {
  toolHandlers.clear();
  jobHandlers.clear();
});

async function setupPlugin(fetchImpl?: (url: string, init: any) => any) {
  // Import triggers definePlugin
  await import("./worker.js");
  const ctx = createMockCtx(fetchImpl);
  await pluginSetup!(ctx);
  return ctx;
}

// =============================================
// Tests
// =============================================

describe("avp_check_reputation", () => {
  it("returns reputation data for a valid DID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.85, confidence: 0.92, interpretation: "trusted", total_attestations: 12 })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_check_reputation")!;
    expect(handler).toBeDefined();

    const result = await handler({ did: "did:key:z6MkTest123" }, {});
    expect(result.data.score).toBe(0.85);
    expect(result.data.confidence).toBe(0.92);
    expect(result.data.interpretation).toBe("trusted");
    expect(result.data.total_attestations).toBe(12);
    expect(result.content).toContain("score=0.85");
  });

  it("URL-encodes the DID in the request path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.5, confidence: 0.5, interpretation: "neutral" })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_check_reputation")!;

    await handler({ did: "did:key:z6Mk/special?chars" }, {});
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent("did:key:z6Mk/special?chars"));
    expect(calledUrl).not.toContain("?chars");
  });

  it("returns error when API fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ error: "not found" }, false, 404)
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_check_reputation")!;

    const result = await handler({ did: "did:key:z6MkBad" }, {});
    expect(result.error).toContain("Failed to check reputation");
  });

  it("handles missing fields in API response gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({}));
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_check_reputation")!;

    const result = await handler({ did: "did:key:z6MkEmpty" }, {});
    expect(result.data.score).toBe(0.0);
    expect(result.data.confidence).toBe(0.0);
    expect(result.data.interpretation).toBe("unknown");
    expect(result.data.total_attestations).toBe(0);
  });
});

describe("avp_should_delegate", () => {
  it("approves delegation when score and confidence are above thresholds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.8, confidence: 0.9 })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_should_delegate")!;

    const result = await handler({ did: "did:key:z6MkGood", min_score: 0.5 }, {});
    expect(result.data.delegate).toBe(true);
    expect(result.content).toContain("DELEGATE");
    expect(result.content).not.toContain("DO NOT");
  });

  it("rejects delegation when score is below threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.3, confidence: 0.9 })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_should_delegate")!;

    const result = await handler({ did: "did:key:z6MkBad", min_score: 0.5 }, {});
    expect(result.data.delegate).toBe(false);
    expect(result.content).toContain("DO NOT DELEGATE");
    expect(result.data.reason).toContain("< 0.50 threshold");
    // Should NOT mention low confidence when score is the issue
    expect(result.data.reason).not.toContain("Low confidence");
  });

  it("rejects delegation when confidence is too low despite good score", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.9, confidence: 0.05 })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_should_delegate")!;

    const result = await handler({ did: "did:key:z6MkLowConf" }, {});
    expect(result.data.delegate).toBe(false);
    expect(result.data.reason).toContain("Low confidence");
    expect(result.data.reason).toContain(">= 0.50");
  });

  it("uses config minDelegationScore when min_score not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ score: 0.4, confidence: 0.9 })
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_should_delegate")!;

    const result = await handler({ did: "did:key:z6MkTest" }, {});
    // config minDelegationScore is 0.5, score 0.4 < 0.5
    expect(result.data.delegate).toBe(false);
    expect(result.data.min_score).toBe(0.5);
  });
});

describe("avp_log_interaction", () => {
  it("sends attestation POST with correct body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_log_interaction")!;

    const result = await handler(
      { did: "did:key:z6MkPeer", outcome: "negative", context: "code_review" },
      {}
    );

    expect(result.data.status).toBe("recorded");
    expect(result.data.outcome).toBe("negative");
    expect(result.data.context).toBe("code_review");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/attestations");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.to_agent_did).toBe("did:key:z6MkPeer");
    expect(body.outcome).toBe("negative");
    expect(body.context).toBe("code_review");
    expect(body.weight).toBe(0.8);
  });

  it("defaults outcome to positive and context to paperclip_task", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true }));
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_log_interaction")!;

    const result = await handler({ did: "did:key:z6MkPeer" }, {});
    expect(result.data.outcome).toBe("positive");
    expect(result.data.context).toBe("paperclip_task");
  });

  it("returns error on API failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ error: "unauthorized" }, false, 401)
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_log_interaction")!;

    const result = await handler({ did: "did:key:z6MkPeer" }, {});
    expect(result.error).toContain("Failed to log interaction");
  });
});

describe("avp_evaluate_team", () => {
  it("returns correct averages and weakest agent", async () => {
    const scores: Record<string, any> = {
      "did:key:A": { score: 0.9, confidence: 0.8, interpretation: "trusted" },
      "did:key:B": { score: 0.3, confidence: 0.6, interpretation: "untrusted" },
      "did:key:C": { score: 0.6, confidence: 0.7, interpretation: "neutral" },
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      for (const [did, data] of Object.entries(scores)) {
        if (url.includes(encodeURIComponent(did))) return mockResponse(data);
      }
      return mockResponse({}, false, 404);
    });
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_evaluate_team")!;

    const result = await handler({ dids: ["did:key:A", "did:key:B", "did:key:C"] }, {});
    expect(result.data.team_size).toBe(3);
    expect(result.data.resolved).toBe(3);
    expect(result.data.failed).toBe(0);
    expect(result.data.average_score).toBeCloseTo(0.6, 2); // (0.9+0.3+0.6)/3
    expect(result.data.lowest_agent).toBe("did:key:B");
    expect(result.data.lowest_score).toBe(0.3);
  });

  it("handles empty dids array", async () => {
    await setupPlugin();
    const handler = toolHandlers.get("avp_evaluate_team")!;

    const result = await handler({ dids: [] }, {});
    expect(result.data.team_size).toBe(0);
    expect(result.data.average_score).toBe(0);
    expect(result.content).toContain("empty");
  });

  it("calculates average only from successful lookups", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      // First agent succeeds with score 0.8, second fails
      if (url.includes(encodeURIComponent("did:key:Good"))) {
        return mockResponse({ score: 0.8, confidence: 0.9, interpretation: "trusted" });
      }
      return mockResponse({ error: "not found" }, false, 404);
    });
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_evaluate_team")!;

    const result = await handler({ dids: ["did:key:Good", "did:key:Missing"] }, {});
    expect(result.data.team_size).toBe(2);
    expect(result.data.resolved).toBe(1);
    expect(result.data.failed).toBe(1);
    // Average should be 0.8 (only from successful), not 0.4 (old bug: 0.8/2)
    expect(result.data.average_score).toBe(0.8);
    expect(result.data.lowest_agent).toBe("did:key:Good");
    // Failed agent should have score: null
    const failedAgent = result.data.agents.find((a: any) => a.did === "did:key:Missing");
    expect(failedAgent.score).toBeNull();
    expect(failedAgent.error).toBeDefined();
  });

  it("handles all agents failing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ error: "down" }, false, 500)
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_evaluate_team")!;

    const result = await handler({ dids: ["did:key:A", "did:key:B"] }, {});
    expect(result.data.resolved).toBe(0);
    expect(result.data.failed).toBe(2);
    expect(result.data.average_score).toBe(0);
    expect(result.data.lowest_score).toBe(0);
    expect(result.data.lowest_agent).toBe("");
  });
});

describe("avp_heartbeat_report", () => {
  it("generates report with own reputation and velocity", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/velocity")) {
        return mockResponse({ trend: "rising", alert: false, alert_reason: "" });
      }
      if (url.includes("/v1/reputation/")) {
        return mockResponse({ score: 0.75, confidence: 0.88, interpretation: "trusted" });
      }
      return mockResponse({});
    });
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_heartbeat_report")!;

    const result = await handler({ agent_did: "did:key:z6MkSelf" }, {});
    expect(result.data.own_reputation.score).toBe(0.75);
    expect(result.data.velocity.trend).toBe("rising");
    expect(result.data.peer_attestations).toHaveLength(0);
    expect(result.content).toContain("score=0.75");
    expect(result.content).toContain("trend=rising");
  });

  it("handles velocity endpoint failure gracefully", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/velocity")) {
        return mockResponse({ error: "not implemented" }, false, 501);
      }
      if (url.includes("/v1/reputation/")) {
        return mockResponse({ score: 0.5, confidence: 0.5, interpretation: "neutral" });
      }
      return mockResponse({});
    });
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_heartbeat_report")!;

    const result = await handler({ agent_did: "did:key:z6MkSelf" }, {});
    // Should not error — velocity failure is non-fatal
    expect(result.data.own_reputation.score).toBe(0.5);
    expect(result.data.velocity.trend).toBe("unknown");
  });

  it("submits peer attestations and reports results", async () => {
    const postCalls: any[] = [];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
      if (init?.method === "POST") {
        postCalls.push(JSON.parse(init.body));
        return mockResponse({ ok: true });
      }
      if (url.includes("/velocity")) {
        return mockResponse({ trend: "stable" });
      }
      return mockResponse({ score: 0.7, confidence: 0.8, interpretation: "trusted" });
    });
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_heartbeat_report")!;

    const result = await handler({
      agent_did: "did:key:z6MkSelf",
      peers_evaluated: [
        { did: "did:key:Peer1", outcome: "positive", context: "task_delivery" },
        { did: "did:key:Peer2", outcome: "negative" },
      ],
    }, {});

    expect(result.data.peer_attestations).toHaveLength(2);
    expect(result.data.peer_attestations[0].status).toBe("recorded");
    expect(result.data.peer_attestations[1].outcome).toBe("negative");
    expect(result.content).toContain("2 peer attestations");

    // Verify POST bodies
    expect(postCalls[0].to_agent_did).toBe("did:key:Peer1");
    expect(postCalls[0].context).toBe("task_delivery");
    expect(postCalls[1].to_agent_did).toBe("did:key:Peer2");
    expect(postCalls[1].context).toBe("paperclip_heartbeat"); // default
  });
});

describe("avpFetch (via tool calls)", () => {
  it("throws on non-ok HTTP response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ error: "server error" }, false, 500)
    );
    await setupPlugin(fetchMock);
    const handler = toolHandlers.get("avp_check_reputation")!;

    const result = await handler({ did: "did:key:z6MkTest" }, {});
    expect(result.error).toContain("Failed to check reputation");
    expect(result.error).toContain("500");
  });
});

describe("onValidateConfig", () => {
  it("rejects empty avpBaseUrl", async () => {
    await import("./worker.js");
    const result = await onValidateConfigFn!({ avpBaseUrl: "" });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("AVP API URL is required");
  });

  it("accepts valid config", async () => {
    await import("./worker.js");
    const result = await onValidateConfigFn!({ avpBaseUrl: "https://agentveil.dev" });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("onHealth", () => {
  it("returns ok status", async () => {
    await import("./worker.js");
    const result = await onHealthFn!();
    expect(result.status).toBe("ok");
  });
});

describe("health check job", () => {
  it("logs success on healthy API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ status: "ok" }));
    const ctx = await setupPlugin(fetchMock);
    const job = jobHandlers.get("avp-health-check")!;
    expect(job).toBeDefined();

    await job({});
    expect(ctx.logger.info).toHaveBeenCalledWith("AVP health check passed");
  });

  it("logs error on unhealthy API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ error: "down" }, false, 503)
    );
    const ctx = await setupPlugin(fetchMock);
    const job = jobHandlers.get("avp-health-check")!;

    await job({});
    expect(ctx.logger.error).toHaveBeenCalled();
  });
});
