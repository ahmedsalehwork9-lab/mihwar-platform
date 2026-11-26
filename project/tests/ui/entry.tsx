import React from "react";
import { createRoot } from "react-dom/client";
import SalesInvoicePage from "/home/claude/proj/src/pages/sales/SalesInvoicePage";
import { LangProvider } from "./mocks";
createRoot(document.getElementById("root")!).render(<LangProvider><SalesInvoicePage onNavigate={() => {}} onSection={() => {}} /></LangProvider>);
