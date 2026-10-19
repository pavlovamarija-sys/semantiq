export function isConvertedDocxAvailable(input: {
  documentType: string | null | undefined;
  transformationStatus: string | null | undefined;
  storageObjectExists: boolean;
}) {
  return input.documentType?.toLowerCase() === "docx"
    && input.transformationStatus === "ready"
    && input.storageObjectExists;
}
