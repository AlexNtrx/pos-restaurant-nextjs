const apiServer = (
  process.env.NEXT_PUBLIC_API_SERVER || "http://localhost:3001"
).replace(/\/+$/, "");

const config = {
  apiServer,
  token: "mytokenfornextjsproject",
} as const;

export default config;
