import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@bnpl/merchant-sdk", "@bnpl/shared"],
};

export default nextConfig;
