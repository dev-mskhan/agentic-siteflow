import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface UiState {
  title: string;
}

const initialState: UiState = {
  title: 'SiteFlow AI',
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTitle(state, action: PayloadAction<string>) {
      state.title = action.payload;
    },
  },
});

export const { setTitle } = uiSlice.actions;

export default uiSlice.reducer;
