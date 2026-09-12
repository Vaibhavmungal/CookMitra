import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import toastReducer from "./toastSlice";
import locationReducer from "./locationSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    toast: toastReducer,
    location: locationReducer,
  },
});

export default store;
