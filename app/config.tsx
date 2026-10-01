// EN: Production must supply the public API origin; only local development may use loopback.
// FI: Tuotannon on annettava julkinen API-osoite; vain paikallinen kehitys saa käyttää loopbackia.
const configuredApiServer = process.env.NEXT_PUBLIC_API_SERVER;
if (process.env.NODE_ENV === "production" && !configuredApiServer) {
  throw new Error("NEXT_PUBLIC_API_SERVER is required in production.");
}
const apiServer = (configuredApiServer || "http://localhost:3001").replace(
  /\/+$/,
  "",
);

const config = {
  apiServer,
  token: "mytokenfornextjsproject",
} as const;

export default config;
