import PaperArticle from "@/components/PaperArticle";
import { papers } from "@/src/lib/papers";

export const metadata = {
  title: papers.climate.title,
};

export default function ClimateDataAnalysisPage() {
  return <PaperArticle paper={papers.climate} />;
}
