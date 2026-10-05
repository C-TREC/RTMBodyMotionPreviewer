# 產生發行壓縮檔（只用 Python 標準函式庫）：先執行 npm run dist 產生 Windows／Linux 資料夾，再執行本腳本。
#   Windows：zip（RTMBodyMotionPreviewer-win32-x64）
#   Linux  ：tar.gz（保留執行權限，附啟動腳本）
#   macOS  ：在 Windows 上無法建立 .app 需要的符號連結，因此直接改寫官方 Electron 的 macOS 壓縮檔：
#            加入 app.asar、改 App 名稱與圖示，原有的符號連結與權限照原樣保留（Intel 與 Apple Silicon 各一份）
import io
import os
import re
import sys
import glob
import stat
import tarfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")
NAME = "RTMBodyMotionPreviewer"
DISPLAY = "RTMBodyMotion Previewer"
BUNDLE_ID = "com.c-trec.rtmbodymotion.previewer"
pkg = open(os.path.join(HERE, "package.json"), encoding="utf-8").read()
VERSION = re.search(r'"version"\s*:\s*"([^"]+)"', pkg).group(1)
EVER = re.search(r'"electron"\s*:\s*"\^?([^"]+)"', pkg).group(1)
README = os.path.join(HERE, "README_預覽器說明.txt")
LICENSE = os.path.join(HERE, "ライセンス_License.txt")
TOOL_LICENSE = os.path.join(HERE, "LICENSE.txt")


def extras():
    return [(README, os.path.basename(README)), (TOOL_LICENSE, "LICENSE.txt"), (LICENSE, os.path.basename(LICENSE))]


def zip_dir(src, out, root):
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for d, _, files in os.walk(src):
            for f in files:
                p = os.path.join(d, f)
                z.write(p, os.path.join(root, os.path.relpath(p, src)))
        for p, arc in extras():
            z.write(p, os.path.join(root, arc))
    print("wrote", out)


LINUX_LAUNCHER = """#!/bin/sh
# 啟動 RTMBodyMotion 預覽器。部分發行版（如 Ubuntu 23.10 以後）限制了非特權使用者命名空間，
# Electron 的沙箱無法啟動，這時自動改用 --no-sandbox（本程式只顯示本機內容）。
cd "$(dirname "$0")"
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] || \\
   [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
  exec ./rtm-body-motion-previewer --no-sandbox "$@"
fi
exec ./rtm-body-motion-previewer "$@"
"""


def tar_linux(src, out, root):
    execs = {"rtm-body-motion-previewer", "chrome_crashpad_handler", "chrome-sandbox"}

    def add(tf, path, arc, mode):
        ti = tf.gettarinfo(path, arc)
        ti.mode = mode
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = "root"
        with open(path, "rb") as fh:
            tf.addfile(ti, fh)

    with tarfile.open(out, "w:gz", compresslevel=6) as tf:
        for d, dirs, files in os.walk(src):
            rel = os.path.relpath(d, src)
            ti = tarfile.TarInfo(os.path.normpath(os.path.join(root, rel)).replace("\\", "/"))
            ti.type = tarfile.DIRTYPE; ti.mode = 0o755
            tf.addfile(ti)
            for f in files:
                p = os.path.join(d, f)
                arc = os.path.join(root, os.path.relpath(p, src)).replace("\\", "/")
                add(tf, p, arc, 0o755 if (f in execs or f.endswith(".so") or ".so." in f) else 0o644)
        data = LINUX_LAUNCHER.encode("utf-8")
        ti = tarfile.TarInfo(root + "/start.sh"); ti.size = len(data); ti.mode = 0o755
        tf.addfile(ti, io.BytesIO(data))
        for p, arc in extras():
            add(tf, p, root + "/" + arc, 0o644)
    print("wrote", out)


MAC_FIRST_RUN = """#!/bin/sh
# macOS 第一次開啟前執行一次：移除下載隔離標記，並在本機重新簽署（ad-hoc），之後就能直接雙擊開啟。
cd "$(dirname "$0")"
xattr -cr "RTMBodyMotionPreviewer.app"
codesign --force --deep --sign - "RTMBodyMotionPreviewer.app"
open "RTMBodyMotionPreviewer.app"
"""


