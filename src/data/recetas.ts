export type Receta = {
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
export const recetas: readonly Receta[] = [
  {
    ratiox:17,
    ratioy:20,
    slug: "receta1",
    title: "",
    summary:"",
    videoUrl:"/images/recetas/receta1.mp4",
    content: [],
  },
 {
    ratiox:10,
    ratioy:15,
    slug: "receta2",
    title: "",
    summary:"",
    videoUrl:"/images/recetas/receta2.mp4",
    content: [],
  },
 {
    ratiox:10,
    ratioy:15,
    slug: "receta3",
    title: "",
    summary:"",
    videoUrl: "/images/recetas/receta3.mp4",
    content: [],
  },
   {
    ratiox:15,
    ratioy:10,
    slug: "receta4",
    title: "",
    summary:"",
    videoUrl: "/images/recetas/receta4.mp4",
    content: [],
  },
 /*{
    ratiox:8,
    ratioy:6,
    slug: "receta5",
    title: "",
    summary:"",
    image: {
      src: "/images/recetas/receta5.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },
 {
    ratiox:9,
    ratioy:6,
    slug: "receta6",
    title: "",
    summary:"",
    image: {
      src: "/images/recetas/receta6.png",
      alt: "",
      width: 800,
      height: 800,
    },
    content: [],
  },*/
];

export function getRecetaBySlug(slug: string) {
  return recetas.find((receta) => receta.slug === slug);
}
