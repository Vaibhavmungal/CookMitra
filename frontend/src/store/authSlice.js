import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../api/axios";

const TOKEN_KEY = "token";
const USER_KEY = "user";

const loadStored = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    return {
      token: token || null,
      user: rawUser ? JSON.parse(rawUser) : null,
    };
  } catch {
    return { token: null, user: null };
  }
};

const persist = (token, user) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // storage unavailable — session still works for this visit
  }
};

const clearStored = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
};

const stored = loadStored();

// NOTE: thunks re-throw the original axios error (instead of
// rejectWithValue) so existing call sites keep reading
// `err.response?.data?.message` unchanged via `.unwrap()`.
export const loginUser = createAsyncThunk(
  "auth/login",
  async ({ email, password }) => {
    const response = await API.post("/auth/login", { email, password });
    const { token, user } = response.data;
    persist(token, user);
    return { token, user };
  }
);

export const registerUser = createAsyncThunk("auth/register", async (data) => {
  const response = await API.post("/auth/register", data);
  const { token, user } = response.data;
  persist(token, user);
  return { token, user };
});

export const googleLoginUser = createAsyncThunk(
  "auth/googleLogin",
  async ({ idToken, role }) => {
    const response = await API.post("/auth/google", { idToken, role });
    const { token, user } = response.data;
    persist(token, user);
    return { token, user };
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: stored.user,
    token: stored.token,
    // Synchronously initialised from localStorage (the old context did the
    // same read in an effect). No async boot step, so no stuck loaders.
    loading: false,
    error: null,
  },
  reducers: {
    logout(state) {
      clearStored();
      state.user = null;
      state.token = null;
      state.error = null;
    },
    updateUser(state, action) {
      if (!state.user) return;
      state.user = { ...state.user, ...action.payload };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      } catch {
        // ignore
      }
    },
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    const onPending = (state) => {
      state.loading = true;
      state.error = null;
    };
    const onFulfilled = (state, action) => {
      state.loading = false;
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.error = null;
    };
    const onRejected = (state, action) => {
      state.loading = false;
      state.error = action.error?.message || "Authentication failed";
    };
    builder
      .addCase(loginUser.pending, onPending)
      .addCase(loginUser.fulfilled, onFulfilled)
      .addCase(loginUser.rejected, onRejected)
      .addCase(registerUser.pending, onPending)
      .addCase(registerUser.fulfilled, onFulfilled)
      .addCase(registerUser.rejected, onRejected)
      .addCase(googleLoginUser.pending, onPending)
      .addCase(googleLoginUser.fulfilled, onFulfilled)
      .addCase(googleLoginUser.rejected, onRejected);
  },
});

export const { logout, updateUser, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
