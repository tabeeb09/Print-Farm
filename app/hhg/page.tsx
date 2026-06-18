import PaperArticle from "@/components/PaperArticle";
import { papers } from "@/src/lib/papers";

export const metadata = {
  title: papers.hhg.title,
};

export default function HhgPage() {
  return <PaperArticle paper={papers.hhg} />;
}
