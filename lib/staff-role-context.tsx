"use client";

import { createContext } from "react";
import type { UserLevel } from "./access-control";

// EN: Pages use the role verified by SessionBoundary for UI; the API still authorizes every action.
// FI: Sivut käyttävät SessionBoundaryn vahvistamaa roolia käyttöliittymässä; API tarkistaa jokaisen toiminnon oikeudet.
export const StaffRoleContext = createContext<UserLevel | null>(null);
