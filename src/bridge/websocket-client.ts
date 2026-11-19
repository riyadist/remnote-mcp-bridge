/**
 * WebSocket Client with automatic reconnection
 * Connects to the MCP server and handles message routing
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type BridgeRequestId = string | number | null;

export interface BridgeRequest {
  id: BridgeRequestId;
  action: string;
  payload: Record<string, unknown>;
}

export interface BridgeResponse {
  id: BridgeRequestId;
  result?: unknown;
  error?: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: BridgeRequestId;
  method: string;
  params?: unknown;
}

interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: BridgeRequestId;
  result: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: BridgeRequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface WebSocketClientConfig {
  url: string;
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  onStatusChange?: (status: ConnectionStatus) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandler: ((request: BridgeRequest) => Promise<unknown>) | null = null;
  private status: ConnectionStatus = 'disconnected';
  private isShuttingDown = false;

  private config: Required<Omit<WebSocketClientConfig, 'onStatusChange' | 'onLog'>> & {
    onStatusChange?: (status: ConnectionStatus) => void;
    onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
  };

  constructor(config: WebSocketClientConfig) {
    this.config = {
      url: config.url,
      maxReconnectAttempts: config.maxReconnectAttempts ?? Number.POSITIVE_INFINITY,
      initialReconnectDelay: config.initialReconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      onStatusChange: config.onStatusChange,
      onLog: config.onLog
    };
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    this.config.onLog?.(message, level);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.config.onStatusChange?.(status);
    }
  }

  connect(): void {
    this.clearReconnectTimeout();
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isShuttingDown = false;
    this.setStatus('connecting');
    // Never log the pairing key carried in the query string.
    this.log(`Connecting to ${this.config.url.replace(/([?&]key=)[^&]*/i, '$1***')}...`);

    try {
      const socket = new WebSocket(this.config.url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket || this.isShuttingDown) return;
        this.log('Connected to MCP server');
        this.reconnectAttempts = 0;
        this.setStatus('connected');
      };

      socket.onmessage = async (event) => {
        if (this.ws !== socket || this.isShuttingDown) return;
        await this.handleMessage(event.data, socket);
      };

      socket.onclose = (event) => {
        if (this.ws !== socket || this.isShuttingDown) return;
        this.log(`Disconnected: ${event.code} ${event.reason}`, 'warn');
        this.setStatus('disconnected');

        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      };

      socket.onerror = (error) => {
        if (this.ws !== socket || this.isShuttingDown) return;
        this.log(`WebSocket error: ${error}`, 'error');
      };
    } catch (error) {
      this.log(`Connection failed: ${error}`, 'error');
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private sendResponse(socket: WebSocket, response: unknown): void {
    // A completed mutation must never be replayed or answered on a new session.
    if (this.ws !== socket || this.isShuttingDown || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify(response));
    } catch (error) {
      this.log(`Failed to send response: ${error}`, 'error');
    }
  }

  private async handleMessage(data: string, socket: WebSocket): Promise<void> {
    try {
      const message = JSON.parse(data) as unknown;

      // Handle ping/pong heartbeat
      if (this.isRecord(message) && message.type === 'ping') {
        this.sendResponse(socket, { type: 'pong' });
        return;
      }

      if (!this.messageHandler) {
        this.log('Message received but no handler is registered; ignoring', 'warn');
        return;
      }

      const normalized = this.normalizeIncomingRequest(message, socket);
      if (!normalized) {
        this.log('Ignoring unsupported message format', 'warn');
        return;
      }

      const { request, respond } = normalized;
      this.log(`Received: ${request.action}`);

      try {
        const result = await this.messageHandler(request);
        respond?.({ ok: true, result });
        this.log(`Completed: ${request.action}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        respond?.({ ok: false, error: errorMessage });
        this.log(`Failed: ${request.action} - ${errorMessage}`, 'error');
      }
    } catch (error) {
      this.log(`Failed to process message: ${error}`, 'error');
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private asPayload(value: unknown): Record<string, unknown> {
    return this.isRecord(value) ? value : {};
  }

  private normalizeIncomingRequest(message: unknown, socket: WebSocket): null | {
    request: BridgeRequest;
    respond?: (outcome: { ok: true; result: unknown } | { ok: false; error: string }) => void;
  } {
    if (!this.isRecord(message)) {
      return null;
    }

    // Custom bridge format: { id?, action, payload? }
    if (typeof message.action === 'string') {
      const request: BridgeRequest = {
        id: (message.id as BridgeRequestId) ?? null,
        action: message.action,
        payload: this.asPayload(message.payload)
      };

      const hasId = 'id' in message;
      const respond = hasId
        ? (outcome: { ok: true; result: unknown } | { ok: false; error: string }) => {
            const response: BridgeResponse = {
              id: request.id,
              ...(outcome.ok ? { result: outcome.result } : { error: outcome.error })
            };
            this.sendResponse(socket, response);
          }
        : undefined;

      return { request, respond };
    }

    // JSON-RPC 2.0 request: { jsonrpc:"2.0", id?, method, params? }
    if (message.jsonrpc === '2.0' && typeof message.method === 'string') {
      const rpcId = ('id' in message ? (message.id as BridgeRequestId) : undefined) ?? null;
      const request: BridgeRequest = {
        id: rpcId,
        action: message.method,
        payload: this.asPayload(message.params)
      };

      const hasId = 'id' in message;
      const respond = hasId
        ? (outcome: { ok: true; result: unknown } | { ok: false; error: string }) => {
            if (outcome.ok) {
              const response: JsonRpcSuccessResponse = {
                jsonrpc: '2.0',
                id: request.id,
                result: outcome.result
              };
              this.sendResponse(socket, response);
            } else {
              const response: JsonRpcErrorResponse = {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                  code: -32000,
                  message: outcome.error
                }
              };
              this.sendResponse(socket, response);
            }
          }
        : undefined;

      return { request, respond };
    }

    return null;
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimeout !== null) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.log('Max reconnection attempts reached', 'error');
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(
      this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.config.maxReconnectDelay
    );
    const jitter = Math.random() * 0.3 * baseDelay;
    const delay = baseDelay + jitter;

    this.reconnectAttempts++;
    this.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  setMessageHandler(handler: (request: BridgeRequest) => Promise<unknown>): void {
    this.messageHandler = handler;
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  disconnect(): void {
    this.isShuttingDown = true;

    this.clearReconnectTimeout();

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.close(1000, 'Client disconnect');
    }

    this.setStatus('disconnected');
  }

  reconnect(): void {
    this.reconnectAttempts = 0;
    this.disconnect();
    this.connect();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}
