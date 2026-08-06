"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import Swal from "sweetalert2";
import config from "@/app/config";
const OrganizationPage = () => {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [logo, setLogo] = useState("");
  const [bankNo, setBankNo] = useState("");
  const [taxCode, setTaxcode] = useState("");
  const [fileSelected, setFileSelected] = useState<File | null>(null);

  const handleFileChange = (e: any) => {
    setFileSelected(e.target.files[0]);
  };
  const uploadFile = async () => {
    const formData = new FormData();
    formData.append("file", fileSelected as Blob);

    const respone = await api.post("/organization/upload", formData);
    return respone.data.fileName;
  };
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await api.get("/organization/info");
    setName(res.data.result.name);
    setAddress(res.data.result.address);
    setPhone(res.data.result.phone);
    setEmail(res.data.result.email);
    setWebsite(res.data.result.website);
    setLogo(res.data.result.logo);
    setBankNo(res.data.result.bankNo);
    setTaxcode(res.data.result.taxCode);
  };
  const save = async () => {
    try {
      const fileName = await uploadFile();
      const payload = {
        name: name,
        address: address,
        phone: phone,
        email: email,
        website: website,
        logo: fileName,
        bankNo: bankNo,
        taxCode: taxCode,
      };
      await api.post("/organization/create", payload);
      Swal.fire({
        title: "success",
        text: "บันทึกข้อมูลเรียบร้อย",
        icon: "success",
      });
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">
          <h3 className="card-title">Organization</h3>
        </div>
        <div className="card-body">
          <div>Name</div>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3">address</div>
          <input
            type="text"
            className="form-control"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="mt-3">phone</div>
          <input
            type="text"
            className="form-control"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div className="mt-3">email</div>
          <input
            type="text"
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="mt-3">website</div>
          <input
            type="text"
            className="form-control"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <div className="mt-3">logo</div>
          {logo && (
            <img
              src={config.apiServer + "/uploads/" + logo}
              alt="logo"
              className="img-fluid mb-2 mt-2"
              width={100}
            />
          )}
          <input
            type="file"
            className="form-control"
            value=""
            onChange={handleFileChange}
          />
          <div className="mt-3">taxno</div>
          <input
            type="text"
            className="form-control"
            value={taxCode}
            onChange={(e) => setTaxcode(e.target.value)}
          />
          <div className="mt-3">bankno</div>
          <input
            type="text"
            className="form-control"
            value={bankNo}
            onChange={(e) => setBankNo(e.target.value)}
          />
        </div>
        <button className="btn btn-primary mt-3" onClick={save}>
          <i className="fa fa-save me-2"></i>
          Save
        </button>
      </div>
    </>
  );
};
export default OrganizationPage;
