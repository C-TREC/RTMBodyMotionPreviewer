// 打包：Windows x64／macOS（Intel、Apple Silicon）／Linux x64
// 用法：npm run dist（輸出到 dist/）
const { packager } = require("@electron/packager");
const path = require("node:path");

const targets = (process.argv[2] || "win32-x64,darwin-x64,darwin-arm64,linux-x64").split(",");

(async () => {
  for (const tgt of targets) {
    const [platform, arch] = tgt.split("-");
    const out = await packager({
      dir: __dirname,
      out: path.join(__dirname, "dist"),
      name: "RTMBodyMotionPreviewer",
      executableName: platform === "linux" ? "rtm-body-motion-previewer" : "RTMBodyMotionPreviewer",
      platform, arch,
      overwrite: true,
      asar: true,
      icon: path.join(__dirname, "build", "icon"),
      appBundleId: "com.c-trec.rtmbodymotion.previewer",
      appCategoryType: "public.app-category.utilities",
      appCopyright: "C-TREC & 月島重工",
      win32metadata: { CompanyName: "C-TREC & 月島重工", FileDescription: "RTMBodyMotion Previewer", ProductName: "RTMBodyMotion Previewer" },
      ignore: [/^\/test($|\/)/, /^\/dist($|\/)/, /^\/build\.js$/, /^\/package_dist\.py$/, /^\/README_.*\.txt$/, /^\/build\/icon\.(ico|icns)$/, /\.md$/],
    });
    console.log("built", out.join(", "));
  }
})().catch((e) => { console.error(e); process.exit(1); });
