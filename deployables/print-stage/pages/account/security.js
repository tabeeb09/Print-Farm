export default function AccountSecurityRedirect() {
  return null;
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/account",
      permanent: false,
    },
  };
}
