export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "ticket:theme";
export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

export function usesStandaloneHeader(pathname: string) {
  return pathname === "/login" || pathname === "/events/create/hall" || pathname.startsWith("/organizer/venue-builder/");
}

// Run in the document head before the page paints, including on full-page navigation.
// Storage can be unavailable in private/restricted browsers; system preference still works.
export const THEME_BOOTSTRAP = `(()=>{let t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch{}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()`;
