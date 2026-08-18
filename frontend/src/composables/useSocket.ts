import { io, type Socket } from 'socket.io-client';
import { onUnmounted, ref, type Ref } from 'vue';

import type { LiveSentiment, Quote } from '../types';

// Empty means same-origin — see the note in api/client.ts.
const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

/**
 * Single shared socket for the whole app.
 *
 * Every panel wants the same stream; opening one connection per component
 * would multiply the server's fan-out for no benefit.
 */
let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    const options = {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
    };
    // io() without a URL connects to the page's own origin; io('') does not.
    socket = WS_URL ? io(WS_URL, options) : io(options);
  }
  return socket;
}

export interface UseSocket {
  connected: Ref<boolean>;
  /** Watch a symbol; returns a function that stops watching it. */
  subscribeSymbol: (symbol: string) => () => void;
  onQuote: (handler: (quote: Quote) => void) => void;
  onSentiment: (handler: (payload: LiveSentiment) => void) => void;
}

export function useSocket(): UseSocket {
  const client = getSocket();
  const connected = ref(client.connected);

  const markConnected = () => (connected.value = true);
  const markDisconnected = () => (connected.value = false);

  client.on('connect', markConnected);
  client.on('disconnect', markDisconnected);

  // Handlers registered by this component, torn down on unmount so a
  // remounted panel does not accumulate duplicate listeners. The signature
  // has to match socket.io's own listener type for off() to accept it back.
  type SocketListener = (...args: any[]) => void;
  const owned: Array<[string, SocketListener]> = [];

  const register = <T>(event: string, handler: (payload: T) => void): void => {
    const listener = handler as SocketListener;
    client.on(event, listener);
    owned.push([event, listener]);
  };

  onUnmounted(() => {
    client.off('connect', markConnected);
    client.off('disconnect', markDisconnected);
    for (const [event, handler] of owned) client.off(event, handler);
  });

  return {
    connected,
    subscribeSymbol(symbol: string) {
      client.emit('subscribe', { symbol });
      return () => client.emit('unsubscribe', { symbol });
    },
    onQuote: (handler) => register<Quote>('ticker', handler),
    onSentiment: (handler) => register<LiveSentiment>('sentiment:all', handler),
  };
}
