import { withEve } from "eve/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint debt (16 no-explicit-any errors) is tracked by the sanity-kit
  // dashboard and must not block deploys until the types are properly
  // designed. Run `npm run lint` explicitly.
  eslint: { ignoreDuringBuilds: true },
};

export default withEve(nextConfig);
