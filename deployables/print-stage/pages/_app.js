import "../styles/global.css";

import Head from "next/head";
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
        <Head>
          <link rel="icon" href="/makerspace-design/assets/footer-logo-white.png?v=4" type="image/png" />
          <link rel="shortcut icon" href="/makerspace-design/assets/footer-logo-white.png?v=4" type="image/png" />
          <link rel="apple-touch-icon" href="/makerspace-design/assets/footer-logo.png" />
        </Head>
        <Component {...pageProps} />
      </SessionContext.Provider>
    );
  }

  return (
    <SessionProvider session={session}>
      <Head>
        <link rel="icon" href="/makerspace-design/assets/footer-logo-white.png?v=4" type="image/png" />
        <link rel="shortcut icon" href="/makerspace-design/assets/footer-logo-white.png?v=4" type="image/png" />
        <link rel="apple-touch-icon" href="/makerspace-design/assets/footer-logo.png" />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
