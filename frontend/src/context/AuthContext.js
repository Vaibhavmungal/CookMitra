// REMOVED — auth state now lives in Redux (frontend/src/store/authSlice.js).
// Use: `useSelector((s) => s.auth.user)` + thunks loginUser / registerUser /
// googleLoginUser + actions logout / updateUser. This file is intentionally
// left as a stub so the folder can be deleted; do not import from here.
throw new Error(
  "AuthContext was removed — migrate to the Redux auth slice (store/authSlice.js)."
);
