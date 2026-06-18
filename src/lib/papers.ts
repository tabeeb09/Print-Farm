import type { ResourceId } from "@/src/lib/resource-schema";

export type PaperFigure = {
  id: string;
  label: string;
  caption: string;
  resourceId?: ResourceId;
  href?: string;
};

export type PaperSection = {
  id: string;
  title: string;
  paragraphs: string[];
  subsections?: PaperSection[];
};

export type PaperResource = {
  label: string;
  resourceId?: ResourceId;
  href?: string;
};

export type PaperDocument = {
  slug: string;
  label: string;
  title: string;
  subtitle?: string;
  authors: string[];
  affiliations?: string[];
  date?: string;
  preamble?: string[];
  abstract: string[];
  keywords: string[];
  sections: PaperSection[];
  figures?: PaperFigure[];
  resources?: PaperResource[];
  pdfResourceId?: ResourceId;
  heroResourceId?: ResourceId;
  heroAlt?: string;
};

export const papers: Record<string, PaperDocument> = {
  hhg: {
    slug: "hhg",
    label: "Research article",
    title: "High-harmonic generation with plasmonic enhancements",
    subtitle: "Analysis notes from the ORBYTS research placement",
    authors: ["Tabeeb Rahman"],
    affiliations: ["UCL / University of Zurich ORBYTS Programme"],
    date: "Research placement",
    heroResourceId: "image.hhgNanostructures",
    heroAlt: "Nanostructures used as a high-harmonic generation project hero image",
    abstract: [
      "This project analysed high-energy XUV laboratory data to study plasmonic ionisation and electron recombination in ultra-high energy regimes.",
      "The work combined scientific Python tooling, statistical data extraction, and physics interpretation across large experimental datasets.",
    ],
    keywords: ["High-harmonic generation", "Plasmonics", "XUV data", "TensorFlow", "Pandas"],
    sections: [
      {
        id: "background",
        title: "Background",
        paragraphs: [
          "High-harmonic generation is a nonlinear optical process where intense laser fields drive electrons through ionisation, acceleration, and recombination stages.",
          "The project focused on extracting signal structure from experimental data and relating those signals to physical mechanisms in the broader collaboration.",
        ],
      },
      {
        id: "methods",
        title: "Methods",
        paragraphs: [
          "The analysis workflow used Python data tooling to process high-volume laboratory data and derive statistical summaries suitable for scientific interpretation.",
          "The presentation and source report are retained as primary artifacts for the portfolio record.",
        ],
      },
      {
        id: "outcome",
        title: "Outcome",
        paragraphs: [
          "The broader collaboration contributed to peer-reviewed quantum physics work, while this portfolio page records the applied data-science contribution and presentation artifact.",
        ],
      },
    ],
    resources: [
      { label: "Embedded report", resourceId: "pdf.hhg" },
      { label: "Presentation deck", resourceId: "presentation.hhg" },
      {
        label: "Published paper",
        href: "https://iopscience.iop.org/article/10.1088/1361-6455/ac2e4a",
      },
    ],
    pdfResourceId: "pdf.hhg",
  },
  climate: {
    slug: "climate_data_analysis",
    label: "Data analysis paper",
    title: "Climate change data science",
    subtitle: "Advanced climate data analysis report",
    authors: ["Tabeeb Rahman"],
    date: "University of Bath coursework",
    preamble: [
      "Of the many triumphs of human understanding, the ability to extract meaning from noisy real-world data is one of the most practically powerful. Climate data is a particularly good example of this, because the underlying question is simple and important, but the evidence has to be handled with statistical care. During my undergraduate degree, I had the privilege of working on an extensive data analysis assignment using the Met Office UK Climate Series, applying statistical and data science methods to investigate whether the dataset provides significant evidence for climate change.",
      "This project gave me a valuable opportunity to demonstrate my ability to turn raw historical data into a coherent quantitative argument. I analysed long-term temperature, precipitation, seasonal, and frost-day records using techniques such as baseline anomaly construction, ordinary least squares regression, hypothesis testing, distributional analysis, correlation analysis, and statistical visualisation. The assignment was also a useful exercise in communicating uncertainty: not just identifying trends, but testing whether they were statistically meaningful and interpreting the limitations of the results.",
      "I was pleased to receive 90% for this work, which made it one of the clearest demonstrations of my data science and statistical reasoning skills during my degree. The following report presents the finished analysis, showing how the UK climate record provides strong quantitative evidence for accelerated warming, changing temperature distributions, increased warm extremes, reduced frost days, and shifts in precipitation behaviour.",
    ],
    abstract: [
      "This report investigates climate data using statistical modelling and reproducible scientific computing methods.",
      "The portfolio presentation focuses on the analysis structure, methods, and generated report artifact.",
    ],
    keywords: ["Climate data", "Scientific computing", "Statistics", "Python"],
    sections: [
      {
        id: "objective",
        title: "Objective",
        paragraphs: [
          "The objective was to convert raw climate observations into interpretable evidence through careful data cleaning, modelling, and visualization.",
        ],
      },
      {
        id: "analysis",
        title: "Analysis structure",
        paragraphs: [
          "The work follows a standard scientific report structure: problem framing, methodology, results, interpretation, and limitations.",
        ],
      },
    ],
    resources: [{ label: "Embedded report", resourceId: "pdf.climate" }],
    pdfResourceId: "pdf.climate",
  },
  neuromorphic: {
    slug: "neuromorphic",
    label: "Technical report",
    title: "Memristors and spiking neural networks",
    subtitle: "Neuromorphic computing report",
    authors: ["Tabeeb Rahman"],
    heroResourceId: "image.memristorHero",
    heroAlt: "Memristor concept art used for the neuromorphic report hero image",
    abstract: [
      "This report surveys memristive devices and spiking neural network architectures as candidate substrates for neuromorphic computation.",
      "The page presents the report in a journal-style structure while keeping the original PDF available as the canonical artifact.",
    ],
    keywords: ["Memristors", "Spiking neural networks", "Neuromorphic computing", "Online learning"],
    sections: [
      {
        id: "motivation",
        title: "Motivation",
        paragraphs: [
          "Neuromorphic systems try to reduce the gap between biological efficiency and conventional digital machine-learning infrastructure.",
          "Memristive components are attractive because device history can influence conductance, creating a hardware-level memory mechanism.",
        ],
      },
      {
        id: "scope",
        title: "Scope",
        paragraphs: [
          "The report connects device-level behaviour with algorithmic questions around spikes, temporal dynamics, and learning rules.",
        ],
      },
    ],
    resources: [
      { label: "Embedded report", resourceId: "pdf.neuromorphic" },
    ],
    pdfResourceId: "pdf.neuromorphic",
  },
  reflectance: {
    slug: "reflectance",
    label: "Computational physics report",
    title: "Reflectance in dielectric structures",
    subtitle: "Transfer-matrix modelling of thin-film optical coatings",
    authors: ["Tabeeb Rahman"],
    date: "University of Bath coursework",
    preamble: [
      "Of the many triumphs of human understanding, the ability to predict how light behaves inside structured materials remains one of the most elegant links between physics, mathematics, and computation. Thin-film dielectric coatings are a particularly good example of this, because their behaviour follows from the interference of reflected waves at each interface, yet the final optical response can become highly non-trivial once multiple layers are combined.",
      "During my undergraduate degree, I had the privilege of working on a computational physics project exploring reflectance in dielectric structures. This gave me the opportunity to demonstrate my ability to translate physical theory into working numerical code, using the transfer-matrix formalism to model normally incident light in single-layer, bilayer, and multilayer dielectric coatings. I implemented the calculations in C, using complex arithmetic to evaluate the reflectivity and generate reflectance spectra across the visible range.",
      "The project was a useful exercise in connecting abstract electromagnetic theory to concrete computational results. A single low-index layer behaved mainly as an anti-reflection coating, while adding high-index layers introduced stronger interference effects. Repeating the bilayer structure produced the characteristic behaviour of a dielectric mirror, with reflectance approaching unity across a broad stop band as the number of bilayers increased. I was pleased to receive 75% for this work, which made it a strong demonstration of my computational physics, numerical modelling, and scientific programming skills.",
      "The following report presents the finished analysis, showing how the transfer-matrix method can be used to predict and interpret the reflectance behaviour of dielectric coatings from simple single-layer structures through to high-reflectance multilayer mirrors.",
    ],
    abstract: [
      "This report models single-layer, bilayer, and multilayer dielectric coatings using transfer matrices and complex amplitudes.",
      "It records the implementation and physical interpretation of reflectance spectra across increasingly structured optical stacks.",
    ],
    keywords: ["Optics", "Dielectric coatings", "Transfer matrix", "Computational physics", "C"],
    sections: [
      {
        id: "motivation",
        title: "Motivation",
        paragraphs: [
          "Thin-film optical coatings provide a compact example of how interference, boundary conditions, and numerical modelling combine into a practical engineering problem.",
          "The project focused on reproducing reflectance behaviour across simple anti-reflection layers and repeated bilayer mirrors.",
        ],
      },
      {
        id: "method",
        title: "Method",
        paragraphs: [
          "The core model used the transfer-matrix formalism for normally incident light, implemented in C with complex arithmetic.",
          "Reflectance spectra were generated across the visible range and compared across single-layer, bilayer, and repeated multilayer structures.",
        ],
      },
      {
        id: "outcome",
        title: "Outcome",
        paragraphs: [
          "The report demonstrates a clear progression from weak anti-reflection behaviour to broad high-reflectance stop bands as more bilayers are added.",
        ],
      },
    ],
    resources: [{ label: "Embedded report", resourceId: "pdf.reflectance" }],
    pdfResourceId: "pdf.reflectance",
  },
  cv: {
    slug: "cv",
    label: "Profile document",
    title: "Curriculum vitae",
    authors: ["Tabeeb Rahman"],
    abstract: [
      "A concise professional summary of research, software, data science, and engineering experience.",
    ],
    keywords: ["CV", "Software engineering", "Data science", "Physics"],
    sections: [
      {
        id: "summary",
        title: "Summary",
        paragraphs: [
          "The CV is retained as a controlled PDF artifact and embedded directly for authenticated readers.",
        ],
      },
    ],
    resources: [{ label: "Embedded CV", resourceId: "pdf.cv" }],
    pdfResourceId: "pdf.cv",
  },
};
