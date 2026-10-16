/** The recording sandbox can never be enabled in a deployed production build. */
export function isLocalDemoEnvironment(development: boolean, mode: string, hostname: string) {
  return development && mode === "demo" && ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
}

export const IS_LOCAL_DEMO = isLocalDemoEnvironment(
  import.meta.env.DEV,
  import.meta.env.MODE,
  typeof window === "undefined" ? "" : window.location.hostname,
);
