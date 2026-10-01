import { validateApiOrigin } from "./scripts/build-release.mjs";

// EN: Validate every production build, including the default Vercel build command.
// FI: Tarkista jokainen tuotantokäännös, myös Vercelin oletuskäännöskomento.
if (process.env.NODE_ENV === "production") {
  validateApiOrigin(process.env.NEXT_PUBLIC_API_SERVER);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
};

export default nextConfig;
