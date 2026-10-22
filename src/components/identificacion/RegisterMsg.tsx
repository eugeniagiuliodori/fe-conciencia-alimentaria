


export function RegisterMsg() {
 
 

  return (
    <div
      className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-2 rounded-2xl border border-[#dbc7aa]/80 bg-[linear-gradient(150deg,rgba(255,255,255,0.95)_0%,rgba(255,250,245,0.9)_60%,rgba(250,241,248,0.92)_100%)] p-3 text-[#382b32] shadow-[0_5px_20px_rgba(91,65,74,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] sm:rounded-3xl sm:p-3"
    >

      <h2
        id="identificacion-title"
        className="pr-10 font-display text-lg font-semibold leading-tight text-[#713750] [text-shadow:0_1px_0_rgba(255,255,255,0.8)] sm:text-xl"
      >
        Identificación por correo
      </h2>
      <p
        id="identificacion-aviso"
        className="break-words text-xs leading-snug text-[#665b62] sm:text-[13px]"
      >
        Podés registrar tu correo (no se verifica su titularidad). Se eliminan los espacios externos y toda la dirección se convierte
        a minúsculas; puede ser incompatible con proveedores de correo electrónico que distinguen
        mayúsculas y minúsculas en la parte anterior a la @.
      </p>
     
    </div>
  );
}
