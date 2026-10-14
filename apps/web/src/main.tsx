import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import {DepartureProvider} from './Departure';
import "./styles.css";
import "./readability.css";
import "./dark.css";
import "./selects.css";
import "./workflow.css";
import "./search-profiles.css";
import { initializeTheme } from "./theme";
initializeTheme();
// Data-router navigation supports draft blocking without replacing existing routes.
const router = createBrowserRouter([
  {
    path: "*",
    element: <DepartureProvider><App /></DepartureProvider>,
    errorElement: (
      <main className="not-found">
        <h1>Não foi possível abrir esta tela</h1>
        <p>
          Recarregue a página para tentar novamente. Alterações ainda não salvas
          podem ser perdidas.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
        <a className="button secondary" href="/app">
          Voltar ao início
        </a>
      </main>
    ),
  },
]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
