import { combineReducers, configureStore } from '@reduxjs/toolkit';
import uiReducer from '../features/ui/uiSlice';

const rootReducer = combineReducers({
  ui: uiReducer,
});

export const store = configureStore({
  reducer: rootReducer,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