def mac_zip(arch, asar):
    cache = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~/.cache")), "electron", "Cache", "*",
                                   "electron-v%s-darwin-%s.zip" % (EVER, arch)))
    if not cache:
        print("skip darwin-%s: electron-v%s-darwin-%s.zip not in cache (run: npx @electron/get or node build.js once)" % (arch, EVER, arch))
        return
    out = os.path.join(DIST, "%s-%s-mac-%s.zip" % (NAME, VERSION, arch))
    asar_bytes = open(asar, "rb").read()
    icns = open(os.path.join(HERE, "build", "icon.icns"), "rb").read()
    root = "%s-mac-%s/" % (NAME, arch)
    with zipfile.ZipFile(cache[0]) as zi, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zo:
        for info in zi.infolist():
            n = info.filename
            if not n.startswith("Electron.app/"):
                if not n.endswith("/"):           # Electron 與 Chromium 的授權檔照原樣附上
                    ni = zipfile.ZipInfo(root + n, info.date_time); ni.external_attr = info.external_attr; ni.create_system = info.create_system
                    ni.compress_type = zipfile.ZIP_DEFLATED
                    zo.writestr(ni, zi.read(info))
                continue
            if n.endswith("Contents/Resources/default_app.asar"):
                continue
            data = zi.read(info)
            new = root + NAME + ".app/" + n[len("Electron.app/"):]
            if n == "Electron.app/Contents/Info.plist":
                s = data.decode("utf-8")
                s = re.sub(r"(<key>CFBundleDisplayName</key>\s*<string>)[^<]*", r"\g<1>" + DISPLAY, s)
                s = re.sub(r"(<key>CFBundleName</key>\s*<string>)[^<]*", r"\g<1>" + DISPLAY, s)
                s = re.sub(r"(<key>CFBundleIdentifier</key>\s*<string>)[^<]*", r"\g<1>" + BUNDLE_ID, s)
                s = re.sub(r"(<key>CFBundleShortVersionString</key>\s*<string>)[^<]*", r"\g<1>" + VERSION, s)
                s = re.sub(r"(<key>CFBundleVersion</key>\s*<string>)[^<]*", r"\g<1>" + VERSION, s)
                data = s.encode("utf-8")
            elif n == "Electron.app/Contents/Resources/electron.icns":
                data = icns
            ni = zipfile.ZipInfo(new, info.date_time)
            ni.external_attr = info.external_attr          # 保留權限與符號連結旗標
            ni.create_system = info.create_system
            ni.compress_type = zipfile.ZIP_STORED if stat.S_ISLNK(info.external_attr >> 16) else zipfile.ZIP_DEFLATED
            zo.writestr(ni, data)
        def add_file(arc, data, mode=0o644):
            ni = zipfile.ZipInfo(arc, (2026, 10, 5, 0, 0, 0)); ni.create_system = 3
            ni.external_attr = (stat.S_IFREG | mode) << 16; ni.compress_type = zipfile.ZIP_DEFLATED
            zo.writestr(ni, data)
        add_file(root + NAME + ".app/Contents/Resources/app.asar", asar_bytes)
        add_file(root + "首次開啟_FirstRun.command", MAC_FIRST_RUN.encode("utf-8"), 0o755)
        for p, arc in extras():
            add_file(root + arc, open(p, "rb").read())
    print("wrote", out)


if __name__ == "__main__":
    what = sys.argv[1:] or ["win", "linux", "mac"]
    win = os.path.join(DIST, NAME + "-win32-x64")
    lin = os.path.join(DIST, NAME + "-linux-x64")
    if "win" in what and os.path.isdir(win):
        zip_dir(win, os.path.join(DIST, "%s-%s-windows-x64.zip" % (NAME, VERSION)), NAME + "-windows-x64")
    if "linux" in what and os.path.isdir(lin):
        tar_linux(lin, os.path.join(DIST, "%s-%s-linux-x64.tar.gz" % (NAME, VERSION)), NAME + "-linux-x64")
    if "mac" in what:
        asar = os.path.join(win if os.path.isdir(win) else lin, "resources", "app.asar")
        for arch in ("arm64", "x64"):
            mac_zip(arch, asar)
