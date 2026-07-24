import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNativePlatform } from "./platform";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Falha ao ler arquivo"));
        return;
      }
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(blob);
  });
}

function downloadBlobInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Um link `<a download>` nao dispara UI de salvar dentro da WebView nativa do Capacitor.
 * No app, grava o arquivo no cache e abre o menu nativo de compartilhar/salvar do SO;
 * no browser mantem o download tradicional via link.
 */
export async function saveOrShareBlob(
  blob: Blob,
  filename: string,
): Promise<void> {
  if (!isNativePlatform()) {
    downloadBlobInBrowser(blob, filename);
    return;
  }

  const base64 = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({ url: uri, title: filename });
}
