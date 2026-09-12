import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { showToast } from "./toastSlice";

// Drop-in replacement for the old `const { showToast } = useToast()`:
// same positional signature showToast(message, type, duration), backed by
// the Redux toast slice.
export const useShowToast = () => {
  const dispatch = useDispatch();
  return useCallback(
    (message, type, duration) => dispatch(showToast(message, type, duration)),
    [dispatch]
  );
};

// Selectors for the auth slice.
export const useAuthUser = () => useSelector((s) => s.auth.user);
export const useAuthLoading = () => useSelector((s) => s.auth.loading);

// Selectors for the location slice (mirrors the old useLocation shape).
export const useSiteLocation = () => {
  const location = useSelector((s) => s.location.location);
  const status = useSelector((s) => s.location.status);
  const error = useSelector((s) => s.location.error);
  return { location, status, error, isLocating: status === "locating" };
};
