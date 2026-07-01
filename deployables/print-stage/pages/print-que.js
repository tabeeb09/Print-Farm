export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/print-queue",
      permanent: false,
    },
  };
}

export default function PrintQueRedirect() {
  return null;
}
