import PaperArticle from "@/components/PaperArticle";
import { requireAllowed } from "@/components/requireAllowed";
import { papers } from "@/src/lib/papers";

export const metadata = {
  title: papers.cv.title,
};

export default async function CvPage() {
  await requireAllowed();

  return <PaperArticle paper={papers.cv} />;
}
