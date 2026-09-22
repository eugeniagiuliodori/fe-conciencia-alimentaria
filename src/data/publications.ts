export type Publication = {
  ratiox:number;
  ratioy:number;
  slug: string;
  title: string;
  summary: string;
  image?: {
    src: string;
    alt: string;
    width: number;
    height: number;
  };
  content: readonly string[];
  sources?: readonly {
    title: string;
    url?: string;
  }[];
  youtubeId?: string;
  videoUrl?: string;
};

// These examples contain no editorial claims. Replace them with supplied content
// and remove isPlaceholder when each publication is ready to be published.
// Add only verified video identifiers, video URLs, and source information.
export const publications: readonly Publication[] = [
  {
    ratiox:17,
    ratioy:20,
    slug: "pub1",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome1.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
 {
    ratiox:10,
    ratioy:15,
    slug: "pub2",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome2.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
 {
    ratiox:10,
    ratioy:15,
    slug: "pub3",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome3.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
   {
    ratiox:15,
    ratioy:10,
    slug: "pub4",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome4.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
 {
    ratiox:8,
    ratioy:6,
    slug: "pub5",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome5.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
 {
    ratiox:9,
    ratioy:6,
    slug: "pub6",
    title: "",
    summary:"",
    image: {
      src: "/images/publicaciones/pubhome6.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
];

export function getPublicationBySlug(slug: string) {
  return publications.find((publication) => publication.slug === slug);
}
