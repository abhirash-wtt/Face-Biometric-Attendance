import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { configureStore } from '@reduxjs/toolkit';

export type PunchType = 'IN' | 'OUT';

type AttendanceState = {
  lastMessage: string;
  busy: boolean;
  livenessPrompt: string;
};

const prompts = ['blink', 'turn_left', 'turn_right', 'smile'];

const initialState: AttendanceState = {
  lastMessage: '',
  busy: false,
  livenessPrompt: prompts[0],
};

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    setBusy(state, action: PayloadAction<boolean>) {
      state.busy = action.payload;
    },
    setLastMessage(state, action: PayloadAction<string>) {
      state.lastMessage = action.payload;
    },
    rollLivenessPrompt(state) {
      state.livenessPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    },
  },
});

export const { setBusy, setLastMessage, rollLivenessPrompt } = attendanceSlice.actions;

export const store = configureStore({
  reducer: { attendance: attendanceSlice.reducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
