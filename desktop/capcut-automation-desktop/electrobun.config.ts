import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "CapCut Automation",
    identifier: "com.local.capcutautomation",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.ts",
      },
    },
    copy: {
  "src/mainview/index.html": "views/mainview/index.html",
  "src/mainview/index.css": "views/mainview/index.css",
  "assets/icon.png": "views/mainview/icon.png"
},
    mac: {
      bundleCEF: false,
      icons: "icon.iconset",
    },
    win: {
      bundleCEF: false,
      icon: "assets/icon.ico",
    },
    linux: {
      bundleCEF: false,
      icon: "assets/icon.png",
    },
  },
} satisfies ElectrobunConfig;
