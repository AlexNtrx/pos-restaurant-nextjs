import axios from "axios";
import config from "@/app/config";

const api = axios.create({
  baseURL: "http://localhost:3001/api",
});

api.interceptors.request.use((configAxios) => {
  const token = localStorage.getItem(config.token);

  if (token) {
    configAxios.headers.Authorization = `Bearer ${token}`;
  }

  return configAxios;
});
export default api;
