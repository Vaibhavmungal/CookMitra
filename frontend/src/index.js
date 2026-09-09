import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

const root = ReactDOM.createRoot(document.getElementById("root"));

const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// GoogleOAuthProvider requires a real client ID — only wrap when configured
// so local dev without Google keys still runs on email/password auth.
root.render(
  googleClientId && !googleClientId.includes("your_google_client_id_here") ? (
    <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>
  ) : (
    app
  )
);
