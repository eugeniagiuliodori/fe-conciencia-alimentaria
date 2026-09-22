type VideoEmbedProps = {
  youtubeId: string;
  title: string;
};

export function VideoEmbed({ youtubeId, title }: VideoEmbedProps) {
  const videoId = encodeURIComponent(youtubeId);

  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-2xl bg-sand">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={`Video: ${title}`}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-link mt-3 inline-flex min-h-11 items-center gap-2 rounded-sm text-sm"
      >
        Ver en YouTube <span aria-hidden="true">↗</span>
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    </div>
  );
}
