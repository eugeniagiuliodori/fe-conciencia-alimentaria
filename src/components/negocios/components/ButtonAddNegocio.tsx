import {useState} from "react";

export function ButtonAddNegocio() {

  const [modalAbierto, setModalAbierto] =
    useState(false);


  return (
    <>
     <button
        type="button"
        onClick={() => setModalAbierto(true)}
        className="
          inline-flex
          items-center
          justify-center
          rounded-[1.25rem]
          border border-[#d8b98a]
          bg-[linear-gradient(135deg,#fffaf2_0%,#f8ede1_55%,#f1e4ef_100%)]
          px-4 py-2.5
          text-sm
          font-bold
          text-subaccent
          shadow-[0_8px_22px_rgba(105,66,115,0.12)]
          transition-all
          duration-300

          hover:-translate-y-0.5
          hover:border-subaccent/40
          hover:shadow-[0_12px_28px_rgba(105,66,115,0.18)]

          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-subaccent/30

          sm:px-5
          sm:py-3
          sm:text-base
        "
      >
        Incluir mi negocio
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
              w-full max-w-[40rem]
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
            <p className="text-xs text-center font-semibold tracking-[0.14em] text-accent uppercase">
              ¿Te gustaría incluir tu negocio naturista a Conciencia alimentaria?
            </p>

            <p className="mt-4 text-center break-words text-sm text-foreground"> 
              Comunicate al correo espacioconcienciaalimentaria@gmail.com y empezamos!
            </p>
            <p className="mt-4 text-center break-words text-md font-bold text-subaccent "> 
              Existen otros canales de comunicación
            </p>
             <p className="mt-4 text-center break-words text-sm text-foreground"> 
              Instagram: espacioconcienciaalimentaria
            </p>
            <p className="mt-4 text-center break-words text-sm text-foreground"> 
              Whatsapp (sólo mensajes de texto): +540358155040891
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