import "../styles/global.css";

import { SessionContext, SessionProvider } from "next-auth/react";

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  if (typeof window === "undefined") {
    const serverSessionValue = {
      data: session ?? null,
      status: session ? "authenticated" : "unauthenticated",
      update: async () => session ?? null,
    };

    return (
      <SessionContext.Provider value={serverSessionValue}>
        <Component {...pageProps} />
      </SessionContext.Provider>
    );
  }

  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
