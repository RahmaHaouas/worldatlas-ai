/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static site -> S3 + CloudFront, no server to run
  images: { unoptimized: true },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
