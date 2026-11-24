import { Request, Response, NextFunction } from 'express';
import { ApiKeyConfig, lookupApiKey } from './keyCache';

export interface AuthenticatedRequest extends Request {
  apiKeyConfig?: ApiKeyConfig;
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: '2.0',
    error: { code: -32600, message },
    id: null,
  });
}

export async function apiKeyAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.params.apiKey;
  if (!apiKey) {
    jsonRpcError(res, 401, 'Missing API key');
    return;
  }

  const apiKeyConfig = await lookupApiKey(apiKey);
  if (!apiKeyConfig || apiKeyConfig.status !== 'active') {
    jsonRpcError(res, 401, 'Invalid or revoked API key');
    return;
  }

  req.apiKeyConfig = apiKeyConfig;
  next();
}
