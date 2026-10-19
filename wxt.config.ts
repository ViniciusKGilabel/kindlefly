import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Pasta visível no Finder, para carregar sem compactação em chrome://extensions.
  outDir: 'output',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Chave pública fixa: mantém o ID da extensão estável (privada em keys/, fora do git).
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwy5WEGy/9PoSUR/T7ygHb2J+JfgjykLHU9RNzyufbiaYrxx+SEwxO05WywUokCXZAKAozghs5FAHc4nH1+DRNRgISottB6InouOSFRE4LUCm71PHBGHCKQ//toBIRykEu5kmxBPPKIvM+75ogiCkLeMAIXy73c3fqJ4FxURioKfVTnAjt4GUAHVUf2Cd4MtaGIKW2KMPNzyYTgWQggmEuqlMqfn6a+Gt9HkyZoC8JIi33yZQpbJKUqDUWnjvT3ibeDJH1vcDEKhRuYnrFuYo0o9ilLhbuHV4JooMFQcBUZUsVaUHqTCtOEhOYBzYuH+xAEnwCNYv9cKjS27W/FIG8QIDAQAB',
    permissions: ['sidePanel', 'storage', 'identity', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    // Sem `action` o Chrome não dispara cliques na barra e o painel não abriria.
    action: {
      default_title: '__MSG_extName__',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    },
    side_panel: { default_path: 'sidepanel.html' },
  },
});
