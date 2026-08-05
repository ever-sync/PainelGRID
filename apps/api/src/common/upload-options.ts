import { BadRequestException } from "@nestjs/common";

type UploadFile = { originalname: string; mimetype: string };
type UploadCallback = (error: Error | null, acceptFile: boolean) => void;

const spreadsheetExtensions = /\.(csv|xlsx)$/i;
const spreadsheetMimeTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export const spreadsheetUploadOptions = {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    parts: 12,
    fieldNameSize: 100,
    fieldSize: 64 * 1024,
  },
  fileFilter: (
    _request: unknown,
    file: UploadFile,
    callback: UploadCallback,
  ) => {
    const allowed =
      spreadsheetExtensions.test(file.originalname) &&
      spreadsheetMimeTypes.has(file.mimetype.toLowerCase());
    callback(
      allowed
        ? null
        : new BadRequestException("Envie somente arquivo CSV ou XLSX."),
      allowed,
    );
  },
};

export const avatarUploadOptions = {
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
    parts: 2,
    fieldNameSize: 100,
    fieldSize: 1024,
  },
  fileFilter: (
    _request: unknown,
    file: UploadFile,
    callback: UploadCallback,
  ) => {
    const allowed = file.mimetype.toLowerCase().startsWith("image/");
    callback(
      allowed
        ? null
        : new BadRequestException("Envie somente um arquivo de imagem."),
      allowed,
    );
  },
};

export const chatMediaUploadOptions = {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 4,
    fieldNameSize: 100,
    fieldSize: 16 * 1024,
  },
  fileFilter: (
    _request: unknown,
    file: UploadFile,
    callback: UploadCallback,
  ) => {
    const mime = file.mimetype.toLowerCase();
    const allowed =
      mime.startsWith("image/") ||
      mime.startsWith("audio/") ||
      mime.startsWith("video/") ||
      mime === "application/pdf";
    callback(
      allowed
        ? null
        : new BadRequestException(
            "Tipo de mídia não permitido. Envie imagem, áudio, vídeo ou PDF.",
          ),
      allowed,
    );
  },
};
