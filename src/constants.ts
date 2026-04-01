export const PLUGIN_ID = "paperclip-plugin-avp";
export const PLUGIN_VERSION = "1.0.1";

export const TOOL_NAMES = {
  checkReputation: "avp_check_reputation",
  shouldDelegate: "avp_should_delegate",
  logInteraction: "avp_log_interaction",
  evaluateTeam: "avp_evaluate_team",
  heartbeatReport: "avp_heartbeat_report",
} as const;

export const JOB_KEYS = {
  healthCheck: "avp-health-check",
} as const;
