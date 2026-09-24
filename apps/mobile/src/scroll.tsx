import { createContext, useContext } from "react";

const ScrollLockContext = createContext<(locked: boolean) => void>(() => undefined);

export const ScrollLockProvider = ScrollLockContext.Provider;

/** Tell the screen to stop scrolling while a finger is on the chart. */
export function useScrollLock() {
  return useContext(ScrollLockContext);
}
