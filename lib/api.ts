import "client-only";

import axios from "axios";
import config from "@/app/config";
import { clearAuthSession, readAuthToken } from "@/lib/auth-session";

const clientOptions = {
  baseURL: `${config.apiServer}/api`,
  timeout: 10_000,
};

export const publicApi = axios.create(clientOptions);

const api = axios.create(clientOptions);

//Authenticated API Flow
//Request -> attach Bearer token -> Backend
api.interceptors.request.use((configAxios) => {
  const token = typeof window === "undefined" ? null : readAuthToken();

  if (token) {
    configAxios.headers.Authorization = `Bearer ${token}`;
  }

  return configAxios;
});

//Response -> if 401 -> clear session -> redirect to /signin
api.interceptors.response.use(
  (response) => response, //if success -> pass response back to the caller
  (error: unknown) => {
    //if error
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      clearAuthSession();

      if (window.location.pathname !== "/signin") {
        window.location.replace("/signin");
      }
    }

    return Promise.reject(error);
  },
);

export default api;
