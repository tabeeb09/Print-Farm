import NextAuth from "next-auth";
import { authOptions } from "@/app/auth";

const handler = NextAuth(authOptions);

export { authOptions };
// re-export the handler for the HTTP methods NextAuth uses
export { handler as GET, handler as POST };