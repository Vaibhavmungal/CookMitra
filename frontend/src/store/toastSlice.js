import { createSlice } from "@reduxjs/toolkit";

const makeId = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// Plain thunk action creator (not createAsyncThunk): keeps the old positional
// call signature showToast(message, type, duration) so call sites only need
// `dispatch(...)` wrapped around them.
export const showToast =
  (message, type = "info", duration = 4000) =>
  (dispatch) => {
    const id = makeId();
    dispatch(toastSlice.actions.pushToast({ id, message, type }));
    setTimeout(() => {
      dispatch(toastSlice.actions.removeToast(id));
    }, duration);
    return id;
  };

const toastSlice = createSlice({
  name: "toast",
  initialState: { toasts: [] },
  reducers: {
    pushToast(state, action) {
      state.toasts.push(action.payload);
    },
    removeToast(state, action) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    clearToasts(state) {
      state.toasts = [];
    },
  },
});

export const { pushToast, removeToast, clearToasts } = toastSlice.actions;
export default toastSlice.reducer;
