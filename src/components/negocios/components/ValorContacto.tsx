import {
  useEffect,
  useRef,
  useState,
} from "react";

export function ValorContacto({
  valor,
}: {
  valor: string;
}) {
  const textoRef =
    useRef<HTMLSpanElement>(null);

  const [truncado, setTruncado] =
    useState(false);

  const [modalAbierto, setModalAbierto] =
    useState(false);

  useEffect(() => {
    const elemento = textoRef.current;

    if (!elemento) return;

    function comprobarTruncado() {
      if (!elemento) return;

      setTruncado(
        elemento.scrollWidth >
          elemento.clientWidth,
      );
    }

    comprobarTruncado();

    const observer = new ResizeObserver(
      comprobarTruncado,
    );

    observer.observe(elemento);

    return () => {
      observer.disconnect();
    };
  }, [valor]);

  return (
    <>
      <button
        type="button"
        disabled={!truncado}
        onClick={() =>
          setModalAbierto(true)
        }
        className={`
          block w-full min-w-0
          text-left text-muted
          ${
            truncado
              ? "cursor-pointer hover:text-accent underline"
              : "cursor-default"
          }
        `}
      >
        <span
          ref={textoRef}
          className="block truncate"
        >
          {valor}
        </span>
      </button>

      {modalAbierto && (
        <div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
            bg-[#211827]/45
            p-4
            backdrop-blur-[5px]
          "
          onClick={() =>
            setModalAbierto(false)
          }
        >
          <div
            className="
              w-full max-w-md
              rounded-[1.5rem]
              border border-[#d8b98a]
              bg-[linear-gradient(145deg,#fffaf2_0%,#faf8f5_52%,#f4edf5_100%)]
              p-6
              shadow-[0_18px_50px_rgba(50,36,55,0.25)]
            "
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
              Medio de contacto
            </p>

            <p className="mt-4 break-words text-sm text-foreground">
              {valor}
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setModalAbierto(false)
                }
                className="
                  rounded-full
                  border border-[#d8b98a]
                  px-4 py-2
                  text-sm font-semibold
                  text-accent
                  transition
                  hover:bg-accent-soft
                "
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}