export class FetchError extends Error {
  constructor(
    public res: Response,
    message?: string,
    public partialData?: any
  ) {
    super(message);
  }
}
