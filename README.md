# RTMBodyMotion 晃動預覽器

製作：**C-TREC & 月島重工**

不用進遊戲，就能預覽 [RTMBodyMotion](https://github.com/C-TREC/RTMBodyMotion) 的車體晃動並調校參數。預覽器直接執行原封不動的 `RTMBodyMotion.js`（模擬 RTM 2.4.x／1.12.2 的介面），已與遊戲的腳本引擎 Nashorn 逐格比對，結果一致。

- 情境：直線（DataMap 倍率）、彎道／S 彎、道岔、制動停車、乘客上下車
- 調校：模組全部參數與中日英說明；可讀入描畫腳本的 `MOTION_TUNING`，調好後匯出貼回
- 比較基準、讀入自己的車輛 JSON／MQO／OBJ、多種視角、三語介面
- Windows／macOS（Apple Silicon、Intel）／Linux

使用說明見 [`README_預覽器說明.txt`](README_預覽器說明.txt)。

## 建置

需要 Node.js 18 以上；產生 macOS／Linux 發行檔另需 Python 3。

```
npm install
npm start                 # 直接執行
npm run dist              # 打包 Windows 與 Linux（dist/）
python package_dist.py    # 產生 Windows zip、Linux tar.gz、macOS zip
node test/compare_nashorn.mjs <cache> <name>   # 與 Nashorn 的輸出逐格比對
```

## 授權

可自由使用、修改與再發布；再發布時請標明原作 C-TREC & 月島重工。隨附的晃動模組依其自身條款。全文見 [`LICENSE.txt`](LICENSE.txt)。
