/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {},
  },
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: "/backoffice/dailysales",
        destination: "/backoffice/daily-sales",
        permanent: true,
      },
      {
        source: "/backoffice/monthlysales",
        destination: "/backoffice/monthly-sales",
        permanent: true,
      },
      {
        source: "/backoffice/salereport",
        destination: "/backoffice/sales-report",
        permanent: true,
      },
      {
        source: "/backoffice/food-paginate",
        destination: "/backoffice/foods?page=1",
        permanent: true,
      },
      {
        source: "/backoffice/food",
        destination: "/backoffice/foods",
        permanent: true,
      },
      {
        source: "/backoffice/food-size",
        destination: "/backoffice/food-sizes",
        permanent: true,
      },
      {
        source: "/backoffice/food-type",
        destination: "/backoffice/food-types",
        permanent: true,
      },
      {
        source: "/backoffice/organization",
        destination: "/backoffice/organizations",
        permanent: true,
      },
      {
        source: "/backoffice/sale",
        destination: "/backoffice/sales",
        permanent: true,
      },
      {
        source: "/backoffice/taste",
        destination: "/backoffice/tastes",
        permanent: true,
      },
      {
        source: "/backoffice/user",
        destination: "/backoffice/users",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
