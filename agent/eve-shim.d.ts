declare module "eve" {
  // Minimal type shim for the Eve agent config used in Stage 1.
  // The real runtime contract is enforced by the smoke test.
  export function defineAgent<T>(definition: T): T;
}

declare module "eve/tools" {
  // Shim mínimo para tools de Eve mientras el proyecto usa
  // moduleResolution "node". Los exports de Eve requieren un resolver
  // más nuevo; tests y documentación de Eve cubren el contrato runtime.
  export function defineTool<TDefinition extends object>(definition: TDefinition): TDefinition;
}

declare module "eve/channels/chat-sdk" {
  // Shim mínimo para el canal Chat SDK de Eve (Stage 5). El contrato
  // runtime real lo valida Eve al montar el canal; el shim sólo da tipos
  // para que `tsc` compile bajo moduleResolution "node".
  export interface ChatSdkChannelConfig<TAdapters = Record<string, unknown>> {
    userName: string;
    adapters: TAdapters;
    state: unknown;
    streaming?: boolean;
  }
  export interface ChatSdkChannelBridge {
    bot: { onNewMention(handler: unknown): void; onSubscribedMessage(handler: unknown): void };
    channel: unknown;
    send(input: unknown, options: unknown): Promise<unknown>;
  }
  export function chatSdkChannel<TAdapters = Record<string, unknown>>(
    config: ChatSdkChannelConfig<TAdapters>
  ): ChatSdkChannelBridge;
}

declare module "@chat-adapter/whatsapp" {
  // Shim mínimo del adaptador WhatsApp (Stage 5). Credenciales por env vars.
  export interface WhatsAppAdapterConfig {
    accessToken?: string;
    phoneNumberId?: string;
    verifyToken?: string;
    appSecret?: string;
    apiUrl?: string;
    apiVersion?: string;
    userName?: string;
  }
  export function createWhatsAppAdapter(config?: WhatsAppAdapterConfig): unknown;
}

declare module "@chat-adapter/state-memory" {
  // Shim mínimo del state adapter en memoria (Stage 5).
  export function createMemoryState(options?: Record<string, unknown>): unknown;
}

declare module "chat" {
  // Shim mínimo del paquete `chat` para tipar Message/Thread (Stage 5).
  export interface Message {
    text: string;
  }
  export interface Thread {
    subscribe(): Promise<void>;
  }
}
