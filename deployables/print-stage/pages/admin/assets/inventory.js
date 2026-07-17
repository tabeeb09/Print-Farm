import Head from "next/head";
import { getServerSession } from "next-auth/next";

import AssetClient from "../../../components/assets/AssetClient";
import SiteShell from "../../../components/SiteShell";
import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";

export default function AssetInventoryPage() {
  return (
    <SiteShell title="Inventory">
      <Head>
        <title>Inventory | Print farm</title>
      </Head>
      <AssetClient mode="inventory" />
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);
  if (!actor) {
    return {
      redirect: {
        destination: "/auth/signin?callbackUrl=%2Fadmin%2Fassets%2Finventory",
        permanent: false,
      },
    };
  }
  if (!actor.isAssetAdmin) return { notFound: true };
  return { props: {} };
}
