RTMBodyMotion 晃動預覽器 v1.0
RTMBodyMotion 動揺プレビューア / RTMBodyMotion Previewer
製作：C-TREC & 月島重工
==========================================================

一、這是什麼
------------
不用進遊戲，就能預覽 RTMBodyMotion.js 的車體晃動並調校參數。
預覽器直接執行 RTMBodyMotion.js 的原始碼（以 RTM 2.4.x／1.12.2 的介面模擬遊戲環境，載入順序與 20 tick/s
更新都和遊戲相同），所以看到的晃動就是遊戲內的結果；已與遊戲的腳本引擎 Nashorn 逐幀比對，數值一致。

ゲームに入らずにRTMBodyMotion.jsの車体動揺をプレビューし、パラメータを調整できます。モジュールの原コードを
そのまま実行するため、ゲーム内と同じ結果になります（Nashornと全フレーム照合済み）。

Preview and tune RTMBodyMotion.js body motion without launching the game. The previewer runs the module's
source as is in an emulated RTM 2.4.x (1.12.2) environment, so what you see matches the game (verified frame
by frame against Nashorn).


二、開啟方式
------------
Windows（RTMBodyMotionPreviewer-1.0.0-windows-x64.zip）
  解壓縮後執行 RTMBodyMotionPreviewer.exe。
  若出現 SmartScreen 提示（沒有商業程式碼簽章），按「其他資訊」→「仍要執行」。

macOS（Apple Silicon：…-mac-arm64.zip／Intel：…-mac-x64.zip）
  本程式沒有 Apple 開發者簽章，第一次開啟前需要做一次以下其中一種：
  A. 對「首次開啟_FirstRun.command」按右鍵 →「打開」→ 再按「打開」（之後直接雙擊 App 即可）。
  B. 或在「終端機」中切到解壓縮的資料夾，執行：
       xattr -cr RTMBodyMotionPreviewer.app
       codesign --force --deep --sign - RTMBodyMotionPreviewer.app
  ※ 本版在 Windows 上打包，未能在 Mac 實機測試；若無法開啟，請回報 macOS 版本與錯誤訊息。

Linux（…-linux-x64.tar.gz）
  解壓縮後執行 ./start.sh（或直接執行 rtm-body-motion-previewer）。
  若系統限制了非特權命名空間（例如 Ubuntu 23.10 以後），start.sh 會自動加上 --no-sandbox。
  ※ 同樣未能在 Linux 實機測試，有問題請回報發行版與錯誤訊息。


三、使用方式
------------
1. 情境：直線晃動（可在中途改 DataMap 倍率）、彎道／S 彎（半徑、超高、緩和曲線、車速）、道岔（直進或分歧側）、
   制動停車（B1～B7、EB）、乘客上下車。改任何數值都會立刻重新計算（通常不到 0.1 秒）。
2. 調校：列出模組全部參數與中日英說明，可以搜尋、只看已修改的項目。
   「從描畫腳本讀入 MOTION_TUNING」可讀入你車輛描畫腳本裡的調校值。
   調好之後按「匯出」，把產生的 MOTION_TUNING 貼回描畫腳本即可（可選只含修改項目或全部項目）。
3. 比較：按「保留為比較基準」後再修改參數，圖表會以灰色虛線顯示修改前的結果。
4. 車輛：可設定車輛數、trainDistance、轉向架位置；或讀入自己的車輛 JSON（會一併讀入車體模型、貼圖、轉向架、
   trainDistance、bogiePos 與描畫腳本的 MOTION_TUNING）。也可以只讀 MQO／OBJ 模型。
   「模型物件」可以隱藏不需要的物件（例如重疊的替換零件）。
5. 腳本：預設使用隨附的 RTMBodyMotion.js v1.0；若你改過模組，可以改用自己的檔案（需同時有 RTMBodyMotionAdapter.js）。
6. 視角：側面、後方（最後一節車）、正面（第一節車）、車內（乘客視角）、軌道旁、自由（拖曳旋轉）。
   「顯示放大」只放大畫面上的晃動，方便觀察；數值與圖表永遠是實際值。
7. 鍵盤：空白鍵＝播放／暫停，←／→＝逐格（1/60 秒），Home＝回到開頭。點圖表可以跳到該時間。


四、注意事項
------------
- 所有車輛使用同一個模型顯示（讀入的 JSON 那一節）；晃動則每節車各自計算。
- 預覽畫面不處理車門開關、燈光與描畫腳本中的其他動畫，只顯示車體與轉向架。
- 乘客情境中的乘客只用來產生載重，會穿過關著的車門，請以晃動與圖表為準。
- 模組會讀到的遊戲資訊（車速、級位、轉向架位置與超高、道岔、DataMap、乘客）由預覽器依情境產生。
  遊戲內的實際軌道若有不同的超高或曲線，晃動也會跟著不同。


五、從原始碼建置（給開發者）
----------------------------
需要 Node.js 18 以上；macOS／Linux 發行檔另需 Python 3。
  npm install
  npm start                 開發中直接執行
  npm run dist              打包 Windows 與 Linux（dist/）
  python package_dist.py    產生 Windows zip、Linux tar.gz 與 macOS zip（macOS 由官方 Electron 壓縮檔改寫而成）
test/compare_nashorn.mjs 可把同一份輸入的結果與 Nashorn 的輸出逐格比對。

使用元件：Electron（MIT）、three.js（MIT）。
