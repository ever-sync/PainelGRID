export function MissingClientScope() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-zinc-500">
      <p className="font-medium text-zinc-700">Empresa nao vinculada</p>
      <p>
        Seu usuario precisa estar associado a um cliente para acessar esta area.
      </p>
    </div>
  );
}
