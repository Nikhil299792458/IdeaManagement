(function initializeNativeShellBridge() {
  const capacitor = typeof window !== "undefined" ? window.Capacitor : null;
  const hasCapacitor = Boolean(capacitor && typeof capacitor.registerPlugin === "function");
  const isNativeApp = Boolean(
    hasCapacitor &&
    typeof capacitor.isNativePlatform === "function" &&
    capacitor.isNativePlatform()
  );

  const pluginCache = {};

  function getPlugin(name) {
    if (!isNativeApp) {
      return null;
    }

    if (!pluginCache[name]) {
      pluginCache[name] = capacitor.registerPlugin(name);
    }

    return pluginCache[name];
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";

    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });

    return window.btoa(binary);
  }

  window.nativeShell = {
    isNativeApp,
    platform: hasCapacitor && typeof capacitor.getPlatform === "function" ? capacitor.getPlatform() : "web",

    async exportJson(filename, payload) {
      if (!isNativeApp) {
        return { handled: false };
      }

      try {
        const Filesystem = getPlugin("Filesystem");
        const Share = getPlugin("Share");

        if (!Filesystem || !Share) {
          return {
            handled: false,
            message: "Capacitor export plugins are not available in this build."
          };
        }

        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: encodeBase64(JSON.stringify(payload, null, 2)),
          directory: "Cache",
          recursive: true
        });

        await Share.share({
          title: "Idea Execution Console backup",
          text: "Save or send your Idea Execution Console JSON backup.",
          url: writeResult.uri,
          dialogTitle: "Export backup JSON"
        });

        return {
          handled: true,
          uri: writeResult.uri
        };
      } catch (error) {
        return {
          handled: false,
          message: error?.message || String(error)
        };
      }
    },

    async addBackButtonHandler(handler) {
      if (!isNativeApp) {
        return false;
      }

      const App = getPlugin("App");
      if (!App || typeof App.addListener !== "function") {
        return false;
      }

      await App.addListener("backButton", async (event) => {
        await handler(event, {
          exitApp: async () => {
            if (typeof App.exitApp === "function") {
              await App.exitApp();
            }
          }
        });
      });

      return true;
    }
  };
})();
