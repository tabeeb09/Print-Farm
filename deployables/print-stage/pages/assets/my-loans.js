import Head from "next/head";
import { getServerSession } from "next-auth/next";

import AssetClient from "../../components/assets/AssetClient";
import SiteShell from "../../components/SiteShell";
import { authOptions } from "../../lib/authOptions";

export default function MyLoansPage() {
  return (
    <SiteShell title="My bookings">
      <Head>
        <title>My bookings | Print farm</title>
      </Head>
      <AssetClient mode="my-loans" />
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return {
      redirect: {
        destination: "/api/auth/signin?callbackUrl=%2Fassets%2Fmy-loans",
        permanent: false,
      },
    };
  }
  return { props: {} };
}
