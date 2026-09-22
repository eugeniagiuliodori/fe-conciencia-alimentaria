import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the repository's AGENTS.md under manual control.
  agentRules: false,
};

export default nextConfig;
