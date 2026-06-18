import PaperArticle from "@/components/PaperArticle";
import { papers } from "@/src/lib/papers";

export const metadata = {
  title: papers.neuromorphic.title,
};

export default function NeuromorphicPage() {
  return <PaperArticle paper={papers.neuromorphic} />;
}
