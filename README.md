# RTMBodyMotion Previewer v1.0

![Windows](https://img.shields.io/badge/Windows-x64-0078d4) ![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon%20%2F%20Intel-555555) ![Linux](https://img.shields.io/badge/Linux-x64-e0712b) ![RTMBodyMotion](https://img.shields.io/badge/RTMBodyMotion-v1.0-007ec6)<br>
![Minecraft](https://img.shields.io/badge/Minecraft-1.12.2-44cc11) ![Forge](https://img.shields.io/badge/Forge-1.12.2--14.23.5.2855-e0712b) ![RealTrainMod](https://img.shields.io/badge/RealTrainMod-2.4.24-007ec6)<br>
![Minecraft](https://img.shields.io/badge/Minecraft-1.7.10-44cc11) ![Forge](https://img.shields.io/badge/Forge-1.7.10-e0712b) ![RealTrainMod](https://img.shields.io/badge/RealTrainMod-KaizPatchX-007ec6)<br>
![Minecraft](https://img.shields.io/badge/Minecraft-1.21.1-44cc11) ![Loader](https://img.shields.io/badge/NeoForge%20%2F%20Fabric-1.21.1-e0712b) ![RTMU](https://img.shields.io/badge/RTMU-1.0.19-007ec6)

RTMBodyMotion 晃動預覽器 / 動揺プレビューア / Body-motion previewer

製作 / 制作 / Made by：**C-TREC & 月島重工**

[中文](#中文) · [日本語](#日本語) · [English](#english)

---

## 中文

不用進遊戲，就能預覽 [RTMBodyMotion](https://github.com/C-TREC/RTMBodyMotion) 的車體晃動並調校參數。預覽器直接執行原封不動的 `RTMBodyMotion.js`，以 RTM 2.4.24（Minecraft 1.12.2）的介面模擬遊戲環境，載入順序與 20 tick/s 更新都和遊戲相同。

- 情境：直線（DataMap 倍率）、彎道／S 彎、道岔（直進／分歧）、制動停車（B1～EB）、乘客上下車
- 調校：模組全部參數與中日英說明；可讀入描畫腳本的 `MOTION_TUNING`，調好後匯出貼回
- 比較基準、讀入自己的車輛 JSON／MQO／OBJ、多種視角、三語介面
- 支援 Windows x64、macOS（Apple Silicon／Intel）、Linux x64

使用說明見 [`README_預覽器說明.txt`](README_預覽器說明.txt)。

### 建置

需要 Node.js 18 以上；產生 macOS／Linux 發行檔另需 Python 3。

```
npm install
npm start                 # 直接執行
npm run dist              # 打包 Windows 與 Linux（dist/）
python package_dist.py    # 產生 Windows zip、Linux tar.gz、macOS zip
node test/compare_nashorn.mjs <cache> <name>   # 與 Nashorn 的輸出逐格比對
```

### 授權

可自由使用、修改與再發布；再發布時請標明原作 C-TREC & 月島重工。隨附的晃動模組依其自身條款。全文見 [`LICENSE.txt`](LICENSE.txt)。

---

## 日本語

ゲームを起動せずに、[RTMBodyMotion](https://github.com/C-TREC/RTMBodyMotion) の車体動揺をプレビューしてパラメータを調整できます。`RTMBodyMotion.js` の原コードをそのまま実行し、RTM 2.4.24（Minecraft 1.12.2）のインターフェースでゲーム環境を再現します。読込順と20 tick/sの更新もゲームと同じです。

- シナリオ：直線（DataMap倍率）、曲線／S字、分岐器（直進／分岐）、制動・停車（B1～EB）、乗客の乗降
- 調整：モジュールの全パラメータと中日英の説明。描画スクリプトの `MOTION_TUNING` を読み込み、調整後に書き出して貼り戻せます
- 比較基準、自作車両のJSON／MQO／OBJ読込、複数の視点、3言語UI
- Windows x64、macOS（Apple Silicon／Intel）、Linux x64 対応

使い方は [`README_預覽器說明.txt`](README_預覽器說明.txt) を参照してください。

### ビルド

Node.js 18以上が必要です。macOS／Linux用の配布ファイルを作るにはPython 3も必要です。

```
npm install
npm start                 # 直接実行
npm run dist              # Windows と Linux をパッケージ化（dist/）
python package_dist.py    # Windows zip、Linux tar.gz、macOS zip を生成
node test/compare_nashorn.mjs <cache> <name>   # Nashornの出力と全フレーム照合
```

### ライセンス

自由に使用・改変・再配布できます。再配布時は原作 C-TREC & 月島重工 を明記してください。同梱の動揺モジュールはそれ自身の条件に従います。全文は [`LICENSE.txt`](LICENSE.txt) を参照してください。

---

## English

Preview and tune [RTMBodyMotion](https://github.com/C-TREC/RTMBodyMotion) body motion without launching the game. The previewer runs the `RTMBodyMotion.js` source as is in an emulated RTM 2.4.24 (Minecraft 1.12.2) environment, with the same load order and 20 tick/s update as the game.

- Scenarios: straight track (DataMap scale), curve / S-curve, turnout (straight / diverging), braking and stop (B1 to EB), passengers boarding and alighting
- Tuning: every module parameter with Chinese / Japanese / English descriptions; load `MOTION_TUNING` from a render script and export it back when done
- Reference comparison, load your own vehicle JSON / MQO / OBJ, multiple camera views, trilingual UI
- Windows x64, macOS (Apple Silicon / Intel), Linux x64

See [`README_預覽器說明.txt`](README_預覽器說明.txt) for usage.

### Building

Requires Node.js 18 or later; Python 3 is also needed to produce the macOS / Linux release archives.

```
npm install
npm start                 # run directly
npm run dist              # package Windows and Linux (dist/)
python package_dist.py    # produce the Windows zip, Linux tar.gz and macOS zips
node test/compare_nashorn.mjs <cache> <name>   # compare frame by frame with Nashorn output
```

### License

Free to use, modify and redistribute; credit "Original by C-TREC & 月島重工" when redistributing. The bundled body-motion module follows its own terms. See [`LICENSE.txt`](LICENSE.txt) for the full text.
