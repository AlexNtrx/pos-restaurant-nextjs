export type Organization = {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bankNo: string;
  logo: string;
  taxCode: string;
};
export type OrganizationForm = Omit<Organization, "id">;
export type LoadStatus = "loading" | "ready" | "error" | "forbidden";
export type ValidatedField = "name" | "address" | "phone" | "email" | "taxCode";
