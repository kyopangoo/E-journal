export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const wrap = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function requireText(value, field, maxLength = 255) {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError(400, `${field} is required`);
  if (text.length > maxLength) {
    throw new HttpError(400, `${field} must be at most ${maxLength} characters`);
  }
  return text;
}
