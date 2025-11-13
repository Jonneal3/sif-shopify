declare module '@shopify/app-bridge-utils' {
  export function getSessionToken(app: any): Promise<string>;
}

declare module '@shopify/app-bridge/utilities' {
  export function getSessionToken(app: any): Promise<string>;
}

declare module '@shopify/app-bridge' {
  const createApp: (config: { apiKey: string; host: string; forceRedirect?: boolean }) => any;
  export default createApp;
}


