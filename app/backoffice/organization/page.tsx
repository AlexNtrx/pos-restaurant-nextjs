"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import config from "@/app/config";
import api from "@/lib/api";

type Organization = {
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
// Validates is organization before it is used.
const isOrganization = (value: unknown): value is Organization => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "number" &&
    [
      "name",
      "address",
      "phone",
      "email",
      "website",
      "bankNo",
      "logo",
      "taxCode",
    ].every((key) => typeof item[key] === "string")
  );
};
// Coordinates message behavior for this module.
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete the organization request";
// Coordinates logo url behavior for this module.
const logoUrl = (logo: string) => `${config.apiServer}/uploads/${logo}`;

// Renders the organization page interface.
export default function OrganizationPage() {
  const [form, setForm] = useState<Omit<Organization, "id">>({
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    bankNo: "",
    logo: "",
    taxCode: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Updates field without changing user-visible behavior.
  const setField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/organization/info");
      if (!isOrganization(response.data?.result))
        throw new Error("Organization settings are not configured");
      const result = response.data.result;
      setForm({
        name: result.name,
        address: result.address,
        phone: result.phone,
        email: result.email,
        website: result.website,
        bankNo: result.bankNo,
        logo: result.logo,
        taxCode: result.taxCode,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: unknown) {
      await Swal.fire({ title: "Error", text: message(error), icon: "error" });
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);
  // Coordinates upload logo behavior for this module.
  const uploadLogo = async () => {
    if (!selectedFile) return form.logo;
    const data = new FormData();
    data.append("file", selectedFile);
    const response = await api.post("/organization/upload", data);
    if (typeof response.data?.fileName !== "string" || !response.data.fileName)
      throw new Error("Invalid logo-upload response");
    return response.data.fileName;
  };
  // Coordinates save behavior for this module.
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      website: form.website.trim(),
      bankNo: form.bankNo.trim(),
      taxCode: form.taxCode.trim(),
    };
    if (
      !payload.name ||
      !payload.address ||
      !payload.phone ||
      !payload.taxCode
    ) {
      await Swal.fire({
        title: "Validation",
        text: "Name, address, phone, and tax code are required",
        icon: "warning",
      });
      return;
    }
    setIsSaving(true);
    try {
      const logo = await uploadLogo();
      await api.post("/organization/create", { ...payload, logo });
      setForm((current) => ({ ...current, logo }));
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Swal.fire({
        title: "Saved",
        text: "บันทึกข้อมูลเรียบร้อย",
        icon: "success",
      });
    } catch (error: unknown) {
      await Swal.fire({ title: "Error", text: message(error), icon: "error" });
    } finally {
      setIsSaving(false);
    }
  };
  if (isLoading)
    return (
      <div className="card mt-3">
        <div className="card-body text-center">
          Loading organization settings…
        </div>
      </div>
    );
  return (
    <div className="card mt-3">
      <div className="card-header">
        <h3 className="card-title">Business Profile</h3>
      </div>
      <form onSubmit={save}>
        <div className="card-body">
          <label htmlFor="organization-name">Business Name</label>
          <input
            id="organization-name"
            required
            maxLength={150}
            className="form-control"
            value={form.name}
            onChange={(event) => setField("name", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-address">
            Address
          </label>
          <input
            id="organization-address"
            required
            maxLength={500}
            className="form-control"
            value={form.address}
            onChange={(event) => setField("address", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-phone">
            Phone
          </label>
          <input
            id="organization-phone"
            required
            maxLength={50}
            className="form-control"
            value={form.phone}
            onChange={(event) => setField("phone", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-email">
            Email
          </label>
          <input
            id="organization-email"
            type="email"
            maxLength={254}
            className="form-control"
            value={form.email}
            onChange={(event) => setField("email", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-website">
            Website
          </label>
          <input
            id="organization-website"
            type="text"
            inputMode="url"
            maxLength={250}
            className="form-control"
            placeholder="https://example.com"
            value={form.website}
            onChange={(event) => setField("website", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-logo">
            Logo
          </label>
          {form.logo && (
            <img
              src={logoUrl(form.logo)}
              alt="Organization logo"
              className="d-block img-fluid mb-2 mt-2"
              width="100"
            />
          )}
          <input
            ref={fileInputRef}
            id="organization-logo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="form-control"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] ?? null)
            }
          />
          <label className="mt-3" htmlFor="organization-tax">
            Tax ID
          </label>
          <input
            id="organization-tax"
            required
            maxLength={50}
            className="form-control"
            value={form.taxCode}
            onChange={(event) => setField("taxCode", event.target.value)}
          />
          <label className="mt-3" htmlFor="organization-bank">
            Bank Account Number
          </label>
          <input
            id="organization-bank"
            maxLength={100}
            className="form-control"
            value={form.bankNo}
            onChange={(event) => setField("bankNo", event.target.value)}
          />
        </div>
        <div className="card-footer">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            <i className="fa fa-save me-2" />
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
