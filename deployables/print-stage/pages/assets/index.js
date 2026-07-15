import Head from "next/head";
import { getServerSession } from "next-auth/next";

import AssetClient from "../../components/assets/AssetClient";
import SiteShell from "../../components/SiteShell";
import { authOptions } from "../../lib/authOptions";

export default function AssetLoansPage() {
  return (
    <SiteShell title="Borrow assets">
      <Head>
        <title>Borrow assets | Print farm</title>
      </Head>
      <AssetClient mode="loanable" />
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) {
    return {
      redirect: {
        destination: "/api/auth/signin?callbackUrl=%2Fassets",
        permanent: false,
      },
    };
  }
  return { props: {} };
}
